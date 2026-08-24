import { escapeHtml } from './format.js';
import { appHeader, environment } from './template-helpers.js';
import { modals } from './templates-modals.js';
import { landing, lobby } from './templates-public.js';
import { controller, session } from './templates-session.js';

export function renderApp(state) {
  const isController = state.route === 'controller';
  const body = state.route === 'landing'
    ? landing(state)
    : state.route === 'lobby'
      ? lobby(state)
      : isController
        ? controller(state)
        : session(state);
  return `${environment()}<div class="app-frame">${state.route !== 'landing' && !isController ? appHeader(state) : ''}${body}</div>${modals(state)}<div class="toast ${state.ui.toast ? 'is-visible' : ''}" role="status">${escapeHtml(state.ui.toast?.message ?? '')}</div>`;
}
