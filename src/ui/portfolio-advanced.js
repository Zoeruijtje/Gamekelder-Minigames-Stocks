import {
  activeProtectionFor,
  portfolioSnapshot,
  positionAnalytics,
  sellNowPreview,
} from '../engine/portfolio.js';
import { escapeHtml, money, number, signedMoney, signedPercent, time } from './format.js';
import { playerAvatar } from './template-helpers.js';
import { currentRound } from '../engine/session.js';
import { tradingSecondsRemaining } from '../engine/deadline.js';
import { PHASES } from '../config.js';

function chartPath(values, width = 720, height = 210, referenceValues = []) {
  if (!values.length) return null;
  const scaleValues = [...values, ...referenceValues.filter(Number.isFinite)];
  const min = Math.min(...scaleValues);
  const max = Math.max(...scaleValues);
  const pad = Math.max((max - min) * .1, Math.abs(max || 1) * .01, .01);
  const low = min - pad;
  const high = max + pad;
  const range = Math.max(high - low, .001);
  const yFor = (value) => height - 20 - ((value - low) / range) * (height - 40);
  const points = values.map((value, index) => {
    const x = 18 + index / Math.max(values.length - 1, 1) * (width - 36);
    return [x, yFor(value)];
  });
  const line = points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points.at(-1)[0].toFixed(1)},${height - 15} L${points[0][0].toFixed(1)},${height - 15} Z`;
  return { line, area, points, min, max, width, height, low, high, yFor };
}

export function performanceChart(points, {
  mode = 'profit', compact = false, id = 'performance', referenceLines = [],
} = {}) {
  if (!points?.length) return '<div class="advanced-chart-empty">Performance history starts after the next observed market event.</div>';
  const values = points.map((point) => Number(point[mode] ?? point.value ?? 0));
  const normalizedReferences = referenceLines
    .map((line) => ({ ...line, value: Number(line.value) }))
    .filter((line) => Number.isFinite(line.value));
  const chart = chartPath(values, compact ? 420 : 720, compact ? 130 : 210, normalizedReferences.map((line) => line.value));
  const positive = mode === 'profit' ? values.at(-1) >= 0 : values.at(-1) >= values[0];
  const gradientId = `advancedChartArea-${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const references = normalizedReferences.map((line) => {
    const y = chart.yFor(line.value);
    return `<g class="advanced-chart__reference ${escapeHtml(line.className ?? '')}"><line x1="18" y1="${y.toFixed(1)}" x2="${chart.width - 18}" y2="${y.toFixed(1)}"/><text x="${chart.width - 22}" y="${Math.max(12, y - 4).toFixed(1)}" text-anchor="end">${escapeHtml(line.label)} ${mode === 'profit' ? signedMoney(line.value) : money(line.value)}</text></g>`;
  }).join('');
  const last = points.at(-1);
  return `<div class="advanced-chart ${compact ? 'advanced-chart--compact' : ''} ${positive ? '' : 'is-negative'}" data-chart-mode="${mode}">
    <svg viewBox="0 0 ${chart.width} ${chart.height}" preserveAspectRatio="none" role="img" aria-label="${mode === 'profit' ? 'Position profit history' : 'Asset price history'}">
      <defs><linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".26"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>
      <g class="advanced-chart__grid"><line x1="18" y1="35" x2="${chart.width - 18}" y2="35"/><line x1="18" y1="${Math.round(chart.height / 2)}" x2="${chart.width - 18}" y2="${Math.round(chart.height / 2)}"/><line x1="18" y1="${chart.height - 20}" x2="${chart.width - 18}" y2="${chart.height - 20}"/></g>
      ${references}
      <path class="advanced-chart__area" style="fill:url(#${gradientId})" d="${chart.area}"/>
      <path class="advanced-chart__line" d="${chart.line}"/>
      <circle class="advanced-chart__point" cx="${chart.points.at(-1)[0]}" cy="${chart.points.at(-1)[1]}" r="${compact ? 3 : 4}"><title>${mode === 'profit' ? signedMoney(values.at(-1)) : money(values.at(-1))}${last?.reason ? ` · ${last.reason}` : ''}</title></circle>
    </svg>
    <div class="advanced-chart__labels"><span>${mode === 'profit' ? signedMoney(chart.min) : money(chart.min)}</span><b>${mode === 'profit' ? signedMoney(values.at(-1)) : money(values.at(-1))}</b><span>${mode === 'profit' ? signedMoney(chart.max) : money(chart.max)}</span></div>
  </div>`;
}

