import { PHASES } from '../config.js';
import { getGame } from '../engine/games.js';
import { currentRound } from '../engine/session.js';
import { escapeHtml } from './format.js';

function icon(name) {
  const icons = {
    overview: '<path d="M4 13h6V4H4v9Zm10 7h6v-9h-6v9ZM4 20h6v-3H4v3Zm10-13h6V4h-6v3Z"/>',
    market: '<path d="M4 17 9 12l4 3 7-9M16 6h4v4"/>',
    portfolio: '<path d="M4 7h16v12H4zM8 7V5h8v2M4 11h16M9 15h6"/>',
    games: '<path d="M8 8h8a5 5 0 0 1 5 5v3a3 3 0 0 1-5 2l-2-2h-4l-2 2a3 3 0 0 1-5-2v-3a5 5 0 0 1 5-5Zm0 4v4m-2-2h4m6-1h.01m2 2h.01"/>',
    leaderboard: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0V4Zm0 2H4v2a4 4 0 0 0 4 4m9-6h3v2a4 4 0 0 1-4 4"/>',
    news: '<path d="M5 5h12v14H5zM9 9h5M9 13h5M9 17h3M17 8h2v9a2 2 0 0 1-2 2"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] ?? icons.overview}</svg>`;
}

export function playerAvatar(player, size = '') {
  return `<i class="avatar ${size}" style="--player:${player.color}">${escapeHtml(player.name.slice(0, 1).toUpperCase())}</i>`;
}

export function sparkline(values, className = '') {
  if (!values.length) return '';
  const width = 120;
  const height = 34;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.001);
  const points = values.map((value, index) => {
    const x = (index / Math.max(values.length - 1, 1)) * width;
    const y = height - ((value - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="sparkline ${className}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><polyline points="${points}"/></svg>`;
}

export function lineChart(values, className = '') {
  if (!values.length) return '';
  const width = 780;
  const height = 250;
  const min = Math.min(...values) * 0.995;
  const max = Math.max(...values) * 1.005;
  const range = Math.max(max - min, 0.001);
  const points = values.map((value, index) => {
    const x = 24 + (index / Math.max(values.length - 1, 1)) * (width - 48);
    const y = height - 22 - ((value - min) / range) * (height - 52);
    return [x, y];
  });
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${height - 18} L${points[0][0].toFixed(1)},${height - 18} Z`;
  return `<svg class="main-chart ${className}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><linearGradient id="chartArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".25"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs><g class="chart-grid"><line x1="24" y1="45" x2="756" y2="45"/><line x1="24" y1="105" x2="756" y2="105"/><line x1="24" y1="165" x2="756" y2="165"/><line x1="24" y1="225" x2="756" y2="225"/></g><path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/><circle class="chart-point" cx="${points.at(-1)[0]}" cy="${points.at(-1)[1]}" r="4"/></svg>`;
}

function nav(state) {
  const views = [
    ['overview', 'Overview'],
    ['market', 'Markets'],
    ['portfolio', 'Portfolio'],
    ['minigames', 'Minigames'],
    ['leaderboard', 'Leaderboard'],
    ['news', 'News'],
  ];
  return `<nav class="primary-nav" aria-label="Main navigation">${views.map(([id, label]) => `<button class="nav-item ${state.ui.activeView === id ? 'is-active' : ''}" data-action="view" data-view="${id}">${icon(id === 'minigames' ? 'games' : id)}<span>${label}</span></button>`).join('')}</nav>`;
}

export function appHeader(state) {
  const selected = state.players.find((player) => player.id === state.ui.selectedPlayerId) ?? state.players[0];
  const round = currentRound(state);
  return `<header class="app-header glass">
    <button class="brand" data-action="route" data-route="${state.session.status === PHASES.LOBBY ? 'landing' : 'session'}"><span class="brand-mark">FE</span><span><strong>FRIEND EXCHANGE</strong><small>${state.session.status === 'active' ? `ROUND ${state.session.roundIndex + 1} · ${round ? getGame(round.gameId).name : 'LIVE'}` : 'GAMEKELDER'}</small></span></button>
    ${state.route === 'session' ? nav(state) : '<div></div>'}
    <div class="header-actions">
      ${state.route === 'session' ? `<button class="status-chip" data-action="switch-player">${playerAvatar(selected)}<span><small>Playing as</small><b>${escapeHtml(selected.name)}</b></span></button>` : ''}
      <button class="icon-button" data-action="open-controller" title="Open controller tab">↗</button>
    </div>
  </header>`;
}

export function environment() {
  return '<div class="environment" aria-hidden="true"></div><div class="environment-vignette" aria-hidden="true"></div><div class="grain" aria-hidden="true"></div>';
}

