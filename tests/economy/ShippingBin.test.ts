import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { InventoryComponent, addItem, hasItem } from '../../src/ecs/components/InventoryComponent.js';
import { ShippingBinComponent } from '../../src/ecs/components/ShippingBinComponent.js';
import { WalletComponent } from '../../src/ecs/components/WalletComponent.js';
import { calculateNextDawnTick } from '../../src/player/PlayerConfig.js';
import { TERRAIN_TYPES, TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';

test('ShippingBin: Valid SHIP_ITEM deposits harvested produce into bin without immediate gold settlement', () => {
  const sim = new WorldSimulation({ seed: 710 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  // Position player next to shipping bin (14.5, 12.5) -> player at (14.5, 13.0), dist = 0.5 <= 1.5
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.5;
  playerPos.y = 13.0;

  // Add 3 harvested parsnips to player inventory
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  addItem(inv, 'crop_parsnip', 3);
  assert.ok(hasItem(inv, 'crop_parsnip', 3));

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const initialGold = wallet.gold;

  // Enqueue SHIP_ITEM command for 2 parsnips
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_parsnip',
    quantity: 2
  });
  sim.step();

  // Validate command result
  assert.equal(sim.lastCommandResult?.success, true);

  // Inventory should now have 1 parsnip remaining
  assert.equal(hasItem(inv, 'crop_parsnip', 1), true);
  assert.equal(hasItem(inv, 'crop_parsnip', 2), false);

  // Bin should contain 2 parsnips
  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  assert.equal(bin.items.length, 1);
  assert.equal(bin.items[0]?.itemId, 'crop_parsnip');
  assert.equal(bin.items[0]?.quantity, 2);

  // Gold must NOT mutate immediately (overnight settlement only)
  assert.equal(wallet.gold, initialGold, 'Shipping must not immediately grant gold');
});

test('ShippingBin: Non-shippable items (tools, seeds, invalid) are rejected with ZERO mutation', () => {
  const sim = new WorldSimulation({ seed: 711 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.5;
  playerPos.y = 13.0;

  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;

  const initialInvSlots = JSON.stringify(inv.slots);
  const initialBinItems = JSON.stringify(bin.items);

  // Attempt to ship Hoe
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'tool_hoe',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Item cannot be shipped');

  // Attempt to ship Parsnip Seeds
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'seed_parsnip',
    quantity: 5
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Item cannot be shipped');

  // Attempt to ship Watering Can
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'tool_watering_can',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);

  // Attempt to ship arbitrary item
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'diamond_sword',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);

  // Verify ZERO state mutation
  assert.equal(JSON.stringify(inv.slots), initialInvSlots);
  assert.equal(JSON.stringify(bin.items), initialBinItems);
});

test('ShippingBin: Insufficient quantity or non-positive quantity rejected with ZERO mutation', () => {
  const sim = new WorldSimulation({ seed: 712 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.5;
  playerPos.y = 13.0;

  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  addItem(inv, 'crop_potato', 2);

  const initialInvSlots = JSON.stringify(inv.slots);
  const initialBinItems = JSON.stringify(bin.items);

  // Requesting 5 when only 2 exist
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_potato',
    quantity: 5
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Not enough items in inventory');

  // Requesting 0 quantity
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_potato',
    quantity: 0
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);

  // Requesting negative quantity
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_potato',
    quantity: -1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);

  // Requesting fractional quantity
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_potato',
    quantity: 1.5
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);

  // Requesting NaN quantity
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_potato',
    quantity: NaN
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);

  // Verify ZERO state mutation
  assert.equal(JSON.stringify(inv.slots), initialInvSlots);
  assert.equal(JSON.stringify(bin.items), initialBinItems);
});

test('ShippingBin: Out-of-reach shipping bin command rejected with ZERO mutation', () => {
  const sim = new WorldSimulation({ seed: 713 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  // Player at default spawn (16.5, 16.5) is ~4.47 tiles away from bin at (14.5, 12.5) > 1.5 tiles
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  addItem(inv, 'crop_parsnip', 3);

  const initialInvSlots = JSON.stringify(inv.slots);

  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_parsnip',
    quantity: 1
  });
  sim.step();

  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Too far from shipping bin');
  assert.equal(JSON.stringify(inv.slots), initialInvSlots);
});

