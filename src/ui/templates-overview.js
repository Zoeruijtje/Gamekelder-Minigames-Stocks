import { CATEGORY_LABELS, PHASES } from '../config.js';
import { getGame } from '../engine/games.js';
import { portfolioSnapshot } from '../engine/portfolio.js';
import { currentRound, friendQuotesBySymbol, phaseCountdown } from '../engine/session.js';
import { escapeHtml, money, signedMoney, signedPercent, time } from './format.js';
import { lineChart, playerAvatar, sparkline } from './template-helpers.js';

export function marketStateCard(state) {
  const round = currentRound(state);
  if (!round) return '';
  const game = getGame(round.gameId);
  const countdown = phaseCountdown(state);
  const phaseLabels = {
    briefing: 'ROUND BRIEFING',
    trading: 'MARKET OPEN',
    locked: 'TRADING LOCKED',
    game: 'GAME ACTIVE',
    settling: 'SETTLING',
    results: 'RESULTS',
    complete: 'MARKET CLOSED',
  };
  return `<div class="market-state glass glass--compact"><span class="live-dot"></span><div><small>${phaseLabels[state.session.phase] ?? state.session.phase}</small><b>${countdown !== null ? time(countdown) : escapeHtml(game.name)}</b></div></div>`;
}

export function selectedPlayer(state) {
  return state.players.find((player) => player.id === state.ui.selectedPlayerId) ?? state.players[0];
}

function combinedPortfolioSeries(state, player) {
  const real = portfolioSnapshot(state.accounts.real[player.id], state.markets.real);
  const friend = portfolioSnapshot(state.accounts.friend[player.id], friendQuotesBySymbol(state));
  const base = real.equity + friend.equity;
  return Array.from({ length: 24 }, (_, index) => base * (0.91 + index * 0.0035 + Math.sin(index * 0.9) * 0.008))
    .map((value, index, items) => index === items.length - 1 ? base : value);
}

function roundActions(state, round) {
  switch (round.phase) {
    case PHASES.BRIEFING:
      return `<button class="button button--warm full-width" data-action="open-trading">OPEN ${state.settings.tradingSeconds}s TRADING WINDOW</button>`;
    case PHASES.TRADING:
      return '<button class="button button--danger full-width" data-action="lock-trading">LOCK TRADING NOW</button>';
    case PHASES.LOCKED:
      return '<button class="button button--warm full-width" data-action="begin-game">START MINIGAME</button>';
    case PHASES.GAME:
      return '<button class="button button--warm full-width" data-action="resume-game">RESUME MINIGAME</button>';
    case PHASES.RESULTS:
      return '<button class="button button--warm full-width" data-action="show-results">VIEW SETTLEMENT</button>';
    default:
      return '<button class="button full-width" disabled>PROCESSING</button>';
  }
}

export function overview(state) {
  const player = selectedPlayer(state);
  const realSnapshot = portfolioSnapshot(state.accounts.real[player.id], state.markets.real);
  const friendSnapshot = portfolioSnapshot(state.accounts.friend[player.id], friendQuotesBySymbol(state));
  const total = realSnapshot.equity + friendSnapshot.equity;
  const starting = state.settings.startingRealCash + state.settings.startingFriendCash;
  const pnl = total - starting;
  const round = currentRound(state);
  const game = round ? getGame(round.gameId) : null;
  const friendAssets = Object.values(state.markets.friend);
  return `<section class="view-section">
    <div class="view-heading"><div><span class="eyebrow">PORTFOLIO / LIVE SESSION</span><h1>MARKET NIGHT</h1><p>Trade the room, then play the round that settles the Friend Market.</p></div>${marketStateCard(state)}</div>
    <div class="dashboard-grid">
      <article class="portfolio-hero glass"><div class="card-topline"><span class="eyebrow">COMBINED FICTIONAL EQUITY</span><span class="feed-label">DEMO + SESSION</span></div><div class="hero-value-row"><div><strong>${money(total)}</strong><em class="${pnl >= 0 ? 'positive' : 'negative'}">${signedMoney(pnl)} · ${signedPercent((pnl / starting) * 100)}</em></div><div class="mini-stats"><span>Real market<b>${money(realSnapshot.equity)}</b></span><span>Friend market<b>${money(friendSnapshot.equity)}</b></span><span>Cash<b>${money(realSnapshot.cash + friendSnapshot.cash)}</b></span></div></div>${lineChart(combinedPortfolioSeries(state, player))}<div class="chart-axis"><span>09:30</span><span>11:00</span><span>12:30</span><span>14:00</span><span>15:30</span><span>17:00</span></div></article>
      ${round ? `<article class="round-card glass"><div class="card-topline"><span class="eyebrow">ROUND ${round.index + 1} / ${state.session.roundCount}</span><span class="live-pill">${state.session.phase}</span></div><span class="round-category">${escapeHtml(CATEGORY_LABELS[game.category])}</span><h2>${escapeHtml(game.name)}</h2><p>${escapeHtml(game.description)}</p><div class="round-actions">${roundActions(state, round)}</div></article>` : ''}
      <article class="holdings-card glass"><div class="card-topline"><span class="eyebrow">FRIEND MARKET</span><button class="text-button" data-action="view" data-view="market">OPEN MARKET →</button></div><div class="asset-table">${friendAssets.map((asset) => { const owner = state.players.find((candidate) => candidate.id === asset.ownerId); return `<button class="asset-row" data-action="trade-asset" data-market="friend" data-symbol="${asset.symbol}">${playerAvatar(owner)}<span><strong>${asset.symbol}</strong><small>${escapeHtml(asset.name)}</small></span><b>${money(asset.price)}</b><em class="${asset.sessionChange >= 0 ? 'positive' : 'negative'}">${signedPercent(asset.sessionChange)}</em>${sparkline(asset.history.map((point) => point.price), asset.sessionChange >= 0 ? '' : 'is-negative')}</button>`; }).join('')}</div></article>
      <article class="impact-card glass"><span class="eyebrow">SESSION INTELLIGENCE</span><div class="impact-list">${[...friendAssets].sort((left, right) => right.sessionChange - left.sessionChange).map((asset) => `<div><b>${asset.symbol}</b><span>${asset.sentiment}</span><em class="${asset.sessionChange >= 0 ? 'positive' : 'negative'}">${signedPercent(asset.sessionChange)}</em></div>`).join('')}</div></article>
      <article class="news-teaser glass"><span class="eyebrow">THE KELDER WIRE</span><h3>${escapeHtml(state.session.news[0]?.headline ?? 'MARKET AWAITS OPENING BELL')}</h3><p>${escapeHtml(state.session.news[0]?.summary ?? '')}</p><button class="text-button" data-action="view" data-view="news">READ MARKET NEWS →</button></article>
    </div>
  </section>`;
}
