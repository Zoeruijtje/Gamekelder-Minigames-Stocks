import { PLAYER_COLORS, PHASES } from './config.js';
import { getGame } from './engine/games.js';
import {
  advanceAfterResults,
  beginGame,
  configurePlayers,
  currentRound,
  lockTrading,
  openTrading,
  phaseCountdown,
  placePaperOrder,
  randomizeBotsForDemo,
  resetSession,
  settleRound,
  startSession,
  submitGame,
  updateSettings,
} from './engine/session.js';
import { uid } from './engine/random.js';
import { OnlineGameAdapter } from './services/online-adapter.js';
import {
  allOnlinePlayersSubmitted,
  applyOnlineSnapshot,
  buildOnlineQueue,
  buildOnlineRoundSpec,
  ensureOnlineState,
} from './services/online-state.js';
import { AppStore } from './store.js';
import { renderApp } from './ui/templates.js';

const root = document.querySelector('#app');
const store = new AppStore();
const onlineAdapter = new OnlineGameAdapter();
window.__FE_STORE__ = store;
window.__FE_ONLINE__ = onlineAdapter;

let toastTimeout = null;
let reactionTimeout = null;
let memoryTimeout = null;
let onlineUnsubscribe = null;
let onlinePoll = null;
let onlineHeartbeat = null;
let onlineRefreshTimer = null;
let onlineRefreshPromise = null;
let autoTransitionInFlight = false;

function parseRoute() {
  const params = new URLSearchParams(location.search);
  return params.get('controller') === '1' ? 'controller' : null;
}

const forcedRoute = parseRoute();
if (forcedRoute && store.getState().route !== forcedRoute) {
  store.setState({ ...store.getState(), route: forcedRoute }, { remote: false });
}

function render(state) {
  root.innerHTML = renderApp(state);
  updateCountdownDom(state);
}

store.subscribe(render);

function setState(next, meta = {}) {
  return store.setState(next, meta);
}

function update(updater, meta = {}) {
  return store.update(updater, meta);
}

function toast(message, type = 'info') {
  clearTimeout(toastTimeout);
  update((state) => {
    state.ui.toast = { message, type };
    return state;
  });
  toastTimeout = setTimeout(() => {
    update((state) => {
      state.ui.toast = null;
      return state;
    });
  }, 3200);
}

function fail(error, { quiet = false } = {}) {
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  if (!quiet) toast(message, 'error');
  return message;
}

function setOnlineBusy(busy, status = null) {
  update((state) => {
    state.ui.onlineBusy = Boolean(busy);
    state.online = { ...state.online, status: status ?? (busy ? 'connecting' : state.online?.status ?? 'idle') };
    return state;
  }, { onlineUi: true });
}

function setOnlineError(error) {
  const message = error ? (error instanceof Error ? error.message : String(error)) : null;
  update((state) => {
    state.online = { ...state.online, error: message, status: message ? 'error' : state.online?.status ?? 'idle' };
    state.ui.onlineBusy = false;
    return state;
  }, { onlineUi: true });
}

function activeHuman(state) {
  const round = currentRound(state);
  if (!round) return null;
  if (state.mode === 'online') {
    return state.players.find((player) => player.id === state.online?.userId) ?? null;
  }
  return state.players.find((player) => !player.isBot && !round.submissions[player.id])
    ?? state.players.find((player) => !player.isBot)
    ?? state.players[0];
}

function setGameRuntime(patch) {
  update((state) => {
    state.ui.gameRuntime = { ...(state.ui.gameRuntime ?? {}), ...patch };
    return state;
  });
}

function prepareGame() {
  const state = store.getState();
  const round = currentRound(state);
  if (!round) return;
  const player = activeHuman(state);
  if (!player) {
    if (state.mode !== 'online') setState(settleRound(state));
    return;
  }
  const base = { activePlayerId: player.id, stage: 'intro', selections: [], answers: [], pairIndex: 0, startedAt: null, goAt: null };
  update((next) => {
    next.ui.gameRuntime = base;
    next.ui.modal = 'game';
    return next;
  });
}

function scheduleOnlineRefresh(delay = 100) {
  clearTimeout(onlineRefreshTimer);
  onlineRefreshTimer = setTimeout(() => refreshOnline({ quiet: true }), delay);
}

async function stopOnlineSync() {
  clearInterval(onlinePoll);
  clearInterval(onlineHeartbeat);
  clearTimeout(onlineRefreshTimer);
  onlinePoll = null;
  onlineHeartbeat = null;
  onlineRefreshTimer = null;
  if (onlineUnsubscribe) {
    const unsubscribe = onlineUnsubscribe;
    onlineUnsubscribe = null;
    await unsubscribe();
  }
}

