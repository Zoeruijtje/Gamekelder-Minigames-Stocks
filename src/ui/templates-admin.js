import { CATEGORY_LABELS, VOLATILITY } from '../config.js';
import { escapeHtml, money } from './format.js';

function jsonText(value) {
  return escapeHtml(JSON.stringify(value ?? {}, null, 2));
}

function dateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-NL', { dateStyle: 'medium', timeStyle: 'short' });
}

function adminHeader(state) {
  const admin = state.admin ?? {};
  return `<header class="admin-header glass">
    <button class="brand" data-action="admin-return-site"><span class="brand-mark">FE</span><span><strong>FRIEND EXCHANGE</strong><small>ADMIN CONTROL CENTER</small></span></button>
    <div class="admin-header__identity">${admin.user ? `<span><small>SIGNED IN</small><b>${escapeHtml(admin.user.email ?? 'Administrator')}</b></span><em>${escapeHtml((admin.role ?? 'admin').toUpperCase())}</em><button class="button" data-action="admin-sign-out">SIGN OUT</button>` : '<span><small>SECURE MANAGEMENT</small><b>Administrator access required</b></span>'}</div>
    <button class="button" data-action="admin-return-site">RETURN TO SITE</button>
  </header>`;
}

function signedOut(state) {
  const disabled = !state.admin?.enabled || state.admin?.busy;
  return `<main class="admin-shell">
    ${adminHeader(state)}
    <section class="admin-auth-grid">
      <article class="admin-auth-card glass">
        <span class="eyebrow">ADMIN SIGN IN</span><h1>CONTROL THE MARKET</h1><p>This account is separate from temporary player identities. Signing in here does not disconnect an active room in this browser.</p>
        ${state.admin?.enabled ? '' : '<div class="admin-warning">Supabase administration is not configured in this build.</div>'}
        ${state.admin?.error ? `<div class="admin-warning">${escapeHtml(state.admin.error)}</div>` : ''}
        <form data-form="admin-login" class="admin-form">
          <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required ${disabled ? 'disabled' : ''}/></label>
          <label class="field"><span>Password</span><input name="password" type="password" minlength="12" autocomplete="current-password" required ${disabled ? 'disabled' : ''}/></label>
          <button class="button button--warm button--large full-width" type="submit" ${disabled ? 'disabled' : ''}>${state.admin?.busy ? 'SIGNING IN…' : 'SIGN IN'}</button>
        </form>
      </article>
      <article class="admin-auth-card admin-auth-card--setup glass">
        <span class="eyebrow">FIRST OWNER ONLY</span><h2>INITIAL ADMIN SETUP</h2><p>Use the one-time bootstrap code supplied privately with the deployment. After the first owner is created, this route permanently refuses additional bootstrap attempts.</p>
        <details><summary>CREATE THE FIRST OWNER ACCOUNT</summary>
          <form data-form="admin-bootstrap" class="admin-form">
            <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required ${disabled ? 'disabled' : ''}/></label>
            <label class="field"><span>New password</span><input name="password" type="password" minlength="12" autocomplete="new-password" required ${disabled ? 'disabled' : ''}/><small class="field-help">Use at least 12 characters and a unique password.</small></label>
            <label class="field"><span>One-time bootstrap code</span><input name="bootstrapCode" type="password" autocomplete="one-time-code" required ${disabled ? 'disabled' : ''}/></label>
            <button class="button button--large full-width" type="submit" ${disabled ? 'disabled' : ''}>CREATE OWNER</button>
          </form>
        </details>
        <small class="admin-security-note">The public website contains only a Supabase publishable key. Privileged actions are checked server-side against the administrator role table.</small>
      </article>
    </section>
  </main>`;
}

function unauthorized(state) {
  return `<main class="admin-shell">${adminHeader(state)}<section class="admin-empty glass"><span class="eyebrow">ACCESS DENIED</span><h1>THIS ACCOUNT IS NOT AN ADMINISTRATOR</h1><p>${escapeHtml(state.admin?.user?.email ?? 'The signed-in account')} is authenticated but has no active Friend Exchange administrator role.</p><button class="button" data-action="admin-sign-out">SIGN OUT</button></section></main>`;
}

function adminNav(state) {
  const sections = [
    ['overview', 'Overview'],
    ['settings', 'Defaults'],
    ['games', 'Games'],
    ['content', 'Game data'],
    ['rooms', 'Rooms'],
    ['audit', 'Audit'],
  ];
  return `<nav class="admin-nav glass" aria-label="Administrator sections">${sections.map(([id, label]) => `<button class="${state.admin?.section === id ? 'is-active' : ''}" data-action="admin-section" data-section="${id}">${label}</button>`).join('')}<button data-action="admin-refresh">REFRESH</button></nav>`;
}

