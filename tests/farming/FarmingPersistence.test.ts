import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';
import { NodeCryptoHasher } from '../../src/persistence/NodeCryptoHasher.js';
import { BrowserSha256Hasher } from '../../src/persistence/BrowserSha256Hasher.js';
import { InventoryComponent, hasItem } from '../../src/ecs/components/InventoryComponent.js';
import { TIME_CONFIG } from '../../src/farming/FarmingConfig.js';

test('FarmingPersistence: Full farming state roundtrip preserves all agricultural attributes and inventory', () => {
  const sim = new WorldSimulation({ seed: 501 });
  const playerId = sim.spawnPlayer(10, 10);

  // Set up varied agricultural tiles
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    moisture: 72,
    fertility: 85,
    cropTypeId: 1,
    cropStage: 2, // Growing
    growthDays: 1,
    matureDays: 0,
    dryDays: 0
  });

  sim.chunks.setTile(10, 11, {
    terrainType: 2,
    moisture: 0,
    fertility: 40,
    cropTypeId: 1,
    cropStage: 3, // Mature
    growthDays: 0,
    matureDays: 3,
    dryDays: 0
  });

  // Modify player inventory
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  inv.slots[1]!.charges = 25; // 25 charges left in can
  inv.slots[2]!.quantity = 10; // 10 seeds left
  inv.slots[3] = { itemId: 'crop_parsnip', quantity: 4 };

  sim.stepMany(500); // Advance clock

  // Save with MemoryStorageDriver using BrowserSha256Hasher
  SaveManager.setHasher(new BrowserSha256Hasher());
  const driver = new MemoryStorageDriver();
  SaveManager.save('farming_save_slot', sim, driver);

  // Load into completely fresh simulation instance using NodeCryptoHasher
  SaveManager.setHasher(new NodeCryptoHasher());
  const restoredSim = new WorldSimulation({ seed: 999 });
  SaveManager.load('farming_save_slot', restoredSim, driver);

  // Verify clock & player ID
  assert.equal(restoredSim.clock.currentTick, sim.clock.currentTick);
  assert.equal(restoredSim.playerEntityId, sim.playerEntityId);

  // Verify Tile 1 (Growing crop)
  const tile1 = restoredSim.chunks.getTile(11, 10)!;
  assert.equal(tile1.terrainType, 2);
  assert.equal(tile1.moisture, 72);
  assert.equal(tile1.fertility, 85);
  assert.equal(tile1.cropTypeId, 1);
  assert.equal(tile1.cropStage, 2);
  assert.equal(tile1.growthDays, 1);
  assert.equal(tile1.matureDays, 0);

  // Verify Tile 2 (Mature crop with matureDays timer)
  const tile2 = restoredSim.chunks.getTile(10, 11)!;
  assert.equal(tile2.cropStage, 3);
  assert.equal(tile2.matureDays, 3);
  assert.equal(tile2.fertility, 40);

  // Verify Player Inventory
  const restoredInv = restoredSim.ecs.getComponent<InventoryComponent>(restoredSim.playerEntityId!, 'Inventory')!;
  assert.equal(restoredInv.slots[1]?.charges, 25);
  assert.equal(restoredInv.slots[2]?.quantity, 10);
  assert.equal(restoredInv.slots[3]?.itemId, 'crop_parsnip');
  assert.equal(restoredInv.slots[3]?.quantity, 4);
});

test('FarmingPersistence: Deterministic continuation after save/load matches continuous run bit-for-bit', () => {
  const SEED = 77777;

  // Run A: Continuous 3 in-game days without saving
  const simA = new WorldSimulation({ seed: SEED });
  const playerA = simA.spawnPlayer(10, 10);
  simA.chunks.setTile(11, 10, { terrainType: 2, moisture: 100, cropTypeId: 1, cropStage: 0 });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;
  simA.stepMany(DAY_TICKS * 2);

  // Run B: Run 1 day, save, load, run 2nd day
  const simB = new WorldSimulation({ seed: SEED });
  const playerB = simB.spawnPlayer(10, 10);
  simB.chunks.setTile(11, 10, { terrainType: 2, moisture: 100, cropTypeId: 1, cropStage: 0 });

  simB.stepMany(DAY_TICKS); // 1 day

  // Save and load
  const driver = new MemoryStorageDriver();
  SaveManager.save('continuation_test', simB, driver);

  const restoredB = new WorldSimulation({ seed: 1 });
  SaveManager.load('continuation_test', restoredB, driver);

  // Step 2nd day on restored instance
  restoredB.stepMany(DAY_TICKS);

  // Compare bit-exact state
  const snapshotA = simA.getSnapshot();
  const snapshotB = restoredB.getSnapshot();

  assert.equal(snapshotB.clock.currentTick, snapshotA.clock.currentTick);
  assert.equal(snapshotB.rng.state, snapshotA.rng.state);
  assert.deepEqual(snapshotB.chunks, snapshotA.chunks);

  const tileA = simA.chunks.getTile(11, 10)!;
  const tileB = restoredB.chunks.getTile(11, 10)!;
  assert.deepEqual(tileB, tileA);
});

test('FarmingPersistence: Two identical automated farming simulations produce bit-identical states', () => {
  const SEED = 88888;

  function runAutomatedFarmingSession(): WorldSimulation {
    const sim = new WorldSimulation({ seed: SEED });
    const playerId = sim.spawnPlayer(10, 10);

    // Day 0: Till, sow, water
    sim.chunks.setTile(11, 10, { terrainType: 0 });
    sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
    sim.enqueueCommand('SOW', playerId, { targetTileX: 11, targetTileY: 10, payload: { seedItemId: 'seed_parsnip' } });
    sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });

    sim.stepMany(TIME_CONFIG.TICKS_PER_IN_GAME_DAY);

    // Day 1: Re-water
    sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
    sim.stepMany(TIME_CONFIG.TICKS_PER_IN_GAME_DAY);

    // Day 2: Re-water
    sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
    sim.stepMany(TIME_CONFIG.TICKS_PER_IN_GAME_DAY);

    // Day 3: Re-water
    sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
    sim.stepMany(TIME_CONFIG.TICKS_PER_IN_GAME_DAY);

    // Day 4: Crop should be mature -> Harvest!
    sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
    sim.step();

    return sim;
  }

  const run1 = runAutomatedFarmingSession();
  const run2 = runAutomatedFarmingSession();

  const snap1 = run1.getSnapshot();
  const snap2 = run2.getSnapshot();

  assert.equal(snap1.clock.currentTick, snap2.clock.currentTick);
  assert.equal(snap1.rng.state, snap2.rng.state);
  assert.deepEqual(snap1.chunks, snap2.chunks);

  const inv1 = run1.ecs.getComponent<InventoryComponent>(run1.playerEntityId!, 'Inventory')!;
  const inv2 = run2.ecs.getComponent<InventoryComponent>(run2.playerEntityId!, 'Inventory')!;
  assert.deepEqual(inv1, inv2);
});
