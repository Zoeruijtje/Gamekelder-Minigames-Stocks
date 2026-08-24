import assert from 'node:assert/strict';
import test from 'node:test';
import { settleFriendMarket } from '../src/engine/pricing.js';

const players = [
  { id: 'a', ratings: { reaction: 1000 } },
  { id: 'b', ratings: { reaction: 1000 } },
  { id: 'c', ratings: { reaction: 1000 } },
];
const market = {
  a: { symbol: 'AAA', price: 100, openPrice: 100, history: [], sentiment: 'neutral' },
  b: { symbol: 'BBB', price: 120, openPrice: 120, history: [], sentiment: 'neutral' },
  c: { symbol: 'CCC', price: 80, openPrice: 80, history: [], sentiment: 'neutral' },
};

test('settlement exposes before and after prices for every market move', () => {
  const settlement = settleFriendMarket({
    players,
    market,
    category: 'reaction',
    volatility: 'standard',
    results: [
      { playerId: 'a', normalizedScore: 1, tieBreaker: 150 },
      { playerId: 'b', normalizedScore: .55, tieBreaker: 350 },
      { playerId: 'c', normalizedScore: .1, tieBreaker: 600 },
    ],
  });
  assert.equal(settlement.moves.length, players.length);
  for (const move of settlement.moves) {
    assert.ok(move.oldPrice > 0);
    assert.ok(move.newPrice > 0);
    assert.equal(move.priceDelta, Math.round((move.newPrice - move.oldPrice) * 100) / 100);
    assert.equal(settlement.market[move.playerId].previousPrice, move.oldPrice);
    assert.equal(settlement.market[move.playerId].price, move.newPrice);
  }
  assert.ok(settlement.moves.some((move) => move.return > 0));
  assert.ok(settlement.moves.some((move) => move.return < 0));
});
