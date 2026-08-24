import test from 'node:test';
import assert from 'node:assert/strict';

import { createAccount, placeOrder, portfolioSnapshot } from '../src/engine/portfolio.js';
import {
  advanceAfterResults,
  beginGame,
  createInitialState,
  currentRound,
  friendQuotesBySymbol,
  lockTrading,
  openTrading,
  placePaperOrder,
  settleRound,
  startSession,
} from '../src/engine/session.js';
import { settleFriendMarket } from '../src/engine/pricing.js';

const quote = { TEST: { price: 100, status: 'DEMO', updatedAt: new Date().toISOString() } };

test('paper orders preserve cash and quantity invariants', () => {
  const account = createAccount('player', 1000);
  const buy = placeOrder(account, quote, { symbol: 'TEST', side: 'buy', notional: 500, idempotencyKey: 'one' });
  assert.equal(buy.account.cash, 500);
  assert.equal(buy.account.positions.TEST.quantity, 5);
  const duplicate = placeOrder(buy.account, quote, { symbol: 'TEST', side: 'buy', notional: 500, idempotencyKey: 'one' });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.account.cash, 500);
  const sell = placeOrder(buy.account, { TEST: { ...quote.TEST, price: 120 } }, { symbol: 'TEST', side: 'sell', quantity: 2, idempotencyKey: 'two' });
  assert.equal(sell.account.cash, 740);
  assert.equal(sell.account.positions.TEST.quantity, 3);
  assert.equal(sell.account.realizedPnl, 40);
  assert.throws(() => placeOrder(sell.account, quote, { symbol: 'TEST', side: 'sell', quantity: 4 }), /only own/i);
});

test('friend market settlement is bounded and deterministic', () => {
  const state = createInitialState();
  const results = state.players.map((player, index) => ({ playerId: player.id, normalizedScore: 1 - index * 0.25, tieBreaker: index }));
  const first = settleFriendMarket({ players: state.players, results, market: state.markets.friend, category: 'reaction', volatility: 'standard' });
  const second = settleFriendMarket({ players: state.players, results, market: state.markets.friend, category: 'reaction', volatility: 'standard' });
  assert.deepEqual(first.moves, second.moves);
  first.moves.forEach((move) => assert.ok(move.return >= -0.12 && move.return <= 0.12));
  Object.values(first.market).forEach((asset) => assert.ok(asset.price >= 5));
  const centered = first.moves.reduce((sum, move) => sum + move.return, 0);
  assert.ok(Math.abs(centered) < 0.02);
});

test('a complete local session can settle every round without manual repair', () => {
  let state = startSession(createInitialState());
  assert.equal(state.session.status, 'active');
  for (let index = 0; index < state.session.roundCount; index += 1) {
    assert.equal(currentRound(state).phase, 'briefing');
    state = openTrading(state);
    assert.equal(state.session.phase, 'trading');
    state = lockTrading(state);
    state = beginGame(state);
    state = settleRound(state);
    assert.equal(currentRound(state).phase, 'results');
    assert.equal(currentRound(state).results.length, state.players.length);
    if (index < state.session.roundCount - 1) state = advanceAfterResults(state);
    else state = advanceAfterResults(state);
  }
  assert.equal(state.session.status, 'complete');
  assert.equal(state.session.awards.length, 3);
  Object.values(state.markets.friend).forEach((asset) => assert.ok(asset.price >= 5));
});

test('friend trading is restricted to the open phase and ledger values remain consistent', () => {
  let state = startSession(createInitialState());
  const playerId = state.players[0].id;
  const asset = Object.values(state.markets.friend).find((candidate) => candidate.ownerId !== playerId);
  assert.throws(() => placePaperOrder(state, { playerId, marketType: 'friend', symbol: asset.symbol, side: 'buy', notional: 500 }), /only accepted/i);
  state = openTrading(state);
  const placed = placePaperOrder(state, { playerId, marketType: 'friend', symbol: asset.symbol, side: 'buy', notional: 500, idempotencyKey: 'friend-buy' });
  state = placed.state;
  const snapshot = portfolioSnapshot(state.accounts.friend[playerId], friendQuotesBySymbol(state));
  assert.ok(snapshot.positionsValue > 0);
  assert.ok(snapshot.cash >= 0);
  assert.equal(state.accounts.friend[playerId].ledger.length, 1);
  state = lockTrading(state);
  assert.throws(() => placePaperOrder(state, { playerId, marketType: 'friend', symbol: asset.symbol, side: 'buy', notional: 100 }), /only accepted/i);
});