function overview(snapshot) {
  const rooms = snapshot.rooms ?? [];
  const games = snapshot.games ?? [];
  const content = snapshot.content ?? [];
  const activeRooms = rooms.filter((room) => room.status === 'active').length;
  const connected = rooms.reduce((sum, room) => sum + Number(room.connected_count ?? 0), 0);
  return `<section class="admin-section">
    <div class="admin-heading"><div><span class="eyebrow">OPERATIONS</span><h1>CONTROL CENTER</h1><p>Global defaults and game content affect newly created sessions. Active rounds remain immutable until the host returns the room to its lobby.</p></div><span class="feed-label">LIVE CONFIGURATION</span></div>
    <div class="admin-metric-grid">
      <article class="admin-metric glass"><small>OPEN ROOMS</small><strong>${rooms.length}</strong><span>${activeRooms} active</span></article>
      <article class="admin-metric glass"><small>CONNECTED PLAYERS</small><strong>${connected}</strong><span>Across current rooms</span></article>
      <article class="admin-metric glass"><small>ENABLED GAMES</small><strong>${games.filter((game) => game.enabled).length}</strong><span>${games.length} configured</span></article>
      <article class="admin-metric glass"><small>CONTENT ITEMS</small><strong>${content.filter((item) => item.active).length}</strong><span>${content.length} total</span></article>
    </div>
    <div class="admin-overview-grid">
      <article class="admin-panel glass"><span class="eyebrow">SAFE EDITING MODEL</span><h2>Changes are versioned and server-authorized</h2><p>Game metadata, question banks and default room rules are read from Supabase. Browser clients receive only public configuration; every write requires an authenticated administrator role.</p><button class="text-button" data-action="admin-section" data-section="settings">EDIT DEFAULTS →</button></article>
      <article class="admin-panel glass"><span class="eyebrow">ROOM CONTROL</span><h2>Hosts control sessions; admins control the platform</h2><p>Room hosts can return their own active session to the lobby. Site administrators can archive broken or abandoned rooms from the room monitor.</p><button class="text-button" data-action="admin-section" data-section="rooms">OPEN ROOM MONITOR →</button></article>
    </div>
  </section>`;
}

function settingsSection(snapshot) {
  const settings = snapshot.settings ?? {};
  return `<section class="admin-section"><div class="admin-heading"><div><span class="eyebrow">GLOBAL DEFAULTS</span><h1>NEW SESSION RULES</h1><p>These values become the starting configuration for new local rooms and new online rooms. Hosts may still adjust them in their lobby.</p></div></div>
    <form data-form="admin-settings" class="admin-settings-form glass">
      <label class="field"><span>Default rounds</span><input name="roundCount" type="number" min="3" max="12" value="${Number(settings.roundCount ?? 8)}" required/></label>
      <label class="field"><span>Pre-round trading time (seconds)</span><input name="tradingSeconds" type="number" min="15" max="90" step="5" value="${Number(settings.tradingSeconds ?? 35)}" required/><small class="field-help">The database auto-locks Friend Market orders at this deadline.</small></label>
      <label class="field"><span>Friend Market starting cash</span><select name="startingFriendCash"><option value="5000" ${Number(settings.startingFriendCash) === 5000 ? 'selected' : ''}>${money(5000, 0)}</option><option value="10000" ${Number(settings.startingFriendCash ?? 10000) === 10000 ? 'selected' : ''}>${money(10000, 0)}</option><option value="25000" ${Number(settings.startingFriendCash) === 25000 ? 'selected' : ''}>${money(25000, 0)}</option></select></label>
      <label class="field"><span>Real paper-market starting cash</span><select name="startingRealCash"><option value="10000" ${Number(settings.startingRealCash) === 10000 ? 'selected' : ''}>${money(10000, 0)}</option><option value="25000" ${Number(settings.startingRealCash ?? 25000) === 25000 ? 'selected' : ''}>${money(25000, 0)}</option><option value="50000" ${Number(settings.startingRealCash) === 50000 ? 'selected' : ''}>${money(50000, 0)}</option></select></label>
      <label class="field"><span>Default volatility</span><select name="volatility">${Object.entries(VOLATILITY).map(([id, value]) => `<option value="${id}" ${settings.volatility === id ? 'selected' : ''}>${escapeHtml(value.label)}</option>`).join('')}</select></label>
      <label class="field"><span>Maximum players</span><input name="playerLimit" type="number" min="2" max="10" value="${Number(settings.playerLimit ?? 8)}" required/></label>
      <label class="check-field"><input name="allowOwnStock" type="checkbox" ${settings.allowOwnStock !== false ? 'checked' : ''}/><span><b>Allow own-stock trading by default</b><small>Players can buy themselves but can never short a company.</small></span></label>
      <button class="button button--warm button--large" type="submit">SAVE GLOBAL DEFAULTS</button>
    </form>
  </section>`;
}

