create or replace function friend_exchange.finish_online_session(p_session_id uuid)
returns friend_exchange.sessions
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  session_row friend_exchange.sessions;
begin
  select * into session_row
  from friend_exchange.sessions
  where id = p_session_id
  for update;

  if session_row.id is null then raise exception 'Session not found'; end if;
  if not friend_exchange.is_room_host(session_row.room_id) then
    raise exception 'Host permission required';
  end if;
  if exists (
    select 1 from friend_exchange.rounds
    where session_id = p_session_id and status <> 'complete'
  ) then
    raise exception 'Every opened round must be complete';
  end if;

  update friend_exchange.sessions
  set status = 'complete', completed_at = now()
  where id = p_session_id
  returning * into session_row;

  update friend_exchange.rooms
  set status = 'complete', version = version + 1, updated_at = now()
  where id = session_row.room_id;

  return session_row;
end;
$$;

revoke all on function friend_exchange.finish_online_session(uuid) from public, anon;
grant execute on function friend_exchange.finish_online_session(uuid) to authenticated;

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
), safe_rounds as (
  select
    rd.*,
    case
      when rd.status in ('results', 'complete') then rd.config
      when rd.game_type = 'prediction-desk' then rd.config - 'hiddenSignals'
      when rd.game_type = 'closest-wins' then
        jsonb_set(rd.config, '{question}', (rd.config -> 'question') - 'answer')
      when rd.game_type = 'higher-lower' then
        jsonb_set(
          rd.config,
          '{pairs}',
          coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'left', pair -> 'left',
                'right', jsonb_build_array((pair -> 'right') -> 0, null),
                'unit', pair -> 'unit'
              )
            )
            from jsonb_array_elements(rd.config -> 'pairs') pair
          ), '[]'::jsonb)
        )
      else rd.config
    end as safe_config
  from friend_exchange.rounds rd
  where rd.session_id = (select id from target_session)
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
        select jsonb_agg(
          (to_jsonb(sr) - 'config') || jsonb_build_object('config', sr.safe_config)
          order by sr.sequence
        )
        from safe_rounds sr
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

revoke all on function friend_exchange.room_snapshot(uuid) from public, anon;
grant execute on function friend_exchange.room_snapshot(uuid) to authenticated;

notify pgrst, 'reload schema';
