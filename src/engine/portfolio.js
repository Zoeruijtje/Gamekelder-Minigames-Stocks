import { clamp, round, uid } from './random.js';

const MAX_HISTORY_POINTS = 160;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeProtectiveOrder(order) {
  if (!order || typeof order !== 'object') return null;
  return {
    id: order.id || uid('risk'),
    symbol: String(order.symbol || '').toUpperCase(),
    type: order.type || order.orderType || 'stop_loss',
    stopPrice: Number(order.stopPrice ?? order.triggerPrice ?? 0) || null,
    takeProfitPrice: Number(order.takeProfitPrice ?? 0) || null,
    trailPercent: Number(order.trailPercent ?? 0) || null,
    quantityPercent: clamp(Number(order.quantityPercent ?? 100), 1, 100),
    peakPrice: Number(order.peakPrice ?? 0) || null,
    status: order.status || 'active',
    triggerReason: order.triggerReason ?? null,
    triggeredAt: order.triggeredAt ?? null,
    filledTradeId: order.filledTradeId ?? null,
    createdAt: order.createdAt ?? new Date().toISOString(),
    updatedAt: order.updatedAt ?? new Date().toISOString(),
    idempotencyKey: order.idempotencyKey ?? null,
  };
}

export function normalizeAccount(account, ownerId = account?.ownerId ?? null, startingCash = 0) {
  const source = account && typeof account === 'object' ? account : {};
  return {
    ownerId,
    cash: round(Number(source.cash ?? startingCash), 2),
    positions: source.positions && typeof source.positions === 'object' ? structuredClone(source.positions) : {},
    ledger: safeArray(source.ledger).map((entry) => ({ ...entry })),
    realizedPnl: round(Number(source.realizedPnl ?? 0), 2),
    protectiveOrders: safeArray(source.protectiveOrders).map(normalizeProtectiveOrder).filter(Boolean),
    equityHistory: safeArray(source.equityHistory).map((point) => ({ ...point })),
    portfolioId: source.portfolioId ?? null,
  };
}

export function createAccount(ownerId, startingCash) {
  const cash = round(startingCash, 2);
  return {
    ownerId,
    cash,
    positions: {},
    ledger: [],
    realizedPnl: 0,
    protectiveOrders: [],
    equityHistory: [{
      id: uid('equity'),
      equity: cash,
      cash,
      positionValue: 0,
      eventType: 'opening',
      referenceId: null,
      at: new Date().toISOString(),
    }],
    portfolioId: null,
  };
}

export function positionValue(position, quote) {
  return round((position?.quantity ?? 0) * quote, 2);
}

export function accountEquity(account, quotes) {
  const normalized = normalizeAccount(account);
  const positionsValue = Object.entries(normalized.positions).reduce((total, [symbol, position]) => {
    const quote = quotes[symbol]?.price ?? position.averageCost ?? 0;
    return total + positionValue(position, quote);
  }, 0);
  return round(normalized.cash + positionsValue, 2);
}

export function recordEquityEvent(account, quotes, eventType, referenceId = null, at = new Date().toISOString()) {
  const next = normalizeAccount(account);
  const equity = accountEquity(next, quotes);
  const positionValueTotal = round(equity - next.cash, 2);
  const previous = next.equityHistory.at(-1);
  if (previous
      && previous.eventType === eventType
      && previous.referenceId === referenceId
      && Math.abs(Number(previous.equity) - equity) < 0.005) return next;
  next.equityHistory.push({
    id: uid('equity'),
    equity,
    cash: next.cash,
    positionValue: positionValueTotal,
    eventType,
    referenceId,
    at,
  });
  next.equityHistory = next.equityHistory.slice(-MAX_HISTORY_POINTS);
  return next;
}

export function symbolLedgerStats(account, symbol) {
  const entries = normalizeAccount(account).ledger.filter((entry) => entry.symbol === symbol);
  return entries.reduce((stats, entry) => {
    if (entry.side === 'buy') {
      stats.boughtQuantity += Number(entry.quantity) || 0;
      stats.boughtGross += Number(entry.gross) || 0;
    } else if (entry.side === 'sell') {
      stats.soldQuantity += Number(entry.quantity) || 0;
      stats.soldGross += Number(entry.gross) || 0;
      stats.realizedPnl += Number(entry.realizedPnl) || 0;
    }
    return stats;
  }, { boughtQuantity: 0, boughtGross: 0, soldQuantity: 0, soldGross: 0, realizedPnl: 0 });
}