test('ShippingBin: Multiple items ship and accumulate deterministically', () => {
  const sim = new WorldSimulation({ seed: 714 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.5;
  playerPos.y = 13.0;

  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  addItem(inv, 'crop_parsnip', 4);
  addItem(inv, 'crop_potato', 2);
  addItem(inv, 'crop_cauliflower', 1);

  // Ship 2 parsnips
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, { targetEntityId: shippingBinEntityId, itemId: 'crop_parsnip', quantity: 2 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);

  // Ship 2 more parsnips (should stack in bin)
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, { targetEntityId: shippingBinEntityId, itemId: 'crop_parsnip', quantity: 2 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);

  // Ship 2 potatoes
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, { targetEntityId: shippingBinEntityId, itemId: 'crop_potato', quantity: 2 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);

  // Ship 1 cauliflower
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, { targetEntityId: shippingBinEntityId, itemId: 'crop_cauliflower', quantity: 1 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);

  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  assert.equal(bin.items.length, 3);
  assert.deepEqual(bin.items, [
    { itemId: 'crop_parsnip', quantity: 4 },
    { itemId: 'crop_potato', quantity: 2 },
    { itemId: 'crop_cauliflower', quantity: 1 }
  ]);
});

test('Settlement: Overnight shipping settlement executes at dawn with fixed prices and clears bin', () => {
  const sim = new WorldSimulation({ seed: 715 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  assert.equal(wallet.gold, 100);

  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  // Deposit 2 Parsnips (35g each = 70g), 1 Potato (80g each = 80g), 1 Cauliflower (175g each = 175g)
  // Expected total revenue = 70 + 80 + 175 = 325g
  // Expected final gold = 100 + 325 = 425g
  bin.items.push(
    { itemId: 'crop_parsnip', quantity: 2 },
    { itemId: 'crop_potato', quantity: 1 },
    { itemId: 'crop_cauliflower', quantity: 1 }
  );

  // Advance simulation to next dawn
  const nextDawnTick = calculateNextDawnTick(sim.clock.currentTick);
  sim.advanceSimulationTo(nextDawnTick);

  // Settlement should have executed
  assert.equal(bin.items.length, 0, 'Shipping bin must be cleared after overnight settlement');
  assert.equal(wallet.gold, 425, 'Player wallet must receive exact approved revenue: 100 + 325 = 425g');
  sim.assertInvariants();
});

test('Settlement: Deterministic settlement across independent simulations', () => {
  const simA = new WorldSimulation({ seed: 716 });
  const simB = new WorldSimulation({ seed: 716 });

  const resA = FarmsteadLayout.initialize(simA);
  const resB = FarmsteadLayout.initialize(simB);

  const binA = simA.ecs.getComponent<ShippingBinComponent>(resA.shippingBinEntityId, 'ShippingBin')!;
  const binB = simB.ecs.getComponent<ShippingBinComponent>(resB.shippingBinEntityId, 'ShippingBin')!;

  binA.items.push({ itemId: 'crop_parsnip', quantity: 5 }, { itemId: 'crop_potato', quantity: 3 });
  binB.items.push({ itemId: 'crop_parsnip', quantity: 5 }, { itemId: 'crop_potato', quantity: 3 });

  const targetDawn = calculateNextDawnTick(simA.clock.currentTick);
  simA.advanceSimulationTo(targetDawn);
  simB.advanceSimulationTo(targetDawn);

  const walletA = simA.ecs.getComponent<WalletComponent>(resA.playerEntityId, 'Wallet')!;
  const walletB = simB.ecs.getComponent<WalletComponent>(resB.playerEntityId, 'Wallet')!;

  assert.equal(walletA.gold, walletB.gold);
  assert.equal(walletA.gold, 100 + (5 * 35) + (3 * 80)); // 100 + 175 + 240 = 515g
});

test('Settlement: Save/load immediately before and after dawn settlement does not cause duplicate credits and preserves crop growth', () => {
  const sim = new WorldSimulation({ seed: 717 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  bin.items.push({ itemId: 'crop_potato', quantity: 2 }); // 2 * 80 = 160g

  // Plant a crop at (10, 10) ready to grow across dawn
  sim.chunks.setTile(10, 10, {
    terrainType: TERRAIN_TYPES.TILLED_SOIL,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    moisture: 80,
    fertility: 50,
    cropTypeId: 1, // Parsnip (stage 0 needs 1 day to reach stage 1)
    cropStage: 0,
    cropProgress: 0,
    growthDays: 0,
    matureDays: 0,
    dryDays: 0
  });

  const storage = new MemoryStorageDriver();

  // 1. Advance to 1 tick BEFORE dawn, save
  const dawnTick = calculateNextDawnTick(sim.clock.currentTick);
  sim.advanceSimulationTo(dawnTick - 1);
  assert.equal(sim.chunks.getTile(10, 10)!.cropStage, 0, 'Crop must remain stage 0 prior to dawn');
  SaveManager.save('pre_dawn', sim, storage);

  // Load pre-dawn into fresh sim, verify state before crossing dawn
  const loadedPreDawn = new WorldSimulation({ seed: 101 });
  SaveManager.load('pre_dawn', loadedPreDawn, storage);
  assert.equal(loadedPreDawn.chunks.getTile(10, 10)!.cropStage, 0, 'Loaded pre-dawn crop must be stage 0');

  // Cross dawn boundary
  loadedPreDawn.advanceSimulationTo(dawnTick);

  // Verify settlement occurred exactly once
  const wallet1 = loadedPreDawn.ecs.getComponent<WalletComponent>(loadedPreDawn.playerEntityId, 'Wallet')!;
  assert.equal(wallet1.gold, 260, '100 + 160 = 260g after settlement');
  const bin1 = loadedPreDawn.ecs.getComponent<ShippingBinComponent>(loadedPreDawn.shippingBinEntityId, 'ShippingBin')!;
  assert.equal(bin1.items.length, 0, 'Bin must be cleared');

  // Verify crop growth occurred at dawn
  const cropTileAfterDawn = loadedPreDawn.chunks.getTile(10, 10)!;
  assert.equal(cropTileAfterDawn.cropStage, 1, 'Crop must advance from stage 0 to stage 1 at dawn');

  // 2. Save immediately AFTER settlement & dawn processing
  SaveManager.save('post_dawn', loadedPreDawn, storage);

  // Load post-dawn into fresh sim, step 10 more ticks (settlement must not re-run)
  const loadedPostDawn = new WorldSimulation({ seed: 102 });
  SaveManager.load('post_dawn', loadedPostDawn, storage);
  loadedPostDawn.stepMany(10);

  // Verify no duplicate credit and crop stage remains advanced
  const wallet2 = loadedPostDawn.ecs.getComponent<WalletComponent>(loadedPostDawn.playerEntityId, 'Wallet')!;
  assert.equal(wallet2.gold, 260, 'Gold must remain exactly 260g without duplicate credits');
  const bin2 = loadedPostDawn.ecs.getComponent<ShippingBinComponent>(loadedPostDawn.shippingBinEntityId, 'ShippingBin')!;
  assert.equal(bin2.items.length, 0, 'Bin remains cleared');
  assert.equal(loadedPostDawn.chunks.getTile(10, 10)!.cropStage, 1, 'Crop stage must remain 1 without regression');
});

test('Settlement: Dawn sequence executes in strict order: evaporation -> settlement -> crop growth -> result expiration', () => {
  const sim = new WorldSimulation({ seed: 718 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const executionLog: string[] = [];

  // Intercept events to verify order
  const origEmit = sim.events.emit.bind(sim.events);
  sim.events.emit = (tick: number, type: string, data: any) => {
    if (type === 'SHIPPING_SETTLED' || type === 'CROP_ADVANCED' || type === 'CROP_MATURED') {
      executionLog.push(type);
    }
    return origEmit(tick, type, data);
  };

  // Plant a crop at (10, 10) ready to advance stage
  sim.chunks.setTile(10, 10, {
    terrainType: 2,
    flags: 1 | 4,
    moisture: 80,
    fertility: 50,
    cropTypeId: 1, // Parsnip (stage 0 needs 1 day to reach stage 1)
    cropStage: 0,
    cropProgress: 0,
    growthDays: 0,
    matureDays: 0,
    dryDays: 0
  });

  // Deposit 1 Parsnip crop into shipping bin
  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  bin.items.push({ itemId: 'crop_parsnip', quantity: 1 });

  // Advance to dawn
  const dawnTick = calculateNextDawnTick(sim.clock.currentTick);
  sim.advanceSimulationTo(dawnTick);

  // Verify execution order: SHIPPING_SETTLED must precede CROP_ADVANCED
  assert.equal(executionLog[0], 'SHIPPING_SETTLED', 'Shipping settlement must execute BEFORE crop dawn growth');
  assert.equal(executionLog[1], 'CROP_ADVANCED', 'Crop dawn growth must execute after shipping settlement');
});

test('Snapshot Purity: getRenderSnapshot() is purely observational and does not mutate simulation state', () => {
  const sim = new WorldSimulation({ seed: 719 });
  FarmsteadLayout.initialize(sim);

  const initialTick = sim.clock.currentTick;
  const initialRngState = sim.rng.getState();
  const initialEcsSnapshot = JSON.stringify(sim.ecs.getSnapshot());

  // Call getRenderSnapshot() multiple times
  const snap1 = sim.getRenderSnapshot();
  const snap2 = sim.getRenderSnapshot();
  const snap3 = sim.getRenderSnapshot(0.5);

  // Verify snapshots are identical in data
  assert.equal(snap1.tick, initialTick);
  assert.equal(snap1.player?.wallet.gold, 100);
  assert.deepEqual(snap1.player, snap2.player);
  assert.deepEqual(snap1.chunks, snap2.chunks);

  // Verify simulation state has not changed at all
  assert.equal(sim.clock.currentTick, initialTick);
  assert.deepEqual(sim.rng.getState(), initialRngState);
  assert.equal(JSON.stringify(sim.ecs.getSnapshot()), initialEcsSnapshot);
});
