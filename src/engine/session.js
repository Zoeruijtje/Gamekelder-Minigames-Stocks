import { CATEGORY_LABELS, PHASES } from '../config.js';
import { placeOrder, portfolioSnapshot } from './portfolio.js';
import { defaultRatings, explainMove, settleFriendMarket, updateRatings } from './pricing.js';
import { GAME_CATALOG, getGame, scoreGame, simulateMissingSubmissions } from './games.js';
import { round, seededRandom, shuffle, uid } from './random.js';
import {
  configurePlayers,
  createAccounts,
  createFriendMarket,
  createInitialState,
  normalizeState,
  nowIso,
  updateSettings,
} from './session-state.js';

export { configurePlayers, createInitialState, normalizeState, updateSettings } from './session-state.js';

function buildGameQueue(settings, seed) {
  const enabled = settings.enabledGames.filter((id) => GAME_CATALOG[id]);
  if (!enabled.length) throw new Error('Enable at least one minigame.');
  const random = seededRandom(seed);
  const queue = [];
  while (queue.length < settings.roundCount) {
    queue.push(...shuffle(enabled, random));
  }
  return queue.slice(0, settings.roundCount);
}

export function startSession(state) {
  if (state.players.length < 2) throw new Error('At least two players are required.');
  const next = structuredClone(state);
  const sessionId = uid('session');
  next.session = {
    ...next.session,
    id: sessionId,
    status: 'active',
    phase: PHASES.BRIEFING,
    phaseEndsAt: null,
    roundIndex: 0,
    roundCount: next.settings.roundCount,
    rounds: [],
    currentRoundId: null,
    gameQueue: buildGameQueue(next.settings, sessionId),
    scores: Object.fromEntries(next.players.map((player) => [player.id, 0])),
    awards: [],
    startedAt: nowIso(),
    completedAt: null,
    activity: [],
    news: [
      {
        id: uid('news'),
        category: 'OPENING BELL',
        headline: 'FRIEND EXCHANGE OPENS FOR MARKET NIGHT',
        summary: `${next.players.length} companies list for a ${next.settings.roundCount}-round session.`,
        createdAt: nowIso(),
      },
    ],
  };
  next.markets.friend = createFriendMarket(next.players);
  next.accounts = createAccounts(next.players, next.settings);
  next.players = next.players.map((player) => ({ ...player, ready: true }));
  next.route = 'session';
  return createNextRound(next);
}

function createNextRound(state) {
  const next = structuredClone(state);
  const index = next.session.roundIndex;
  const gameId = next.session.gameQueue[index];
  const game = getGame(gameId);
  const roundId = uid('round');
  const seed = `${next.session.id}:${index}:${gameId}`;
  const config = game.create(seed, next.players, next.settings);
  const round = {
    id: roundId,
    index,
    gameId,
    category: game.category,
    seed,
    config,
    phase: PHASES.BRIEFING,
    createdAt: nowIso(),
    openedAt: null,
    lockedAt: null,
    settledAt: null,
    submissions: {},
    results: [],
    marketMoves: [],
    expectation: {},
  };
  next.session.rounds.push(round);
  next.session.currentRoundId = roundId;
  next.session.phase = PHASES.BRIEFING;
  next.session.phaseEndsAt = null;
  next.ui.activeView = 'overview';
  next.ui.gameRuntime = null;
  next.session.activity.unshift({
    id: uid('activity'),
    text: `Round ${index + 1}: ${game.name} announced`,
    at: nowIso(),
  });
  return next;
}

export function currentRound(state) {
  return state.session.rounds.find((round) => round.id === state.session.currentRoundId) ?? null;
}

export function openTrading(state) {
  const next = structuredClone(state);
  const round = currentRound(next);
  if (!round || round.phase !== PHASES.BRIEFING) throw new Error('This round is not ready to open for trading.');
  round.phase = PHASES.TRADING;
  round.openedAt = nowIso();
  next.session.phase = PHASES.TRADING;
  next.session.phaseEndsAt = new Date(Date.now() + next.settings.tradingSeconds * 1000).toISOString();
  next.session.activity.unshift({ id: uid('activity'), text: 'Friend Market trading opened', at: nowIso() });
  return next;
}

