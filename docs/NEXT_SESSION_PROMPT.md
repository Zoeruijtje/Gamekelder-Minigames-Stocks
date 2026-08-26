# Next Session Prompt

Continue Friend Exchange in `Zoeruijtje/Gamekelder-Minigames-Stocks` from the advanced-portfolio release merged as `6d432ce4ef81881153971413d0e9bcc0ae496216`.

## Read first

- `README.md`
- `docs/FULL_IMPLEMENTATION_PLAN.md`
- `docs/PRODUCT_IMPROVEMENT_PLAN.md`
- `docs/MARKET_EXPERIENCE.md`
- `docs/ADVANCED_PORTFOLIO_AND_RISK.md`
- `docs/ADMIN_CONTROL_CENTER.md`
- `docs/IMPLEMENTATION_STATUS.md`
- the latest `Product QA`, `Live Supabase Smoke`, and GitHub Pages deployment results

## Objective

Make the eight minigames and the complete game-night flow substantially more replayable, social, and polished without weakening the now-authoritative market, portfolio, or security systems.

### 1. Multi-trial skill games

- Reaction Test: 3–5 randomized trials, false-start handling, median valid result, clear per-trial feedback, and an accessible alternative.
- Stop the Clock: three varying target times, hidden running timer, best/median scoring, and consistent server validation.
- Memory Grid: progressive stages, multiple board sizes, static and sequential variants, and deterministic seeded content.
- Higher / Lower: a proper 5–10-card streak round with accuracy-first scoring and speed as a secondary tie-breaker.

### 2. Richer social and estimation games

- Expand Closest Wins with curated, versioned category packs and percentage-error scoring.
- Replace generic Minority Rules A/B prompts with meaningful social, risk, and market choices.
- Run Prisoner’s Dilemma over multiple partner rounds and reveal cooperation, betrayal, revenge, and trust statistics.
- Make Prediction Desk predict the next actual minigame and reward expectation-aware predictions.
- Add admin-editable content packs with schema validation and safe fallbacks.

### 3. Host-versus-phone experience

- Make the TV/host display readable from 2–4 metres: giant phase, countdown, instructions, public progress, and cinematic reveals.
- Make the phone controller one-task-at-a-time: market, locked, game, submitted, and results states.
- Never expose private answers or hidden content on the host display before reveal.
- Add submission-progress indicators without causing full-page rerenders or resetting active controls.

### 4. Game-night presentation

- Add restrained sound, haptics, countdown cues, and reduced-motion/mute controls.
- Improve transitions from trading lock to briefing to game to settlement.
- Add a complete Market Close recap: richest investor, best company, minigame champion, biggest trade, biggest crash, best underdog, favourite miss, trust award, betrayal award, and comeback.
- Generate a shareable recap card using only fictional values.

### 5. Reliability and testing

- Preserve local/offline mode and Supabase Free Plan compatibility.
- Keep scoring deterministic and authoritative.
- Preserve every typed answer, timer state, focus position, and controller state across Realtime updates.
- Add unit tests for every scoring rule and content schema.
- Add multi-context Playwright tests with one host and at least four player controllers.
- Add reconnect, late submission, duplicate submission, host failover, reduced-motion, phone landscape, and 200% zoom tests.
- Run security/performance advisors after database changes.

## Constraints

- All money remains fictional.
- Do not add real-money trading, brokerage connections, gambling rewards, or paid infrastructure.
- Do not weaken RLS, private Realtime authorization, order idempotency, authoritative settlement, or protective-order guarantees.
- Preserve the warm luxury gamekelder and smoked-glass visual identity; avoid neon/cyberpunk or generic SaaS styling.
- Do not merge until Product QA and Live Supabase Smoke are green on the exact head commit.

## Definition of done

A group of 3–8 players can complete a 45–75 minute session in which every game has enough depth to replay, the host screen and phone controls feel intentionally different, active input never resets, the market reacts clearly to results, and the final recap feels worth sharing.

At the end of that session, replace this file with the next bounded prompt and update the single `Next session:` GitHub issue according to `docs/CONTINUATION_PROTOCOL.md`.
