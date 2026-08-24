import { CATEGORY_LABELS, VOLATILITY } from '../config.js';
import { GAME_CATALOG } from '../engine/games.js';
import { escapeHtml } from './format.js';
import { lineChart, playerAvatar } from './template-helpers.js';

export function landing(state) {
  return `<main class="landing-shell">
    <section class="landing-hero glass">
      <div class="landing-copy"><span class="eyebrow">GAME NIGHT · PAPER MARKETS</span><h1>WHERE FRIENDSHIP<br/>IS PUBLICLY TRADED.</h1><p>Trade real-world companies with fictional money, invest in your friends, and play minigames that move the Friend Market.</p><div class="button-row"><button class="button button--warm button--large" data-action="create-room">CREATE LOCAL ROOM</button><button class="button button--large" data-action="demo-session">PLAY INSTANT DEMO</button></div><small class="legal-note">No real money, brokerage connection, deposits or withdrawals.</small></div>
      <div class="landing-market glass glass--inner"><span class="eyebrow">LIVE CONCEPT</span><div class="landing-price"><small>ZOE</small><strong>€142.18</strong><em>+8.41%</em></div>${lineChart([92, 96, 94, 101, 105, 103, 110, 108, 116, 120, 118, 126, 132, 129, 142])}<div class="landing-ticker"><span>REACTION TEST</span><b>MARKET OPENS IN 00:35</b></div></div>
    </section>
    <section class="feature-strip glass"><article><span>01</span><div><strong>REAL PAPER STOCKS</strong><small>Follow real symbols using fake money.</small></div></article><article><span>02</span><div><strong>FRIEND MARKET</strong><small>Minigames create the price action.</small></div></article><article><span>03</span><div><strong>PARTY GAMES</strong><small>Eight polished game formats.</small></div></article></section>
  </main>`;
}

function lobbyPlayerRows(state) {
  return state.players.map((player, index) => `<div class="player-editor" data-player-row="${player.id}">${playerAvatar(player)}<label><span>Name</span><input data-player-field="name" data-player-id="${player.id}" value="${escapeHtml(player.name)}" maxlength="24" /></label><label><span>Ticker</span><input data-player-field="ticker" data-player-id="${player.id}" value="${escapeHtml(player.ticker)}" maxlength="5" /></label><label class="toggle-field"><span>Control</span><button class="seg-button ${player.isBot ? '' : 'is-active'}" data-action="set-player-control" data-player-id="${player.id}" data-bot="false">Human</button><button class="seg-button ${player.isBot ? 'is-active' : ''}" data-action="set-player-control" data-player-id="${player.id}" data-bot="true">Bot</button></label><button class="icon-button icon-button--danger" data-action="remove-player" data-player-id="${player.id}" ${state.players.length <= 2 ? 'disabled' : ''}>×</button></div>`).join('');
}

export function lobby(state) {
  const settings = state.settings;
  return `<main class="page-shell lobby-page">
    <section class="page-heading"><span class="eyebrow">ROOM SETUP</span><h1>BUILD THE MARKET</h1><p>Add the people in the room, tune the session, then ring the opening bell.</p></section>
    <div class="lobby-grid">
      <section class="glass panel"><header class="panel-heading"><div><span class="eyebrow">PUBLIC COMPANIES</span><h2>Players</h2></div><button class="button" data-action="add-player" ${state.players.length >= settings.playerLimit ? 'disabled' : ''}>+ ADD PLAYER</button></header><div class="player-editor-list">${lobbyPlayerRows(state)}</div></section>
      <section class="glass panel settings-panel"><header class="panel-heading"><div><span class="eyebrow">MARKET RULES</span><h2>Session</h2></div></header>
        <div class="settings-grid">
          <label class="field"><span>Rounds</span><input name="roundCount" type="range" min="3" max="12" value="${settings.roundCount}" data-setting="roundCount"/><b>${settings.roundCount}</b></label>
          <label class="field"><span>Trading window</span><input name="tradingSeconds" type="range" min="15" max="60" step="5" value="${settings.tradingSeconds}" data-setting="tradingSeconds"/><b>${settings.tradingSeconds}s</b></label>
          <label class="field"><span>Friend Market cash</span><select data-setting="startingFriendCash"><option value="5000" ${settings.startingFriendCash === 5000 ? 'selected' : ''}>€5,000</option><option value="10000" ${settings.startingFriendCash === 10000 ? 'selected' : ''}>€10,000</option><option value="25000" ${settings.startingFriendCash === 25000 ? 'selected' : ''}>€25,000</option></select></label>
          <label class="field"><span>Volatility</span><select data-setting="volatility">${Object.entries(VOLATILITY).map(([key, mode]) => `<option value="${key}" ${settings.volatility === key ? 'selected' : ''}>${mode.label}</option>`).join('')}</select></label>
          <label class="check-field"><input type="checkbox" data-setting="allowOwnStock" ${settings.allowOwnStock ? 'checked' : ''}/><span><b>Allow own-stock trading</b><small>Players may buy, but never short, themselves.</small></span></label>
        </div>
        <div class="game-pool"><span class="eyebrow">GAME ROTATION</span>${Object.values(GAME_CATALOG).map((game) => `<button class="game-toggle ${settings.enabledGames.includes(game.id) ? 'is-active' : ''}" data-action="toggle-game" data-game-id="${game.id}"><b>${escapeHtml(game.name)}</b><small>${escapeHtml(CATEGORY_LABELS[game.category])}</small></button>`).join('')}</div>
        <button class="button button--warm button--large full-width" data-action="start-session">RING THE OPENING BELL</button>
      </section>
    </div>
  </main>`;
}

