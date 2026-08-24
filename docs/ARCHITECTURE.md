# Current Architecture

## Deployment model

The current application is a no-build static site intended for GitHub Pages.

```text
index.html
  ├─ styles.css
  ├─ background.css
  ├─ responsive.css
  ├─ app.js
  └─ assets/*.webp
```

There is no framework, package bundle or server dependency in the production frontend.

## UI composition

### `index.html`

Defines six views:

1. Overview
2. Market
3. Portfolio
4. Minigames
5. Leaderboard
6. News

It also contains the paper-order dialog and minigame dialog.

### `styles.css`

Defines the base design system:

- warm luxury palette;
- Bebas Neue display typography and Inter body typography;
- frosted/smoked glass surfaces;
- desktop grid;
- financial tables, charts and cards;
- market, portfolio, game, news and dialog components.

### `background.css`

Owns the cinematic room layer separately from component styling.

- desktop uses `assets/gamekelder-bg.webp`;
- phones use `assets/gamekelder-bg-mobile.webp`;
- visual overlays are deliberately restrained;
- phone background movement is disabled for stability.

### `responsive.css`

Owns responsive constraints rather than scattering emergency overrides through component CSS. Its primary purpose is to preserve layout invariants and prevent wide children from changing page width.

### `app.js`

Provides the current local-only application logic:

- default fake portfolio and friend-stock state;
- `localStorage` persistence;
- simulated real-market price movement;
- paper buy/sell orders;
- portfolio and allocation calculations;
- friend-stock repricing;
- five minigames;
- leaderboard, ticker, news and activity rendering;
- view switching and dialogs.

## State boundary

The current state is deliberately local:

```text
Browser localStorage
└─ friendExchangeStateV1
```

This makes the GitHub Pages prototype functional without a backend, but it is not shared between devices and must not be treated as authoritative multiplayer state.

## Future service seams

The frontend already separates concepts that will later map to backend services:

| Current concept | Future backend owner |
|---|---|
| Player/profile | Supabase Auth + `profiles` |
| Room code/presence | Supabase Realtime |
| Portfolio and orders | Postgres + transactional RPC/Edge Function |
| Friend-stock price | Authoritative round settlement function |
| Minigame result | Signed/validated room event |
| Market-data quote | Edge Function proxy |
| News/activity | Database events/materialized feed |

## Security boundary

Anything shipped by GitHub Pages is public. Therefore:

- no market-data provider secret may be placed in frontend files;
- no Supabase secret or service-role key may be placed in frontend files;
- the future browser client may contain only a Supabase publishable key;
- Row Level Security must be enabled before exposing database tables;
- authoritative settlement and third-party API calls belong in Edge Functions.