export function lockTrading(state) {
  const next = structuredClone(state);
  const round = currentRound(next);
  if (!round || round.phase !== PHASES.TRADING) throw new Error('Trading is not currently open.');
  round.phase = PHASES.LOCKED;
  round.lockedAt = nowIso();
  next.session.phase = PHASES.LOCKED;
  next.session.phaseEndsAt = null;
  next.session.activity.unshift({ id: uid('activity'), text: 'Friend Market trading locked', at: nowIso() });
  return next;
}

export function beginGame(state) {
  const next = structuredClone(state);
  const round = currentRound(next);
  if (!round || ![PHASES.LOCKED, PHASES.BRIEFING].includes(round.phase)) throw new Error('The game cannot start from this phase.');
  round.phase = PHASES.GAME;
  next.session.phase = PHASES.GAME;
  next.session.phaseEndsAt = null;
  next.ui.modal = 'game';
  next.ui.gameRuntime = {
    playerIndex: 0,
    activePlayerId: next.players.find((player) => !player.isBot)?.id ?? next.players[0].id,
    stage: 'intro',
    startedAt: null,
    goAt: null,
    selections: [],
    answers: [],
    pairIndex: 0,
  };
  return next;
}

export function submitGame(state, playerId, submission) {
  const next = structuredClone(state);
  const round = currentRound(next);
  if (!round || round.phase !== PHASES.GAME) throw new Error('The current round is not accepting game submissions.');
  if (!next.players.some((player) => player.id === playerId)) throw new Error('Unknown player.');
  round.submissions[playerId] = structuredClone(submission);
  next.session.activity.unshift({
    id: uid('activity'),
    text: `${next.players.find((player) => player.id === playerId)?.name ?? 'Player'} submitted`,
    at: nowIso(),
  });
  return next;
}

export function settleRound(state) {
  const next = structuredClone(state);
  const round = currentRound(next);
  if (!round || round.settledAt) return next;
  if (![PHASES.GAME, PHASES.LOCKED].includes(round.phase)) throw new Error('The round cannot be settled yet.');
  round.phase = PHASES.SETTLING;
  next.session.phase = PHASES.SETTLING;

  round.submissions = simulateMissingSubmissions(round.gameId, round.seed, round.config, next.players, round.submissions);
  const results = scoreGame(round.gameId, round.config, round.submissions, next.players);
  const settlement = settleFriendMarket({
    players: next.players,
    results,
    market: next.markets.friend,
    category: round.category,
    volatility: next.settings.volatility,
  });

  round.results = settlement.ranked;
  round.expectation = settlement.expectation;
  round.marketMoves = settlement.moves;
  round.settledAt = nowIso();
  round.phase = PHASES.RESULTS;
  next.markets.friend = settlement.market;
  next.players = updateRatings(next.players, settlement.ranked, round.category, settlement.expectation);
  next.session.phase = PHASES.RESULTS;
  next.session.phaseEndsAt = null;
  next.ui.modal = 'results';
  next.ui.gameRuntime = null;

  settlement.ranked.forEach((result, index) => {
    const points = Math.max(1, (next.players.length - index) * 100);
    next.session.scores[result.playerId] = (next.session.scores[result.playerId] ?? 0) + points;
    const player = next.players.find((candidate) => candidate.id === result.playerId);
    if (player) player.xp += Math.round(points * 0.5);
  });

  settlement.ranked.forEach((result) => {
    const player = next.players.find((candidate) => candidate.id === result.playerId);
    const move = settlement.moves.find((candidate) => candidate.playerId === result.playerId);
    if (!player || !move) return;
    next.session.news.unshift({
      id: uid('news'),
      category: move.return > 0.035 ? 'BREAKING' : move.return < -0.035 ? 'MARKET ALERT' : 'ROUND REPORT',
      headline: `${player.ticker} ${move.return >= 0 ? 'GAINS' : 'FALLS'} ${Math.abs(move.return * 100).toFixed(2)}%`,
      summary: explainMove(player, result, move, CATEGORY_LABELS[round.category] ?? round.category),
      createdAt: nowIso(),
    });
  });

  unlockAchievements(next, round);
  next.session.activity.unshift({
    id: uid('activity'),
    text: `${getGame(round.gameId).name} settled and Friend Market repriced`,
    at: nowIso(),
  });
  return next;
}

