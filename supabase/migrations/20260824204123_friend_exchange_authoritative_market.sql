create or replace function friend_exchange.execute_paper_order(
  p_portfolio_id uuid,
  p_symbol text,
  p_side friend_exchange.order_side,
  p_notional numeric default null,
  p_quantity numeric default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  portfolio_row friend_exchange.portfolios;
  position_row friend_exchange.positions;
  order_row friend_exchange.paper_orders;
  trade_row friend_exchange.paper_trades;
  quote_price numeric(18,6);
  fill_quantity numeric(24,6);
  gross numeric(18,2);
  realized numeric(18,2) := 0;
  remaining numeric(24,6);
  new_average numeric(18,6);
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) < 8 then
    raise exception 'Valid idempotency key required';
  end if;

  select * into portfolio_row
  from friend_exchange.portfolios
  where id = p_portfolio_id
  for update;

  if portfolio_row.id is null or portfolio_row.owner_id <> auth.uid() then
    raise exception 'Portfolio not found';
  end if;

  select * into order_row
  from friend_exchange.paper_orders
  where portfolio_id = p_portfolio_id
    and idempotency_key = p_idempotency_key;

  if order_row.id is not null then
    select * into trade_row
    from friend_exchange.paper_trades
    where order_id = order_row.id;
    return jsonb_build_object(
      'order', to_jsonb(order_row),
      'trade', to_jsonb(trade_row),
      'duplicate', true
    );
  end if;

  if portfolio_row.scope <> 'friend' then
    raise exception 'Only Friend Market portfolios are enabled online in the free build';
  end if;

  if not exists (
    select 1 from friend_exchange.rounds
    where session_id = portfolio_row.session_id and status = 'trading'
  ) then
    raise exception 'Friend Market trading is locked';
  end if;

  select price into quote_price
  from friend_exchange.friend_assets
  where session_id = portfolio_row.session_id
    and symbol = upper(trim(p_symbol));

  if quote_price is null or quote_price <= 0 then raise exception 'No valid quote'; end if;

  fill_quantity := round(coalesce(p_quantity, p_notional / quote_price), 6);
  if fill_quantity is null or fill_quantity <= 0 then
    raise exception 'Quantity must be positive';
  end if;
  gross := round(fill_quantity * quote_price, 2);

  insert into friend_exchange.paper_orders (
    portfolio_id, symbol, side, requested_notional,
    requested_quantity, status, idempotency_key
  )
  values (
    p_portfolio_id,
    upper(trim(p_symbol)),
    p_side,
    p_notional,
    p_quantity,
    'pending',
    p_idempotency_key
  )
  returning * into order_row;

  select * into position_row
  from friend_exchange.positions
  where portfolio_id = p_portfolio_id
    and symbol = upper(trim(p_symbol))
  for update;

  if p_side = 'buy' then
    if portfolio_row.cash < gross then
      raise exception 'Insufficient fictional cash';
    end if;

    new_average := case
      when position_row.portfolio_id is null then quote_price
      else (
        (position_row.quantity * position_row.average_cost) + gross
      ) / (position_row.quantity + fill_quantity)
    end;

    insert into friend_exchange.positions (
      portfolio_id, symbol, quantity, average_cost
    )
    values (
      p_portfolio_id,
      upper(trim(p_symbol)),
      fill_quantity,
      new_average
    )
    on conflict (portfolio_id, symbol) do update
    set quantity = friend_exchange.positions.quantity + excluded.quantity,
        average_cost = new_average,
        updated_at = now();

    update friend_exchange.portfolios
    set cash = cash - gross,
        version = version + 1,
        updated_at = now()
    where id = p_portfolio_id
    returning * into portfolio_row;
  else
    if position_row.portfolio_id is null
       or position_row.quantity < fill_quantity then
      raise exception 'Insufficient shares';
    end if;

    realized := round(fill_quantity * (quote_price - position_row.average_cost), 2);
    remaining := round(position_row.quantity - fill_quantity, 6);

    if remaining <= 0 then
      delete from friend_exchange.positions
      where portfolio_id = p_portfolio_id
        and symbol = upper(trim(p_symbol));
    else
      update friend_exchange.positions
      set quantity = remaining, updated_at = now()
      where portfolio_id = p_portfolio_id
        and symbol = upper(trim(p_symbol));
    end if;

    update friend_exchange.portfolios
    set cash = cash + gross,
        realized_pnl = realized_pnl + realized,
        version = version + 1,
        updated_at = now()
    where id = p_portfolio_id
    returning * into portfolio_row;
  end if;

  update friend_exchange.paper_orders
  set status = 'filled'
  where id = order_row.id
  returning * into order_row;

  insert into friend_exchange.paper_trades (
    order_id, portfolio_id, symbol, side, quantity,
    fill_price, gross, realized_pnl
  )
  values (
    order_row.id,
    p_portfolio_id,
    upper(trim(p_symbol)),
    p_side,
    fill_quantity,
    quote_price,
    gross,
    realized
  )
  returning * into trade_row;

  return jsonb_build_object(
    'order', to_jsonb(order_row),
    'trade', to_jsonb(trade_row),
    'portfolio', to_jsonb(portfolio_row),
    'duplicate', false
  );
end;
$$;

