import { CATEGORY_LABELS, PHASES } from '../config.js';
import { tradingSecondsRemaining, tradingWindowProgress } from '../engine/deadline.js';
import { getGame } from '../engine/games.js';
import { portfolioSnapshot } from '../engine/portfolio.js';
import { currentRound, friendQuotesBySymbol, phaseCountdown } from '../engine/session.js';
import { escapeHtml, money, signedMoney, signedPercent, time } from './format.js';
import { lineChart, playerAvatar, sparkline } from './template-helpers.js';

export function marketStateCard(state) {
  const round = currentRound(state);
  if (!round) return '';
  const game = getGame(round.gameId);
  const countdown = phaseCountdown(state);
  const tradingRemaining = tradingSecondsRemaining(state);
  const phaseLabels = {
    briefing: 'ROUND BRIEFING',
    trading: 'FRIEND MARKET OPEN',
    locked: 'TRADING CLOSED',
    game: 'GAME ACTIVE',
    settling: 'SETTLING',
    results: 'RESULTS',
    complete: 'MARKET CLOSED',
  };

  if (state.session.phase === PHASES.TRADING && tradingRemaining !== null) {
    const progress = (tradingWindowProgress(state) ?? 0) * 100;
    return `<div class="market-state market-state--trading glass glass--compact ${tradingRemaining === 0 ? 'is-expired' : ''}" data-trading-window><span class="live-dot"></span><div class="market-state__body"><small>PRE-ROUND TRADING · AUTO-LOCKS IN</small><b data-trading-countdown>${time(tradingRemaining)}</b><em data-trading-deadline-copy>${tradingRemaining === 0 ? 'Deadline reached · Friend Market orders are closed.' : 'Buy or sell Friend Market shares now. Orders close automatically at 00:00.'}</em><span class="trading-progress"><i data-trading-progress style="width:${progress.toFixed(2)}%"></i></span></div></div>`;
  }

  return `<div class="market-state glass glass--compact"><span class="live-dot"></span><div><small>${phaseLabels[state.session.phase] ?? state.session.phase}</small><b>${countdown !== null ? time(countdown) : escapeHtml(game.name)}</b></div></div>`;
}

export function selectedPlayer(state) {
  return state.players.find((player) => player.id === state.ui.selectedPlayerId) ?? state.players[0];
}

function combinedPortfolioSeries(state, player) {
  const real = portfolioSnapshot(state.accounts.real[player.id], state.markets.real);
  const friend = portfolioSnapshot(state.accounts.friend[player.id], friendQuotesBySymbol(state));
  const events = [
    ...(real.history ?? []).map((point) => ({ ...point, market: 'real' })),
    ...(friend.history ?? []).map((point) => ({ ...point, market: 'friend' })),
  ].sort((left, right) => new Date(left.at ?? 0) - new Date(right.at ?? 0));
  let realEquity = Number(real.history?.[0]?.equity ?? real.equity);
  let friendEquity = Number(friend.history?.[0]?.equity ?? friend.equity);
  const series = events.map((point) => {
    if (point.market === 'real') realEquity = Number(point.equity ?? realEquity);
    else friendEquity = Number(point.equity ?? friendEquity);
    return realEquity + friendEquity;
  });
  const current = real.equity + friend.equity;
  if (!series.length) return [current, current];
  if (Math.abs(series.at(-1) - current) > .005) series.push(current);
  return series.slice(-40);
}

function onlineSubmissionStatus(state, round) {
  const active = state.players.filter((player) => player.role !== 'spectator' && player.connected !== false);
  const submitted = active.filter((player) => round.submissions[player.id]);
  return {
    active,
    submitted,
    allSubmitted: active.length > 0 && submitted.length === active.length,
    currentSubmitted: Boolean(round.submissions[state.online?.userId]),
  };
}

