# Friend Exchange — Gamekelder

A static GitHub Pages prototype that combines:

- fake-money paper trading for real-world ticker symbols;
- a fictional Friend Market;
- multiplayer-style minigames that reprice friend stocks;
- a warm luxury gamekelder background with responsive transparent-glass UI.

No real money is used. The current real-market values are a clearly labelled demo feed.

## Current status

The working implementation lives on `feat/full-gamekelder-site` and is reviewed through PR #1 before merging into `main`.

Implemented:

- Overview, Market, Portfolio, Minigames, Leaderboard and News views;
- buy/sell paper orders and local portfolio persistence;
- five playable local minigames;
- Friend Market movement after game results;
- desktop, tablet and phone layouts;
- dedicated desktop and portrait gamekelder background assets;
- automated browser regression tests for background visibility and horizontal overflow.

## Files

```text
index.html                         Application markup
styles.css                        Base visual system and component styles
background.css                    Desktop/mobile environment artwork layers
responsive.css                    Responsive invariants and breakpoints
app.js                            Local state, paper trading and minigames
assets/gamekelder-bg.webp         Desktop background
assets/gamekelder-bg-mobile.webp  Portrait phone background
requirements-test.txt             Browser-test dependency

tests/test_responsive.py          Automated responsive browser regression suite

docs/ARCHITECTURE.md              Current technical architecture
docs/PRODUCT_PLAN.md              Product phases and implementation order
docs/RESPONSIVE_QA.md             Mobile bug analysis, invariants and test report
docs/SUPABASE_PLAN.md             Future secure multiplayer/backend design
```

## Run locally

No build step is required.

```bash
python -m http.server 8000
```

Open `http://localhost:8000`.

## Run verification

```bash
python -m pip install -r requirements-test.txt
python -m playwright install chromium
python tests/test_responsive.py --screenshots
```

The suite renders the site at seven viewport sizes and fails when:

- the document becomes wider than the viewport;
- the background does not fill the visual viewport;
- the gamekelder WebP is missing;
- the phone layout does not collapse to one column;
- the mobile holdings table widens the page instead of scrolling inside its card;
- the phone heading is clipped or wraps unexpectedly.

Results are written to `test-artifacts/responsive-results.json`. Screenshot artifacts are intentionally ignored by Git unless explicitly selected for a release review. The same suite runs automatically in GitHub Actions.

## GitHub Pages

After review and merge, configure GitHub Pages to deploy from:

```text
Branch: main
Folder: /
```

`.nojekyll` is included.

## Market-data constraint

GitHub Pages is public static hosting. A private market-data API key must never be committed or embedded in browser JavaScript. The planned production path is:

```text
GitHub Pages frontend
        ↓
Supabase Auth + RLS
        ↓
Supabase Edge Function
        ↓
Market-data provider
```

The browser will receive only the public Supabase publishable key. Provider keys and Supabase secret keys stay in Edge Function secrets.

## Supabase

Supabase is not required for this version and no project is created by the frontend branch. The intended later use is documented in [`docs/SUPABASE_PLAN.md`](docs/SUPABASE_PLAN.md).
