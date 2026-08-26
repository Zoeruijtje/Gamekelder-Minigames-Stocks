import { PHASES } from './config.js';
import {
  applyGameContent,
  applyGameDefinitions,
  enabledGameIds,
} from './engine/games.js';
import {
  createInitialState,
  resetSession,
} from './engine/session.js';
import { AdminAdapter } from './services/admin-adapter.js';
import { applyOnlineSnapshot } from './services/online-state.js';

const root = document.querySelector('#app');
const store = window.__FE_STORE__;
const onlineAdapter = window.__FE_ONLINE__;
const adminAdapter = new AdminAdapter();
window.__FE_ADMIN__ = adminAdapter;

let toastTimer = null;

function adminDefaults() {
  return {
    enabled: adminAdapter.enabled,
    status: 'signed-out',
    user: null,
    role: null,
    snapshot: null,
    publicConfig: null,
    section: 'overview',
    returnRoute: 'landing',
    error: null,
    busy: false,
    mustChangePassword: false,
  };
}

function ensureAdminState(state) {
  state.admin = { ...adminDefaults(), ...(state.admin ?? {}), enabled: adminAdapter.enabled };
  state.ui.menuReturnModal ??= null;
  state.ui.menuConfirm ??= null;
  state.ui.localRoomDraft ??= false;
  return state;
}

function notify(message, type = 'info') {
  clearTimeout(toastTimer);
  store.update((state) => {
    ensureAdminState(state);
    state.ui.toast = { message, type };
    return state;
  }, { controlCenter: true });
  toastTimer = setTimeout(() => {
    store.update((state) => {
      state.ui.toast = null;
      return state;
    }, { controlCenter: true });
  }, 4200);
}

function normalizeGameDefinitions(config) {
  if (!config?.games) return {};
  if (!Array.isArray(config.games)) return config.games;
  return Object.fromEntries(config.games.map((game) => [game.id, game]));
}

function normalizeGameContent(config) {
  if (!config?.content) return {};
  if (!Array.isArray(config.content)) return config.content;
  return config.content.reduce((groups, item) => {
    (groups[item.game_id] ??= []).push(item);
    return groups;
  }, {});
}

function configuredSettings(config) {
  const definitions = normalizeGameDefinitions(config);
  return {
    ...(config?.default_settings ?? {}),
    enabledGames: enabledGameIds(definitions),
    gameDefinitions: definitions,
    gameContent: normalizeGameContent(config),
    configVersion: config?.version ?? null,
  };
}

function applyConfigRuntime(config) {
  const definitions = normalizeGameDefinitions(config);
  const content = normalizeGameContent(config);
  applyGameDefinitions(definitions);
  applyGameContent(content);
}

function shouldApplyDefaults(state) {
  return state.mode !== 'online'
    && state.session.status === PHASES.LOBBY
    && !state.session.id;
}

function applyPublicConfig(config, { forceDefaults = false } = {}) {
  if (!config) return;
  applyConfigRuntime(config);
  store.update((state) => {
    ensureAdminState(state);
    state.admin.publicConfig = config;
    if (forceDefaults || shouldApplyDefaults(state)) {
      state.settings = { ...state.settings, ...configuredSettings(config) };
      state.session.roundCount = state.settings.roundCount;
    }
    return state;
  }, { publicConfig: true });
}

async function loadPublicConfig({ forceDefaults = false, quiet = true } = {}) {
  if (!adminAdapter.enabled) return null;
  try {
    const config = await adminAdapter.publicConfig();
    applyPublicConfig(config, { forceDefaults });
    return config;
  } catch (error) {
    if (!quiet) notify(error instanceof Error ? error.message : String(error), 'error');
    return null;
  }
}

