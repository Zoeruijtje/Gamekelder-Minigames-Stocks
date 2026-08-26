# Friend Exchange — Gamekelder

Friend Exchange is a game-night application that combines fictional paper trading, friend-owned stocks and eight multiplayer minigames in a warm luxury gamekelder interface.

It contains no real-money trading, brokerage connection, deposit, withdrawal or monetary prize.

## Product modes

### Free online rooms

The browser is connected to the user-created Supabase project `knndezzbjzcykysasfnw` using only its public URL and publishable key. The implementation uses Free Plan-compatible database, Auth, Realtime and Edge Function features and does not require a paid add-on.

Online rooms support:

1. Temporary guest sign-in.
2. Room creation and six-character invitation codes.
3. Cross-device joining, ready states and connection status.
4. Host-controlled session and round phases.
5. Private player submissions.
6. Transactional fictional Friend Market orders.
7. Server-authoritative scoring and settlement.
8. Reconnect snapshots and host failover.

The `friend_exchange` database schema is isolated from unrelated application schemas. Row Level Security and private Realtime-channel authorization protect rooms, submissions, portfolios and results.

### Complete local mode

Local mode remains fully playable without Supabase or an internet connection. It supports editable human/bot rooms, same-origin tab synchronization, persistent browser storage and a complete multi-round session.

## Visible Friend Market settlement

Each minigame visibly reprices every listed friend. The settlement presentation shows:

- the price before settlement;
- the new settled price;
- exact percentage and absolute movement;
- whether performance beat or missed expectation;
- animated directional movement bars;
- the selected investor's direct round profit or loss;
- persistent last-round movement on overview and market cards.

Friend Market prices are driven primarily by actual performance relative to each player's category rating. Returns are bounded by the selected volatility mode.

## Eight playable games

- Reaction Test
- Stop the Clock
- Memory Grid
- Closest Wins
- Higher / Lower
- Minority Rules
- Prisoner's Dilemma
- Prediction Desk

## Markets and portfolios

- **Friend Market:** online or local fictional stocks whose prices move after minigames.
- **Real-symbol paper market:** a clearly labelled local `DEMO` feed in the free build.
- Separate fictional balances for both markets.
- Fractional buy and sell orders.
- Weighted average cost and exact cost basis.
- Realised, unrealised and combined fictional profit/loss per holding.
- Per-position profit/price graphs based on observed events.
- Exact partial/full sell proceeds and realised P/L before confirmation.
- Stop loss, take profit, trailing stop and bracket protection.
- Idempotent order handling and immutable trade records.

No paid real-time market-data provider is required for the core game.

## Stable interaction model

Online synchronization no longer rebuilds the page when the authoritative snapshot has not changed. Local DEMO quote ticks patch prices, P/L and graphs in place. When a major state transition does require a full render, the application preserves typed values, focus, caret position, scroll and in-progress minigame input.

## Administrator access

The control center is login-only; the public first-owner setup surface has been removed. The initial owner credential must be replaced with a unique permanent password immediately after first sign-in. Administrator and player Auth sessions remain separate.

See [`docs/ADVANCED_PORTFOLIO_AND_RISK.md`](docs/ADVANCED_PORTFOLIO_AND_RISK.md) and [`docs/ADMIN_CONTROL_CENTER.md`](docs/ADMIN_CONTROL_CENTER.md).

## Responsive interface

- Premium desktop host dashboard.
- Focused phone controller layout.
- Visible settlement prices at every supported width.
- Deliberate phone focal crop rather than a compressed desktop screen.
- Reduced-motion support.

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

- JavaScript syntax checks;
- all eight minigame scoring modules;
- portfolio, sale-preview and protective-order invariants;
- deterministic expectation-based settlement;
- explicit before/after market-price tests;
- online-snapshot normalization tests;
- responsive checks at phone, tablet and desktop sizes;
- a full browser flow from trade through Reaction Test to visible market repricing;
- exact position management, profit graphs, stop-loss controls and refresh-safe typing;
- high-quality background reconstruction checks.

## Public runtime configuration

`supabase-config.js` contains only the public Supabase URL and publishable browser key. Secret/service-role credentials and provider API keys must never be committed or sent to the browser.

## Repository structure

```text
index.html
styles.css
styles-pages.css
styles-interaction.css
responsive.css
online.css
portfolio-advanced.css
admin.css
background-hq.css
supabase-config.js
src/
  engine/
  services/
  ui/
assets/
tests/
docs/
.github/workflows/
```

## Deployment

`main` is deployed as a static GitHub Pages application by `.github/workflows/pages.yml`. The product does not require a paid frontend host or production build server.
