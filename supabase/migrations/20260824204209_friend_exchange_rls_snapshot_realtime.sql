alter table friend_exchange.profiles enable row level security;
alter table friend_exchange.game_ratings enable row level security;
alter table friend_exchange.rooms enable row level security;
alter table friend_exchange.room_members enable row level security;
alter table friend_exchange.sessions enable row level security;
alter table friend_exchange.rounds enable row level security;
alter table friend_exchange.round_submissions enable row level security;
alter table friend_exchange.round_results enable row level security;
alter table friend_exchange.friend_assets enable row level security;
alter table friend_exchange.friend_price_events enable row level security;
alter table friend_exchange.portfolios enable row level security;
alter table friend_exchange.positions enable row level security;
alter table friend_exchange.paper_orders enable row level security;
alter table friend_exchange.paper_trades enable row level security;
alter table friend_exchange.news_events enable row level security;
alter table friend_exchange.audit_events enable row level security;

create policy profiles_read
on friend_exchange.profiles
for select to authenticated
using (true);

create policy profiles_update_own
on friend_exchange.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy ratings_read
on friend_exchange.game_ratings
for select to authenticated
using (true);

create policy rooms_read_member
on friend_exchange.rooms
for select to authenticated
using (friend_exchange.is_room_member(id));

create policy room_members_read_same_room
on friend_exchange.room_members
for select to authenticated
using (friend_exchange.is_room_member(room_id));

create policy sessions_read_room
on friend_exchange.sessions
for select to authenticated
using (friend_exchange.is_room_member(room_id));

create policy rounds_read_room
on friend_exchange.rounds
for select to authenticated
using (friend_exchange.is_room_member(friend_exchange.room_for_session(session_id)));

create policy submissions_read_own
on friend_exchange.round_submissions
for select to authenticated
using (user_id = (select auth.uid()));

create policy results_read_room
on friend_exchange.round_results
for select to authenticated
using (friend_exchange.is_room_member(friend_exchange.room_for_round(round_id)));

create policy friend_assets_read_room
on friend_exchange.friend_assets
for select to authenticated
using (friend_exchange.is_room_member(friend_exchange.room_for_session(session_id)));

create policy friend_events_read_room
on friend_exchange.friend_price_events
for select to authenticated
using (friend_exchange.is_room_member(friend_exchange.room_for_session(session_id)));

create policy portfolios_read_own
on friend_exchange.portfolios
for select to authenticated
using (owner_id = (select auth.uid()));

create policy positions_read_own
on friend_exchange.positions
for select to authenticated
using (exists (
  select 1
  from friend_exchange.portfolios p
  where p.id = portfolio_id and p.owner_id = (select auth.uid())
));

create policy orders_read_own
on friend_exchange.paper_orders
for select to authenticated
using (exists (
  select 1
  from friend_exchange.portfolios p
  where p.id = portfolio_id and p.owner_id = (select auth.uid())
));

create policy trades_read_own
on friend_exchange.paper_trades
for select to authenticated
using (exists (
  select 1
  from friend_exchange.portfolios p
  where p.id = portfolio_id and p.owner_id = (select auth.uid())
));

create policy news_read_room
on friend_exchange.news_events
for select to authenticated
using (friend_exchange.is_room_member(room_id));

create policy audit_read_host
on friend_exchange.audit_events
for select to authenticated
using (friend_exchange.is_room_host(room_id));

