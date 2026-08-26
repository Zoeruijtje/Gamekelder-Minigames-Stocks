-- Harden the exposed public schema and persist genuine Friend Market equity history.
-- Public application data lives in the isolated friend_exchange schema.

do $$
declare
  target record;
begin
  for target in
    select format('%I.%I', n.nspname, c.relname) as qualified_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1
        from pg_depend d
        join pg_extension e on e.oid = d.refobjid
        where d.classid = 'pg_class'::regclass
          and d.objid = c.oid
          and d.deptype = 'e'
      )
  loop
    execute format('alter table %s enable row level security', target.qualified_name);
    execute format('alter table %s force row level security', target.qualified_name);
    execute format('revoke all privileges on table %s from public, anon, authenticated', target.qualified_name);
  end loop;
end $$;

alter default privileges for role postgres in schema public revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;

create table friend_exchange.portfolio_equity_events (
  id bigint generated always as identity primary key,
  portfolio_id uuid not null references friend_exchange.portfolios(id) on delete cascade,
  owner_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  session_id uuid not null references friend_exchange.sessions(id) on delete cascade,
  cash numeric(18,2) not null check (cash >= 0),
  position_value numeric(18,2) not null check (position_value >= 0),
  equity numeric(18,2) not null check (equity >= 0),
  event_type text not null check (event_type in ('opening', 'trade', 'settlement')),
  reference_id uuid,
  created_at timestamptz not null default now(),
  unique (portfolio_id, event_type, reference_id)
);
create index portfolio_equity_events_owner_created_idx on friend_exchange.portfolio_equity_events(owner_id, created_at);
create index portfolio_equity_events_portfolio_created_idx on friend_exchange.portfolio_equity_events(portfolio_id, created_at);
create index portfolio_equity_events_session_created_idx on friend_exchange.portfolio_equity_events(session_id, created_at);
alter table friend_exchange.portfolio_equity_events enable row level security;
revoke all on friend_exchange.portfolio_equity_events from public, anon, authenticated;
grant select on friend_exchange.portfolio_equity_events to authenticated;
grant all privileges on friend_exchange.portfolio_equity_events to service_role;
grant usage, select on sequence friend_exchange.portfolio_equity_events_id_seq to service_role;
create policy portfolio_equity_events_read_own on friend_exchange.portfolio_equity_events
for select to authenticated using (owner_id = (select auth.uid()));

create or replace function friend_exchange.record_friend_portfolio_equity(
  p_portfolio_id uuid,
  p_event_type text,
  p_reference_id uuid default null
)
returns friend_exchange.portfolio_equity_events
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  portfolio_row friend_exchange.portfolios;
  position_value_result numeric(18,2);
  event_row friend_exchange.portfolio_equity_events;
begin
  select * into portfolio_row from friend_exchange.portfolios where id = p_portfolio_id;
  if portfolio_row.id is null or portfolio_row.scope <> 'friend' or portfolio_row.session_id is null then return null; end if;
  if p_event_type not in ('opening', 'trade', 'settlement') then raise exception 'Unsupported portfolio equity event type'; end if;
  select coalesce(round(sum(position.quantity * asset.price), 2), 0)
    into position_value_result
  from friend_exchange.positions position
  join friend_exchange.friend_assets asset
    on asset.session_id = portfolio_row.session_id and asset.symbol = position.symbol
  where position.portfolio_id = portfolio_row.id;
  insert into friend_exchange.portfolio_equity_events(
    portfolio_id, owner_id, session_id, cash, position_value, equity, event_type, reference_id
  ) values (
    portfolio_row.id, portfolio_row.owner_id, portfolio_row.session_id, portfolio_row.cash,
    position_value_result, round(portfolio_row.cash + position_value_result, 2), p_event_type, p_reference_id
  )
  on conflict (portfolio_id, event_type, reference_id) do update
    set cash = excluded.cash, position_value = excluded.position_value,
        equity = excluded.equity, created_at = now()
  returning * into event_row;
  return event_row;
end;
$$;

create or replace function friend_exchange.capture_friend_portfolio_opening()
returns trigger language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
begin
  if new.scope = 'friend' and new.session_id is not null then
    perform friend_exchange.record_friend_portfolio_equity(new.id, 'opening', new.id);
  end if;
  return new;
end;
$$;
create or replace function friend_exchange.capture_friend_trade_equity()
returns trigger language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
begin
  perform friend_exchange.record_friend_portfolio_equity(new.portfolio_id, 'trade', new.id);
  return new;
end;
$$;
create or replace function friend_exchange.capture_friend_settlement_equity()
returns trigger language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
declare portfolio_row record;
begin
  if new.status = 'results' and old.status is distinct from new.status then
    for portfolio_row in select id from friend_exchange.portfolios where session_id = new.session_id and scope = 'friend' loop
      perform friend_exchange.record_friend_portfolio_equity(portfolio_row.id, 'settlement', new.id);
    end loop;
  end if;
  return new;
end;
$$;
create trigger capture_friend_portfolio_opening after insert on friend_exchange.portfolios
for each row execute function friend_exchange.capture_friend_portfolio_opening();
create trigger capture_friend_trade_equity after insert on friend_exchange.paper_trades
for each row execute function friend_exchange.capture_friend_trade_equity();
create trigger capture_friend_settlement_equity after update on friend_exchange.rounds
for each row execute function friend_exchange.capture_friend_settlement_equity();

revoke all on function friend_exchange.record_friend_portfolio_equity(uuid,text,uuid) from public, anon, authenticated;
revoke all on function friend_exchange.capture_friend_portfolio_opening() from public, anon, authenticated;
revoke all on function friend_exchange.capture_friend_trade_equity() from public, anon, authenticated;
revoke all on function friend_exchange.capture_friend_settlement_equity() from public, anon, authenticated;
grant execute on function friend_exchange.record_friend_portfolio_equity(uuid,text,uuid) to service_role;
notify pgrst, 'reload schema';
