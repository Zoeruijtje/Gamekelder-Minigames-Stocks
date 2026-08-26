-- Make the pre-round Friend Market timer authoritative.
--
-- Previously the browser displayed a countdown, but execute_paper_order only
-- checked round.status = 'trading'. If the host tab was background-throttled,
-- the database could still accept late orders. The database deadline is now
-- the source of truth and any connected room member can idempotently finalize
-- the expired trading phase.

alter function friend_exchange.execute_paper_order(
  uuid, text, friend_exchange.order_side, numeric, numeric, text
) rename to execute_paper_order_legacy_20260825;

revoke all on function friend_exchange.execute_paper_order_legacy_20260825(
  uuid, text, friend_exchange.order_side, numeric, numeric, text
) from public, anon, authenticated;

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
  trading_round friend_exchange.rounds;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into portfolio_row
  from friend_exchange.portfolios
  where id = p_portfolio_id
  for update;

  if portfolio_row.id is null or portfolio_row.owner_id <> auth.uid() then
    raise exception 'Portfolio not found';
  end if;
  if portfolio_row.scope <> 'friend' then
    raise exception 'Only Friend Market portfolios are enabled online in the free build';
  end if;

  select * into trading_round
  from friend_exchange.rounds
  where session_id = portfolio_row.session_id
    and status = 'trading'
  order by sequence desc
  limit 1
  for update;

  if trading_round.id is null then
    raise exception 'Friend Market trading is locked';
  end if;
  if trading_round.locks_at is null or trading_round.locks_at <= now() then
    raise exception 'Friend Market trading deadline has passed';
  end if;

  return friend_exchange.execute_paper_order_legacy_20260825(
    p_portfolio_id,
    p_symbol,
    p_side,
    p_notional,
    p_quantity,
    p_idempotency_key
  );
end;
$$;

revoke all on function friend_exchange.execute_paper_order(
  uuid, text, friend_exchange.order_side, numeric, numeric, text
) from public, anon;
grant execute on function friend_exchange.execute_paper_order(
  uuid, text, friend_exchange.order_side, numeric, numeric, text
) to authenticated, service_role;

create or replace function friend_exchange.expire_trading_window(p_round_id uuid)
returns friend_exchange.rounds
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  round_row friend_exchange.rounds;
  room_id_value uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into round_row
  from friend_exchange.rounds
  where id = p_round_id
  for update;

  if round_row.id is null then
    raise exception 'Round not found';
  end if;

  room_id_value := friend_exchange.room_for_round(p_round_id);
  if not friend_exchange.is_room_member(room_id_value) then
    raise exception 'Room membership required';
  end if;

  -- Idempotent: another client may have closed it a few milliseconds earlier.
  if round_row.status <> 'trading' then
    return round_row;
  end if;

  if round_row.locks_at is null then
    raise exception 'Trading deadline is unavailable';
  end if;
  if now() < round_row.locks_at then
    raise exception 'Trading window is still open';
  end if;

  update friend_exchange.rounds
  set status = 'locked',
      version = version + 1
  where id = p_round_id
  returning * into round_row;

  insert into friend_exchange.audit_events (
    room_id, actor_id, event_type, payload
  ) values (
    room_id_value,
    auth.uid(),
    'round.trading_deadline_expired',
    jsonb_build_object(
      'round_id', p_round_id,
      'locks_at', round_row.locks_at
    )
  );

  return round_row;
end;
$$;

revoke all on function friend_exchange.expire_trading_window(uuid)
from public, anon;
grant execute on function friend_exchange.expire_trading_window(uuid)
to authenticated, service_role;
