import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../src/engine/session-state.js';
import { applyOnlineSnapshot } from '../src/services/online-state.js';

const hostId = '11111111-1111-4111-8111-111111111111';
const guestId = '22222222-2222-4222-8222-222222222222';
const roomId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const sessionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const roundId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

test('online snapshots map authoritative prices and visible market moves into UI state', () => {
  const base = createInitialState();
  const snapshot = {
    room: { id: roomId, code: 'ABC123', name: 'Online Market Night', status: 'active', host_id: hostId, current_round_id: roundId },
    members: [
      { user_id: hostId, seat: 1, role: 'host', ready: false, connected: true, profile: { display_name: 'Zoë', ticker: 'ZOE', avatar_color: '#c6a47d', xp: 150 } },
      { user_id: guestId, seat: 2, role: 'player', ready: false, connected: true, profile: { display_name: 'Lars', ticker: 'LRS', avatar_color: '#879a8e', xp: 100 } },
    ],
    session: {
      id: sessionId,
      status: 'active',
      settings: { ...base.settings, gameQueue: ['reaction', 'memory-grid', 'closest-wins'] },
      round_count: 3,
      current_round_index: 0,
      started_at: new Date().toISOString(),
      rounds: [{ id: roundId, sequence: 0, game_type: 'reaction', category: 'reaction', status: 'results', seed: 'seed', config: { delayMs: 1200 }, version: 4, settled_at: new Date().toISOString() }],
      friend_assets: [
        { session_id: sessionId, owner_id: hostId, symbol: 'ZOE', price: 108, open_price: 100, previous_price: 100, round_return: .08, sentiment: 'bullish', updated_at: new Date().toISOString() },
        { session_id: sessionId, owner_id: guestId, symbol: 'LRS', price: 92, open_price: 100, previous_price: 100, round_return: -.08, sentiment: 'bearish', updated_at: new Date().toISOString() },
      ],
    },
    round_results: [
      { user_id: hostId, rank: 1, normalized_score: .95, raw_score: { label: '211 ms' }, expected_percentile: .5, actual_percentile: 1, old_price: 100, new_price: 108 },
      { user_id: guestId, rank: 2, normalized_score: .2, raw_score: { label: '612 ms' }, expected_percentile: .5, actual_percentile: 0, old_price: 100, new_price: 92 },
    ],
    market_moves: [
      { owner_id: hostId, old_price: 100, new_price: 108, return_percent: .08, reason: 'reaction' },
      { owner_id: guestId, old_price: 100, new_price: 92, return_percent: -.08, reason: 'reaction' },
    ],
    submission_user_ids: [hostId, guestId],
    my_portfolios: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', owner_id: hostId, scope: 'friend', cash: 8500, realized_pnl: 0 }],
    my_positions: [{ portfolio_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', symbol: 'LRS', quantity: 10, average_cost: 100 }],
    leaderboard: [{ user_id: hostId, cash: 8500, equity: 9420 }, { user_id: guestId, cash: 10000, equity: 10000 }],
  };

  const state = applyOnlineSnapshot(base, snapshot, hostId);
  assert.equal(state.mode, 'online');
  assert.equal(state.online.roomCode, 'ABC123');
  assert.equal(state.online.isHost, true);
  assert.equal(state.session.phase, 'results');
  assert.equal(state.markets.friend[hostId].previousPrice, 100);
  assert.equal(state.markets.friend[hostId].price, 108);
  assert.equal(state.session.rounds[0].marketMoves[0].oldPrice, 100);
  assert.equal(state.session.rounds[0].marketMoves[0].newPrice, 108);
  assert.equal(state.accounts.friend[hostId].portfolioId, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
  assert.equal(state.accounts.friend[hostId].positions.LRS.quantity, 10);
});

test('a one-player online lobby is preserved instead of resetting to local defaults', () => {
  const base = createInitialState();
  const state = applyOnlineSnapshot(base, {
    room: { id: roomId, code: 'SOLO12', name: 'Waiting Room', status: 'lobby', host_id: hostId, current_round_id: null },
    members: [{ user_id: hostId, seat: 1, role: 'host', ready: false, connected: true, profile: { display_name: 'Zoë', ticker: 'ZOE' } }],
    session: null,
    round_results: [],
    market_moves: [],
    submission_user_ids: [],
    my_portfolios: [],
    my_positions: [],
    leaderboard: [],
  }, hostId);
  assert.equal(state.players.length, 1);
  assert.equal(state.route, 'lobby');
  assert.equal(state.mode, 'online');
});