function protectionLabel(order) {
  if (!order) return 'NO PROTECTION';
  if (order.type === 'stop_loss') return `STOP ${money(order.stopPrice)}`;
  if (order.type === 'take_profit') return `TARGET ${money(order.takeProfitPrice)}`;
  if (order.type === 'trailing_stop') return `TRAIL ${number(order.trailPercent, 1)}%`;
  return `BRACKET ${money(order.stopPrice)} / ${money(order.takeProfitPrice)}`;
}

export function positionCard(state, { player, account, asset, market }) {
  const quotes = market === 'friend'
    ? Object.fromEntries(Object.values(state.markets.friend).map((item) => [item.symbol, item]))
    : state.markets.real;
  const analytics = positionAnalytics(account, quotes, asset.symbol);
  if (!analytics) return '';
  const owner = market === 'friend' ? state.players.find((candidate) => candidate.id === asset.ownerId) : null;
  return `<article class="position-card glass ${analytics.unrealizedPnl >= 0 ? 'is-positive' : 'is-negative'}" data-live-position data-market="${market}" data-symbol="${asset.symbol}">
    <header>${owner ? playerAvatar(owner) : `<span class="asset-logo">${asset.symbol.slice(0, 1)}</span>`}<span><strong>${escapeHtml(asset.symbol)}</strong><small>${escapeHtml(asset.name)}</small></span><em class="protection-pill ${analytics.protection ? 'is-active' : ''}">${escapeHtml(protectionLabel(analytics.protection))}</em></header>
    <div class="position-card__value"><span><small>MARKET VALUE</small><b data-live-position-value>${money(analytics.value)}</b></span><span><small>UNREALISED P/L</small><b data-live-position-pnl class="${analytics.unrealizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(analytics.unrealizedPnl)} <i>${signedPercent(analytics.unrealizedPercent)}</i></b></span></div>
    <div data-live-position-chart>${performanceChart(analytics.profitSeries, { mode: 'profit', compact: true, id: `${market}-${asset.symbol}`, referenceLines: [{ label: 'BREAK EVEN', value: 0, className: 'is-break-even' }] })}</div>
    <div class="position-card__stats"><span>Shares<b>${number(analytics.quantity, 3)}</b></span><span>Avg. cost<b>${money(analytics.averageCost)}</b></span><span>Price<b>${money(analytics.price)}</b></span><span>Allocation<b>${number(analytics.allocationPercent, 1)}%</b></span></div>
    <footer><span>Total return <b class="${analytics.totalPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(analytics.totalPnl)}</b><small>Sell all now: ${money(analytics.sellAll.proceeds)} · ${signedMoney(analytics.sellAll.realizedPnl)}</small></span><button class="button button--warm" data-action="manage-position" data-market="${market}" data-symbol="${asset.symbol}">MANAGE POSITION</button></footer>
  </article>`;
}

function historyPoints(snapshot) {
  return (snapshot.history ?? []).map((point) => ({ value: Number(point.equity ?? 0), profit: Number(point.equity ?? 0) - Number(snapshot.history?.[0]?.equity ?? point.equity ?? 0), at: point.at, reason: point.eventType }));
}

