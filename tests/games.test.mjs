import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialState } from '../src/engine/session.js';
import { GAME_CATALOG, scoreGame, simulateMissingSubmissions } from '../src/engine/games.js';

const state = createInitialState();

for (const game of Object.values(GAME_CATALOG)) {
  test(`${game.name} creates, simulates and scores a complete room`, () => {
    const seed = `test:${game.id}`;
    const config = game.create(seed, state.players, state.settings);
    const submissions = simulateMissingSubmissions(game.id, seed, config, state.players, {});
    assert.equal(Object.keys(submissions).length, state.players.length);
    const results = scoreGame(game.id, config, submissions, state.players);
    assert.equal(results.length, state.players.length);
    results.forEach((result) => {
      assert.equal(result.playerId.length > 0, true);
      assert.equal(Number.isFinite(result.normalizedScore), true);
      assert.ok(result.normalizedScore >= 0 && result.normalizedScore <= 1, `${game.id} score ${result.normalizedScore}`);
      assert.equal(typeof result.label, 'string');
    });
  });
}
