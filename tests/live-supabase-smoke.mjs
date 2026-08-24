import assert from 'node:assert/strict';

const SUPABASE_URL = 'https://knndezzbjzcykysasfnw.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_g-TmoO3QGY9RcH7maF27Xw_7gwqrnMl';
const PROFILE = 'friend_exchange';

function first(value) {
  return Array.isArray(value) ? value[0] : value;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail = typeof payload === 'string' ? payload : JSON.stringify(payload);
    throw new Error(`${options.method ?? 'GET'} ${url} returned ${response.status}: ${detail}`);
  }
  return payload;
}

async function createGuest(displayName) {
  const payload = await request(`${SUPABASE_URL}/functions/v1/guest-auth-v2`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ display_name: displayName }),
  });
  assert.match(payload.email, /^guest-/);
  assert.ok(payload.password?.length >= 30);
  return payload;
}

async function signIn({ email, password }) {
  const payload = await request(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  assert.ok(payload.access_token, 'Expected an access token');
  assert.ok(payload.user?.id, 'Expected a user id');
  return { token: payload.access_token, userId: payload.user.id };
}

async function rpc(token, functionName, body = {}) {
  return request(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Content-Profile': PROFILE,
      'Accept-Profile': PROFILE,
    },
    body: JSON.stringify(body),
  });
}