export function activeProtectionFor(account, symbol) {
  return normalizeAccount(account).protectiveOrders.find((order) => order.symbol === symbol && order.status === 'active') ?? null;
}

function currentPositionOpenedAt(account, symbol) {
  const chronological = safeArray(account?.ledger)
    .filter((entry) => entry.symbol === symbol)
    .sort((left, right) => new Date(left.createdAt ?? 0) - new Date(right.createdAt ?? 0));
  let quantity = 0;
  let openedAt = null;
  for (const entry of chronological) {
    const fillQuantity = Math.max(0, Number(entry.quantity) || 0);
    if (entry.side === 'buy') {
      if (quantity <= 0.0005) openedAt = entry.createdAt ?? openedAt;
      quantity += fillQuantity;
    } else if (entry.side === 'sell') {
      quantity = Math.max(0, quantity - fillQuantity);
      if (quantity <= 0.0005) openedAt = null;
    }
  }
  return openedAt;
}

export function positionProfitSeries(position, asset, account = null, symbol = asset?.symbol) {
  if (!position || !asset) return [];
  const openedAt = currentPositionOpenedAt(account, symbol);
  const openedTime = openedAt ? new Date(openedAt).getTime() : Number.NEGATIVE_INFINITY;
  const history = safeArray(asset.history).filter((point) => {
    const timestamp = new Date(point.at ?? point.created_at ?? 0).getTime();
    return !Number.isFinite(openedTime) || !Number.isFinite(timestamp) || timestamp >= openedTime;
  });
  const source = history.length ? history : [{ price: asset.price, at: asset.updatedAt }];
  const cost = position.quantity * position.averageCost;
  const points = source.map((point) => {
    const price = Number(point.price ?? asset.price ?? position.averageCost);
    const profit = round(position.quantity * (price - position.averageCost), 2);
    return {
      price,
      profit,
      percent: cost > 0 ? round((profit / cost) * 100, 2) : 0,
      at: point.at ?? point.created_at ?? null,
      reason: point.reason ?? point.eventType ?? null,
    };
  });
  if (openedAt && (!points.length || Math.abs(Number(points[0].profit)) > 0.005 || new Date(points[0].at ?? 0).getTime() > openedTime)) {
    points.unshift({ price: position.averageCost, profit: 0, percent: 0, at: openedAt, reason: 'Position opened' });
  }
  return points.slice(-MAX_HISTORY_POINTS);
}

export function sellNowPreview(account, quotes, symbol, { quantity = null, quantityPercent = 100 } = {}) {
  const normalized = normalizeAccount(account);
  const position = normalized.positions[symbol];
  const price = Number(quotes[symbol]?.price ?? position?.averageCost ?? 0);
  if (!position || position.quantity <= 0 || price <= 0) {
    return {
      symbol,
      quantity: 0,
      price,
      proceeds: 0,
      costBasis: 0,
      realizedPnl: 0,
      realizedPercent: 0,
      remainingQuantity: 0,
      remainingValue: 0,
      cashAfter: normalized.cash,
      afterSaleTotalPnl: normalized.realizedPnl,
    };
  }
  const requested = quantity == null
    ? position.quantity * clamp(Number(quantityPercent), 0, 100) / 100
    : Number(quantity);
  const sellQuantity = round(clamp(requested, 0, position.quantity), 3);
  const proceeds = round(sellQuantity * price, 2);
  const costBasis = round(sellQuantity * position.averageCost, 2);
  const realizedPnl = round(proceeds - costBasis, 2);
  const remainingQuantity = round(position.quantity - sellQuantity, 3);
  return {
    symbol,
    quantity: sellQuantity,
    price,
    proceeds,
    costBasis,
    realizedPnl,
    realizedPercent: costBasis > 0 ? round((realizedPnl / costBasis) * 100, 2) : 0,
    remainingQuantity,
    remainingValue: round(remainingQuantity * price, 2),
    cashAfter: round(normalized.cash + proceeds, 2),
    afterSaleTotalPnl: round(normalized.realizedPnl + realizedPnl, 2),
  };
}

