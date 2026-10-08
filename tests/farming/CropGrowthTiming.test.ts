import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { TIME_CONFIG } from '../../src/farming/FarmingConfig.js';
import { PARSNIP_CROP, POTATO_CROP, CAULIFLOWER_CROP } from '../../src/farming/CropRegistry.js';
import { TERRAIN_TYPES } from '../../src/world/ChunkGrid.js';

test('CropGrowthTiming: Parsnip matures at Day 5 dawn after exactly 4 hydration dawns', () => {
  // Start Day 1 at 06:00 AM (tick 7,200). Run 1 tick so Day 1 dawn evaluation has resolved.
  const sim = new WorldSimulation({ seed: 101, initialTick: 7200 });
  sim.step(); // Day 1 06:00 dawn completes, next dawn is Day 2 06:00 (tick 36,000)

  const tileX = 5;
  const tileY = 5;

  // Plant Parsnip in hydrated tilled soil on Day 1
  sim.chunks.setTile(tileX, tileY, {
    terrainType: TERRAIN_TYPES.TILLED_SOIL,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 0,
    cropProgress: 0,
    growthDays: 0,
    matureDays: 0,
    dryDays: 0,
    moisture: 100
  });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY; // 28,800 ticks

  // Advance to Day 2 dawn (tick 36,000) - 1st hydration dawn
  sim.stepMany(DAY_TICKS);
  let tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 1, 'Day 2 Dawn (1st dawn): Parsnip reaches Stage 1 (Sprout)');
  assert.equal(tile.growthDays, 0, 'StageDays[0] was 1, so growthDays resets to 0');

  // Keep hydrated for Day 3
  tile.moisture = 100;
  // Advance to Day 3 dawn (tick 64,800) - 2nd hydration dawn
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 2, 'Day 3 Dawn (2nd dawn): Parsnip reaches Stage 2 (Growing)');
  assert.equal(tile.growthDays, 0, 'StageDays[1] was 1, so growthDays resets to 0');

  // Keep hydrated for Day 4
  tile.moisture = 100;
  // Advance to Day 4 dawn (tick 93,600) - 3rd hydration dawn
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 2, 'Day 4 Dawn (3rd dawn): Parsnip remains Stage 2 (growthDays = 1 < 2)');
  assert.equal(tile.growthDays, 1, 'StageDays[2] is 2, so growthDays is 1');

  // Keep hydrated for Day 5
  tile.moisture = 100;
  // Advance to Day 5 dawn (tick 122,400) - 4th hydration dawn
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 3, 'Day 5 Dawn (4th dawn): Parsnip reaches Stage 3 (Mature)');
  assert.equal(tile.growthDays, 0, 'Mature crop resets growthDays to 0');
});

test('CropGrowthTiming: Potato matures at Day 12 dawn when sown on Day 6 (6 hydration dawns)', () => {
  // Sown Day 6 at 06:00 AM (tick 5 * 28,800 + 7,200 = tick 151,200)
  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY; // 28,800 ticks
  const initialTick = 5 * DAY_TICKS + 7200; // Day 6 06:00 AM
  const sim = new WorldSimulation({ seed: 102, initialTick });
  sim.step(); // Day 6 06:00 dawn completes, next dawn is Day 7 06:00

  const tileX = 6;
  const tileY = 6;

  sim.chunks.setTile(tileX, tileY, {
    terrainType: TERRAIN_TYPES.TILLED_SOIL,
    cropTypeId: POTATO_CROP.id,
    cropStage: 0,
    cropProgress: 0,
    growthDays: 0,
    matureDays: 0,
    dryDays: 0,
    moisture: 100
  });

  // Dawn 1 (Day 7 06:00): Stage 0 -> Stage 1 (stageDays[0] = 1)
  sim.stepMany(DAY_TICKS);
  let tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 1, 'Day 7 Dawn (1st dawn): Potato reaches Stage 1 (Sprout)');
  assert.equal(tile.growthDays, 0);

  // Dawn 2 (Day 8 06:00): Stage 1, growthDays 0 -> 1 (stageDays[1] = 2)
  tile.moisture = 100;
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 1, 'Day 8 Dawn (2nd dawn): Potato remains Stage 1 (growthDays = 1 < 2)');
  assert.equal(tile.growthDays, 1);

  // Dawn 3 (Day 9 06:00): Stage 1 -> Stage 2 (growthDays = 2 >= 2)
  tile.moisture = 100;
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 2, 'Day 9 Dawn (3rd dawn): Potato reaches Stage 2 (Growing)');
  assert.equal(tile.growthDays, 0);

  // Dawn 4 (Day 10 06:00): Stage 2, growthDays 0 -> 1 (stageDays[2] = 3)
  tile.moisture = 100;
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 2, 'Day 10 Dawn (4th dawn): Potato remains Stage 2 (growthDays = 1 < 3)');
  assert.equal(tile.growthDays, 1);

  // Dawn 5 (Day 11 06:00): Stage 2, growthDays 1 -> 2 (stageDays[2] = 3)
  tile.moisture = 100;
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 2, 'Day 11 Dawn (5th dawn): Potato remains Stage 2 (growthDays = 2 < 3)');
  assert.equal(tile.growthDays, 2);

  // Dawn 6 (Day 12 06:00): Stage 2 -> Stage 3 (Mature) (growthDays = 3 >= 3)
  tile.moisture = 100;
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 3, 'Day 12 Dawn (6th dawn): Potato reaches Stage 3 (Mature)');
  assert.equal(tile.growthDays, 0);
});

