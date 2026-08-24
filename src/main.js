import { PLAYER_COLORS, PHASES } from './config.js';
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
import { AppStore } from './store.js';
import { renderApp } from './ui/templates.js';

const root = document.querySelector('#app');
const store = new AppStore();
window.__FE_STORE__ = store;
let toastTimeout = null;
let reactionTimeout = null;
let memoryTimeout = null;

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

function setState(next) {
  return store.setState(next);
}

function update(updater) {
  return store.update(updater);
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
  }, 2600);
}

function fail(error) {
  console.error(error);
  toast(error instanceof Error ? error.message : String(error), 'error');
}

function activeHuman(state) {
  const round = currentRound(state);
  if (!round) return null;
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
    setState(settleRound(state));
    return;
  }
  const base = { activePlayerId: player.id, stage: 'intro', selections: [], answers: [], pairIndex: 0, startedAt: null, goAt: null };
  update((next) => {
    next.ui.gameRuntime = base;
    next.ui.modal = 'game';
    return next;
  });
}

function completeSubmission(submission) {
  try {
    let state = store.getState();
    const player = activeHuman(state);
    if (!player) return;
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

root.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  try {
    switch (action) {
      case 'route':
        update((state) => { state.route = target.dataset.route; return state; });
        break;
      case 'create-room':
        update((state) => { state.route = 'lobby'; return state; });
        break;
      case 'demo-session': {
        let state = randomizeBotsForDemo(store.getState());
        state.route = 'lobby';
        state = startSession(state);
        setState(state);
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
        setState(lockTrading(store.getState()));
        break;
      case 'begin-game': {
        const next = beginGame(store.getState());
        setState(next);
        prepareGame();
        break;
      }
      case 'resume-game':
        update((state) => { state.ui.modal = 'game'; return state; });
        break;
      case 'show-results':
        update((state) => { state.ui.modal = 'results'; return state; });
        break;
      case 'advance-results':
        setState(advanceAfterResults(store.getState()));
        break;
      case 'new-session':
        setState(resetSession(store.getState()));
        break;
      case 'close-modal':
        update((state) => { state.ui.modal = null; return state; });
        break;
      case 'switch-player':
        update((state) => { state.ui.modal = 'players'; return state; });
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
          completeSubmission({ reactionMs: 999, falseStart: true });
        } else if (runtime.stage === 'go') {
          completeSubmission({ reactionMs: Math.max(0, Date.now() - runtime.goAt) });
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
        completeSubmission({ elapsedMs: Date.now() - runtime.startedAt });
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
        completeSubmission({ selected: store.getState().ui.gameRuntime?.selections ?? [] });
        break;
      case 'higher-lower-choice': {
        const state = store.getState();
        const round = currentRound(state);
        const runtime = state.ui.gameRuntime;
        const answers = [...(runtime.answers ?? []), target.dataset.choice];
        if (answers.length >= round.config.pairs.length) {
          completeSubmission({ answers, elapsedMs: Date.now() - runtime.startedAt });
        } else {
          setGameRuntime({ answers, pairIndex: answers.length });
        }
        break;
      }
      case 'social-choice':
        completeSubmission({ choice: target.dataset.choice });
        break;
      case 'prediction-choice':
        completeSubmission({ predictionId: target.dataset.playerId });
        break;
      default:
        break;
    }
  } catch (error) {
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
      const name = input.dataset.setting;
      const value = input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value;
      setState(updateSettings(store.getState(), { [name]: value }));
    }
  } catch (error) {
    fail(error);
  }
});

root.addEventListener('submit', (event) => {
  const form = event.target;
  event.preventDefault();
  try {
    if (form.dataset.form === 'order') {
      const data = new FormData(form);
      const playerId = store.getState().ui.selectedPlayerId;
      const result = placePaperOrder(store.getState(), {
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
      completeSubmission({ answer: Number(data.get('answer')) });
    }
  } catch (error) {
    fail(error);
  }
});

setInterval(() => {
  const state = store.getState();
  updateCountdownDom(state);
  if (state.session.phase === PHASES.TRADING && phaseCountdown(state) === 0) {
    try { setState(lockTrading(state)); } catch { /* already locked elsewhere */ }
  }
}, 500);

setInterval(() => store.tickQuotes(), 5000);
