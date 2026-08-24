import { PLAYER_COLORS, PHASES } from '../config.js';
import { GAME_CATALOG, getGame } from '../engine/games.js';
import { createAccount } from '../engine/portfolio.js';
import { defaultRatings } from '../engine/pricing.js';
import { seededRandom, shuffle } from '../engine/random.js';

export function onlineDefaults() {
  return {
    enabled: Boolean(globalThis.__FE_SUPABASE__?.url && globalThis.__FE_SUPABASE__?.publishableKey),
    status: 'idle',
    roomId: null,
    roomCode: null,
    userId: null,
    isHost: false,
    lastSyncAt: null,
    realtimeStatus: 'disconnected',
    error: null,
    gameQueue: [],
    presenceCount: 0,
    leaderboard: [],
  };
}

export function ensureOnlineState(state) {
  return {
    ...state,
    online: { ...onlineDefaults(), ...(state.online ?? {}) },
  };
}

export function buildOnlineQueue(settings, seed) {
  const enabled = settings.enabledGames.filter((id) => GAME_CATALOG[id]);
  if (!enabled.length) throw new Error('Enable at least one minigame.');
  const random = seededRandom(seed);
  const queue = [];
  while (queue.length < settings.roundCount) queue.push(...shuffle(enabled, random));
  return queue.slice(0, settings.roundCount);
}

export function buildOnlineRoundSpec(state, sequence) {
  const gameId = state.online.gameQueue[sequence] ?? state.session.gameQueue[sequence];
  const game = getGame(gameId);
  const sessionId = state.session.id;
  const seed = `${sessionId}:${sequence}:${gameId}`;
  return {
    sessionId,
    sequence,
    gameType: gameId,
    category: game.category,
    seed,
    config: game.create(seed, state.players, state.settings),
    tradingSeconds: state.settings.tradingSeconds,
  };
}

