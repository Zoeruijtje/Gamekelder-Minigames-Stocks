import { CATEGORY_LABELS, PHASES } from '../config.js';
import { GAME_CATALOG } from '../engine/games.js';
import { currentRound, getLeaderboard } from '../engine/session.js';
import { ago, escapeHtml, money, signedPercent } from './format.js';
import { playerAvatar } from './template-helpers.js';

export function minigames(state) {
  const round = currentRound(state);
  return `<section class="view-section"><div class="view-heading"><div><span class="eyebrow">GAME FLOOR</span><h1>MINIGAMES</h1><p>Every game has a standardized score, category rating and Friend Market settlement.</p></div>${round ? `<button class="button button--warm" data-action="${round.phase === PHASES.LOCKED ? 'begin-game' : 'resume-game'}" ${![PHASES.LOCKED, PHASES.GAME].includes(round.phase) ? 'disabled' : ''}>${round.phase === PHASES.GAME ? 'RESUME CURRENT GAME' : 'PLAY CURRENT ROUND'}</button>` : ''}</div><div class="game-card-grid">${Object.values(GAME_CATALOG).map((game, index) => `<article class="game-catalog-card glass ${round?.gameId === game.id ? 'is-current' : ''}"><span class="game-number">${String(index + 1).padStart(2, '0')}</span><small>${escapeHtml(CATEGORY_LABELS[game.category])}</small><h2>${escapeHtml(game.name)}</h2><p>${escapeHtml(game.description)}</p><footer><b>${game.duration}s</b><span>${state.settings.enabledGames.includes(game.id) ? 'IN ROTATION' : 'DISABLED'}</span></footer></article>`).join('')}</div></section>`;
}

function rankingList(entries, type) {
  return entries.map((entry, index) => {
    const player = entry.player;
    const value = type === 'investor' ? money(entry.equity) : type === 'company' ? signedPercent(entry.asset.sessionChange) : `${entry.score} pts`;
    const sub = type === 'investor' ? 'Friend wallet equity' : type === 'company' ? `${entry.asset.symbol} · ${money(entry.asset.price)}` : 'Minigame score';
    return `<div class="leader-row"><span class="rank-index">${index + 1}</span>${playerAvatar(player)}<span><strong>${escapeHtml(player.name)}</strong><small>${sub}</small></span><em class="${type === 'company' ? (entry.asset.sessionChange >= 0 ? 'positive' : 'negative') : ''}">${value}</em></div>`;
  }).join('');
}

export function leaderboard(state) {
  const ranking = getLeaderboard(state);
  return `<section class="view-section"><div class="view-heading"><div><span class="eyebrow">THREE WAYS TO WIN</span><h1>LEADERBOARD</h1><p>Investment skill, company performance and minigame ability remain separate.</p></div></div><div class="leaderboard-grid"><article class="leader-card glass"><span class="eyebrow">INVESTORS</span><h2>Friend Market wealth</h2>${rankingList(ranking.investors, 'investor')}</article><article class="leader-card glass"><span class="eyebrow">COMPANIES</span><h2>Friend stock return</h2>${rankingList(ranking.companies, 'company')}</article><article class="leader-card glass"><span class="eyebrow">GAME FLOOR</span><h2>Minigame points</h2>${rankingList(ranking.games, 'games')}</article></div></section>`;
}

export function news(state) {
  return `<section class="view-section"><div class="view-heading"><div><span class="eyebrow">THE KELDER WIRE</span><h1>MARKET NEWS</h1><p>Absurdly serious coverage of the room’s latest results and price action.</p></div></div><div class="news-layout">${state.session.news.map((item, index) => `<article class="news-card glass ${index === 0 ? 'news-card--lead' : ''}"><span class="eyebrow">${escapeHtml(item.category)}</span><h2>${escapeHtml(item.headline)}</h2><p>${escapeHtml(item.summary)}</p><footer>FRIEND EXCHANGE WIRE · ${ago(item.createdAt).toUpperCase()}</footer></article>`).join('')}</div></section>`;
}
