import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation, SimulationSnapshot } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { EnergyComponent } from '../../src/ecs/components/EnergyComponent.js';
import { InventoryComponent, addItem, getFirstItem } from '../../src/ecs/components/InventoryComponent.js';
import { ShippingBinComponent } from '../../src/ecs/components/ShippingBinComponent.js';
import { SeedCatalogComponent } from '../../src/ecs/components/SeedCatalogComponent.js';
import { WalletComponent } from '../../src/ecs/components/WalletComponent.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';

test('CommerceMigration: Round-trip persistence of wallet, shipping bin, and seed catalog', () => {
  const sim = new WorldSimulation({ seed: 730 });
  const { playerEntityId, shippingBinEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  // Mutate wallet to 345g
  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  wallet.gold = 345;

  // Add items to shipping bin
  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  bin.items.push(
    { itemId: 'crop_parsnip', quantity: 7 },
    { itemId: 'crop_potato', quantity: 3 }
  );

  // Verify seed catalog ID
  const catalog = sim.ecs.getComponent<SeedCatalogComponent>(seedCatalogEntityId, 'SeedCatalog')!;
  assert.equal(catalog.catalogId, 'farmstead_seed_catalog');

  // Save to memory
  const storage = new MemoryStorageDriver();
  SaveManager.save('commerce_save', sim, storage);

  // Restore into a fresh simulation
  const loadedSim = new WorldSimulation({ seed: 999 });
  SaveManager.load('commerce_save', loadedSim, storage);

  // Verify player wallet
  const loadedWallet = loadedSim.ecs.getComponent<WalletComponent>(loadedSim.playerEntityId, 'Wallet')!;
  assert.ok(loadedWallet);
  assert.equal(loadedWallet.gold, 345, 'Gold balance must be preserved across save/load');

  // Verify shipping bin
  assert.equal(loadedSim.shippingBinEntityId, shippingBinEntityId);
  const loadedBin = loadedSim.ecs.getComponent<ShippingBinComponent>(loadedSim.shippingBinEntityId, 'ShippingBin')!;
  assert.ok(loadedBin);
  assert.deepEqual(loadedBin.items, [
    { itemId: 'crop_parsnip', quantity: 7 },
    { itemId: 'crop_potato', quantity: 3 }
  ]);

  // Verify seed catalog
  assert.equal(loadedSim.seedCatalogEntityId, seedCatalogEntityId);
  const loadedCatalog = loadedSim.ecs.getComponent<SeedCatalogComponent>(loadedSim.seedCatalogEntityId, 'SeedCatalog')!;
  assert.ok(loadedCatalog);
  assert.equal(loadedCatalog.catalogId, 'farmstead_seed_catalog');

  // Invariants pass
  loadedSim.assertInvariants();
});

test('CommerceMigration: Deterministic migration of older save lacking wallet, shipping bin, and catalog', () => {
  // 1. Construct a simulation representing a Phase 1B-2 legacy save
  const legacySim = new WorldSimulation({ seed: 731 });
  const bedId = legacySim.spawnBed(12, 12);
  const playerId = legacySim.spawnPlayer(16, 16);

  // Artificially remove WalletComponent from player to simulate Phase 1B-2 save
  legacySim.ecs.removeComponent(playerId, 'Wallet');
  assert.equal(legacySim.ecs.hasComponent(playerId, 'Wallet'), false);

  // Set specific player energy and inventory state
  const energy = legacySim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  energy.current = 67;

  const inv = legacySim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  addItem(inv, 'crop_parsnip', 5);

  // Plant a crop on tile (10, 10)
  legacySim.chunks.setTile(10, 10, {
    terrainType: 2,
    flags: 1 | 4, // Walkable | Tilled
    moisture: 75,
    fertility: 50,
    cropTypeId: 1, // Parsnip
    cropStage: 2,  // Growing
    cropProgress: 50,
    growthDays: 1,
    matureDays: 0,
    dryDays: 0
  });

  // Extract raw snapshot and delete commerce fields to simulate legacy format
  const rawSnapshot = legacySim.getSnapshot() as any;
  delete rawSnapshot.shippingBinEntityId;
  delete rawSnapshot.seedCatalogEntityId;

  // Save the legacy snapshot to storage
  const storage = new MemoryStorageDriver();
  const rawSnapshotStr = JSON.stringify(rawSnapshot);
  const checksum = SaveManager.computeChecksum(rawSnapshotStr);
  const legacyFileContent = {
    metadata: {
      saveVersion: 1,
      gameVersion: '0.1.0',
      savedAtTimestamp: Date.now(),
      checksum
    },
    snapshot: rawSnapshot
  };
  storage.save('legacy_slot', JSON.stringify(legacyFileContent));

  // 2. Load the legacy snapshot into a fresh WorldSimulation
  const migratedSim = new WorldSimulation({ seed: 888 });
  SaveManager.load('legacy_slot', migratedSim, storage);

  // 3. Verify deterministic migration:
  // - Player wallet migrated to starting 100g
  const migratedWallet = migratedSim.ecs.getComponent<WalletComponent>(migratedSim.playerEntityId, 'Wallet');
  assert.ok(migratedWallet, 'Migrated player must have WalletComponent');
  assert.equal(migratedWallet.gold, 100, 'Migrated player wallet must be initialized to 100g');

  // - Shipping bin automatically spawned at (14, 12)
  assert.ok(migratedSim.shippingBinEntityId > 0, 'Shipping bin entity must be restored/spawned');
  const binPos = migratedSim.ecs.getComponent<PositionComponent>(migratedSim.shippingBinEntityId, 'Position')!;
  assert.equal(binPos.x, 14.5);
  assert.equal(binPos.y, 12.5);
  const binComp = migratedSim.ecs.getComponent<ShippingBinComponent>(migratedSim.shippingBinEntityId, 'ShippingBin')!;
  assert.ok(binComp);
  assert.deepEqual(binComp.items, []);

  // - Seed catalog automatically spawned at (15, 12)
  assert.ok(migratedSim.seedCatalogEntityId > 0, 'Seed catalog entity must be restored/spawned');
  const catPos = migratedSim.ecs.getComponent<PositionComponent>(migratedSim.seedCatalogEntityId, 'Position')!;
  assert.equal(catPos.x, 15.5);
  assert.equal(catPos.y, 12.5);
  const catComp = migratedSim.ecs.getComponent<SeedCatalogComponent>(migratedSim.seedCatalogEntityId, 'SeedCatalog')!;
  assert.ok(catComp);
  assert.equal(catComp.catalogId, 'farmstead_seed_catalog');

  // - Existing player energy and inventory preserved with 100% fidelity
  const migratedEnergy = migratedSim.ecs.getComponent<EnergyComponent>(migratedSim.playerEntityId, 'Energy')!;
  assert.equal(migratedEnergy.current, 67, 'Player energy must be preserved');

  const migratedInv = migratedSim.ecs.getComponent<InventoryComponent>(migratedSim.playerEntityId, 'Inventory')!;
  const parsnipCrop = getFirstItem(migratedInv, 'crop_parsnip');
  assert.ok(parsnipCrop);
  assert.equal(parsnipCrop.quantity, 5, 'Player inventory crops must be preserved');

  // - Farming state on tile (10, 10) preserved
  const tile = migratedSim.chunks.getTile(10, 10)!;
  assert.equal(tile.cropTypeId, 1);
  assert.equal(tile.cropStage, 2);
  assert.equal(tile.moisture, 75);

  // Invariants pass on migrated simulation
  migratedSim.assertInvariants();
});

test('CommerceMigration: Legacy save with shipping bin only spawns missing catalog without duplicating bin', () => {
  const baseSim = new WorldSimulation({ seed: 732 });
  baseSim.spawnBed(12, 12);
  baseSim.spawnPlayer(16, 16);
  const binId = baseSim.spawnShippingBin(14, 12);

  const rawSnapshot = baseSim.getSnapshot() as any;
  delete rawSnapshot.seedCatalogEntityId; // Simulate save where catalog field is missing

  const storage = new MemoryStorageDriver();
  const rawSnapshotStr = JSON.stringify(rawSnapshot);
  storage.save('bin_only_slot', JSON.stringify({
    metadata: { saveVersion: 1, gameVersion: '0.1.0', savedAtTimestamp: Date.now(), checksum: SaveManager.computeChecksum(rawSnapshotStr) },
    snapshot: rawSnapshot
  }));

  const loadedSim = new WorldSimulation({ seed: 889 });
  SaveManager.load('bin_only_slot', loadedSim, storage);

  // Exactly one bin and exactly one catalog
  assert.equal(loadedSim.ecs.queryEntities(['ShippingBin']).length, 1, 'Must have exactly 1 shipping bin');
  assert.equal(loadedSim.ecs.queryEntities(['SeedCatalog']).length, 1, 'Must have exactly 1 seed catalog');
  assert.equal(loadedSim.shippingBinEntityId, binId, 'Must preserve existing shipping bin entity');
  assert.ok(loadedSim.seedCatalogEntityId > 0, 'Must spawn missing seed catalog');

  loadedSim.assertInvariants();
});

test('CommerceMigration: Legacy save with catalog only spawns missing bin without duplicating catalog', () => {
  const baseSim = new WorldSimulation({ seed: 733 });
  baseSim.spawnBed(12, 12);
  baseSim.spawnPlayer(16, 16);
  const catId = baseSim.spawnSeedCatalog(15, 12);

  const rawSnapshot = baseSim.getSnapshot() as any;
  delete rawSnapshot.shippingBinEntityId; // Simulate save where bin field is missing

  const storage = new MemoryStorageDriver();
  const rawSnapshotStr = JSON.stringify(rawSnapshot);
  storage.save('cat_only_slot', JSON.stringify({
    metadata: { saveVersion: 1, gameVersion: '0.1.0', savedAtTimestamp: Date.now(), checksum: SaveManager.computeChecksum(rawSnapshotStr) },
    snapshot: rawSnapshot
  }));

  const loadedSim = new WorldSimulation({ seed: 890 });
  SaveManager.load('cat_only_slot', loadedSim, storage);

  assert.equal(loadedSim.ecs.queryEntities(['ShippingBin']).length, 1, 'Must have exactly 1 shipping bin');
  assert.equal(loadedSim.ecs.queryEntities(['SeedCatalog']).length, 1, 'Must have exactly 1 seed catalog');
  assert.equal(loadedSim.seedCatalogEntityId, catId, 'Must preserve existing seed catalog entity');
  assert.ok(loadedSim.shippingBinEntityId > 0, 'Must spawn missing shipping bin');

  loadedSim.assertInvariants();
});

test('CommerceMigration: Save with both commerce entities already present preserves both without creating duplicates', () => {
  const baseSim = new WorldSimulation({ seed: 734 });
  FarmsteadLayout.initialize(baseSim);
  const initialEntityCount = baseSim.ecs.activeEntityCount; // 4

  const storage = new MemoryStorageDriver();
  SaveManager.save('both_present_slot', baseSim, storage);

  const loadedSim = new WorldSimulation({ seed: 891 });
  SaveManager.load('both_present_slot', loadedSim, storage);

  assert.equal(loadedSim.ecs.activeEntityCount, initialEntityCount, 'Active entity count must not grow');
  assert.equal(loadedSim.ecs.queryEntities(['ShippingBin']).length, 1);
  assert.equal(loadedSim.ecs.queryEntities(['SeedCatalog']).length, 1);
  assert.equal(loadedSim.shippingBinEntityId, baseSim.shippingBinEntityId);
  assert.equal(loadedSim.seedCatalogEntityId, baseSim.seedCatalogEntityId);

  loadedSim.assertInvariants();
});

test('CommerceMigration: Wallet present with valid saved balance is preserved intact during migration', () => {
  const baseSim = new WorldSimulation({ seed: 735 });
  const { playerEntityId } = FarmsteadLayout.initialize(baseSim);

  const wallet = baseSim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  wallet.gold = 780; // Custom balance

  // Snapshot with deleted catalog field to trigger partial migration
  const rawSnapshot = baseSim.getSnapshot() as any;
  delete rawSnapshot.seedCatalogEntityId;

  const storage = new MemoryStorageDriver();
  const rawSnapshotStr = JSON.stringify(rawSnapshot);
  storage.save('custom_gold_slot', JSON.stringify({
    metadata: { saveVersion: 1, gameVersion: '0.1.0', savedAtTimestamp: Date.now(), checksum: SaveManager.computeChecksum(rawSnapshotStr) },
    snapshot: rawSnapshot
  }));

  const loadedSim = new WorldSimulation({ seed: 892 });
  SaveManager.load('custom_gold_slot', loadedSim, storage);

  const loadedWallet = loadedSim.ecs.getComponent<WalletComponent>(loadedSim.playerEntityId, 'Wallet')!;
  assert.equal(loadedWallet.gold, 780, 'Custom gold balance must NOT be overwritten by starting gold migration');
  assert.equal(loadedSim.ecs.queryEntities(['SeedCatalog']).length, 1, 'Missing catalog must be spawned');

  loadedSim.assertInvariants();
});
