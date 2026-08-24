# Friend Exchange — Full Product Implementation Plan

## 1. Objective

Turn the current static Gamekelder prototype into a complete social party-game platform where friends can:

- join a private room from their phones;
- paper-trade real-world stocks using fictional money;
- buy and sell fictional shares in each other;
- play synchronized multiplayer minigames;
- move Friend Market prices through game performance;
- compete separately as an investor, a minigame player and a publicly traded friend;
- keep persistent real-stock paper portfolios and optional longer-running seasons.

The product must remain a game. There is no real-money trading, brokerage connection, deposit, withdrawal or promise of financial profit.

## 2. Current state

The repository currently contains a working static prototype with:

- a warm luxury gamekelder background;
- responsive transparent-glass UI;
- Overview, Market, Portfolio, Minigames, Leaderboard and News views;
- a browser-local fake portfolio;
- simulated real-stock prices;
- a Friend Market;
- five local minigames;
- localStorage persistence;
- responsive Playwright regression tests.

The current implementation proves the design direction and basic mechanics. It is not yet an authoritative multiplayer game because all state and calculations live in one browser.

## 3. Immediate visual correction: background quality

The temporary preview host is not the main source of the visible blur. The committed WebP files are currently extremely small for full-screen photographic backgrounds, so compression artifacts become visible on modern phone and desktop displays.

Before further feature work:

1. Replace the desktop asset with a source at least `2560 × 1440 px`.
2. Replace the phone asset with a purpose-composed portrait source around `1440 × 1920 px`.
3. Export both as:
   - AVIF at a visually reviewed quality setting;
   - WebP fallback at approximately quality 85–90.
4. Use CSS `image-set()` for AVIF/WebP selection.
5. Preload only the asset matching the active media query.
6. Keep each final asset reasonably sized rather than aggressively tiny:
   - desktop target: roughly 250–650 kB;
   - mobile target: roughly 180–450 kB.
7. Add automated checks for minimum pixel dimensions and a visual screenshot comparison. File size alone must not be treated as proof of quality.

The room should remain detailed behind the glass without becoming the primary content or harming text readability.

## 4. Core product decisions

### 4.1 Recommended player format

- Recommended: 3–8 active players.
- Initial hard limit: 10 players.
- One large host display is optional but strongly recommended.
- Every player uses a phone as a controller and private information screen.
- A player may host from a laptop/TV while still playing from their phone.

### 4.2 Session duration

- Quick game: 20–30 minutes, 5 rounds.
- Standard game night: 45–75 minutes, 8–12 rounds.
- Custom session: host selects round count, game pool and volatility.

### 4.3 Separate the two economies

Use two related but distinct balances to avoid long-term paper-stock wealth ruining a fresh party game.

#### Real Portfolio

- Persists across sessions and seasons.
- Holds real-world symbols using fake money.
- Value follows provider quotes.
- Designed for days, weeks and months rather than a single round.

#### Friend Market Wallet

- Resets at the start of a room session or season, depending on host settings.
- Holds fictional friend stocks.
- Prices are driven primarily by minigame results.
- Used for the session investor leaderboard.

The UI can show a combined profile summary, but competitive rankings must keep the two economies understandable.

### 4.4 Three independent rankings

1. **Investor ranking** — Friend Market wallet value.
2. **Company ranking** — percentage performance of each player’s friend stock.
3. **Minigame ranking** — points and normalized game performance.

This lets a player be an excellent competitor but a poor investor, or a weak competitor but a strong trader.

## 5. Final user journey

### 5.1 Landing

- Show the luxury Gamekelder visual identity.
- Primary actions: **Create room**, **Join room**, **Continue portfolio**.
- Explain in one sentence that all money and trading are fictional.

### 5.2 Quick identity

Default to low-friction guest play:

- choose display name;
- choose avatar colour/image;
- automatically create an authenticated anonymous account;
- optionally link Google/email later to preserve history across devices.