export function positionAnalytics(account, quotes, symbol) {
  const normalized = normalizeAccount(account);
  const position = normalized.positions[symbol];
  if (!position) return null;
  const quote = quotes[symbol] ?? { price: position.averageCost, history: [] };
  const price = Number(quote.price ?? position.averageCost);
  const value = positionValue(position, price);
  const cost = round(position.quantity * position.averageCost, 2);
  const unrealizedPnl = round(value - cost, 2);
  const series = positionProfitSeries(position, quote, normalized, symbol);
  const prices = series.map((point) => point.price);
  const ledger = symbolLedgerStats(normalized, symbol);
  const equity = accountEquity(normalized, quotes);
  return {
    symbol,
    quantity: position.quantity,
    averageCost: position.averageCost,
    breakEven: position.averageCost,
    price,
    value,
    cost,
    unrealizedPnl,
    unrealizedPercent: cost > 0 ? round((unrealizedPnl / cost) * 100, 2) : 0,
    realizedPnl: round(ledger.realizedPnl, 2),
    totalPnl: round(ledger.realizedPnl + unrealizedPnl, 2),
    allocationPercent: equity > 0 ? round((value / equity) * 100, 1) : 0,
    high: prices.length ? Math.max(...prices) : price,
    low: prices.length ? Math.min(...prices) : price,
    drawdownPercent: prices.length && Math.max(...prices) > 0
      ? round(((price / Math.max(...prices)) - 1) * 100, 2)
      : 0,
    profitSeries: series,
    protection: activeProtectionFor(normalized, symbol),
    sellAll: sellNowPreview(normalized, quotes, symbol),
  };
}

export function portfolioSnapshot(account, quotes) {
  const normalized = normalizeAccount(account);
  const positions = Object.keys(normalized.positions)
    .map((symbol) => positionAnalytics(normalized, quotes, symbol))
    .filter(Boolean)
    .sort((left, right) => right.value - left.value);
  return {
    cash: normalized.cash,
    positions,
    positionsValue: round(positions.reduce((sum, position) => sum + position.value, 0), 2),
    equity: accountEquity(normalized, quotes),
    realizedPnl: normalized.realizedPnl,
    unrealizedPnl: round(positions.reduce((sum, position) => sum + position.unrealizedPnl, 0), 2),
    totalPnl: round(normalized.realizedPnl + positions.reduce((sum, position) => sum + position.unrealizedPnl, 0), 2),
    history: normalized.equityHistory,
    protectiveOrders: normalized.protectiveOrders,
  };
}

