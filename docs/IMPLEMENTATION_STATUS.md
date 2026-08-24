# Implementation status

## Implemented and tested

- Premium responsive design using the approved gamekelder background.
- Source-resolution desktop WebP plus an art-directed high-quality portrait WebP.
- Landing page, lobby, session dashboard, markets, portfolio, game catalogue, leaderboards and news.
- Host-style desktop interface and focused controller view.
- Editable 2–8 player room with human/bot controls.
- Configurable round count, trading duration, cash, volatility, own-stock rule and game rotation.
- Deterministic session queue and explicit phase state machine.
- Eight playable minigames.
- Bot simulation for local sessions.
- Sequential pass-and-play support for multiple humans.
- Separate real-paper and Friend Market balances.
- Fractional fake-money orders, weighted cost basis and P/L.
- Trading lock enforcement and idempotent ledgers.
- Expectation-based Friend Market price movement and ratings.
- Three independent rankings.
- Session awards, XP, achievements, activity and generated market news.
- Local persistence and same-origin tab synchronization.
- Responsive and full-round browser regression tests.
- GitHub Actions QA and GitHub Pages deployment workflow.
- Complete Supabase schema, RLS policies, RPCs and Edge Function source.

## Requires an external project decision

Cross-device internet multiplayer and genuine market quotes require a dedicated Supabase project and a market-data API key. The existing connected Supabase project is not suitable because it belongs to another application.

No unrelated database has been modified.

## Production hardening after backend deployment

- Apply migrations to a dedicated project.
- Run Supabase security/performance advisors.
- Configure anonymous Auth and CAPTCHA/Turnstile.
- Deploy Edge Functions with JWT verification.
- Add project URL and publishable key to `supabase-config.js`.
- Run multi-user RLS isolation tests.
- Run host-disconnect/reconnect tests against the live Realtime service.
- Choose and license a market-data provider.