async function loadAdminSnapshot({ quiet = false } = {}) {
  if (!adminAdapter.enabled) return null;
  store.update((state) => {
    ensureAdminState(state);
    state.admin.busy = true;
    state.admin.status = 'loading';
    state.admin.error = null;
    return state;
  }, { adminUi: true });
  try {
    const user = await adminAdapter.currentUser();
    if (!user) {
      store.update((state) => {
        ensureAdminState(state);
        state.admin = { ...state.admin, status: 'signed-out', user: null, role: null, snapshot: null, busy: false };
        return state;
      }, { adminUi: true });
      return null;
    }
    try {
      const snapshot = await adminAdapter.snapshot();
      store.update((state) => {
        ensureAdminState(state);
        state.admin = {
          ...state.admin,
          status: 'ready',
          user: { id: user.id, email: user.email },
          mustChangePassword: Boolean(user.user_metadata?.must_change_password),
          role: snapshot?.admin?.role ?? 'admin',
          snapshot,
          busy: false,
          error: null,
        };
        return state;
      }, { adminUi: true });
      return snapshot;
    } catch (error) {
      store.update((state) => {
        ensureAdminState(state);
        state.admin = {
          ...state.admin,
          status: 'unauthorized',
          user: { id: user.id, email: user.email },
          mustChangePassword: Boolean(user.user_metadata?.must_change_password),
          role: null,
          snapshot: null,
          busy: false,
          error: error instanceof Error ? error.message : String(error),
        };
        return state;
      }, { adminUi: true });
      return null;
    }
  } catch (error) {
    store.update((state) => {
      ensureAdminState(state);
      state.admin.status = 'signed-out';
      state.admin.busy = false;
      state.admin.error = error instanceof Error ? error.message : String(error);
      return state;
    }, { adminUi: true });
    if (!quiet) notify(error instanceof Error ? error.message : String(error), 'error');
    return null;
  }
}

function routeForCurrentRoom(state) {
  if (state.mode === 'online' && state.online?.roomId) {
    return state.session.status === PHASES.LOBBY ? 'lobby' : 'session';
  }
  if (state.ui.localRoomDraft || state.session.id || state.session.status !== PHASES.LOBBY) {
    return state.session.status === PHASES.LOBBY ? 'lobby' : 'session';
  }
  return 'landing';
}

function hasResumableState(state) {
  return Boolean(
    (state.mode === 'online' && state.online?.roomId)
    || state.session.id
    || state.ui.localRoomDraft,
  );
}

function resumeCard(state) {
  const online = state.mode === 'online' && state.online?.roomId;
  const phase = state.session.phase ?? state.session.status;
  const label = online
    ? `ONLINE ROOM ${state.online.roomCode ?? '------'}`
    : state.session.id ? 'LOCAL SESSION' : 'LOCAL ROOM DRAFT';
  const detail = state.session.status === PHASES.LOBBY
    ? 'Room setup is waiting.'
    : `Current phase: ${String(phase).replaceAll('-', ' ')}${state.session.roundIndex >= 0 ? ` · Round ${state.session.roundIndex + 1}/${state.session.roundCount}` : ''}.`;
  return `<section class="resume-session-card glass"><div><span class="eyebrow">SESSION SAVED</span><h2>${label}</h2><p>${detail} Return without rebuilding the room.</p></div><div><button class="button button--warm button--large" data-action="menu-resume">RESUME</button><button class="button" data-action="open-session-menu">MANAGE</button></div></section>`;
}

function addButton(container, className, label, action) {
  if (!container || container.querySelector(`[data-action="${action}"]`)) return;
  const button = document.createElement('button');
  button.className = className;
  button.dataset.action = action;
  button.textContent = label;
  container.append(button);
}

function decorateShell(state) {
  if (state.route === 'landing') {
    addButton(document.querySelector('.landing-copy .button-row'), 'button button--large', 'ADMIN', 'open-admin');
    const landing = document.querySelector('.landing-shell');
    if (landing && hasResumableState(state) && !landing.querySelector('.resume-session-card')) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = resumeCard(state);
      const onlineEntry = landing.querySelector('#online-entry');
      landing.insertBefore(wrapper.firstElementChild, onlineEntry);
    }
  }
  const modalHeader = document.querySelector('.game-modal header, .results-modal header');
  if (modalHeader && !modalHeader.querySelector('[data-action="open-session-menu"]')) {
    addButton(modalHeader, 'button modal-menu-button', 'MENU', 'open-session-menu');
  }
}

function openSessionMenu() {
  store.update((state) => {
    ensureAdminState(state);
    if (state.ui.modal !== 'session-menu') state.ui.menuReturnModal = state.ui.modal;
    state.ui.modal = 'session-menu';
    state.ui.menuConfirm = null;
    return state;
  }, { menu: true });
}

function closeSessionMenu({ resume = true } = {}) {
  store.update((state) => {
    ensureAdminState(state);
    state.ui.modal = resume ? state.ui.menuReturnModal : null;
    state.ui.menuReturnModal = null;
    state.ui.menuConfirm = null;
    return state;
  }, { menu: true });
}

function freshStateWithAdmin(previous) {
  const fresh = createInitialState();
  fresh.admin = { ...adminDefaults(), ...(previous.admin ?? {}) };
  fresh.ui.localRoomDraft = false;
  const config = previous.admin?.publicConfig;
  if (config) {
    fresh.settings = { ...fresh.settings, ...configuredSettings(config) };
    fresh.session.roundCount = fresh.settings.roundCount;
  }
  return fresh;
}

