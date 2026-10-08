import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { InventoryComponent, hasItem } from '../../src/ecs/components/InventoryComponent.js';
import { FARMING_CONFIG } from '../../src/farming/FarmingConfig.js';

test('FarmingActions: TILL converts valid grass or dirt into tilled soil with correct flags', () => {
  const sim = new WorldSimulation({ seed: 101 });
  const playerId = sim.spawnPlayer(10, 10);

  // Tile (11, 10) is adjacent grass
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });

  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  const tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.terrainType, 2, 'Terrain should become TilledSoil (2)');
  assert.ok((tile.flags & TILE_FLAGS.TILLED) !== 0, 'TILLED flag should be set');
  assert.ok((tile.flags & TILE_FLAGS.WALKABLE) !== 0, 'WALKABLE flag should be preserved');

  // Test Dirt (1)
  sim.chunks.setTile(10, 11, { terrainType: 1, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 10, targetTileY: 11 });
  sim.step();

  const dirtTile = sim.chunks.getTile(10, 11)!;
  assert.equal(dirtTile.terrainType, 2, 'Dirt should become TilledSoil (2)');
  assert.ok((dirtTile.flags & TILE_FLAGS.TILLED) !== 0, 'TILLED flag should be set');
});

test('FarmingActions: TILL rejects stone, water, and already tilled soil', () => {
  const sim = new WorldSimulation({ seed: 102 });
  const playerId = sim.spawnPlayer(10, 10);

  // Stone (3)
  sim.chunks.setTile(11, 10, { terrainType: 3, flags: 0 });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(sim.chunks.getTile(11, 10)!.terrainType, 3, 'Stone should not be tilled');

  // Water (4)
  sim.chunks.setTile(9, 10, { terrainType: 4, flags: TILE_FLAGS.WATER });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 9, targetTileY: 10 });
  sim.step();
  assert.equal(sim.chunks.getTile(9, 10)!.terrainType, 4, 'Water should not be tilled');

  // Already Tilled (2)
  sim.chunks.setTile(10, 11, { terrainType: 2, flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED });
  const eventsBefore = sim.events.getHistory().length;
  sim.enqueueCommand('TILL', playerId, { targetTileX: 10, targetTileY: 11 });
  sim.step();
  assert.equal(sim.events.getHistory().length, eventsBefore, 'Should not emit event on already tilled soil');
});

test('FarmingActions: TILL rejects actions out of Euclidean reach or without a hoe', () => {
  const sim = new WorldSimulation({ seed: 103 });
  const playerId = sim.spawnPlayer(10, 10); // Player center is (10.5, 10.5)

  // Distance to (12, 10) center (12.5, 10.5) is 2.0 > 1.5 tiles
  sim.chunks.setTile(12, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 12, targetTileY: 10 });
  sim.step();
  assert.equal(sim.chunks.getTile(12, 10)!.terrainType, 0, 'Out of reach tile must not be tilled');

  // Remove hoe from player inventory
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  inv.slots[0] = null; // Removed hoe

  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(sim.chunks.getTile(11, 10)!.terrainType, 0, 'Cannot till without a hoe');
});

test('FarmingActions: SOW plants seed into tilled furrow and deducts inventory', () => {
  const sim = new WorldSimulation({ seed: 104 });
  const playerId = sim.spawnPlayer(10, 10);

  sim.chunks.setTile(11, 10, { terrainType: 2, flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED });
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  assert.equal(inv.slots[2]?.quantity, 15, 'Player should start with 15 Parsnip seeds');

  sim.enqueueCommand('SOW', playerId, { targetTileX: 11, targetTileY: 10, payload: { seedItemId: 'seed_parsnip' } });
  sim.step();

  const tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropTypeId, 1, 'Crop type should be Parsnip (1)');
  assert.equal(tile.cropStage, 0, 'Crop stage should be Seed (0)');
  assert.equal(tile.growthDays, 0);
  assert.equal(tile.matureDays, 0);
  assert.equal(tile.dryDays, 0);

  assert.equal(inv.slots[2]?.quantity, 14, 'Seed quantity should decrement by 1');
});

