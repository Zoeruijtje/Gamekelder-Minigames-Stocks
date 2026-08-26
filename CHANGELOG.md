# Changelog

## 0.3.0 — Full local product MVP

### Added

- Complete lobby-to-market-close session flow.
- Eight playable minigames with deterministic scoring and bot simulation.
- Expectation-based Friend Market pricing and category ratings.
- Separate real-paper and Friend Market economies.
- Fractional fake-money orders, cost basis, realised/unrealised P/L and idempotent ledgers.
- Three independent leaderboards, session awards, XP, achievements and market news.
- Dedicated controller view and same-origin tab synchronization.
- Source-resolution high-quality desktop WebP and art-directed portrait WebP assets.
- Supabase schema, RLS, RPCs, private Realtime authorization and Edge Functions.
- Unit, scoring, full-session and responsive browser tests.
- Product QA and GitHub Pages workflows.

### Changed

- Replaced the proof-of-concept monolithic application with native ES modules and separated engines/services/UI.
- Rebuilt responsive layouts around host-display and controller use cases.

### Safety

- Existing unrelated Supabase project was inspected read-only and not modified.
- Online mode remains disabled until a dedicated project is selected and provisioned.

## 0.5.0 — Advanced portfolio and interaction stability

- Added full position management with exact cost, proceeds, realised/unrealised P/L and per-holding graphs.
- Added stop-loss, take-profit, trailing-stop and bracket protection with partial-position sizing.
- Added server-authoritative online protective execution after Friend Market settlement.
- Added real observed online equity history and protective-fill metadata.
- Added buy-more and rapid partial/full sale flows.
- Removed the public administrator setup surface and added login-only owner provisioning plus mandatory password replacement.
- Prevented unchanged online snapshots and DEMO quote ticks from rebuilding active forms/minigames.
- Preserved typed values, focus, caret and scroll across necessary state transitions.
- Reconciled the checked-in migration ledger with the live Free Plan Supabase project.
