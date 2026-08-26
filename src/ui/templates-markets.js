import { portfolioSnapshot, positionAnalytics } from '../engine/portfolio.js';
import { friendQuotesBySymbol } from '../engine/session.js';
import { escapeHtml, money, number, signedMoney, signedPercent } from './format.js';
import { playerAvatar, sparkline } from './template-helpers.js';
import {
  portfolioActivity,
  portfolioSummaryCard,
  positionCard,
} from './portfolio-advanced.js';
import { marketStateCard, selectedPlayer } from './templates-overview.js';

function selectedAccountContext(state, market) {
  const player = selectedPlayer(state);
  const account = state.accounts[market][player.id];
  const quotes = market === 'friend' ? friendQuotesBySymbol(state) : state.markets.real;
  return { player, account, quotes };
}

function marketAssetCard(state, asset, type) {
  const isFriend = type === 'friend';
  const change = isFriend ? asset.roundChange : asset.changePercent;
  const owner = isFriend ? state.players.find((player) => player.id === asset.ownerId) : null;
  const history = asset.history.map((point) => point.price);
  const oldPrice = asset.previousPrice ?? asset.history.at(-2)?.price ?? asset.price;
  const { account, quotes } = selectedAccountContext(state, type);
  const analytics = positionAnalytics(account, quotes, asset.symbol);
  return `<button class="market-card glass ${analytics ? 'has-position' : ''}" data-action="trade-asset" data-market="${type}" data-symbol="${asset.symbol}" data-live-asset>
    <div class="market-card__top">${owner ? playerAvatar(owner) : `<span class="asset-logo">${asset.symbol.slice(0, 1)}</span>`}<span><strong>${asset.symbol}</strong><small>${escapeHtml(asset.name)}</small></span><em data-live-change class="${change >= 0 ? 'positive' : 'negative'}">${signedPercent(change)}</em></div>
    <div class="market-card__price" data-live-price>${money(asset.price)}</div>
    ${analytics ? `<div class="market-card__holding"><span>YOU OWN ${number(analytics.quantity, 3)}</span><b class="${analytics.unrealizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(analytics.unrealizedPnl)} · ${signedPercent(analytics.unrealizedPercent)}</b></div>` : '<div class="market-card__holding is-empty"><span>NO POSITION</span><b>OPEN TRADE</b></div>'}
    ${isFriend ? `<div class="market-card__reprice"><span>LAST SETTLEMENT</span><b>${money(oldPrice)} → ${money(asset.price)}</b><small class="${asset.sessionChange >= 0 ? 'positive' : 'negative'}">SESSION ${signedPercent(asset.sessionChange)}</small></div>` : ''}
    <div data-live-sparkline>${sparkline(history, change >= 0 ? '' : 'is-negative')}</div>
    <footer><span>${isFriend ? asset.sentiment : asset.sector}</span><b>${asset.status}</b></footer>
  </button>`;
}

export function market(state) {
  return `<section class="view-section"><div class="view-heading"><div><span class="eyebrow">PAPER MARKETS</span><h1>TRADE & MANAGE RISK</h1><p>Open a stock to trade. Existing holdings show live fictional P/L and can be managed in Portfolio with stop-loss, target and trailing protection.</p></div>${marketStateCard(state)}</div>
    <div class="market-section"><div class="section-heading"><div><span class="eyebrow">FRIEND MARKET</span><h2>Publicly traded friends</h2></div><span class="feed-label">${state.mode === 'online' ? 'AUTHORITATIVE ONLINE PRICES' : 'SESSION PRICES'}</span></div><div class="market-card-grid">${Object.values(state.markets.friend).map((asset) => marketAssetCard(state, asset, 'friend')).join('')}</div></div>
    <div class="market-section"><div class="section-heading"><div><span class="eyebrow">REAL-WORLD SYMBOLS</span><h2>Fake-money paper market</h2></div><span class="feed-label">DEMO FEED · LOCAL SIMULATION</span></div><div class="market-card-grid">${Object.values(state.markets.real).map((asset) => marketAssetCard(state, asset, 'real')).join('')}</div></div>
  </section>`;
}

function positionSection(state, player, account, market, assets) {
  const quoteMap = market === 'friend' ? friendQuotesBySymbol(state) : state.markets.real;
  const snapshot = portfolioSnapshot(account, quoteMap);
  if (!snapshot.positions.length) return `<article class="portfolio-section glass"><div class="section-heading"><div><span class="eyebrow">${market === 'friend' ? 'FRIEND POSITIONS' : 'REAL PAPER POSITIONS'}</span><h2>${market === 'friend' ? 'Room exposure' : 'Long-term demo holdings'}</h2></div></div><div class="empty-state"><b>No positions yet</b><span>Open Markets and place a fictional order.</span></div></article>`;
  return `<article class="portfolio-section"><div class="section-heading"><div><span class="eyebrow">${market === 'friend' ? 'FRIEND POSITIONS' : 'REAL PAPER POSITIONS'}</span><h2>${market === 'friend' ? 'Manage room exposure' : 'Manage demo holdings'}</h2><p>Each card shows current profit, cost basis, allocation and active protection.</p></div><span class="feed-label">${snapshot.positions.length} OPEN</span></div><div class="position-grid">${snapshot.positions.map((position) => {
    const asset = market === 'friend'
      ? Object.values(assets).find((candidate) => candidate.symbol === position.symbol)
      : assets[position.symbol];
    return positionCard(state, { player, account, asset, market });
  }).join('')}</div></article>`;
}

export function portfolio(state) {
  const player = selectedPlayer(state);
  const realAccount = state.accounts.real[player.id];
  const friendAccount = state.accounts.friend[player.id];
  const realSnapshot = portfolioSnapshot(realAccount, state.markets.real);
  const friendSnapshot = portfolioSnapshot(friendAccount, friendQuotesBySymbol(state));
  const totalEquity = realSnapshot.equity + friendSnapshot.equity;
  const totalPnl = realSnapshot.totalPnl + friendSnapshot.totalPnl;
  return `<section class="view-section portfolio-advanced"><div class="view-heading"><div><span class="eyebrow">${escapeHtml(player.name.toUpperCase())} / ACCOUNT</span><h1>PORTFOLIO COMMAND CENTER</h1><p>Track exact profit, inspect every holding, preview sale proceeds and automate fictional risk controls.</p></div>${state.mode === 'online' ? '<span class="feed-label">PRIVATE ONLINE WALLET</span>' : '<button class="button" data-action="switch-player">SWITCH PLAYER</button>'}</div>
    <article class="portfolio-total glass"><span class="eyebrow">TOTAL FICTIONAL EQUITY</span><strong>${money(totalEquity)}</strong><em class="${totalPnl >= 0 ? 'positive' : 'negative'}">ALL-TIME POSITION P/L ${signedMoney(totalPnl)}</em><p>Real paper holdings and the Friend Market remain separate economies. No real money or brokerage connection.</p></article>
    <div class="advanced-balance-grid">${portfolioSummaryCard('REAL PAPER PORTFOLIO', realSnapshot, 'real')}${portfolioSummaryCard('FRIEND MARKET WALLET', friendSnapshot, 'friend')}</div>
    ${positionSection(state, player, friendAccount, 'friend', state.markets.friend)}
    ${positionSection(state, player, realAccount, 'real', state.markets.real)}
    <article class="portfolio-section glass"><div class="section-heading"><div><span class="eyebrow">ORDER & PROTECTION HISTORY</span><h2>Recent fictional executions</h2></div></div>${portfolioActivity([{ account: friendAccount, market: 'friend' }, { account: realAccount, market: 'real' }])}</article>
  </section>`;
}
