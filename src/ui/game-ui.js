import { getGame } from '../engine/games.js';
import { currentRound } from '../engine/session.js';
import { escapeHtml, money, signedMoney, signedPercent } from './format.js';

function activeHuman(state, round) {
  if (state.mode === 'online') {
    return state.players.find((player) => player.id === state.online?.userId) ?? state.players[0];
  }
  const humans = state.players.filter((player) => !player.isBot);
  return humans.find((player) => !round.submissions[player.id]) ?? humans[0] ?? state.players[0];
}

function playerBadge(player) {
  return `<span class="player-chip"><i style="--player:${player.color}">${escapeHtml(player.name.slice(0, 1))}</i><span>${escapeHtml(player.name)}</span><b>${escapeHtml(player.ticker)}</b></span>`;
}

function intro(state, round, game, player) {
  if (state.mode === 'online' && round.submissions[player.id]) {
    return `<div class="game-waiting"><span class="market-orbit"><i></i><i></i><i></i></span><span class="eyebrow">SUBMISSION LOCKED</span><h2>Your result is private</h2><p>Waiting for the rest of the room. The host can settle the market after every active player has submitted.</p>${playerBadge(player)}<button class="button" data-action="close-modal">RETURN TO MARKET</button></div>`;
  }
  return `
    <div class="game-intro">
      <span class="eyebrow">ROUND ${round.index + 1} · ${escapeHtml(game.category)}</span>
      <h2>${escapeHtml(game.name)}</h2>
      <p>${escapeHtml(game.instructions)}</p>
      ${playerBadge(player)}
      <button class="button button--warm button--large" data-action="game-start">START FOR ${escapeHtml(player.name.toUpperCase())}</button>
      ${state.mode === 'online' ? '<small class="online-privacy-note">Your answer is written privately and is not visible to other players before settlement.</small>' : ''}
    </div>`;
}

function reaction(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  const waiting = runtime.stage === 'waiting';
  const go = runtime.stage === 'go';
  return `<div class="game-core">${playerBadge(player)}<button class="reaction-pad ${go ? 'reaction-pad--go' : waiting ? 'reaction-pad--waiting' : ''}" data-action="reaction-tap"><span>${go ? 'GO' : waiting ? 'WAIT…' : 'ARM'}</span><small>${go ? 'Tap now' : waiting ? 'Do not tap yet' : 'Tap to arm the test'}</small></button></div>`;
}

function stopClock(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  const running = runtime.stage === 'running';
  return `<div class="game-core">${playerBadge(player)}<div class="clock-readout" data-live-clock>${running ? '••:•••' : '05:000'}</div><p class="game-hint">Target: exactly 5.000 seconds. The clock hides while running.</p><button class="button ${running ? 'button--danger' : 'button--warm'} button--large" data-action="stop-clock-${running ? 'stop' : 'start'}">${running ? 'STOP' : 'START'}</button></div>`;
}

function memoryGrid(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  const reveal = runtime.stage === 'reveal';
  const selected = new Set(runtime.selections ?? []);
  const pattern = new Set(round.config.pattern);
  const cells = Array.from({ length: round.config.size }, (_, index) => {
    const lit = reveal ? pattern.has(index) : selected.has(index);
    return `<button class="memory-cell ${lit ? 'is-lit' : ''}" data-action="memory-cell" data-index="${index}" ${reveal ? 'disabled' : ''} aria-label="Cell ${index + 1}"></button>`;
  }).join('');
  return `<div class="game-core">${playerBadge(player)}<p class="game-hint">${reveal ? 'Memorize the highlighted cells.' : 'Select every cell you remember.'}</p><div class="memory-grid">${cells}</div>${reveal ? '' : '<button class="button button--warm" data-action="memory-submit">SUBMIT PATTERN</button>'}</div>`;
}

function closestWins(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  const question = round.config.question;
  return `<form class="game-core estimate-form" data-form="estimate">${playerBadge(player)}<span class="eyebrow">CLOSEST WINS</span><h3>${escapeHtml(question.prompt)}</h3><label class="field field--game"><span>Your estimate${question.unit ? ` (${escapeHtml(question.unit)})` : ''}</span><input name="answer" type="number" inputmode="decimal" min="0" step="any" required autofocus /></label><button class="button button--warm button--large" type="submit">LOCK ANSWER</button></form>`;
}

function higherLower(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  const index = runtime.pairIndex ?? 0;
  const pair = round.config.pairs[index];
  return `<div class="game-core comparison-game">${playerBadge(player)}<span class="eyebrow">QUESTION ${index + 1} / ${round.config.pairs.length}</span><div class="comparison-card"><div><small>KNOWN VALUE</small><h3>${escapeHtml(pair.left[0])}</h3><strong>${pair.left[1].toLocaleString()} ${escapeHtml(pair.unit)}</strong></div><div><small>COMPARE</small><h3>${escapeHtml(pair.right[0])}</h3><strong>?</strong></div></div><p>Is the right-hand value higher or lower?</p><div class="choice-row"><button class="button" data-action="higher-lower-choice" data-choice="higher">HIGHER</button><button class="button" data-action="higher-lower-choice" data-choice="lower">LOWER</button></div></div>`;
}

