import { escapeHtml } from './format.js';
import { appHeader, environment } from './template-helpers.js';
import { adminPage } from './templates-admin.js';
import { sessionMenu } from './templates-menu.js';
import { modals } from './templates-modals.js';
import { landing, lobby } from './templates-public.js';
import { controller, session } from './templates-session.js';

function onlineBanner(state) {
  if (state.mode !== 'online' || state.route === 'admin') return '';
  if (state.online?.error) {
    return `<div class="online-banner online-banner--error"><strong>ROOM CONNECTION ISSUE</strong><span>${escapeHtml(state.online.error)}</span><button data-action="online-retry">RETRY</button></div>`;
  }
  if (state.online?.status === 'connecting' || state.ui.onlineBusy) {
    return '<div class="online-banner"><span class="online-spinner"></span><strong>SYNCING AUTHORITATIVE ROOM STATE…</strong></div>';
  }
  return '';
}

export function renderApp(state) {
  const isController = state.route === 'controller';
  const isAdmin = state.route === 'admin';
  const body = isAdmin
    ? adminPage(state)
    : state.route === 'landing'
      ? landing(state)
      : state.route === 'lobby'
        ? lobby(state)
        : isController
          ? controller(state)
          : session(state);
  const showHeader = !['landing', 'admin'].includes(state.route) && !isController;
  return `${environment()}<div class="app-frame">${onlineBanner(state)}${showHeader ? appHeader(state) : ''}${body}</div>${modals(state)}${sessionMenu(state)}<div class="toast ${state.ui.toast ? 'is-visible' : ''}" role="status">${escapeHtml(state.ui.toast?.message ?? '')}</div>`;
}