async function subscribeOnlineRoom(roomId) {
  if (!roomId || !onlineAdapter.enabled) return;
  await onlineAdapter.connect();
  await stopOnlineSync();
  const state = store.getState();
  onlineUnsubscribe = onlineAdapter.subscribeRoom(roomId, {
    presenceKey: state.online?.userId ?? undefined,
    role: state.online?.isHost ? 'host' : 'player',
    onEvent: () => scheduleOnlineRefresh(80),
    onPresence: (presence) => {
      update((next) => {
        next.online.realtimeStatus = 'SUBSCRIBED';
        next.online.presenceCount = Object.keys(presence ?? {}).length;
        return next;
      }, { presence: true });
    },
    onStatus: (status, error) => {
      update((next) => {
        next.online.realtimeStatus = status;
        if (error) next.online.error = String(error.message ?? error);
        return next;
      }, { presence: true });
    },
  });
  onlinePoll = setInterval(() => refreshOnline({ quiet: true }), 6000);
  onlineHeartbeat = setInterval(async () => {
    const fresh = store.getState();
    if (fresh.mode !== 'online' || fresh.online.roomId !== roomId) return;
    try {
      await onlineAdapter.heartbeat(roomId);
    } catch (error) {
      fail(error, { quiet: true });
    }
  }, 20000);
}

async function refreshOnline({ quiet = false } = {}) {
  const state = store.getState();
  const roomId = state.online?.roomId;
  if (!onlineAdapter.enabled || !roomId) return null;
  if (onlineRefreshPromise) return onlineRefreshPromise;

  onlineRefreshPromise = (async () => {
    try {
      const user = await onlineAdapter.currentUser();
      if (!user) throw new Error('Your temporary online identity has expired. Rejoin the room from the landing page.');
      const previous = store.getState();
      const previousPhase = previous.session.phase;
      const snapshot = await onlineAdapter.roomSnapshot(roomId);
      let next = applyOnlineSnapshot(previous, snapshot, user.id);
      const round = currentRound(next);
      if (round?.phase === PHASES.RESULTS && previousPhase !== PHASES.RESULTS) next.ui.modal = 'results';
      if (next.session.phase === PHASES.COMPLETE && previousPhase !== PHASES.COMPLETE) next.ui.modal = 'session-complete';
      if (round?.phase === PHASES.GAME && round.submissions[user.id] && next.ui.modal === 'game') next.ui.modal = null;
      next.ui.onlineBusy = false;
      next.online.error = null;
      setState(next, { remote: true, onlineSync: true });
      if (!onlineUnsubscribe || previous.online?.roomId !== roomId) await subscribeOnlineRoom(roomId);
      return next;
    } catch (error) {
      setOnlineError(error);
      if (!quiet) fail(error);
      return null;
    } finally {
      onlineRefreshPromise = null;
    }
  })();
  return onlineRefreshPromise;
}

async function enterOnlineRoom(room, user) {
  update((state) => {
    state.mode = 'online';
    state.route = 'lobby';
    state.online = {
      ...state.online,
      enabled: true,
      status: 'connecting',
      roomId: room.id,
      roomCode: room.code,
      userId: user.id,
      error: null,
    };
    state.profilePlayerId = user.id;
    state.ui.selectedPlayerId = user.id;
    state.ui.onlineBusy = true;
    return state;
  });
  await refreshOnline();
  await subscribeOnlineRoom(room.id);
}

async function createOnlineRoom(form) {
  setOnlineBusy(true, 'connecting');
  setOnlineError(null);
  const data = new FormData(form);
  try {
    const { room, user } = await onlineAdapter.createRoom(
      String(data.get('roomName') || 'Market Night'),
      store.getState().settings,
      String(data.get('displayName') || 'Guest'),
    );
    await enterOnlineRoom(room, user);
    toast(`Online room ${room.code} created. Share the code with the room.`);
  } catch (error) {
    setOnlineError(error);
    fail(error);
  } finally {
    setOnlineBusy(false);
  }
}

async function joinOnlineRoom(form) {
  setOnlineBusy(true, 'connecting');
  setOnlineError(null);
  const data = new FormData(form);
  try {
    const { room, user } = await onlineAdapter.joinRoom(
      String(data.get('roomCode') || ''),
      String(data.get('displayName') || 'Guest'),
    );
    await enterOnlineRoom(room, user);
    toast(`Joined online room ${room.code}.`);
  } catch (error) {
    setOnlineError(error);
    fail(error);
  } finally {
    setOnlineBusy(false);
  }
}

