-- Advanced fictional portfolio management and server-authoritative risk controls.
-- Protective Friend Market orders are evaluated only against authoritative
-- settlement prices. They never connect to a brokerage or real-money market.

create table friend_exchange.protective_orders (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references friend_exchange.portfolios(id) on delete cascade,
  owner_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  session_id uuid not null references friend_exchange.sessions(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  order_type text not null check (order_type in ('stop_loss','take_profit','trailing_stop','bracket')),
  trigger_price numeric(18,6),
  take_profit_price numeric(18,6),
  trail_percent numeric(8,4),
  quantity_percent numeric(8,4) not null default 100 check (quantity_percent > 0 and quantity_percent <= 100),
  peak_price numeric(18,6),
  status text not null default 'active' check (status in ('active','triggered','filled','cancelled','expired')),
  trigger_reason text,
  triggered_at timestamptz,
  filled_trade_id uuid references friend_exchange.paper_trades(id) on delete set null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portfolio_id, idempotency_key),
  constraint protective_order_shape check (
    (order_type = 'stop_loss' and trigger_price is not null and take_profit_price is null and trail_percent is null)
    or (order_type = 'take_profit' and trigger_price is null and take_profit_price is not null and trail_percent is null)
    or (order_type = 'trailing_stop' and trigger_price is null and take_profit_price is null and trail_percent between 0.5 and 50)
    or (order_type = 'bracket' and trigger_price is not null and take_profit_price is not null and trail_percent is null)
  )
);

create unique index protective_orders_one_active_symbol
  on friend_exchange.protective_orders(portfolio_id, symbol)
  where status = 'active';
create index protective_orders_session_status_idx
  on friend_exchange.protective_orders(session_id, status, symbol);
create index protective_orders_owner_updated_idx
  on friend_exchange.protective_orders(owner_id, updated_at desc);

alter table friend_exchange.protective_orders enable row level security;
alter table friend_exchange.protective_orders force row level security;
revoke all on friend_exchange.protective_orders from public, anon, authenticated;
grant select on friend_exchange.protective_orders to authenticated;
grant all privileges on friend_exchange.protective_orders to service_role;

create policy protective_orders_read_own
on friend_exchange.protective_orders
for select to authenticated
using (owner_id = (select auth.uid()));

alter table friend_exchange.paper_trades
  add column if not exists protective_order_id uuid references friend_exchange.protective_orders(id) on delete set null,
  add column if not exists protective_trigger_reason text;

create index if not exists paper_trades_protective_order_idx
  on friend_exchange.paper_trades(protective_order_id)
  where protective_order_id is not null;

create or replace function friend_exchange.require_open_friend_trading(p_session_id uuid)
returns friend_exchange.rounds
language plpgsql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  round_row friend_exchange.rounds;
begin
  select * into round_row
  from friend_exchange.rounds
  where session_id = p_session_id and status = 'trading'
  order by sequence desc
  limit 1;
  if round_row.id is null then raise exception 'Friend Market protection can only be changed while trading is open'; end if;
  if round_row.locks_at is null or round_row.locks_at <= now() then raise exception 'Friend Market trading deadline has passed'; end if;
  return round_row;
end;
$$;