### 5.3 Room lobby

Host configures:

- session name;
- starting Friend Market cash;
- round count;
- enabled minigames;
- normal or chaos volatility;
- whether own-stock trading is allowed;
- whether short selling is disabled, advanced-only or enabled;
- public/spectator access;
- teams or free-for-all.

Players join using:

- room code;
- direct link;
- QR code on the host display.

Lobby shows connection, ready status and host/co-host roles.

### 5.4 Session loop

Every round follows one explicit state machine:

```text
LOBBY
  -> ROUND_INTRO
  -> TRADING_OPEN
  -> TRADING_LOCKED
  -> GAME_COUNTDOWN
  -> GAME_ACTIVE
  -> SUBMISSIONS_LOCKED
  -> SETTLING
  -> RESULTS
  -> INTERMISSION
  -> next round or SESSION_COMPLETE
```

Recommended timings:

- Round intro: 8–12 seconds.
- Trading window: 25–45 seconds.
- Game countdown: 3 seconds.
- Game: 10–60 seconds depending on type.
- Settlement/results: 15–25 seconds.
- Intermission: optional 10 seconds.

### 5.5 End of session

Show:

- richest investor;
- best-performing friend company;
- best overall minigame player;
- biggest gain and crash;
- best trade;
- worst trade;
- comeback award;
- achievement unlocks;
- shareable results image;
- rematch and new-session actions.

## 6. Frontend architecture

The current single-page vanilla prototype should be preserved as a design reference, then migrated to a maintainable static application.

### 6.1 Recommended stack

- Vite
- React
- TypeScript in strict mode
- React Router using hash routing for GitHub Pages compatibility
- Zustand or a small reducer-based store for local UI state
- Zod for validating API and Realtime payloads
- `@supabase/supabase-js`
- Vitest for unit tests
- Playwright for browser and multiplayer E2E tests
- Existing custom CSS/SVG charts; do not replace the visual system with a generic component library

### 6.2 Why migrate

The finished product will have:

- multiple user roles;
- synchronized round state;
- many minigame modules;
- persistent portfolios;
- reconnect logic;
- server events;
- error states;
- substantial automated testing.

Keeping all of this in one `app.js` would make regressions likely and minigame development slow.

### 6.3 Proposed source layout

```text
src/
  app/
    App.tsx
    router.tsx
    providers/
  components/
    glass/
    navigation/
    charts/
    dialogs/
  screens/
    landing/
    lobby/
    host/
    controller/
    market/
    portfolio/
    results/
  domain/
    room.ts
    round.ts
    market.ts
    portfolio.ts
    player.ts
  engine/
    sessionMachine.ts
    settlement.ts
    friendPricing.ts
    ratings.ts
  minigames/
    registry.ts
    reaction/
    stop-clock/
    memory-grid/
    closest-wins/
    higher-lower/
    minority-rules/
    prisoners-dilemma/
    prediction/
  data/
    GameStore.ts
    LocalGameStore.ts
    SupabaseGameStore.ts
    QuoteProvider.ts
  lib/
    supabase.ts
    validation.ts
    format.ts
  styles/
    tokens.css
    glass.css
    responsive.css
supabase/
  migrations/
  functions/
    market-quotes/
    room-command/
    submit-round/
    settle-round/
    place-paper-order/
tests/
  unit/
  integration/
  e2e/
```

### 6.4 Data adapter boundary

Define one interface for application data:

```text
GameStore
- getProfile
- createRoom
- joinRoom
- subscribeToRoom
- submitRoundInput
- placePaperOrder
- getPortfolio
- leaveRoom
```

Implement:

- `LocalGameStore` for offline development and demo mode;
- `SupabaseGameStore` for full multiplayer.

This keeps the website playable when Supabase is unavailable and prevents the UI from becoming tightly coupled to backend details.

## 7. Host screen and phone controller

### 7.1 Host screen

