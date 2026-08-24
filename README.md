# Friend Exchange — Gamekelder

A complete local game-night MVP that combines:

- fake-money paper trading for real-world ticker symbols;
- a fictional Friend Market where every player is a listed company;
- eight playable minigames;
- expectation-based Friend Market repricing;
- separate investor, company and minigame rankings;
- a warm luxury gamekelder background with transparent glass UI;
- responsive host and phone-controller layouts;
- a checked-in Supabase backend foundation for future cross-device rooms.

There is no real-money trading, brokerage connection, deposit, withdrawal or promise of financial profit.

## What works now

### Complete local session

A local room can be configured and played from lobby through market close:

1. Edit players, tickers and bot/human control.
2. Select 3–12 rounds, trading-window duration, starting cash and volatility.
3. Choose the minigame rotation.
4. Open a Friend Market trading window.
5. Place fictional buy/sell orders.
6. Lock trading and play the game.
7. Settle scores, ratings, stock returns, XP and market news.
8. Continue until final session awards.

### Eight games

- Reaction Test
- Stop the Clock
- Memory Grid
- Closest Wins
- Higher / Lower
- Minority Rules
- Prisoner’s Dilemma
- Prediction Desk

### Markets

- **Friend Market:** tradable only during the pre-round trading phase.
- **Real paper market:** simulated price feed, clearly marked `DEMO`, with fractional fake-money orders.
- Separate cash, positions, average cost, realised P/L and unrealised P/L.
- Immutable local fill ledger with idempotency protection.

### Persistence and controllers

- State persists in `localStorage` where browser policy permits it.
- `BroadcastChannel` synchronizes additional tabs on the same browser origin.
- The header controller button opens a dedicated phone-style controller view.
- The application remains usable when browser storage is disabled.

## High-quality background

The deployed assets preserve the source dimensions and use high-quality WebP compression:

```text
assets/gamekelder-bg.webp         1536 × 864
assets/gamekelder-bg-mobile.webp  1080 × 1920
```

The desktop file is encoded from the approved source without resizing (PSNR ≈ 46 dB versus the supplied PNG). The portrait asset is an art-directed crop for phones rather than a stretched low-resolution derivative.

## Run locally

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Tests

```bash
python -m pip install -r requirements-test.txt
python -m playwright install chromium
npm test
```

The test suite includes:

- JavaScript syntax validation;
- portfolio/order invariant tests;
- deterministic expectation-based price-settlement tests;
- all eight minigame scoring modules;
- complete multi-round local session settlement;
- responsive browser checks at phone, tablet and desktop sizes;
- an actual UI flow from lobby → trade → lock → Reaction Test → settlement;
- background dimension and quality gates in GitHub Actions.

## Repository structure

```text
index.html
styles.css
responsive.css
supabase-config.js
src/
  config.js
  store.js
  main.js
  engine/
  services/
  ui/
assets/
tests/
supabase/
  migrations/
  functions/
docs/
.github/workflows/
```

## Supabase status

The website currently defaults to fully functional local mode. A production backend is checked in but has **not** been applied to an existing Supabase project.

The only currently connected Supabase project contains unrelated inspection-app tables, so this project must use a new dedicated Supabase project rather than modifying that database.

Checked-in backend work includes:

- profiles, rooms, members and sessions;
- rounds, private submissions and results;
- Friend Market assets and immutable price events;
- real/friend portfolios, positions, orders and trades;
- market-quote cache;
- achievements, news and audit events;
- Row Level Security policies;
- private Realtime room authorization;
- anonymous-room RPC functions;
- transactional fake-money order execution;
- authoritative round-settlement RPC;
- market-data Edge Function;
- round-settlement Edge Function;
- browser-side Supabase adapter.

See [`docs/SUPABASE_DEPLOYMENT.md`](docs/SUPABASE_DEPLOYMENT.md).

## GitHub Pages

The `pages.yml` workflow deploys `main` as a static GitHub Pages site. No production build server is needed.
