create schema if not exists friend_exchange;
grant usage on schema friend_exchange to anon, authenticated, service_role;
alter role authenticator set pgrst.db_schemas = 'public, storage, graphql_public, friend_exchange';
notify pgrst, 'reload config';

create extension if not exists pgcrypto;

create type friend_exchange.room_status as enum ('lobby', 'active', 'complete', 'archived');
create type friend_exchange.round_status as enum ('briefing', 'trading', 'locked', 'game', 'settling', 'results', 'complete');
create type friend_exchange.market_scope as enum ('real', 'friend');
create type friend_exchange.order_side as enum ('buy', 'sell');
create type friend_exchange.order_status as enum ('pending', 'filled', 'rejected', 'cancelled');

grant usage on type friend_exchange.room_status, friend_exchange.round_status,
  friend_exchange.market_scope, friend_exchange.order_side,
  friend_exchange.order_status to authenticated, service_role;

create table friend_exchange.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Guest' check (char_length(display_name) between 1 and 24),
  ticker text not null check (ticker ~ '^[A-Z0-9]{1,5}$'),
  avatar_color text not null default '#9a8f78',
  xp bigint not null default 0 check (xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index friend_exchange_profiles_ticker_unique
  on friend_exchange.profiles (upper(ticker));

create table friend_exchange.game_ratings (
  user_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  category text not null check (category in ('reaction','precision','memory','estimation','knowledge','strategy','prediction')),
  rating integer not null default 1000 check (rating between 600 and 1600),
  games_played integer not null default 0 check (games_played >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, category)
);

create table friend_exchange.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references friend_exchange.profiles(id),
  name text not null default 'Market Night' check (char_length(name) between 1 and 60),
  status friend_exchange.room_status not null default 'lobby',
  settings jsonb not null default '{}'::jsonb,
  current_session_id uuid,
  current_round_id uuid,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 hours')
);

create table friend_exchange.room_members (
  room_id uuid not null references friend_exchange.rooms(id) on delete cascade,
  user_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  seat smallint not null check (seat between 1 and 10),
  role text not null default 'player' check (role in ('host','cohost','player','spectator')),
  ready boolean not null default false,
  connected boolean not null default true,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key (room_id, user_id),
  unique (room_id, seat)
);

create table friend_exchange.sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references friend_exchange.rooms(id) on delete cascade,
  status friend_exchange.room_status not null default 'lobby',
  settings jsonb not null default '{}'::jsonb,
  round_count smallint not null check (round_count between 3 and 20),
  current_round_index smallint not null default 0 check (current_round_index >= 0),
  algorithm_version text not null default 'friend-pricing-v2',
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table friend_exchange.rooms
  add constraint friend_exchange_rooms_current_session_fk
  foreign key (current_session_id) references friend_exchange.sessions(id) on delete set null;

create table friend_exchange.rounds (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references friend_exchange.sessions(id) on delete cascade,
  sequence smallint not null check (sequence >= 0),
  game_type text not null,
  category text not null,
  status friend_exchange.round_status not null default 'briefing',
  seed text not null,
  config jsonb not null default '{}'::jsonb,
  opened_at timestamptz,
  locks_at timestamptz,
  settled_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (session_id, sequence)
);
alter table friend_exchange.rooms
  add constraint friend_exchange_rooms_current_round_fk
  foreign key (current_round_id) references friend_exchange.rounds(id) on delete set null;

create table friend_exchange.round_submissions (
  round_id uuid not null references friend_exchange.rounds(id) on delete cascade,
  user_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  payload jsonb not null,
  client_nonce text not null,
  submitted_at timestamptz not null default now(),
  primary key (round_id, user_id),
  unique (round_id, client_nonce)
);

create table friend_exchange.round_results (
  round_id uuid not null references friend_exchange.rounds(id) on delete cascade,
  user_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  rank smallint not null check (rank > 0),
  normalized_score numeric(8,6) not null check (normalized_score between 0 and 1),
  raw_score jsonb not null default '{}'::jsonb,
  expected_percentile numeric(8,6) not null check (expected_percentile between 0 and 1),
  actual_percentile numeric(8,6) not null check (actual_percentile between 0 and 1),
  stock_return numeric(8,6) not null check (stock_return between -0.25 and 0.25),
  old_price numeric(16,4),
  new_price numeric(16,4),
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default now(),
  primary key (round_id, user_id)
);