async function startOnlineSession() {
  const state = store.getState();
  if (!state.online?.isHost) throw new Error('Only the room host can open the market.');
  const queue = buildOnlineQueue(state.settings, `room:${state.online.roomId}`);
  setOnlineBusy(true, 'starting');
  try {
    await onlineAdapter.startSession(state.online.roomId, state.settings, queue);
    update((next) => {
      next.online.gameQueue = queue;
      return next;
    });
    await refreshOnline();
    const afterSession = store.getState();
    const spec = buildOnlineRoundSpec({
      ...afterSession,
      online: { ...afterSession.online, gameQueue: queue },
      session: { ...afterSession.session, gameQueue: queue },
    }, 0);
    await onlineAdapter.createRound(spec);
    await refreshOnline();
    toast('The online Friend Market is open. Every device is synchronized.');
  } finally {
    setOnlineBusy(false);
  }
}

async function transitionOnlineRound(nextStatus, durationSeconds = null) {
  const state = store.getState();
  const round = currentRound(state);
  if (!round) throw new Error('No active online round.');
  setOnlineBusy(true, 'transitioning');
  try {
    await onlineAdapter.transitionRound(round.id, round.version, nextStatus, durationSeconds);
    await refreshOnline();
  } finally {
    setOnlineBusy(false);
  }
}

async function settleOnlineRound(force = false) {
  const state = store.getState();
  const round = currentRound(state);
  if (!round) throw new Error('No active online round.');
  if (!state.online.isHost) throw new Error('Only the host can settle the market.');
  setOnlineBusy(true, 'settling');
  try {
    await onlineAdapter.settleRound(round.id, force);
    await refreshOnline();
    update((next) => {
      next.ui.modal = 'results';
      return next;
    });
  } finally {
    setOnlineBusy(false);
  }
}

async function advanceOnlineResults() {
  const state = store.getState();
  const round = currentRound(state);
  if (!round) throw new Error('No settled round to advance.');
  if (!state.online.isHost) {
    update((next) => {
      next.ui.modal = null;
      return next;
    });
    toast('Waiting for the host to open the next round.');
    return;
  }

  setOnlineBusy(true, 'advancing');
  try {
    await onlineAdapter.completeRound(round.id);
    if (round.index + 1 >= state.session.roundCount) {
      await onlineAdapter.finishSession(state.session.id);
      await refreshOnline();
      update((next) => {
        next.ui.modal = 'session-complete';
        return next;
      });
      return;
    }

    await refreshOnline();
    const fresh = store.getState();
    const sequence = round.index + 1;
    const spec = buildOnlineRoundSpec(fresh, sequence);
    await onlineAdapter.createRound(spec);
    await refreshOnline();
    update((next) => {
      next.ui.modal = null;
      return next;
    });
  } finally {
    setOnlineBusy(false);
  }
}

async function completeSubmission(submission) {
  try {
    let state = store.getState();
    const player = activeHuman(state);
    if (!player) return;

    if (state.mode === 'online') {
      const round = currentRound(state);
      if (!round) throw new Error('No online round is accepting a submission.');
      setOnlineBusy(true, 'submitting');
      await onlineAdapter.submitRound(round.id, submission, `submission_${round.id}_${player.id}`);
      update((next) => {
        const activeRound = currentRound(next);
        if (activeRound) activeRound.submissions[player.id] = { submitted: true };
        next.ui.modal = null;
        next.ui.gameRuntime = null;
        return next;
      });
      await refreshOnline();
      toast(`${player.name}'s private result is locked.`);
      const refreshed = store.getState();
      if (refreshed.online.isHost && allOnlinePlayersSubmitted(refreshed)) {
        await settleOnlineRound(false);
      }
      return;
    }

    state = submitGame(state, player.id, submission);
    const round = currentRound(state);
    const remaining = state.players.find((candidate) => !candidate.isBot && !round.submissions[candidate.id]);
    if (remaining) {
      state.ui.gameRuntime = { activePlayerId: remaining.id, stage: 'intro', selections: [], answers: [], pairIndex: 0, startedAt: null, goAt: null };
      state.ui.modal = 'game';
      setState(state);
      toast(`${player.name} locked in. Pass the device to ${remaining.name}.`);
    } else {
      state = settleRound(state);
      setState(state);
    }
  } catch (error) {
    fail(error);
  } finally {
    if (store.getState().mode === 'online') setOnlineBusy(false);
  }
}

