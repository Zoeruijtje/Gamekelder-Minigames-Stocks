create or replace function friend_exchange.random_room_code()
returns text
language plpgsql
volatile
set search_path = friend_exchange, pg_catalog
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  i integer;
begin
  loop
    candidate := '';
    for i in 1..6 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet) + 1)::integer, 1);
    end loop;
    exit when not exists (select 1 from friend_exchange.rooms where code = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function friend_exchange.room_for_session(p_session_id uuid)
returns uuid
language sql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$ select room_id from friend_exchange.sessions where id = p_session_id $$;

create or replace function friend_exchange.room_for_round(p_round_id uuid)
returns uuid
language sql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
  select s.room_id
  from friend_exchange.rounds r
  join friend_exchange.sessions s on s.id = r.session_id
  where r.id = p_round_id
$$;

create or replace function friend_exchange.is_room_member(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
  select exists (
    select 1 from friend_exchange.room_members
    where room_id = p_room_id and user_id = p_user_id
  )
$$;

create or replace function friend_exchange.is_room_host(
  p_room_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
  select exists (
    select 1 from friend_exchange.rooms
    where id = p_room_id and host_id = p_user_id
  ) or exists (
    select 1 from friend_exchange.room_members
    where room_id = p_room_id
      and user_id = p_user_id
      and role in ('host','cohost')
  )
$$;

create or replace function friend_exchange.ensure_profile(p_display_name text default null)
returns friend_exchange.profiles
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  base_name text;
  ticker_base text;
  generated_ticker text;
  profile_row friend_exchange.profiles;
  attempt integer := 0;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into profile_row
  from friend_exchange.profiles
  where id = auth.uid();

  if profile_row.id is not null then
    if nullif(trim(p_display_name), '') is not null
       and profile_row.display_name <> substr(trim(p_display_name), 1, 24) then
      update friend_exchange.profiles
      set display_name = substr(trim(p_display_name), 1, 24), updated_at = now()
      where id = auth.uid()
      returning * into profile_row;
    end if;
    return profile_row;
  end if;

  base_name := coalesce(
    nullif(trim(p_display_name), ''),
    nullif(auth.jwt() -> 'user_metadata' ->> 'display_name', ''),
    'Guest'
  );
  ticker_base := upper(regexp_replace(base_name, '[^A-Za-z0-9]', '', 'g'));
  ticker_base := coalesce(nullif(substr(ticker_base, 1, 4), ''), 'GST');
  generated_ticker := substr(ticker_base, 1, 5);

  while exists (
    select 1 from friend_exchange.profiles where upper(ticker) = generated_ticker
  ) loop
    attempt := attempt + 1;
    if attempt > 40 then raise exception 'Could not allocate a unique ticker'; end if;
    generated_ticker := upper(
      substr(ticker_base, 1, 3)
      || substr(replace(gen_random_uuid()::text, '-', ''), 1, 2)
    );
  end loop;

  insert into friend_exchange.profiles (id, display_name, ticker)
  values (auth.uid(), substr(base_name, 1, 24), generated_ticker)
  returning * into profile_row;

  insert into friend_exchange.game_ratings (user_id, category)
  select profile_row.id, category
  from unnest(array[
    'reaction','precision','memory','estimation','knowledge','strategy','prediction'
  ]) category
  on conflict do nothing;

  return profile_row;
end;
$$;

create or replace function friend_exchange.create_room(
  p_name text,
  p_settings jsonb default '{}'::jsonb
)
returns friend_exchange.rooms
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  created friend_exchange.rooms;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform friend_exchange.ensure_profile(null);

  insert into friend_exchange.rooms (code, host_id, name, settings)
  values (
    friend_exchange.random_room_code(),
    auth.uid(),
    coalesce(nullif(trim(p_name), ''), 'Market Night'),
    coalesce(p_settings, '{}'::jsonb)
  )
  returning * into created;

  insert into friend_exchange.room_members (room_id, user_id, seat, role)
  values (created.id, auth.uid(), 1, 'host');

  insert into friend_exchange.audit_events (room_id, actor_id, event_type)
  values (created.id, auth.uid(), 'room.created');

  return created;
end;
$$;

create or replace function friend_exchange.join_room(p_code text)
returns friend_exchange.rooms
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  target_room friend_exchange.rooms;
  existing friend_exchange.room_members;
  next_seat smallint;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  perform friend_exchange.ensure_profile(null);

  select * into target_room
  from friend_exchange.rooms
  where code = upper(trim(p_code)) and expires_at > now()
  for update;

  if target_room.id is null then raise exception 'Room not found or expired'; end if;

  select * into existing
  from friend_exchange.room_members
  where room_id = target_room.id and user_id = auth.uid();

  if existing.user_id is not null then
    update friend_exchange.room_members
    set connected = true, last_seen_at = now()
    where room_id = target_room.id and user_id = auth.uid();
    return target_room;
  end if;

  if target_room.status <> 'lobby' then
    raise exception 'Room is no longer accepting new players';
  end if;

  select coalesce(min(seat_candidate), 0)::smallint into next_seat
  from generate_series(1, 10) available_seats(seat_candidate)
  where not exists (
    select 1 from friend_exchange.room_members
    where room_id = target_room.id and seat = seat_candidate
  );

  if next_seat = 0 then raise exception 'Room is full'; end if;

  insert into friend_exchange.room_members (room_id, user_id, seat, role)
  values (target_room.id, auth.uid(), next_seat, 'player');

  insert into friend_exchange.audit_events (room_id, actor_id, event_type)
  values (target_room.id, auth.uid(), 'room.joined');

  return target_room;
end;
$$;

create or replace function friend_exchange.set_room_ready(
  p_room_id uuid,
  p_ready boolean
)
returns friend_exchange.room_members
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  membership friend_exchange.room_members;
begin
  update friend_exchange.room_members
  set ready = p_ready, connected = true, last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid()
  returning * into membership;

  if membership.user_id is null then raise exception 'Not a room member'; end if;
  return membership;
end;
$$;

create or replace function friend_exchange.heartbeat_room(p_room_id uuid)
returns friend_exchange.room_members
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  membership friend_exchange.room_members;
  room_row friend_exchange.rooms;
  host_member friend_exchange.room_members;
  successor uuid;
begin
  update friend_exchange.room_members
  set connected = true, last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid()
  returning * into membership;

  if membership.user_id is null then raise exception 'Not a room member'; end if;

  select * into room_row
  from friend_exchange.rooms
  where id = p_room_id
  for update;

  select * into host_member
  from friend_exchange.room_members
  where room_id = p_room_id and user_id = room_row.host_id;

  if host_member.user_id is null
     or not host_member.connected
     or host_member.last_seen_at < now() - interval '60 seconds' then
    select user_id into successor
    from friend_exchange.room_members
    where room_id = p_room_id
      and connected
      and role <> 'spectator'
      and last_seen_at >= now() - interval '60 seconds'
    order by
      case when user_id = auth.uid() then 0 else 1 end,
      case role when 'cohost' then 0 else 1 end,
      joined_at
    limit 1;

    if successor is not null and successor <> room_row.host_id then
      update friend_exchange.room_members
      set role = 'player'
      where room_id = p_room_id and role = 'host';

      update friend_exchange.room_members
      set role = 'host'
      where room_id = p_room_id and user_id = successor;

      update friend_exchange.rooms
      set host_id = successor, version = version + 1, updated_at = now()
      where id = p_room_id;
    end if;
  end if;

  select * into membership
  from friend_exchange.room_members
  where room_id = p_room_id and user_id = auth.uid();

  return membership;
end;
$$;

create or replace function friend_exchange.start_online_session(
  p_room_id uuid,
  p_settings jsonb,
  p_game_queue jsonb
)
returns friend_exchange.sessions
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  room_row friend_exchange.rooms;
  session_row friend_exchange.sessions;
  member_row record;
  round_count_value integer;
  starting_friend_cash numeric(18,2);
  member_count integer;
  price numeric(16,4);
begin
  if not friend_exchange.is_room_host(p_room_id) then
    raise exception 'Host permission required';
  end if;

  select * into room_row
  from friend_exchange.rooms
  where id = p_room_id
  for update;

  if room_row.id is null or room_row.status <> 'lobby' then
    raise exception 'Room is not in the lobby';
  end if;

  if jsonb_typeof(p_game_queue) <> 'array' then
    raise exception 'Game queue must be an array';
  end if;

  select count(*) into member_count
  from friend_exchange.room_members
  where room_id = p_room_id and connected and role <> 'spectator';

  if member_count < 2 then raise exception 'At least two connected players are required'; end if;

  if exists (
    select 1 from friend_exchange.room_members
    where room_id = p_room_id
      and connected
      and role <> 'spectator'
      and not ready
  ) then
    raise exception 'Every connected player must be ready';
  end if;

  round_count_value := greatest(
    3,
    least(20, coalesce((p_settings ->> 'roundCount')::integer, jsonb_array_length(p_game_queue)))
  );
  if jsonb_array_length(p_game_queue) < round_count_value then
    raise exception 'Game queue is too short';
  end if;

  starting_friend_cash := greatest(
    1000,
    least(1000000, coalesce((p_settings ->> 'startingFriendCash')::numeric, 10000))
  );

  insert into friend_exchange.sessions (
    room_id, status, settings, round_count, current_round_index, started_at
  )
  values (
    p_room_id,
    'active',
    p_settings || jsonb_build_object('gameQueue', p_game_queue),
    round_count_value,
    0,
    now()
  )
  returning * into session_row;

  for member_row in
    select rm.user_id, rm.seat, p.ticker
    from friend_exchange.room_members rm
    join friend_exchange.profiles p on p.id = rm.user_id
    where rm.room_id = p_room_id
      and rm.connected
      and rm.role <> 'spectator'
    order by rm.seat
  loop
    price := 80 + ((member_row.seat - 1) * 17)
      + (case when member_row.seat % 2 = 0 then 7 else 0 end);

    insert into friend_exchange.friend_assets (
      session_id, owner_id, symbol, price, open_price, previous_price
    )
    values (
      session_row.id, member_row.user_id, member_row.ticker, price, price, price
    );

    insert into friend_exchange.portfolios (owner_id, scope, session_id, cash)
    values (member_row.user_id, 'friend', session_row.id, starting_friend_cash);
  end loop;

  update friend_exchange.rooms
  set status = 'active',
      settings = p_settings,
      current_session_id = session_row.id,
      version = version + 1,
      updated_at = now()
  where id = p_room_id;

  update friend_exchange.room_members
  set ready = false
  where room_id = p_room_id;

  return session_row;
end;
$$;

create or replace function friend_exchange.create_online_round(
  p_session_id uuid,
  p_sequence integer,
  p_game_type text,
  p_category text,
  p_seed text,
  p_config jsonb,
  p_trading_seconds integer default 35
)
returns friend_exchange.rounds
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  session_row friend_exchange.sessions;
  round_row friend_exchange.rounds;
  previous_round friend_exchange.rounds;
  room_id_value uuid;
begin
  select * into session_row
  from friend_exchange.sessions
  where id = p_session_id
  for update;

  if session_row.id is null then raise exception 'Session not found'; end if;
  room_id_value := session_row.room_id;
  if not friend_exchange.is_room_host(room_id_value) then
    raise exception 'Host permission required';
  end if;

  select * into round_row
  from friend_exchange.rounds
  where session_id = p_session_id and sequence = p_sequence;
  if round_row.id is not null then return round_row; end if;

  if p_sequence > 0 then
    select * into previous_round
    from friend_exchange.rounds
    where session_id = p_session_id and sequence = p_sequence - 1;
    if previous_round.id is null or previous_round.status <> 'complete' then
      raise exception 'Previous round is not complete';
    end if;
  end if;

  insert into friend_exchange.rounds (
    session_id, sequence, game_type, category, status,
    seed, config, opened_at, locks_at
  )
  values (
    p_session_id,
    p_sequence,
    p_game_type,
    p_category,
    'trading',
    p_seed,
    coalesce(p_config, '{}'::jsonb),
    now(),
    now() + make_interval(secs => greatest(10, least(90, p_trading_seconds)))
  )
  returning * into round_row;

  update friend_exchange.rooms
  set current_round_id = round_row.id,
      version = version + 1,
      updated_at = now()
  where id = room_id_value;

  return round_row;
end;
$$;

create or replace function friend_exchange.transition_online_round(
  p_round_id uuid,
  p_expected_version bigint,
  p_next_status friend_exchange.round_status,
  p_duration_seconds integer default null
)
returns friend_exchange.rounds
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  round_row friend_exchange.rounds;
  room_id_value uuid;
  allowed boolean;
begin
  select * into round_row
  from friend_exchange.rounds
  where id = p_round_id
  for update;

  if round_row.id is null then raise exception 'Round not found'; end if;
  room_id_value := friend_exchange.room_for_round(p_round_id);
  if not friend_exchange.is_room_host(room_id_value) then
    raise exception 'Host permission required';
  end if;
  if round_row.version <> p_expected_version then
    raise exception 'Round version conflict';
  end if;

  allowed := case round_row.status
    when 'briefing' then p_next_status = 'trading'
    when 'trading' then p_next_status = 'locked'
    when 'locked' then p_next_status = 'game'
    when 'game' then p_next_status = 'settling'
    when 'settling' then p_next_status = 'results'
    when 'results' then p_next_status = 'complete'
    else false
  end;

  if not allowed then
    raise exception 'Invalid round transition % -> %', round_row.status, p_next_status;
  end if;

  update friend_exchange.rounds
  set status = p_next_status,
      locks_at = case
        when p_next_status = 'game' and p_duration_seconds is not null
          then now() + make_interval(secs => greatest(5, least(180, p_duration_seconds)))
        else locks_at
      end,
      version = version + 1
  where id = p_round_id
  returning * into round_row;

  return round_row;
end;
$$;

create or replace function friend_exchange.submit_round_input(
  p_round_id uuid,
  p_payload jsonb,
  p_client_nonce text
)
returns friend_exchange.round_submissions
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  target_round friend_exchange.rounds;
  submitted friend_exchange.round_submissions;
begin
  if nullif(trim(p_client_nonce), '') is null then raise exception 'Invalid nonce'; end if;

  select * into target_round
  from friend_exchange.rounds
  where id = p_round_id
  for update;

  if target_round.id is null
     or not friend_exchange.is_room_member(friend_exchange.room_for_round(p_round_id)) then
    raise exception 'Round unavailable';
  end if;
  if target_round.status <> 'game' then
    raise exception 'Round is not accepting submissions';
  end if;

  select * into submitted
  from friend_exchange.round_submissions
  where round_id = p_round_id and user_id = auth.uid();

  if submitted.user_id is not null then
    if submitted.client_nonce = p_client_nonce then return submitted; end if;
    raise exception 'Submission already locked';
  end if;

  insert into friend_exchange.round_submissions (
    round_id, user_id, payload, client_nonce
  )
  values (p_round_id, auth.uid(), p_payload, p_client_nonce)
  returning * into submitted;

  return submitted;
end;
$$;
