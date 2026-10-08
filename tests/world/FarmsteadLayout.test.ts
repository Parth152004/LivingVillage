import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { TERRAIN_TYPES, TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { FARMING_CONFIG } from '../../src/farming/FarmingConfig.js';
import { PLAYER_CONFIG } from '../../src/player/PlayerConfig.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { EnergyComponent } from '../../src/ecs/components/EnergyComponent.js';
import { InventoryComponent, getFirstItem } from '../../src/ecs/components/InventoryComponent.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';

test('FarmsteadLayout: Deterministically carves 3x3 natural water pond at (22,7)-(24,9)', () => {
  const sim = new WorldSimulation({ seed: 601 });
  const result = FarmsteadLayout.initialize(sim);

  assert.ok(result.bedEntityId > 0, 'Bed entity must be spawned');
  assert.ok(result.playerEntityId > 0, 'Player entity must be spawned');

  // Verify all 9 pond tiles
  let pondTileCount = 0;
  for (let y = FarmsteadLayout.POND_MIN_Y; y <= FarmsteadLayout.POND_MAX_Y; y++) {
    for (let x = FarmsteadLayout.POND_MIN_X; x <= FarmsteadLayout.POND_MAX_X; x++) {
      const tile = sim.chunks.getTile(x, y)!;
      assert.ok(tile, `Tile at (${x}, ${y}) must exist`);
      assert.equal(tile.terrainType, TERRAIN_TYPES.WATER, `Tile (${x}, ${y}) must have terrainType WATER (4)`);
      assert.equal(tile.flags, TILE_FLAGS.WATER, `Tile (${x}, ${y}) must have flags WATER (2)`);
      assert.equal(tile.moisture, 100, `Pond tile (${x}, ${y}) must have 100 moisture`);
      assert.equal(tile.fertility, FARMING_CONFIG.BASELINE_FERTILITY, `Pond tile (${x}, ${y}) baseline fertility`);
      assert.equal(sim.chunks.isWalkable(x, y), false, `Pond tile (${x}, ${y}) must NOT be walkable`);
      assert.equal(FarmsteadLayout.isPondTile(x, y), true, `isPondTile must be true for (${x}, ${y})`);
      pondTileCount++;
    }
  }
  assert.equal(pondTileCount, 9, 'Pond must consist of exactly 9 tiles (3x3)');

  // Verify tiles outside pond boundary are walkable and not water
  const outsideCoords = [
    { x: 21, y: 7 },
    { x: 25, y: 8 },
    { x: 23, y: 6 },
    { x: 23, y: 10 }
  ];
  for (const { x, y } of outsideCoords) {
    const tile = sim.chunks.getTile(x, y)!;
    assert.equal(tile.terrainType, TERRAIN_TYPES.GRASS, `Outside tile (${x}, ${y}) must be GRASS`);
    assert.notEqual(tile.flags & TILE_FLAGS.WATER, TILE_FLAGS.WATER);
    assert.equal(sim.chunks.isWalkable(x, y), true, `Outside tile (${x}, ${y}) must be walkable`);
    assert.equal(FarmsteadLayout.isPondTile(x, y), false);
  }
});

test('FarmsteadLayout: Spawns Bed at (12,12), Shipping Bin at (14,12), Seed Catalog at (15,12), and Player at (16,16)', () => {
  const sim = new WorldSimulation({ seed: 602 });
  const { bedEntityId, playerEntityId, shippingBinEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  assert.equal(sim.bedEntityId, bedEntityId);
  assert.equal(sim.playerEntityId, playerEntityId);
  assert.equal(sim.shippingBinEntityId, shippingBinEntityId);
  assert.equal(sim.seedCatalogEntityId, seedCatalogEntityId);

  // Bed verification
  const bedPos = sim.ecs.getComponent<PositionComponent>(bedEntityId, 'Position')!;
  assert.equal(bedPos.x, 12.5);
  assert.equal(bedPos.y, 12.5);
  assert.ok(sim.ecs.hasComponent(bedEntityId, 'Bed'));

  // Shipping Bin verification
  const binPos = sim.ecs.getComponent<PositionComponent>(shippingBinEntityId, 'Position')!;
  assert.equal(binPos.x, 14.5);
  assert.equal(binPos.y, 12.5);
  assert.ok(sim.ecs.hasComponent(shippingBinEntityId, 'ShippingBin'));

  // Seed Catalog verification
  const catPos = sim.ecs.getComponent<PositionComponent>(seedCatalogEntityId, 'Position')!;
  assert.equal(catPos.x, 15.5);
  assert.equal(catPos.y, 12.5);
  assert.ok(sim.ecs.hasComponent(seedCatalogEntityId, 'SeedCatalog'));

  // Player verification
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  assert.equal(playerPos.x, 16.5);
  assert.equal(playerPos.y, 16.5);

  const energy = sim.ecs.getComponent<EnergyComponent>(playerEntityId, 'Energy')!;
  assert.equal(energy.current, PLAYER_CONFIG.STARTING_ENERGY);
  assert.equal(energy.max, PLAYER_CONFIG.MAX_ENERGY);

  // Player wallet verification (100g starting gold)
  const wallet = sim.ecs.getComponent<any>(playerEntityId, 'Wallet')!;
  assert.ok(wallet, 'Player must have WalletComponent');
  assert.equal(wallet.gold, 100, 'Player must start with 100g');

  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  const hoe = getFirstItem(inv, 'tool_hoe');
  const can = getFirstItem(inv, 'tool_watering_can');
  const seeds = getFirstItem(inv, 'seed_parsnip');

  assert.ok(hoe, 'Player must start with tool_hoe');
  assert.ok(can, 'Player must start with tool_watering_can');
  assert.equal(can?.charges, FARMING_CONFIG.WATERING_CAN_MAX_CHARGES, 'Watering can must start with 40 charges');
  assert.ok(seeds, 'Player must start with seed_parsnip');
  assert.equal(seeds?.quantity, 15, 'Player must start with 15 parsnip seeds');
});

test('FarmsteadLayout: Layout initialization is deterministic across independent simulations', () => {
  const simA = new WorldSimulation({ seed: 603 });
  const simB = new WorldSimulation({ seed: 603 });

  FarmsteadLayout.initialize(simA);
  FarmsteadLayout.initialize(simB);

  // Compare snapshot JSON of chunks and ECS
  assert.deepEqual(simA.chunks.getSnapshot(), simB.chunks.getSnapshot());
  assert.deepEqual(simA.ecs.getSnapshot(), simB.ecs.getSnapshot());
});

test('FarmsteadLayout: Preserved identically across save and load roundtrip', () => {
  const sim = new WorldSimulation({ seed: 604 });
  FarmsteadLayout.initialize(sim);

  const storage = new MemoryStorageDriver();
  SaveManager.save('slot1', sim, storage);

  const loadedSim = new WorldSimulation({ seed: 999 });
  SaveManager.load('slot1', loadedSim, storage);

  // Verify pond in loaded simulation
  for (let y = FarmsteadLayout.POND_MIN_Y; y <= FarmsteadLayout.POND_MAX_Y; y++) {
    for (let x = FarmsteadLayout.POND_MIN_X; x <= FarmsteadLayout.POND_MAX_X; x++) {
      const tile = loadedSim.chunks.getTile(x, y)!;
      assert.equal(tile.terrainType, TERRAIN_TYPES.WATER);
      assert.equal(tile.flags, TILE_FLAGS.WATER);
      assert.equal(tile.moisture, 100);
      assert.equal(loadedSim.chunks.isWalkable(x, y), false);
    }
  }

  // Verify entities
  assert.equal(loadedSim.bedEntityId, sim.bedEntityId);
  assert.equal(loadedSim.playerEntityId, sim.playerEntityId);
  assert.equal(loadedSim.shippingBinEntityId, sim.shippingBinEntityId);
  assert.equal(loadedSim.seedCatalogEntityId, sim.seedCatalogEntityId);

  const loadedPlayerPos = loadedSim.ecs.getComponent<PositionComponent>(loadedSim.playerEntityId, 'Position')!;
  assert.equal(loadedPlayerPos.x, 16.5);
  assert.equal(loadedPlayerPos.y, 16.5);
});

test('FarmsteadLayout: Repeated initialization is idempotent and never creates duplicate entities', () => {
  const sim = new WorldSimulation({ seed: 605 });

  // Initial call
  const first = FarmsteadLayout.initialize(sim);
  assert.equal(sim.ecs.activeEntityCount, 4, 'Initial layout must have exactly 4 entities (bed, player, bin, catalog)');
  assert.equal(sim.ecs.queryEntities(['Bed']).length, 1);
  assert.equal(sim.ecs.queryEntities(['ShippingBin']).length, 1);
  assert.equal(sim.ecs.queryEntities(['SeedCatalog']).length, 1);
  assert.equal(sim.ecs.queryEntities(['Position', 'Inventory', 'Energy']).length, 1);

  // Second call on same simulation
  const second = FarmsteadLayout.initialize(sim);
  assert.equal(sim.ecs.activeEntityCount, 4, 'Second call must not create duplicate entities');
  assert.equal(second.bedEntityId, first.bedEntityId);
  assert.equal(second.playerEntityId, first.playerEntityId);
  assert.equal(second.shippingBinEntityId, first.shippingBinEntityId);
  assert.equal(second.seedCatalogEntityId, first.seedCatalogEntityId);

  // Invariants pass cleanly
  sim.assertInvariants();
});

test('FarmsteadLayout: Restoring a save does not invoke fresh-world initialization and preserves mutated state', () => {
  const sim = new WorldSimulation({ seed: 606 });
  FarmsteadLayout.initialize(sim);

  // Mutate world and player state away from fresh-world defaults
  const playerPos = sim.ecs.getComponent<PositionComponent>(sim.playerEntityId, 'Position')!;
  playerPos.x = 20.5;
  playerPos.y = 25.5;

  const energy = sim.ecs.getComponent<EnergyComponent>(sim.playerEntityId, 'Energy')!;
  energy.current = 42;

  const wallet = sim.ecs.getComponent<any>(sim.playerEntityId, 'Wallet')!;
  wallet.gold = 750;

  // Till and plant at a tile
  sim.chunks.setTile(5, 5, {
    terrainType: TERRAIN_TYPES.TILLED_SOIL,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    moisture: 90,
    fertility: 70,
    cropTypeId: 1,
    cropStage: 2,
    cropProgress: 0,
    growthDays: 2,
    matureDays: 0,
    dryDays: 0
  });

  const storage = new MemoryStorageDriver();
  SaveManager.save('mutated_slot', sim, storage);

  // Restore into a fresh simulation
  const loadedSim = new WorldSimulation({ seed: 888 });
  SaveManager.load('mutated_slot', loadedSim, storage);

  // Verify restored state was NOT overwritten by fresh-world layout defaults
  const loadedPos = loadedSim.ecs.getComponent<PositionComponent>(loadedSim.playerEntityId, 'Position')!;
  assert.equal(loadedPos.x, 20.5, 'Player X must remain 20.5, not reset to spawn 16.5');
  assert.equal(loadedPos.y, 25.5, 'Player Y must remain 25.5, not reset to spawn 16.5');

  const loadedEnergy = loadedSim.ecs.getComponent<EnergyComponent>(loadedSim.playerEntityId, 'Energy')!;
  assert.equal(loadedEnergy.current, 42, 'Energy must remain 42, not reset to 100');

  const loadedWallet = loadedSim.ecs.getComponent<any>(loadedSim.playerEntityId, 'Wallet')!;
  assert.equal(loadedWallet.gold, 750, 'Gold must remain 750, not reset to starting 100');

  const loadedCropTile = loadedSim.chunks.getTile(5, 5)!;
  assert.equal(loadedCropTile.terrainType, TERRAIN_TYPES.TILLED_SOIL);
  assert.equal(loadedCropTile.cropStage, 2);
  assert.equal(loadedCropTile.cropTypeId, 1);

  // Even if FarmsteadLayout.initialize is redundantly called on loadedSim, it must not overwrite player position or duplicate entities
  FarmsteadLayout.initialize(loadedSim);
  assert.equal(loadedSim.ecs.activeEntityCount, 4);
  const reloadedPos = loadedSim.ecs.getComponent<PositionComponent>(loadedSim.playerEntityId, 'Position')!;
  assert.equal(reloadedPos.x, 20.5, 'Idempotent initialize must not overwrite active player position');
});