create or replace function friend_exchange.apply_round_settlement(
  p_round_id uuid,
  p_results jsonb,
  p_moves jsonb,
  p_algorithm_version text,
  p_rating_updates jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  target_round friend_exchange.rounds;
  target_session friend_exchange.sessions;
  result_item jsonb;
  move_item jsonb;
  rating_item jsonb;
  asset friend_exchange.friend_assets;
  updated_price numeric(16,4);
  active_count integer;
begin
  select * into target_round
  from friend_exchange.rounds
  where id = p_round_id
  for update;

  if target_round.id is null then raise exception 'Round not found'; end if;
  if target_round.settled_at is not null then
    return jsonb_build_object('round_id', p_round_id, 'duplicate', true);
  end if;

  select * into target_session
  from friend_exchange.sessions
  where id = target_round.session_id
  for update;

  select count(*) into active_count
  from friend_exchange.room_members
  where room_id = target_session.room_id and role <> 'spectator';

  if jsonb_typeof(p_results) <> 'array'
     or jsonb_array_length(p_results) <> active_count then
    raise exception 'Exactly one result per player is required';
  end if;
  if jsonb_typeof(p_moves) <> 'array'
     or jsonb_array_length(p_moves) <> active_count then
    raise exception 'Exactly one market move per player is required';
  end if;

  update friend_exchange.rounds
  set status = 'settling', version = version + 1
  where id = p_round_id;

  for move_item in select * from jsonb_array_elements(p_moves) loop
    if abs((move_item ->> 'return')::numeric) > 0.18 then
      raise exception 'Market move exceeds circuit breaker';
    end if;

    select * into asset
    from friend_exchange.friend_assets
    where session_id = target_round.session_id
      and owner_id = (move_item ->> 'user_id')::uuid
    for update;

    if asset.owner_id is null then raise exception 'Friend asset missing'; end if;

    updated_price := greatest(
      5,
      round(asset.price * (1 + (move_item ->> 'return')::numeric), 4)
    );

    update friend_exchange.friend_assets
    set previous_price = asset.price,
        price = updated_price,
        round_return = (move_item ->> 'return')::numeric,
        sentiment = case
          when (move_item ->> 'return')::numeric > 0.04 then 'bullish'
          when (move_item ->> 'return')::numeric < -0.04 then 'bearish'
          else 'neutral'
        end,
        version = version + 1,
        updated_at = now()
    where session_id = target_round.session_id
      and owner_id = asset.owner_id;

    insert into friend_exchange.friend_price_events (
      session_id, round_id, owner_id, old_price, new_price,
      return_percent, reason, algorithm_version
    )
    values (
      target_round.session_id,
      p_round_id,
      asset.owner_id,
      asset.price,
      updated_price,
      (move_item ->> 'return')::numeric,
      coalesce(move_item ->> 'reason', target_round.game_type),
      p_algorithm_version
    );
  end loop;

  for result_item in select * from jsonb_array_elements(p_results) loop
    select old_price, new_price
    into asset.previous_price, asset.price
    from friend_exchange.friend_price_events
    where round_id = p_round_id
      and owner_id = (result_item ->> 'user_id')::uuid;

    insert into friend_exchange.round_results (
      round_id, user_id, rank, normalized_score, raw_score,
      expected_percentile, actual_percentile, stock_return,
      old_price, new_price, xp_awarded
    )
    values (
      p_round_id,
      (result_item ->> 'user_id')::uuid,
      (result_item ->> 'rank')::smallint,
      (result_item ->> 'normalized_score')::numeric,
      coalesce(result_item -> 'raw_score', '{}'::jsonb),
      (result_item ->> 'expected_percentile')::numeric,
      (result_item ->> 'actual_percentile')::numeric,
      (result_item ->> 'stock_return')::numeric,
      asset.previous_price,
      asset.price,
      coalesce((result_item ->> 'xp_awarded')::integer, 0)
    );

    update friend_exchange.profiles
    set xp = xp + coalesce((result_item ->> 'xp_awarded')::integer, 0),
        updated_at = now()
    where id = (result_item ->> 'user_id')::uuid;
  end loop;

  for rating_item in select * from jsonb_array_elements(p_rating_updates) loop
    insert into friend_exchange.game_ratings (
      user_id, category, rating, games_played, updated_at
    )
    values (
      (rating_item ->> 'user_id')::uuid,
      rating_item ->> 'category',
      greatest(600, least(1600, 1000 + coalesce((rating_item ->> 'delta')::integer, 0))),
      1,
      now()
    )
    on conflict (user_id, category) do update
    set rating = greatest(
          600,
          least(
            1600,
            friend_exchange.game_ratings.rating
              + coalesce((rating_item ->> 'delta')::integer, 0)
          )
        ),
        games_played = friend_exchange.game_ratings.games_played + 1,
        updated_at = now();
  end loop;

  update friend_exchange.rounds
  set status = 'results', settled_at = now(), version = version + 1
  where id = p_round_id;

  return jsonb_build_object(
    'round_id', p_round_id,
    'duplicate', false,
    'settled_at', now()
  );
end;
$$;

create or replace function friend_exchange.complete_round(p_round_id uuid)
returns friend_exchange.rounds
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  round_row friend_exchange.rounds;
begin
  select * into round_row
  from friend_exchange.rounds
  where id = p_round_id
  for update;

  if not friend_exchange.is_room_host(friend_exchange.room_for_round(p_round_id)) then
    raise exception 'Host permission required';
  end if;
  if round_row.status <> 'results' then
    raise exception 'Round results are not ready';
  end if;

  update friend_exchange.rounds
  set status = 'complete', version = version + 1
  where id = p_round_id
  returning * into round_row;

  return round_row;
end;
$$;
