# Future Supabase Plan

This document is a plan only. The current GitHub Pages prototype does not require or provision Supabase.

## Target topology

```text
GitHub Pages
  ├─ Supabase Auth
  ├─ Postgres Data API protected by RLS
  ├─ Supabase Realtime for rooms/presence
  └─ Edge Functions
       ├─ authoritative round settlement
       └─ market-data provider proxy
```

## Key rules

- The browser may contain only the project URL and a **publishable** key.
- Every exposed table must have Row Level Security enabled and least-privilege policies.
- Supabase secret/service-role keys never belong in GitHub Pages, source control, screenshots or logs.
- Market-data provider credentials belong only in Edge Function secrets.
- Client-submitted scores are untrusted input; authoritative room settlement must validate them.

Official references:

- https://supabase.com/docs/guides/database/secure-data
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/realtime
- https://supabase.com/docs/guides/functions

## Proposed schema

### Profiles and social graph

```text
profiles
- id uuid primary key references auth.users
- display_name text
- ticker text unique
- avatar_url text
- created_at timestamptz

friend_groups
- id uuid primary key
- name text
- owner_id uuid
- created_at timestamptz

friend_group_members
- group_id uuid
- user_id uuid
- role text
```

### Rooms

```text
rooms
- id uuid primary key
- code text unique
- host_id uuid
- group_id uuid nullable
- status text
- settings jsonb
- current_round_id uuid nullable
- version bigint
- created_at timestamptz
- closes_at timestamptz nullable

room_members
- room_id uuid
- user_id uuid
- seat integer
- ready boolean
- connected_at timestamptz
- last_seen_at timestamptz
```

### Rounds and results

```text
rounds
- id uuid primary key
- room_id uuid
- sequence integer
- game_type text
- status text
- config jsonb
- starts_at timestamptz
- locks_at timestamptz
- settles_at timestamptz

round_submissions
- round_id uuid
- user_id uuid
- payload jsonb
- submitted_at timestamptz
- client_nonce text

round_results
- round_id uuid
- user_id uuid
- rank integer
- normalized_score numeric
- stock_move numeric
- xp_awarded integer
```

### Markets and portfolios

```text
friend_assets
- room_or_season_id uuid
- user_id uuid
- symbol text
- price numeric
- sentiment numeric
- version bigint

portfolios
- owner_id uuid
- season_id uuid
- cash numeric
- version bigint

positions
- portfolio_id uuid
- asset_type text
- symbol text
- quantity numeric
- average_cost numeric

orders
- id uuid primary key
- portfolio_id uuid
- asset_type text
- symbol text
- side text
- notional numeric
- fill_price numeric
- filled_quantity numeric
- status text
- created_at timestamptz
```

### Market data

```text
market_quotes
- symbol text primary key
- price numeric
- change_percent numeric
- provider_timestamp timestamptz
- fetched_at timestamptz
- feed_status text
```

## RLS policy outline

| Table | Read | Insert/update |
|---|---|---|
| `profiles` | authenticated users | own profile only |
| `rooms` | members of room | host/authorized function |
| `room_members` | same room | own membership; host for moderation |
| `rounds` | same room | authoritative backend only |
| `round_submissions` | own submission; host may read after lock | own submission before lock |
| `round_results` | same room after settlement | authoritative backend only |
| `portfolios`/`positions` | owner; optional room summary view | transactional function only |
| `orders` | owner | order function only |
| `market_quotes` | authenticated/public read as chosen | Edge Function/backend only |

Policies must use immutable room membership relationships and should not trust client-provided owner IDs.

## Realtime channels

Suggested channel boundaries:

```text
room:{room_id}:presence   online members, ready state
room:{room_id}:public     round state, countdown, results, market events
room:{room_id}:private:{user_id}  private prompt, vote or confidential information
```

Do not broadcast hidden answers on the public channel before settlement.

## Authoritative round lifecycle

1. Host requests a round start.
2. Edge Function validates host and room version.
3. Function creates the round and lock timestamp.
4. Clients receive public round state through Realtime.
5. Players submit before lock; database constraints prevent duplicates/replays.
6. Settlement function validates payloads and computes normalized scores.
7. Function updates Friend Market prices and portfolios transactionally.
8. Results and news events are committed.
9. Realtime broadcasts the settled state.

## Market-data proxy

The Edge Function should:

- allow only a fixed symbol allowlist;
- normalize provider output;
- enforce per-user/per-room rate limits;
- cache quotes in `market_quotes`;
- return provider timestamp and feed status;
- fall back to the last cached quote when the provider fails;
- never send provider credentials to the client.

## Migration order

1. Create Auth and profiles.
2. Create rooms and membership with RLS tests.
3. Add presence and public room state.
4. Add submissions and authoritative settlement.
5. Move portfolios/orders from local state to database transactions.
6. Add quote proxy and cache.
7. Add private channels and advanced games.
8. Add seasons, history and achievements.

## Required tests before enabling production multiplayer

- RLS tests for every table and role;
- two-user cross-room isolation tests;
- duplicate submission and replay tests;
- concurrent order/settlement transaction tests;
- host disconnect and reconnect tests;
- stale quote/fallback tests;
- secret scanning of built frontend and Git history;
- browser E2E on phone and desktop.