create or replace function friend_exchange.upsert_protective_order(
  p_portfolio_id uuid,
  p_symbol text,
  p_order_type text,
  p_trigger_price numeric default null,
  p_take_profit_price numeric default null,
  p_trail_percent numeric default null,
  p_quantity_percent numeric default 100,
  p_idempotency_key text default null
)
returns friend_exchange.protective_orders
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  portfolio_row friend_exchange.portfolios;
  position_row friend_exchange.positions;
  asset_row friend_exchange.friend_assets;
  existing friend_exchange.protective_orders;
  saved friend_exchange.protective_orders;
  round_row friend_exchange.rounds;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if p_order_type not in ('stop_loss','take_profit','trailing_stop','bracket') then raise exception 'Invalid protection type'; end if;
  if nullif(trim(p_idempotency_key), '') is null or char_length(p_idempotency_key) > 180 then raise exception 'A valid idempotency key is required'; end if;
  if p_quantity_percent is null or p_quantity_percent <= 0 or p_quantity_percent > 100 then raise exception 'Protected quantity must be between 1 and 100 percent'; end if;

  select * into portfolio_row from friend_exchange.portfolios where id = p_portfolio_id for update;
  if portfolio_row.id is null or portfolio_row.owner_id <> auth.uid() then raise exception 'Portfolio not found'; end if;
  if portfolio_row.scope <> 'friend' or portfolio_row.session_id is null then raise exception 'Online protection is available only for Friend Market positions'; end if;
  round_row := friend_exchange.require_open_friend_trading(portfolio_row.session_id);

  select * into position_row from friend_exchange.positions
  where portfolio_id = p_portfolio_id and symbol = upper(trim(p_symbol)) for update;
  if position_row.portfolio_id is null or position_row.quantity <= 0 then raise exception 'Open a position before adding protection'; end if;

  select * into asset_row from friend_exchange.friend_assets
  where session_id = portfolio_row.session_id and symbol = upper(trim(p_symbol));
  if asset_row.owner_id is null or asset_row.price <= 0 then raise exception 'Authoritative asset price is unavailable'; end if;

  if p_order_type in ('stop_loss','bracket') and (p_trigger_price is null or p_trigger_price <= 0 or p_trigger_price >= asset_row.price) then
    raise exception 'Stop-loss price must be below the current price';
  end if;
  if p_order_type in ('take_profit','bracket') and (p_take_profit_price is null or p_take_profit_price <= asset_row.price) then
    raise exception 'Take-profit price must be above the current price';
  end if;
  if p_order_type = 'trailing_stop' and (p_trail_percent is null or p_trail_percent < 0.5 or p_trail_percent > 50) then
    raise exception 'Trailing stop must be between 0.5 and 50 percent';
  end if;

  select * into existing from friend_exchange.protective_orders
  where portfolio_id = p_portfolio_id and symbol = upper(trim(p_symbol)) and status = 'active'
  for update;

  if existing.id is null then
    insert into friend_exchange.protective_orders (
      portfolio_id, owner_id, session_id, symbol, order_type,
      trigger_price, take_profit_price, trail_percent, quantity_percent,
      peak_price, idempotency_key
    ) values (
      portfolio_row.id, portfolio_row.owner_id, portfolio_row.session_id, upper(trim(p_symbol)), p_order_type,
      case when p_order_type in ('stop_loss','bracket') then p_trigger_price else null end,
      case when p_order_type in ('take_profit','bracket') then p_take_profit_price else null end,
      case when p_order_type = 'trailing_stop' then p_trail_percent else null end,
      p_quantity_percent, asset_row.price, p_idempotency_key
    ) returning * into saved;
  else
    update friend_exchange.protective_orders
    set order_type = p_order_type,
        trigger_price = case when p_order_type in ('stop_loss','bracket') then p_trigger_price else null end,
        take_profit_price = case when p_order_type in ('take_profit','bracket') then p_take_profit_price else null end,
        trail_percent = case when p_order_type = 'trailing_stop' then p_trail_percent else null end,
        quantity_percent = p_quantity_percent,
        peak_price = greatest(coalesce(existing.peak_price, asset_row.price), asset_row.price),
        idempotency_key = p_idempotency_key,
        trigger_reason = null,
        triggered_at = null,
        filled_trade_id = null,
        updated_at = now()
    where id = existing.id
    returning * into saved;
  end if;

  insert into friend_exchange.audit_events(room_id, actor_id, event_type, payload)
  values (friend_exchange.room_for_session(portfolio_row.session_id), auth.uid(), 'portfolio.protection_saved', jsonb_build_object(
    'protective_order_id', saved.id, 'portfolio_id', saved.portfolio_id,
    'symbol', saved.symbol, 'order_type', saved.order_type, 'quantity_percent', saved.quantity_percent
  ));
  return saved;
end;
$$;

create or replace function friend_exchange.cancel_protective_order(p_order_id uuid)
returns friend_exchange.protective_orders
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  order_row friend_exchange.protective_orders;
  saved friend_exchange.protective_orders;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into order_row from friend_exchange.protective_orders where id = p_order_id for update;
  if order_row.id is null or order_row.owner_id <> auth.uid() then raise exception 'Protection order not found'; end if;
  if order_row.status <> 'active' then return order_row; end if;
  perform friend_exchange.require_open_friend_trading(order_row.session_id);
  update friend_exchange.protective_orders
    set status = 'cancelled', trigger_reason = 'Cancelled by player', updated_at = now()
  where id = p_order_id returning * into saved;
  return saved;
end;
$$;

