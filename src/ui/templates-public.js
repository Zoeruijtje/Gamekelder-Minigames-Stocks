import { CATEGORY_LABELS, VOLATILITY } from '../config.js';
import { GAME_CATALOG } from '../engine/games.js';
import { escapeHtml, money } from './format.js';
import { lineChart, playerAvatar } from './template-helpers.js';

function onlineEntry(state) {
  const enabled = state.online?.enabled;
  const busy = Boolean(state.ui.onlineBusy);
  if (!enabled) {
    return `<section class="online-entry glass online-entry--disabled">
      <div><span class="eyebrow">CROSS-DEVICE ROOMS</span><h2>Online rooms unavailable</h2><p>The free Supabase project is not configured in this build. Local rooms remain fully playable.</p></div>
    </section>`;
  }
  return `<section class="online-entry glass">
    <header><div><span class="eyebrow">FREE ONLINE MULTIPLAYER</span><h2>Bring every phone into the market</h2><p>Create a private room or enter a six-character code. No app install and no real-money features.</p></div><span class="online-status-dot"><i></i>SUPABASE FREE</span></header>
    <div class="online-entry__grid">
      <form class="online-entry__form" data-form="online-create">
        <span class="online-form-number">01</span><div><strong>Create a room</strong><small>You become the market host.</small></div>
        <label class="field"><span>Your display name</span><input name="displayName" maxlength="24" value="Zoë" autocomplete="nickname" required /></label>
        <label class="field"><span>Room name</span><input name="roomName" maxlength="60" value="Market Night" required /></label>
        <button class="button button--warm button--large full-width" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'CONNECTING…' : 'CREATE ONLINE ROOM'}</button>
      </form>
      <form class="online-entry__form" data-form="online-join">
        <span class="online-form-number">02</span><div><strong>Join by code</strong><small>Use the code shown on the host screen.</small></div>
        <label class="field"><span>Your display name</span><input name="displayName" maxlength="24" value="Guest" autocomplete="nickname" required /></label>
        <label class="field"><span>Room code</span><input class="room-code-input" name="roomCode" minlength="6" maxlength="6" pattern="[A-Za-z0-9]{6}" placeholder="ABC123" autocapitalize="characters" required /></label>
        <button class="button button--large full-width" type="submit" ${busy ? 'disabled' : ''}>${busy ? 'CONNECTING…' : 'JOIN ONLINE ROOM'}</button>
      </form>
    </div>
    <small class="legal-note">Temporary guest identities are created only for this fictional game. Supabase usage stays within the free project unless its free quotas are exceeded.</small>
  </section>`;
}

export function landing(state) {
  return `<main class="landing-shell">
    <section class="landing-hero glass">
      <div class="landing-copy"><span class="eyebrow">GAME NIGHT · PAPER MARKETS</span><h1>WHERE FRIENDSHIP<br/>IS PUBLICLY TRADED.</h1><p>Trade companies with fictional money, invest in your friends, and play minigames that visibly reprice the Friend Market after every round.</p><div class="button-row"><button class="button button--warm button--large" data-action="scroll-online">CREATE ONLINE ROOM</button><button class="button button--large" data-action="create-room">CREATE LOCAL ROOM</button><button class="button button--large" data-action="demo-session">PLAY INSTANT DEMO</button></div><small class="legal-note">No real money, brokerage connection, deposits or withdrawals.</small></div>
      <div class="landing-market glass glass--inner"><span class="eyebrow">VISIBLE MARKET CONSEQUENCES</span><div class="landing-price"><small>ZOE</small><strong>€142.18</strong><em>+8.41%</em></div>${lineChart([92, 96, 94, 101, 105, 103, 110, 108, 116, 120, 118, 126, 132, 129, 142])}<div class="landing-ticker"><span>REACTION TEST SETTLED</span><b>€131.14 → €142.18</b></div></div>
    </section>
    <section class="feature-strip glass"><article><span>01</span><div><strong>FICTIONAL PORTFOLIOS</strong><small>Fractional positions and persistent balances.</small></div></article><article><span>02</span><div><strong>VISIBLE MARKET MOVES</strong><small>Every result shows old price, new price and impact.</small></div></article><article><span>03</span><div><strong>EIGHT PARTY GAMES</strong><small>Skill, knowledge, memory and strategy.</small></div></article></section>
    <div id="online-entry">${onlineEntry(state)}</div>
  </main>`;
}