function unlockAchievements(state, round) {
  for (const result of round.results) {
    const player = state.players.find((candidate) => candidate.id === result.playerId);
    const move = round.marketMoves.find((candidate) => candidate.playerId === result.playerId);
    if (!player) continue;
    const unlock = (id) => {
      if (!player.achievements.includes(id)) player.achievements.push(id);
    };
    if (Math.abs(move?.return ?? 0) >= 0.12 && (move?.return ?? 0) > 0) unlock('to-the-moon');
    if (round.gameId === 'stop-clock' && result.raw <= 50) unlock('perfect-timer');
    if (round.gameId === 'prediction-desk' && result.normalizedScore >= 1) {
      const wins = state.session.rounds.filter((candidate) => candidate.gameId === 'prediction-desk')
        .flatMap((candidate) => candidate.results)
        .filter((candidate) => candidate.playerId === player.id && candidate.normalizedScore >= 1).length;
      if (wins >= 3) unlock('oracle');
    }
  }
}

export function advanceAfterResults(state) {
  const next = structuredClone(state);
  const round = currentRound(next);
  if (!round || round.phase !== PHASES.RESULTS) throw new Error('Results are not ready to advance.');
  next.ui.modal = null;
  if (next.session.roundIndex + 1 >= next.session.roundCount) return completeSession(next);
  next.session.roundIndex += 1;
  return createNextRound(next);
}

function completeSession(state) {
  const next = structuredClone(state);
  next.session.status = PHASES.COMPLETE;
  next.session.phase = PHASES.COMPLETE;
  next.session.completedAt = nowIso();
  next.session.phaseEndsAt = null;
  next.ui.activeView = 'leaderboard';
  next.ui.modal = 'session-complete';

  const friendQuotes = friendQuotesBySymbol(next);
  const investorRanking = next.players.map((player) => ({
    playerId: player.id,
    equity: portfolioSnapshot(next.accounts.friend[player.id], friendQuotes).equity,
  })).sort((a, b) => b.equity - a.equity);
  const companyRanking = next.players.map((player) => ({
    playerId: player.id,
    return: next.markets.friend[player.id].sessionChange,
  })).sort((a, b) => b.return - a.return);
  const gameRanking = next.players.map((player) => ({
    playerId: player.id,
    score: next.session.scores[player.id] ?? 0,
  })).sort((a, b) => b.score - a.score);

  next.session.awards = [
    { id: 'richest-investor', label: 'Richest Investor', playerId: investorRanking[0].playerId, value: investorRanking[0].equity },
    { id: 'best-company', label: 'Best Company', playerId: companyRanking[0].playerId, value: companyRanking[0].return },
    { id: 'game-champion', label: 'Game Champion', playerId: gameRanking[0].playerId, value: gameRanking[0].score },
  ];
  next.session.news.unshift({
    id: uid('news'),
    category: 'MARKET CLOSE',
    headline: `${next.players.find((p) => p.id === investorRanking[0].playerId)?.name.toUpperCase()} WINS MARKET NIGHT`,
    summary: 'The session closes with final portfolio values, company returns and minigame awards.',
    createdAt: nowIso(),
  });
  return next;
}

export function resetSession(state) {
  const players = state.players.map((player) => ({ ...player, ready: false, achievements: player.achievements ?? [] }));
  const next = createInitialState();
  next.players = players;
  next.profilePlayerId = state.profilePlayerId;
  next.ui.selectedPlayerId = state.profilePlayerId;
  next.settings = structuredClone(state.settings);
  next.accounts = createAccounts(players, next.settings);
  next.markets.friend = createFriendMarket(players);
  next.route = 'lobby';
  return next;
}