create table friend_exchange.friend_assets (
  session_id uuid not null references friend_exchange.sessions(id) on delete cascade,
  owner_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9]{1,5}$'),
  price numeric(16,4) not null check (price >= 5),
  open_price numeric(16,4) not null check (open_price >= 5),
  previous_price numeric(16,4),
  round_return numeric(8,6) not null default 0,
  sentiment text not null default 'neutral' check (sentiment in ('bullish','neutral','bearish')),
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default now(),
  primary key (session_id, owner_id),
  unique (session_id, symbol)
);

create table friend_exchange.friend_price_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references friend_exchange.sessions(id) on delete cascade,
  round_id uuid references friend_exchange.rounds(id) on delete set null,
  owner_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  old_price numeric(16,4) not null,
  new_price numeric(16,4) not null check (new_price >= 5),
  return_percent numeric(8,6) not null check (return_percent between -0.25 and 0.25),
  reason text not null,
  algorithm_version text not null,
  created_at timestamptz not null default now(),
  unique (round_id, owner_id)
);

create table friend_exchange.portfolios (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references friend_exchange.profiles(id) on delete cascade,
  scope friend_exchange.market_scope not null,
  session_id uuid references friend_exchange.sessions(id) on delete cascade,
  cash numeric(18,2) not null check (cash >= 0),
  realized_pnl numeric(18,2) not null default 0,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friend_exchange_portfolios_scope_session check (
    (scope='real' and session_id is null)
    or (scope='friend' and session_id is not null)
  )
);
create unique index friend_exchange_portfolios_real_unique
  on friend_exchange.portfolios(owner_id, scope) where scope='real';
create unique index friend_exchange_portfolios_friend_unique
  on friend_exchange.portfolios(owner_id, session_id, scope) where scope='friend';

create table friend_exchange.positions (
  portfolio_id uuid not null references friend_exchange.portfolios(id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9.\-]{1,12}$'),
  quantity numeric(24,6) not null check (quantity >= 0),
  average_cost numeric(18,6) not null check (average_cost >= 0),
  updated_at timestamptz not null default now(),
  primary key (portfolio_id, symbol)
);

create table friend_exchange.paper_orders (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references friend_exchange.portfolios(id) on delete cascade,
  symbol text not null,
  side friend_exchange.order_side not null,
  requested_notional numeric(18,2),
  requested_quantity numeric(24,6),
  status friend_exchange.order_status not null default 'pending',
  idempotency_key text not null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  unique (portfolio_id, idempotency_key),
  constraint friend_exchange_order_amount check (
    (requested_notional is not null and requested_notional > 0)
    or (requested_quantity is not null and requested_quantity > 0)
  )
);

create table friend_exchange.paper_trades (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references friend_exchange.paper_orders(id) on delete cascade,
  portfolio_id uuid not null references friend_exchange.portfolios(id) on delete cascade,
  symbol text not null,
  side friend_exchange.order_side not null,
  quantity numeric(24,6) not null check (quantity > 0),
  fill_price numeric(18,6) not null check (fill_price > 0),
  gross numeric(18,2) not null check (gross > 0),
  realized_pnl numeric(18,2) not null default 0,
  created_at timestamptz not null default now()
);

create table friend_exchange.news_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references friend_exchange.rooms(id) on delete cascade,
  session_id uuid references friend_exchange.sessions(id) on delete cascade,
  round_id uuid references friend_exchange.rounds(id) on delete set null,
  category text not null,
  headline text not null,
  summary text not null,
  created_at timestamptz not null default now()
);

create table friend_exchange.audit_events (
  id bigint generated always as identity primary key,
  room_id uuid references friend_exchange.rooms(id) on delete cascade,
  actor_id uuid references friend_exchange.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index friend_exchange_room_members_user_idx on friend_exchange.room_members(user_id);
create index friend_exchange_sessions_room_idx on friend_exchange.sessions(room_id, created_at desc);
create index friend_exchange_round_results_user_idx on friend_exchange.round_results(user_id);
create index friend_exchange_round_submissions_user_idx on friend_exchange.round_submissions(user_id);
create index friend_exchange_friend_events_session_idx on friend_exchange.friend_price_events(session_id, created_at desc);
create index friend_exchange_portfolios_session_idx on friend_exchange.portfolios(session_id);
create index friend_exchange_news_room_idx on friend_exchange.news_events(room_id, created_at desc);
create index friend_exchange_audit_room_idx on friend_exchange.audit_events(room_id, created_at desc);