export function portfolioSummaryCard(label, snapshot, market) {
  const points = historyPoints(snapshot);
  return `<article class="advanced-balance-card glass">
    <header><span class="eyebrow">${escapeHtml(label)}</span><em>${market === 'friend' ? 'SESSION ECONOMY' : 'DEMO PAPER MARKET'}</em></header>
    <div class="advanced-balance-card__value"><strong>${money(snapshot.equity)}</strong><span class="${snapshot.totalPnl >= 0 ? 'positive' : 'negative'}">TOTAL P/L ${signedMoney(snapshot.totalPnl)}</span></div>
    ${performanceChart(points, { mode: 'profit', compact: true, id: `account-${market}` })}
    <div class="advanced-balance-card__stats"><span>Cash<b>${money(snapshot.cash)}</b></span><span>Invested<b>${money(snapshot.positionsValue)}</b></span><span>Unrealised<b class="${snapshot.unrealizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(snapshot.unrealizedPnl)}</b></span><span>Realised<b class="${snapshot.realizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(snapshot.realizedPnl)}</b></span></div>
  </article>`;
}

export function portfolioActivity(accounts) {
  const entries = accounts.flatMap(({ account, market }) => (account.ledger ?? []).map((fill) => ({ ...fill, market })))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, 16);
  if (!entries.length) return '<div class="empty-state"><b>No fills yet</b><span>Your completed market and protective orders will appear here.</span></div>';
  return `<div class="portfolio-activity">${entries.map((fill) => `<div class="portfolio-activity__row ${fill.protectiveOrderId ? 'is-protective' : ''}"><span class="trade-side trade-side--${fill.side}">${escapeHtml(fill.side.toUpperCase())}</span><span><b>${escapeHtml(fill.symbol)}</b><small>${fill.protectiveOrderId ? 'AUTOMATED PROTECTION' : escapeHtml(fill.market.toUpperCase())}</small></span><span>${number(fill.quantity, 3)} @ ${money(fill.price)}</span><strong>${money(fill.gross)}</strong><em class="${fill.realizedPnl >= 0 ? 'positive' : 'negative'}">${fill.side === 'sell' ? signedMoney(fill.realizedPnl) : '—'}</em></div>`).join('')}</div>`;
}

