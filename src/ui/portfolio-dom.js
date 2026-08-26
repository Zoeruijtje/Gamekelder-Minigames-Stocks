import { positionAnalytics, sellNowPreview } from '../engine/portfolio.js';
import { friendQuotesBySymbol } from '../engine/session.js';
import { money, number, signedMoney, signedPercent } from './format.js';
import { performanceChart } from './portfolio-advanced.js';

function selectedPlayer(state) {
  return state.players.find((player) => player.id === state.ui.selectedPlayerId) ?? state.players[0];
}

function contextForForm(form, state) {
  const data = new FormData(form);
  const market = String(data.get('market'));
  const symbol = String(data.get('symbol'));
  const player = selectedPlayer(state);
  const account = state.accounts[market]?.[player.id];
  const quotes = market === 'friend' ? friendQuotesBySymbol(state) : state.markets.real;
  return { data, market, symbol, player, account, quotes };
}

export function updateSellPreview(form, state) {
  if (!form?.matches?.('[data-form="position-sell"]')) return;
  const { data, symbol, account, quotes } = contextForForm(form, state);
  const preview = sellNowPreview(account, quotes, symbol, { quantity: Number(data.get('quantity')) });
  const root = form.querySelector('[data-sell-preview]');
  if (!root) return;
  const items = root.querySelectorAll('b');
  if (items[0]) items[0].textContent = money(preview.proceeds);
  if (items[1]) items[1].textContent = money(preview.costBasis);
  if (items[2]) {
    items[2].textContent = `${signedMoney(preview.realizedPnl)} · ${signedPercent(preview.realizedPercent)}`;
    items[2].className = preview.realizedPnl >= 0 ? 'positive' : 'negative';
  }
  if (items[3]) items[3].textContent = money(preview.cashAfter);
  if (items[4]) items[4].textContent = number(preview.remainingQuantity, 3);
  if (items[5]) {
    items[5].textContent = signedMoney(preview.afterSaleTotalPnl);
    items[5].className = preview.afterSaleTotalPnl >= 0 ? 'positive' : 'negative';
  }
}

export function applySellPreset(button, state) {
  const form = button.closest('form[data-form="position-sell"]');
  if (!form) return;
  const { symbol, account } = contextForForm(form, state);
  const position = account?.positions?.[symbol];
  const percent = Number(button.dataset.percent ?? 100);
  const quantity = Math.max(0, Number(position?.quantity ?? 0) * percent / 100);
  form.querySelector('input[name="quantity"]').value = quantity.toFixed(3);
  form.querySelectorAll('[data-action="sell-preset"]').forEach((item) => item.classList.toggle('is-active', item === button));
  updateSellPreview(form, state);
}

export function updateRiskFieldVisibility(form) {
  if (!form?.matches?.('[data-form="protective-order"]')) return;
  const type = form.querySelector('[name="type"]')?.value;
  form.querySelector('[data-risk-field="stop"]')?.classList.toggle('is-hidden', !['stop_loss', 'bracket'].includes(type));
  form.querySelector('[data-risk-field="target"]')?.classList.toggle('is-hidden', !['take_profit', 'bracket'].includes(type));
  form.querySelector('[data-risk-field="trail"]')?.classList.toggle('is-hidden', type !== 'trailing_stop');
}

export function updateOrderInputMode(form, state) {
  if (!form?.matches?.('[data-form="order"]')) return;
  const side = form.querySelector('input[name="side"]:checked')?.value ?? 'buy';
  const amountField = form.querySelector('[data-order-notional]');
  const quantityField = form.querySelector('[data-order-quantity]');
  amountField?.classList.toggle('is-hidden', side !== 'buy');
  quantityField?.classList.toggle('is-hidden', side !== 'sell');
  const notionalInput = amountField?.querySelector('input');
  const quantityInput = quantityField?.querySelector('input');
  if (notionalInput) notionalInput.disabled = side !== 'buy';
  if (quantityInput) {
    quantityInput.disabled = side !== 'sell';
    if (side === 'sell' && !quantityInput.value) {
      const { account, symbol } = contextForForm(form, state);
      quantityInput.value = Number(account?.positions?.[symbol]?.quantity ?? 0).toFixed(3);
    }
  }
  refreshOrderPreview(form, state);
}

export function applyOrderPreset(button, state) {
  const form = button.closest('form[data-form="order"]');
  if (!form) return;
  const { account, symbol } = contextForForm(form, state);
  const side = form.querySelector('input[name="side"]:checked')?.value ?? 'buy';
  if (side === 'buy') {
    const fixed = Number(button.dataset.amount);
    const percent = Number(button.dataset.cashPercent);
    const value = Number.isFinite(fixed) && fixed > 0 ? fixed : account.cash * percent / 100;
    form.querySelector('[name="notional"]').value = Math.min(value, account.cash).toFixed(2);
  } else {
    const position = account.positions[symbol];
    const percent = Number(button.dataset.positionPercent ?? 100);
    form.querySelector('[name="quantity"]').value = (Number(position?.quantity ?? 0) * percent / 100).toFixed(3);
  }
  form.querySelectorAll('[data-action="order-preset"]').forEach((item) => item.classList.toggle('is-active', item === button));
  refreshOrderPreview(form, state);
}

