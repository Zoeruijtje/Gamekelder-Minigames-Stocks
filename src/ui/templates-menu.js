import { PHASES } from '../config.js';
import { currentRound } from '../engine/session.js';
import { getGame } from '../engine/games.js';
import { escapeHtml } from './format.js';

function currentContext(state) {
  const round = currentRound(state);
  if (state.mode === 'online') {
    return state.session.status === PHASES.LOBBY
      ? `ONLINE ROOM ${escapeHtml(state.online?.roomCode ?? '------')} · LOBBY`
      : `ONLINE ROOM ${escapeHtml(state.online?.roomCode ?? '------')} · ${round ? escapeHtml(getGame(round.gameId).name) : 'ACTIVE SESSION'}`;
  }
  if (state.session.status === PHASES.LOBBY) return 'LOCAL ROOM · SETUP';
  return `LOCAL SESSION · ${round ? escapeHtml(getGame(round.gameId).name) : 'ACTIVE'}`;
}

function confirmation(state, kind) {
  const online = state.mode === 'online';
  const options = {
    localReset: {
      eyebrow: 'END LOCAL SESSION',
      title: 'Return to room setup?',
      copy: 'The current local session, scores and positions will be discarded. Players and the configured defaults remain available for a new game night.',
      action: 'menu-reset-local',
      label: 'END SESSION & EDIT SETUP',
    },
    onlineLobby: {
      eyebrow: 'HOST ACTION',
      title: 'End the current online session?',
      copy: 'Every connected player will return to the same room lobby. Current session scores, positions and rounds are archived. The host can then edit game rotation and rules before reopening the market.',
      action: 'menu-return-online-lobby',
      label: 'END SESSION FOR EVERYONE',
    },
    leaveOnline: {
      eyebrow: 'LEAVE ONLINE ROOM',
      title: 'Leave this room?',
      copy: online && state.online?.isHost
        ? 'You will disconnect from the room. Host control transfers to another connected player when possible.'
        : 'You will disconnect and return to the main menu. Rejoining later requires the room code while the room still exists.',
      action: 'menu-leave-online',
      label: 'LEAVE ROOM',
    },
    discardLocal: {
      eyebrow: 'DISCARD LOCAL ROOM',
      title: 'Discard the current local room?',
      copy: 'All unsaved local session state, scores and fictional positions will be removed from this browser.',
      action: 'menu-discard-local',
      label: 'DISCARD & RETURN HOME',
    },
  };
  const item = options[kind];
  if (!item) return '';
  return `<div class="session-menu__confirm">
    <span class="eyebrow">${item.eyebrow}</span>
    <h2>${item.title}</h2>
    <p>${item.copy}</p>
    <div class="session-menu__confirm-actions">
      <button class="button" data-action="menu-cancel-confirm">CANCEL</button>
      <button class="button button--danger" data-action="${item.action}">${item.label}</button>
    </div>
  </div>`;
}

export function sessionMenu(state) {
  if (state.ui.modal !== 'session-menu') return '';
  const confirmKind = state.ui.menuConfirm;
  const online = state.mode === 'online';
  const active = state.session.status === 'active';
  const lobby = state.session.status === PHASES.LOBBY;
  const complete = state.session.status === PHASES.COMPLETE;
  const round = currentRound(state);
  if (confirmKind) {
    return `<div class="modal-layer session-menu-layer"><button class="modal-scrim" data-action="menu-close" aria-label="Close menu"></button><section class="session-menu glass">${confirmation(state, confirmKind)}</section></div>`;
  }

  return `<div class="modal-layer session-menu-layer">
    <button class="modal-scrim" data-action="menu-close" aria-label="Close menu"></button>
    <section class="session-menu glass">
      <header><div><span class="eyebrow">SESSION MENU</span><h2>PAUSE, EDIT OR LEAVE</h2><p>${currentContext(state)}</p></div><button class="icon-button" data-action="menu-close" aria-label="Close">×</button></header>
      <div class="session-menu__status">
        <span><small>MODE</small><b>${online ? 'ONLINE' : 'LOCAL'}</b></span>
        <span><small>PHASE</small><b>${escapeHtml(state.session.phase ?? state.session.status)}</b></span>
        <span><small>ROUND</small><b>${round ? `${round.index + 1}/${state.session.roundCount}` : lobby ? 'SETUP' : complete ? 'CLOSED' : '—'}</b></span>
      </div>
      <div class="session-menu__actions">
        <button class="session-menu__action session-menu__action--primary" data-action="menu-resume">
          <span>RESUME</span><small>${state.ui.menuReturnModal === 'game' ? 'Return to the minigame' : lobby ? 'Return to room setup' : 'Return to the current session'}</small>
        </button>
        <button class="session-menu__action" data-action="menu-go-home">
          <span>MAIN MENU</span><small>Keep this ${online ? 'room connected' : 'local session saved'} and return to the home screen.</small>
        </button>
        ${active && !online ? `<button class="session-menu__action" data-action="menu-confirm" data-confirm="localReset"><span>EDIT PLAYERS & GAMES</span><small>End this session and reopen local room setup.</small></button>` : ''}
        ${active && online && state.online?.isHost ? `<button class="session-menu__action" data-action="menu-confirm" data-confirm="onlineLobby"><span>REOPEN ROOM SETUP</span><small>End the current session for everyone, then edit rules and game rotation.</small></button>` : ''}
        ${lobby ? `<button class="session-menu__action" data-action="menu-resume"><span>EDIT ROOM SETUP</span><small>Change session rules, players and enabled minigames.</small></button>` : ''}
        <button class="session-menu__action" data-action="open-admin"><span>ADMIN CONTROL CENTER</span><small>Sign in to edit global defaults, game data and active rooms.</small></button>
        ${online ? `<button class="session-menu__action session-menu__action--danger" data-action="menu-confirm" data-confirm="leaveOnline"><span>LEAVE ONLINE ROOM</span><small>${state.online?.isHost ? 'Host control transfers when another player is connected.' : 'Disconnect this player from the room.'}</small></button>` : `<button class="session-menu__action session-menu__action--danger" data-action="menu-confirm" data-confirm="discardLocal"><span>DISCARD LOCAL ROOM</span><small>Remove this room and its saved local session state.</small></button>`}
      </div>
      <small class="session-menu__note">Active online game rules cannot be changed mid-round. A host must reopen the lobby first; site-admin defaults apply to newly created sessions.</small>
    </section>
  </div>`;
}