function lobbyPlayerRows(state) {
  return state.players.map((player) => `<div class="player-editor" data-player-row="${player.id}">${playerAvatar(player)}<label><span>Name</span><input data-player-field="name" data-player-id="${player.id}" value="${escapeHtml(player.name)}" maxlength="24" /></label><label><span>Ticker</span><input data-player-field="ticker" data-player-id="${player.id}" value="${escapeHtml(player.ticker)}" maxlength="5" /></label><label class="toggle-field"><span>Control</span><button class="seg-button ${player.isBot ? '' : 'is-active'}" data-action="set-player-control" data-player-id="${player.id}" data-bot="false">Human</button><button class="seg-button ${player.isBot ? 'is-active' : ''}" data-action="set-player-control" data-player-id="${player.id}" data-bot="true">Bot</button></label><button class="icon-button icon-button--danger" data-action="remove-player" data-player-id="${player.id}" ${state.players.length <= 2 ? 'disabled' : ''}>×</button></div>`).join('');
}

function gamePool(state, disabled = false) {
  return `<div class="game-pool"><span class="eyebrow">GAME ROTATION</span>${Object.values(GAME_CATALOG).map((game) => `<button class="game-toggle ${state.settings.enabledGames.includes(game.id) ? 'is-active' : ''}" data-action="toggle-game" data-game-id="${game.id}" ${disabled ? 'disabled' : ''}><b>${escapeHtml(game.name)}</b><small>${escapeHtml(CATEGORY_LABELS[game.category])}</small></button>`).join('')}</div>`;
}

function settingsGrid(state, disabled = false) {
  const settings = state.settings;
  return `<div class="settings-grid">
    <label class="field"><span>Rounds</span><input name="roundCount" type="range" min="3" max="12" value="${settings.roundCount}" data-setting="roundCount" ${disabled ? 'disabled' : ''}/><b>${settings.roundCount}</b></label>
    <label class="field"><span>Trading window</span><input name="tradingSeconds" type="range" min="15" max="60" step="5" value="${settings.tradingSeconds}" data-setting="tradingSeconds" ${disabled ? 'disabled' : ''}/><b>${settings.tradingSeconds}s</b></label>
    <label class="field"><span>Friend Market cash</span><select data-setting="startingFriendCash" ${disabled ? 'disabled' : ''}><option value="5000" ${settings.startingFriendCash === 5000 ? 'selected' : ''}>${money(5000, 0)}</option><option value="10000" ${settings.startingFriendCash === 10000 ? 'selected' : ''}>${money(10000, 0)}</option><option value="25000" ${settings.startingFriendCash === 25000 ? 'selected' : ''}>${money(25000, 0)}</option></select></label>
    <label class="field"><span>Volatility</span><select data-setting="volatility" ${disabled ? 'disabled' : ''}>${Object.entries(VOLATILITY).map(([key, mode]) => `<option value="${key}" ${settings.volatility === key ? 'selected' : ''}>${mode.label}</option>`).join('')}</select></label>
    <label class="check-field"><input type="checkbox" data-setting="allowOwnStock" ${settings.allowOwnStock ? 'checked' : ''} ${disabled ? 'disabled' : ''}/><span><b>Allow own-stock trading</b><small>Players may buy, but never short, themselves.</small></span></label>
  </div>`;
}

