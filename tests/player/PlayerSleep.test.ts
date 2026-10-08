import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { EnergyComponent } from '../../src/ecs/components/EnergyComponent.js';
import { BedComponent } from '../../src/ecs/components/BedComponent.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { PLAYER_CONFIG, calculateNextDawnTick } from '../../src/player/PlayerConfig.js';
import { TIME_CONFIG, FARMING_CONFIG } from '../../src/farming/FarmingConfig.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { CropRegistry, PARSNIP_CROP } from '../../src/farming/CropRegistry.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';

test('SleepValidation: Valid sleep near bed entity restores energy to 100 and advances to 06:00', () => {
  const sim = new WorldSimulation({ seed: 301 });
  const player = sim.spawnPlayer(12, 11); // Center (12.5, 11.5)
  const bed = sim.spawnBed(12, 12);       // Center (12.5, 12.5) -> distance = 1.0 tile (<= 1.5)

  const energy = sim.ecs.getComponent<EnergyComponent>(player, 'Energy')!;
  energy.current = 43;

  // Enqueue SLEEP targeting the bed
  sim.enqueueCommand('SLEEP', player, { targetEntityId: bed });
  sim.step();

  // Assert clock advanced to next dawn (Day 1 06:00 = tick 7,200)
  assert.equal(sim.clock.currentTick, TIME_CONFIG.DAWN_HOUR * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR);
  assert.equal(sim.clock.currentTick, 7200);

  // Assert energy restored to 100
  assert.equal(energy.current, 100);
  assert.equal(energy.max, 100);

  // Assert event emitted
  const events = sim.events.getHistory().filter(e => e.type === 'PLAYER_SLEPT');
  assert.equal(events.length, 1);
  assert.equal(events[0]!.actorEntityId, player);
  assert.equal(events[0]!.targetEntityId, bed);
  assert.equal(events[0]!.payload?.restoredEnergy, 100);
  assert.equal(events[0]!.payload?.targetTick, 7200);

  assert.doesNotThrow(() => sim.assertInvariants());
});

test('SleepValidation: Sleep rejected if player is out of reach (> 1.5 tiles) from bed', () => {
  const sim = new WorldSimulation({ seed: 302 });
  const player = sim.spawnPlayer(10, 10); // Center (10.5, 10.5)
  const bed = sim.spawnBed(13, 13);       // Center (13.5, 13.5) -> distance = 4.24 tiles (> 1.5)

  const energy = sim.ecs.getComponent<EnergyComponent>(player, 'Energy')!;
  energy.current = 43;

  sim.enqueueCommand('SLEEP', player, { targetEntityId: bed });
  sim.step();

  // Assert time did not advance beyond the single normal step (tick 1)
  assert.equal(sim.clock.currentTick, 1);
  // Assert energy was not restored
  assert.equal(energy.current, 43);
  // Assert no PLAYER_SLEPT event was emitted
  const sleepEvents = sim.events.getHistory().filter(e => e.type === 'PLAYER_SLEPT');
  assert.equal(sleepEvents.length, 0);

  assert.doesNotThrow(() => sim.assertInvariants());
});

test('SleepValidation: Sleep rejected if bed entity does not exist or lacks BedComponent', () => {
  const sim = new WorldSimulation({ seed: 303 });
  const player = sim.spawnPlayer(10, 10);
  const energy = sim.ecs.getComponent<EnergyComponent>(player, 'Energy')!;
  energy.current = 25;

  // Case A: Non-existent entity ID
  sim.enqueueCommand('SLEEP', player, { targetEntityId: 99999 });
  sim.step();
  assert.equal(sim.clock.currentTick, 1);
  assert.equal(energy.current, 25);

  // Case B: Entity exists nearby but is not a bed (e.g. dummy entity)
  const dummy = sim.ecs.createEntity();
  sim.ecs.addComponent<PositionComponent>(dummy, 'Position', { x: 10.5, y: 10.5 });
  sim.enqueueCommand('SLEEP', player, { targetEntityId: dummy });
  sim.step();
  assert.equal(sim.clock.currentTick, 2);
  assert.equal(energy.current, 25);

  const sleepEvents = sim.events.getHistory().filter(e => e.type === 'PLAYER_SLEPT');
  assert.equal(sleepEvents.length, 0);
});

