import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { EnergyComponent } from '../../src/ecs/components/EnergyComponent.js';
import { InventoryComponent } from '../../src/ecs/components/InventoryComponent.js';
import { PLAYER_CONFIG } from '../../src/player/PlayerConfig.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { CropRegistry, PARSNIP_CROP } from '../../src/farming/CropRegistry.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';

test('PlayerEnergy: Player spawns with authoritative EnergyComponent (100/100) and snapshot exposure', () => {
  const sim = new WorldSimulation({ seed: 201 });
  const playerId = sim.spawnPlayer(10, 10);

  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy');
  assert.ok(energy, 'Player must have EnergyComponent');
  assert.equal(energy.current, PLAYER_CONFIG.STARTING_ENERGY);
  assert.equal(energy.max, PLAYER_CONFIG.MAX_ENERGY);
  assert.equal(energy.current, 100);
  assert.equal(energy.max, 100);

  const snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.player, 'Snapshot must include player render data');
  assert.equal(snapshot.player.energy.current, 100);
  assert.equal(snapshot.player.energy.max, 100);
  assert.equal(snapshot.player.inventory.length, 10);
});

test('PlayerEnergy: Successful actions deduct exact configured energy costs', () => {
  const sim = new WorldSimulation({ seed: 202 });
  const playerId = sim.spawnPlayer(10, 10);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;

  // 1. TILL adjacent grass at (11, 10) -> costs 5
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 100 - PLAYER_CONFIG.TILL, 'TILL must deduct exactly 5 energy');
  assert.equal(energy.current, 95);

  // 2. SOW parsnip seed at (11, 10) -> costs 2
  sim.enqueueCommand('SOW', playerId, { targetTileX: 11, targetTileY: 10, seedItemId: 'seed_parsnip' });
  sim.step();
  assert.equal(energy.current, 95 - PLAYER_CONFIG.SOW, 'SOW must deduct exactly 2 energy');
  assert.equal(energy.current, 93);

  // 3. WATER crop at (11, 10) -> costs 1
  sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 93 - PLAYER_CONFIG.WATER, 'WATER must deduct exactly 1 energy');
  assert.equal(energy.current, 92);

  // 4. Force crop to Stage 3 (Mature) and HARVEST -> costs 2
  const tile = sim.chunks.getTile(11, 10)!;
  tile.cropStage = 3;
  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 92 - PLAYER_CONFIG.HARVEST, 'Mature HARVEST must deduct exactly 2 energy');
  assert.equal(energy.current, 90);
  assert.equal(tile.cropStage, 0, 'Mature crop must be cleared upon harvest');

  // 5. CLEAR_WILTED on Stage 4 wilted crop at (10, 11) -> costs 1
  sim.chunks.setTile(10, 11, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 4 // Wilted
  });
  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 10, targetTileY: 11 });
  sim.step();
  assert.equal(energy.current, 90 - PLAYER_CONFIG.CLEAR_WILTED, 'Clearing wilted crop must deduct exactly 1 energy');
  assert.equal(energy.current, 89);
  const wiltedTile = sim.chunks.getTile(10, 11)!;
  assert.equal(wiltedTile.cropTypeId, 0, 'Wilted crop must be cleared');
  assert.equal(wiltedTile.cropStage, 0);
});