function gamesSection(snapshot) {
  const games = [...(snapshot.games ?? [])].sort((left, right) => Number(left.sort_order) - Number(right.sort_order));
  return `<section class="admin-section"><div class="admin-heading"><div><span class="eyebrow">GAME CATALOGUE</span><h1>MECHANICS & PRESENTATION</h1><p>Disable games from the default rotation, edit public copy and adjust validated mechanic configuration. Code-level scoring remains version-controlled in GitHub.</p></div></div>
    <div class="admin-game-grid">${games.map((game) => `<form data-form="admin-game" class="admin-game-card glass">
      <input type="hidden" name="id" value="${escapeHtml(game.id)}"/>
      <header><div><span class="eyebrow">${escapeHtml(CATEGORY_LABELS[game.category] ?? game.category)}</span><h2>${escapeHtml(game.name)}</h2></div><label class="admin-switch"><input name="enabled" type="checkbox" ${game.enabled ? 'checked' : ''}/><span>${game.enabled ? 'ENABLED' : 'DISABLED'}</span></label></header>
      <label class="field"><span>Display name</span><input name="name" maxlength="80" value="${escapeHtml(game.name)}" required/></label>
      <label class="field"><span>Description</span><textarea name="description" maxlength="500" rows="3" required>${escapeHtml(game.description)}</textarea></label>
      <label class="field"><span>Player instructions</span><textarea name="instructions" maxlength="800" rows="3" required>${escapeHtml(game.instructions)}</textarea></label>
      <label class="field"><span>Round deadline (seconds)</span><input name="durationSeconds" type="number" min="5" max="180" value="${Number(game.duration_seconds)}" required/></label>
      <label class="field"><span>Mechanic configuration (JSON)</span><textarea name="config" rows="7" spellcheck="false">${jsonText(game.config)}</textarea></label>
      <button class="button full-width" type="submit">SAVE ${escapeHtml(game.id.toUpperCase())}</button>
    </form>`).join('')}</div>
  </section>`;
}

