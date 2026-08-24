import { portfolioSnapshot } from '../engine/portfolio.js';
import { friendQuotesBySymbol } from '../engine/session.js';
import { escapeHtml, money, number, signedMoney, signedPercent } from './format.js';
import { playerAvatar, sparkline } from './template-helpers.js';
import { marketStateCard, selectedPlayer } from './templates-overview.js';

function marketAssetCard(state, asset, type) {
  const isFriend = type === 'friend';
  const change = isFriend ? asset.sessionChange : asset.changePercent;
  const owner = isFriend ? state.players.find((player) => player.id === asset.ownerId) : null;
  const history = asset.history.map((point) => point.price);
  return `<button class="market-card glass" data-action="trade-asset" data-market="${type}" data-symbol="${asset.symbol}"><div class="market-card__top">${owner ? playerAvatar(owner) : `<span class="asset-logo">${asset.symbol.slice(0, 1)}</span>`}<span><strong>${asset.symbol}</strong><small>${escapeHtml(asset.name)}</small></span><em class="${change >= 0 ? 'positive' : 'negative'}">${signedPercent(change)}</em></div><div class="market-card__price">${money(asset.price)}</div>${sparkline(history, change >= 0 ? '' : 'is-negative')}<footer><span>${isFriend ? asset.sentiment : asset.sector}</span><b>${asset.status}</b></footer></button>`;
}

export function market(state) {
  return `<section class="view-section"><div class="view-heading"><div><span class="eyebrow">PAPER MARKETS</span><h1>TRADE THE ROOM</h1><p>Real symbols use simulated quotes for now. Friend stocks settle after every game.</p></div>${marketStateCard(state)}</div><div class="market-section"><div class="section-heading"><div><span class="eyebrow">FRIEND MARKET</span><h2>Publicly traded friends</h2></div><span class="feed-label">SESSION PRICES</span></div><div class="market-card-grid">${Object.values(state.markets.friend).map((asset) => marketAssetCard(state, asset, 'friend')).join('')}</div></div><div class="market-section"><div class="section-heading"><div><span class="eyebrow">REAL-WORLD SYMBOLS</span><h2>Fake-money paper market</h2></div><span class="feed-label">DEMO FEED · 5s</span></div><div class="market-card-grid">${Object.values(state.markets.real).map((asset) => marketAssetCard(state, asset, 'real')).join('')}</div></div></section>`;
}

function holdingsTable(snapshot) {
  if (!snapshot.positions.length) return '<div class="empty-state"><b>No positions yet</b><span>Open a market card and place a fictional order.</span></div>';
  return `<div class="table-scroll"><table><thead><tr><th>Asset</th><th>Shares</th><th>Avg. cost</th><th>Price</th><th>Value</th><th>P/L</th></tr></thead><tbody>${snapshot.positions.map((position) => `<tr><td><b>${position.symbol}</b></td><td>${number(position.quantity, 3)}</td><td>${money(position.averageCost)}</td><td>${money(position.price)}</td><td>${money(position.value)}</td><td class="${position.unrealizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(position.unrealizedPnl)}<small>${signedPercent(position.unrealizedPercent)}</small></td></tr>`).join('')}</tbody></table></div>`;
}

export function portfolio(state) {
  const player = selectedPlayer(state);
  const realSnapshot = portfolioSnapshot(state.accounts.real[player.id], state.markets.real);
  const friendSnapshot = portfolioSnapshot(state.accounts.friend[player.id], friendQuotesBySymbol(state));
  return `<section class="view-section"><div class="view-heading"><div><span class="eyebrow">${escapeHtml(player.name.toUpperCase())} / ACCOUNT</span><h1>PORTFOLIO</h1><p>Separate long-running paper holdings from the session Friend Market economy.</p></div><button class="button" data-action="switch-player">SWITCH PLAYER</button></div><div class="portfolio-layout"><article class="balance-card glass"><span class="eyebrow">REAL PORTFOLIO</span><strong>${money(realSnapshot.equity)}</strong><em class="${realSnapshot.realizedPnl >= 0 ? 'positive' : 'negative'}">Realised ${signedMoney(realSnapshot.realizedPnl)}</em><div><span>Paper cash<b>${money(realSnapshot.cash)}</b></span><span>Invested<b>${money(realSnapshot.positionsValue)}</b></span></div></article><article class="balance-card glass"><span class="eyebrow">FRIEND MARKET WALLET</span><strong>${money(friendSnapshot.equity)}</strong><em class="${friendSnapshot.realizedPnl >= 0 ? 'positive' : 'negative'}">Realised ${signedMoney(friendSnapshot.realizedPnl)}</em><div><span>Session cash<b>${money(friendSnapshot.cash)}</b></span><span>Invested<b>${money(friendSnapshot.positionsValue)}</b></span></div></article><article class="holdings-panel glass"><div class="section-heading"><div><span class="eyebrow">REAL MARKET POSITIONS</span><h2>Long-term paper holdings</h2></div></div>${holdingsTable(realSnapshot)}</article><article class="holdings-panel glass"><div class="section-heading"><div><span class="eyebrow">FRIEND POSITIONS</span><h2>Current room exposure</h2></div></div>${holdingsTable(friendSnapshot)}</article></div></section>`;
}