export function positionManagerModal(state) {
  const modal = state.ui.modal;
  if (!modal || modal.type !== 'position') return '';
  const market = modal.market;
  const symbol = modal.symbol;
  const player = state.players.find((candidate) => candidate.id === state.ui.selectedPlayerId) ?? state.players[0];
  const account = state.accounts[market]?.[player.id];
  const asset = market === 'friend'
    ? Object.values(state.markets.friend).find((candidate) => candidate.symbol === symbol)
    : state.markets.real[symbol];
  const quotes = market === 'friend'
    ? Object.fromEntries(Object.values(state.markets.friend).map((item) => [item.symbol, item]))
    : state.markets.real;
  const analytics = positionAnalytics(account, quotes, symbol);
  if (!asset || !analytics) return '';
  const protection = activeProtectionFor(account, symbol);
  const mode = modal.chartMode ?? 'profit';
  const chartPoints = mode === 'profit' ? analytics.profitSeries : analytics.profitSeries.map((point) => ({ ...point, price: point.price }));
  const preview = sellNowPreview(account, quotes, symbol, { quantityPercent: 100 });
  const stopDefault = protection?.stopPrice ?? Math.max(.01, analytics.price * .9);
  const targetDefault = protection?.takeProfitPrice ?? analytics.price * 1.15;
  const trailingDefault = protection?.trailPercent ?? 8;
  const type = protection?.type ?? 'stop_loss';
  const round = currentRound(state);
  const protectionEditable = market !== 'friend' || (round?.phase === PHASES.TRADING && (tradingSecondsRemaining(state) ?? 0) > 0);
  const remaining = market === 'friend' ? tradingSecondsRemaining(state) : null;
  const trailingTrigger = protection?.type === 'trailing_stop' && protection.peakPrice
    ? protection.peakPrice * (1 - protection.trailPercent / 100)
    : null;
  const referenceLines = mode === 'profit'
    ? [{ label: 'BREAK EVEN', value: 0, className: 'is-break-even' }]
    : [
      { label: 'AVG COST', value: analytics.averageCost, className: 'is-break-even' },
      protection?.stopPrice ? { label: 'STOP', value: protection.stopPrice, className: 'is-stop' } : null,
      protection?.takeProfitPrice ? { label: 'TARGET', value: protection.takeProfitPrice, className: 'is-target' } : null,
      trailingTrigger ? { label: 'TRAIL', value: trailingTrigger, className: 'is-stop' } : null,
    ].filter(Boolean);
  return `<div class="modal-layer"><button class="modal-scrim" data-action="close-modal" aria-label="Close"></button><section class="position-modal glass" data-modal-key="position:${market}:${symbol}" data-preserve-scope="position:${market}:${symbol}">
    <header><div><span class="eyebrow">${market === 'friend' ? 'FRIEND MARKET POSITION' : 'DEMO PAPER POSITION'}</span><h2>${escapeHtml(symbol)}</h2><p>${escapeHtml(asset.name)} · ${number(analytics.quantity, 3)} shares</p></div><button class="icon-button" data-action="close-modal">×</button></header>
    <div class="position-manager__hero"><div><small>CURRENT VALUE</small><strong>${money(analytics.value)}</strong><em class="${analytics.unrealizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(analytics.unrealizedPnl)} · ${signedPercent(analytics.unrealizedPercent)}</em></div><div class="position-manager__hero-actions"><button class="button" data-action="buy-more-position" data-market="${market}" data-symbol="${symbol}">BUY MORE</button><div class="chart-toggle"><button class="${mode === 'profit' ? 'is-active' : ''}" data-action="position-chart-mode" data-mode="profit">PROFIT</button><button class="${mode === 'price' ? 'is-active' : ''}" data-action="position-chart-mode" data-mode="price">PRICE</button></div></div></div>
    ${performanceChart(chartPoints, { mode, id: `manager-${market}-${symbol}`, referenceLines })}
    <div class="position-manager__metrics"><span>Invested cost<b>${money(analytics.cost)}</b></span><span>Average cost<b>${money(analytics.averageCost)}</b></span><span>Current price<b>${money(analytics.price)}</b></span><span>Realised on symbol<b class="${analytics.realizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(analytics.realizedPnl)}</b></span><span>Total return<b class="${analytics.totalPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(analytics.totalPnl)}</b></span><span>Session drawdown<b class="${analytics.drawdownPercent >= 0 ? 'positive' : 'negative'}">${signedPercent(analytics.drawdownPercent)}</b></span></div>
    <div class="position-manager__grid">
      <form data-form="position-sell" class="position-action-card" data-preserve-scope="sell:${market}:${symbol}"><span class="eyebrow">SELL NOW</span><h3>Know the exact outcome</h3><input type="hidden" name="market" value="${market}"/><input type="hidden" name="symbol" value="${symbol}"/>
        <div class="preset-row"><button type="button" data-action="sell-preset" data-percent="25">25%</button><button type="button" data-action="sell-preset" data-percent="50">50%</button><button type="button" data-action="sell-preset" data-percent="100" class="is-active">ALL</button></div>
        <label class="field"><span>Shares to sell</span><input name="quantity" type="number" min="0.001" max="${analytics.quantity}" step="0.001" value="${analytics.quantity}" inputmode="decimal"/></label>
        <div class="sell-preview" data-sell-preview><span>Sale proceeds<b>${money(preview.proceeds)}</b></span><span>Cost basis sold<b>${money(preview.costBasis)}</b></span><span>Realised P/L<b class="${preview.realizedPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(preview.realizedPnl)} · ${signedPercent(preview.realizedPercent)}</b></span><span>Cash after sale<b>${money(preview.cashAfter)}</b></span><span>Shares remaining<b>${number(preview.remainingQuantity, 3)}</b></span><span>Total realised after<b class="${preview.afterSaleTotalPnl >= 0 ? 'positive' : 'negative'}">${signedMoney(preview.afterSaleTotalPnl)}</b></span></div>
        <button class="button button--danger button--large full-width" type="submit">SELL ${escapeHtml(symbol)} AT ${money(analytics.price)}</button><small>Immediate fictional market order. No real money.</small>
      </form>
      <form data-form="protective-order" class="position-action-card position-action-card--risk ${protectionEditable ? '' : 'is-locked'}" data-preserve-scope="risk:${market}:${symbol}"><span class="eyebrow">AUTOMATED PROTECTION</span><h3>Stop loss, target or trail</h3><input type="hidden" name="market" value="${market}"/><input type="hidden" name="symbol" value="${symbol}"/>
        ${market === 'friend' ? `<div class="risk-window-status ${protectionEditable ? 'is-open' : 'is-closed'}"><b>${protectionEditable ? `EDIT WINDOW ${time(remaining)}` : 'EDITING LOCKED'}</b><span>${protectionEditable ? 'Protection can be saved until the market auto-locks.' : 'Existing protection remains active. Changes reopen next pre-round trading window.'}</span></div>` : ''}<label class="field"><span>Protection type</span><select name="type" ${protectionEditable ? '' : 'disabled'}><option value="stop_loss" ${type === 'stop_loss' ? 'selected' : ''}>Stop loss</option><option value="take_profit" ${type === 'take_profit' ? 'selected' : ''}>Take profit</option><option value="trailing_stop" ${type === 'trailing_stop' ? 'selected' : ''}>Trailing stop</option><option value="bracket" ${type === 'bracket' ? 'selected' : ''}>Bracket: stop + target</option></select></label>
        <div class="risk-fields"><label class="field" data-risk-field="stop"><span>Stop price</span><input name="stopPrice" type="number" ${protectionEditable ? '' : 'disabled'} min="0.01" step="0.01" value="${Number(stopDefault).toFixed(2)}"/></label><label class="field" data-risk-field="target"><span>Target price</span><input name="takeProfitPrice" type="number" ${protectionEditable ? '' : 'disabled'} min="0.01" step="0.01" value="${Number(targetDefault).toFixed(2)}"/></label><label class="field" data-risk-field="trail"><span>Trail below peak (%)</span><input name="trailPercent" type="number" ${protectionEditable ? '' : 'disabled'} min="0.5" max="50" step="0.5" value="${Number(trailingDefault).toFixed(1)}"/></label><label class="field"><span>Position protected (%)</span><input name="quantityPercent" type="number" ${protectionEditable ? '' : 'disabled'} min="1" max="100" step="1" value="${number(protection?.quantityPercent ?? 100, 0)}"/></label></div>
        <div class="risk-preview" data-risk-preview><span>Current price<b>${money(analytics.price)}</b></span><span>Protected quantity<b>${number(analytics.quantity * (protection?.quantityPercent ?? 100) / 100, 3)}</b></span><p>${market === 'friend' ? 'Friend Market protection is evaluated at the authoritative round settlement price.' : 'DEMO protection is evaluated on local simulated quote ticks while this app is open.'}</p></div>
        <button class="button button--warm button--large full-width" type="submit" ${protectionEditable ? '' : 'disabled'}>${protection ? 'UPDATE PROTECTION' : 'ACTIVATE PROTECTION'}</button>
        ${protection ? `<button class="button full-width" type="button" data-action="cancel-protection" data-order-id="${protection.id}" data-market="${market}" ${protectionEditable ? '' : 'disabled'}>CANCEL ${escapeHtml(protectionLabel(protection))}</button>` : ''}
      </form>
    </div>
  </section></div>`;
}