test('SleepValidation: Sleep rejected when simulation is paused', () => {
  const sim = new WorldSimulation({ seed: 304 });
  const player = sim.spawnPlayer(12, 12);
  const bed = sim.spawnBed(12, 12);
  const energy = sim.ecs.getComponent<EnergyComponent>(player, 'Energy')!;
  energy.current = 50;

  sim.pause();
  sim.enqueueCommand('SLEEP', player, { targetEntityId: bed });
  sim.step(); // will not run commands because paused

  assert.equal(sim.clock.currentTick, 0);
  assert.equal(energy.current, 50);

  // Force step with force = true
  sim.step(true);
  // Handler checks sim.isPaused -> rejects
  assert.equal(sim.clock.currentTick, 1);
  assert.equal(energy.current, 50);
});

test('SleepTiming: Next-dawn calculation edge cases and 1-hour minimum buffer rule', () => {
  const hour = TIME_CONFIG.TICKS_PER_IN_GAME_HOUR; // 1,200
  const day = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;   // 28,800
  const dawn = TIME_CONFIG.DAWN_HOUR * hour;       // 7,200

  // 1. Day 1 Evening: 22:00 (tick 26,400) -> Day 2 06:00 (tick 36,000)
  assert.equal(calculateNextDawnTick(22 * hour), day + dawn);
  assert.equal(calculateNextDawnTick(26400), 36000);

  // 2. Day 2 Post-Midnight: 02:00 (tick 31,200) -> Day 2 06:00 (tick 36,000)
  assert.equal(calculateNextDawnTick(day + 2 * hour), day + dawn);
  assert.equal(calculateNextDawnTick(31200), 36000);

  // 3. Day 1 Immediate Wake-Up: 06:00 (tick 7,200) -> Day 2 06:00 (tick 36,000)
  assert.equal(calculateNextDawnTick(dawn), day + dawn);
  assert.equal(calculateNextDawnTick(7200), 36000);

  // 4. Day 1 Pre-Dawn Buffer Violation: 05:55 (tick 7,100, 5 mins remain) -> Day 2 06:00 (tick 36,000)
  assert.equal(calculateNextDawnTick(dawn - 100), day + dawn);
  assert.equal(calculateNextDawnTick(7100), 36000);

  // 5. Day 1 Exactly 1 Hour Remaining: 05:00 (tick 6,000, exactly 1,200 ticks remain)
  // Per mathematical rule: (7,200 - 6,000) < 1,200 is false, so sleeping to immediate 06:00 is ALLOWED!
  assert.equal(calculateNextDawnTick(5 * hour), dawn);
  assert.equal(calculateNextDawnTick(6000), 7200);

  // 6. Day 1 Just Under 1 Hour Remaining: 05:01 (tick 6,020, 1,180 ticks remain) -> rolls over to Day 2 06:00
  assert.equal(calculateNextDawnTick(6020), day + dawn);
  assert.equal(calculateNextDawnTick(6020), 36000);
});