The host display owns public presentation only:

- lobby and QR code;
- current round title/instructions;
- public countdown;
- public rankings;
- market charts;
- settlement animation;
- news ticker;
- session results.

It must never reveal private answers, secret information or hidden choices before settlement.

### 7.2 Phone controller

The phone interface prioritizes one action at a time:

- trading ticket during trading;
- private game input during play;
- submitted/locked confirmation;
- personal portfolio and P/L;
- private information cards;
- reconnect state.

Avoid shrinking the full desktop dashboard onto a phone. Mobile is a controller product, not merely a responsive dashboard.

## 8. Minigame framework

Every minigame should implement one contract.

### 8.1 Game manifest

```text
id
name
category
minimumPlayers
maximumPlayers
estimatedDuration
inputMode
supportsTeams
supportsSpectators
stockVolatility
instructions
```

### 8.2 Game lifecycle methods

```text
createRound(seed, players, settings)
createPublicState()
createPrivateState(playerId)
validateSubmission(playerId, payload, timing)
scoreSubmissions()
normalizeScores()
createResultSummary()
```

### 8.3 Deterministic rounds

- Server creates a random seed before the round.
- Clients receive only the information they need.
- The server can reproduce prompts and expected answers from the seed.
- Every submission includes a nonce and round ID.
- Duplicate or late submissions are rejected.

### 8.4 Initial complete game set

#### 1. Reaction Test

- Phone receives the round seed and scheduled local trigger window.
- Player taps when prompted.
- Validate impossible or out-of-window times.
- Score by milliseconds with false-start penalty.

#### 2. Stop the Clock

- Stop at exactly 5.000 seconds.
- Score by absolute error.

#### 3. Memory Grid

- Deterministic illuminated pattern.
- Score correct cells, incorrect cells and completion speed.

#### 4. Closest Wins

- Numeric estimation prompt.
- Score by percentage error rather than raw difference.

#### 5. Higher / Lower

- Short sequence of factual or market-related comparisons.
- Score accuracy plus response speed.

#### 6. Minority Rules

- Secret A/B choice.
- Minority earns the stronger score.
- Tie rules must be explicit.

#### 7. Prisoner’s Dilemma

- Pair players or use a group variant.
- Secret cooperate/betray choice.
- Score table is shown before the choice.

#### 8. Prediction Round

- Predict the winner or finishing band of the next minigame.
- Rewards market-reading skill separately from game skill.

### 8.5 Later game candidates

- Pattern Rush
- Target Tap
- Price Guess
- Sequence Order
- Risk Ladder
- Team Consensus
- Bluff Auction
- Secret Missions

Only add games that are reliably understandable in under 20 seconds.

## 9. Friend Market design

### 9.1 Initial price and supply

- Every player starts at a friend-stock price of `100.00`.
- The MVP uses a virtual market maker with unlimited fictional liquidity.
- Orders fill at the current settled price plus a very small fictional spread.
- Player demand does not materially move price in the first release; minigame settlement remains the clear driver.

This prevents a small room from manipulating prices simply by repeatedly buying and selling.

### 9.2 Expectations

Maintain a separate skill rating per player and game category.

For every round:

1. Calculate expected placement from the relevant rating.
2. Normalize actual result to `0–1`.
3. Calculate `surprise = actualPerformance - expectedPerformance`.
4. Use surprise, not only final placement, as the main price driver.

A weaker player beating expectations can rally even without finishing first. A favourite who only barely wins may move little.

### 9.3 Proposed settlement model

```text
surpriseReturn = surprise * gameVolatility
placementBonus = small first/last-place modifier
streakModifier = capped momentum modifier
specialEvent = optional host/event-card modifier
rawReturn = surpriseReturn + placementBonus + streakModifier + specialEvent
settledReturn = clamp(rawReturn, -12%, +12%)
newPrice = max(priceFloor, previousPrice * exp(settledReturn))
```