function startGameForPlayer() {
  const state = store.getState();
  const round = currentRound(state);
  if (!round) return;
  const now = Date.now();
  switch (round.gameId) {
    case 'reaction': {
      const goAt = now + round.config.delayMs;
      setGameRuntime({ stage: 'waiting', startedAt: now, goAt });
      clearTimeout(reactionTimeout);
      reactionTimeout = setTimeout(() => {
        const fresh = store.getState();
        const current = currentRound(fresh);
        if (current?.id === round.id && fresh.ui.gameRuntime?.stage === 'waiting') setGameRuntime({ stage: 'go' });
      }, round.config.delayMs);
      break;
    }
    case 'stop-clock':
      setGameRuntime({ stage: 'ready' });
      break;
    case 'memory-grid':
      setGameRuntime({ stage: 'reveal', selections: [] });
      clearTimeout(memoryTimeout);
      memoryTimeout = setTimeout(() => {
        const fresh = store.getState();
        const current = currentRound(fresh);
        if (current?.id === round.id && fresh.ui.gameRuntime?.stage === 'reveal') setGameRuntime({ stage: 'select' });
      }, round.config.revealMs);
      break;
    case 'closest-wins':
      setGameRuntime({ stage: 'input' });
      break;
    case 'higher-lower':
      setGameRuntime({ stage: 'playing', pairIndex: 0, answers: [], startedAt: now });
      break;
    case 'minority-rules':
    case 'prisoners-dilemma':
    case 'prediction-desk':
      setGameRuntime({ stage: 'choice' });
      break;
    default:
      setGameRuntime({ stage: 'playing' });
  }
}

function updatePlayersFromDom() {
  const state = store.getState();
  if (state.mode === 'online') return;
  const players = state.players.map((player) => {
    const row = document.querySelector(`[data-player-row="${CSS.escape(player.id)}"]`);
    if (!row) return player;
    return {
      ...player,
      name: row.querySelector('[data-player-field="name"]')?.value ?? player.name,
      ticker: row.querySelector('[data-player-field="ticker"]')?.value ?? player.ticker,
    };
  });
  setState(configurePlayers(state, players));
}