async function leaveOnlineRoom() {
  const state = store.getState();
  const roomId = state.online?.roomId;
  if (roomId) await onlineAdapter.leaveRoom(roomId);
  store.setState(freshStateWithAdmin(state), { controlCenter: true });
  notify('You left the online room.');
}

async function returnOnlineRoomToLobby() {
  const state = store.getState();
  if (!state.online?.isHost) throw new Error('Only the room host can reopen room setup.');
  await onlineAdapter.returnRoomToLobby(state.online.roomId);
  const snapshot = await onlineAdapter.roomSnapshot(state.online.roomId);
  const next = applyOnlineSnapshot(state, snapshot, state.online.userId);
  next.route = 'lobby';
  next.ui.modal = null;
  next.ui.menuReturnModal = null;
  next.ui.menuConfirm = null;
  store.setState(next, { controlCenter: true, remote: true });
  notify('The session ended. The room is back in setup mode.');
}

function resetLocalToLobby() {
  const state = store.getState();
  let next = resetSession(state);
  next.ui.localRoomDraft = true;
  const config = state.admin?.publicConfig;
  if (config) {
    next.settings = { ...next.settings, ...configuredSettings(config) };
    next.session.roundCount = next.settings.roundCount;
  }
  store.setState(next, { controlCenter: true });
  notify('Local setup reopened. Edit players, games and rules.');
}

function discardLocal() {
  const state = store.getState();
  store.setState(freshStateWithAdmin(state), { controlCenter: true });
  notify('Local room discarded.');
}

function openAdmin() {
  store.update((state) => {
    ensureAdminState(state);
    state.admin.returnRoute = state.route === 'admin' ? state.admin.returnRoute : state.route;
    state.route = 'admin';
    state.ui.modal = null;
    state.ui.menuConfirm = null;
    return state;
  }, { adminUi: true });
  loadAdminSnapshot({ quiet: true });
}

function returnFromAdmin() {
  store.update((state) => {
    ensureAdminState(state);
    const target = state.admin.returnRoute;
    state.route = target && target !== 'admin' ? target : hasResumableState(state) ? routeForCurrentRoom(state) : 'landing';
    return state;
  }, { adminUi: true });
}

function parseJsonField(form, name) {
  const value = String(new FormData(form).get(name) ?? '').trim();
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    throw new Error(`${name} must contain valid JSON.`);
  }
}

async function refreshAdminAndPublicConfig() {
  await loadAdminSnapshot();
  await loadPublicConfig({ quiet: false });
}

const handledActions = new Set([
  'open-session-menu', 'menu-close', 'menu-resume', 'menu-go-home',
  'menu-confirm', 'menu-cancel-confirm', 'menu-reset-local',
  'menu-discard-local', 'menu-leave-online', 'menu-return-online-lobby',
  'open-admin', 'admin-return-site', 'admin-section', 'admin-refresh',
  'admin-sign-out', 'admin-delete-content', 'admin-close-room',
]);

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target || !handledActions.has(target.dataset.action)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const action = target.dataset.action;
  try {
    switch (action) {
      case 'open-session-menu':
        openSessionMenu();
        break;
      case 'menu-close':
        closeSessionMenu();
        break;
      case 'menu-resume':
        store.update((state) => {
          ensureAdminState(state);
          state.route = routeForCurrentRoom(state);
          state.ui.modal = state.ui.menuReturnModal;
          state.ui.menuReturnModal = null;
          state.ui.menuConfirm = null;
          return state;
        }, { menu: true });
        break;
      case 'menu-go-home':
        store.update((state) => {
          ensureAdminState(state);
          if (state.mode !== 'online' && state.session.status === PHASES.LOBBY) state.ui.localRoomDraft = true;
          state.route = 'landing';
          state.ui.modal = null;
          state.ui.menuReturnModal = null;
          state.ui.menuConfirm = null;
          return state;
        }, { menu: true });
        break;
      case 'menu-confirm':
        store.update((state) => { state.ui.menuConfirm = target.dataset.confirm; return state; }, { menu: true });
        break;
      case 'menu-cancel-confirm':
        store.update((state) => { state.ui.menuConfirm = null; return state; }, { menu: true });
        break;
      case 'menu-reset-local':
        resetLocalToLobby();
        break;
      case 'menu-discard-local':
        discardLocal();
        break;
      case 'menu-leave-online':
        await leaveOnlineRoom();
        break;
      case 'menu-return-online-lobby':
        await returnOnlineRoomToLobby();
        break;
      case 'open-admin':
        openAdmin();
        break;
      case 'admin-return-site':
        returnFromAdmin();
        break;
      case 'admin-section':
        store.update((state) => { ensureAdminState(state); state.admin.section = target.dataset.section; return state; }, { adminUi: true });
        break;
      case 'admin-refresh':
        await refreshAdminAndPublicConfig();
        notify('Administrator data refreshed.');
        break;
      case 'admin-sign-out':
        await adminAdapter.signOut();
        store.update((state) => {
          ensureAdminState(state);
          state.admin = { ...state.admin, status: 'signed-out', user: null, role: null, snapshot: null, error: null, busy: false, mustChangePassword: false };
          return state;
        }, { adminUi: true });
        notify('Administrator signed out.');
        break;
      case 'admin-delete-content':
        if (!window.confirm('Delete this game-content item? This cannot be undone.')) break;
        await adminAdapter.deleteContent(target.dataset.contentId);
        await refreshAdminAndPublicConfig();
        notify('Game-content item deleted.');
        break;
      case 'admin-close-room':
        if (!window.confirm(`Archive room ${target.dataset.roomCode}? Connected players will be disconnected.`)) break;
        await adminAdapter.closeRoom(target.dataset.roomId, 'Archived from Friend Exchange admin control center');
        await loadAdminSnapshot();
        notify(`Room ${target.dataset.roomCode} archived.`);
        break;
      default:
        break;
    }
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), 'error');
  }
}, true);