function localLobby(state) {
  return `<main class="page-shell lobby-page">
    <section class="page-heading"><span class="eyebrow">LOCAL ROOM SETUP</span><h1>BUILD THE MARKET</h1><p>Add the people in the room, tune the session, then ring the opening bell.</p></section>
    <div class="lobby-grid">
      <section class="glass panel"><header class="panel-heading"><div><span class="eyebrow">PUBLIC COMPANIES</span><h2>Players</h2></div><button class="button" data-action="add-player" ${state.players.length >= state.settings.playerLimit ? 'disabled' : ''}>+ ADD PLAYER</button></header><div class="player-editor-list">${lobbyPlayerRows(state)}</div></section>
      <section class="glass panel settings-panel"><header class="panel-heading"><div><span class="eyebrow">MARKET RULES</span><h2>Session</h2></div></header>${settingsGrid(state)}${gamePool(state)}<button class="button button--warm button--large full-width" data-action="start-session">RING THE OPENING BELL</button></section>
    </div>
  </main>`;
}

function onlineMemberRows(state) {
  return state.players.map((player) => `<article class="online-member ${player.id === state.online.userId ? 'is-you' : ''}">${playerAvatar(player, 'avatar--large')}<span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.ticker)} · ${escapeHtml(player.role.toUpperCase())}</small></span><em class="${player.connected ? 'is-connected' : 'is-disconnected'}">${player.connected ? 'ONLINE' : 'AWAY'}</em><b class="ready-badge ${player.ready ? 'is-ready' : ''}">${player.ready ? 'READY' : 'NOT READY'}</b></article>`).join('');
}

function onlineLobby(state) {
  const member = state.players.find((player) => player.id === state.online.userId);
  const activePlayers = state.players.filter((player) => player.role !== 'spectator' && player.connected);
  const allReady = activePlayers.length >= 2 && activePlayers.every((player) => player.ready);
  const canStart = state.online.isHost && allReady && !state.ui.onlineBusy;
  return `<main class="page-shell lobby-page online-lobby">
    <section class="online-room-hero glass">
      <div><span class="eyebrow">ONLINE MARKET ROOM</span><h1>${escapeHtml(state.session.name || 'MARKET NIGHT')}</h1><p>Share the room code. Every player trades and submits privately from their own device.</p></div>
      <div class="room-code-panel"><small>ROOM CODE</small><strong>${escapeHtml(state.online.roomCode || '------')}</strong><button class="button" data-action="copy-room-code">COPY CODE</button></div>
      <div class="connection-readout"><i class="${state.online.realtimeStatus === 'SUBSCRIBED' ? 'is-live' : ''}"></i><span><small>REALTIME</small><b>${escapeHtml(state.online.realtimeStatus || 'CONNECTING')}</b></span></div>
    </section>
    <div class="lobby-grid online-lobby-grid">
      <section class="glass panel"><header class="panel-heading"><div><span class="eyebrow">LISTED COMPANIES</span><h2>${state.players.length} Players</h2></div><span class="feed-label">${activePlayers.filter((player) => player.ready).length}/${activePlayers.length} READY</span></header><div class="online-member-list">${onlineMemberRows(state)}</div><button class="button ${member?.ready ? 'button--danger' : 'button--warm'} button--large full-width" data-action="online-toggle-ready" ${state.ui.onlineBusy ? 'disabled' : ''}>${member?.ready ? 'MARK ME NOT READY' : 'I AM READY'}</button></section>
      <section class="glass panel settings-panel"><header class="panel-heading"><div><span class="eyebrow">${state.online.isHost ? 'HOST CONTROLS' : 'HOST SETTINGS'}</span><h2>Session Rules</h2></div>${state.online.isHost ? '<span class="host-crown">HOST</span>' : '<span class="feed-label">READ ONLY</span>'}</header>${settingsGrid(state, !state.online.isHost)}${gamePool(state, !state.online.isHost)}${state.online.isHost ? `<button class="button button--warm button--large full-width" data-action="online-start-session" ${canStart ? '' : 'disabled'}>${allReady ? 'OPEN THE ONLINE MARKET' : 'WAITING FOR EVERYONE TO READY UP'}</button>` : '<div class="waiting-host"><i class="live-dot"></i><span><b>Waiting for the host</b><small>The opening bell rings when every connected player is ready.</small></span></div>'}<small class="legal-note">Online rooms use the free Supabase project and fictional balances only.</small></section>
    </div>
  </main>`;
}

export function lobby(state) {
  return state.mode === 'online' ? onlineLobby(state) : localLobby(state);
}