function number(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapPlayer(member, index) {
  const profile = member.profile ?? {};
  return {
    id: member.user_id,
    name: profile.display_name || `Player ${index + 1}`,
    ticker: profile.ticker || `P${index + 1}`,
    color: profile.avatar_color || PLAYER_COLORS[index % PLAYER_COLORS.length],
    isBot: false,
    connected: member.connected !== false,
    ready: Boolean(member.ready),
    ratings: defaultRatings(),
    xp: number(profile.xp),
    achievements: [],
    role: member.role,
    seat: number(member.seat, index + 1),
  };
}

function mapFriendMarket(snapshot, players, previousMarket) {
  const assets = snapshot.session?.friend_assets ?? [];
  return Object.fromEntries(assets.map((asset) => {
    const player = players.find((candidate) => candidate.id === asset.owner_id);
    const old = previousMarket?.[asset.owner_id];
    const price = number(asset.price);
    const openPrice = number(asset.open_price, price);
    const previousPrice = number(asset.previous_price, price);
    const latestPoint = {
      price,
      at: asset.updated_at,
      reason: 'Authoritative online settlement',
      return: number(asset.round_return),
      oldPrice: previousPrice,
    };
    const previousHistory = old?.history?.length ? old.history : [
      { price: openPrice, at: snapshot.session?.started_at, reason: 'Session open', return: 0 },
    ];
    const history = previousHistory.at(-1)?.price === price
      ? previousHistory
      : [...previousHistory, latestPoint].slice(-30);
    return [asset.owner_id, {
      symbol: asset.symbol,
      name: player?.name ?? asset.symbol,
      ownerId: asset.owner_id,
      price,
      openPrice,
      previousPrice,
      roundChange: number(asset.round_return) * 100,
      sessionChange: openPrice > 0 ? ((price / openPrice) - 1) * 100 : 0,
      sentiment: asset.sentiment ?? 'neutral',
      status: 'ONLINE',
      updatedAt: asset.updated_at,
      history,
    }];
  }));
}

function mapRound(row, snapshot) {
  const isCurrent = snapshot.room?.current_round_id === row.id;
  const submittedIds = new Set(isCurrent ? (snapshot.submission_user_ids ?? []) : []);
  const rawResults = isCurrent ? (snapshot.round_results ?? []) : [];
  const results = rawResults.map((result) => ({
    playerId: result.user_id,
    rank: number(result.rank),
    normalizedScore: number(result.normalized_score),
    raw: result.raw_score,
    tieBreaker: 0,
    label: result.raw_score?.label ?? `Score ${(number(result.normalized_score) * 100).toFixed(0)}%`,
    expectedPercentile: number(result.expected_percentile, .5),
    actualPercentile: number(result.actual_percentile, .5),
    oldPrice: number(result.old_price),
    newPrice: number(result.new_price),
  }));
  const resultByUser = new Map(results.map((result) => [result.playerId, result]));
  const moves = (isCurrent ? (snapshot.market_moves ?? []) : []).map((move) => {
    const result = resultByUser.get(move.owner_id);
    const oldPrice = number(move.old_price);
    const newPrice = number(move.new_price);
    return {
      playerId: move.owner_id,
      return: number(move.return_percent),
      oldPrice,
      newPrice,
      priceDelta: newPrice - oldPrice,
      reason: move.reason,
      expected: result?.expectedPercentile ?? .5,
      actual: result?.actualPercentile ?? .5,
      surprise: (result?.actualPercentile ?? .5) - (result?.expectedPercentile ?? .5),
      symbol: '',
      cap: .18,
    };
  });
  return {
    id: row.id,
    index: number(row.sequence),
    gameId: row.game_type,
    category: row.category,
    seed: row.seed,
    config: row.config ?? {},
    phase: row.status,
    version: number(row.version, 1),
    createdAt: row.created_at,
    openedAt: row.opened_at,
    lockedAt: row.locks_at,
    settledAt: row.settled_at,
    submissions: Object.fromEntries([...submittedIds].map((id) => [id, { submitted: true }])),
    results,
    marketMoves: moves,
    expectation: Object.fromEntries(results.map((result) => [result.playerId, result.expectedPercentile])),
  };
}

function mapAccounts(state, snapshot, players, userId) {
  const friend = Object.fromEntries(players.map((player) => [
    player.id,
    createAccount(player.id, state.settings.startingFriendCash),
  ]));
  const real = Object.fromEntries(players.map((player) => [
    player.id,
    state.accounts.real?.[player.id] ?? createAccount(player.id, state.settings.startingRealCash),
  ]));

  const leaderboard = new Map((snapshot.leaderboard ?? []).map((entry) => [entry.user_id, entry]));
  for (const player of players) {
    const entry = leaderboard.get(player.id);
    if (entry) friend[player.id].cash = number(entry.cash, friend[player.id].cash);
  }

  const portfolio = (snapshot.my_portfolios ?? [])[0];
  if (portfolio && userId) {
    friend[userId] = {
      ownerId: userId,
      cash: number(portfolio.cash),
      realizedPnl: number(portfolio.realized_pnl),
      ledger: [],
      portfolioId: portfolio.id,
      positions: Object.fromEntries((snapshot.my_positions ?? []).map((position) => [position.symbol, {
        quantity: number(position.quantity),
        averageCost: number(position.average_cost),
      }])),
    };
  }
  return { friend, real };
}

function onlineAwards(snapshot, players, market) {
  const leaderboard = snapshot.leaderboard ?? [];
  const richest = leaderboard[0];
  const bestCompany = Object.values(market).sort((left, right) => right.sessionChange - left.sessionChange)[0];
  const xpLeader = [...players].sort((left, right) => right.xp - left.xp)[0];
  return [
    richest ? { id: 'richest-investor', label: 'Richest Investor', playerId: richest.user_id, value: number(richest.equity) } : null,
    bestCompany ? { id: 'best-company', label: 'Best Company', playerId: bestCompany.ownerId, value: bestCompany.sessionChange } : null,
    xpLeader ? { id: 'game-champion', label: 'Game Champion', playerId: xpLeader.id, value: xpLeader.xp } : null,
  ].filter(Boolean);
}

export function applyOnlineSnapshot(inputState, snapshot, userId) {
  const state = structuredClone(ensureOnlineState(inputState));
  const players = (snapshot.members ?? []).map(mapPlayer);
  if (!players.length) return state;

  const previousSessionId = state.session.id;
  const session = snapshot.session;
  const rounds = (session?.rounds ?? []).map((round) => mapRound(round, snapshot));
  const currentRound = rounds.find((round) => round.id === snapshot.room.current_round_id) ?? rounds.at(-1) ?? null;
  const phase = currentRound?.phase ?? (snapshot.room.status === 'complete' ? PHASES.COMPLETE : PHASES.LOBBY);
  const settings = { ...state.settings, ...(session?.settings ?? snapshot.room.settings ?? {}) };
  const market = mapFriendMarket(snapshot, players, previousSessionId === session?.id ? state.markets.friend : null);

  state.mode = 'online';
  state.route = snapshot.room.status === 'lobby' ? 'lobby' : 'session';
  state.players = players;
  state.settings = settings;
  state.profilePlayerId = userId;
  state.ui.selectedPlayerId = userId;
  state.markets.friend = market;
  state.accounts = mapAccounts(state, snapshot, players, userId);
  state.session = {
    ...state.session,
    id: session?.id ?? null,
    name: snapshot.room.name,
    status: session?.status ?? snapshot.room.status,
    phase,
    phaseEndsAt: [PHASES.TRADING, PHASES.GAME].includes(currentRound?.phase)
      ? currentRound.lockedAt
      : null,
    roundIndex: currentRound?.index ?? -1,
    roundCount: number(session?.round_count, settings.roundCount),
    rounds,
    currentRoundId: currentRound?.id ?? null,
    gameQueue: session?.settings?.gameQueue ?? state.online.gameQueue ?? [],
    startedAt: session?.started_at ?? null,
    completedAt: session?.completed_at ?? null,
    awards: phase === PHASES.COMPLETE ? onlineAwards(snapshot, players, market) : state.session.awards,
    news: state.session.news,
    activity: state.session.activity,
  };
  state.online = {
    ...state.online,
    enabled: true,
    status: 'connected',
    roomId: snapshot.room.id,
    roomCode: snapshot.room.code,
    userId,
    isHost: snapshot.room.host_id === userId,
    lastSyncAt: new Date().toISOString(),
    error: null,
    gameQueue: session?.settings?.gameQueue ?? state.online.gameQueue ?? [],
    leaderboard: snapshot.leaderboard ?? [],
  };
  return state;
}

export function currentOnlineMember(state) {
  return state.players.find((player) => player.id === state.online?.userId) ?? null;
}

export function allOnlinePlayersSubmitted(state) {
  const round = state.session.rounds.find((candidate) => candidate.id === state.session.currentRoundId);
  if (!round || round.phase !== PHASES.GAME) return false;
  return state.players
    .filter((player) => player.role !== 'spectator' && player.connected !== false)
    .every((player) => Boolean(round.submissions[player.id]));
}
