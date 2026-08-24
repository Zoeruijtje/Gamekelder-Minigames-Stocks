import { PHASES } from '../config.js';
import { tradingSecondsRemaining, tradingWindowProgress } from '../engine/deadline.js';

let expiringRoundId = null;
let retryAfter = 0;

function currentRound(state) {
  return state.session?.rounds?.find((round) => round.id === state.session?.currentRoundId) ?? null;
}

function formatTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function updateTradingDom(state, remaining) {
  const formatted = formatTime(remaining);
  document.querySelectorAll('[data-trading-countdown]').forEach((node) => {
    node.textContent = formatted;
  });

  const progress = tradingWindowProgress(state) ?? 0;
  document.querySelectorAll('[data-trading-progress]').forEach((node) => {
    node.style.width = `${(progress * 100).toFixed(2)}%`;
  });

  const expired = remaining <= 0;
  document.querySelectorAll('[data-trading-window]').forEach((node) => {
    node.classList.toggle('is-expired', expired);
  });
  document.querySelectorAll('[data-trading-order-submit]').forEach((button) => {
    if (expired) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    }
  });
  document.querySelectorAll('[data-trading-deadline-copy]').forEach((node) => {
    if (expired) node.textContent = 'Deadline reached · Friend Market orders are closed.';
  });
}

async function expireOnlineWindow(state, round) {
  const adapter = window.__FE_ONLINE__;
  if (!adapter?.enabled || typeof adapter.expireTradingWindow !== 'function') return;
  if (!round?.id || expiringRoundId === round.id || Date.now() < retryAfter) return;

  expiringRoundId = round.id;
  try {
    await adapter.expireTradingWindow(round.id);
    // The authoritative round update is broadcast through Realtime and the
    // normal online refresh path will re-render every connected client.
  } catch (error) {
    // A server/client clock difference of a fraction of a second can cause the
    // first attempt to arrive slightly early. Retry quietly; genuine errors are
    // still enforced server-side and surface if a player tries to submit an order.
    console.debug('Trading deadline transition retry scheduled.', error);
    retryAfter = Date.now() + 900;
    expiringRoundId = null;
  }
}

async function tick() {
  const store = window.__FE_STORE__;
  if (!store?.getState) return;
  const state = store.getState();
  const round = currentRound(state);
  if (!round || state.session?.phase !== PHASES.TRADING || round.phase !== PHASES.TRADING) {
    expiringRoundId = null;
    return;
  }

  const remaining = tradingSecondsRemaining(state);
  if (remaining === null) return;
  updateTradingDom(state, remaining);

  if (remaining === 0 && state.mode === 'online') {
    await expireOnlineWindow(state, round);
  }
}

setInterval(() => {
  void tick();
}, 250);

void tick();
