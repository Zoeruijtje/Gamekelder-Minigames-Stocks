# Implementation status

## Production product

- GitHub Pages static frontend with warm luxury gamekelder glass UI.
- Complete local/offline game-night mode.
- Free Supabase online rooms with guest identity, Realtime, reconnect and host failover.
- Eight deterministic minigames.
- Authoritative trading deadlines, private submissions and server settlement.
- Separate Friend Market and DEMO real-symbol paper portfolios.
- Expectation-based Friend Market repricing and visible settlement explanations.
- Main-menu, resume, leave-room and edit-lobby navigation.
- Login-only owner/admin control center.

## Advanced portfolio release

- Position management from the portfolio and market screens.
- Weighted average cost, exact cost basis and marked value.
- Per-position realised, unrealised and total fictional P/L.
- Profit and price graphs based on observed data.
- Exact partial/full sell preview.
- Buy-more flow from the position manager.
- Stop loss, take profit, trailing stop and bracket protection.
- Partial-position protection.
- Authoritative protective execution after Friend Market settlement.
- Genuine online equity-event history on reconnect.
- Immutable trade history with protective-trigger metadata.

## Interaction stability

- Unchanged online snapshots no longer rerender the application.
- DEMO quote ticks patch prices, P/L and graphs in place.
- Typed values, focus, caret and scroll survive necessary full rerenders.
- Minigame input survives online synchronization and unrelated state updates.

## Security

- Public-schema ordinary tables are RLS-hardened or absent.
- All Friend Exchange browser tables use RLS.
- Private administration tables have explicit deny policies.
- Only a publishable Supabase key is shipped to the browser.
- Global admin access is role-checked server-side.
- No public admin bootstrap UI exists.
- The temporary initial owner credential must be replaced on first login.

## Deliberate limitations

- Real-world symbols use a clearly labelled local DEMO feed until a licensed market-data provider is configured.
- Protective Friend Market orders execute at the authoritative settled round price; there is no fictional intraround liquidity.
- There is no real money, brokerage connection, withdrawal, deposit or monetary prize.