function minority(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  return `<div class="game-core social-choice">${playerBadge(player)}<span class="eyebrow">ONLY THE MINORITY WINS</span><h3>Choose privately</h3><div class="choice-row choice-row--large"><button class="choice-card" data-action="social-choice" data-choice="A"><b>A</b><span>${escapeHtml(round.config.choices[0])}</span></button><button class="choice-card" data-action="social-choice" data-choice="B"><b>B</b><span>${escapeHtml(round.config.choices[1])}</span></button></div></div>`;
}

function prisoners(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  return `<div class="game-core social-choice">${playerBadge(player)}<span class="eyebrow">TRUST OR BETRAYAL</span><h3>Choose without seeing the room</h3><div class="payoff-grid"><span>Both cooperate: <b>3</b></span><span>You betray / they cooperate: <b>5</b></span><span>You cooperate / they betray: <b>0</b></span><span>Both betray: <b>1</b></span></div><div class="choice-row choice-row--large"><button class="choice-card" data-action="social-choice" data-choice="cooperate"><b>C</b><span>COOPERATE</span></button><button class="choice-card choice-card--danger" data-action="social-choice" data-choice="betray"><b>B</b><span>BETRAY</span></button></div></div>`;
}

function prediction(state, round, player, runtime) {
  if (runtime.stage === 'intro') return intro(state, round, getGame(round.gameId), player);
  return `<div class="game-core prediction-game">${playerBadge(player)}<span class="eyebrow">PREDICTION DESK</span><h3>Who will outperform expectations?</h3><div class="prediction-list">${state.players.map((target) => `<button class="prediction-card" data-action="prediction-choice" data-player-id="${target.id}"><i style="--player:${target.color}">${escapeHtml(target.name.slice(0, 1))}</i><span><strong>${escapeHtml(target.ticker)}</strong><small>${escapeHtml(target.name)}</small></span></button>`).join('')}</div></div>`;
}

export function renderGameModal(state) {
  const round = currentRound(state);
  if (!round) return '';
  const game = getGame(round.gameId);
  const player = activeHuman(state, round);
  const runtime = state.ui.gameRuntime ?? { stage: 'intro' };
  let body;
  switch (round.gameId) {
    case 'reaction': body = reaction(state, round, player, runtime); break;
    case 'stop-clock': body = stopClock(state, round, player, runtime); break;
    case 'memory-grid': body = memoryGrid(state, round, player, runtime); break;
    case 'closest-wins': body = closestWins(state, round, player, runtime); break;
    case 'higher-lower': body = higherLower(state, round, player, runtime); break;
    case 'minority-rules': body = minority(state, round, player, runtime); break;
    case 'prisoners-dilemma': body = prisoners(state, round, player, runtime); break;
    case 'prediction-desk': body = prediction(state, round, player, runtime); break;
    default: body = intro(state, round, game, player);
  }
  return `<div class="modal-layer"><button class="modal-scrim" data-action="close-modal" aria-label="Close"></button><section class="game-modal glass"><header><div><span class="eyebrow">FRIEND EXCHANGE · ${state.mode === 'online' ? 'PRIVATE ONLINE ROUND' : 'LIVE ROUND'}</span><h2>${escapeHtml(game.name)}</h2></div><button class="icon-button" data-action="close-modal" aria-label="Close">×</button></header><div class="game-modal__body">${body}</div></section></div>`;
}

function portfolioImpact(state, round) {
  const playerId = state.ui.selectedPlayerId;
  const account = state.accounts.friend[playerId];
  if (!account) return { total: 0, rows: [] };
  const rows = round.marketMoves.map((move) => {
    const asset = state.markets.friend[move.playerId];
    const quantity = account.positions[asset?.symbol]?.quantity ?? 0;
    const delta = quantity * ((move.newPrice ?? asset?.price ?? 0) - (move.oldPrice ?? asset?.previousPrice ?? asset?.price ?? 0));
    return { symbol: asset?.symbol ?? '', quantity, delta };
  }).filter((row) => row.quantity > 0);
  return { total: rows.reduce((sum, row) => sum + row.delta, 0), rows };
}

function expectationLabel(result) {
  const expected = Number(result.expectedPercentile ?? .5);
  const actual = Number(result.actualPercentile ?? .5);
  const difference = actual - expected;
  if (difference > .12) return `Beat expectation by ${(difference * 100).toFixed(0)} pts`;
  if (difference < -.12) return `Missed expectation by ${(Math.abs(difference) * 100).toFixed(0)} pts`;
  return 'Performed near expectation';
}

