# Implementation status

## Implemented and tested

- Premium responsive design using the approved warm luxury gamekelder direction.
- Runtime reconstruction of a 1536 × 864 high-quality WebP from checked-in, cacheable text chunks, with bundled WebP fallbacks when reconstruction is unavailable.
- Landing page, lobby, session dashboard, markets, portfolio, game catalogue, leaderboards and news.
- Host-style desktop interface and focused controller view.
- Editable 2–8 player room with human/bot controls.
- Configurable round count, trading duration, cash, volatility, own-stock rule and game rotation.
- Deterministic session queue and explicit phase state machine.
- Eight playable minigames:
  - Reaction Test
  - Stop the Clock
  - Memory Grid
  - Closest Wins
  - Higher / Lower
  - Minority Rules
  - Prisoner’s Dilemma
  - Prediction Desk
- Bot simulation for local sessions.
- Sequential pass-and-play support for multiple humans.
- Separate Real Portfolio and Friend Market balances.
- Fractional fake-money orders, weighted cost basis and realised/unrealised P/L.
- Trading-lock enforcement and idempotent ledgers.
- Expectation-based Friend Market price movement and category ratings.
- Three independent rankings.
- Session awards, XP, achievements, activity and generated market news.
- Local persistence and same-origin tab synchronization.
- Responsive and full-round browser regression tests.
- GitHub Actions QA and GitHub Pages deployment workflow.
- Supabase schema, RLS policies, RPCs, online adapter and Edge Function source prepared in the repository.
- Continuation protocol and a bounded next-session prompt committed under `docs/`.

## Pending required confirmation

Cross-device internet multiplayer requires a dedicated Supabase project. The only connected project currently contains unrelated inspection/reporting application tables and has not been modified.

Before project creation, the user must explicitly confirm:

1. the target Supabase organization; and
2. the project creation cost shown by Supabase.

The intended organization is `Zoeruijtje's Org` and the preferred region is `eu-central-1`, subject to confirmation.

## Production hardening after backend deployment

- Create the dedicated project and apply migrations from a clean database.
- Run Supabase security and performance advisors.
- Configure anonymous Auth plus CAPTCHA or Turnstile where appropriate.
- Deploy Edge Functions with authentication and server-side secrets.
- Configure only the project URL and publishable key in the browser.
- Run multi-user RLS isolation and private-channel authorization tests.
- Run duplicate submission, concurrent order and idempotent settlement tests.
- Run host-disconnect and reconnect tests against live Realtime.
- Choose and license a market-data provider before public real-symbol quote display.

## Automation note

`docs/NEXT_SESSION_PROMPT.md` and the matching GitHub issue form a durable continuation queue. They do not autonomously start a new ChatGPT session; an external approved automation system would be required for timed agent execution.