export function placeOrder(account, quotes, order, context = {}) {
  const normalized = normalizeAccount(account);
  const { symbol, side, notional, quantity: requestedQuantity, idempotencyKey = uid('order') } = order;
  if (!quotes[symbol] || !Number.isFinite(quotes[symbol].price) || quotes[symbol].price <= 0) {
    throw new Error(`No valid quote is available for ${symbol}.`);
  }
  if (normalized.ledger.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    return { account: normalized, fill: normalized.ledger.find((entry) => entry.idempotencyKey === idempotencyKey), duplicate: true };
  }

  const price = round(quotes[symbol].price, 4);
  const rawQuantity = requestedQuantity ?? Number(notional) / price;
  const quantity = round(rawQuantity, 3);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Order quantity must be greater than zero.');

  let next = structuredClone(normalized);
  const current = next.positions[symbol] ?? { quantity: 0, averageCost: 0 };
  const gross = round(quantity * price, 2);
  let realizedPnl = 0;

  if (side === 'buy') {
    if (gross > next.cash + 0.005) throw new Error('Insufficient fictional cash for this order.');
    const newQuantity = round(current.quantity + quantity, 3);
    const newCost = current.quantity * current.averageCost + gross;
    next.positions[symbol] = {
      quantity: newQuantity,
      averageCost: round(newCost / newQuantity, 4),
    };
    next.cash = round(next.cash - gross, 2);
  } else if (side === 'sell') {
    if (quantity > current.quantity + 0.0005) throw new Error(`You only own ${current.quantity.toFixed(3)} shares of ${symbol}.`);
    realizedPnl = round(quantity * (price - current.averageCost), 2);
    const remaining = round(current.quantity - quantity, 3);
    if (remaining <= 0.0005) {
      delete next.positions[symbol];
      next.protectiveOrders = next.protectiveOrders.map((protective) => (
        protective.symbol === symbol && protective.status === 'active'
          ? { ...protective, status: 'cancelled', triggerReason: 'Position closed', updatedAt: new Date().toISOString() }
          : protective
      ));
    } else next.positions[symbol] = { ...current, quantity: remaining };
    next.cash = round(next.cash + gross, 2);
    next.realizedPnl = round(next.realizedPnl + realizedPnl, 2);
  } else {
    throw new Error('Order side must be buy or sell.');
  }

  next.cash = clamp(next.cash, 0, Number.MAX_SAFE_INTEGER);
  const fill = {
    id: uid('fill'),
    idempotencyKey,
    symbol,
    side,
    quantity,
    price,
    gross,
    realizedPnl,
    assetType: context.assetType ?? 'friend',
    roomId: context.roomId ?? null,
    roundId: context.roundId ?? null,
    quoteStatus: context.quoteStatus ?? quotes[symbol].status ?? 'DEMO',
    quoteTimestamp: quotes[symbol].updatedAt ?? new Date().toISOString(),
    reason: context.reason ?? 'market',
    protectiveOrderId: context.protectiveOrderId ?? null,
    createdAt: new Date().toISOString(),
  };
  next.ledger.unshift(fill);
  next = recordEquityEvent(next, quotes, context.eventType ?? (context.protectiveOrderId ? 'protective' : 'trade'), fill.id, fill.createdAt);
  return { account: next, fill, duplicate: false };
}

export function upsertProtectiveOrder(account, quotes, input) {
  const next = normalizeAccount(account);
  const symbol = String(input.symbol || '').toUpperCase();
  const position = next.positions[symbol];
  const currentPrice = Number(quotes[symbol]?.price ?? 0);
  if (!position?.quantity || currentPrice <= 0) throw new Error(`Open a position in ${symbol} before adding protection.`);
  const type = input.type || 'stop_loss';
  if (!['stop_loss', 'take_profit', 'trailing_stop', 'bracket'].includes(type)) throw new Error('Choose a valid protection type.');
  const stopPrice = Number(input.stopPrice) || null;
  const takeProfitPrice = Number(input.takeProfitPrice) || null;
  const trailPercent = Number(input.trailPercent) || null;
  const quantityPercent = clamp(Number(input.quantityPercent ?? 100), 1, 100);
  if (['stop_loss', 'bracket'].includes(type) && (!stopPrice || stopPrice >= currentPrice)) {
    throw new Error('Stop-loss price must be below the current price.');
  }
  if (['take_profit', 'bracket'].includes(type) && (!takeProfitPrice || takeProfitPrice <= currentPrice)) {
    throw new Error('Take-profit price must be above the current price.');
  }
  if (type === 'trailing_stop' && (!trailPercent || trailPercent < 0.5 || trailPercent > 50)) {
    throw new Error('Trailing stop must be between 0.5% and 50%.');
  }
  const now = new Date().toISOString();
  const existingIndex = next.protectiveOrders.findIndex((order) => order.symbol === symbol && order.status === 'active');
  const protective = normalizeProtectiveOrder({
    ...(existingIndex >= 0 ? next.protectiveOrders[existingIndex] : {}),
    id: input.id || (existingIndex >= 0 ? next.protectiveOrders[existingIndex].id : uid('risk')),
    idempotencyKey: input.idempotencyKey || (existingIndex >= 0 ? next.protectiveOrders[existingIndex].idempotencyKey : uid('risk-key')),
    symbol,
    type,
    stopPrice,
    takeProfitPrice,
    trailPercent,
    quantityPercent,
    peakPrice: Math.max(currentPrice, Number(existingIndex >= 0 ? next.protectiveOrders[existingIndex].peakPrice : 0) || 0),
    status: 'active',
    triggerReason: null,
    triggeredAt: null,
    filledTradeId: null,
    createdAt: existingIndex >= 0 ? next.protectiveOrders[existingIndex].createdAt : now,
    updatedAt: now,
  });
  if (existingIndex >= 0) next.protectiveOrders[existingIndex] = protective;
  else next.protectiveOrders.unshift(protective);
  return { account: next, order: protective };
}

