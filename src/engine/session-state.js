import {
  ACHIEVEMENTS,
  APP_VERSION,
  DEFAULT_PLAYERS,
  DEFAULT_SETTINGS,
  PHASES,
  REAL_ASSETS,
} from '../config.js';
import { createAccount, normalizeAccount } from './portfolio.js';
import { defaultRatings } from './pricing.js';
import { clamp, round, uid } from './random.js';

export function nowIso() {
  return new Date().toISOString();
}

function sanitizeTicker(value, fallback = 'FRD') {
  const ticker = String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  return ticker || fallback;
}

function makePlayer(source, index) {
  return {
    id: source.id || uid('player'),
    name: String(source.name || `Player ${index + 1}`).trim().slice(0, 24),
    ticker: sanitizeTicker(source.ticker, `P${index + 1}`),
    color: source.color || '#9a8f78',
    isBot: Boolean(source.isBot),
    connected: source.connected !== false,
    ready: Boolean(source.ready),
    ratings: source.ratings ? structuredClone(source.ratings) : defaultRatings(),
    xp: Number(source.xp ?? 0),
    achievements: [...(source.achievements ?? [])],
    role: source.role ?? (index === 0 ? 'host' : 'player'),
    seat: Number(source.seat ?? index + 1),
  };
}

function uniqueTickers(players) {
  const seen = new Set();
  return players.map((player, index) => {
    let ticker = sanitizeTicker(player.ticker, `P${index + 1}`);
    if (seen.has(ticker)) {
      let suffix = 2;
      while (seen.has(`${ticker.slice(0, 3)}${suffix}`)) suffix += 1;
      ticker = `${ticker.slice(0, 3)}${suffix}`;
    }
    seen.add(ticker);
    return { ...player, ticker };
  });
}

function createRealMarket() {
  return Object.fromEntries(REAL_ASSETS.map((asset, index) => [asset.symbol, {
    ...asset,
    openPrice: asset.price,
    changePercent: 0,
    status: 'DEMO',
    updatedAt: nowIso(),
    history: Array.from({ length: 20 }, (_, point) => ({
      price: round(asset.price * (0.985 + (point / 19) * 0.015 + Math.sin(point + index) * 0.002), 2),
      at: new Date(Date.now() - (19 - point) * 60000).toISOString(),
    })),
  }]));
}

export function createFriendMarket(players) {
  return Object.fromEntries(players.map((player, index) => {
    const price = round(80 + index * 17 + (index % 2) * 7, 2);
    return [player.id, {
      symbol: player.ticker,
      name: player.name,
      ownerId: player.id,
      price,
      previousPrice: price,
      openPrice: price,
      roundChange: 0,
      sessionChange: 0,
      sentiment: 'neutral',
      status: 'SESSION',
      updatedAt: nowIso(),
      history: [{ price, at: nowIso(), reason: 'Session open', return: 0 }],
    }];
  }));
}

export function createAccounts(players, settings) {
  return {
    friend: Object.fromEntries(players.map((player) => [player.id, createAccount(player.id, settings.startingFriendCash)])),
    real: Object.fromEntries(players.map((player) => [player.id, createAccount(player.id, settings.startingRealCash)])),
  };
}

function onlineDefaults() {
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
  };
}

export function createInitialState() {
  const players = uniqueTickers(DEFAULT_PLAYERS.map(makePlayer));
  return {
    schemaVersion: APP_VERSION,
    id: uid('state'),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    route: 'landing',
    mode: 'local',
    profilePlayerId: players[0].id,
    players,
    settings: structuredClone(DEFAULT_SETTINGS),
    session: {
      id: null,
      name: 'Market Night',
      status: PHASES.LOBBY,
      phase: PHASES.LOBBY,
      phaseEndsAt: null,
      roundIndex: -1,
      roundCount: DEFAULT_SETTINGS.roundCount,
      rounds: [],
      currentRoundId: null,
      gameQueue: [],
      scores: Object.fromEntries(players.map((player) => [player.id, 0])),
      awards: [],
      startedAt: null,
      completedAt: null,
      news: [
        {
          id: uid('news'),
          category: 'WELCOME',
          headline: 'THE GAMEKELDER MARKET PREPARES TO OPEN',
          summary: 'Create a room, edit the player list and start a complete paper-trading minigame session.',
          createdAt: nowIso(),
        },
      ],
      activity: [],
    },
    markets: {
      real: createRealMarket(),
      friend: createFriendMarket(players),
    },
    accounts: createAccounts(players, DEFAULT_SETTINGS),
    achievements: structuredClone(ACHIEVEMENTS),
    online: onlineDefaults(),
    ui: {
      activeView: 'overview',
      modal: null,
      selectedAsset: null,
      selectedMarket: 'friend',
      selectedPlayerId: players[0].id,
      toast: null,
      controllerMode: false,
      gameRuntime: null,
      quoteTick: 0,
      onlineBusy: false,
      lastProtectiveTriggers: [],
      portfolioGraphMode: 'profit',
    },
  };
}

