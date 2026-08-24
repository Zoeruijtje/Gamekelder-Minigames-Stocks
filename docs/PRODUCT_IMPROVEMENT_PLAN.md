# Friend Exchange — Product Improvement Plan

## Goal

Turn the current technically functional MVP into a party game people can understand in under a minute, enjoy for an entire game night, and want to replay because the trading decisions and minigames genuinely affect one another.

The intended product loop is:

> **Read the market → position your fictional portfolio → trading auto-locks → play → watch the Friend Market reprice → understand why → adjust next round.**

The strongest part of the concept is not the stock dashboard by itself and not the minigames by themselves. It is the feedback loop between **prediction, exposure, performance and market consequences**. Every product decision should make that loop clearer or deeper.

---

# Audit summary

## What already works well

- Distinct warm luxury / architectural glass visual identity.
- Strong game premise: every friend is both a player and a tradable fictional company.
- Separate Friend Market and real-symbol paper portfolio concepts.
- Cross-device rooms with private submissions and authoritative settlement.
- Eight different minigame mechanics.
- Expectation-based Friend Market repricing rather than a simplistic “winner always +10%” rule.
- Visible settlement showing old price, new price and percentage movement.
- Separate investor, company and game-performance rankings.
- Local/offline fallback.

## Highest-impact problems found

### P0 — The pre-round trading phase was not truly authoritative

The UI displayed a 35-second countdown, but the database accepted Friend Market orders as long as the round still had status `trading`. The status transition depended on a browser timer, so background-tab throttling or a sleeping host device could leave the market open after the displayed deadline.

**Fix in `fix/authoritative-trading-window`:**

- Database checks `locks_at` on every order.
- Orders arriving at or after the deadline are rejected even if a browser has not transitioned the UI yet.
- Any authenticated room member may idempotently finalize an expired trading phase.
- Client countdown uses Supabase server time offset.
- Host, controller and order-sheet interfaces show the same live deadline.
- The setting is renamed from vague “Trading window” to “Pre-round Friend Market trading time”.

### P0 — The core round loop is still too implicit

A new player sees a sophisticated dashboard before understanding the four actions that matter:

1. Trade friends.
2. Stop trading.
3. Play the minigame.
4. See prices move.

The application should explicitly teach and reinforce that sequence, especially in the first two rounds.

### P1 — Players do not have enough information to make strategic trades

Prices settle on performance **versus expectation**, but pre-round expectations are mostly invisible until after the result. That means the most interesting market mechanic is currently difficult to trade intelligently.

The game needs an **analyst board** before every round showing approximate expectations such as:

- ZOE — favourite · expected top 25%
- LRS — neutral · expected middle 50%
- MKE — underdog · expected bottom 30%

Do not expose an exact deterministic result. Expose the market's prior expectation so players can identify over/under-performance opportunities.

### P1 — The main portfolio chart is synthetic

The current combined-equity chart constructs a decorative series around current equity instead of plotting actual portfolio history. That is acceptable in a mock-up but should not survive into the polished product.

Every cash change, trade fill and settlement should append a timestamped equity snapshot. Charts should then represent real game events.

### P1 — Game-night information hierarchy still feels like a finance dashboard

During a live session, the most important items are:

- current phase;
- countdown;
- next/current minigame;
- current friend-stock prices;
- the player's Friend Market cash and exposure;
- expectations;
- what changed last round.

Long-term real-symbol paper trading should remain available, but it should not visually compete with the active party-game loop.

### P1 — Several games are mechanically too shallow for repeated sessions

The eight-game variety is good, but some games effectively resolve from one click or one question. Repeated game nights need variation, progression and multi-trial scoring.

### P2 — Session completion lacks a memorable recap

The existing awards are functional but a game night should end with a shareable “market close” story: biggest trade, biggest surprise, best stock, worst stock, richest investor, comeback, betrayal statistics, etc.

---

# Milestone 1 — Core loop clarity and reliability

**Priority: immediate**

## 1.1 Authoritative trading deadline

Implement the current branch completely and keep it as a permanent invariant:

- server owns the deadline;
- browser only visualizes it;
- after `locks_at`, no Friend Market order is valid;
- countdown reaches 00:00 on every device from the same server clock;
- phase automatically changes to `locked` without requiring the host to press anything;
- host retains “End trading early” as an explicit optional control.

### UX treatment

During trading, show one dominant warm-glass strip:

```text
PRE-ROUND TRADING · AUTO-LOCKS IN
00:27
Buy or sell Friend Market shares now.
████████████████░░░░
```

The order sheet itself must repeat the countdown. A player should never wonder whether the timer applies to the minigame, the overall session or stock trading.

### Tests

- 35-second setting yields approximately 35 seconds.
- At one millisecond after database `locks_at`, an order is rejected.
- Expiry is idempotent from two simultaneous clients.
- A backgrounded host is not required for deadline enforcement.
- Countdown is based on server-time offset online.
- Phone and desktop show the same semantic phase.

## 1.2 First-session guided tutorial

For the first session only, add a four-step overlay:

1. **Buy the people you think will outperform.**
2. **Trading closes automatically.**
3. **Everyone plays privately.**
4. **Performance versus expectation moves the stocks.**

Allow “Don't show again”.

## 1.3 Phase-driven interface

Rather than leaving the entire dashboard equally prominent, change emphasis by phase:

- Briefing → game + analyst expectations.
- Trading → trading desk + timer.
- Locked → positions frozen + game launch.
- Game → controller/game dominates.
- Settlement → market movement dominates.
- Results → portfolio impact + explanation + next-round teaser.

Keep navigation available, but make the correct next action visually obvious.

## 1.4 Better order flow

Add quick actions to Friend Market orders:

- €250
- €500
- €1,000
- 25% cash
- 50% cash
- Max affordable
- Sell 25%
- Sell 50%
- Sell all

Show before confirmation:

- current position;
- amount after trade;
- percentage of Friend Market portfolio exposed;
- estimated shares;
- selected player's recent performance.

---

# Milestone 2 — Make the market strategically interesting

**Priority: very high**

## 2.1 Pre-round analyst expectations

This is probably the single most important gameplay addition after the timer fix.

Before trading opens, calculate the expected percentile from the relevant category rating. Present this as understandable market language instead of raw model numbers:

| Expected percentile | Label |
|---|---|
| ≥ 0.75 | Strong favourite |
| 0.60–0.74 | Favoured |
| 0.40–0.59 | Neutral |
| 0.25–0.39 | Underdog |
| < 0.25 | Long shot |

Also show confidence based on games played. A new player's forecast should be visibly uncertain.

## 2.2 Analyst surprise as the settlement hero

Results should tell a story:

> **MKE BEATS EXPECTATION BY 34 POINTS — STOCK +9.8%**

rather than showing only `MKE +9.8%`.

Each result card should show:

- expected placement/percentile;
- actual placement/percentile;
- surprise;
- stock return;
- old → new price;
- selected investor's P/L on that stock.

## 2.3 Actual portfolio history

Replace the synthetic overview curve with event-sourced equity history.

Create portfolio history events after:

- session open;
- every fill;
- every Friend Market settlement;
- real-symbol quote refresh where relevant;
- session close.

Chart markers can identify `TRADE`, `ROUND 3`, `+€412`, etc.

## 2.4 Price-history event charts

Friend Market stock charts should look like discrete game-market charts, not generic smooth stock sparklines.

Show:

- opening price;
- each settlement step;
- round/game icon or number;
- tooltip with game, expectation surprise and percentage move.

## 2.5 Simplify opening prices

Consider listing every Friend Market company at **€100.00** at session start. The current varied opening prices add flavour but not meaningful gameplay; €100 makes percentage moves immediately understandable and comparisons easier.

Test both variants with players before changing permanently.

## 2.6 Market events later, not random noise

Once the base game is balanced, introduce optional events such as:

- Earnings Round — double expectation sensitivity.
- Low Liquidity — wider circuit breaker.
- Analyst Upgrade — expectation changes before trading.
- Sector Shock — affects team/category groupings.

Never inject unexplained random price movement into the standard competitive mode.

---

# Milestone 3 — Make the minigames replayable

**Priority: high**

## 3.1 Reaction Test

Upgrade from one reaction to 3–5 trials:

- discard obvious false starts;
- median of valid trials;
- occasional fake-ready delay;
- optional pressure mode where the current market position is visible before the final trial.

## 3.2 Stop the Clock

Use three targets rather than always 5.000 seconds, e.g.:

- 3.750 s
- 7.200 s
- 11.000 s

Hide the timer after starting. Use mean or median normalized error.

## 3.3 Memory Grid

Progressive rounds:

- 4×4 → 5×5;
- increasing pattern length;
- sequence mode versus static-pattern mode;
- brief distractions between reveal and answer.

## 3.4 Closest Wins

Build a much larger curated question bank and categories:

- world;
- technology;
- gaming;
- sports;
- absurd estimates;
- custom friend-group questions.

Questions need stable factual answers or versioned timestamps.

## 3.5 Higher / Lower

Turn it into a rapid 5–10-card run with streak scoring and a visible combo meter.

## 3.6 Minority Rules

Use interesting prompts rather than abstract A/B whenever possible:

> Take €300 safe cash OR gamble for €800?

> Protect your own company OR hurt the market leader?

This creates social discussion before the secret decision.

## 3.7 Prisoner's Dilemma

Run 3–5 interactions with changing anonymous/random partners. Reveal the history at the end. Track:

- cooperation rate;
- betrayal rate;
- revenge behaviour;
- most trustworthy player.

These become session recap statistics.

## 3.8 Prediction Desk

Tie it directly to the **next announced minigame**. Players should predict which company will outperform the analyst expectation rather than choose against hidden unexplained signals.

That makes Prediction Desk a genuine market-analysis round.

---

# Milestone 4 — Host screen and phone controller as separate products

**Priority: high**

## Host / TV display

Optimize for people several metres away:

- current room code / QR in lobby only;
- huge phase countdown;
- current minigame title;
- live submission count without private answers;
- public Friend Market board;
- cinematic settlement animation;
- final awards.