function roundActions(state, round) {
  if (state.mode === 'online') {
    const status = onlineSubmissionStatus(state, round);
    switch (round.phase) {
      case PHASES.TRADING:
        return state.online.isHost
          ? '<button class="button button--danger full-width" data-action="lock-trading">END TRADING EARLY<span>Otherwise it auto-locks at 00:00</span></button>'
          : '<div class="round-wait"><i class="live-dot"></i><span><b>Trade before the bell</b><small>Tap a Friend Market stock and build your position. The server rejects every order after 00:00.</small></span></div>';
      case PHASES.LOCKED:
        return state.online.isHost
          ? '<button class="button button--warm full-width" data-action="begin-game">START MINIGAME ON EVERY DEVICE</button>'
          : '<div class="round-wait"><i></i><span><b>Trading closed</b><small>No more Friend Market orders can be placed. Waiting for the host to start the minigame.</small></span></div>';
      case PHASES.GAME:
        if (!status.currentSubmitted) return '<button class="button button--warm full-width" data-action="resume-game">PLAY YOUR PRIVATE ROUND</button>';
        if (state.online.isHost && status.allSubmitted) return '<button class="button button--warm full-width settlement-button" data-action="online-settle-round">SETTLE RESULTS & MOVE THE MARKET</button>';
        if (state.online.isHost && phaseCountdown(state) === 0) return '<button class="button button--danger full-width" data-action="online-force-settle">DEADLINE PASSED · SETTLE MISSING PLAYERS AT ZERO</button>';
        return `<div class="round-wait"><i class="live-dot"></i><span><b>${status.submitted.length}/${status.active.length} submissions locked</b><small>Your answer is private. Waiting for the rest of the room.</small></span></div>`;
      case PHASES.SETTLING:
        return '<button class="button full-width" disabled>AUTHORITATIVE MARKET SETTLEMENT…</button>';
      case PHASES.RESULTS:
        return '<button class="button button--warm full-width" data-action="show-results">VIEW THE MARKET MOVE</button>';
      default:
        return '<button class="button full-width" disabled>SYNCING ROOM STATE</button>';
    }
  }

  switch (round.phase) {
    case PHASES.BRIEFING:
      return `<button class="button button--warm full-width" data-action="open-trading">START PRE-ROUND TRADING · ${state.settings.tradingSeconds}s</button>`;
    case PHASES.TRADING:
      return '<button class="button button--danger full-width" data-action="lock-trading">END TRADING EARLY<span>Otherwise it auto-locks at 00:00</span></button>';
    case PHASES.LOCKED:
      return '<button class="button button--warm full-width" data-action="begin-game">START MINIGAME</button>';
    case PHASES.GAME:
      return '<button class="button button--warm full-width" data-action="resume-game">RESUME MINIGAME</button>';
    case PHASES.RESULTS:
      return '<button class="button button--warm full-width" data-action="show-results">VIEW MARKET SETTLEMENT</button>';
    default:
      return '<button class="button full-width" disabled>PROCESSING</button>';
  }
}

function portfolioRoundImpact(state, round, player) {
  const account = state.accounts.friend[player.id];
  if (!account || !round?.marketMoves?.length) return 0;
  return round.marketMoves.reduce((total, move) => {
    const asset = state.markets.friend[move.playerId];
    const quantity = account.positions[asset?.symbol]?.quantity ?? 0;
    return total + quantity * ((move.newPrice ?? asset?.price ?? 0) - (move.oldPrice ?? asset?.previousPrice ?? asset?.price ?? 0));
  }, 0);
}

function marketMovementCard(state, round, player) {
  if (!round?.marketMoves?.length || ![PHASES.RESULTS, PHASES.COMPLETE].includes(round.phase)) return '';
  const moves = [...round.marketMoves].sort((left, right) => right.return - left.return);
  const winner = moves[0];
  const loser = moves.at(-1);
  const winnerPlayer = state.players.find((candidate) => candidate.id === winner.playerId);
  const loserPlayer = state.players.find((candidate) => candidate.id === loser.playerId);
  const impact = portfolioRoundImpact(state, round, player);
  return `<article class="movement-card glass">
    <div class="card-topline"><span class="eyebrow">LAST AUTHORITATIVE REPRICE</span><button class="text-button" data-action="show-results">FULL SETTLEMENT →</button></div>
    <div class="movement-card__headline"><span class="movement-pulse"></span><div><small>YOUR PORTFOLIO IMPACT THIS ROUND</small><strong class="${impact >= 0 ? 'positive' : 'negative'}">${signedMoney(impact)}</strong></div></div>
    <div class="movement-card__moves">
      <div class="movement-card__move movement-card__move--up"><small>BIGGEST GAIN</small><b>${escapeHtml(winnerPlayer?.ticker ?? '')}</b><span>${money(winner.oldPrice)} → ${money(winner.newPrice)}</span><em>${signedPercent(winner.return * 100)}</em></div>
      <div class="movement-card__move movement-card__move--down"><small>BIGGEST DROP</small><b>${escapeHtml(loserPlayer?.ticker ?? '')}</b><span>${money(loser.oldPrice)} → ${money(loser.newPrice)}</span><em>${signedPercent(loser.return * 100)}</em></div>
    </div>
    <p>Prices move on performance versus expectation. A highly rated favourite must outperform more than an underdog to earn the same rally.</p>
  </article>`;
}

