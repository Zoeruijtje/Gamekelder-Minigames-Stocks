# Friend Exchange — Gamekelder

A static GitHub Pages party-game prototype combining **paper trading**, **friend stocks**, and **multiplayer-style minigames** in a warm luxury glass interface.

## Current build

- Uses the generated luxury **gamekelder** artwork as a local repository asset.
- Responsive, framework-free HTML/CSS/JavaScript.
- Warm smoked/frosted glass surfaces, restrained colour, Bebas Neue-style display typography.
- Local `localStorage` persistence for the paper portfolio and session state.
- Real-world ticker **demo feed** for NVDA, AAPL, MSFT and TSLA using fake money only.
- Friend Market with ZOE, MKE, LRS and ALX.
- Buy/sell paper-trading flow with cash and position updates.
- Five playable local minigames:
  - Reaction Test
  - Stop the Clock
  - Memory Grid
  - Closest Wins
  - Higher / Lower
- Minigame performance reprices the Friend Market and updates XP, rankings, news and activity.
- Leaderboards, market ticker and session news.

## Important: real stock prices

The current build deliberately labels real-world ticker prices as a **demo feed**. GitHub Pages is static hosting and cannot safely hide a private market-data API key.

The intended production architecture is:

1. **GitHub Pages** — static frontend.
2. **Supabase Auth** — player accounts / identities.
3. **Supabase Realtime** — rooms, player presence, live round state, secret votes and multiplayer results.
4. **Supabase Edge Function** — server-side proxy to an external market-data provider so the provider API key is never exposed in the browser.
5. **Supabase Postgres + Row Level Security** — portfolios, seasons, trades, achievements and room membership.

Only a Supabase publishable key should ever be exposed to the browser, with RLS protecting browser-accessible tables. Secret/service-role credentials must remain server-side.

## Run locally

Because the site is static, any local HTTP server works. For example:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`.

## GitHub Pages

After the feature branch is merged, configure **Settings → Pages → Deploy from a branch → `main` / root**.

No build step is required.
