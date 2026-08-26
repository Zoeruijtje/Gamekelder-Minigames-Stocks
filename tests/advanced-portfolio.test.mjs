import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createAccount,
  evaluateProtectiveOrders,
  placeOrder,
  portfolioSnapshot,
  positionAnalytics,
  sellNowPreview,
  upsertProtectiveOrder,
} from '../src/engine/portfolio.js';

function quotes(price, history = [100, 110, price]) {
  return {
    ZOE: {
      symbol: 'ZOE',
      price,
      status: 'SESSION',
      updatedAt: new Date().toISOString(),
      history: history.map((value, index) => ({ price: value, at: new Date(Date.now() - (history.length - index) * 1000).toISOString() })),
    },
  };
}

test('position analytics expose exact unrealised, realised and sell-now outcomes', () => {
  let account = createAccount('player', 10_000);
  account = placeOrder(account, quotes(100), { symbol: 'ZOE', side: 'buy', notional: 4_000, idempotencyKey: 'buy' }).account;
  const analytics = positionAnalytics(account, quotes(125), 'ZOE');
  assert.equal(analytics.quantity, 40);
  assert.equal(analytics.cost, 4_000);
  assert.equal(analytics.value, 5_000);
  assert.equal(analytics.unrealizedPnl, 1_000);
  assert.equal(analytics.unrealizedPercent, 25);
  assert.equal(analytics.profitSeries.at(-1).profit, 1_000);
  const preview = sellNowPreview(account, quotes(125), 'ZOE', { quantityPercent: 50 });
  assert.equal(preview.quantity, 20);
  assert.equal(preview.proceeds, 2_500);
  assert.equal(preview.realizedPnl, 500);
  assert.equal(preview.remainingQuantity, 20);
  assert.equal(preview.cashAfter, 8_500);
});

test('a local stop loss sells the protected quantity exactly once', () => {
  let account = createAccount('player', 10_000);
  account = placeOrder(account, quotes(100), { symbol: 'ZOE', side: 'buy', notional: 5_000, idempotencyKey: 'buy' }).account;
  account = upsertProtectiveOrder(account, quotes(100), {
    symbol: 'ZOE', type: 'stop_loss', stopPrice: 90, quantityPercent: 50, idempotencyKey: 'risk-one',
  }).account;
  const first = evaluateProtectiveOrders(account, quotes(88), { referenceId: 'round-1', assetType: 'friend' });
  assert.equal(first.fills.length, 1);
  assert.equal(first.fills[0].quantity, 25);
  assert.equal(first.fills[0].realizedPnl, -300);
  assert.equal(first.account.positions.ZOE.quantity, 25);
  assert.equal(first.account.protectiveOrders[0].status, 'filled');
  const duplicate = evaluateProtectiveOrders(first.account, quotes(80), { referenceId: 'round-2', assetType: 'friend' });
  assert.equal(duplicate.fills.length, 0);
  assert.equal(duplicate.account.positions.ZOE.quantity, 25);
});

test('a trailing stop follows the peak and triggers below the trail', () => {
  let account = createAccount('player', 10_000);
  account = placeOrder(account, quotes(100), { symbol: 'ZOE', side: 'buy', notional: 2_000, idempotencyKey: 'buy' }).account;
  account = upsertProtectiveOrder(account, quotes(100), {
    symbol: 'ZOE', type: 'trailing_stop', trailPercent: 10, quantityPercent: 100, idempotencyKey: 'trail-one',
  }).account;
  const rising = evaluateProtectiveOrders(account, quotes(130), { referenceId: 'round-up' });
  assert.equal(rising.fills.length, 0);
  assert.equal(rising.account.protectiveOrders[0].peakPrice, 130);
  const triggered = evaluateProtectiveOrders(rising.account, quotes(116), { referenceId: 'round-down' });
  assert.equal(triggered.fills.length, 1);
  assert.equal(triggered.account.positions.ZOE, undefined);
  assert.equal(triggered.account.realizedPnl, 320);
});

test('equity history uses observed fills instead of decorative values', () => {
  let account = createAccount('player', 10_000);
  account = placeOrder(account, quotes(100), { symbol: 'ZOE', side: 'buy', notional: 2_000, idempotencyKey: 'buy' }).account;
  const snapshot = portfolioSnapshot(account, quotes(120));
  assert.equal(snapshot.history[0].eventType, 'opening');
  assert.equal(snapshot.history.at(-1).eventType, 'trade');
  assert.equal(snapshot.equity, 10_400);
  assert.equal(snapshot.totalPnl, 400);
});

test('position profit history starts with the current holding cycle', () => {
  let account = createAccount('player', 10_000);
  account = placeOrder(account, quotes(80, [70, 75, 80]), { symbol: 'ZOE', side: 'buy', notional: 800, idempotencyKey: 'cycle-buy-one' }).account;
  account = placeOrder(account, quotes(90, [80, 85, 90]), { symbol: 'ZOE', side: 'sell', quantity: 10, idempotencyKey: 'cycle-close-one' }).account;
  account = placeOrder(account, quotes(100, [60, 70, 80, 90, 100]), { symbol: 'ZOE', side: 'buy', notional: 1_000, idempotencyKey: 'cycle-buy-two' }).account;
  const analytics = positionAnalytics(account, quotes(110, [60, 70, 80, 90, 100, 110]), 'ZOE');
  assert.equal(analytics.profitSeries[0].profit, 0);
  assert.equal(analytics.profitSeries[0].reason, 'Position opened');
  assert.equal(analytics.profitSeries.at(-1).profit, 100);
});

test('sell preview reports post-sale realised total', () => {
  let account = createAccount('player', 10_000);
  account = placeOrder(account, quotes(100), { symbol: 'ZOE', side: 'buy', notional: 2_000, idempotencyKey: 'preview-buy' }).account;
  account = placeOrder(account, quotes(120), { symbol: 'ZOE', side: 'sell', quantity: 5, idempotencyKey: 'preview-partial' }).account;
  const preview = sellNowPreview(account, quotes(90), 'ZOE', { quantityPercent: 50 });
  assert.equal(preview.realizedPnl, -75);
  assert.equal(preview.afterSaleTotalPnl, 25);
});