test('PlayerEnergy: Failed actions consume zero energy (Failure Integrity)', () => {
  const sim = new WorldSimulation({ seed: 203 });
  const playerId = sim.spawnPlayer(10, 10);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;

  // Baseline energy = 100
  assert.equal(energy.current, 100);

  // 1. Invalid tile: TILL on water tile
  sim.chunks.setTile(11, 10, { terrainType: 4, flags: TILE_FLAGS.WATER });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 100, 'Invalid tile TILL must consume 0 energy');

  // 2. Out of reach target (> 1.5 tiles)
  sim.chunks.setTile(15, 15, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 15, targetTileY: 15 });
  sim.step();
  assert.equal(energy.current, 100, 'Out-of-reach action must consume 0 energy');

  // 3. SOW on untilled dirt
  sim.chunks.setTile(10, 11, { terrainType: 1, flags: TILE_FLAGS.WALKABLE, cropTypeId: 0 });
  sim.enqueueCommand('SOW', playerId, { targetTileX: 10, targetTileY: 11, seedItemId: 'seed_parsnip' });
  sim.step();
  assert.equal(energy.current, 100, 'SOW on untilled dirt must consume 0 energy');

  // 4. Empty watering can: set charges to 0 and attempt WATER
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  const wateringCan = inv.slots.find(s => s?.itemId === 'tool_watering_can')!;
  wateringCan.charges = 0;
  sim.chunks.setTile(10, 11, { terrainType: 2, flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED, cropTypeId: 0, moisture: 10 });
  sim.enqueueCommand('WATER', playerId, { targetTileX: 10, targetTileY: 11 });
  sim.step();
  assert.equal(energy.current, 100, 'Empty watering can WATER must consume 0 energy');
  assert.equal(sim.chunks.getTile(10, 11)!.moisture, 10, 'Moisture must not increase');

  // 5. Full inventory during harvest
  // Setup mature parsnip at (11, 10)
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 3
  });
  // Fill all 10 inventory slots with dummy items
  inv.slots = [
    { itemId: 'tool_hoe', quantity: 1 },
    { itemId: 'tool_watering_can', quantity: 1, charges: 40 },
    { itemId: 'seed_parsnip', quantity: 15 },
    { itemId: 'stone', quantity: 99 },
    { itemId: 'wood', quantity: 99 },
    { itemId: 'fiber', quantity: 99 },
    { itemId: 'clay', quantity: 99 },
    { itemId: 'coal', quantity: 99 },
    { itemId: 'copper_ore', quantity: 99 },
    { itemId: 'iron_ore', quantity: 99 }
  ];
  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 100, 'Full inventory HARVEST must consume 0 energy');
  assert.equal(sim.chunks.getTile(11, 10)!.cropStage, 3, 'Crop must remain mature and unharvested');

  // 6. Invalid crop state (HARVEST on immature Stage 1 crop)
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 1 // Sprout
  });
  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 100, 'HARVEST on immature crop must consume 0 energy');
  assert.equal(sim.chunks.getTile(11, 10)!.cropStage, 1, 'Crop must remain untouched');
});

test('PlayerEnergy: Insufficient energy rejects action with zero mutation and zero deduction', () => {
  const sim = new WorldSimulation({ seed: 204 });
  const playerId = sim.spawnPlayer(10, 10);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;

  // 1. TILL requires 5; set energy to 4
  energy.current = 4;
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 4, 'Insufficient energy TILL must not deduct energy');
  assert.equal(sim.chunks.getTile(11, 10)!.terrainType, 0, 'Tile must not be tilled');

  // 2. SOW requires 2; set energy to 1
  energy.current = 1;
  sim.chunks.setTile(11, 10, { terrainType: 2, flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED, cropTypeId: 0 });
  sim.enqueueCommand('SOW', playerId, { targetTileX: 11, targetTileY: 10, seedItemId: 'seed_parsnip' });
  sim.step();
  assert.equal(energy.current, 1, 'Insufficient energy SOW must not deduct energy');
  assert.equal(sim.chunks.getTile(11, 10)!.cropTypeId, 0, 'Seed must not be sown');

  // 3. WATER requires 1; set energy to 0
  energy.current = 0;
  sim.chunks.setTile(11, 10, { terrainType: 2, flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED, cropTypeId: 0, moisture: 20 });
  sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 0, 'Zero energy WATER must not deduct energy');
  assert.equal(sim.chunks.getTile(11, 10)!.moisture, 20, 'Moisture must not change');

  // 4. Mature HARVEST requires 2; set energy to 1
  energy.current = 1;
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 3
  });
  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 1, 'Insufficient energy HARVEST must not deduct energy');
  assert.equal(sim.chunks.getTile(11, 10)!.cropStage, 3, 'Crop must not be harvested');

  // 5. CLEAR_WILTED requires 1; set energy to 0
  energy.current = 0;
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    cropTypeId: PARSNIP_CROP.id,
    cropStage: 4
  });
  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(energy.current, 0, 'Zero energy wilted clear must not deduct energy');
  assert.equal(sim.chunks.getTile(11, 10)!.cropStage, 4, 'Crop must remain wilted');
});