create or replace function friend_exchange.room_snapshot(p_room_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
with target_room as (
  select r.*
  from friend_exchange.rooms r
  where r.id = p_room_id and friend_exchange.is_room_member(r.id)
), target_session as (
  select s.*
  from friend_exchange.sessions s
  join target_room r on r.current_session_id = s.id
), my_portfolios as (
  select p.*
  from friend_exchange.portfolios p
  where p.owner_id = auth.uid()
    and p.session_id = (select id from target_session)
)
select jsonb_build_object(
  'room', to_jsonb(r),
  'members', coalesce((
    select jsonb_agg(
      to_jsonb(rm) || jsonb_build_object('profile', to_jsonb(p))
      order by rm.seat
    )
    from friend_exchange.room_members rm
    join friend_exchange.profiles p on p.id = rm.user_id
    where rm.room_id = r.id
  ), '[]'::jsonb),
  'session', (
    select to_jsonb(s) || jsonb_build_object(
      'rounds', coalesce((
        select jsonb_agg(to_jsonb(rd) order by rd.sequence)
        from friend_exchange.rounds rd
        where rd.session_id = s.id
      ), '[]'::jsonb),
      'friend_assets', coalesce((
        select jsonb_agg(to_jsonb(fa) order by fa.symbol)
        from friend_exchange.friend_assets fa
        where fa.session_id = s.id
      ), '[]'::jsonb)
    )
    from target_session s
  ),
  'round_results', coalesce((
    select jsonb_agg(to_jsonb(rr) order by rr.rank)
    from friend_exchange.round_results rr
    where rr.round_id = r.current_round_id
  ), '[]'::jsonb),
  'market_moves', coalesce((
    select jsonb_agg(to_jsonb(pe) order by abs(pe.return_percent) desc)
    from friend_exchange.friend_price_events pe
    where pe.round_id = r.current_round_id
  ), '[]'::jsonb),
  'submission_user_ids', coalesce((
    select jsonb_agg(rs.user_id)
    from friend_exchange.round_submissions rs
    where rs.round_id = r.current_round_id
  ), '[]'::jsonb),
  'my_portfolios', coalesce((
    select jsonb_agg(to_jsonb(mp))
    from my_portfolios mp
  ), '[]'::jsonb),
  'my_positions', coalesce((
    select jsonb_agg(to_jsonb(pos) order by pos.symbol)
    from friend_exchange.positions pos
    where pos.portfolio_id in (select id from my_portfolios)
  ), '[]'::jsonb),
  'leaderboard', coalesce((
    select jsonb_agg(entry order by (entry ->> 'equity')::numeric desc)
    from (
      select jsonb_build_object(
        'user_id', pf.owner_id,
        'cash', pf.cash,
        'position_value', coalesce((
          select sum(pos.quantity * fa.price)
          from friend_exchange.positions pos
          join friend_exchange.friend_assets fa
            on fa.session_id = pf.session_id and fa.symbol = pos.symbol
          where pos.portfolio_id = pf.id
        ), 0),
        'equity', pf.cash + coalesce((
          select sum(pos.quantity * fa.price)
          from friend_exchange.positions pos
          join friend_exchange.friend_assets fa
            on fa.session_id = pf.session_id and fa.symbol = pos.symbol
          where pos.portfolio_id = pf.id
        ), 0)
      ) entry
      from friend_exchange.portfolios pf
      where pf.scope = 'friend'
        and pf.session_id = (select id from target_session)
    ) ranked
  ), '[]'::jsonb),
  'server_time', now()
)
from target_room r;
$$;

revoke all on all tables in schema friend_exchange from anon;

grant select on
  friend_exchange.profiles,
  friend_exchange.game_ratings,
  friend_exchange.rooms,
  friend_exchange.room_members,
  friend_exchange.sessions,
  friend_exchange.rounds,
  friend_exchange.round_submissions,
  friend_exchange.round_results,
  friend_exchange.friend_assets,
  friend_exchange.friend_price_events,
  friend_exchange.portfolios,
  friend_exchange.positions,
  friend_exchange.paper_orders,
  friend_exchange.paper_trades,
  friend_exchange.news_events
to authenticated;

grant update (display_name, ticker, avatar_color)
on friend_exchange.profiles
to authenticated;

grant execute on function friend_exchange.ensure_profile(text) to authenticated;
grant execute on function friend_exchange.create_room(text, jsonb) to authenticated;
grant execute on function friend_exchange.join_room(text) to authenticated;
grant execute on function friend_exchange.set_room_ready(uuid, boolean) to authenticated;
grant execute on function friend_exchange.heartbeat_room(uuid) to authenticated;
grant execute on function friend_exchange.start_online_session(uuid, jsonb, jsonb) to authenticated;
grant execute on function friend_exchange.create_online_round(uuid, integer, text, text, text, jsonb, integer) to authenticated;
grant execute on function friend_exchange.transition_online_round(uuid, bigint, friend_exchange.round_status, integer) to authenticated;
grant execute on function friend_exchange.submit_round_input(uuid, jsonb, text) to authenticated;
grant execute on function friend_exchange.execute_paper_order(uuid, text, friend_exchange.order_side, numeric, numeric, text) to authenticated;
grant execute on function friend_exchange.complete_round(uuid) to authenticated;
grant execute on function friend_exchange.room_snapshot(uuid) to authenticated;

revoke all on function friend_exchange.apply_round_settlement(uuid, jsonb, jsonb, text, jsonb)
from public, anon, authenticated;
grant execute on function friend_exchange.apply_round_settlement(uuid, jsonb, jsonb, text, jsonb)
to service_role;

grant all privileges on all tables in schema friend_exchange to service_role;
grant all privileges on all sequences in schema friend_exchange to service_role;
grant execute on all routines in schema friend_exchange to service_role;

create policy friend_exchange_realtime_receive
on realtime.messages
for select to authenticated
using (
  split_part(realtime.topic(), ':', 1) = 'room'
  and friend_exchange.is_room_member(split_part(realtime.topic(), ':', 2)::uuid)
  and realtime.messages.extension in ('broadcast', 'presence')
);

create policy friend_exchange_realtime_send
on realtime.messages
for insert to authenticated
with check (
  split_part(realtime.topic(), ':', 1) = 'room'
  and friend_exchange.is_room_member(split_part(realtime.topic(), ':', 2)::uuid)
  and realtime.messages.extension = 'presence'
);

create or replace function friend_exchange.broadcast_room_change()
returns trigger
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  room_id_value uuid;
  payload jsonb;
begin
  if tg_table_name = 'rounds' then
    room_id_value := friend_exchange.room_for_session(coalesce(new.session_id, old.session_id));
  elsif tg_table_name = 'friend_assets' then
    room_id_value := friend_exchange.room_for_session(coalesce(new.session_id, old.session_id));
  elsif tg_table_name = 'room_members' then
    room_id_value := coalesce(new.room_id, old.room_id);
  elsif tg_table_name = 'paper_trades' then
    select s.room_id into room_id_value
    from friend_exchange.portfolios p
    join friend_exchange.sessions s on s.id = p.session_id
    where p.id = coalesce(new.portfolio_id, old.portfolio_id);
  end if;

  if room_id_value is null then return coalesce(new, old); end if;

  payload := jsonb_build_object(
    'table', tg_table_name,
    'operation', tg_op,
    'record', case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end
  );

  perform realtime.send(
    payload,
    tg_table_name || '_' || lower(tg_op),
    'room:' || room_id_value::text || ':public',
    true
  );

  return coalesce(new, old);
end;
$$;

create trigger friend_exchange_round_broadcast
after insert or update or delete on friend_exchange.rounds
for each row execute function friend_exchange.broadcast_room_change();

create trigger friend_exchange_asset_broadcast
after insert or update or delete on friend_exchange.friend_assets
for each row execute function friend_exchange.broadcast_room_change();

create trigger friend_exchange_member_broadcast
after insert or delete on friend_exchange.room_members
for each row execute function friend_exchange.broadcast_room_change();

create trigger friend_exchange_member_update_broadcast
after update on friend_exchange.room_members
for each row
when (
  old.role is distinct from new.role
  or old.ready is distinct from new.ready
  or old.connected is distinct from new.connected
  or old.seat is distinct from new.seat
)
execute function friend_exchange.broadcast_room_change();

create trigger friend_exchange_trade_broadcast
after insert on friend_exchange.paper_trades
for each row execute function friend_exchange.broadcast_room_change();

notify pgrst, 'reload schema';
