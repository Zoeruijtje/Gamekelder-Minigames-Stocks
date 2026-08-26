# Advanced portfolio and protective-order model

Friend Exchange uses fictional money only. The portfolio interface is designed to explain the result of every action before it is submitted and to keep the game economy understandable during a short trading phase.

## Position accounting

Every open position shows:

- quantity owned;
- current marked value;
- weighted average cost;
- invested cost basis;
- current price;
- unrealised profit or loss in euros and percent;
- realised profit or loss already taken on that symbol;
- combined realised and unrealised return;
- portfolio allocation;
- current drawdown from the observed position high;
- exact proceeds and realised result from selling the full position now.

The position graph starts at the current holding cycle rather than using prices from before the player owned the asset. The profit view is measured against the current weighted average cost. The price view can display the average-cost, stop, target and trailing-trigger reference levels.

## Sell preview

The sell form supports 25%, 50%, all, or an exact share quantity. Before submission it calculates:

- shares sold;
- sale proceeds;
- cost basis removed;
- realised profit or loss;
- realised percentage return;
- cash after execution;
- shares and value remaining;
- portfolio realised P/L after execution.

Online Friend Market orders remain server-authoritative. The database locks the portfolio row, validates ownership and available shares, and records one immutable fill per idempotency key.

## Protective orders

A position can have one active protection plan:

- **Stop loss:** sells when a settled price is at or below the stop.
- **Take profit:** sells when a settled price is at or above the target.
- **Trailing stop:** follows the highest observed price and sells after the configured percentage decline.
- **Bracket:** combines a lower stop and upper target; the first crossed boundary closes the protected quantity.

Players can protect 1–100% of a position. Protection can be created, changed or cancelled only while the pre-round Friend Market trading window is open. Once saved, it stays active through locked and minigame phases.

Friend Market protection is evaluated after the authoritative round settlement price is committed. It does not pretend to execute at an intraround price that never existed. A large minigame-induced gap therefore fills at the settled price, which can be below a stop or above a target. This behaviour is deliberate and is stated in the interface.

The local DEMO real-symbol market evaluates protection against its local simulated quote ticks while the app is running. It is not live exchange data and is never described as brokerage execution.

## Portfolio history

Portfolio graphs use observed events only:

- portfolio opening;
- completed trade;
- completed protective trade;
- authoritative Friend Market settlement.

Online equity events are stored in `friend_exchange.portfolio_equity_events` and restored on reconnect. Decorative mathematical curves are not used as historical performance.

## Interaction preservation

The application still uses deterministic full-state rendering for major transitions, but typed input is captured and restored around a render. The preserved interaction includes:

- input and textarea values;
- checkbox and radio state;
- focus and caret position;
- modal and table scroll;
- open disclosure panels.

Unchanged online snapshots are fingerprinted and do not rerender the app. Five-second DEMO quote ticks update the relevant price, P/L and graph nodes directly. Quote ticks are silent while the player is typing or playing a minigame.

## Security

- All money is fictional.
- Browser code cannot bypass online cash, share, deadline or ownership checks.
- `protective_orders` is protected by RLS and owner-only reads.
- Settlement and protective execution use server-side functions.
- Protective fills are linked to the source order and recorded in the immutable trade ledger.
- The browser receives no service-role or provider credential.