Recommended safeguards:

- normal round cap: approximately `±12%`;
- chaos/special round cap: approximately `±20%`;
- price floor: `5.00`;
- session circuit breaker after an extreme cumulative move;
- diminishing streak bonuses;
- no unbounded compounding event cards.

The exact constants must be tuned through simulated sessions and real friend-group playtests.

### 9.4 Own-stock rules

Default mode:

- players may buy their own stock;
- players may not short their own stock;
- deliberate non-participation receives a strong penalty;
- host can enable full chaos mode later.

This avoids the obvious incentive to short yourself and intentionally lose.

### 9.5 Trading phases

- Trading is allowed only during `TRADING_OPEN` and intermissions.
- Friend orders lock before the game starts.
- Results settle before trading reopens.
- Every execution records the quote version to prevent stale-order disputes.

## 10. Real-world paper-stock system

### 10.1 Scope for first release

- Market orders only.
- Fractional shares.
- Buy and sell only; no real-stock shorting initially.
- Watchlist and symbol search.
- Immutable fictional trade ledger.
- Realized and unrealized P/L.
- Provider timestamp and market status on every quote.

### 10.2 Market states

Every quote must be labelled as one of:

- `LIVE`
- `DELAYED`
- `CLOSED`
- `STALE`
- `UNAVAILABLE`

Never animate or fabricate price changes between provider observations in a way that could be mistaken for real data.

### 10.3 Order execution

For a market order:

1. Client sends symbol, side, amount and idempotency key.
2. Backend fetches or reads a sufficiently fresh cached quote.
3. Backend validates market state and fictional buying power.
4. Transaction inserts the order/trade and adjusts cash/position atomically.
5. Backend returns fill price, quantity and new account version.

When the market is closed, the MVP should reject new market orders with a clear status. Queued next-open orders can be added later.

### 10.4 Provider strategy

Do not hard-code the product to one provider. Implement a normalized `QuoteProvider` interface.

Initial provider spike should compare:

- quote freshness;
- US and EU coverage;
- batch endpoint efficiency;
- personal versus public display rights;
- request limits;
- cost;
- historical candles;
- exchange timestamps;
- reliability.

A free/personal market-data tier may be suitable for private development but may not permit public display. Provider licensing must be confirmed before public release.

### 10.5 Caching

- Quotes are fetched only while at least one active room or portfolio request needs them.
- Batch symbols whenever supported.
- Suggested open-market TTL: 60–120 seconds for this casual game.
- Suggested closed-market TTL: 10–30 minutes.
- Store provider timestamp separately from fetch timestamp.
- Return the last cached quote with `STALE` status when the provider fails.

## 11. Supabase architecture

### 11.1 Authentication

Recommended onboarding:

- anonymous authenticated session for instant guest play;
- optional account upgrade through email/OAuth;
- preserve the same user ID where possible so history survives upgrade;
- CAPTCHA/Turnstile and rate limiting before exposing anonymous signup publicly;
- scheduled cleanup for abandoned anonymous users.

### 11.2 Realtime strategy

Use:

- **Broadcast** for countdowns, room commands, public game state, result events and other fast transient updates;
- **Presence** only for slow-changing state such as online/offline, ready status and current role;
- database persistence as the authoritative source;
- private Realtime channels protected by RLS.

Do not stream every high-frequency game action through Presence. Do not rely on client Broadcast messages as authoritative settlement.

Suggested topics:

```text
room:{roomId}:public
room:{roomId}:private:{userId}
room:{roomId}:host
```

### 11.3 Database schema

#### Identity

```text
profiles
- id uuid primary key references auth.users
- display_name text
- ticker text
- avatar_url text
- xp bigint
- permanent boolean
- created_at timestamptz
```

#### Rooms and sessions

