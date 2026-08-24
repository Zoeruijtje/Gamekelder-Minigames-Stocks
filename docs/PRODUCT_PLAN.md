# Product and Implementation Plan

## Product statement

Friend Exchange is a social game-night platform where players:

- paper-trade real-world stocks using fictional money;
- buy and sell fictional shares in their friends;
- play short competitive minigames;
- move Friend Market prices through their performance;
- compete both as an investor and as a publicly traded “company”.

The persistent stock layer is the meta-game. Minigames are the events that create market movement.

## Phase 0 — Static playable prototype

**Status:** implemented.

- warm gamekelder visual identity;
- responsive transparent-glass UI;
- local paper portfolio;
- simulated real-market feed;
- Friend Market;
- five local minigames;
- local leaderboard, news and activity;
- browser regression tests.

## Phase 1 — Product-quality local game night

**Goal:** make one-device/local play genuinely complete before networking.

Priority order:

1. Add a proper lobby and player editor.
2. Add session setup: starting cash, round count, volatility and game rotation.
3. Add 8–12 polished minigames with clear instructions and result states.
4. Introduce analyst expectations so performance relative to expectation drives price movement.
5. Add session close, awards and shareable result summary.
6. Add audio settings and restrained feedback animations.
7. Add import/export of a local session save.
8. Expand automated interaction and accessibility tests.

Exit criteria:

- a full 30–90 minute session can be completed on one device;
- no manual page refresh or state repair is required;
- all rounds generate consistent market settlement;
- phone and desktop release tests pass.

## Phase 2 — Real paper-market pricing

**Goal:** follow genuine market prices without exposing provider secrets.

- choose a market-data provider based on licensing, delayed/real-time coverage and rate limits;
- create a Supabase Edge Function quote proxy;
- cache quotes to reduce cost and rate pressure;
- store provider timestamp and delay status;
- clearly distinguish `LIVE`, `DELAYED`, `CLOSED` and `STALE` data;
- keep all trading fictional;
- add market-hours and unavailable-feed handling.

Exit criteria:

- no provider credential exists in the browser bundle or Git history;
- stale values are visibly labelled;
- the UI remains playable when the provider is unavailable.

## Phase 3 — Supabase multiplayer foundation

**Goal:** room-code multiplayer with phones as controllers.

- Supabase Auth;
- public profiles;
- room creation/joining;
- Realtime presence;
- synchronized room state;
- private choices/votes;
- host-authoritative round lifecycle;
- server-side settlement of Friend Market results;
- reconnect and host-transfer behaviour.

The exact data and RLS design is in [`SUPABASE_PLAN.md`](SUPABASE_PLAN.md).

## Phase 4 — Persistent seasons and social systems

- persistent portfolios;
- seasons and resets;
- achievements and cosmetics;
- company and investor rankings;
- historical friend-stock charts;
- session replays and result cards;
- invitations and friend groups;
- optional moderation/admin controls.

## Phase 5 — Advanced market mechanics

Only after the basic loop is balanced:

- limit orders;
- short positions;
- dividends;
- volatility classes;
- market halts;
- prediction markets;
- event cards and confidential information;
- auctions and power-ups.

These mechanics remain fictional and should be unlocked gradually so the core party game stays understandable.

## Non-goals for the current release

- brokerage connectivity;
- real-money deposits or withdrawals;
- promises of financial profit;
- embedding private keys in GitHub Pages;
- implementing complex derivatives before the base game is fun;
- adding networking before the one-device loop is stable.
