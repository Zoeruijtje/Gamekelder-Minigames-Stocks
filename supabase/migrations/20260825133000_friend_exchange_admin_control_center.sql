-- Friend Exchange administrator control center and safe room lifecycle.
--
-- Public clients receive only sanitized game configuration through
-- public_app_config(). All writes require an authenticated administrator role,
-- and the first owner can be created exactly once through a rate-limited Edge
-- Function using the high-entropy bootstrap token whose SHA-256 digest is
-- stored below. No privileged Supabase credential is exposed to the browser.

create table friend_exchange.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table friend_exchange.app_settings (
  key text primary key check (key = 'global'),
  settings jsonb not null,
  version bigint not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table friend_exchange.game_definitions (
  id text primary key,
  enabled boolean not null default true,
  name text not null check (char_length(name) between 1 and 80),
  category text not null check (category in ('reaction','precision','memory','estimation','knowledge','strategy','prediction')),
  description text not null check (char_length(description) between 1 and 500),
  instructions text not null check (char_length(instructions) between 1 and 800),
  duration_seconds integer not null check (duration_seconds between 5 and 180),
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table friend_exchange.game_content (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references friend_exchange.game_definitions(id) on delete cascade,
  content_type text not null check (content_type in ('question', 'comparison', 'prompt', 'pattern')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table friend_exchange.admin_bootstrap_state (
  id text primary key check (id = 'owner'),
  token_sha256 text not null check (token_sha256 ~ '^[0-9a-f]{64}$'),
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index friend_exchange_game_content_game_idx
  on friend_exchange.game_content(game_id, content_type, active, sort_order);
create index friend_exchange_app_admins_active_idx
  on friend_exchange.app_admins(active, role);

alter table friend_exchange.app_admins enable row level security;
alter table friend_exchange.app_settings enable row level security;
alter table friend_exchange.game_definitions enable row level security;
alter table friend_exchange.game_content enable row level security;
alter table friend_exchange.admin_bootstrap_state enable row level security;

revoke all on friend_exchange.app_admins from public, anon, authenticated;
revoke all on friend_exchange.app_settings from public, anon, authenticated;
revoke all on friend_exchange.game_definitions from public, anon, authenticated;
revoke all on friend_exchange.game_content from public, anon, authenticated;
revoke all on friend_exchange.admin_bootstrap_state from public, anon, authenticated;

grant all privileges on friend_exchange.app_admins to service_role;
grant all privileges on friend_exchange.app_settings to service_role;
grant all privileges on friend_exchange.game_definitions to service_role;
grant all privileges on friend_exchange.game_content to service_role;
grant all privileges on friend_exchange.admin_bootstrap_state to service_role;

insert into friend_exchange.app_settings (key, settings)
values (
  'global',
  jsonb_build_object(
    'roundCount', 8,
    'startingFriendCash', 10000,
    'startingRealCash', 25000,
    'tradingSeconds', 35,
    'volatility', 'standard',
    'allowOwnStock', true,
    'playerLimit', 8
  )
)
on conflict (key) do nothing;

insert into friend_exchange.game_definitions (
  id, enabled, name, category, description, instructions,
  duration_seconds, config, sort_order
) values
  ('reaction', true, 'Reaction Test', 'reaction',
   'Wait for the signal and react. False starts are heavily penalized.',
   'Press ARM. When the panel changes to GO, tap immediately.',
   20, '{"delayMinMs":1200,"delayMaxMs":3700,"targetTrials":1}'::jsonb, 10),
  ('stop-clock', true, 'Stop the Clock', 'precision',
   'Stop as close as possible to exactly 5.000 seconds.',
   'Start the hidden timer, count internally, then press STOP.',
   20, '{"targetMs":5000}'::jsonb, 20),
  ('memory-grid', true, 'Memory Grid', 'memory',
   'Memorize the highlighted cells, then reproduce the pattern.',
   'Study the grid. When it goes dark, select every remembered cell.',
   35, '{"size":16,"revealMs":2200}'::jsonb, 30),
  ('closest-wins', true, 'Closest Wins', 'estimation',
   'Estimate the answer. Percentage error decides the winner.',
   'Enter one numeric estimate. Answers remain hidden until reveal.',
   30, '{}'::jsonb, 40),
  ('higher-lower', true, 'Higher / Lower', 'knowledge',
   'Decide whether the right-hand value is higher or lower.',
   'Complete five comparisons. Accuracy matters more than speed.',
   35, '{"pairCount":5}'::jsonb, 50),
  ('minority-rules', true, 'Minority Rules', 'strategy',
   'Choose A or B. Only the smaller group wins.',
   'Choose privately. A perfect tie gives everyone a neutral score.',
   25, '{}'::jsonb, 60),
  ('prisoners-dilemma', true, 'Prisoner''s Dilemma', 'strategy',
   'Cooperate or betray. Your payout depends on the room.',
   'Choose privately. Trust can pay, but betrayal can pay more.',
   30, '{"matrix":{"CC":3,"BC":5,"CB":0,"BB":1}}'::jsonb, 70),
  ('prediction-desk', true, 'Prediction Desk', 'prediction',
   'Predict which company will outperform its expectation.',
   'Back one player. The surprise performer wins the desk.',
   25, '{}'::jsonb, 80)
on conflict (id) do nothing;

insert into friend_exchange.game_content (game_id, content_type, payload, sort_order) values
  ('closest-wins', 'question', '{"prompt":"How many kilometres of blood vessels are in an adult human body?","answer":100000,"unit":"km"}', 10),
  ('closest-wins', 'question', '{"prompt":"How many keys are on a standard modern piano?","answer":88,"unit":"keys"}', 20),
  ('closest-wins', 'question', '{"prompt":"How many minutes are there in a non-leap year?","answer":525600,"unit":"minutes"}', 30),
  ('closest-wins', 'question', '{"prompt":"Approximately how high is Mount Everest?","answer":8849,"unit":"m"}', 40),
  ('closest-wins', 'question', '{"prompt":"How many squares are on a chessboard?","answer":64,"unit":"squares"}', 50),
  ('closest-wins', 'question', '{"prompt":"How many bones are in the adult human body?","answer":206,"unit":"bones"}', 60),
  ('closest-wins', 'question', '{"prompt":"How many countries are members of the United Nations?","answer":193,"unit":"countries"}', 70),
  ('closest-wins', 'question', '{"prompt":"How many seconds are in 24 hours?","answer":86400,"unit":"seconds"}', 80),
  ('higher-lower', 'comparison', '{"left":["Eiffel Tower height",330],"right":["Shard height",310],"unit":"m"}', 10),
  ('higher-lower', 'comparison', '{"left":["Earth diameter",12742],"right":["Mars diameter",6779],"unit":"km"}', 20),
  ('higher-lower', 'comparison', '{"left":["Piano keys",88],"right":["Periodic table elements",118],"unit":""}', 30),
  ('higher-lower', 'comparison', '{"left":["Standard marathon",42.195],"right":["English Channel narrowest point",33.3],"unit":"km"}', 40),
  ('higher-lower', 'comparison', '{"left":["Human bones",206],"right":["Countries in the UN",193],"unit":""}', 50),
  ('higher-lower', 'comparison', '{"left":["Burj Khalifa height",828],"right":["One World Trade Center height",541],"unit":"m"}', 60),
  ('higher-lower', 'comparison', '{"left":["Minutes in a day",1440],"right":["Pages in War and Peace (approx.)",1225],"unit":""}', 70),
  ('higher-lower', 'comparison', '{"left":["Moon diameter",3475],"right":["Australia east-to-west",4000],"unit":"km"}', 80),
  ('minority-rules', 'prompt', '{"choices":["Take the lift","Take the stairs"]}', 10),
  ('minority-rules', 'prompt', '{"choices":["Risk the mystery box","Bank the safe reward"]}', 20),
  ('minority-rules', 'prompt', '{"choices":["Morning person","Night person"]}', 30),
  ('minority-rules', 'prompt', '{"choices":["Choose certainty","Choose chaos"]}', 40),
  ('memory-grid', 'pattern', '{"cells":[0,2,5,10,15]}', 10),
  ('memory-grid', 'pattern', '{"cells":[1,4,6,9,14]}', 20),
  ('memory-grid', 'pattern', '{"cells":[3,5,8,11,12]}', 30),
  ('memory-grid', 'pattern', '{"cells":[0,7,9,13,15]}', 40),
  ('memory-grid', 'pattern', '{"cells":[2,4,8,10,14]}', 50);

-- SHA-256 of the one-time high-entropy bootstrap token. The plaintext token is
-- delivered privately to the project owner and is never committed.
insert into friend_exchange.admin_bootstrap_state (id, token_sha256)
values ('owner', 'db9b841bf1b9f2c96289fba89bbfec91aeccd815089ab5ced90b006872b36e1b')
on conflict (id) do nothing;

create or replace function friend_exchange.admin_role_rank(p_role text)
returns integer
language sql
immutable
set search_path = pg_catalog
as $$
  select case p_role
    when 'owner' then 3
    when 'admin' then 2
    when 'editor' then 1
    else 0
  end;
$$;

create or replace function friend_exchange.is_app_admin(
  p_user_id uuid default auth.uid(),
  p_required_role text default 'editor'
)
returns boolean
language sql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
  select exists (
    select 1
    from friend_exchange.app_admins a
    where a.user_id = p_user_id
      and a.active
      and friend_exchange.admin_role_rank(a.role)
          >= friend_exchange.admin_role_rank(p_required_role)
  );
$$;

create or replace function friend_exchange.public_app_config()
returns jsonb
language sql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
  select jsonb_build_object(
    'version', coalesce((select version from friend_exchange.app_settings where key = 'global'), 1),
    'default_settings', coalesce((select settings from friend_exchange.app_settings where key = 'global'), '{}'::jsonb),
    'games', coalesce((
      select jsonb_agg(to_jsonb(g) - 'updated_by' order by g.sort_order, g.id)
      from friend_exchange.game_definitions g
    ), '[]'::jsonb),
    'content', coalesce((
      select jsonb_agg(to_jsonb(c) - 'updated_by' order by c.game_id, c.content_type, c.sort_order, c.id)
      from friend_exchange.game_content c
      where c.active
    ), '[]'::jsonb),
    'server_time', now()
  );
$$;

create or replace function friend_exchange.validate_admin_settings(p_settings jsonb)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  round_count integer;
  trading_seconds integer;
  friend_cash numeric;
  real_cash numeric;
  volatility text;
  allow_own boolean;
  player_limit integer;
begin
  if p_settings is null or jsonb_typeof(p_settings) <> 'object' then
    raise exception 'Settings must be a JSON object';
  end if;

  round_count := coalesce((p_settings ->> 'roundCount')::integer, 8);
  trading_seconds := coalesce((p_settings ->> 'tradingSeconds')::integer, 35);
  friend_cash := coalesce((p_settings ->> 'startingFriendCash')::numeric, 10000);
  real_cash := coalesce((p_settings ->> 'startingRealCash')::numeric, 25000);
  volatility := coalesce(nullif(p_settings ->> 'volatility', ''), 'standard');
  allow_own := coalesce((p_settings ->> 'allowOwnStock')::boolean, true);
  player_limit := coalesce((p_settings ->> 'playerLimit')::integer, 8);

  if round_count not between 3 and 12 then raise exception 'Round count must be between 3 and 12'; end if;
  if trading_seconds not between 15 and 90 then raise exception 'Trading time must be between 15 and 90 seconds'; end if;
  if friend_cash not between 1000 and 1000000 then raise exception 'Friend Market cash is outside the allowed range'; end if;
  if real_cash not between 1000 and 1000000 then raise exception 'Real paper-market cash is outside the allowed range'; end if;
  if volatility not in ('calm', 'standard', 'chaos') then raise exception 'Invalid volatility mode'; end if;
  if player_limit not between 2 and 10 then raise exception 'Player limit must be between 2 and 10'; end if;

  return jsonb_build_object(
    'roundCount', round_count,
    'tradingSeconds', trading_seconds,
    'startingFriendCash', friend_cash,
    'startingRealCash', real_cash,
    'volatility', volatility,
    'allowOwnStock', allow_own,
    'playerLimit', player_limit
  );
end;
$$;

create or replace function friend_exchange.validate_game_content(
  p_game_id text,
  p_content_type text,
  p_payload jsonb
)
returns void
language plpgsql
immutable
set search_path = pg_catalog
as $$
declare
  invalid_cell boolean;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Content payload must be a JSON object';
  end if;

  if p_content_type = 'question' then
    if p_game_id <> 'closest-wins'
       or jsonb_typeof(p_payload -> 'prompt') <> 'string'
       or nullif(trim(p_payload ->> 'prompt'), '') is null
       or jsonb_typeof(p_payload -> 'answer') <> 'number' then
      raise exception 'Questions require closest-wins, a prompt and a numeric answer';
    end if;
  elsif p_content_type = 'comparison' then
    if p_game_id <> 'higher-lower'
       or jsonb_typeof(p_payload -> 'left') <> 'array'
       or jsonb_typeof(p_payload -> 'right') <> 'array'
       or jsonb_array_length(p_payload -> 'left') < 2
       or jsonb_array_length(p_payload -> 'right') < 2
       or jsonb_typeof(p_payload -> 'left' -> 0) <> 'string'
       or jsonb_typeof(p_payload -> 'right' -> 0) <> 'string'
       or jsonb_typeof(p_payload -> 'left' -> 1) <> 'number'
       or jsonb_typeof(p_payload -> 'right' -> 1) <> 'number' then
      raise exception 'Comparisons require higher-lower and two labelled numeric values';
    end if;
  elsif p_content_type = 'prompt' then
    if p_game_id <> 'minority-rules'
       or jsonb_typeof(p_payload -> 'choices') <> 'array'
       or jsonb_array_length(p_payload -> 'choices') <> 2
       or jsonb_typeof(p_payload -> 'choices' -> 0) <> 'string'
       or jsonb_typeof(p_payload -> 'choices' -> 1) <> 'string' then
      raise exception 'Prompts require minority-rules and exactly two text choices';
    end if;
  elsif p_content_type = 'pattern' then
    if p_game_id <> 'memory-grid'
       or jsonb_typeof(p_payload -> 'cells') <> 'array'
       or jsonb_array_length(p_payload -> 'cells') not between 1 and 36 then
      raise exception 'Patterns require memory-grid and between 1 and 36 cells';
    end if;
    select exists (
      select 1
      from jsonb_array_elements(p_payload -> 'cells') item(value)
      where jsonb_typeof(value) <> 'number'
         or (value::text)::numeric <> trunc((value::text)::numeric)
         or (value::text)::numeric < 0
         or (value::text)::numeric > 35
    ) into invalid_cell;
    if invalid_cell then raise exception 'Pattern cells must be unique non-negative integers below 36'; end if;
    if jsonb_array_length(p_payload -> 'cells') <> (
      select count(distinct value::text)
      from jsonb_array_elements(p_payload -> 'cells') item(value)
    ) then raise exception 'Pattern cells must be unique'; end if;
  else
    raise exception 'Unsupported content type';
  end if;
end;
$$;

create or replace function friend_exchange.admin_bootstrap_owner(
  p_user_id uuid,
  p_token text
)
returns jsonb
language plpgsql
security definer
set search_path = friend_exchange, auth, pg_catalog, extensions
as $$
declare
  bootstrap friend_exchange.admin_bootstrap_state;
  target_user auth.users;
begin
  perform pg_advisory_xact_lock(hashtext('friend_exchange_admin_bootstrap_owner'));

  select * into bootstrap
  from friend_exchange.admin_bootstrap_state
  where id = 'owner'
  for update;

  if bootstrap.id is null
     or bootstrap.consumed_at is not null
     or exists (select 1 from friend_exchange.app_admins where active) then
    raise exception 'Administrator bootstrap is unavailable';
  end if;

  if encode(digest(coalesce(p_token, ''), 'sha256'), 'hex') <> bootstrap.token_sha256 then
    raise exception 'Administrator bootstrap is unavailable';
  end if;

  select * into target_user from auth.users where id = p_user_id for update;
  if target_user.id is null
     or target_user.email is null
     or coalesce(target_user.is_anonymous, false) then
    raise exception 'A permanent email account is required';
  end if;

  insert into friend_exchange.app_admins (user_id, role, active, created_by)
  values (p_user_id, 'owner', true, p_user_id);

  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object('friend_exchange_role', 'owner')
  where id = p_user_id;

  update friend_exchange.admin_bootstrap_state
  set consumed_at = now(), consumed_by = p_user_id
  where id = 'owner';

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (null, null, 'admin.bootstrap.owner', jsonb_build_object('admin_user_id', p_user_id));

  return jsonb_build_object('user_id', p_user_id, 'role', 'owner', 'created_at', now());
end;
$$;

create or replace function friend_exchange.admin_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = friend_exchange, auth, pg_catalog
as $$
declare
  admin_row friend_exchange.app_admins;
begin
  select * into admin_row
  from friend_exchange.app_admins
  where user_id = auth.uid() and active;

  if admin_row.user_id is null then raise exception 'Administrator role required'; end if;

  return jsonb_build_object(
    'admin', jsonb_build_object(
      'user_id', admin_row.user_id,
      'role', admin_row.role,
      'email', (select email from auth.users where id = admin_row.user_id)
    ),
    'settings', coalesce((select settings from friend_exchange.app_settings where key = 'global'), '{}'::jsonb),
    'games', coalesce((
      select jsonb_agg(to_jsonb(g) order by g.sort_order, g.id)
      from friend_exchange.game_definitions g
    ), '[]'::jsonb),
    'content', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.game_id, c.content_type, c.sort_order, c.id)
      from friend_exchange.game_content c
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(to_jsonb(room_summary) order by room_summary.updated_at desc)
      from (
        select
          r.id,
          r.code,
          r.name,
          r.status,
          r.host_id,
          r.updated_at,
          r.expires_at,
          rd.game_type as current_game,
          rd.status as current_phase,
          (select count(*) from friend_exchange.room_members rm where rm.room_id = r.id) as member_count,
          (select count(*) from friend_exchange.room_members rm where rm.room_id = r.id and rm.connected) as connected_count
        from friend_exchange.rooms r
        left join friend_exchange.rounds rd on rd.id = r.current_round_id
        where r.status <> 'archived' or r.updated_at > now() - interval '24 hours'
        order by r.updated_at desc
        limit 100
      ) room_summary
    ), '[]'::jsonb),
    'audit', coalesce((
      select jsonb_agg(to_jsonb(recent_audit) order by recent_audit.created_at desc)
      from (
        select id, room_id, event_type, payload, created_at
        from friend_exchange.audit_events
        where event_type like 'admin.%'
           or event_type in ('room.admin_archived', 'room.host_returned_to_lobby')
        order by created_at desc
        limit 100
      ) recent_audit
    ), '[]'::jsonb),
    'server_time', now()
  );
end;
$$;

create or replace function friend_exchange.admin_update_global_settings(p_settings jsonb)
returns jsonb
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  validated jsonb;
  updated friend_exchange.app_settings;
begin
  if not friend_exchange.is_app_admin(auth.uid(), 'admin') then
    raise exception 'Administrator role required';
  end if;

  validated := friend_exchange.validate_admin_settings(p_settings);
  insert into friend_exchange.app_settings (key, settings, updated_by)
  values ('global', validated, auth.uid())
  on conflict (key) do update
    set settings = excluded.settings,
        version = friend_exchange.app_settings.version + 1,
        updated_by = auth.uid(),
        updated_at = now()
  returning * into updated;

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (null, null, 'admin.settings.updated', jsonb_build_object(
    'admin_user_id', auth.uid(),
    'version', updated.version,
    'settings', validated
  ));

  return to_jsonb(updated);
end;
$$;

create or replace function friend_exchange.admin_update_game_definition(
  p_game_id text,
  p_enabled boolean,
  p_name text,
  p_description text,
  p_instructions text,
  p_duration_seconds integer,
  p_config jsonb default '{}'::jsonb
)
returns friend_exchange.game_definitions
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  updated friend_exchange.game_definitions;
begin
  if not friend_exchange.is_app_admin(auth.uid(), 'editor') then
    raise exception 'Administrator role required';
  end if;
  if p_config is null or jsonb_typeof(p_config) <> 'object' then raise exception 'Game configuration must be a JSON object'; end if;
  if p_duration_seconds not between 5 and 180 then raise exception 'Game deadline must be between 5 and 180 seconds'; end if;

  update friend_exchange.game_definitions
  set enabled = p_enabled,
      name = substr(trim(p_name), 1, 80),
      description = substr(trim(p_description), 1, 500),
      instructions = substr(trim(p_instructions), 1, 800),
      duration_seconds = p_duration_seconds,
      config = p_config,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_game_id
  returning * into updated;

  if updated.id is null then raise exception 'Unknown game'; end if;
  if nullif(updated.name, '') is null or nullif(updated.description, '') is null or nullif(updated.instructions, '') is null then
    raise exception 'Game name, description and instructions are required';
  end if;

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (null, null, 'admin.game.updated', jsonb_build_object(
    'admin_user_id', auth.uid(),
    'game_id', p_game_id,
    'enabled', p_enabled
  ));

  return updated;
end;
$$;

create or replace function friend_exchange.admin_upsert_game_content(
  p_id uuid,
  p_game_id text,
  p_content_type text,
  p_payload jsonb,
  p_active boolean default true,
  p_sort_order integer default 0
)
returns friend_exchange.game_content
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  updated friend_exchange.game_content;
begin
  if not friend_exchange.is_app_admin(auth.uid(), 'editor') then
    raise exception 'Administrator role required';
  end if;
  if not exists (select 1 from friend_exchange.game_definitions where id = p_game_id) then
    raise exception 'Unknown game';
  end if;
  perform friend_exchange.validate_game_content(p_game_id, p_content_type, p_payload);

  if p_id is null then
    insert into friend_exchange.game_content (
      game_id, content_type, payload, active, sort_order, updated_by
    ) values (
      p_game_id, p_content_type, p_payload, p_active, p_sort_order, auth.uid()
    ) returning * into updated;
  else
    update friend_exchange.game_content
    set game_id = p_game_id,
        content_type = p_content_type,
        payload = p_payload,
        active = p_active,
        sort_order = p_sort_order,
        updated_by = auth.uid(),
        updated_at = now()
    where id = p_id
    returning * into updated;
    if updated.id is null then raise exception 'Content item not found'; end if;
  end if;

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (null, null, 'admin.content.saved', jsonb_build_object(
    'admin_user_id', auth.uid(),
    'content_id', updated.id,
    'game_id', updated.game_id,
    'content_type', updated.content_type
  ));

  return updated;
end;
$$;

create or replace function friend_exchange.admin_delete_game_content(p_id uuid)
returns void
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  deleted friend_exchange.game_content;
begin
  if not friend_exchange.is_app_admin(auth.uid(), 'editor') then
    raise exception 'Administrator role required';
  end if;

  delete from friend_exchange.game_content where id = p_id returning * into deleted;
  if deleted.id is null then raise exception 'Content item not found'; end if;

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (null, null, 'admin.content.deleted', jsonb_build_object(
    'admin_user_id', auth.uid(),
    'content_id', deleted.id,
    'game_id', deleted.game_id,
    'content_type', deleted.content_type
  ));
end;
$$;

create or replace function friend_exchange.host_return_room_to_lobby(p_room_id uuid)
returns friend_exchange.rooms
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  room_row friend_exchange.rooms;
  session_id_value uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not friend_exchange.is_room_host(p_room_id) then raise exception 'Host permission required'; end if;

  select * into room_row from friend_exchange.rooms where id = p_room_id for update;
  if room_row.id is null or room_row.status = 'archived' then raise exception 'Room is unavailable'; end if;
  session_id_value := room_row.current_session_id;

  if session_id_value is not null then
    update friend_exchange.rounds
    set status = 'complete',
        settled_at = coalesce(settled_at, now()),
        version = version + 1
    where session_id = session_id_value and status <> 'complete';

    update friend_exchange.sessions
    set status = 'complete', completed_at = coalesce(completed_at, now())
    where id = session_id_value;
  end if;

  update friend_exchange.room_members
  set ready = false, last_seen_at = case when user_id = auth.uid() then now() else last_seen_at end
  where room_id = p_room_id;

  update friend_exchange.rooms
  set status = 'lobby',
      current_session_id = null,
      current_round_id = null,
      version = version + 1,
      updated_at = now(),
      expires_at = now() + interval '12 hours'
  where id = p_room_id
  returning * into room_row;

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (p_room_id, auth.uid(), 'room.host_returned_to_lobby', jsonb_build_object(
    'previous_session_id', session_id_value
  ));

  return room_row;
end;
$$;

create or replace function friend_exchange.leave_room(p_room_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  membership friend_exchange.room_members;
  room_row friend_exchange.rooms;
  successor uuid;
  remaining_connected integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select * into membership
  from friend_exchange.room_members
  where room_id = p_room_id and user_id = auth.uid()
  for update;
  if membership.user_id is null then return jsonb_build_object('left', false, 'reason', 'not-a-member'); end if;

  select * into room_row from friend_exchange.rooms where id = p_room_id for update;

  update friend_exchange.room_members
  set connected = false, ready = false, last_seen_at = now()
  where room_id = p_room_id and user_id = auth.uid();

  if room_row.host_id = auth.uid() then
    select user_id into successor
    from friend_exchange.room_members
    where room_id = p_room_id
      and user_id <> auth.uid()
      and connected
      and role <> 'spectator'
    order by case role when 'cohost' then 0 else 1 end, joined_at
    limit 1;

    if successor is not null then
      update friend_exchange.room_members set role = 'player'
      where room_id = p_room_id and user_id = auth.uid();
      update friend_exchange.room_members set role = 'host'
      where room_id = p_room_id and user_id = successor;
      update friend_exchange.rooms
      set host_id = successor, version = version + 1, updated_at = now()
      where id = p_room_id;
    end if;
  end if;

  select count(*) into remaining_connected
  from friend_exchange.room_members
  where room_id = p_room_id and connected;

  if remaining_connected = 0 then
    update friend_exchange.rooms
    set status = 'archived', expires_at = now(), version = version + 1, updated_at = now()
    where id = p_room_id;
  end if;

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (p_room_id, auth.uid(), 'room.member_left', jsonb_build_object(
    'new_host_id', successor,
    'remaining_connected', remaining_connected
  ));

  return jsonb_build_object(
    'left', true,
    'new_host_id', successor,
    'room_archived', remaining_connected = 0
  );
end;
$$;

create or replace function friend_exchange.admin_close_room(
  p_room_id uuid,
  p_reason text default 'Closed by site administrator'
)
returns friend_exchange.rooms
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  room_row friend_exchange.rooms;
  session_id_value uuid;
begin
  if not friend_exchange.is_app_admin(auth.uid(), 'admin') then
    raise exception 'Administrator role required';
  end if;

  select * into room_row from friend_exchange.rooms where id = p_room_id for update;
  if room_row.id is null then raise exception 'Room not found'; end if;
  if room_row.status = 'archived' then return room_row; end if;
  session_id_value := room_row.current_session_id;

  if session_id_value is not null then
    update friend_exchange.rounds
    set status = 'complete', settled_at = coalesce(settled_at, now()), version = version + 1
    where session_id = session_id_value and status <> 'complete';
    update friend_exchange.sessions
    set status = 'complete', completed_at = coalesce(completed_at, now())
    where id = session_id_value;
  end if;

  update friend_exchange.room_members
  set connected = false, ready = false
  where room_id = p_room_id;

  update friend_exchange.rooms
  set status = 'archived',
      current_round_id = null,
      version = version + 1,
      updated_at = now(),
      expires_at = now()
  where id = p_room_id
  returning * into room_row;

  insert into friend_exchange.audit_events (room_id, actor_id, event_type, payload)
  values (p_room_id, null, 'room.admin_archived', jsonb_build_object(
    'admin_user_id', auth.uid(),
    'reason', substr(coalesce(p_reason, 'Closed by site administrator'), 1, 300)
  ));

  return room_row;
end;
$$;

-- Archived rooms must stop responding to reconnect snapshots and heartbeats.
alter function friend_exchange.room_snapshot(uuid)
  rename to room_snapshot_legacy_20260825_admin;
revoke all on function friend_exchange.room_snapshot_legacy_20260825_admin(uuid)
  from public, anon, authenticated;

create or replace function friend_exchange.room_snapshot(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = friend_exchange, pg_catalog
as $$
begin
  if exists (select 1 from friend_exchange.rooms where id = p_room_id and status = 'archived') then
    raise exception 'Room has been archived';
  end if;
  return friend_exchange.room_snapshot_legacy_20260825_admin(p_room_id);
end;
$$;

alter function friend_exchange.heartbeat_room(uuid)
  rename to heartbeat_room_legacy_20260825_admin;
revoke all on function friend_exchange.heartbeat_room_legacy_20260825_admin(uuid)
  from public, anon, authenticated;

create or replace function friend_exchange.heartbeat_room(p_room_id uuid)
returns friend_exchange.room_members
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
begin
  if exists (select 1 from friend_exchange.rooms where id = p_room_id and status = 'archived') then
    raise exception 'Room has been archived';
  end if;
  return friend_exchange.heartbeat_room_legacy_20260825_admin(p_room_id);
end;
$$;

-- Include direct room changes in private room broadcasts so every client sees
-- host transfers, lobby resets and administrative closure immediately.
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
  if tg_table_name = 'rooms' then
    room_id_value := coalesce(new.id, old.id);
  elsif tg_table_name = 'rounds' then
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

drop trigger if exists friend_exchange_room_broadcast on friend_exchange.rooms;
create trigger friend_exchange_room_broadcast
after update on friend_exchange.rooms
for each row execute function friend_exchange.broadcast_room_change();

-- The public function is the only anonymous entry point in this schema.
grant usage on schema friend_exchange to anon;

revoke all on function friend_exchange.admin_role_rank(text) from public, anon, authenticated;
revoke all on function friend_exchange.is_app_admin(uuid, text) from public, anon, authenticated;
revoke all on function friend_exchange.validate_admin_settings(jsonb) from public, anon, authenticated;
revoke all on function friend_exchange.validate_game_content(text, text, jsonb) from public, anon, authenticated;
revoke all on function friend_exchange.admin_bootstrap_owner(uuid, text) from public, anon, authenticated;
revoke all on function friend_exchange.public_app_config() from public;
revoke all on function friend_exchange.admin_snapshot() from public, anon;
revoke all on function friend_exchange.admin_update_global_settings(jsonb) from public, anon;
revoke all on function friend_exchange.admin_update_game_definition(text, boolean, text, text, text, integer, jsonb) from public, anon;
revoke all on function friend_exchange.admin_upsert_game_content(uuid, text, text, jsonb, boolean, integer) from public, anon;
revoke all on function friend_exchange.admin_delete_game_content(uuid) from public, anon;
revoke all on function friend_exchange.admin_close_room(uuid, text) from public, anon;
revoke all on function friend_exchange.host_return_room_to_lobby(uuid) from public, anon;
revoke all on function friend_exchange.leave_room(uuid) from public, anon;
revoke all on function friend_exchange.room_snapshot(uuid) from public, anon;
revoke all on function friend_exchange.heartbeat_room(uuid) from public, anon;
revoke all on function friend_exchange.broadcast_room_change() from public, anon, authenticated;

grant execute on function friend_exchange.public_app_config() to anon, authenticated, service_role;
grant execute on function friend_exchange.admin_bootstrap_owner(uuid, text) to service_role;
grant execute on function friend_exchange.admin_snapshot() to authenticated;
grant execute on function friend_exchange.admin_update_global_settings(jsonb) to authenticated;
grant execute on function friend_exchange.admin_update_game_definition(text, boolean, text, text, text, integer, jsonb) to authenticated;
grant execute on function friend_exchange.admin_upsert_game_content(uuid, text, text, jsonb, boolean, integer) to authenticated;
grant execute on function friend_exchange.admin_delete_game_content(uuid) to authenticated;
grant execute on function friend_exchange.admin_close_room(uuid, text) to authenticated;
grant execute on function friend_exchange.host_return_room_to_lobby(uuid) to authenticated;
grant execute on function friend_exchange.leave_room(uuid) to authenticated;
grant execute on function friend_exchange.room_snapshot(uuid) to authenticated;
grant execute on function friend_exchange.heartbeat_room(uuid) to authenticated;

grant execute on function friend_exchange.admin_role_rank(text) to service_role;
grant execute on function friend_exchange.is_app_admin(uuid, text) to service_role;
grant execute on function friend_exchange.validate_admin_settings(jsonb) to service_role;
grant execute on function friend_exchange.validate_game_content(text, text, jsonb) to service_role;
grant execute on function friend_exchange.broadcast_room_change() to service_role;
grant execute on function friend_exchange.room_snapshot_legacy_20260825_admin(uuid) to service_role;
grant execute on function friend_exchange.heartbeat_room_legacy_20260825_admin(uuid) to service_role;

notify pgrst, 'reload schema';
