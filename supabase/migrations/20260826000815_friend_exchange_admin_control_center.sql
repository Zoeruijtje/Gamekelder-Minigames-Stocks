-- Login-only Friend Exchange administrator control center.
-- Administrator accounts are provisioned privately; no public bootstrap route exists.

create table if not exists friend_exchange.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor')),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists friend_exchange.app_settings (
  key text primary key check (key = 'global'),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  version bigint not null default 1 check (version > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists friend_exchange.game_definitions (
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

create table if not exists friend_exchange.game_content (
  id uuid primary key default gen_random_uuid(),
  game_id text not null references friend_exchange.game_definitions(id) on delete cascade,
  content_type text not null check (content_type in ('question','comparison','prompt','pattern')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  active boolean not null default true,
  sort_order integer not null default 0,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_admins_active_idx on friend_exchange.app_admins(active, role);
create index if not exists game_content_game_idx on friend_exchange.game_content(game_id, content_type, active, sort_order);

alter table friend_exchange.app_admins enable row level security;
alter table friend_exchange.app_admins force row level security;
alter table friend_exchange.app_settings enable row level security;
alter table friend_exchange.app_settings force row level security;
alter table friend_exchange.game_definitions enable row level security;
alter table friend_exchange.game_definitions force row level security;
alter table friend_exchange.game_content enable row level security;
alter table friend_exchange.game_content force row level security;

revoke all on friend_exchange.app_admins, friend_exchange.app_settings,
  friend_exchange.game_definitions, friend_exchange.game_content
  from public, anon, authenticated;
grant all privileges on friend_exchange.app_admins, friend_exchange.app_settings,
  friend_exchange.game_definitions, friend_exchange.game_content to service_role;

insert into friend_exchange.app_settings(key, settings)
values ('global', jsonb_build_object(
  'roundCount', 8,
  'startingFriendCash', 10000,
  'startingRealCash', 25000,
  'tradingSeconds', 35,
  'volatility', 'standard',
  'allowOwnStock', true,
  'playerLimit', 8
)) on conflict (key) do nothing;

insert into friend_exchange.game_definitions(id, enabled, name, category, description, instructions, duration_seconds, config, sort_order) values
  ('reaction',true,'Reaction Test','reaction','Wait for the signal and react. False starts are penalized.','Press ARM, wait for GO, then tap immediately.',20,'{"delayMinMs":1200,"delayMaxMs":3700}'::jsonb,10),
  ('stop-clock',true,'Stop the Clock','precision','Stop as close as possible to the target.','Start the hidden timer, count internally, then press STOP.',20,'{"targetMs":5000}'::jsonb,20),
  ('memory-grid',true,'Memory Grid','memory','Memorize highlighted cells, then reproduce the pattern.','Study the grid and select every remembered cell.',35,'{"size":16,"revealMs":2200}'::jsonb,30),
  ('closest-wins',true,'Closest Wins','estimation','Estimate the answer. Percentage error decides the winner.','Enter one numeric estimate. Answers stay private until reveal.',30,'{}'::jsonb,40),
  ('higher-lower',true,'Higher / Lower','knowledge','Decide whether the right-hand value is higher or lower.','Complete the comparisons. Accuracy matters more than speed.',35,'{"pairCount":5}'::jsonb,50),
  ('minority-rules',true,'Minority Rules','strategy','Choose A or B. The smaller group wins.','Choose privately. A tie produces a neutral score.',25,'{}'::jsonb,60),
  ('prisoners-dilemma',true,'Prisoner''s Dilemma','strategy','Cooperate or betray. Your payout depends on the other player.','Choose privately. Trust can pay, but betrayal can pay more.',30,'{"matrix":{"CC":3,"BC":5,"CB":0,"BB":1}}'::jsonb,70),
  ('prediction-desk',true,'Prediction Desk','prediction','Predict which company will outperform expectations.','Back one player before the performance reveal.',25,'{}'::jsonb,80)
on conflict (id) do nothing;

create or replace function friend_exchange.admin_role_rank(p_role text)
returns integer language sql immutable set search_path = pg_catalog as $$
  select case p_role when 'owner' then 3 when 'admin' then 2 when 'editor' then 1 else 0 end;
$$;

create or replace function friend_exchange.is_app_admin(p_user_id uuid default auth.uid(), p_required_role text default 'editor')
returns boolean language sql stable security definer set search_path = friend_exchange, pg_catalog as $$
  select exists (
    select 1 from friend_exchange.app_admins a
    where a.user_id = p_user_id and a.active
      and friend_exchange.admin_role_rank(a.role) >= friend_exchange.admin_role_rank(p_required_role)
  );
$$;

create or replace function friend_exchange.public_app_config()
returns jsonb language sql stable security definer set search_path = friend_exchange, pg_catalog as $$
  select jsonb_build_object(
    'version', coalesce((select version from friend_exchange.app_settings where key='global'),1),
    'default_settings', coalesce((select settings from friend_exchange.app_settings where key='global'),'{}'::jsonb),
    'games', coalesce((select jsonb_agg(to_jsonb(g)-'updated_by' order by g.sort_order,g.id) from friend_exchange.game_definitions g),'[]'::jsonb),
    'content', coalesce((select jsonb_agg(to_jsonb(c)-'updated_by' order by c.game_id,c.content_type,c.sort_order,c.id) from friend_exchange.game_content c where c.active),'[]'::jsonb),
    'server_time', now()
  );
$$;

create or replace function friend_exchange.admin_snapshot()
returns jsonb language plpgsql stable security definer set search_path = friend_exchange, pg_catalog as $$
declare admin_row friend_exchange.app_admins;
begin
  if auth.uid() is null or not friend_exchange.is_app_admin(auth.uid(),'editor') then raise exception 'Administrator access required'; end if;
  select * into admin_row from friend_exchange.app_admins where user_id=auth.uid() and active;
  return jsonb_build_object(
    'admin',to_jsonb(admin_row),
    'settings',coalesce((select settings from friend_exchange.app_settings where key='global'),'{}'::jsonb),
    'games',coalesce((select jsonb_agg(to_jsonb(g) order by g.sort_order,g.id) from friend_exchange.game_definitions g),'[]'::jsonb),
    'content',coalesce((select jsonb_agg(to_jsonb(c) order by c.game_id,c.sort_order,c.id) from friend_exchange.game_content c),'[]'::jsonb),
    'rooms',coalesce((select jsonb_agg(jsonb_build_object(
      'id',r.id,'code',r.code,'name',r.name,'status',r.status,'host_id',r.host_id,
      'current_session_id',r.current_session_id,'current_round_id',r.current_round_id,
      'connected_count',(select count(*) from friend_exchange.room_members rm where rm.room_id=r.id and rm.connected),
      'member_count',(select count(*) from friend_exchange.room_members rm where rm.room_id=r.id),
      'updated_at',r.updated_at,'expires_at',r.expires_at
    ) order by r.updated_at desc) from friend_exchange.rooms r where r.expires_at > now()-interval '7 days'),'[]'::jsonb),
    'audit',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select * from friend_exchange.audit_events order by created_at desc limit 100) a),'[]'::jsonb)
  );
end;
$$;

create or replace function friend_exchange.admin_update_global_settings(p_settings jsonb)
returns jsonb language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
declare saved jsonb;
begin
  if not friend_exchange.is_app_admin(auth.uid(),'admin') then raise exception 'Administrator permission required'; end if;
  if jsonb_typeof(p_settings)<>'object' then raise exception 'Settings must be an object'; end if;
  if coalesce((p_settings->>'roundCount')::integer,8) not between 3 and 20 then raise exception 'Round count out of range'; end if;
  if coalesce((p_settings->>'tradingSeconds')::integer,35) not between 10 and 90 then raise exception 'Trading time out of range'; end if;
  update friend_exchange.app_settings set settings=p_settings,version=version+1,updated_by=auth.uid(),updated_at=now() where key='global' returning settings into saved;
  return saved;
end;
$$;

create or replace function friend_exchange.admin_update_game_definition(
  p_game_id text,p_enabled boolean,p_name text,p_description text,p_instructions text,p_duration_seconds integer,p_config jsonb
)
returns friend_exchange.game_definitions language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
declare saved friend_exchange.game_definitions;
begin
  if not friend_exchange.is_app_admin(auth.uid(),'editor') then raise exception 'Editor permission required'; end if;
  update friend_exchange.game_definitions set enabled=p_enabled,name=substr(trim(p_name),1,80),description=substr(trim(p_description),1,500),instructions=substr(trim(p_instructions),1,800),duration_seconds=greatest(5,least(180,p_duration_seconds)),config=coalesce(p_config,'{}'::jsonb),updated_by=auth.uid(),updated_at=now() where id=p_game_id returning * into saved;
  if saved.id is null then raise exception 'Game definition not found'; end if;
  return saved;
end;
$$;

create or replace function friend_exchange.admin_upsert_game_content(
  p_id uuid,p_game_id text,p_content_type text,p_payload jsonb,p_active boolean,p_sort_order integer
)
returns friend_exchange.game_content language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
declare saved friend_exchange.game_content;
begin
  if not friend_exchange.is_app_admin(auth.uid(),'editor') then raise exception 'Editor permission required'; end if;
  if p_content_type not in ('question','comparison','prompt','pattern') or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid content'; end if;
  if p_id is null then
    insert into friend_exchange.game_content(game_id,content_type,payload,active,sort_order,updated_by) values(p_game_id,p_content_type,p_payload,p_active,p_sort_order,auth.uid()) returning * into saved;
  else
    update friend_exchange.game_content set game_id=p_game_id,content_type=p_content_type,payload=p_payload,active=p_active,sort_order=p_sort_order,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into saved;
  end if;
  return saved;
end;
$$;

create or replace function friend_exchange.admin_delete_game_content(p_id uuid)
returns boolean language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
begin
  if not friend_exchange.is_app_admin(auth.uid(),'editor') then raise exception 'Editor permission required'; end if;
  delete from friend_exchange.game_content where id=p_id;
  return found;
end;
$$;

create or replace function friend_exchange.host_return_room_to_lobby(p_room_id uuid)
returns friend_exchange.rooms language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
declare room_row friend_exchange.rooms; session_id_value uuid;
begin
  if not friend_exchange.is_room_host(p_room_id) then raise exception 'Only the room host can return to setup'; end if;
  select * into room_row from friend_exchange.rooms where id=p_room_id for update;
  if room_row.id is null then raise exception 'Room not found'; end if;
  session_id_value:=room_row.current_session_id;
  if session_id_value is not null then
    update friend_exchange.sessions set status='archived',completed_at=coalesce(completed_at,now()) where id=session_id_value;
    update friend_exchange.rounds set status='complete' where session_id=session_id_value and status<>'complete';
  end if;
  update friend_exchange.room_members set ready=false where room_id=p_room_id;
  update friend_exchange.rooms set status='lobby',current_session_id=null,current_round_id=null,version=version+1,updated_at=now(),expires_at=greatest(expires_at,now()+interval '12 hours') where id=p_room_id returning * into room_row;
  return room_row;
end;
$$;

create or replace function friend_exchange.leave_room(p_room_id uuid)
returns boolean language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update friend_exchange.room_members set connected=false,ready=false,last_seen_at=now() where room_id=p_room_id and user_id=auth.uid();
  return found;
end;
$$;

create or replace function friend_exchange.admin_close_room(p_room_id uuid,p_reason text default 'Closed by administrator')
returns friend_exchange.rooms language plpgsql security definer set search_path = friend_exchange, pg_catalog as $$
declare room_row friend_exchange.rooms;
begin
  if not friend_exchange.is_app_admin(auth.uid(),'admin') then raise exception 'Administrator permission required'; end if;
  update friend_exchange.room_members set connected=false,ready=false where room_id=p_room_id;
  update friend_exchange.rooms set status='archived',current_round_id=null,version=version+1,updated_at=now(),expires_at=now() where id=p_room_id returning * into room_row;
  insert into friend_exchange.audit_events(room_id,actor_id,event_type,payload) values(p_room_id,auth.uid(),'room.admin_archived',jsonb_build_object('reason',substr(coalesce(p_reason,'Closed by administrator'),1,300)));
  return room_row;
end;
$$;

revoke all on function friend_exchange.admin_role_rank(text) from public,anon,authenticated;
revoke all on function friend_exchange.is_app_admin(uuid,text) from public,anon,authenticated;
revoke all on function friend_exchange.public_app_config() from public;
revoke all on function friend_exchange.admin_snapshot() from public,anon;
revoke all on function friend_exchange.admin_update_global_settings(jsonb) from public,anon;
revoke all on function friend_exchange.admin_update_game_definition(text,boolean,text,text,text,integer,jsonb) from public,anon;
revoke all on function friend_exchange.admin_upsert_game_content(uuid,text,text,jsonb,boolean,integer) from public,anon;
revoke all on function friend_exchange.admin_delete_game_content(uuid) from public,anon;
revoke all on function friend_exchange.host_return_room_to_lobby(uuid) from public,anon;
revoke all on function friend_exchange.leave_room(uuid) from public,anon;
revoke all on function friend_exchange.admin_close_room(uuid,text) from public,anon;

grant execute on function friend_exchange.public_app_config() to anon,authenticated,service_role;
grant execute on function friend_exchange.admin_snapshot() to authenticated;
grant execute on function friend_exchange.admin_update_global_settings(jsonb) to authenticated;
grant execute on function friend_exchange.admin_update_game_definition(text,boolean,text,text,text,integer,jsonb) to authenticated;
grant execute on function friend_exchange.admin_upsert_game_content(uuid,text,text,jsonb,boolean,integer) to authenticated;
grant execute on function friend_exchange.admin_delete_game_content(uuid) to authenticated;
grant execute on function friend_exchange.host_return_room_to_lobby(uuid) to authenticated;
grant execute on function friend_exchange.leave_room(uuid) to authenticated;
grant execute on function friend_exchange.admin_close_room(uuid,text) to authenticated;
grant execute on function friend_exchange.admin_role_rank(text),friend_exchange.is_app_admin(uuid,text) to service_role;

notify pgrst,'reload schema';