export function friendQuotesBySymbol(state) {
  return Object.fromEntries(Object.values(state.markets.friend).map((asset) => [asset.symbol, asset]));
}

export function realQuotes(state) {
  return state.markets.real;
}

export function placePaperOrder(state, { playerId, marketType, symbol, side, notional, quantity, idempotencyKey }) {
  const next = structuredClone(state);
  const player = next.players.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error('Select a valid player.');

  if (marketType === 'friend') {
    const round = currentRound(next);
    if (!round || round.phase !== PHASES.TRADING) throw new Error('Friend Market orders are only accepted while trading is open.');
    const target = Object.values(next.markets.friend).find((asset) => asset.symbol === symbol);
    if (!target) throw new Error('Unknown Friend Market symbol.');
    if (!next.settings.allowOwnStock && target.ownerId === playerId) throw new Error('This session does not allow trading your own stock.');
    const quotes = friendQuotesBySymbol(next);
    const result = placeOrder(next.accounts.friend[playerId], quotes, { symbol, side, notional, quantity, idempotencyKey }, {
      assetType: 'friend',
      roomId: next.session.id,
      roundId: round.id,
    });
    next.accounts.friend[playerId] = result.account;
    unlockFirstTrade(next, playerId);
    next.session.activity.unshift({ id: uid('activity'), text: `${player.name} ${side === 'buy' ? 'bought' : 'sold'} ${symbol}`, at: nowIso() });
    return { state: next, fill: result.fill };
  }

  const result = placeOrder(next.accounts.real[playerId], next.markets.real, { symbol, side, notional, quantity, idempotencyKey }, {
    assetType: 'real',
  });
  next.accounts.real[playerId] = result.account;
  unlockFirstTrade(next, playerId);
  return { state: next, fill: result.fill };
}

function unlockFirstTrade(state, playerId) {
  const player = state.players.find((candidate) => candidate.id === playerId);
  if (player && !player.achievements.includes('first-trade')) player.achievements.push('first-trade');
}

export function tickRealQuotes(state) {
  const next = structuredClone(state);
  const tick = (next.ui.quoteTick ?? 0) + 1;
  next.ui.quoteTick = tick;
  const random = seededRandom(`quotes:${tick}`);
  Object.values(next.markets.real).forEach((asset) => {
    const drift = (random() - 0.49) * 0.006;
    asset.price = round(Math.max(1, asset.price * (1 + drift)), 2);
    asset.changePercent = round(((asset.price / asset.openPrice) - 1) * 100, 2);
    asset.updatedAt = nowIso();
    asset.history.push({ price: asset.price, at: asset.updatedAt });
    if (asset.history.length > 40) asset.history.shift();
  });
  return next;
}

export function phaseCountdown(state) {
  if (!state.session.phaseEndsAt) return null;
  return Math.max(0, Math.ceil((new Date(state.session.phaseEndsAt).getTime() - Date.now()) / 1000));
}

export function getLeaderboard(state) {
  const friendQuotes = friendQuotesBySymbol(state);
  return {
    investors: state.players.map((player) => ({
      player,
      equity: portfolioSnapshot(state.accounts.friend[player.id], friendQuotes).equity,
    })).sort((a, b) => b.equity - a.equity),
    companies: state.players.map((player) => ({
      player,
      asset: state.markets.friend[player.id],
    })).sort((a, b) => b.asset.sessionChange - a.asset.sessionChange),
    games: state.players.map((player) => ({
      player,
      score: state.session.scores[player.id] ?? 0,
    })).sort((a, b) => b.score - a.score),
  };
}

export function randomizeBotsForDemo(state) {
  const next = structuredClone(state);
  const random = seededRandom(`demo:${Date.now()}`);
  next.players = next.players.map((player, index) => ({
    ...player,
    isBot: index === 0 ? false : true,
    ratings: Object.fromEntries(Object.keys(defaultRatings()).map((category) => [category, Math.round(850 + random() * 350)])),
  }));
  return next;
}
