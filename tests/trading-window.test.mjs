import assert from 'node:assert/strict';
import test from 'node:test';

import { isTradingWindowOpen, tradingSecondsRemaining } from '../src/engine/deadline.js';
import { createInitialState, openTrading, startSession, updateSettings } from '../src/engine/session.js';
import { applyOnlineSnapshot } from '../src/services/online-state.js';
import { modals } from '../src/ui/templates-modals.js';
import { marketStateCard } from '../src/ui/templates-overview.js';
import { controller } from '../src/ui/templates-session.js';

function localTradingState(seconds = 35) {
  let state = createInitialState();
  state = updateSettings(state, { tradingSeconds: seconds, roundCount: 3 });
  state = startSession(state);
  return openTrading(state);
}

test('the configured pre-round trading duration creates a real countdown', () => {
  const state = localTradingState(35);
  const remaining = tradingSecondsRemaining(state);
  assert.ok(remaining >= 34 && remaining <= 35, `remaining=${remaining}`);
  assert.equal(isTradingWindowOpen(state), true);
});

test('host and phone UI explain what the trading timer does', () => {
  const state = localTradingState(35);
  const host = marketStateCard(state);
  const phone = controller(state);

  assert.match(host, /PRE-ROUND TRADING · AUTO-LOCKS IN/);
  assert.match(host, /data-trading-countdown/);
  assert.match(host, /data-trading-progress/);
  assert.match(host, /Orders close automatically at 00:00/);
  assert.match(phone, /TRADE NOW/);
  assert.match(phone, /must reach the server before 00:00/);
});

test('the order sheet disables Friend Market orders after the displayed deadline', () => {
  const state = localTradingState(35);
  state.session.phaseEndsAt = new Date(Date.now() - 1000).toISOString();
  state.ui.modal = { type: 'order', market: 'friend', symbol: state.players[0].ticker };

  assert.equal(isTradingWindowOpen(state), false);
  const html = modals(state);
  assert.match(html, /TRADING WINDOW CLOSED/);
  assert.match(html, /server-locked after the deadline/);
  assert.match(html, /data-trading-order-submit disabled/);
});

test('online countdowns compensate for Supabase server clock offset', () => {
  const now = Date.now();
  const state = localTradingState(35);
  state.mode = 'online';
  state.online.serverOffsetMs = 10_000;
  state.session.phaseEndsAt = new Date(now + 20_000).toISOString();

  const remaining = tradingSecondsRemaining(state, now);
  assert.equal(remaining, 10);
});

test('online snapshots retain server-time offset for deadline calculations', () => {
  const base = createInitialState();
  const userId = '11111111-1111-4111-8111-111111111111';
  const roomId = '22222222-2222-4222-8222-222222222222';
  const serverTime = new Date(Date.now() + 7500).toISOString();
  const snapshot = {
    server_time: serverTime,
    room: { id: roomId, code: 'ABC123', name: 'Test', status: 'lobby', host_id: userId, current_round_id: null },
    members: [{ user_id: userId, seat: 1, role: 'host', connected: true, ready: false, profile: { display_name: 'Test', ticker: 'TST', xp: 0 } }],
    session: null,
    leaderboard: [],
  };

  const mapped = applyOnlineSnapshot(base, snapshot, userId);
  assert.ok(mapped.online.serverOffsetMs >= 6500 && mapped.online.serverOffsetMs <= 8500, `offset=${mapped.online.serverOffsetMs}`);
});