function updateCountdownDom(state) {
  const countdown = phaseCountdown(state);
  if (countdown === null) return;
  document.querySelectorAll('.market-state b').forEach((node) => {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    node.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });
}

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  try {
    switch (action) {
      case 'scroll-online':
        document.querySelector('#online-entry')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      case 'route': {
        const route = target.dataset.route;
        if (route === 'landing' && store.getState().mode === 'online') {
          await stopOnlineSync();
          update((state) => {
            state.route = 'landing';
            state.mode = 'local';
            state.online = { ...state.online, roomId: null, roomCode: null, status: 'idle', error: null };
            state.ui.modal = null;
            return state;
          });
        } else {
          update((state) => { state.route = route; return state; });
        }
        break;
      }
      case 'create-room':
        update((state) => {
          state.mode = 'local';
          state.route = 'lobby';
          state.online.error = null;
          return state;
        });
        break;
      case 'demo-session': {
        let state = randomizeBotsForDemo(store.getState());
        state.mode = 'local';
        state.route = 'lobby';
        state = startSession(state);
        setState(state);
        break;
      }
      case 'online-toggle-ready': {
        const state = store.getState();
        const member = state.players.find((player) => player.id === state.online.userId);
        setOnlineBusy(true, 'updating');
        await onlineAdapter.setReady(state.online.roomId, !member?.ready);
        await refreshOnline();
        setOnlineBusy(false);
        break;
      }
      case 'online-start-session':
        await startOnlineSession();
        break;
      case 'online-retry':
        await refreshOnline();
        break;
      case 'copy-room-code': {
        const code = store.getState().online.roomCode;
        await navigator.clipboard?.writeText(code);
        toast(`Room code ${code} copied.`);
        break;
      }
      case 'view':
        update((state) => { state.ui.activeView = target.dataset.view; state.route = 'session'; return state; });
        break;
      case 'add-player': {
        const state = store.getState();
        const index = state.players.length;
        const player = {
          id: uid('player'),
          name: `Player ${index + 1}`,
          ticker: `P${index + 1}`,
          color: PLAYER_COLORS[index % PLAYER_COLORS.length],
          isBot: true,
        };
        setState(configurePlayers(state, [...state.players, player]));
        break;
      }
      case 'remove-player': {
        const state = store.getState();
        setState(configurePlayers(state, state.players.filter((player) => player.id !== target.dataset.playerId)));
        break;
      }
      case 'set-player-control': {
        const state = store.getState();
        const players = state.players.map((player) => player.id === target.dataset.playerId ? { ...player, isBot: target.dataset.bot === 'true' } : player);
        setState(configurePlayers(state, players));
        break;
      }
      case 'toggle-game': {
        const state = store.getState();
        if (state.mode === 'online' && !state.online.isHost) throw new Error('Only the host can change the game rotation.');
        const gameId = target.dataset.gameId;
        const enabled = state.settings.enabledGames.includes(gameId)
          ? state.settings.enabledGames.filter((id) => id !== gameId)
          : [...state.settings.enabledGames, gameId];
        if (!enabled.length) throw new Error('At least one game must remain enabled.');
        setState(updateSettings(state, { enabledGames: enabled }));
        break;
      }
      case 'start-session':
        updatePlayersFromDom();
        setState(startSession(store.getState()));
        break;
      case 'open-trading':
        setState(openTrading(store.getState()));
        break;
      case 'lock-trading':
        if (store.getState().mode === 'online') await transitionOnlineRound(PHASES.LOCKED);
        else setState(lockTrading(store.getState()));
        break;
      case 'begin-game': {
        if (store.getState().mode === 'online') {
          const game = getGame(currentRound(store.getState()).gameId);
          await transitionOnlineRound(PHASES.GAME, game.duration);
          prepareGame();
        } else {
          const next = beginGame(store.getState());
          setState(next);
          prepareGame();
        }
        break;
      }
      case 'resume-game':
        prepareGame();
        break;
      case 'online-settle-round':
        await settleOnlineRound(false);
        break;
      case 'online-force-settle':
        await settleOnlineRound(true);
        break;
      case 'show-results':
        update((state) => { state.ui.modal = 'results'; return state; });
        break;
      case 'advance-results':
        if (store.getState().mode === 'online') await advanceOnlineResults();
        else setState(advanceAfterResults(store.getState()));
        break;
      case 'new-session':
        setState(resetSession(store.getState()));
        break;
      case 'close-modal':
        update((state) => { state.ui.modal = null; return state; });
        break;
      case 'switch-player':
        if (store.getState().mode !== 'online') update((state) => { state.ui.modal = 'players'; return state; });
        break;
      case 'select-player':
        update((state) => { state.ui.selectedPlayerId = target.dataset.playerId; state.ui.modal = null; return state; });
        break;
      case 'trade-asset':
        update((state) => { state.ui.modal = { type: 'order', market: target.dataset.market, symbol: target.dataset.symbol }; return state; });
        break;
      case 'open-controller': {
        const url = new URL(location.href);
        url.searchParams.set('controller', '1');
        window.open(url.toString(), '_blank', 'noopener');
        break;
      }
      case 'game-start':
        startGameForPlayer();
        break;
      case 'reaction-tap': {
        const runtime = store.getState().ui.gameRuntime;
        if (runtime.stage === 'waiting') {
          clearTimeout(reactionTimeout);
          await completeSubmission({ reactionMs: 999, falseStart: true });
        } else if (runtime.stage === 'go') {
          await completeSubmission({ reactionMs: Math.max(0, Date.now() - runtime.goAt) });
        } else {
          startGameForPlayer();
        }
        break;
      }
      case 'stop-clock-start':
        setGameRuntime({ stage: 'running', startedAt: Date.now() });
        break;
      case 'stop-clock-stop': {
        const runtime = store.getState().ui.gameRuntime;
        await completeSubmission({ elapsedMs: Date.now() - runtime.startedAt });
        break;
      }
      case 'memory-cell': {
        const index = Number(target.dataset.index);
        update((state) => {
          const selections = new Set(state.ui.gameRuntime?.selections ?? []);
          if (selections.has(index)) selections.delete(index); else selections.add(index);
          state.ui.gameRuntime = { ...state.ui.gameRuntime, selections: [...selections] };
          return state;
        });
        break;
      }
      case 'memory-submit':
        await completeSubmission({ selected: store.getState().ui.gameRuntime?.selections ?? [] });
        break;
      case 'higher-lower-choice': {
        const state = store.getState();
        const round = currentRound(state);
        const runtime = state.ui.gameRuntime;
        const answers = [...(runtime.answers ?? []), target.dataset.choice];
        if (answers.length >= round.config.pairs.length) {
          await completeSubmission({ answers, elapsedMs: Date.now() - runtime.startedAt });
        } else {
          setGameRuntime({ answers, pairIndex: answers.length });
        }
        break;
      }
      case 'social-choice':
        await completeSubmission({ choice: target.dataset.choice });
        break;
      case 'prediction-choice':
        await completeSubmission({ predictionId: target.dataset.playerId });
        break;
      default:
        break;
    }
  } catch (error) {
    setOnlineBusy(false);
    fail(error);
  }
});