async function invoke(token, functionName, body = {}) {
  return request(`${SUPABASE_URL}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

async function cleanupGuest(token, label) {
  if (!token) return;
  try {
    await rpc(token, 'delete_own_guest_account');
    console.log(`PASS cleanup ${label}`);
  } catch (error) {
    console.warn(`Cleanup warning for ${label}:`, error instanceof Error ? error.message : error);
  }
}

let hostToken = null;
let playerToken = null;

try {
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const hostCredentials = await createGuest(`CI Host ${suffix}`);
  const playerCredentials = await createGuest(`CI Player ${suffix}`);
  const host = await signIn(hostCredentials);
  const player = await signIn(playerCredentials);
  hostToken = host.token;
  playerToken = player.token;
  console.log('PASS two temporary Free Plan guest identities');

  await rpc(hostToken, 'ensure_profile', { p_display_name: `CI Host ${suffix}` });
  await rpc(playerToken, 'ensure_profile', { p_display_name: `CI Player ${suffix}` });

  const settings = {
    roundCount: 3,
    startingFriendCash: 10000,
    tradingSeconds: 10,
    volatility: 'standard',
    allowOwnStock: true,
  };
  const room = first(await rpc(hostToken, 'create_room', {
    p_name: `CI Market Night ${suffix}`,
    p_settings: settings,
  }));
  assert.match(room.code, /^[A-Z0-9]{6}$/);
  const joinedRoom = first(await rpc(playerToken, 'join_room', { p_code: room.code }));
  assert.equal(joinedRoom.id, room.id);
  console.log(`PASS create/join room ${room.code}`);

  await rpc(hostToken, 'set_room_ready', { p_room_id: room.id, p_ready: true });
  await rpc(playerToken, 'set_room_ready', { p_room_id: room.id, p_ready: true });

  const gameQueue = ['reaction', 'stop-clock', 'memory-grid'];
  const session = first(await rpc(hostToken, 'start_online_session', {
    p_room_id: room.id,
    p_settings: settings,
    p_game_queue: gameQueue,
  }));
  assert.equal(session.room_id, room.id);

  let round = first(await rpc(hostToken, 'create_online_round', {
    p_session_id: session.id,
    p_sequence: 0,
    p_game_type: 'reaction',
    p_category: 'reaction',
    p_seed: `ci-${suffix}`,
    p_config: {},
    p_trading_seconds: 10,
  }));
  assert.equal(round.status, 'trading');
  assert.ok(new Date(round.locks_at).getTime() > Date.now());

  const tradingSnapshot = await rpc(hostToken, 'room_snapshot', { p_room_id: room.id });
  assert.equal(tradingSnapshot.members.length, 2);
  assert.equal(tradingSnapshot.session.friend_assets.length, 2);
  assert.equal(tradingSnapshot.my_portfolios.length, 1);

  const hostPortfolio = tradingSnapshot.my_portfolios[0];
  const targetAsset = tradingSnapshot.session.friend_assets.find((asset) => asset.owner_id !== host.userId)
    ?? tradingSnapshot.session.friend_assets[0];
  const order = await rpc(hostToken, 'execute_paper_order', {
    p_portfolio_id: hostPortfolio.id,
    p_symbol: targetAsset.symbol,
    p_side: 'buy',
    p_notional: 750,
    p_quantity: null,
    p_idempotency_key: `ci-order-${crypto.randomUUID()}`,
  });
  assert.equal(order.order.status, 'filled');
  assert.ok(Number(order.trade.quantity) > 0);
  console.log(`PASS transactional fictional order in ${targetAsset.symbol}`);

  const waitMs = Math.max(0, new Date(round.locks_at).getTime() - Date.now() + 350);
  await sleep(waitMs);

  let lateOrderRejected = false;
  try {
    await rpc(hostToken, 'execute_paper_order', {
      p_portfolio_id: hostPortfolio.id,
      p_symbol: targetAsset.symbol,
      p_side: 'buy',
      p_notional: 100,
      p_quantity: null,
      p_idempotency_key: `ci-late-${crypto.randomUUID()}`,
    });
  } catch (error) {
    lateOrderRejected = /trading deadline has passed/i.test(String(error));
  }
  assert.equal(lateOrderRejected, true, 'Database must reject a Friend Market order after locks_at');
  console.log('PASS database rejects an order after the authoritative trading deadline');

  round = first(await rpc(playerToken, 'expire_trading_window', { p_round_id: round.id }));
  assert.equal(round.status, 'locked', 'Any room member should be able to finalize an expired market window');
  const duplicateExpiry = first(await rpc(hostToken, 'expire_trading_window', { p_round_id: round.id }));
  assert.equal(duplicateExpiry.status, 'locked', 'Expiry should be idempotent');
  console.log('PASS expired trading phase auto-finalizes without relying on the host timer');

  round = first(await rpc(hostToken, 'transition_online_round', {
    p_round_id: round.id,
    p_expected_version: round.version,
    p_next_status: 'game',
    p_duration_seconds: 30,
  }));
  assert.equal(round.status, 'game');

  await rpc(hostToken, 'submit_round_input', {
    p_round_id: round.id,
    p_payload: { reactionMs: 218, falseStart: false },
    p_client_nonce: `ci-host-${crypto.randomUUID()}`,
  });
  await rpc(playerToken, 'submit_round_input', {
    p_round_id: round.id,
    p_payload: { reactionMs: 438, falseStart: false },
    p_client_nonce: `ci-player-${crypto.randomUUID()}`,
  });

  const settlement = await invoke(hostToken, 'settle-round', { round_id: round.id, force: false });
  assert.equal(settlement.duplicate, false);
  assert.equal(settlement.results.length, 2);
  assert.equal(settlement.moves.length, 2);
  assert.ok(settlement.moves.some((move) => Math.abs(Number(move.return)) > 0.0001));
  console.log('PASS authoritative reaction settlement');

  const hostSnapshot = await rpc(hostToken, 'room_snapshot', { p_room_id: room.id });
  const playerSnapshot = await rpc(playerToken, 'room_snapshot', { p_room_id: room.id });
  assert.equal(hostSnapshot.round_results.length, 2);
  assert.equal(hostSnapshot.market_moves.length, 2);
  assert.equal(playerSnapshot.market_moves.length, 2);

  const hostMoves = [...hostSnapshot.market_moves]
    .map((move) => ({
      owner: move.owner_id,
      old: Number(move.old_price),
      next: Number(move.new_price),
      percent: Number(move.return_percent),
    }))
    .sort((left, right) => left.owner.localeCompare(right.owner));
  const playerMoves = [...playerSnapshot.market_moves]
    .map((move) => ({
      owner: move.owner_id,
      old: Number(move.old_price),
      next: Number(move.new_price),
      percent: Number(move.return_percent),
    }))
    .sort((left, right) => left.owner.localeCompare(right.owner));
  assert.deepEqual(playerMoves, hostMoves, 'Both devices must receive identical settled prices');
  for (const move of hostMoves) {
    assert.ok(move.old > 0);
    assert.ok(move.next > 0);
    assert.ok(Math.abs(move.percent) <= 0.18);
    assert.ok(Math.abs(move.next - move.old) > 0.0001, 'Expected visible before/after price movement');
  }

  const position = hostSnapshot.my_positions.find((candidate) => candidate.symbol === targetAsset.symbol);
  assert.ok(position, 'Purchased position should remain in the reconnect snapshot');
  const targetMove = hostMoves.find((move) => move.owner === targetAsset.owner_id);
  const directImpact = Number(position.quantity) * (targetMove.next - targetMove.old);
  assert.ok(Number.isFinite(directImpact));
  assert.notEqual(directImpact, 0);
  console.log(`PASS synchronized before/after market prices and portfolio impact (${directImpact.toFixed(2)})`);

  const completedRound = first(await rpc(hostToken, 'complete_round', { p_round_id: round.id }));
  assert.equal(completedRound.status, 'complete');
  console.log('All live Supabase smoke checks passed.');
} finally {
  // Remove the non-host first, then the host. Host cleanup also removes the test room.
  await cleanupGuest(playerToken, 'player');
  await cleanupGuest(hostToken, 'host');
}
