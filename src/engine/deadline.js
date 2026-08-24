import { PHASES } from '../config.js';

function currentRound(state) {
  return state.session?.rounds?.find((round) => round.id === state.session?.currentRoundId) ?? null;
}

export function authoritativeNowMs(state, clientNowMs = Date.now()) {
  const onlineOffset = state.mode === 'online' ? Number(state.online?.serverOffsetMs ?? 0) : 0;
  return clientNowMs + (Number.isFinite(onlineOffset) ? onlineOffset : 0);
}

export function phaseSecondsRemaining(state, clientNowMs = Date.now()) {
  if (!state.session?.phaseEndsAt) return null;
  const deadline = new Date(state.session.phaseEndsAt).getTime();
  if (!Number.isFinite(deadline)) return null;
  return Math.max(0, Math.ceil((deadline - authoritativeNowMs(state, clientNowMs)) / 1000));
}

export function tradingSecondsRemaining(state, clientNowMs = Date.now()) {
  const round = currentRound(state);
  if (!round || round.phase !== PHASES.TRADING) return null;
  return phaseSecondsRemaining(state, clientNowMs);
}

export function isTradingWindowOpen(state, clientNowMs = Date.now()) {
  const remaining = tradingSecondsRemaining(state, clientNowMs);
  return remaining !== null && remaining > 0;
}

export function tradingWindowProgress(state, clientNowMs = Date.now()) {
  const remaining = tradingSecondsRemaining(state, clientNowMs);
  if (remaining === null) return null;
  const duration = Math.max(1, Number(state.settings?.tradingSeconds ?? 35));
  return Math.max(0, Math.min(1, remaining / duration));
}