```text
rooms
- id uuid primary key
- code text unique
- host_id uuid
- status text
- settings jsonb
- version bigint
- created_at timestamptz

room_members
- room_id uuid
- user_id uuid
- seat integer
- role text
- ready boolean
- joined_at timestamptz

sessions
- id uuid primary key
- room_id uuid
- status text
- round_count integer
- current_round integer
- started_at timestamptz
- completed_at timestamptz
```

#### Rounds

```text
rounds
- id uuid primary key
- session_id uuid
- sequence integer
- game_type text
- seed text
- status text
- config jsonb
- trading_opens_at timestamptz
- trading_locks_at timestamptz
- game_starts_at timestamptz
- submissions_lock_at timestamptz
- settled_at timestamptz

round_submissions
- round_id uuid
- user_id uuid
- payload jsonb
- nonce text
- submitted_at timestamptz
- client_duration_ms integer

round_results
- round_id uuid
- user_id uuid
- rank integer
- raw_score numeric
- normalized_score numeric
- expected_score numeric
- stock_return numeric
- xp_awarded integer
```

#### Assets and portfolios

```text
assets
- id uuid primary key
- asset_type text
- symbol text
- display_name text
- room_id uuid nullable
- profile_id uuid nullable
- enabled boolean

accounts
- id uuid primary key
- owner_id uuid
- account_type text
- season_id uuid nullable
- session_id uuid nullable
- cash numeric
- version bigint

positions
- account_id uuid
- asset_id uuid
- quantity numeric
- average_cost numeric
- version bigint

paper_orders
- id uuid primary key
- account_id uuid
- asset_id uuid
- side text
- notional numeric
- quote_version text
- idempotency_key text
- status text
- created_at timestamptz

paper_trades
- id uuid primary key
- order_id uuid
- fill_price numeric
- quantity numeric
- executed_at timestamptz
```

#### Prices and progression

```text
friend_price_events
- asset_id uuid
- round_id uuid
- previous_price numeric
- return_percent numeric
- new_price numeric
- reason jsonb
- created_at timestamptz

market_quotes
- symbol text primary key
- price numeric
- currency text
- change_percent numeric
- provider_timestamp timestamptz
- fetched_at timestamptz
- feed_status text

achievements
player_achievements
game_ratings
news_events
audit_events
```

### 11.4 Authoritative commands

Implement sensitive actions through validated database RPCs and/or Edge Functions:

- `create_room`
- `join_room`
- `start_session`
- `open_trading`
- `start_round`
- `submit_round`
- `settle_round`
- `place_paper_order`
- `close_session`

Every command checks:

- authenticated user;
- room membership;
- required role;
- expected current state;
- optimistic version;
- idempotency key;
- timing window.

### 11.5 RLS rules

- Users may read rooms only when they are members or the room is intentionally public.
- Users may edit only their own profile.
- Users may submit only for themselves and only before the lock.
- Hidden submissions are readable only by their owner before settlement.
- Clients cannot directly set scores, ranks, cash balances, settled prices or achievements.
- Cross-room data access must fail.
- Secret/service-role keys never enter browser code or Git history.

## 12. Reconnect and failure behaviour

### 12.1 Reconnect

- Store room ID and user ID locally.
- On reconnect, fetch authoritative room snapshot first.
- Rejoin private channel and Presence.
- Restore only the player’s private state.
- Give disconnected players a short grace period.

### 12.2 Host disconnect

- Host role remains reserved briefly.
- If the host does not return, transfer to co-host or longest-connected eligible member.
- Round timers are server timestamps, not dependent on the host tab remaining open.

### 12.3 Provider failure

- Friend Market and minigames continue normally.
- Real-stock orders pause if there is no acceptable quote.
- Existing portfolios show the last quote as stale.

### 12.4 Supabase outage

- Show a clear reconnect screen.
- Do not silently run a divergent local multiplayer session.
- Keep a separate explicit offline/demo mode.

## 13. Security and casual anti-cheat

This is a friends game, so the goal is reasonable integrity rather than casino-grade anti-cheat.

