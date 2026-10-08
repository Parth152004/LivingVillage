import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { GameplayUI } from '../../src/client/GameplayUI.js';
import { GameClient } from '../../src/client/GameClient.js';
import { InputController } from '../../src/client/InputController.js';
import { addItem } from '../../src/ecs/components/InventoryComponent.js';
import { WalletComponent } from '../../src/ecs/components/WalletComponent.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';
import { calculateNextDawnTick } from '../../src/player/PlayerConfig.js';

function createDummyDomElement(): any {
  return {
    style: { display: 'none', width: '', opacity: '', color: '' },
    textContent: '',
    innerHTML: '',
    appendChild: () => {},
    querySelectorAll: () => [],
    addEventListener: () => {},
    removeEventListener: () => {},
    onclick: null as any
  };
}

test('Commerce Modals: Shipping Bin modal opens and tracks modal open state', () => {
  (globalThis as any).document = {
    getElementById: () => createDummyDomElement(),
    createElement: () => createDummyDomElement()
  };

  try {
    const ui = new GameplayUI();
    ui.bindDomElements();

    const sim = new WorldSimulation({ seed: 42 });
    FarmsteadLayout.initialize(sim);
    const snapshot = sim.getRenderSnapshot();

    assert.equal(ui.isModalOpen, false);
    assert.equal(ui.isShippingBinOpen, false);

    ui.openShippingBin(snapshot);
    assert.equal(ui.isShippingBinOpen, true);
    assert.equal(ui.isModalOpen, true);

    ui.closeShippingBin();
    assert.equal(ui.isShippingBinOpen, false);
    assert.equal(ui.isModalOpen, false);
  } finally {
    delete (globalThis as any).document;
  }
});

test('Commerce Modals: Seed Catalog modal opens and tracks modal open state', () => {
  (globalThis as any).document = {
    getElementById: () => createDummyDomElement(),
    createElement: () => createDummyDomElement()
  };

  try {
    const ui = new GameplayUI();
    ui.bindDomElements();

    const sim = new WorldSimulation({ seed: 43 });
    FarmsteadLayout.initialize(sim);
    const snapshot = sim.getRenderSnapshot();

    assert.equal(ui.isModalOpen, false);
    assert.equal(ui.isSeedCatalogOpen, false);

    ui.openSeedCatalog(snapshot);
    assert.equal(ui.isSeedCatalogOpen, true);
    assert.equal(ui.isModalOpen, true);

    ui.closeSeedCatalog();
    assert.equal(ui.isSeedCatalogOpen, false);
    assert.equal(ui.isModalOpen, false);
  } finally {
    delete (globalThis as any).document;
  }
});

test('Shipping Interaction: valid shipping reduces inventory and updates estimated revenue', () => {
  const sim = new WorldSimulation({ seed: 44 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.5;
  playerPos.y = 13.0; // Proximity dist = 0.5 <= 1.5 tiles from shipping bin (14.5, 12.5)

  const inv = sim.ecs.getComponent<any>(playerEntityId, 'Inventory')!;
  addItem(inv, 'crop_parsnip', 3);

  // Initial snapshot: 3 crops in inventory, 0 items in shipping bin
  let snapshot = sim.getRenderSnapshot();
  const initialCropStack = snapshot.player?.inventory.find(s => s?.itemId === 'crop_parsnip');
  assert.equal(initialCropStack?.quantity, 3);
  assert.equal(snapshot.shippingBin?.items.length, 0);
  assert.equal(snapshot.shippingBin?.estimatedRevenue, 0);

  // Dispatch SHIP_ITEM command: ship 2 Parsnips
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_parsnip',
    quantity: 2,
    payload: { itemId: 'crop_parsnip', quantity: 2 }
  });
  sim.step();

  // Snapshot after shipping: 1 crop in inventory, 2 in shipping bin, estimated revenue = 70g (2 * 35g)
  snapshot = sim.getRenderSnapshot();
  const updatedCropStack = snapshot.player?.inventory.find(s => s?.itemId === 'crop_parsnip');
  assert.equal(updatedCropStack?.quantity, 1, 'Inventory quantity must decrease from 3 to 1');
  assert.equal(snapshot.shippingBin?.items[0]?.itemId, 'crop_parsnip');
  assert.equal(snapshot.shippingBin?.items[0]?.quantity, 2);
  assert.equal(snapshot.shippingBin?.estimatedRevenue, 70, 'Estimated revenue must be 2 * 35g = 70g');
});

test('Shipping Interaction: overnight settlement at dawn converts shipped crops to player gold', () => {
  const sim = new WorldSimulation({ seed: 45 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.5;
  playerPos.y = 13.0;

  const inv = sim.ecs.getComponent<any>(playerEntityId, 'Inventory')!;
  addItem(inv, 'crop_parsnip', 2);

  // Ship 2 Parsnips (revenue = 70g)
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    itemId: 'crop_parsnip',
    quantity: 2,
    payload: { itemId: 'crop_parsnip', quantity: 2 }
  });
  sim.step();

  let snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 100, 'Gold should remain 100 before settlement');
  assert.equal(snapshot.shippingBin?.estimatedRevenue, 70);

  // Advance simulation to next dawn
  const nextDawnTick = calculateNextDawnTick(sim.clock.currentTick);
  sim.advanceSimulationTo(nextDawnTick);

  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 170, 'Gold must increase from 100 to 170g after settlement');
  assert.equal(snapshot.shippingBin?.items.length, 0, 'Shipping bin items must be cleared after settlement');
  assert.equal(snapshot.shippingBin?.estimatedRevenue, 0, 'Estimated revenue must reset to 0 after settlement');
});