export function refreshOrderPreview(form, state) {
  if (!form?.matches?.('[data-form="order"]')) return;
  const { data, account, quotes, symbol } = contextForForm(form, state);
  const side = String(data.get('side') || 'buy');
  const price = Number(quotes[symbol]?.price ?? 0);
  const position = account.positions[symbol] ?? { quantity: 0, averageCost: 0 };
  const root = form.querySelector('[data-order-live-preview]');
  if (!root || price <= 0) return;
  let quantity;
  let gross;
  let pnl = 0;
  let remaining;
  let cashAfter;
  if (side === 'buy') {
    gross = Math.min(Number(data.get('notional') || 0), account.cash);
    quantity = gross / price;
    remaining = position.quantity + quantity;
    cashAfter = account.cash - gross;
  } else {
    quantity = Math.min(Number(data.get('quantity') || 0), position.quantity);
    gross = quantity * price;
    pnl = quantity * (price - position.averageCost);
    remaining = position.quantity - quantity;
    cashAfter = account.cash + gross;
  }
  root.innerHTML = `<span>${side === 'buy' ? 'Estimated shares' : 'Shares sold'}<b>${number(quantity, 3)}</b></span><span>${side === 'buy' ? 'Cash after' : 'Sale proceeds'}<b>${money(side === 'buy' ? cashAfter : gross)}</b></span><span>Position after<b>${number(remaining, 3)} shares</b></span><span>${side === 'buy' ? 'Order value' : 'Realised P/L'}<b class="${pnl >= 0 ? 'positive' : 'negative'}">${side === 'buy' ? money(gross) : signedMoney(pnl)}</b></span>`;
}

export function patchLiveMarketDom(root, state) {
  if (!root) return;
  const player = selectedPlayer(state);
  root.querySelectorAll('[data-live-asset]').forEach((card) => {
    const market = card.dataset.market;
    const symbol = card.dataset.symbol;
    const asset = market === 'friend'
      ? Object.values(state.markets.friend).find((item) => item.symbol === symbol)
      : state.markets.real[symbol];
    if (!asset) return;
    const change = market === 'friend' ? asset.roundChange : asset.changePercent;
    const price = card.querySelector('[data-live-price]');
    const changeNode = card.querySelector('[data-live-change]');
    const spark = card.querySelector('[data-live-sparkline]');
    if (price) price.textContent = money(asset.price);
    if (changeNode) {
      changeNode.textContent = `${change >= 0 ? '+' : ''}${number(change, 2)}%`;
      changeNode.className = change >= 0 ? 'positive' : 'negative';
    }
    if (spark) {
      const values = (asset.history ?? []).map((point) => Number(point.price));
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = Math.max(max - min, .001);
      const points = values.map((value, index) => {
        const x = index / Math.max(values.length - 1, 1) * 120;
        const y = 34 - ((value - min) / range) * 30 - 2;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ');
      spark.innerHTML = `<svg class="sparkline ${change < 0 ? 'is-negative' : ''}" viewBox="0 0 120 34" preserveAspectRatio="none"><polyline points="${points}"/></svg>`;
    }
  });

  root.querySelectorAll('[data-live-position]').forEach((card) => {
    const market = card.dataset.market;
    const symbol = card.dataset.symbol;
    const account = state.accounts[market]?.[player.id];
    const quotes = market === 'friend' ? friendQuotesBySymbol(state) : state.markets.real;
    const position = account?.positions?.[symbol];
    const price = Number(quotes[symbol]?.price ?? position?.averageCost ?? 0);
    if (!position || price <= 0) return;
    const analytics = positionAnalytics(account, quotes, symbol);
    const value = position.quantity * price;
    const pnl = position.quantity * (price - position.averageCost);
    const cost = position.quantity * position.averageCost;
    const valueNode = card.querySelector('[data-live-position-value]');
    const pnlNode = card.querySelector('[data-live-position-pnl]');
    if (valueNode) valueNode.textContent = money(value);
    if (pnlNode) {
      pnlNode.innerHTML = `${signedMoney(pnl)} <i>${pnl >= 0 ? '+' : ''}${number(cost > 0 ? pnl / cost * 100 : 0, 2)}%</i>`;
      pnlNode.className = pnl >= 0 ? 'positive' : 'negative';
    }
    const chart = card.querySelector('[data-live-position-chart]');
    if (chart && analytics) {
      chart.innerHTML = performanceChart(analytics.profitSeries, {
        mode: 'profit',
        compact: true,
        id: `${market}-${symbol}`,
        referenceLines: [{ label: 'BREAK EVEN', value: 0, className: 'is-break-even' }],
      });
    }
  });
}