export function cancelProtectiveOrder(account, orderId) {
  const next = normalizeAccount(account);
  const index = next.protectiveOrders.findIndex((order) => order.id === orderId && order.status === 'active');
  if (index < 0) throw new Error('Active protection order not found.');
  next.protectiveOrders[index] = {
    ...next.protectiveOrders[index],
    status: 'cancelled',
    triggerReason: 'Cancelled by player',
    updatedAt: new Date().toISOString(),
  };
  return { account: next, order: next.protectiveOrders[index] };
}

function triggerForOrder(order, price) {
  if (order.type === 'stop_loss' && price <= order.stopPrice) return `Stop loss crossed at ${price}`;
  if (order.type === 'take_profit' && price >= order.takeProfitPrice) return `Take profit reached at ${price}`;
  if (order.type === 'bracket') {
    if (price <= order.stopPrice) return `Bracket stop crossed at ${price}`;
    if (price >= order.takeProfitPrice) return `Bracket target reached at ${price}`;
  }
  if (order.type === 'trailing_stop' && order.peakPrice > 0) {
    const triggerPrice = order.peakPrice * (1 - order.trailPercent / 100);
    if (price <= triggerPrice) return `Trailing stop crossed ${round(triggerPrice, 4)}`;
  }
  return null;
}

export function evaluateProtectiveOrders(account, quotes, context = {}) {
  let next = normalizeAccount(account);
  const fills = [];
  const triggeredOrders = [];
  for (let index = 0; index < next.protectiveOrders.length; index += 1) {
    let protective = next.protectiveOrders[index];
    if (protective.status !== 'active') continue;
    const position = next.positions[protective.symbol];
    const price = Number(quotes[protective.symbol]?.price ?? 0);
    if (!position?.quantity || price <= 0) {
      next.protectiveOrders[index] = { ...protective, status: 'cancelled', triggerReason: 'Position unavailable', updatedAt: new Date().toISOString() };
      continue;
    }
    if (protective.type === 'trailing_stop' && price > Number(protective.peakPrice ?? 0)) {
      protective = { ...protective, peakPrice: price, updatedAt: new Date().toISOString() };
      next.protectiveOrders[index] = protective;
    }
    const reason = triggerForOrder(protective, price);
    if (!reason) continue;
    const quantity = round(position.quantity * protective.quantityPercent / 100, 3);
    if (quantity <= 0) continue;
    const idempotencyKey = `protective:${protective.id}:${context.referenceId ?? quotes[protective.symbol]?.updatedAt ?? price}`;
    const result = placeOrder(next, quotes, {
      symbol: protective.symbol,
      side: 'sell',
      quantity,
      idempotencyKey,
    }, {
      assetType: context.assetType ?? 'friend',
      roomId: context.roomId ?? null,
      roundId: context.roundId ?? null,
      quoteStatus: context.quoteStatus ?? 'PROTECTIVE',
      reason,
      protectiveOrderId: protective.id,
      eventType: 'protective',
    });
    next = result.account;
    const storedIndex = next.protectiveOrders.findIndex((order) => order.id === protective.id);
    if (storedIndex >= 0) {
      next.protectiveOrders[storedIndex] = {
        ...next.protectiveOrders[storedIndex],
        status: 'filled',
        triggerReason: reason,
        triggeredAt: result.fill.createdAt,
        filledTradeId: result.fill.id,
        updatedAt: result.fill.createdAt,
      };
      triggeredOrders.push(next.protectiveOrders[storedIndex]);
    }
    fills.push(result.fill);
  }
  return { account: next, fills, triggeredOrders };
}

export function exposurePercent(account, quotes, predicate) {
  const normalized = normalizeAccount(account);
  const equity = accountEquity(normalized, quotes);
  if (equity <= 0) return 0;
  const value = Object.entries(normalized.positions).reduce((sum, [symbol, position]) => {
    if (!predicate(symbol)) return sum;
    return sum + positionValue(position, quotes[symbol]?.price ?? position.averageCost);
  }, 0);
  return round((value / equity) * 100, 1);
}
