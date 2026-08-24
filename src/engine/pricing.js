import { VOLATILITY } from '../config.js';
import { clamp, round } from './random.js';

export function defaultRatings() {
  return {
    reaction: 1000,
    precision: 1000,
    memory: 1000,
    estimation: 1000,
    knowledge: 1000,
    strategy: 1000,
    prediction: 1000,
  };
}

function logisticExpected(rating, average, spread = 180) {
  return 1 / (1 + 10 ** ((average - rating) / spread));
}

export function expectationFor(players, category) {
  const ratings = players.map((player) => player.ratings?.[category] ?? 1000);
  const average = ratings.reduce((sum, value) => sum + value, 0) / Math.max(ratings.length, 1);
  return Object.fromEntries(players.map((player) => [
    player.id,
    logisticExpected(player.ratings?.[category] ?? 1000, average),
  ]));
}

export function rankResults(results) {
  const sorted = [...results].sort((left, right) => {
    if (right.normalizedScore !== left.normalizedScore) return right.normalizedScore - left.normalizedScore;
    return (left.tieBreaker ?? 0) - (right.tieBreaker ?? 0);
  });
  let previousScore = null;
  let previousRank = 0;
  return sorted.map((result, index) => {
    const rank = previousScore === result.normalizedScore ? previousRank : index + 1;
    previousScore = result.normalizedScore;
    previousRank = rank;
    return { ...result, rank };
  });
}

export function actualPercentile(rank, playerCount) {
  if (playerCount <= 1) return 1;
  return 1 - (rank - 1) / (playerCount - 1);
}

export function settleFriendMarket({ players, results, market, category, volatility = 'standard' }) {
  const ranked = rankResults(results);
  const expectation = expectationFor(players, category);
  const mode = VOLATILITY[volatility] ?? VOLATILITY.standard;

  const rawMoves = ranked.map((result) => {
    const actual = actualPercentile(result.rank, players.length);
    const expected = expectation[result.playerId] ?? 0.5;
    const surprise = actual - expected;
    const placementBonus = (actual - 0.5) * 0.025;
    const performanceSignal = (result.normalizedScore - 0.5) * 0.025;
    return {
      playerId: result.playerId,
      expected,
      actual,
      surprise,
      raw: (surprise * 0.22 + placementBonus + performanceSignal) * mode.factor,
    };
  });

  const averageRaw = rawMoves.reduce((sum, move) => sum + move.raw, 0) / Math.max(rawMoves.length, 1);
  const moves = rawMoves.map((move) => ({
    ...move,
    return: round(clamp(move.raw - averageRaw, -mode.cap, mode.cap), 4),
  }));

  const nextMarket = structuredClone(market);
  for (const move of moves) {
    const asset = nextMarket[move.playerId];
    if (!asset) continue;
    const oldPrice = asset.price;
    const newPrice = round(Math.max(5, oldPrice * (1 + move.return)), 2);
    asset.price = newPrice;
    asset.roundChange = round(move.return * 100, 2);
    asset.sessionChange = round(((newPrice / asset.openPrice) - 1) * 100, 2);
    asset.sentiment = move.return > 0.04 ? 'bullish' : move.return < -0.04 ? 'bearish' : 'neutral';
    asset.history.push({
      price: newPrice,
      at: new Date().toISOString(),
      reason: `${category} round`,
      return: move.return,
    });
  }

  return { ranked, expectation, moves, market: nextMarket };
}

export function updateRatings(players, ranked, category, expectation) {
  const nextPlayers = structuredClone(players);
  const resultByPlayer = Object.fromEntries(ranked.map((result) => [result.playerId, result]));
  for (const player of nextPlayers) {
    const result = resultByPlayer[player.id];
    if (!result) continue;
    const actual = actualPercentile(result.rank, nextPlayers.length);
    const expected = expectation[player.id] ?? 0.5;
    const delta = Math.round(42 * (actual - expected));
    player.ratings[category] = clamp((player.ratings[category] ?? 1000) + delta, 600, 1600);
  }
  return nextPlayers;
}

export function explainMove(player, result, move, categoryLabel) {
  const expectedRank = Math.max(1, Math.round((1 - move.expected) * 3 + 1));
  if (move.return > 0.035) {
    return `${player.ticker} rallies after ${player.name} beats ${categoryLabel.toLowerCase()} expectations and finishes #${result.rank}.`;
  }
  if (move.return < -0.035) {
    return `${player.ticker} slides after ${player.name} misses ${categoryLabel.toLowerCase()} expectations with a #${result.rank} finish.`;
  }
  return `${player.ticker} trades nearly flat as ${player.name} performs close to the expected #${expectedRank} range.`;
}