test('CropGrowthTiming: Cauliflower matures after exactly 12 hydration dawns', () => {
  // Sown Day 1 at 06:00 (tick 7,200)
  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY; // 28,800 ticks
  const sim = new WorldSimulation({ seed: 103, initialTick: 7200 });
  sim.step(); // Day 1 dawn completes

  const tileX = 7;
  const tileY = 7;

  // Cauliflower: stageDays = [2, 4, 6], totalDaysToMature = 12
  sim.chunks.setTile(tileX, tileY, {
    terrainType: TERRAIN_TYPES.TILLED_SOIL,
    cropTypeId: CAULIFLOWER_CROP.id,
    cropStage: 0,
    cropProgress: 0,
    growthDays: 0,
    matureDays: 0,
    dryDays: 0,
    moisture: 100
  });

  // Dawns 1-2: Stage 0 (requires 2 hydration dawns)
  for (let dawn = 1; dawn <= 2; dawn++) {
    sim.chunks.getTile(tileX, tileY)!.moisture = 100;
    sim.stepMany(DAY_TICKS);
  }
  let tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 1, 'After 2 dawns: Cauliflower reaches Stage 1 (Sprout)');

  // Dawns 3-6: Stage 1 (requires 4 hydration dawns)
  for (let dawn = 3; dawn <= 6; dawn++) {
    sim.chunks.getTile(tileX, tileY)!.moisture = 100;
    sim.stepMany(DAY_TICKS);
  }
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 2, 'After 6 total dawns: Cauliflower reaches Stage 2 (Growing)');

  // Dawns 7-11: Stage 2 (requires 6 hydration dawns)
  for (let dawn = 7; dawn <= 11; dawn++) {
    sim.chunks.getTile(tileX, tileY)!.moisture = 100;
    sim.stepMany(DAY_TICKS);
  }
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 2, 'After 11 total dawns: Cauliflower is still Stage 2 (growthDays = 5 < 6)');

  // Dawn 12: Stage 2 -> Stage 3 (Mature)
  sim.chunks.getTile(tileX, tileY)!.moisture = 100;
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 3, 'After 12 total dawns: Cauliflower reaches Stage 3 (Mature)');
});

test('CropGrowthTiming: Crops do not advance when moisture is below requirement (< 20)', () => {
  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;
  const sim = new WorldSimulation({ seed: 104, initialTick: 7200 });
  sim.step(); // Day 1 dawn completes

  const tileX = 8;
  const tileY = 8;

  sim.chunks.setTile(tileX, tileY, {
    terrainType: TERRAIN_TYPES.TILLED_SOIL,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 0,
    cropProgress: 0,
    growthDays: 0,
    matureDays: 0,
    dryDays: 0,
    moisture: 10 // Less than dailyMoistureNeed (20)
  });

  sim.stepMany(DAY_TICKS);
  const tile = sim.chunks.getTile(tileX, tileY)!;
  assert.equal(tile.cropStage, 0, 'Crop must not advance without adequate moisture');
  assert.equal(tile.growthDays, 0, 'growthDays must not increment');
  assert.equal(tile.dryDays, 1, 'dryDays increments on unwatered dawn');
});
