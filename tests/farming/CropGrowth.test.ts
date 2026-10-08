import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { TIME_CONFIG, FARMING_CONFIG } from '../../src/farming/FarmingConfig.js';

test('CropGrowth: Parsnip advances 0 (Seed) -> 1 (Sprout) -> 2 (Growing) -> 3 (Mature) across 4 watered days', () => {
  const sim = new WorldSimulation({ seed: 201 });
  const playerId = sim.spawnPlayer(10, 10);

  // Set up tilled furrow with planted Parsnip and full moisture
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    moisture: 100,
    cropTypeId: 1, // Parsnip
    cropStage: 0,   // Seed
    growthDays: 0,
    matureDays: 0,
    dryDays: 0
  });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY; // 28,800 ticks

  // Day 1 Dawn (Step 1 full in-game day)
  sim.stepMany(DAY_TICKS);
  let tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 1, 'Day 1: Seed (0) should advance to Sprout (1)');
  assert.equal(tile.growthDays, 0, 'growthDays should reset on stage transition');

  // Re-water for Day 2
  sim.chunks.setTile(11, 10, { moisture: 100 });
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 2, 'Day 2: Sprout (1) should advance to Growing (2)');

  // Re-water for Day 3 (Growing stage takes 2 days)
  sim.chunks.setTile(11, 10, { moisture: 100 });
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 2, 'Day 3: Growing (2) should remain Growing for 2nd day');
  assert.equal(tile.growthDays, 1, 'growthDays should be 1');

  // Re-water for Day 4
  sim.chunks.setTile(11, 10, { moisture: 100 });
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 3, 'Day 4: Growing (2) should advance to Mature (3)');
  assert.equal(tile.matureDays, 0, 'matureDays should start at 0');
});

test('CropGrowth: Mature crop holds in Stage 3 for 5 days, incrementing matureDays, then wilts to Stage 4', () => {
  const sim = new WorldSimulation({ seed: 202 });
  sim.spawnPlayer(10, 10);

  // Tile with mature Parsnip
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    moisture: 0, // Mature crops don't require watering to hold ripe state
    cropTypeId: 1,
    cropStage: 3, // Mature
    matureDays: 0
  });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;

  // Day 1 mature hold
  sim.stepMany(DAY_TICKS);
  let tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 3, 'Day 1: Should remain Mature');
  assert.equal(tile.matureDays, 1);

  // Day 2 mature hold
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 3, 'Day 2: Should remain Mature');
  assert.equal(tile.matureDays, 2);

  // Day 3 mature hold
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 3, 'Day 3: Should remain Mature');
  assert.equal(tile.matureDays, 3);

  // Day 4 mature hold
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 3, 'Day 4: Should remain Mature');
  assert.equal(tile.matureDays, 4);

  // Day 5: Reaches MAX_UNHARVESTED_DAYS (5) -> Transitions to Wilted (4)
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 4, 'Day 5: Unharvested ripe crop must transition to Wilted (4)');
  assert.equal(tile.matureDays, 0, 'matureDays should reset on wilting');
});

test('CropGrowth: Unwatered crops halt growth and wilt after 3 consecutive drought days', () => {
  const sim = new WorldSimulation({ seed: 203 });
  sim.spawnPlayer(10, 10);

  // Planted Parsnip with zero moisture
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    moisture: 0,
    cropTypeId: 1,
    cropStage: 1, // Sprout
    growthDays: 0,
    dryDays: 0
  });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;

  // Day 1 dry
  sim.stepMany(DAY_TICKS);
  let tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 1, 'Day 1 dry: Growth halted, stage remains Sprout');
  assert.equal(tile.growthDays, 0);
  assert.equal(tile.dryDays, 1);

  // Day 2 dry
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 1, 'Day 2 dry: Stage remains Sprout');
  assert.equal(tile.dryDays, 2);

  // Day 3 dry: Hits MAX_DROUGHT_DAYS (3) -> Wilts
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropStage, 4, 'Day 3 dry: Crop must wilt due to drought');
});
