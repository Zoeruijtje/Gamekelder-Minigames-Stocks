import { clamp, round, uid } from './random.js';

export function createAccount(ownerId, startingCash) {
  return {
    ownerId,
    cash: round(startingCash, 2),
    positions: {},
    ledger: [],
    realizedPnl: 0,
  };
}

export function positionValue(position, quote) {
  return round((position?.quantity ?? 0) * quote, 2);
}

export function accountEquity(account, quotes) {
  const positionsValue = Object.entries(account.positions).reduce((total, [symbol, position]) => {
    const quote = quotes[symbol]?.price ?? position.averageCost ?? 0;
    return total + positionValue(position, quote);
  }, 0);
  return round(account.cash + positionsValue, 2);
}

export function portfolioSnapshot(account, quotes) {
  const positions = Object.entries(account.positions)
    .map(([symbol, position]) => {
      const price = quotes[symbol]?.price ?? position.averageCost;
      const value = positionValue(position, price);
      const cost = round(position.quantity * position.averageCost, 2);
      return {
        symbol,
        ...position,
        price,
        value,
        cost,
        unrealizedPnl: round(value - cost, 2),
        unrealizedPercent: cost > 0 ? round(((value - cost) / cost) * 100, 2) : 0,
      };
    })
    .sort((left, right) => right.value - left.value);
  return {
    cash: account.cash,
    positions,
    positionsValue: round(positions.reduce((sum, position) => sum + position.value, 0), 2),
    equity: accountEquity(account, quotes),
    realizedPnl: account.realizedPnl,
  };
}

export function placeOrder(account, quotes, order, context = {}) {
  const { symbol, side, notional, quantity: requestedQuantity, idempotencyKey = uid('order') } = order;
  if (!quotes[symbol] || !Number.isFinite(quotes[symbol].price) || quotes[symbol].price <= 0) {
    throw new Error(`No valid quote is available for ${symbol}.`);
  }
  if (account.ledger.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    return { account, fill: account.ledger.find((entry) => entry.idempotencyKey === idempotencyKey), duplicate: true };
  }

  const price = round(quotes[symbol].price, 4);
  const rawQuantity = requestedQuantity ?? Number(notional) / price;
  const quantity = round(rawQuantity, 3);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Order quantity must be greater than zero.');

  const next = structuredClone(account);
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
    if (remaining <= 0.0005) delete next.positions[symbol];
    else next.positions[symbol] = { ...current, quantity: remaining };
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
    quoteStatus: quotes[symbol].status ?? 'DEMO',
    quoteTimestamp: quotes[symbol].updatedAt ?? new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  next.ledger.unshift(fill);
  return { account: next, fill, duplicate: false };
}

export function exposurePercent(account, quotes, predicate) {
  const equity = accountEquity(account, quotes);
  if (equity <= 0) return 0;
  const value = Object.entries(account.positions).reduce((sum, [symbol, position]) => {
    if (!predicate(symbol)) return sum;
    return sum + positionValue(position, quotes[symbol]?.price ?? position.averageCost);
  }, 0);
  return round((value / equity) * 100, 1);
}