export function renderResultsModal(state) {
  const round = currentRound(state);
  if (!round) return '';
  const game = getGame(round.gameId);
  const impact = portfolioImpact(state, round);
  const orderedMoves = [...round.marketMoves].sort((left, right) => Math.abs(right.return) - Math.abs(left.return));
  const topMove = orderedMoves[0];
  const topPlayer = state.players.find((candidate) => candidate.id === topMove?.playerId);
  return `<div class="modal-layer results-layer"><div class="modal-scrim"></div><section class="results-modal results-modal--market glass">
    <header class="settlement-header"><div><span class="eyebrow">ROUND ${round.index + 1} · AUTHORITATIVE SETTLEMENT</span><h2>THE FRIEND MARKET MOVED.</h2><p>${escapeHtml(game.name)} repriced every listed friend according to actual performance versus their expected performance.</p></div><div class="settlement-impact"><small>YOUR ROUND P/L</small><strong class="${impact.total >= 0 ? 'positive' : 'negative'}">${signedMoney(impact.total)}</strong><span>${impact.rows.length ? `${impact.rows.length} held ${impact.rows.length === 1 ? 'company' : 'companies'} affected` : 'No held shares affected'}</span></div></header>
    ${topMove ? `<div class="top-move"><span class="movement-pulse"></span><div><small>LARGEST PRICE MOVE</small><strong>${escapeHtml(topPlayer?.ticker ?? '')} ${signedPercent(topMove.return * 100)}</strong></div><b>${money(topMove.oldPrice)}<i>→</i>${money(topMove.newPrice)}</b></div>` : ''}
    <div class="market-settlement-grid">${round.results.map((result) => {
      const player = state.players.find((candidate) => candidate.id === result.playerId);
      const move = round.marketMoves.find((candidate) => candidate.playerId === result.playerId) ?? { return: 0, oldPrice: state.markets.friend[result.playerId]?.price, newPrice: state.markets.friend[result.playerId]?.price };
      const width = Math.min(100, Math.max(3, Math.abs(move.return) / Math.max(move.cap ?? .18, .01) * 100));
      const direction = move.return > .001 ? 'UP' : move.return < -.001 ? 'DOWN' : 'FLAT';
      return `<article class="market-result-row ${move.return >= 0 ? 'is-up' : 'is-down'}"><div class="market-result-rank">${result.rank}</div><i class="market-result-avatar" style="--player:${player.color}">${escapeHtml(player.name.slice(0, 1))}</i><div class="market-result-player"><strong>${escapeHtml(player.name)} <b>${escapeHtml(player.ticker)}</b></strong><small>${escapeHtml(result.label)}</small><em>${escapeHtml(expectationLabel(result))}</em></div><div class="market-result-prices"><span><small>BEFORE</small><b>${money(move.oldPrice)}</b></span><i>→</i><span><small>AFTER</small><b>${money(move.newPrice)}</b></span></div><div class="market-result-move"><strong class="${move.return >= 0 ? 'positive' : 'negative'}">${signedPercent(move.return * 100)}</strong><small>${direction} ${signedMoney((move.newPrice ?? 0) - (move.oldPrice ?? 0))}</small><span class="move-meter"><i style="width:${width}%"></i></span></div></article>`;
    }).join('')}</div>
    <div class="settlement-explainer"><span>WHY PRICES MOVED</span><p>Rank is not enough. A favourite is expected to perform well, while an underdog earns a stronger rally by beating a lower baseline. All round returns are capped by the selected volatility mode.</p></div>
    <button class="button button--warm button--large" data-action="advance-results">${state.session.roundIndex + 1 >= state.session.roundCount ? 'VIEW SESSION AWARDS' : 'CONTINUE TO NEXT ROUND'}</button>
  </section></div>`;
}

export function renderSessionCompleteModal(state) {
  return `<div class="modal-layer"><div class="modal-scrim"></div><section class="results-modal results-modal--complete glass"><span class="eyebrow">MARKET CLOSED</span><h2>Session Awards</h2><div class="award-grid">${state.session.awards.map((award) => {
    const player = state.players.find((candidate) => candidate.id === award.playerId);
    if (!player) return '';
    const value = award.id === 'best-company' ? signedPercent(award.value) : award.id === 'game-champion' ? `${award.value} pts` : new Intl.NumberFormat('en-NL', { style: 'currency', currency: 'EUR' }).format(award.value);
    return `<article><i style="--player:${player.color}">${escapeHtml(player.name.slice(0, 1))}</i><small>${escapeHtml(award.label)}</small><strong>${escapeHtml(player.name)}</strong><em>${escapeHtml(value)}</em></article>`;
  }).join('')}</div><div class="button-row"><button class="button" data-action="close-modal">EXPLORE RESULTS</button>${state.mode === 'online' ? '<button class="button button--warm" data-action="route" data-route="landing">LEAVE ROOM</button>' : '<button class="button button--warm" data-action="new-session">NEW SESSION</button>'}</div></section></div>`;
}
