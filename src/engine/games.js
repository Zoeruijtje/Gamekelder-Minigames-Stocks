import {
  ESTIMATION_QUESTIONS,
  HIGHER_LOWER_PAIRS,
  MEMORY_PATTERNS,
} from '../config.js';
import { choice, clamp, seededRandom, shuffle } from './random.js';

function normalizedLowerIsBetter(value, best, worst) {
  if (!Number.isFinite(value)) return 0;
  return clamp(1 - ((value - best) / Math.max(worst - best, 0.0001)), 0, 1);
}

function botNoise(player, category, random) {
  const rating = player.ratings?.[category] ?? 1000;
  const skill = clamp((rating - 600) / 1000, 0, 1);
  return { skill, random: random() };
}

export const GAME_CATALOG = Object.freeze({
  reaction: {
    id: 'reaction',
    name: 'Reaction Test',
    category: 'reaction',
    duration: 20,
    description: 'Wait for the signal and react. False starts are heavily penalized.',
    instructions: 'Press ARM. When the panel changes to GO, tap immediately.',
    create(seed) {
      const random = seededRandom(seed);
      return { delayMs: 1200 + Math.floor(random() * 2500), targetTrials: 1 };
    },
    scoreSubmission(submission) {
      const reactionMs = Number(submission?.reactionMs);
      return {
        raw: reactionMs,
        normalizedScore: normalizedLowerIsBetter(reactionMs, 150, 650),
        tieBreaker: reactionMs,
        label: Number.isFinite(reactionMs) ? `${Math.round(reactionMs)} ms` : 'No result',
      };
    },
    simulate(player, seed) {
      const random = seededRandom(`${seed}:${player.id}`);
      const { skill } = botNoise(player, 'reaction', random);
      const reactionMs = Math.round(430 - skill * 190 + random() * 105);
      return { reactionMs };
    },
  },

  'stop-clock': {
    id: 'stop-clock',
    name: 'Stop the Clock',
    category: 'precision',
    duration: 20,
    description: 'Stop as close as possible to exactly 5.000 seconds.',
    instructions: 'Start the hidden timer, count internally, then press STOP.',
    create() { return { targetMs: 5000 }; },
    scoreSubmission(submission, config) {
      const elapsedMs = Number(submission?.elapsedMs);
      const error = Math.abs(elapsedMs - config.targetMs);
      return {
        raw: error,
        normalizedScore: normalizedLowerIsBetter(error, 0, 1800),
        tieBreaker: error,
        label: `${(elapsedMs / 1000).toFixed(3)} s · ${Math.round(error)} ms off`,
      };
    },
    simulate(player, seed, config) {
      const random = seededRandom(`${seed}:${player.id}`);
      const { skill } = botNoise(player, 'precision', random);
      const spread = 1150 - skill * 940;
      const signed = (random() - 0.5) * 2 * spread;
      return { elapsedMs: Math.round(config.targetMs + signed) };
    },
  },

  'memory-grid': {
    id: 'memory-grid',
    name: 'Memory Grid',
    category: 'memory',
    duration: 35,
    description: 'Memorize the highlighted cells, then reproduce the pattern.',
    instructions: 'Study the grid. When it goes dark, select every remembered cell.',
    create(seed) {
      const random = seededRandom(seed);
      return { pattern: choice(MEMORY_PATTERNS, random), size: 16, revealMs: 2200 };
    },
    scoreSubmission(submission, config) {
      const selected = new Set((submission?.selected ?? []).map(Number));
      const target = new Set(config.pattern);
      const hits = [...target].filter((cell) => selected.has(cell)).length;
      const falseHits = [...selected].filter((cell) => !target.has(cell)).length;
      const score = clamp((hits - falseHits * 0.55) / target.size, 0, 1);
      return {
        raw: hits - falseHits,
        normalizedScore: score,
        tieBreaker: falseHits,
        label: `${hits}/${target.size} correct${falseHits ? ` · ${falseHits} false` : ''}`,
      };
    },
    simulate(player, seed, config) {
      const random = seededRandom(`${seed}:${player.id}`);
      const { skill } = botNoise(player, 'memory', random);
      const selected = config.pattern.filter(() => random() < 0.55 + skill * 0.42);
      if (random() > 0.5 + skill * 0.35) selected.push(Math.floor(random() * config.size));
      return { selected: [...new Set(selected)] };
    },
  },

  'closest-wins': {
    id: 'closest-wins',
    name: 'Closest Wins',
    category: 'estimation',
    duration: 30,
    description: 'Estimate the answer. Percentage error decides the winner.',
    instructions: 'Enter one numeric estimate. Answers remain hidden until reveal.',
    create(seed) {
      const random = seededRandom(seed);
      return { question: choice(ESTIMATION_QUESTIONS, random) };
    },
    scoreSubmission(submission, config) {
      const answer = Number(submission?.answer);
      const truth = config.question.answer;
      const errorPercent = Number.isFinite(answer) ? Math.abs(answer - truth) / Math.max(Math.abs(truth), 1) : 1;
      return {
        raw: errorPercent,
        normalizedScore: clamp(1 - Math.log10(1 + errorPercent * 9), 0, 1),
        tieBreaker: errorPercent,
        label: Number.isFinite(answer) ? `${answer.toLocaleString()} ${config.question.unit} · ${(errorPercent * 100).toFixed(1)}% off` : 'No answer',
      };
    },
    simulate(player, seed, config) {
      const random = seededRandom(`${seed}:${player.id}`);
      const { skill } = botNoise(player, 'estimation', random);
      const maxError = 0.9 - skill * 0.68;
      const signed = (random() - 0.5) * 2 * maxError;
      return { answer: Math.max(0, Math.round(config.question.answer * (1 + signed))) };
    },
  },

  'higher-lower': {
    id: 'higher-lower',
    name: 'Higher / Lower',
    category: 'knowledge',
    duration: 35,
    description: 'Decide whether the right-hand value is higher or lower.',
    instructions: 'Complete five comparisons. Accuracy matters more than speed.',
    create(seed) {
      const random = seededRandom(seed);
      return { pairs: shuffle(HIGHER_LOWER_PAIRS, random).slice(0, 5) };
    },
    scoreSubmission(submission, config) {
      const answers = submission?.answers ?? [];
      let correct = 0;
      config.pairs.forEach((pair, index) => {
        const truth = pair.right[1] > pair.left[1] ? 'higher' : 'lower';
        if (answers[index] === truth) correct += 1;
      });
      return {
        raw: correct,
        normalizedScore: correct / config.pairs.length,
        tieBreaker: Number(submission?.elapsedMs ?? 999999),
        label: `${correct}/${config.pairs.length} correct`,
      };
    },
    simulate(player, seed, config) {
      const random = seededRandom(`${seed}:${player.id}`);
      const { skill } = botNoise(player, 'knowledge', random);
      const answers = config.pairs.map((pair) => {
        const truth = pair.right[1] > pair.left[1] ? 'higher' : 'lower';
        return random() < 0.48 + skill * 0.48 ? truth : truth === 'higher' ? 'lower' : 'higher';
      });
      return { answers, elapsedMs: Math.round(9000 + random() * 9000) };
    },
  },

  'minority-rules': {
    id: 'minority-rules',
    name: 'Minority Rules',
    category: 'strategy',
    duration: 25,
    description: 'Choose A or B. Only the smaller group wins.',
    instructions: 'Choose privately. A perfect tie gives everyone a neutral score.',
    create(seed) {
      const random = seededRandom(seed);
      const prompts = [
        ['Take the lift', 'Take the stairs'],
        ['Risk the mystery box', 'Bank the safe reward'],
        ['Morning person', 'Night person'],
        ['Choose certainty', 'Choose chaos'],
      ];
      return { choices: choice(prompts, random) };
    },
    scoreAll(submissions) {
      const counts = { A: 0, B: 0 };
      Object.values(submissions).forEach((submission) => {
        if (submission?.choice in counts) counts[submission.choice] += 1;
      });
      const tie = counts.A === counts.B;
      const winner = tie ? null : counts.A < counts.B ? 'A' : 'B';
      return Object.fromEntries(Object.entries(submissions).map(([playerId, submission]) => [playerId, {
        raw: submission?.choice === winner ? 1 : tie ? 0.5 : 0,
        normalizedScore: submission?.choice === winner ? 1 : tie ? 0.5 : 0,
        tieBreaker: 0,
        label: tie ? 'Perfect tie' : submission?.choice === winner ? 'Minority winner' : 'Majority',
      }]));
    },
    simulate(player, seed) {
      const random = seededRandom(`${seed}:${player.id}`);
      return { choice: random() < 0.5 ? 'A' : 'B' };
    },
  },

  'prisoners-dilemma': {
    id: 'prisoners-dilemma',
    name: "Prisoner's Dilemma",
    category: 'strategy',
    duration: 30,
    description: 'Cooperate or betray. Your payout depends on the room.',
    instructions: 'Choose privately. Trust can pay, but betrayal can pay more.',
    create() { return { matrix: { CC: 3, BC: 5, CB: 0, BB: 1 } }; },
    scoreAll(submissions, config, players) {
      const ordered = [...players].sort((a, b) => a.id.localeCompare(b.id));
      const output = {};
      for (let index = 0; index < ordered.length; index += 2) {
        const left = ordered[index];
        const right = ordered[index + 1] ?? ordered[0];
        const leftChoice = submissions[left.id]?.choice ?? 'cooperate';
        const rightChoice = submissions[right.id]?.choice ?? 'cooperate';
        const leftKey = `${leftChoice === 'betray' ? 'B' : 'C'}${rightChoice === 'betray' ? 'B' : 'C'}`;
        const rightKey = `${rightChoice === 'betray' ? 'B' : 'C'}${leftChoice === 'betray' ? 'B' : 'C'}`;
        const leftPoints = config.matrix[leftKey];
        const rightPoints = config.matrix[rightKey];
        output[left.id] = { raw: leftPoints, normalizedScore: leftPoints / 5, tieBreaker: 0, label: `${leftPoints} points · ${leftChoice}` };
        output[right.id] = { raw: rightPoints, normalizedScore: rightPoints / 5, tieBreaker: 0, label: `${rightPoints} points · ${rightChoice}` };
      }
      return output;
    },
    simulate(player, seed) {
      const random = seededRandom(`${seed}:${player.id}`);
      const { skill } = botNoise(player, 'strategy', random);
      return { choice: random() < 0.48 + skill * 0.08 ? 'cooperate' : 'betray' };
    },
  },

  'prediction-desk': {
    id: 'prediction-desk',
    name: 'Prediction Desk',
    category: 'prediction',
    duration: 25,
    description: 'Predict which company will outperform its expectation.',
    instructions: 'Back one player. The surprise performer wins the desk.',
    create(seed, players) {
      const random = seededRandom(seed);
      const hiddenSignals = Object.fromEntries(players.map((player) => [player.id, random()]));
      return { hiddenSignals };
    },
    scoreAll(submissions, config) {
      const winnerId = Object.entries(config.hiddenSignals).sort((a, b) => b[1] - a[1])[0][0];
      return Object.fromEntries(Object.entries(submissions).map(([playerId, submission]) => [playerId, {
        raw: submission?.predictionId === winnerId ? 1 : 0,
        normalizedScore: submission?.predictionId === winnerId ? 1 : 0.15,
        tieBreaker: 0,
        label: submission?.predictionId === winnerId ? 'Correct prediction' : 'Prediction missed',
        predictedWinnerId: winnerId,
      }]));
    },
    simulate(player, seed, config, players) {
      const random = seededRandom(`${seed}:${player.id}`);
      const { skill } = botNoise(player, 'prediction', random);
      const winnerId = Object.entries(config.hiddenSignals).sort((a, b) => b[1] - a[1])[0][0];
      if (random() < 0.2 + skill * 0.45) return { predictionId: winnerId };
      return { predictionId: choice(players, random).id };
    },
  },
});

export function getGame(gameId) {
  const game = GAME_CATALOG[gameId];
  if (!game) throw new Error(`Unknown game: ${gameId}`);
  return game;
}

export function scoreGame(gameId, config, submissions, players) {
  const game = getGame(gameId);
  const scored = game.scoreAll
    ? game.scoreAll(submissions, config, players)
    : Object.fromEntries(players.map((player) => [player.id, game.scoreSubmission(submissions[player.id], config)]));
  return players.map((player) => ({
    playerId: player.id,
    ...scored[player.id],
  }));
}

export function simulateMissingSubmissions(gameId, seed, config, players, submissions) {
  const game = getGame(gameId);
  const next = structuredClone(submissions);
  for (const player of players) {
    if (next[player.id]) continue;
    next[player.id] = game.simulate(player, seed, config, players);
  }
  return next;
}
