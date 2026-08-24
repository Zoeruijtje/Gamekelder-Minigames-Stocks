# Friend Exchange Supabase backend

## Live project

| Setting | Value |
|---|---|
| Project | `Gamekelder Minigames` |
| Project reference | `knndezzbjzcykysasfnw` |
| Region | `eu-west-1` |
| Application schema | `friend_exchange` |
| Browser authentication | Temporary guest identities |
| Realtime | Private `room:<uuid>:public` channels |

The frontend uses only the public project URL and publishable key from `supabase-config.js`. Secret/service-role credentials remain inside Supabase-managed Edge Function environment variables and must never be committed.

## Free-only architecture

The core game uses database storage, Auth, Realtime and Edge Functions that are available on Supabase's Free Plan. No paid compute add-on, paid read replica, custom domain or paid market-data service is required.

The real-symbol market remains an explicitly labelled local `DEMO` feed. The online backend is responsible for Friend Market rooms, submissions, portfolios and settlement, so the game remains useful without paying an external quote provider.

## Deployed migrations

The production database records these migrations in `supabase_migrations.schema_migrations`:

| Version | Name |
|---|---|
| `20260824203917` | `friend_exchange_core_schema` |
| `20260824204026` | `friend_exchange_room_functions` |
| `20260824204123` | `friend_exchange_authoritative_market` |
| `20260824204209` | `friend_exchange_rls_snapshot_realtime` |
| `20260824204628` | `friend_exchange_snapshot_hardening_and_finish` |
| `20260824214918` | `friend_exchange_performance_indexes` |
| `20260824214933` | `friend_exchange_guest_rate_limits` |
| `20260824215242` | `friend_exchange_guest_cleanup` |
| `20260824220348` | `friend_exchange_guest_limit_deny_policy` |

The initial production schema was provisioned through the official Supabase management integration. Before cloning this backend into a second project, use `supabase db pull` against the project reference to materialize the complete baseline migration locally; do not hand-copy production data or service-role credentials.

All future DDL changes must be added as timestamped files under `supabase/migrations/` before deployment.

## Versioned Edge Functions

- `functions/guest-auth-v2/index.ts`
  - creates short-lived guest credentials;
  - hashes IP/user-agent information into a rate-limit fingerprint;
  - permits at most 20 guest creations per fingerprint per hour;
  - never sends a service-role credential to the browser.
- `functions/settle-round/index.ts`
  - verifies the caller and host role;
  - reads private submissions server-side;
  - scores all eight games;
  - computes expectation-adjusted, bounded Friend Market moves;
  - commits results and before/after prices transactionally.

## Security properties

- Every browser-readable application table has Row Level Security.
- Server-only rate-limit storage has an explicit deny-all client policy.
- Private submissions are readable only by their owner before settlement.
- Room membership gates rooms, rounds, assets and results.
- Only a host/co-host can advance or settle a round.
- Friend Market orders lock the portfolio row and use an idempotency key.
- Settlement is single-use and records immutable price events.
- Public snapshots redact hidden answers until results are available.
- Temporary test/guest identities can remove their own Friend Exchange account through a guarded RPC.
- The final Supabase security and performance advisor scans return no lints.

## Verification

`tests/live-supabase-smoke.mjs` executes a complete live integration check using only the publishable key:

1. create two temporary guests;
2. create and join a room;
3. ready both players;
4. open a session and trading round;
5. execute a fictional Friend Market order;
6. submit two private Reaction Test results;
7. settle on the Edge Function;
8. verify identical before/after prices on both clients;
9. verify direct portfolio impact;
10. delete both temporary test users and the test room.

The workflow is defined in `.github/workflows/live-supabase-smoke.yml`.
