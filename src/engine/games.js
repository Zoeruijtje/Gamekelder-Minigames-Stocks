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

let runtimeDefinitions = {};
let runtimeContent = {};

function runtimeDefinition(gameId, settings = null) {
  return settings?.gameDefinitions?.[gameId]
    ?? runtimeDefinitions?.[gameId]
    ?? {};
}

function runtimeConfig(gameId, settings = null) {
  const config = runtimeDefinition(gameId, settings)?.config;
  return config && typeof config === 'object' && !Array.isArray(config) ? config : {};
}

function contentRows(gameId, contentType, settings = null) {
  const source = settings?.gameContent?.[gameId]
    ?? runtimeContent?.[gameId]
    ?? [];
  return source
    .filter((item) => item?.active !== false && item?.content_type === contentType)
    .sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0))
    .map((item) => item.payload)
    .filter(Boolean);
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function boundedInteger(value, fallback, min, max) {
  return Math.round(clamp(finiteNumber(value, fallback), min, max));
}

function validQuestion(value) {
  return value
    && typeof value.prompt === 'string'
    && Number.isFinite(Number(value.answer));
}

function validComparison(value) {
  return value
    && Array.isArray(value.left)
    && Array.isArray(value.right)
    && value.left.length >= 2
    && value.right.length >= 2
    && Number.isFinite(Number(value.left[1]))
    && Number.isFinite(Number(value.right[1]));
}

function validPrompt(value) {
  return value && Array.isArray(value.choices) && value.choices.length === 2;
}

function validPattern(value) {
  return value && Array.isArray(value.cells) && value.cells.every((cell) => Number.isInteger(Number(cell)));
}

export const GAME_CATALOG = Object.freeze({
  reaction: {
    id: 'reaction',
    name: 'Reaction Test',
    category: 'reaction',
    duration: 20,
    description: 'Wait for the signal and react. False starts are heavily penalized.',
    instructions: 'Press ARM. When the panel changes to GO, tap immediately.',
    create(seed, players, settings) {
      const random = seededRandom(seed);
      const config = runtimeConfig('reaction', settings);
      const minimum = boundedInteger(config.delayMinMs, 1200, 500, 5000);
      const maximum = boundedInteger(config.delayMaxMs, 3700, minimum + 100, 8000);
      return {
        delayMs: minimum + Math.floor(random() * (maximum - minimum)),
        targetTrials: boundedInteger(config.targetTrials, 1, 1, 5),
      };
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
    create(seed, players, settings) {
      const config = runtimeConfig('stop-clock', settings);
      return { targetMs: boundedInteger(config.targetMs, 5000, 1000, 30000) };
    },
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
    create(seed, players, settings) {
      const random = seededRandom(seed);
      const config = runtimeConfig('memory-grid', settings);
      const configuredPatterns = contentRows('memory-grid', 'pattern', settings)
        .filter(validPattern)
        .map((item) => item.cells.map(Number));
      const patterns = configuredPatterns.length ? configuredPatterns : MEMORY_PATTERNS;
      const size = boundedInteger(config.size, 16, 9, 36);
      const pattern = choice(patterns, random).filter((cell) => cell >= 0 && cell < size);
      return {
        pattern: pattern.length ? pattern : MEMORY_PATTERNS[0],
        size,
        revealMs: boundedInteger(config.revealMs, 2200, 500, 10000),
      };
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
    create(seed, players, settings) {
      const random = seededRandom(seed);
      const configured = contentRows('closest-wins', 'question', settings).filter(validQuestion);
      return { question: choice(configured.length ? configured : ESTIMATION_QUESTIONS, random) };
    },
    scoreSubmission(submission, config) {
      const answer = Number(submission?.answer);
      const truth = Number(config.question.answer);
      const errorPercent = Number.isFinite(answer) ? Math.abs(answer - truth) / Math.max(Math.abs(truth), 1) : 1;
      return {
        raw: errorPercent,
        normalizedScore: clamp(1 - Math.log10(1 + errorPercent * 9), 0, 1),
        tieBreaker: errorPercent,
        label: Number.isFinite(answer) ? `${answer.toLocaleString()} ${config.question.unit ?? ''} · ${(errorPercent * 100).toFixed(1)}% off` : 'No answer',
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
    create(seed, players, settings) {
      const random = seededRandom(seed);
      const config = runtimeConfig('higher-lower', settings);
      const configured = contentRows('higher-lower', 'comparison', settings).filter(validComparison);
      const source = configured.length ? configured : HIGHER_LOWER_PAIRS.map((pair) => ({
        left: pair.left,
        right: pair.right,
        unit: pair.unit,
      }));
      return {
        pairs: shuffle(source, random).slice(0, boundedInteger(config.pairCount, 5, 1, 10)),
      };
    },
    scoreSubmission(submission, config) {
      const answers = submission?.answers ?? [];
      let correct = 0;
      config.pairs.forEach((pair, index) => {
        const truth = Number(pair.right[1]) > Number(pair.left[1]) ? 'higher' : 'lower';
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
        const truth = Number(pair.right[1]) > Number(pair.left[1]) ? 'higher' : 'lower';
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
    create(seed, players, settings) {
      const random = seededRandom(seed);
      const configured = contentRows('minority-rules', 'prompt', settings).filter(validPrompt);
      const prompts = configured.length ? configured : [
        { choices: ['Take the lift', 'Take the stairs'] },
        { choices: ['Risk the mystery box', 'Bank the safe reward'] },
        { choices: ['Morning person', 'Night person'] },
        { choices: ['Choose certainty', 'Choose chaos'] },
      ];
      return { choices: choice(prompts, random).choices };
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
    create(seed, players, settings) {
      const config = runtimeConfig('prisoners-dilemma', settings);
      const matrix = config.matrix && typeof config.matrix === 'object'
        ? config.matrix
        : { CC: 3, BC: 5, CB: 0, BB: 1 };
      return { matrix };
    },
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
        const leftPoints = Number(config.matrix[leftKey]);
        const rightPoints = Number(config.matrix[rightKey]);
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

const BASE_GAME_METADATA = Object.fromEntries(Object.entries(GAME_CATALOG).map(([id, game]) => [id, {
  name: game.name,
  description: game.description,
  instructions: game.instructions,
  duration: game.duration,
}]));

export function applyGameDefinitions(definitions = {}) {
  runtimeDefinitions = definitions && typeof definitions === 'object' ? structuredClone(definitions) : {};
  for (const [id, game] of Object.entries(GAME_CATALOG)) {
    const base = BASE_GAME_METADATA[id];
    const definition = runtimeDefinitions[id] ?? {};
    game.name = String(definition.name ?? base.name).slice(0, 80);
    game.description = String(definition.description ?? base.description).slice(0, 500);
    game.instructions = String(definition.instructions ?? base.instructions).slice(0, 800);
    game.duration = boundedInteger(definition.duration_seconds, base.duration, 5, 180);
  }
}

export function applyGameContent(content = {}) {
  runtimeContent = content && typeof content === 'object' ? structuredClone(content) : {};
}

export function enabledGameIds(definitions = runtimeDefinitions) {
  const enabled = Object.keys(GAME_CATALOG).filter((id) => definitions?.[id]?.enabled !== false);
  return enabled.length ? enabled : Object.keys(GAME_CATALOG);
}

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