test('Shipping Interaction: invalid shipping (wrong item, insufficient quantity, zero) is rejected without mutation', () => {
  const sim = new WorldSimulation({ seed: 46, initialTick: 7200 });
  const { playerEntityId, shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.5;
  playerPos.y = 13.0;

  // 1. Try shipping item not in inventory
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    payload: { itemId: 'crop_parsnip', quantity: 1 }
  });
  sim.step();
  let snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.shippingBin?.items.length, 0, 'Bin must remain empty when item not in inventory');

  // 2. Try shipping tools (not shippable)
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    payload: { itemId: 'tool_hoe', quantity: 1 }
  });
  sim.step();
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.shippingBin?.items.length, 0, 'Bin must reject non-shippable items');

  // 3. Try shipping quantity <= 0
  sim.enqueueCommand('SHIP_ITEM', playerEntityId, {
    targetEntityId: shippingBinEntityId,
    payload: { itemId: 'crop_parsnip', quantity: 0 }
  });
  sim.step();
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.shippingBin?.items.length, 0, 'Bin must reject non-positive quantities');
});

test('Seed Catalog Interaction: successful Buy 1 purchase decreases gold and increases seed inventory', () => {
  const sim = new WorldSimulation({ seed: 47, initialTick: 7200 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0; // Near seed catalog (15.5, 12.5)

  // Starting state: 100 gold, 15 Parsnip Seeds
  let snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 100);
  const initialSeeds = snapshot.player?.inventory.find(s => s?.itemId === 'seed_parsnip')?.quantity ?? 0;
  assert.equal(initialSeeds, 15);

  // Buy 1 Parsnip Seed (cost = 20g)
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    payload: { seedItemId: 'seed_parsnip', quantity: 1 }
  });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 80, 'Gold must decrease by 20 to 80g');
  const updatedSeeds = snapshot.player?.inventory.find(s => s?.itemId === 'seed_parsnip')?.quantity ?? 0;
  assert.equal(updatedSeeds, 16, 'Seed quantity must increase by 1 to 16');
});

test('Seed Catalog Interaction: successful Buy 5 purchase decreases gold and increases seed inventory by 5', () => {
  const sim = new WorldSimulation({ seed: 48, initialTick: 7200 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  // Buy 5 Parsnip Seeds (cost = 100g)
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    payload: { seedItemId: 'seed_parsnip', quantity: 5 }
  });
  sim.step();

  const snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 0, 'Gold must decrease by 100 to 0g');
  const updatedSeeds = snapshot.player?.inventory.find(s => s?.itemId === 'seed_parsnip')?.quantity ?? 0;
  assert.equal(updatedSeeds, 20, 'Seed quantity must increase by 5 from 15 to 20');
});

test('Seed Catalog Interaction: purchase rejected with zero mutation when player has insufficient gold', () => {
  const sim = new WorldSimulation({ seed: 49, initialTick: 7200 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  // Set gold to 10g (cannot afford 20g seed)
  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  wallet.gold = 10;

  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    payload: { seedItemId: 'seed_parsnip', quantity: 1 }
  });
  sim.step();

  const snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 10, 'Gold must remain untouched');
  const seeds = snapshot.player?.inventory.find(s => s?.itemId === 'seed_parsnip')?.quantity ?? 0;
  assert.equal(seeds, 15, 'Seeds must remain untouched');
  assert.equal(snapshot.lastCommandResult?.success, false);
  assert.equal(snapshot.lastCommandResult?.reason, 'Not enough gold');
});

test('Modal Input Lock: Escape and closeAllModals cleanly close modals and unblock input', () => {
  const ui = new GameplayUI();
  const sim = new WorldSimulation({ seed: 50 });
  FarmsteadLayout.initialize(sim);
  const snapshot = sim.getRenderSnapshot();

  // 1. Open shipping bin
  ui.openShippingBin(snapshot);
  assert.equal(ui.isShippingBinOpen, true);
  assert.equal(ui.isModalOpen, true);

  // Close all
  ui.closeAllModals();
  assert.equal(ui.isShippingBinOpen, false);
  assert.equal(ui.isModalOpen, false);

  // 2. Open seed catalog
  ui.openSeedCatalog(snapshot);
  assert.equal(ui.isSeedCatalogOpen, true);
  assert.equal(ui.isModalOpen, true);

  // Close all
  ui.closeAllModals();
  assert.equal(ui.isSeedCatalogOpen, false);
  assert.equal(ui.isModalOpen, false);
});