export function normalizeState(raw) {
  if (!raw || raw.schemaVersion !== APP_VERSION) return createInitialState();
  const state = structuredClone(raw);
  state.players = uniqueTickers((state.players ?? []).map(makePlayer));
  if (state.players.length < 1 || (state.players.length < 2 && state.mode !== 'online')) return createInitialState();
  state.online = { ...onlineDefaults(), ...(state.online ?? {}) };
  state.accounts ??= createAccounts(state.players, state.settings ?? DEFAULT_SETTINGS);
  state.accounts.friend ??= {};
  state.accounts.real ??= {};
  for (const player of state.players) {
    state.accounts.friend[player.id] = normalizeAccount(
      state.accounts.friend[player.id],
      player.id,
      state.settings?.startingFriendCash ?? DEFAULT_SETTINGS.startingFriendCash,
    );
    state.accounts.real[player.id] = normalizeAccount(
      state.accounts.real[player.id],
      player.id,
      state.settings?.startingRealCash ?? DEFAULT_SETTINGS.startingRealCash,
    );
  }
  state.ui = {
    activeView: 'overview',
    modal: null,
    selectedAsset: null,
    selectedMarket: 'friend',
    selectedPlayerId: state.profilePlayerId ?? state.players[0].id,
    toast: null,
    controllerMode: false,
    gameRuntime: null,
    quoteTick: 0,
    onlineBusy: false,
    lastProtectiveTriggers: [],
    portfolioGraphMode: 'profit',
    ...(state.ui ?? {}),
  };
  if (!state.players.some((player) => player.id === state.ui.selectedPlayerId)) {
    state.ui.selectedPlayerId = state.profilePlayerId ?? state.players[0].id;
  }
  state.updatedAt = nowIso();
  return state;
}

export function configurePlayers(state, inputs) {
  if (state.session.status !== PHASES.LOBBY) throw new Error('Players can only be edited in the lobby.');
  const trimmed = inputs.slice(0, state.settings.playerLimit).map(makePlayer);
  if (trimmed.length < 2) throw new Error('At least two players are required.');
  const players = uniqueTickers(trimmed);
  const next = structuredClone(state);
  next.players = players;
  next.profilePlayerId = players.some((p) => p.id === state.profilePlayerId) ? state.profilePlayerId : players[0].id;
  next.ui.selectedPlayerId = next.profilePlayerId;
  next.session.scores = Object.fromEntries(players.map((player) => [player.id, 0]));
  next.markets.friend = createFriendMarket(players);
  next.accounts = createAccounts(players, next.settings);
  next.updatedAt = nowIso();
  return next;
}

export function updateSettings(state, updates) {
  if (state.session.status !== PHASES.LOBBY) throw new Error('Session settings are locked after the session starts.');
  const next = structuredClone(state);
  next.settings = {
    ...next.settings,
    ...updates,
    roundCount: clamp(Number(updates.roundCount ?? next.settings.roundCount), 3, 20),
    tradingSeconds: clamp(Number(updates.tradingSeconds ?? next.settings.tradingSeconds), 10, 90),
  };
  next.session.roundCount = next.settings.roundCount;
  if (next.mode !== 'online') next.accounts = createAccounts(next.players, next.settings);
  next.updatedAt = nowIso();
  return next;
}
