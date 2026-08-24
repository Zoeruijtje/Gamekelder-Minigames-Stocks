export const APP_VERSION = 4;
export const STORAGE_KEY = `friendExchangeStateV${APP_VERSION}`;
export const CHANNEL_NAME = 'friend-exchange-local-v4';

export const PHASES = Object.freeze({
  LOBBY: 'lobby',
  BRIEFING: 'briefing',
  TRADING: 'trading',
  LOCKED: 'locked',
  GAME: 'game',
  SETTLING: 'settling',
  RESULTS: 'results',
  COMPLETE: 'complete',
});

export const CATEGORY_LABELS = Object.freeze({
  reaction: 'Reaction',
  precision: 'Precision',
  memory: 'Memory',
  estimation: 'Estimation',
  knowledge: 'Knowledge',
  strategy: 'Strategy',
  prediction: 'Prediction',
});

export const DEFAULT_SETTINGS = Object.freeze({
  roundCount: 8,
  startingFriendCash: 10000,
  startingRealCash: 25000,
  tradingSeconds: 35,
  volatility: 'standard',
  allowOwnStock: true,
  playerLimit: 8,
  enabledGames: [
    'reaction',
    'stop-clock',
    'memory-grid',
    'closest-wins',
    'higher-lower',
    'minority-rules',
    'prisoners-dilemma',
    'prediction-desk',
  ],
});

export const VOLATILITY = Object.freeze({
  calm: { label: 'Calm', factor: 0.72, cap: 0.08 },
  standard: { label: 'Standard', factor: 1, cap: 0.12 },
  chaos: { label: 'Chaos', factor: 1.38, cap: 0.18 },
});

export const PLAYER_COLORS = Object.freeze([
  '#c6a47d',
  '#879a8e',
  '#a98f88',
  '#8f96a5',
  '#b29a70',
  '#7f9797',
  '#9b879b',
  '#9a8f78',
]);

export const DEFAULT_PLAYERS = Object.freeze([
  { id: 'zoe', name: 'Zoë', ticker: 'ZOE', color: PLAYER_COLORS[0], isBot: false },
  { id: 'lars', name: 'Lars', ticker: 'LRS', color: PLAYER_COLORS[1], isBot: true },
  { id: 'mike', name: 'Mike', ticker: 'MKE', color: PLAYER_COLORS[2], isBot: true },
  { id: 'alex', name: 'Alex', ticker: 'ALX', color: PLAYER_COLORS[3], isBot: true },
]);

export const REAL_ASSETS = Object.freeze([
  { symbol: 'AAPL', name: 'Apple', price: 225.86, sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA', price: 170.44, sector: 'Semiconductors' },
  { symbol: 'MSFT', name: 'Microsoft', price: 505.87, sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla', price: 312.87, sector: 'Automotive' },
  { symbol: 'ASML', name: 'ASML', price: 812.35, sector: 'Semiconductors' },
  { symbol: 'AMZN', name: 'Amazon', price: 231.14, sector: 'Consumer' },
  { symbol: 'META', name: 'Meta', price: 691.72, sector: 'Technology' },
  { symbol: 'GOOGL', name: 'Alphabet', price: 205.61, sector: 'Technology' },
]);

export const ESTIMATION_QUESTIONS = Object.freeze([
  { prompt: 'How many kilometres of blood vessels are in an adult human body?', answer: 100000, unit: 'km' },
  { prompt: 'How many keys are on a standard modern piano?', answer: 88, unit: 'keys' },
  { prompt: 'How many minutes are there in a non-leap year?', answer: 525600, unit: 'minutes' },
  { prompt: 'Approximately how high is Mount Everest?', answer: 8849, unit: 'm' },
  { prompt: 'How many squares are on a chessboard?', answer: 64, unit: 'squares' },
  { prompt: 'How many bones are in the adult human body?', answer: 206, unit: 'bones' },
  { prompt: 'How many countries are members of the United Nations?', answer: 193, unit: 'countries' },
  { prompt: 'How many seconds are in 24 hours?', answer: 86400, unit: 'seconds' },
]);

export const HIGHER_LOWER_PAIRS = Object.freeze([
  { left: ['Eiffel Tower height', 330], right: ['Shard height', 310], unit: 'm' },
  { left: ['Earth diameter', 12742], right: ['Mars diameter', 6779], unit: 'km' },
  { left: ['Piano keys', 88], right: ['Periodic table elements', 118], unit: '' },
  { left: ['Standard marathon', 42.195], right: ['English Channel narrowest point', 33.3], unit: 'km' },
  { left: ['Human bones', 206], right: ['Countries in the UN', 193], unit: '' },
  { left: ['Burj Khalifa height', 828], right: ['One World Trade Center height', 541], unit: 'm' },
  { left: ['Minutes in a day', 1440], right: ['Pages in War and Peace (approx.)', 1225], unit: '' },
  { left: ['Moon diameter', 3475], right: ['Australia east-to-west', 4000], unit: 'km' },
]);

export const MEMORY_PATTERNS = Object.freeze([
  [0, 2, 5, 10, 15],
  [1, 4, 6, 9, 14],
  [3, 5, 8, 11, 12],
  [0, 7, 9, 13, 15],
  [2, 4, 8, 10, 14],
]);

export const ACHIEVEMENTS = Object.freeze([
  { id: 'first-trade', name: 'Opening Bell', description: 'Complete your first paper trade.' },
  { id: 'diamond-hands', name: 'Diamond Hands', description: 'Hold a position through a 10% loss and recover.' },
  { id: 'oracle', name: 'The Oracle', description: 'Win Prediction Desk three times.' },
  { id: 'to-the-moon', name: 'To The Moon', description: 'Your own friend stock gains at least 12% in one round.' },
  { id: 'contrarian', name: 'Contrarian', description: 'Profit from the lowest-ranked friend stock.' },
  { id: 'perfect-timer', name: 'Atomic Clock', description: 'Stop within 0.050 seconds of the target.' },
]);