Required controls:

- all client inputs treated as untrusted;
- server-issued round IDs, seeds and lock timestamps;
- one accepted submission per player/round;
- idempotent commands;
- plausible timing bounds;
- rate limits for joins, submissions and orders;
- validation of prompt answers server-side;
- private answers never sent to public channels before reveal;
- server-side cash and price settlement;
- immutable trade and settlement audit records;
- Turnstile/CAPTCHA for public anonymous access;
- dependency, secret and RLS scans in CI.

For reaction games, perfect prevention of a modified client is unrealistic in a browser. Detect impossible values, obvious automation and repeated anomalies, then flag rather than claiming absolute cheat prevention.

## 14. Testing strategy

### 14.1 Unit tests

- score normalization for every game;
- deterministic prompt generation;
- Friend Market price bounds;
- expectations and rating updates;
- portfolio P/L;
- buy/sell execution;
- fractional-share rounding;
- session state transitions;
- quote freshness classification.

Use property tests for invariants such as:

- cash never becomes negative after an accepted buy;
- selling cannot exceed position quantity;
- the same idempotency key cannot execute twice;
- friend prices never fall below the floor;
- settlement is deterministic for the same inputs.

### 14.2 Supabase integration tests

Run a local Supabase stack in CI and test:

- migrations from an empty database;
- RLS for anonymous, authenticated, host and non-member users;
- cross-room isolation;
- duplicate submissions;
- concurrent orders;
- settlement transactions;
- reconnect snapshots;
- Edge Function quote cache and provider failure.

### 14.3 Browser multiplayer E2E

Use multiple Playwright browser contexts to represent:

- one host display;
- 3–8 phone players;
- a late joiner;
- a disconnected/reconnected player;
- a malicious non-member.

Essential E2E scenario:

1. Host creates room.
2. Players join via code.
3. Everyone readies.
4. Trading opens.
5. Players place orders.
6. Round starts and private inputs appear.
7. Submissions lock.
8. Server settles.
9. All clients show identical public results.
10. Portfolios and friend prices match the ledger.
11. One player reconnects and receives the same state.

### 14.4 Visual and responsive tests

Keep the existing viewport matrix and add:

- host TV view at `1920 × 1080`;
- common Android phone sizes;
- iPhone Safari profile where available;
- portrait/landscape controller states;
- screenshot regression for every major stage;
- minimum background image resolution checks;
- reduced-motion mode;
- 200% browser zoom.

### 14.5 Load tests

Before public release, simulate at least:

- 100 simultaneous rooms;
- 8 players per room;
- countdown broadcasts;
- submission bursts at lock time;
- settlement broadcasts;
- reconnect storms.

Measure channel join latency, settlement duration, database contention and Edge Function quote cache hit rate.

## 15. Performance and accessibility

### Performance targets

- Keep initial mobile JS reasonably small through route/game code splitting.
- Load only the active background crop.
- Preload the current background and critical font subset.
- Lazy-load non-active minigames.
- Avoid polling when no active room needs quotes.
- Use GPU-friendly transforms and opacity for animation.
- Target smooth interaction on mid-range Android devices.

### Accessibility requirements

- keyboard access for desktop controls;
- visible focus states;
- screen-reader labels for market changes and game actions;
- reduced-motion support;
- no information communicated only through red/green colour;
- sufficient contrast over variable background areas;
- vibration and audio feedback must have settings and visual alternatives.

## 16. Deployment and operations

### Frontend

- Build with Vite in GitHub Actions.
- Deploy static `dist/` to GitHub Pages.
- Use immutable hashed assets.
- Maintain a preview deployment per pull request where practical.

### Backend

- Supabase migrations and Edge Functions committed in the same repository.
- Separate local, staging and production Supabase projects before public launch.
- Secrets configured only in Supabase/GitHub environments.
- Database backups and migration rollback notes.

### Observability

Track:

- room creation/join failures;
- Realtime disconnects;
- round settlement failures;
- duplicate/idempotent command rate;
- quote cache hit rate;
- provider errors;
- game completion/abandonment;
- slow mobile interactions.

Do not log private answers, access tokens or secret information.

## 17. Pull-request delivery sequence

### PR 1 — Current prototype baseline

Status: current open PR.

Exit criteria:

- approved visual direction;
- responsive tests pass;
- high-quality background assets replace compressed placeholders;
- prototype is deployable on GitHub Pages.

### PR 2 — Vite/React/TypeScript parity migration

- reproduce every existing screen and interaction;
- preserve design exactly;
- establish domain types, routing and test harness;
- no new product features until parity is confirmed.

### PR 3 — Local session engine

- explicit session state machine;
- lobby and player setup;
- host settings;
- deterministic settlement;
- complete local game-night flow.

### PR 4 — Minigame plugin framework

- common game contract;
- migrate existing five games;
- add Minority Rules, Prisoner’s Dilemma and Prediction Round;
- unit tests for every scoring model.

### PR 5 — Complete paper-trading engine

- separate real and friend accounts;
- transaction ledger;
- fractional shares;
- P/L calculations;
- trading locks and stale quote rules;
- provider abstraction with fixture/replay data.

### PR 6 — Supabase foundation

- Supabase local project and migrations;
- anonymous Auth and optional account linking;
- profiles, rooms and membership;
- RLS test suite;
- staging configuration.

### PR 7 — Realtime rooms and controller mode

- QR join;
- Presence for online/ready state;
- private Broadcast channels;
- host screen plus phone controller;
- reconnect and host transfer.

### PR 8 — Authoritative rounds and Friend Market settlement

- server timestamps and state transitions;
- private submissions;
- scoring validation;
- transactional friend repricing;
- server-generated result/news events.

### PR 9 — Persistent paper accounts and order execution

- database-backed portfolios;
- atomic paper orders;
- idempotency and concurrency tests;
- season account creation/reset.

### PR 10 — Real market quote proxy

- provider spike and licensing decision;
- Edge Function adapter;
- batching, caching and stale fallback;
- quote status labels;
- provider monitoring.

### PR 11 — Seasons, achievements and result sharing

- persistent ratings and history;
- season leaderboards;
- achievements/cosmetics;
- shareable session recap;
- profile upgrade flow.

### PR 12 — Launch hardening

- load tests;
- full accessibility review;
- cross-browser/device QA;
- security/RLS review;
- backup/rollback runbook;
- GitHub Pages production deployment.

## 18. Release definitions

### Local MVP

Complete when:

- 3–8 players can complete a 45-minute one-device session;
- at least eight games are polished;
- Friend Market settlement is balanced and deterministic;
- no refresh or manual state repair is needed.

### Online MVP

Complete when:

- phones join by room code/QR;
- private choices remain private;
- host and players stay synchronized;
- reconnect works;
- server settles results and friend prices;
- RLS isolation tests pass.

### Full version 1.0

Complete when:

- real paper portfolios use a properly licensed provider;
- room sessions, seasons and achievements persist;
- 10–12 strong minigames are available;
- result sharing and account recovery work;
- mobile, desktop, security, load and accessibility release gates pass.

## 19. Highest-priority next steps

1. Replace the overcompressed background assets with reviewed high-resolution AVIF/WebP versions.
2. Merge the approved prototype baseline.
3. Migrate to Vite + React + strict TypeScript without changing the visual appearance.
4. Implement the local session state machine and expectations-based Friend Market algorithm.
5. Finish and balance eight minigames locally.
6. Add Supabase only after the local game loop is genuinely fun and deterministic.
7. Add Realtime multiplayer before live market data.
8. Add the market-data provider last among core infrastructure so the party game never depends on it to function.

This sequence minimizes risk: first preserve the premium UI, then prove the game loop, then network it, and only then integrate external financial data.