function contentSection(snapshot) {
  const games = snapshot.games ?? [];
  const items = [...(snapshot.content ?? [])].sort((left, right) => left.game_id.localeCompare(right.game_id) || Number(left.sort_order) - Number(right.sort_order));
  return `<section class="admin-section"><div class="admin-heading"><div><span class="eyebrow">EDITABLE GAME DATA</span><h1>QUESTIONS, COMPARISONS & PROMPTS</h1><p>Content is JSON so the same editor can manage estimation questions, Higher/Lower comparisons, social prompts and memory patterns. Invalid payloads are rejected by Postgres.</p></div></div>
    <form data-form="admin-content" class="admin-content-create glass">
      <span class="eyebrow">ADD CONTENT ITEM</span>
      <input type="hidden" name="id" value=""/>
      <label class="field"><span>Game</span><select name="gameId">${games.map((game) => `<option value="${escapeHtml(game.id)}">${escapeHtml(game.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Type</span><select name="contentType"><option value="question">Question</option><option value="comparison">Comparison</option><option value="prompt">Two-choice prompt</option><option value="pattern">Memory pattern</option></select></label>
      <label class="field"><span>Sort order</span><input name="sortOrder" type="number" value="100"/></label>
      <label class="field admin-content-create__payload"><span>Payload JSON</span><textarea name="payload" rows="7" spellcheck="false">{
  "prompt": "Example question",
  "answer": 100,
  "unit": "units"
}</textarea></label>
      <label class="check-field"><input name="active" type="checkbox" checked/><span><b>Active</b><small>Only active items are sent to game clients.</small></span></label>
      <button class="button button--warm" type="submit">ADD CONTENT</button>
    </form>
    <div class="admin-content-list">${items.map((item) => `<form data-form="admin-content" class="admin-content-row glass">
      <input type="hidden" name="id" value="${escapeHtml(item.id)}"/>
      <div class="admin-content-row__meta"><b>${escapeHtml(item.game_id)}</b><span>${escapeHtml(item.content_type)}</span><small>${dateTime(item.updated_at)}</small></div>
      <label class="field"><span>Game</span><select name="gameId">${games.map((game) => `<option value="${escapeHtml(game.id)}" ${item.game_id === game.id ? 'selected' : ''}>${escapeHtml(game.name)}</option>`).join('')}</select></label>
      <label class="field"><span>Type</span><select name="contentType">${['question','comparison','prompt','pattern'].map((type) => `<option value="${type}" ${item.content_type === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
      <label class="field"><span>Order</span><input name="sortOrder" type="number" value="${Number(item.sort_order ?? 0)}"/></label>
      <label class="check-field"><input name="active" type="checkbox" ${item.active ? 'checked' : ''}/><span><b>Active</b></span></label>
      <label class="field admin-content-row__payload"><span>Payload</span><textarea name="payload" rows="5" spellcheck="false">${jsonText(item.payload)}</textarea></label>
      <div class="admin-content-row__actions"><button class="button" type="submit">SAVE</button><button class="button button--danger" type="button" data-action="admin-delete-content" data-content-id="${escapeHtml(item.id)}">DELETE</button></div>
    </form>`).join('')}</div>
  </section>`;
}

function roomsSection(snapshot) {
  const rooms = snapshot.rooms ?? [];
  return `<section class="admin-section"><div class="admin-heading"><div><span class="eyebrow">LIVE OPERATIONS</span><h1>ROOM MONITOR</h1><p>Use administrative closure only for abandoned or broken rooms. Normal game-night control belongs to the room host.</p></div></div>
    <div class="admin-room-list">${rooms.length ? rooms.map((room) => `<article class="admin-room glass">
      <div class="admin-room__code"><small>ROOM</small><strong>${escapeHtml(room.code)}</strong></div>
      <div><h2>${escapeHtml(room.name)}</h2><p>${escapeHtml(room.status.toUpperCase())} · ${Number(room.connected_count ?? 0)}/${Number(room.member_count ?? 0)} connected</p></div>
      <div class="admin-room__phase"><small>CURRENT</small><b>${escapeHtml(room.current_game ?? room.current_phase ?? 'Lobby')}</b><span>${dateTime(room.updated_at)}</span></div>
      <button class="button button--danger" data-action="admin-close-room" data-room-id="${escapeHtml(room.id)}" data-room-code="${escapeHtml(room.code)}">ARCHIVE ROOM</button>
    </article>`).join('') : '<div class="admin-empty glass"><h2>No open rooms</h2><p>Rooms appear here while they are in the lobby, active or recently complete.</p></div>'}</div>
  </section>`;
}

function auditSection(snapshot) {
  const events = snapshot.audit ?? [];
  return `<section class="admin-section"><div class="admin-heading"><div><span class="eyebrow">ADMINISTRATIVE HISTORY</span><h1>AUDIT LOG</h1><p>Recent privileged configuration and room-management operations.</p></div></div><div class="admin-audit glass">${events.length ? events.map((event) => `<div><time>${dateTime(event.created_at)}</time><b>${escapeHtml(event.event_type)}</b><code>${escapeHtml(JSON.stringify(event.payload ?? {}))}</code></div>`).join('') : '<p>No administrative audit events yet.</p>'}</div></section>`;
}

export function adminPage(state) {
  const admin = state.admin ?? {};
  if (!admin.user) return signedOut(state);
  if (admin.status === 'unauthorized') return unauthorized(state);
  if (admin.status !== 'ready' || !admin.snapshot) {
    return `<main class="admin-shell">${adminHeader(state)}<section class="admin-empty glass"><span class="online-spinner"></span><h1>LOADING ADMINISTRATION</h1><p>${escapeHtml(admin.error ?? 'Validating permissions and loading configuration…')}</p></section></main>`;
  }
  const snapshot = admin.snapshot;
  const section = admin.section ?? 'overview';
  const content = section === 'settings' ? settingsSection(snapshot)
    : section === 'games' ? gamesSection(snapshot)
      : section === 'content' ? contentSection(snapshot)
        : section === 'rooms' ? roomsSection(snapshot)
          : section === 'audit' ? auditSection(snapshot)
            : overview(snapshot);
  return `<main class="admin-shell">${adminHeader(state)}${adminNav(state)}${admin.error ? `<div class="admin-warning">${escapeHtml(admin.error)}</div>` : ''}${content}</main>`;
}