Avoid dense tables on TV.

## Phone controller

One primary task per screen:

- Lobby → ready.
- Trading → positions + quick buy/sell.
- Locked → “orders frozen”.
- Game → game controls only.
- Submitted → private waiting state.
- Results → personal P/L and room result.

Use a small bottom navigation for optional Portfolio / Market / Room views instead of desktop-style navigation.

## Invitation flow

The backend already has QR-generation capability. Integrate it in the lobby:

- large QR;
- room code underneath;
- one-tap copy invite URL;
- “2 of 5 joined” status.

---

# Milestone 5 — Session storytelling and replay value

**Priority: medium-high**

## 5.1 Market-close recap

Generate a premium end screen containing:

- Richest Investor
- Best Company
- Game Champion
- Biggest Trade
- Biggest Round Gain
- Biggest Crash
- Best Underdog Performance
- Worst Favourite Miss
- Best Prediction
- Most Cooperative
- Biggest Betrayer
- Comeback of the Night

## 5.2 Friend Group history

Optional persistent group:

- sessions played;
- all-time fictional P/L;
- company rating history;
- game-category ratings;
- head-to-head records;
- achievements.

## 5.3 Seasons

A season can consist of 3–10 game nights. Keep:

- Friend Market ratings;
- game ratings;
- trophies;

while resetting session cash every game night.

## 5.4 Friend Group Wrapped

After enough sessions, create a shareable recap:

- “Most overvalued friend”
- “Best trader”
- “Market's biggest disappointment”
- “Reaction king”
- “Most likely to betray”

This has significantly more social/replay value than a generic leaderboard.

---

# Milestone 6 — Product polish

## Real-symbol paper portfolio

Until a free/licensed quote source is selected, keep this clearly labelled as **DEMO**. Do not let the demo feed dominate the party-game interface.

If real prices are added later:

- Edge Function proxy only;
- timestamp every quote;
- show LIVE / DELAYED / CLOSED / STALE;
- never fabricate a live quote;
- cache aggressively for Supabase Free Plan efficiency.

## PWA

The manifest exists, but complete the installable experience:

- service worker;
- app icons;
- offline shell;
- update prompt;
- clear cache/version strategy.

## Audio and haptics

Optional, muted by preference:

- opening bell;
- final 5 trading seconds;
- lock sound;
- reaction GO cue;
- settlement rise/fall cue;
- small mobile vibration for lock/submission.

No constant casino sounds.

## Accessibility

- keyboard operation for all games where possible;
- visible focus states;
- sufficient text contrast over glass;
- screen-reader phase announcements;
- non-colour indication of positive/negative moves;
- reduced-motion equivalents;
- minimum mobile touch targets ≈44 px.

## Resilience

- clear reconnect banner;
- last successful sync time;
- host migration message;
- provider/backend outage state;
- retry controls that never duplicate orders or submissions.

## Deployment hygiene

The Pages workflow currently publishes the repository tree. Move toward a small `dist/` artifact containing only the runtime site rather than tests, docs and backend source. This reduces unnecessary deployment payload and makes production contents explicit.

---

# Recommended implementation order

## Release 0.4 — Make the loop obvious

1. Authoritative trading deadline.
2. Prominent timer on host, phone and order sheet.
3. Pre-round phase tutorial.
4. Analyst expectation board.
5. Trading-focused phone screen.
6. Quick order sizes.
7. Actual portfolio history.

**Success criterion:** a new player can explain the loop after one round without being coached.

## Release 0.5 — Make the games worth replaying

1. Multi-trial Reaction Test.
2. Variable Stop the Clock.
3. Progressive Memory Grid.
4. Large question bank.
5. Rapid Higher / Lower streaks.
6. Prompt-driven Minority Rules.
7. Multi-turn Prisoner's Dilemma.
8. Real next-round Prediction Desk.

**Success criterion:** a second 8-round session does not feel like repeating the first one.

## Release 0.6 — Make it feel like a finished party game

1. Dedicated TV layout.
2. Controller bottom navigation.
3. QR invite flow.
4. Settlement presentation pass.
5. Market-close recap.
6. Optional sound/haptics.
7. PWA install/offline shell.

**Success criterion:** a group can start and finish a game night from the public URL without developer explanation.

## Release 1.0 — Retention

1. Friend groups.
2. Persistent ratings/history.
3. Seasons.
4. Expanded achievements.
5. Friend Group Wrapped.
6. Moderation, observability and production hardening.

---

# Metrics worth measuring during playtests

No invasive analytics are required. For controlled tests, record:

- time from landing page to lobby;
- time from lobby to first trade;
- percentage of players who place at least one trade before round 1;
- orders attempted after deadline;
- percentage of rounds where players change positions;
- whether players can explain why a stock moved;
- average game duration;
- abandoned rounds;
- favourite and least-favourite games;
- number of players asking to play another session.

The most important qualitative question is:

> **“Before the minigame started, did you have a reason for the stocks you bought?”**

If the answer is usually no, the market side needs more useful pre-round information, not more decorative charts.