test('FastForwardEquivalence: 10-hour sleep matches continuous 20Hz simulation bit-for-bit (Test A)', () => {
  const seed = 555;
  const startTick = 20 * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR; // Day 1 20:00 (tick 24,000)
  const targetTick = TIME_CONFIG.TICKS_PER_IN_GAME_DAY + TIME_CONFIG.DAWN_HOUR * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR; // Day 2 06:00 (tick 36,000)
  const elapsedTicks = targetTick - startTick; // 12,000 ticks (10 in-game hours)

  // Setup factory for initial test state at 20:00
  const createInitialSim = () => {
    const sim = new WorldSimulation({ seed });
    // Advance naturally from tick 0 to 20:00 (24,000 ticks)
    sim.stepMany(startTick);

    const player = sim.spawnPlayer(12, 11);
    const bed = sim.spawnBed(12, 12);

    // Setup diverse agricultural test bed:
    // Tile (11, 10): Tilled soil with watered sprout (cropStage 1)
    sim.chunks.setTile(11, 10, {
      terrainType: 2,
      flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
      moisture: 60,
      fertility: 80,
      cropTypeId: PARSNIP_CROP.id,
      cropStage: 1, // Sprout
      growthDays: 1,
      dryDays: 0,
      matureDays: 0
    });

    // Tile (11, 11): Tilled soil unplanted with low moisture (10)
    sim.chunks.setTile(11, 11, {
      terrainType: 2,
      flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
      moisture: 10,
      fertility: 50,
      cropTypeId: 0,
      cropStage: 0,
      growthDays: 0,
      dryDays: 0,
      matureDays: 0
    });

    // Tile (11, 12): Mature crop (cropStage 3) holding
    sim.chunks.setTile(11, 12, {
      terrainType: 2,
      flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
      moisture: 30,
      fertility: 60,
      cropTypeId: PARSNIP_CROP.id,
      cropStage: 3,
      growthDays: 4,
      dryDays: 0,
      matureDays: 1
    });

    return { sim, player, bed };
  };

  // Run A: Continuous 20Hz stepping (12,000 ticks)
  const { sim: simA } = createInitialSim();
  const startTimeA = performance.now();
  simA.stepMany(elapsedTicks);
  const durationA = performance.now() - startTimeA;

  // Run B: Authoritative Fast-Forward
  const { sim: simB } = createInitialSim();
  const startTimeB = performance.now();
  simB.advanceSimulationTo(targetTick);
  const durationB = performance.now() - startTimeB;

  // Assert clocks match
  assert.equal(simA.clock.currentTick, targetTick);
  assert.equal(simB.clock.currentTick, targetTick);

  // Assert complete authoritative snapshots match bit-for-bit
  const snapshotA = simA.getSnapshot();
  const snapshotB = simB.getSnapshot();

  assert.deepEqual(snapshotA.clock, snapshotB.clock, 'Clock snapshots must match');
  assert.deepEqual(snapshotA.farming, snapshotB.farming, 'Farming consumer cursors must match');
  assert.deepEqual(snapshotA.chunks, snapshotB.chunks, 'All chunk tiles, moistures, and crops must match bit-for-bit');
  assert.deepEqual(snapshotA.ecs, snapshotB.ecs, 'All ECS components must match');
  assert.deepEqual(snapshotA.events, snapshotB.events, 'Event histories must match');
  assert.deepEqual(snapshotA, snapshotB, 'Full 10-hour simulation snapshots must be bit-for-bit identical');

  console.log(`[FastForward Performance] 10-Hour Sleep (12,000 ticks): Continuous = ${durationA.toFixed(2)}ms vs FastForward = ${durationB.toFixed(2)}ms (Speedup: ${(durationA / durationB).toFixed(1)}x)`);
});

test('FastForwardEquivalence: Full 24-hour progression matches continuous 20Hz simulation bit-for-bit', () => {
  const seed = 556;
  const startTick = TIME_CONFIG.DAWN_HOUR * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR; // Day 1 06:00 (7,200)
  const targetTick = startTick + TIME_CONFIG.TICKS_PER_IN_GAME_DAY;              // Day 2 06:00 (36,000)
  const elapsedTicks = targetTick - startTick;                                  // 28,800 ticks (24 hours)

  const createInitialSim = () => {
    const sim = new WorldSimulation({ seed });
    // Advance naturally to Day 1 06:00 (7,200 ticks)
    sim.stepMany(startTick);

    sim.spawnPlayer(12, 11);
    sim.spawnBed(12, 12);

    sim.chunks.setTile(11, 10, {
      terrainType: 2,
      flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
      moisture: 70,
      fertility: 80,
      cropTypeId: PARSNIP_CROP.id,
      cropStage: 0,
      growthDays: 0,
      dryDays: 0,
      matureDays: 0
    });

    return sim;
  };

  const simA = createInitialSim();
  const startTimeA = performance.now();
  simA.stepMany(elapsedTicks);
  const durationA = performance.now() - startTimeA;

  const simB = createInitialSim();
  const startTimeB = performance.now();
  simB.advanceSimulationTo(targetTick);
  const durationB = performance.now() - startTimeB;

  assert.equal(simA.clock.currentTick, targetTick);
  assert.equal(simB.clock.currentTick, targetTick);

  const snapshotA = simA.getSnapshot();
  const snapshotB = simB.getSnapshot();

  assert.deepEqual(snapshotA.chunks, snapshotB.chunks);
  assert.deepEqual(snapshotA.farming, snapshotB.farming);
  assert.deepEqual(snapshotA, snapshotB, 'Full 24-hour simulation snapshots must be bit-for-bit identical');

  console.log(`[FastForward Performance] 24-Hour Cycle (28,800 ticks): Continuous = ${durationA.toFixed(2)}ms vs FastForward = ${durationB.toFixed(2)}ms (Speedup: ${(durationA / durationB).toFixed(1)}x)`);
});