test('PlayerEnergy: Zero-energy behavior allows movement and non-energy inspection without fainting', () => {
  const sim = new WorldSimulation({ seed: 205 });
  const playerId = sim.spawnPlayer(10, 10);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;

  // Deplete energy to zero
  energy.current = 0;

  // Ensure adjacent tile is walkable
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });

  // Issue MOVE command to move right (dx: 1, dy: 0, speed: 10.0 tiles/sec -> 0.5 tiles/tick)
  sim.enqueueCommand('MOVE', playerId, { payload: { dx: 1, dy: 0, speed: 10.0 } });
  sim.step();

  const pos = sim.ecs.getComponent<any>(playerId, 'Position')!;
  assert.equal(pos.x, 11.0, 'Player must be able to MOVE at 0 energy');
  assert.equal(pos.y, 10.5);
  assert.equal(energy.current, 0, 'MOVE costs 0 energy');

  // Verify render snapshot operates cleanly at zero energy
  const snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.energy.current, 0);
  assert.equal(snapshot.player?.energy.max, 100);
  assert.ok(snapshot.player?.inventory.length! > 0, 'Inventory inspection remains accessible');

  // Simulation invariants hold
  assert.doesNotThrow(() => sim.assertInvariants());
});

test('PlayerEnergy: Persistence preserves exact energy (Energy = 43 -> save -> load -> Energy = 43)', () => {
  const storage = new MemoryStorageDriver();

  const simA = new WorldSimulation({ seed: 206 });
  const playerA = simA.spawnPlayer(10, 10);
  const energyA = simA.ecs.getComponent<EnergyComponent>(playerA, 'Energy')!;

  // Set energy to specific non-default value
  energyA.current = 43;
  energyA.max = 100;

  // Save game
  SaveManager.save('energy_slot_1', simA, storage);

  // Restore into clean simulation
  const simB = new WorldSimulation({ seed: 999 });
  SaveManager.load('energy_slot_1', simB, storage);

  const energyB = simB.ecs.getComponent<EnergyComponent>(simB.playerEntityId, 'Energy');
  assert.ok(energyB, 'Loaded simulation must have EnergyComponent');
  assert.equal(energyB.current, 43, 'Loaded energy current must exactly equal 43');
  assert.equal(energyB.max, 100, 'Loaded energy max must equal 100');

  // Invariant check passes
  assert.doesNotThrow(() => simB.assertInvariants());
});

test('PlayerEnergy: Determinism produces bit-identical energy state across two independent runs', () => {
  const runSim = () => {
    const sim = new WorldSimulation({ seed: 777 });
    const playerId = sim.spawnPlayer(10, 10);

    // Setup tiles
    sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
    sim.chunks.setTile(10, 11, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });

    // Enqueue identical command sequence
    sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
    sim.step(); // -5 energy

    sim.enqueueCommand('SOW', playerId, { targetTileX: 11, targetTileY: 10, seedItemId: 'seed_parsnip' });
    sim.step(); // -2 energy

    sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
    sim.step(); // -1 energy

    sim.enqueueCommand('MOVE', playerId, { x: 10.5, y: 11.5 });
    sim.step(); // 0 energy

    sim.enqueueCommand('TILL', playerId, { targetTileX: 10, targetTileY: 11 });
    sim.step(); // -5 energy

    const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
    return {
      energyCurrent: energy.current,
      energyMax: energy.max,
      snapshot: sim.getSnapshot()
    };
  };

  const run1 = runSim();
  const run2 = runSim();

  assert.equal(run1.energyCurrent, run2.energyCurrent);
  assert.equal(run1.energyCurrent, 100 - 5 - 2 - 1 - 0 - 5); // 87
  assert.equal(run1.energyMax, run2.energyMax);
  assert.deepEqual(run1.snapshot, run2.snapshot, 'Full snapshots must be bit-identical');
});
