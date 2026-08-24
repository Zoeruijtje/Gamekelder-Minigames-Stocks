import { PHASES } from '../config.js';
import { tradingSecondsRemaining } from '../engine/deadline.js';
import { currentRound } from '../engine/session.js';
import { escapeHtml, money, number, signedPercent, time } from './format.js';
import { playerAvatar, sparkline } from './template-helpers.js';
import { selectedPlayer } from './templates-overview.js';
import { renderGameModal, renderResultsModal, renderSessionCompleteModal } from './game-ui.js';

function orderModal(state) {
  const modal = state.ui.modal;
  if (!modal || modal.type !== 'order') return '';
  const market = modal.market;
  const symbol = modal.symbol;
  const asset = market === 'friend'
    ? Object.values(state.markets.friend).find((candidate) => candidate.symbol === symbol)
    : state.markets.real[symbol];
  const player = selectedPlayer(state);
  const account = state.accounts[market][player.id];
  const position = account.positions[symbol];
  const remaining = market === 'friend' ? tradingSecondsRemaining(state) : null;
  const canFriendTrade = market !== 'friend'
    || (currentRound(state)?.phase === PHASES.TRADING && remaining !== null && remaining > 0);
  const friendDeadline = market === 'friend'
    ? `<div class="order-deadline ${canFriendTrade ? '' : 'is-closed'}" data-trading-window><span><small>${canFriendTrade ? 'ORDERS AUTO-LOCK IN' : 'FRIEND MARKET'}</small><b data-trading-countdown>${canFriendTrade ? time(remaining) : 'CLOSED'}</b></span><em data-trading-deadline-copy>${canFriendTrade ? 'Your order must reach the server before 00:00.' : 'The pre-round trading deadline has passed. Orders reopen next round.'}</em></div>`
    : '';
  return `<div class="modal-layer"><button class="modal-scrim" data-action="close-modal" aria-label="Close"></button><section class="order-modal glass"><header><div><span class="eyebrow">${market === 'friend' ? 'FRIEND MARKET' : 'REAL PAPER MARKET'}</span><h2>${escapeHtml(symbol)}</h2><p>${escapeHtml(asset.name)}</p></div><button class="icon-button" data-action="close-modal">×</button></header>${friendDeadline}<div class="order-quote"><strong>${money(asset.price)}</strong><em class="${(market === 'friend' ? asset.sessionChange : asset.changePercent) >= 0 ? 'positive' : 'negative'}">${signedPercent(market === 'friend' ? asset.sessionChange : asset.changePercent)}</em></div>${sparkline(asset.history.map((point) => point.price), (market === 'friend' ? asset.sessionChange : asset.changePercent) >= 0 ? '' : 'is-negative')}<form data-form="order" class="order-form"><input type="hidden" name="market" value="${market}"/><input type="hidden" name="symbol" value="${symbol}"/><div class="action-toggle"><label><input type="radio" name="side" value="buy" checked/><span>BUY</span></label><label><input type="radio" name="side" value="sell"/><span>SELL</span></label></div><label class="field"><span>Fictional amount</span><input name="notional" type="number" min="1" step="1" value="500" inputmode="decimal" required/></label><div class="order-preview"><span>Available cash<b>${money(account.cash)}</b></span><span>Owned shares<b>${number(position?.quantity ?? 0, 3)}</b></span></div><button class="button button--warm button--large full-width" type="submit" data-trading-order-submit ${!canFriendTrade ? 'disabled' : ''}>${canFriendTrade || market !== 'friend' ? 'PLACE FICTIONAL ORDER' : 'TRADING WINDOW CLOSED'}</button>${!canFriendTrade ? '<p class="form-warning">Friend Market orders are server-locked after the deadline.</p>' : ''}</form><small class="legal-note">No real money or brokerage connection.</small></section></div>`;
}

function playerSwitchModal(state) {
  if (state.ui.modal !== 'players') return '';
  return `<div class="modal-layer"><button class="modal-scrim" data-action="close-modal"></button><section class="switch-modal glass"><header><div><span class="eyebrow">LOCAL PLAYER</span><h2>Switch controller</h2></div><button class="icon-button" data-action="close-modal">×</button></header><div class="switch-list">${state.players.map((player) => `<button data-action="select-player" data-player-id="${player.id}">${playerAvatar(player)}<span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.ticker)} · ${player.isBot ? 'BOT' : 'HUMAN'}</small></span></button>`).join('')}</div></section></div>`;
}

export function modals(state) {
  if (state.ui.modal === 'game') return renderGameModal(state);
  if (state.ui.modal === 'results') return renderResultsModal(state);
  if (state.ui.modal === 'session-complete') return renderSessionCompleteModal(state);
  return orderModal(state) || playerSwitchModal(state);
}