test('SleepFarming: Preserves exact 06:00 ordering (hourly evaporation executes BEFORE dawn evaluation)', () => {
  const sim = new WorldSimulation({ seed: 305 });
  // Naturally advance to Day 1 05:00 AM (tick 6,000 = 5 hours)
  sim.stepMany(5 * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR);

  const player = sim.spawnPlayer(12, 11);
  const bed = sim.spawnBed(12, 12);

  // Crop A: Moisture = 21 at 05:00 AM.
  // Rate = -2. At 06:00 AM, hourly evaporation reduces 21 -> 19 BEFORE dawn evaluation.
  // 19 < 20 (MIN_GROWTH_MOISTURE), so it FAILS the dawn water check and records drought!
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    moisture: 21,
    fertility: 50,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 0,
    growthDays: 0,
    dryDays: 0,
    matureDays: 0
  });

  // Crop B: Moisture = 22 at 05:00 AM.
  // Rate = -2. At 06:00 AM, hourly evaporation reduces 22 -> 20 BEFORE dawn evaluation.
  // 20 >= 20, so it SUCCEEDS, advances stage, and consumes 20 moisture (leaving 0)!
  sim.chunks.setTile(11, 11, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    moisture: 22,
    fertility: 50,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 0,
    growthDays: 0,
    dryDays: 0,
    matureDays: 0
  });

  // Sleep targeting immediate 06:00 dawn
  sim.enqueueCommand('SLEEP', player, { targetEntityId: bed });
  sim.step();

  assert.equal(sim.clock.currentTick, 7200, 'Clock must be at Day 1 06:00');

  const tileA = sim.chunks.getTile(11, 10)!;
  assert.equal(tileA.moisture, 19, 'Tile A moisture must be 21 - 2 = 19');
  assert.equal(tileA.dryDays, 1, 'Tile A must register 1 dry day because 19 < 20 at dawn');
  assert.equal(tileA.cropStage, 0, 'Tile A must not advance growth stage');

  const tileB = sim.chunks.getTile(11, 11)!;
  assert.equal(tileB.moisture, 0, 'Tile B moisture must be (22 - 2) - 20 consumed = 0');
  assert.equal(tileB.dryDays, 0, 'Tile B was watered (20 >= 20)');
  assert.equal(tileB.cropStage, 1, 'Tile B must advance to Sprout (Stage 1)');
});

test('SleepFarming: Drought progression and wilting remain identical across sleep', () => {
  const sim = new WorldSimulation({ seed: 306 });
  const player = sim.spawnPlayer(12, 11);
  const bed = sim.spawnBed(12, 12);

  // Crop on tilled dirt with 0 moisture and 2 drought days already accumulated
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    moisture: 0,
    fertility: 50,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 2, // Growing
    growthDays: 2,
    dryDays: 2,
    matureDays: 0
  });

  // Sleep across dawn
  sim.enqueueCommand('SLEEP', player, { targetEntityId: bed });
  sim.step();

  const tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.dryDays, 3, 'dryDays must reach 3');
  assert.equal(tile.cropStage, 4, 'Crop must wilt to Stage 4 after 3 consecutive drought days');
});

test('SleepPersistence: Save before sleep -> Load -> Sleep restores energy to 100 deterministically', () => {
  const storage = new MemoryStorageDriver();

  const simA = new WorldSimulation({ seed: 307 });
  const playerA = simA.spawnPlayer(12, 11);
  const bedA = simA.spawnBed(12, 12);
  const energyA = simA.ecs.getComponent<EnergyComponent>(playerA, 'Energy')!;
  energyA.current = 17;

  // Save game before sleep
  SaveManager.save('sleep_slot', simA, storage);

  // Restore into clean simulation
  const simB = new WorldSimulation({ seed: 999 });
  SaveManager.load('sleep_slot', simB, storage);

  const energyB = simB.ecs.getComponent<EnergyComponent>(simB.playerEntityId, 'Energy')!;
  assert.equal(energyB.current, 17);

  // Execute sleep in restored simulation
  simB.enqueueCommand('SLEEP', simB.playerEntityId, { targetEntityId: simB.bedEntityId });
  simB.step();

  assert.equal(simB.clock.currentTick, 7200);
  assert.equal(energyB.current, 100, 'Energy must restore to 100 after sleep in restored game');

  // Save after sleep and reload
  SaveManager.save('sleep_slot_post', simB, storage);
  const simC = new WorldSimulation({ seed: 111 });
  SaveManager.load('sleep_slot_post', simC, storage);

  const energyC = simC.ecs.getComponent<EnergyComponent>(simC.playerEntityId, 'Energy')!;
  assert.equal(energyC.current, 100);
  assert.equal(simC.clock.currentTick, 7200);
  assert.doesNotThrow(() => simC.assertInvariants());
});
