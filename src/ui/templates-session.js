import { PHASES } from '../config.js';
import { getGame } from '../engine/games.js';
import { portfolioSnapshot } from '../engine/portfolio.js';
import { currentRound, friendQuotesBySymbol } from '../engine/session.js';
import { escapeHtml, money, signedPercent } from './format.js';
import { playerAvatar } from './template-helpers.js';
import { leaderboard, minigames, news } from './templates-content.js';
import { market, portfolio } from './templates-markets.js';
import { marketStateCard, overview, selectedPlayer } from './templates-overview.js';

export function session(state) {
  const views = { overview, market, portfolio, minigames, leaderboard, news };
  const renderView = views[state.ui.activeView] ?? overview;
  return `<main class="session-shell">${renderView(state)}</main><footer class="market-ticker glass"><span><i class="live-dot"></i> ${state.mode === 'online' ? 'ONLINE FRIEND MARKET' : 'MARKET TICKER'}</span><div>${Object.values(state.markets.real).map((asset) => `<b>${asset.symbol}<em>${money(asset.price)}</em><small class="${asset.changePercent >= 0 ? 'positive' : 'negative'}">${signedPercent(asset.changePercent)}</small></b>`).join('')}${Object.values(state.markets.friend).map((asset) => `<b>${asset.symbol}<em>${money(asset.price)}</em><small class="${asset.roundChange >= 0 ? 'positive' : 'negative'}">${signedPercent(asset.roundChange)}</small></b>`).join('')}</div><small>all money is fictional</small></footer>`;
}

export function controller(state) {
  const player = selectedPlayer(state);
  const round = currentRound(state);
  const friendSnapshot = portfolioSnapshot(state.accounts.friend[player.id], friendQuotesBySymbol(state));
  return `<main class="controller-shell"><header class="controller-header glass">${playerAvatar(player, 'avatar--large')}<span><small>${state.mode === 'online' ? `ONLINE · ${escapeHtml(state.online.roomCode ?? '')}` : 'CONTROLLER'}</small><strong>${escapeHtml(player.name)}</strong><em>${escapeHtml(player.ticker)}</em></span><div class="controller-header__actions">${state.mode === 'online' ? '<span class="feed-label">SYNCED</span>' : '<button class="button" data-action="switch-player">SWITCH</button>'}<button class="button button--warm" data-action="open-session-menu">MENU</button></div></header>${!round ? `<section class="controller-card glass"><h1>Waiting for a session</h1><p>${state.mode === 'online' ? 'The host has not opened the online market yet.' : 'Return to the host screen and create a local room.'}</p><button class="button full-width" data-action="menu-go-home">MAIN MENU</button></section>` : `${marketStateCard(state)}<section class="controller-card glass"><span class="eyebrow">ROUND ${round.index + 1} · ${state.session.phase}</span><h1>${escapeHtml(getGame(round.gameId).name)}</h1><p>${escapeHtml(getGame(round.gameId).instructions)}</p>${round.phase === PHASES.TRADING ? '<div class="controller-trading-note"><b>TRADE NOW</b><span>Tap a friend stock below. Your order must reach the server before 00:00.</span></div>' : ''}${[PHASES.LOCKED, PHASES.GAME].includes(round.phase) ? `<button class="button button--warm button--large full-width" data-action="${round.phase === PHASES.GAME ? 'resume-game' : 'begin-game'}">${round.phase === PHASES.GAME ? 'PLAY / RESUME' : state.mode === 'online' ? 'WAIT FOR HOST' : 'PLAY ROUND'}</button>` : ''}</section><section class="controller-card glass"><div class="card-topline"><span class="eyebrow">FRIEND WALLET</span><b>${money(friendSnapshot.equity)}</b></div><div class="controller-markets">${Object.values(state.markets.friend).map((asset) => `<button data-action="trade-asset" data-market="friend" data-symbol="${asset.symbol}" ${round.phase === PHASES.TRADING ? '' : 'aria-describedby="friend-market-locked"'}><span><strong>${asset.symbol}</strong><small>${money(asset.price)}</small></span><em class="${asset.roundChange >= 0 ? 'positive' : 'negative'}">${signedPercent(asset.roundChange)}</em></button>`).join('')}</div>${round.phase !== PHASES.TRADING ? '<small id="friend-market-locked" class="controller-market-lock">Friend Market orders reopen at the start of the next round.</small>' : '<small class="controller-market-lock is-open">Friend Market orders auto-lock when the timer reaches 00:00.</small>'}</section>`}</main>`;
}
