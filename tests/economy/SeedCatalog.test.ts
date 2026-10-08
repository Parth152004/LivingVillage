import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { InventoryComponent, hasItem, getItemCount } from '../../src/ecs/components/InventoryComponent.js';
import { WalletComponent } from '../../src/ecs/components/WalletComponent.js';

test('SeedCatalog: Buy 1 seed works atomically for Parsnip, Potato, and Cauliflower', () => {
  const sim = new WorldSimulation({ seed: 720 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  // Position player next to Seed Catalog (15.5, 12.5) -> player at (15.5, 13.0), dist = 0.5 <= 1.5
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;

  // Give player ample gold (500g) for comprehensive purchase tests
  wallet.gold = 500;

  // 1. Buy 1 Parsnip Seed (20g)
  const initialParsnipCount = getItemCount(inv, 'seed_parsnip');
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_parsnip',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 480);
  assert.equal(getItemCount(inv, 'seed_parsnip'), initialParsnipCount + 1);

  // 2. Buy 1 Potato Seed (50g)
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_potato',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 430);
  assert.equal(getItemCount(inv, 'seed_potato'), 1);

  // 3. Buy 1 Cauliflower Seed (80g)
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_cauliflower',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 350);
  assert.equal(getItemCount(inv, 'seed_cauliflower'), 1);

  sim.assertInvariants();
});

test('SeedCatalog: Buy 5 seeds works atomically for supported quantity 5', () => {
  const sim = new WorldSimulation({ seed: 721 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  wallet.gold = 500;

  // Buy 5 Potato Seeds (5 * 50 = 250g)
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_potato',
    quantity: 5
  });
  sim.step();

  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 250);
  assert.equal(getItemCount(inv, 'seed_potato'), 5);

  sim.assertInvariants();
});

test('SeedCatalog: Exact-fit gold purchase reduces gold to exactly 0', () => {
  const sim = new WorldSimulation({ seed: 722 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;

  // Starting gold is exactly 100g. 5 Parsnips = 5 * 20g = 100g.
  assert.equal(wallet.gold, 100);
  const initialParsnipCount = getItemCount(inv, 'seed_parsnip');

  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_parsnip',
    quantity: 5
  });
  sim.step();

  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 0, 'Exact-fit purchase should leave exactly 0g');
  assert.equal(getItemCount(inv, 'seed_parsnip'), initialParsnipCount + 5);
  sim.assertInvariants();
});

test('SeedCatalog: Insufficient gold rejects purchase with ZERO state mutation', () => {
  const sim = new WorldSimulation({ seed: 723 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;

  // Set gold to 30g (cannot afford Potato seed at 50g, nor 5 Parsnip at 100g)
  wallet.gold = 30;
  const initialSlots = JSON.stringify(inv.slots);

  // Attempt Potato (50g) with 30g
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_potato',
    quantity: 1
  });
  sim.step();

  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Not enough gold');
  assert.equal(wallet.gold, 30, 'Gold must NOT mutate');
  assert.equal(JSON.stringify(inv.slots), initialSlots, 'Inventory must NOT mutate');

  // Attempt 5 Parsnips (100g) with 30g
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_parsnip',
    quantity: 5
  });
  sim.step();

  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(wallet.gold, 30);
  assert.equal(JSON.stringify(inv.slots), initialSlots);
});

test('SeedCatalog: Insufficient inventory capacity rejects purchase with ZERO state mutation', () => {
  const sim = new WorldSimulation({ seed: 724 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;

  // Fill all 10 slots with non-stackable tool dummy items
  inv.slots = [
    { itemId: 'tool_dummy_1', quantity: 1 },
    { itemId: 'tool_dummy_2', quantity: 1 },
    { itemId: 'tool_dummy_3', quantity: 1 },
    { itemId: 'tool_dummy_4', quantity: 1 },
    { itemId: 'tool_dummy_5', quantity: 1 },
    { itemId: 'tool_dummy_6', quantity: 1 },
    { itemId: 'tool_dummy_7', quantity: 1 },
    { itemId: 'tool_dummy_8', quantity: 1 },
    { itemId: 'tool_dummy_9', quantity: 1 },
    { itemId: 'tool_dummy_10', quantity: 1 }
  ];

  const initialGold = wallet.gold;
  const initialSlots = JSON.stringify(inv.slots);

  // Attempt to buy 1 Potato Seed
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_potato',
    quantity: 1
  });
  sim.step();

  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Inventory full');
  assert.equal(wallet.gold, initialGold, 'Gold must NOT mutate on full inventory');
  assert.equal(JSON.stringify(inv.slots), initialSlots, 'Inventory must NOT mutate');
});