test('FarmingActions: SOW rejects untilled soil, occupied furrow, or missing seeds', () => {
  const sim = new WorldSimulation({ seed: 105 });
  const playerId = sim.spawnPlayer(10, 10);

  // Untilled soil (Grass)
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('SOW', playerId, { targetTileX: 11, targetTileY: 10, payload: { seedItemId: 'seed_parsnip' } });
  sim.step();
  assert.equal(sim.chunks.getTile(11, 10)!.cropTypeId, 0, 'Cannot sow on untilled ground');

  // Occupied furrow
  sim.chunks.setTile(10, 11, { terrainType: 2, cropTypeId: 1, cropStage: 1 });
  sim.enqueueCommand('SOW', playerId, { targetTileX: 10, targetTileY: 11, payload: { seedItemId: 'seed_parsnip' } });
  sim.step();
  assert.equal(sim.chunks.getTile(10, 11)!.cropStage, 1, 'Cannot sow into occupied furrow');

  // No seeds
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  inv.slots[2] = null; // Clear seeds

  sim.chunks.setTile(10, 9, { terrainType: 2, cropTypeId: 0 });
  sim.enqueueCommand('SOW', playerId, { targetTileX: 10, targetTileY: 9, payload: { seedItemId: 'seed_parsnip' } });
  sim.step();
  assert.equal(sim.chunks.getTile(10, 9)!.cropTypeId, 0, 'Cannot sow without seeds');
});

test('FarmingActions: WATER increases moisture, decrements charges, and clamps to 100', () => {
  const sim = new WorldSimulation({ seed: 106 });
  const playerId = sim.spawnPlayer(10, 10);

  sim.chunks.setTile(11, 10, { terrainType: 2, moisture: 30 });
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  assert.equal(inv.slots[1]?.charges, 40);

  sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  const tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.moisture, 100, 'Moisture should be clamped to 100');
  assert.equal(inv.slots[1]?.charges, 39, 'Watering can should lose 1 charge');

  // Empty can cannot water
  inv.slots[1]!.charges = 0;
  tile.moisture = 0;
  sim.enqueueCommand('WATER', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(tile.moisture, 0, 'Empty watering can should not add moisture');
});

test('FarmingActions: HARVEST yields produce for mature crop, reduces fertility, and clears tile', () => {
  const sim = new WorldSimulation({ seed: 107 });
  const playerId = sim.spawnPlayer(10, 10);

  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    fertility: 60,
    cropTypeId: 1, // Parsnip
    cropStage: 3,   // Mature
    matureDays: 2
  });

  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  const tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropTypeId, 0, 'Crop should be cleared from tile');
  assert.equal(tile.cropStage, 0, 'Stage should reset to 0');
  assert.equal(tile.matureDays, 0, 'Mature timer should reset');
  assert.equal(tile.fertility, 45, 'Fertility should be reduced by 15 (60 - 15)');

  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  assert.ok(hasItem(inv, 'crop_parsnip', 1), 'Player inventory should receive harvested parsnip');
});

test('FarmingActions: HARVEST rejects immature crops and full inventory without state mutation', () => {
  const sim = new WorldSimulation({ seed: 108 });
  const playerId = sim.spawnPlayer(10, 10);

  // Immature crop (Stage 2: Growing)
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    fertility: 60,
    cropTypeId: 1,
    cropStage: 2
  });

  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(sim.chunks.getTile(11, 10)!.cropStage, 2, 'Immature crop must not be harvested');
  assert.equal(sim.chunks.getTile(11, 10)!.fertility, 60, 'Fertility must not be reduced on failed harvest');

  // Set crop to Mature
  sim.chunks.getTile(11, 10)!.cropStage = 3;

  // Fill player inventory completely
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  for (let i = 0; i < inv.slots.length; i++) {
    inv.slots[i] = { itemId: 'dummy_blocker', quantity: 99 };
  }

  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  // Invariant: Full inventory rejects harvest without destroying crop or depleting fertility!
  const tileAfter = sim.chunks.getTile(11, 10)!;
  assert.equal(tileAfter.cropStage, 3, 'Mature crop must remain on tile when inventory is full');
  assert.equal(tileAfter.cropTypeId, 1, 'Crop type must not be cleared when inventory is full');
  assert.equal(tileAfter.fertility, 60, 'Fertility must not be deducted when inventory is full');
});

test('FarmingActions: HARVEST clears wilted crop (Stage 4) without produce', () => {
  const sim = new WorldSimulation({ seed: 109 });
  const playerId = sim.spawnPlayer(10, 10);

  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    fertility: 50,
    cropTypeId: 1,
    cropStage: 4, // Wilted
    matureDays: 5
  });

  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  const tile = sim.chunks.getTile(11, 10)!;
  assert.equal(tile.cropTypeId, 0, 'Wilted crop should be cleared');
  assert.equal(tile.cropStage, 0);
  assert.equal(tile.fertility, 50, 'Fertility should not be deducted for clearing wilted crop');

  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  assert.ok(!hasItem(inv, 'crop_parsnip', 1), 'Wilted crop should not yield food produce');
});
