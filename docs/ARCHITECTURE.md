# Architecture

## Current deployment

The local product is a zero-build static application suitable for GitHub Pages:

```text
GitHub Pages
  ├─ HTML/CSS
  ├─ native ES modules
  ├─ localStorage persistence
  ├─ BroadcastChannel tab synchronization
  └─ high-quality local image assets
```

No package runtime or hosted application server is required for local mode.

## State model

The store contains:

- players and category ratings;
- room/session settings;
- explicit round state machine;
- real and Friend Market quote state;
- separate real/friend accounts;
- positions and immutable fill ledgers;
- rounds, submissions, results and price events;
- XP, achievements, news and activity;
- view/modal/controller state.

State writes are immutable at the engine boundary and persisted through `LocalStateTransport`.

## Round state machine

```text
lobby
  → briefing
  → trading
  → locked
  → game
  → settling
  → results
  → next briefing or complete
```

Friend Market orders are accepted only in `trading`. Results are settled once and then become immutable for that round.

## Domain engines

### Portfolio engine

- validates quotes and order side;
- supports fractional quantities;
- prevents negative cash and overselling;
- calculates weighted average cost;
- records realised P/L;
- implements idempotency keys;
- derives equity and unrealised P/L.

### Minigame engine

Every game exposes:

- deterministic configuration from a seed;
- submission scoring;
- bot simulation for local play;
- normalized score from 0 to 1;
- tie-break value and human-readable result.

Group games implement room-level scoring where one player’s result depends on others.

### Friend Market pricing

1. Read category-specific player ratings.
2. Calculate expected percentile.
3. Rank actual normalized scores.
4. Calculate performance surprise.
5. Add small placement/performance signals.
6. Center the room’s returns.
7. Apply volatility-specific circuit breakers.
8. Enforce a €5 fictional price floor.
9. Update category ratings.
10. Generate financial-news explanations.

## Online architecture

```text
GitHub Pages browser
      │ public URL + publishable key
      ▼
Supabase Auth / Data API / private Realtime
      │
      ├─ Postgres + RLS (authoritative persistent state)
      ├─ settle-round Edge Function
      └─ market-quotes Edge Function
             │ server-side provider secret
             ▼
        market-data provider
```

The browser is never authoritative for shared cash, final prices, scores or settlement.
