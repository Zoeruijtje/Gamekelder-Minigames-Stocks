# Next Session Prompt

Continue the Friend Exchange implementation in `Zoeruijtje/Gamekelder-Minigames-Stocks`.

## Starting point

- Base branch: `main`
- Product branch: `feat/full-product-mvp`
- Read first:
  - `README.md`
  - `docs/FULL_IMPLEMENTATION_PLAN.md`
  - `docs/IMPLEMENTATION_STATUS.md`
  - `docs/SUPABASE_PLAN.md`
  - `docs/CONTINUATION_PROTOCOL.md`
- Inspect the product pull request and its latest Product QA workflow before changing code.

## Objective

Provision and integrate a **dedicated** Supabase backend for Friend Exchange without modifying the existing unrelated Supabase project.

The connected organization is expected to be `Zoeruijtje's Org`, but project creation must occur only after the user explicitly confirms the organization and the displayed creation cost.

After confirmation:

1. Create a dedicated project in an EU region, preferably `eu-central-1`, with an unambiguous name such as `Friend Exchange Gamekelder`.
2. Apply the checked-in migrations under `supabase/migrations` in order.
3. Review every migration before execution and fix conflicts, unsafe grants or insufficient Row Level Security.
4. Enable the authentication mode required by the product, prioritizing low-friction anonymous/guest joining with a documented upgrade path to email/OAuth.
5. Configure private Realtime channels and verify room membership authorization.
6. Deploy the checked-in Edge Functions:
   - `market-quotes`
   - `settle-round`
7. Configure only required public browser values. Never commit a Supabase secret key, service-role credential or market-data provider key.
8. Wire the existing online adapter into the UI behind an explicit configuration boundary while preserving offline/local demo mode.
9. Implement and verify:
   - create room;
   - join by code;
   - presence and ready state;
   - two-client synchronized round state;
   - private submission isolation;
   - authoritative single settlement;
   - reconnect snapshot;
   - host transfer or a documented safe fallback.
10. Add database/RLS tests proving cross-room isolation, ownership controls, duplicate-submission rejection and idempotent order/settlement handling.
11. Add a Playwright test with one host and at least two player contexts.
12. Run all unit, browser, responsive, database and secret-scanning checks.
13. Update deployment and architecture documentation with the actual project configuration, excluding secrets.

## Product constraints

- All money remains fictional.
- The Friend Market and Real Portfolio remain separate economies.
- Minigame settlement remains based mainly on performance versus expectation.
- Preserve the approved warm luxury gamekelder design and transparent glass hierarchy.
- Phone UI must remain a focused controller rather than a compressed desktop dashboard.
- Local/offline mode must remain usable if Supabase or the market-data provider is unavailable.

## Security constraints

- Treat every browser submission as untrusted.
- Keep authoritative prices, scores, cash and settlement server-side.
- Use least-privilege RLS on every exposed table.
- Use private Realtime channels with membership authorization.
- Reject duplicate nonces and idempotency keys.
- Do not use the existing unrelated Supabase project.
- Do not merge until CI is green and the data/security changes are reviewable.

## Definition of done

- A dedicated Supabase project exists and is healthy.
- Migrations and functions deploy successfully from a clean database.
- Two separate browser clients can join the same room and complete one synchronized round.
- A non-member cannot read the room, portfolio or private submissions.
- Settlement occurs exactly once and every client receives the same resulting prices.
- Reconnect restores the correct authoritative state.
- Local mode still passes its complete session flow.
- All repository CI checks pass.
- A live preview and concise review checklist are posted to the pull request.

At the end of the session, replace this file with the next bounded continuation prompt and update the single `Next session:` GitHub issue according to `docs/CONTINUATION_PROTOCOL.md`.