create or replace function friend_exchange.process_protective_orders(p_session_id uuid, p_round_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  risk friend_exchange.protective_orders;
  portfolio_row friend_exchange.portfolios;
  position_row friend_exchange.positions;
  asset_row friend_exchange.friend_assets;
  paper_order_row friend_exchange.paper_orders;
  trade_row friend_exchange.paper_trades;
  risk_reason text;
  trailing_trigger numeric(18,6);
  fill_quantity numeric(24,6);
  gross numeric(18,2);
  realized numeric(18,2);
  remaining numeric(24,6);
  results jsonb := '[]'::jsonb;
begin
  for risk in
    select * from friend_exchange.protective_orders
    where session_id = p_session_id and status = 'active'
    order by created_at
    for update skip locked
  loop
    select * into portfolio_row from friend_exchange.portfolios where id = risk.portfolio_id for update;
    select * into position_row from friend_exchange.positions
      where portfolio_id = risk.portfolio_id and symbol = risk.symbol for update;
    select * into asset_row from friend_exchange.friend_assets
      where session_id = p_session_id and symbol = risk.symbol;

    if portfolio_row.id is null or position_row.portfolio_id is null or position_row.quantity <= 0 or asset_row.owner_id is null then
      update friend_exchange.protective_orders
        set status = 'expired', trigger_reason = 'Position or asset no longer exists', updated_at = now()
      where id = risk.id;
      continue;
    end if;

    if risk.order_type = 'trailing_stop' and asset_row.price > coalesce(risk.peak_price, asset_row.price) then
      update friend_exchange.protective_orders set peak_price = asset_row.price, updated_at = now() where id = risk.id;
      risk.peak_price := asset_row.price;
    end if;

    risk_reason := null;
    if risk.order_type = 'stop_loss' and asset_row.price <= risk.trigger_price then
      risk_reason := format('Stop loss crossed at %s', asset_row.price);
    elsif risk.order_type = 'take_profit' and asset_row.price >= risk.take_profit_price then
      risk_reason := format('Take profit reached at %s', asset_row.price);
    elsif risk.order_type = 'bracket' and asset_row.price <= risk.trigger_price then
      risk_reason := format('Bracket stop crossed at %s', asset_row.price);
    elsif risk.order_type = 'bracket' and asset_row.price >= risk.take_profit_price then
      risk_reason := format('Bracket target reached at %s', asset_row.price);
    elsif risk.order_type = 'trailing_stop' then
      trailing_trigger := coalesce(risk.peak_price, asset_row.price) * (1 - risk.trail_percent / 100);
      if asset_row.price <= trailing_trigger then risk_reason := format('Trailing stop crossed %s', round(trailing_trigger, 4)); end if;
    end if;
    if risk_reason is null then continue; end if;

    fill_quantity := round(position_row.quantity * risk.quantity_percent / 100, 6);
    fill_quantity := least(fill_quantity, position_row.quantity);
    if fill_quantity <= 0 then continue; end if;
    gross := round(fill_quantity * asset_row.price, 2);
    realized := round(fill_quantity * (asset_row.price - position_row.average_cost), 2);
    remaining := round(position_row.quantity - fill_quantity, 6);

    insert into friend_exchange.paper_orders (
      portfolio_id, symbol, side, requested_quantity, status, idempotency_key
    ) values (
      risk.portfolio_id, risk.symbol, 'sell', fill_quantity, 'filled',
      'protective:' || risk.id::text || ':' || p_round_id::text
    ) on conflict (portfolio_id, idempotency_key) do update set status = excluded.status
    returning * into paper_order_row;

    if remaining <= 0.000001 then
      delete from friend_exchange.positions where portfolio_id = risk.portfolio_id and symbol = risk.symbol;
    else
      update friend_exchange.positions set quantity = remaining, updated_at = now()
      where portfolio_id = risk.portfolio_id and symbol = risk.symbol;
    end if;

    update friend_exchange.portfolios
      set cash = cash + gross,
          realized_pnl = realized_pnl + realized,
          version = version + 1,
          updated_at = now()
    where id = risk.portfolio_id;

    insert into friend_exchange.paper_trades (
      order_id, portfolio_id, symbol, side, quantity, fill_price, gross,
      realized_pnl, protective_order_id, protective_trigger_reason
    ) values (
      paper_order_row.id, risk.portfolio_id, risk.symbol, 'sell', fill_quantity,
      asset_row.price, gross, realized, risk.id, risk_reason
    ) on conflict (order_id) do update set protective_trigger_reason = excluded.protective_trigger_reason
    returning * into trade_row;

    update friend_exchange.protective_orders
      set status = 'filled', trigger_reason = risk_reason,
          triggered_at = now(), filled_trade_id = trade_row.id, updated_at = now()
    where id = risk.id;

    results := results || jsonb_build_array(jsonb_build_object(
      'protective_order_id', risk.id,
      'trade_id', trade_row.id,
      'owner_id', risk.owner_id,
      'symbol', risk.symbol,
      'quantity', fill_quantity,
      'fill_price', asset_row.price,
      'gross', gross,
      'realized_pnl', realized,
      'trigger_reason', risk_reason
    ));
  end loop;
  return results;
end;
$$;

-- Wrap authoritative settlement so protections are evaluated after prices move.
alter function friend_exchange.apply_round_settlement(uuid, jsonb, jsonb, text, jsonb)
  rename to apply_round_settlement_legacy_20260826_risk;
revoke all on function friend_exchange.apply_round_settlement_legacy_20260826_risk(uuid, jsonb, jsonb, text, jsonb)
  from public, anon, authenticated;

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
  base_result jsonb;
  session_id_value uuid;
  protection_fills jsonb := '[]'::jsonb;
begin
  select session_id into session_id_value from friend_exchange.rounds where id = p_round_id;
  base_result := friend_exchange.apply_round_settlement_legacy_20260826_risk(
    p_round_id, p_results, p_moves, p_algorithm_version, p_rating_updates
  );
  if coalesce((base_result ->> 'duplicate')::boolean, false) is false then
    protection_fills := friend_exchange.process_protective_orders(session_id_value, p_round_id);
  end if;
  return base_result || jsonb_build_object('protective_fills', protection_fills);
end;
$$;

-- Extend reconnect snapshots with private risk orders, fills and real equity history.
alter function friend_exchange.room_snapshot(uuid)
  rename to room_snapshot_legacy_20260826_risk;
revoke all on function friend_exchange.room_snapshot_legacy_20260826_risk(uuid)
  from public, anon, authenticated;

create or replace function friend_exchange.room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  base jsonb;
  session_id_value uuid;
  portfolio_ids uuid[];
begin
  base := friend_exchange.room_snapshot_legacy_20260826_risk(p_room_id);
  if base is null then return null; end if;
  session_id_value := nullif(base #>> '{session,id}', '')::uuid;
  select coalesce(array_agg(id), array[]::uuid[]) into portfolio_ids
  from friend_exchange.portfolios
  where owner_id = auth.uid() and (session_id = session_id_value or (scope = 'real' and session_id is null));
  return base || jsonb_build_object(
    'my_protective_orders', coalesce((
      select jsonb_agg(to_jsonb(po) order by po.updated_at desc)
      from friend_exchange.protective_orders po
      where po.owner_id = auth.uid() and po.session_id = session_id_value
    ), '[]'::jsonb),
    'my_trades', coalesce((
      select jsonb_agg(to_jsonb(pt) order by pt.created_at desc)
      from (
        select * from friend_exchange.paper_trades
        where portfolio_id = any(portfolio_ids)
        order by created_at desc limit 80
      ) pt
    ), '[]'::jsonb),
    'my_equity_history', coalesce((
      select jsonb_agg(to_jsonb(pe) order by pe.created_at)
      from (
        select * from friend_exchange.portfolio_equity_events
        where owner_id = auth.uid() and portfolio_id = any(portfolio_ids)
        order by created_at desc limit 160
      ) pe
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function friend_exchange.require_open_friend_trading(uuid) from public, anon, authenticated;
revoke all on function friend_exchange.upsert_protective_order(uuid, text, text, numeric, numeric, numeric, numeric, text) from public, anon;
revoke all on function friend_exchange.cancel_protective_order(uuid) from public, anon;
revoke all on function friend_exchange.process_protective_orders(uuid, uuid) from public, anon, authenticated;
revoke all on function friend_exchange.apply_round_settlement(uuid, jsonb, jsonb, text, jsonb) from public, anon, authenticated;
revoke all on function friend_exchange.room_snapshot(uuid) from public, anon;

grant execute on function friend_exchange.upsert_protective_order(uuid, text, text, numeric, numeric, numeric, numeric, text) to authenticated;
grant execute on function friend_exchange.cancel_protective_order(uuid) to authenticated;
grant execute on function friend_exchange.apply_round_settlement(uuid, jsonb, jsonb, text, jsonb) to service_role;
grant execute on function friend_exchange.process_protective_orders(uuid, uuid) to service_role;
grant execute on function friend_exchange.room_snapshot(uuid) to authenticated;
grant execute on function friend_exchange.room_snapshot_legacy_20260826_risk(uuid) to service_role;
grant execute on function friend_exchange.apply_round_settlement_legacy_20260826_risk(uuid, jsonb, jsonb, text, jsonb) to service_role;

notify pgrst, 'reload schema';
