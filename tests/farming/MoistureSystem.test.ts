import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { TIME_CONFIG, FARMING_CONFIG } from '../../src/farming/FarmingConfig.js';

test('MoistureSystem: Hourly evaporation continuously reduces moisture on dry days', () => {
  const sim = new WorldSimulation({ seed: 301 });
  sim.chunks.setTile(5, 5, { terrainType: 2, moisture: 100 });

  const HOUR_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_HOUR; // 1,200 ticks

  // Step 1 in-game hour
  sim.stepMany(HOUR_TICKS);
  let tile = sim.chunks.getTile(5, 5)!;
  assert.equal(tile.moisture, 98, 'After 1 hour: 100 - 2 = 98');

  // Step 5 more in-game hours (total 6 hours)
  sim.stepMany(HOUR_TICKS * 5);
  tile = sim.chunks.getTile(5, 5)!;
  assert.equal(tile.moisture, 88, 'After 6 hours: 100 - (6 * 2) = 88');
});

test('MoistureSystem: Rain infiltrates exposed terrain continuously and clamps at 100', () => {
  const sim = new WorldSimulation({ seed: 302 });
  sim.chunks.setTile(5, 5, { terrainType: 2, moisture: 10 });

  // Activate rain via environment interface
  sim.environment.setRaining(true, 1.0); // Heavy rain: +25/hour

  const HOUR_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;

  // Step 1 hour of rain
  sim.stepMany(HOUR_TICKS);
  let tile = sim.chunks.getTile(5, 5)!;
  assert.equal(tile.moisture, 35, 'After 1h rain: 10 + 25 = 35');

  // Step 3 more hours of rain (total 4 hours: 35 + 75 = 110 -> clamped to 100)
  sim.stepMany(HOUR_TICKS * 3);
  tile = sim.chunks.getTile(5, 5)!;
  assert.equal(tile.moisture, 100, 'Moisture must clamp at 100');
});

test('MoistureSystem: Moisture carries over continuously across midnight and dawn without artificial wipe', () => {
  const sim = new WorldSimulation({ seed: 303 });
  // Start with 100 moisture on furrow without crop
  sim.chunks.setTile(5, 5, { terrainType: 2, moisture: 100, cropTypeId: 0 });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY; // 24 hours = 28,800 ticks

  // Step 1 full day (24 hours * 2 evaporation/hr = 48 points lost)
  sim.stepMany(DAY_TICKS);

  const tile = sim.chunks.getTile(5, 5)!;
  // 100 - 48 = 52. Must NOT be reset to 0!
  assert.equal(tile.moisture, 52, 'Moisture must carry over continuously without arbitrary dawn wipe');
});

test('MoistureSystem: Moisture clamps at 0 and cannot go negative', () => {
  const sim = new WorldSimulation({ seed: 304 });
  sim.chunks.setTile(5, 5, { terrainType: 2, moisture: 3 });

  const HOUR_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;

  // Step 2 hours (3 - 4 = -1 -> clamped to 0)
  sim.stepMany(HOUR_TICKS * 2);
  const tile = sim.chunks.getTile(5, 5)!;
  assert.equal(tile.moisture, 0, 'Moisture cannot be negative');
});