export function overview(state) {
  const player = selectedPlayer(state);
  const realSnapshot = portfolioSnapshot(state.accounts.real[player.id], state.markets.real);
  const friendSnapshot = portfolioSnapshot(state.accounts.friend[player.id], friendQuotesBySymbol(state));
  const total = realSnapshot.equity + friendSnapshot.equity;
  const starting = state.settings.startingRealCash + state.settings.startingFriendCash;
  const pnl = total - starting;
  const round = currentRound(state);
  const game = round ? getGame(round.gameId) : null;
  const friendAssets = Object.values(state.markets.friend);
  return `<section class="view-section">
    <div class="view-heading"><div><span class="eyebrow">PORTFOLIO / ${state.mode === 'online' ? `ONLINE ROOM ${escapeHtml(state.online.roomCode ?? '')}` : 'LIVE SESSION'}</span><h1>MARKET NIGHT</h1><p>Trade the room, play the minigame, then watch the Friend Market reprice in a visible settlement.</p></div>${marketStateCard(state)}</div>
    <div class="dashboard-grid">
      <article class="portfolio-hero glass"><div class="card-topline"><span class="eyebrow">COMBINED FICTIONAL EQUITY</span><span class="feed-label">${state.mode === 'online' ? 'ONLINE FRIEND + DEMO REAL' : 'DEMO + SESSION'}</span></div><div class="hero-value-row"><div><strong>${money(total)}</strong><em class="${pnl >= 0 ? 'positive' : 'negative'}">${signedMoney(pnl)} · ${signedPercent((pnl / starting) * 100)}</em></div><div class="mini-stats"><span>Real market<b>${money(realSnapshot.equity)}</b></span><span>Friend market<b>${money(friendSnapshot.equity)}</b></span><span>Cash<b>${money(realSnapshot.cash + friendSnapshot.cash)}</b></span></div></div>${lineChart(combinedPortfolioSeries(state, player))}<div class="chart-axis"><span>OPEN</span><span>TRADES</span><span>SETTLEMENTS</span><span>NOW</span></div></article>
      ${round ? `<article class="round-card glass"><div class="card-topline"><span class="eyebrow">ROUND ${round.index + 1} / ${state.session.roundCount}</span><span class="live-pill">${state.session.phase}</span></div><span class="round-category">${escapeHtml(CATEGORY_LABELS[game.category])}</span><h2>${escapeHtml(game.name)}</h2><p>${escapeHtml(game.description)}</p>${round.phase === PHASES.TRADING ? '<div class="round-trading-rule"><b>1. TRADE NOW</b><span>2. Orders auto-lock at 00:00</span><span>3. Play the minigame</span><span>4. Results reprice every friend stock</span></div>' : ''}<div class="round-actions">${roundActions(state, round)}</div></article>` : ''}
      ${marketMovementCard(state, round, player)}
      <article class="holdings-card glass"><div class="card-topline"><span class="eyebrow">FRIEND MARKET</span><button class="text-button" data-action="view" data-view="market">OPEN MARKET →</button></div><div class="asset-table">${friendAssets.map((asset) => { const owner = state.players.find((candidate) => candidate.id === asset.ownerId); return `<button class="asset-row" data-action="trade-asset" data-market="friend" data-symbol="${asset.symbol}">${playerAvatar(owner)}<span><strong>${asset.symbol}</strong><small>${escapeHtml(asset.name)}</small></span><b>${money(asset.price)}</b><em class="${asset.roundChange >= 0 ? 'positive' : 'negative'}">${signedPercent(asset.roundChange)}</em>${sparkline(asset.history.map((point) => point.price), asset.roundChange >= 0 ? '' : 'is-negative')}</button>`; }).join('')}</div></article>
      <article class="impact-card glass"><span class="eyebrow">SESSION INTELLIGENCE</span><div class="impact-list">${[...friendAssets].sort((left, right) => right.sessionChange - left.sessionChange).map((asset) => `<div><b>${asset.symbol}</b><span>${asset.sentiment}</span><em class="${asset.sessionChange >= 0 ? 'positive' : 'negative'}">${signedPercent(asset.sessionChange)}</em></div>`).join('')}</div></article>
      <article class="news-teaser glass"><span class="eyebrow">THE KELDER WIRE</span><h3>${escapeHtml(state.session.news[0]?.headline ?? 'MARKET AWAITS OPENING BELL')}</h3><p>${escapeHtml(state.session.news[0]?.summary ?? '')}</p><button class="text-button" data-action="view" data-view="news">READ MARKET NEWS →</button></article>
    </div>
  </section>`;
}