root.addEventListener('change', (event) => {
  const input = event.target;
  try {
    if (input.matches('[data-player-field]')) {
      updatePlayersFromDom();
      return;
    }
    if (input.matches('[data-setting]')) {
      const state = store.getState();
      if (state.mode === 'online' && !state.online.isHost) throw new Error('Only the host can change session settings.');
      const name = input.dataset.setting;
      const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
      setState(updateSettings(state, { [name]: value }));
    }
  } catch (error) {
    fail(error);
  }
});

root.addEventListener('submit', async (event) => {
  const form = event.target;
  event.preventDefault();
  try {
    if (form.dataset.form === 'online-create') {
      await createOnlineRoom(form);
      return;
    }
    if (form.dataset.form === 'online-join') {
      await joinOnlineRoom(form);
      return;
    }
    if (form.dataset.form === 'order') {
      const data = new FormData(form);
      const state = store.getState();
      const playerId = state.mode === 'online' ? state.online.userId : state.ui.selectedPlayerId;
      if (state.mode === 'online' && data.get('market') === 'friend') {
        const account = state.accounts.friend[playerId];
        if (!account?.portfolioId) throw new Error('Your online Friend Market portfolio has not synchronized yet.');
        setOnlineBusy(true, 'trading');
        const result = await onlineAdapter.executeOrder({
          portfolioId: account.portfolioId,
          symbol: data.get('symbol'),
          side: data.get('side'),
          notional: Number(data.get('notional')),
          idempotencyKey: uid('online-order'),
        });
        await refreshOnline();
        update((next) => { next.ui.modal = null; return next; });
        const trade = result.trade;
        toast(`${String(trade.side).toUpperCase()} ${Number(trade.quantity).toFixed(3)} ${trade.symbol} filled at ${new Intl.NumberFormat('en-NL', { style: 'currency', currency: 'EUR' }).format(trade.fill_price)}.`);
        setOnlineBusy(false);
        return;
      }

      const result = placePaperOrder(state, {
        playerId,
        marketType: data.get('market'),
        symbol: data.get('symbol'),
        side: data.get('side'),
        notional: Number(data.get('notional')),
        idempotencyKey: uid('web-order'),
      });
      result.state.ui.modal = null;
      setState(result.state);
      toast(`${result.fill.side.toUpperCase()} ${result.fill.quantity.toFixed(3)} ${result.fill.symbol} filled at €${result.fill.price.toFixed(2)}.`);
      return;
    }
    if (form.dataset.form === 'estimate') {
      const data = new FormData(form);
      await completeSubmission({ answer: Number(data.get('answer')) });
    }
  } catch (error) {
    setOnlineBusy(false);
    fail(error);
  }
});

setInterval(async () => {
  const state = store.getState();
  updateCountdownDom(state);
  if (state.session.phase === PHASES.TRADING && phaseCountdown(state) === 0 && !autoTransitionInFlight) {
    autoTransitionInFlight = true;
    try {
      if (state.mode === 'online') {
        if (state.online.isHost) await transitionOnlineRound(PHASES.LOCKED);
      } else {
        setState(lockTrading(state));
      }
    } catch {
      // Another device or timer may already have transitioned the round.
    } finally {
      autoTransitionInFlight = false;
    }
  }
}, 500);

setInterval(() => store.tickQuotes(), 5000);

window.addEventListener('pagehide', () => {
  stopOnlineSync();
});

(async function initialize() {
  update((state) => {
    const next = ensureOnlineState(state);
    next.online.enabled = onlineAdapter.enabled;
    return next;
  }, { initialization: true });
  if (!onlineAdapter.enabled) return;
  try {
    await onlineAdapter.connect();
    const state = store.getState();
    const user = await onlineAdapter.currentUser();
    if (user && state.online?.roomId) {
      await refreshOnline({ quiet: true });
      await subscribeOnlineRoom(state.online.roomId);
    }
  } catch (error) {
    fail(error, { quiet: true });
  }
})();