root.addEventListener('submit', async (event) => {
  const form = event.target;
  const formName = form.dataset.form;
  if (!formName?.startsWith('admin-')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const data = new FormData(form);
  store.update((state) => { ensureAdminState(state); state.admin.busy = true; state.admin.error = null; return state; }, { adminUi: true });
  try {
    if (formName === 'admin-login') {
      await adminAdapter.signIn(data.get('email'), data.get('password'));
      await loadAdminSnapshot();
      notify('Administrator signed in.');
      return;
    }
    if (formName === 'admin-change-password') {
      const password = String(data.get('password') ?? '');
      const confirmation = String(data.get('confirmPassword') ?? '');
      if (password.length < 14) throw new Error('Use at least 14 characters for the permanent administrator password.');
      if (password !== confirmation) throw new Error('The new passwords do not match.');
      await adminAdapter.updatePassword(password);
      await loadAdminSnapshot();
      notify('Administrator password updated.');
      return;
    }
    if (formName === 'admin-settings') {
      await adminAdapter.updateGlobalSettings({
        roundCount: Number(data.get('roundCount')),
        tradingSeconds: Number(data.get('tradingSeconds')),
        startingFriendCash: Number(data.get('startingFriendCash')),
        startingRealCash: Number(data.get('startingRealCash')),
        volatility: data.get('volatility'),
        playerLimit: Number(data.get('playerLimit')),
        allowOwnStock: data.get('allowOwnStock') === 'on',
      });
      await refreshAdminAndPublicConfig();
      notify('Global session defaults saved.');
      return;
    }
    if (formName === 'admin-game') {
      await adminAdapter.updateGameDefinition({
        id: data.get('id'),
        enabled: data.get('enabled') === 'on',
        name: data.get('name'),
        description: data.get('description'),
        instructions: data.get('instructions'),
        durationSeconds: Number(data.get('durationSeconds')),
        config: parseJsonField(form, 'config'),
      });
      await refreshAdminAndPublicConfig();
      notify(`${String(data.get('name'))} saved.`);
      return;
    }
    if (formName === 'admin-content') {
      await adminAdapter.upsertContent({
        id: data.get('id'),
        gameId: data.get('gameId'),
        contentType: data.get('contentType'),
        payload: parseJsonField(form, 'payload'),
        active: data.get('active') === 'on',
        sortOrder: Number(data.get('sortOrder')),
      });
      await refreshAdminAndPublicConfig();
      notify('Game-content item saved.');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    store.update((state) => { ensureAdminState(state); state.admin.busy = false; state.admin.error = message; return state; }, { adminUi: true });
    notify(message, 'error');
  }
}, true);

store.subscribe((state) => {
  ensureAdminState(state);
  queueMicrotask(() => decorateShell(state));
});

(async function initializeControlCenter() {
  store.update((state) => ensureAdminState(state), { controlCenter: true });
  await loadPublicConfig({ quiet: true });
  await loadAdminSnapshot({ quiet: true });
})();

export const controlCenterTestApi = {
  configuredSettings,
  normalizeGameContent,
  normalizeGameDefinitions,
  routeForCurrentRoom,
};