test('SeedCatalog: Invalid quantity, invalid crop, or out-of-reach rejects with ZERO mutation', () => {
  const sim = new WorldSimulation({ seed: 725 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  const initialGold = wallet.gold;
  const initialSlots = JSON.stringify(inv.slots);

  // Unsupported quantities: 2, 3, 10
  for (const qty of [2, 3, 4, 10, -1, 0]) {
    sim.enqueueCommand('BUY_SEED', playerEntityId, {
      targetEntityId: seedCatalogEntityId,
      seedItemId: 'seed_parsnip',
      quantity: qty
    });
    sim.step();
    assert.equal(sim.lastCommandResult?.success, false);
    assert.equal(wallet.gold, initialGold);
    assert.equal(JSON.stringify(inv.slots), initialSlots);
  }

  // Invalid crop
  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_banana',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(wallet.gold, initialGold);
  assert.equal(JSON.stringify(inv.slots), initialSlots);

  // Out of reach: move player away
  playerPos.x = 25.0;
  playerPos.y = 25.0;

  sim.enqueueCommand('BUY_SEED', playerEntityId, {
    targetEntityId: seedCatalogEntityId,
    seedItemId: 'seed_parsnip',
    quantity: 1
  });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Too far from seed catalog');
  assert.equal(wallet.gold, initialGold);
  assert.equal(JSON.stringify(inv.slots), initialSlots);
});

test('SeedCatalog: Rapid sequential purchases deduct gold and stack seeds correctly', () => {
  const sim = new WorldSimulation({ seed: 726 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;

  const initialParsnipCount = getItemCount(inv, 'seed_parsnip'); // 15
  assert.equal(wallet.gold, 100);

  // Rapidly enqueue 4 individual Parsnip seed purchases (4 * 20g = 80g)
  for (let i = 0; i < 4; i++) {
    sim.enqueueCommand('BUY_SEED', playerEntityId, {
      targetEntityId: seedCatalogEntityId,
      seedItemId: 'seed_parsnip',
      quantity: 1
    });
    sim.step();
    assert.equal(sim.lastCommandResult?.success, true);
  }

  assert.equal(wallet.gold, 20); // 100 - 80 = 20g
  assert.equal(getItemCount(inv, 'seed_parsnip'), initialParsnipCount + 4);
});

test('SeedCatalog: Repeated purchases until funds are nearly exhausted stop exactly when unaffordable', () => {
  const sim = new WorldSimulation({ seed: 727 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;

  // Give player 45g (can buy two 20g parsnip seeds, leaving 5g; third buy must fail)
  wallet.gold = 45;
  const initialParsnip = getItemCount(inv, 'seed_parsnip');

  // First purchase (45 -> 25g)
  sim.enqueueCommand('BUY_SEED', playerEntityId, { targetEntityId: seedCatalogEntityId, seedItemId: 'seed_parsnip', quantity: 1 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 25);

  // Second purchase (25 -> 5g)
  sim.enqueueCommand('BUY_SEED', playerEntityId, { targetEntityId: seedCatalogEntityId, seedItemId: 'seed_parsnip', quantity: 1 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 5);

  // Third purchase attempts 20g with only 5g
  sim.enqueueCommand('BUY_SEED', playerEntityId, { targetEntityId: seedCatalogEntityId, seedItemId: 'seed_parsnip', quantity: 1 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Not enough gold');
  assert.equal(wallet.gold, 5, 'Gold must remain exactly 5g');
  assert.equal(getItemCount(inv, 'seed_parsnip'), initialParsnip + 2);
});

test('SeedCatalog: Stacking into existing stack with exact-fit capacity and overflow rejection', () => {
  const sim = new WorldSimulation({ seed: 728 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  wallet.gold = 500;

  // Fill 9 slots with dummy items and set slot 0 to 94 Parsnip seeds (maxStack is 99)
  inv.slots = [
    { itemId: 'seed_parsnip', quantity: 94 },
    { itemId: 'dummy_1', quantity: 1 },
    { itemId: 'dummy_2', quantity: 1 },
    { itemId: 'dummy_3', quantity: 1 },
    { itemId: 'dummy_4', quantity: 1 },
    { itemId: 'dummy_5', quantity: 1 },
    { itemId: 'dummy_6', quantity: 1 },
    { itemId: 'dummy_7', quantity: 1 },
    { itemId: 'dummy_8', quantity: 1 },
    { itemId: 'dummy_9', quantity: 1 }
  ];

  // Exact-fit: buying 5 seeds brings stack to exactly 99
  sim.enqueueCommand('BUY_SEED', playerEntityId, { targetEntityId: seedCatalogEntityId, seedItemId: 'seed_parsnip', quantity: 5 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(wallet.gold, 400); // 500 - 100 = 400
  assert.equal(inv.slots[0]?.quantity, 99);

  // Now stack is full (99) and all other 9 slots are filled.
  // Buying 1 more must be rejected with 'Inventory full' and ZERO gold deduction
  sim.enqueueCommand('BUY_SEED', playerEntityId, { targetEntityId: seedCatalogEntityId, seedItemId: 'seed_parsnip', quantity: 1 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Inventory full');
  assert.equal(wallet.gold, 400, 'Gold must not mutate');
  assert.equal(inv.slots[0]?.quantity, 99);
});

test('SeedCatalog: Fractional and non-numeric quantities are rejected with ZERO mutation', () => {
  const sim = new WorldSimulation({ seed: 729 });
  const { playerEntityId, seedCatalogEntityId } = FarmsteadLayout.initialize(sim);

  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.5;
  playerPos.y = 13.0;

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerEntityId, 'Inventory')!;
  const initialGold = wallet.gold;
  const initialSlots = JSON.stringify(inv.slots);

  for (const invalidQty of [1.5, 2.5, 0.5, NaN, Infinity, -5]) {
    sim.enqueueCommand('BUY_SEED', playerEntityId, {
      targetEntityId: seedCatalogEntityId,
      seedItemId: 'seed_parsnip',
      quantity: invalidQty
    });
    sim.step();
    assert.equal(sim.lastCommandResult?.success, false);
    assert.equal(wallet.gold, initialGold);
    assert.equal(JSON.stringify(inv.slots), initialSlots);
  }
});
