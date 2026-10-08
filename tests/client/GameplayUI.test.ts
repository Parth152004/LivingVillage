import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import {
  formatDayTime,
  getEnergyDisplay,
  getItemInfo,
  checkBedProximity,
  formatGoldDisplay,
  GameplayUI
} from '../../src/client/GameplayUI.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { PLAYER_CONFIG } from '../../src/player/PlayerConfig.js';
import { CropRegistry } from '../../src/farming/CropRegistry.js';

test('GameplayUI Time: tick 0, tick 7200, and next day dawn derive exact Day and Time', () => {
  // 1. Tick 0 -> Day 1 00:00
  const t0 = formatDayTime(0);
  assert.equal(t0.day, 1);
  assert.equal(t0.hour, 0);
  assert.equal(t0.minute, 0);
  assert.equal(t0.timeString, '00:00');
  assert.equal(t0.dayString, 'Day 1');
  assert.equal(t0.fullDisplay, 'Day 1  00:00');

  // 2. Tick 7200 -> Day 1 06:00
  const t7200 = formatDayTime(7200);
  assert.equal(t7200.day, 1);
  assert.equal(t7200.hour, 6);
  assert.equal(t7200.minute, 0);
  assert.equal(t7200.timeString, '06:00');
  assert.equal(t7200.dayString, 'Day 1');
  assert.equal(t7200.fullDisplay, 'Day 1  06:00');

  // 3. Tick 7220 -> Day 1 06:01 (20 ticks per in-game minute)
  const t7220 = formatDayTime(7220);
  assert.equal(t7220.day, 1);
  assert.equal(t7220.hour, 6);
  assert.equal(t7220.minute, 1);
  assert.equal(t7220.timeString, '06:01');

  // 4. Tick 36,000 -> Day 2 06:00 (Day 2 Dawn)
  const t36000 = formatDayTime(36000);
  assert.equal(t36000.day, 2);
  assert.equal(t36000.hour, 6);
  assert.equal(t36000.minute, 0);
  assert.equal(t36000.timeString, '06:00');
  assert.equal(t36000.dayString, 'Day 2');
  assert.equal(t36000.fullDisplay, 'Day 2  06:00');
});

test('GameplayUI Energy: snapshot energy 100/100, dynamic deductions, and 0/100', () => {
  // 1. Initial 100/100
  const e100 = getEnergyDisplay({ current: 100, max: 100 });
  assert.equal(e100.current, 100);
  assert.equal(e100.max, 100);
  assert.equal(e100.percent, 100);
  assert.equal(e100.text, 'Energy: 100 / 100');

  // 2. Mid energy 73/100
  const e73 = getEnergyDisplay({ current: 73, max: 100 });
  assert.equal(e73.current, 73);
  assert.equal(e73.max, 100);
  assert.equal(e73.percent, 73);
  assert.equal(e73.text, 'Energy: 73 / 100');

  // 3. Zero energy 0/100
  const e0 = getEnergyDisplay({ current: 0, max: 100 });
  assert.equal(e0.current, 0);
  assert.equal(e0.max, 100);
  assert.equal(e0.percent, 0);
  assert.equal(e0.text, 'Energy: 0 / 100');

  // 4. Undefined / missing energy fallback
  const eUndefined = getEnergyDisplay(undefined);
  assert.equal(eUndefined.current, 0);
  assert.equal(eUndefined.text, 'Energy: 0 / 100');
});

test('GameplayUI Energy: updates dynamically from simulation actions via snapshot', () => {
  const sim = new WorldSimulation({ seed: 701, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE, moisture: 20, fertility: 50 });

  // Initial Snapshot: 100/100
  let snapshot = sim.getRenderSnapshot();
  assert.equal(getEnergyDisplay(snapshot.player?.energy).text, 'Energy: 100 / 100');

  // Till action: cost 5
  sim.enqueueCommand('TILL', player, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.equal(getEnergyDisplay(snapshot.player?.energy).text, 'Energy: 95 / 100');

  // Sow action: cost 2
  sim.enqueueCommand('SOW', player, { targetTileX: 11, targetTileY: 10, payload: { seedItemId: 'seed_parsnip' } });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.equal(getEnergyDisplay(snapshot.player?.energy).text, 'Energy: 93 / 100');

  // Water action: cost 1
  sim.enqueueCommand('WATER', player, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.equal(getEnergyDisplay(snapshot.player?.energy).text, 'Energy: 92 / 100');
});

test('GameplayUI Inventory: snapshot inventory reflects quantities, items, and watering can charges', () => {
  const sim = new WorldSimulation({ seed: 702, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);

  let snapshot = sim.getRenderSnapshot();
  const inv = snapshot.player!.inventory;

  // Slot 0: tool_hoe (qty 1)
  assert.equal(inv[0]?.itemId, 'tool_hoe');
  assert.equal(inv[0]?.quantity, 1);
  assert.equal(getItemInfo(inv[0]?.itemId).name, 'Hoe');

  // Slot 1: tool_watering_can (qty 1, charges 40)
  assert.equal(inv[1]?.itemId, 'tool_watering_can');
  assert.equal(inv[1]?.charges, 40);
  assert.equal(getItemInfo(inv[1]?.itemId).name, 'Watering Can');

  // Slot 2: seed_parsnip (qty 15)
  assert.equal(inv[2]?.itemId, 'seed_parsnip');
  assert.equal(inv[2]?.quantity, 15);
  assert.equal(getItemInfo(inv[2]?.itemId).name, 'Parsnip Seeds');

  // Perform Sow -> seed count decreases by 1
  sim.chunks.setTile(11, 10, { terrainType: 2, flags: TILE_FLAGS.TILLED, moisture: 50, fertility: 60 });
  sim.enqueueCommand('SOW', player, { targetTileX: 11, targetTileY: 10, payload: { seedItemId: 'seed_parsnip' } });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player!.inventory[2]?.quantity, 14, 'Seed quantity should decrease to 14 in snapshot');

  // Perform Water -> charges decrease by 1
  sim.enqueueCommand('WATER', player, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player!.inventory[1]?.charges, 39, 'Watering can charges should decrease to 39 in snapshot');
});

test('GameplayUI Hotbar: selection is presentation state only and NOT saved in simulation state', () => {
  const ui = new GameplayUI();
  assert.equal(ui.selectedHotbarSlot, 0);

  // Select slot 2
  ui.selectSlot(2);
  assert.equal(ui.selectedHotbarSlot, 2);

  // Clamp checks
  ui.selectSlot(-5);
  assert.equal(ui.selectedHotbarSlot, 0);

  ui.selectSlot(99);
  assert.equal(ui.selectedHotbarSlot, 9);

  // Crucial boundary check: selectedHotbarSlot is NOT present in simulation save snapshot
  const sim = new WorldSimulation({ seed: 703 });
  sim.spawnPlayer(10, 10);
  const saveJson = JSON.stringify(sim.getSnapshot());

  assert.ok(!saveJson.includes('selectedHotbarSlot'), 'selectedHotbarSlot must never be stored in simulation state');
  assert.ok(!saveJson.includes('selectedSlot'), 'selectedSlot must not be stored in simulation state');
});

test('GameplayUI Bed Proximity: detects reach <= 1.5 tiles correctly', () => {
  const player = { x: 12.0, y: 12.0 };
  const bedNear = { x: 12.5, y: 12.5 }; // dist ~0.71 <= 1.5
  const bedFar = { x: 15.0, y: 12.0 };  // dist 3.0 > 1.5

  assert.equal(checkBedProximity(player, bedNear), true, 'Near bed within 1.5 tiles should return true');
  assert.equal(checkBedProximity(player, bedFar), false, 'Far bed beyond 1.5 tiles should return false');
});

test('GameplayUI Sleep: authoritative SLEEP reaches next dawn, restores energy, and transition does not advance clock', () => {
  const sim = new WorldSimulation({ seed: 704, initialTick: 7200 }); // Day 1 06:00 AM
  const bed = sim.spawnBed(12, 12);
  const player = sim.spawnPlayer(12, 12); // Player at bed

  // Deduct energy to 40
  const energy = sim.ecs.getComponent<any>(player, 'Energy');
  energy.current = 40;

  // Advance time to 22:00 PM (tick 7200 + 16 * 1200 = 26400)
  sim.clock.stepMany(16 * 1200, true);
  assert.equal(sim.currentTick, 26400);

  // Enqueue SLEEP command
  sim.enqueueCommand('SLEEP', player, { targetEntityId: bed });
  sim.step(); // Fast-forward executes

  // 1. Simulation advances authoritatively to next dawn (36,000 / Day 2 06:00)
  assert.equal(sim.currentTick, 36000);

  // 2. Snapshot displays Day 2 06:00
  const snapshot = sim.getRenderSnapshot();
  const dt = formatDayTime(snapshot.tick);
  assert.equal(dt.day, 2);
  assert.equal(dt.hour, 6);
  assert.equal(dt.timeString, '06:00');
  assert.equal(dt.fullDisplay, 'Day 2  06:00');

  // 3. Energy displays 100 / 100 after sleep
  const energyDisplay = getEnergyDisplay(snapshot.player?.energy);
  assert.equal(energyDisplay.current, 100);
  assert.equal(energyDisplay.text, 'Energy: 100 / 100');

  // 4. Sleep visual transition does NOT advance simulation clock
  const ui = new GameplayUI();
  const tickBeforeTransition = sim.currentTick;
  ui.startSleepTransition();
  assert.equal(ui.isSleeping, true);

  // Simulation tick has NOT changed due to UI transition
  assert.equal(sim.currentTick, tickBeforeTransition, 'UI transition must never control or advance simulation clock');
});

test('GameplayUI Action Feedback: rejected actions provide authoritative feedback', () => {
  const sim = new WorldSimulation({ seed: 705, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  const energy = sim.ecs.getComponent<any>(player, 'Energy');

  // 1. Insufficient energy feedback on TILL
  energy.current = 2; // TILL costs 5
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE, moisture: 20, fertility: 50 });
  sim.enqueueCommand('TILL', player, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  let snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.lastCommandResult);
  assert.equal(snapshot.lastCommandResult.success, false);
  assert.equal(snapshot.lastCommandResult.reason, 'Not enough energy');

  // Restore energy for next tests
  energy.current = 100;

  // 2. Empty watering can feedback on WATER
  const inv = sim.ecs.getComponent<any>(player, 'Inventory');
  const can = inv.slots.find((s: any) => s?.itemId === 'tool_watering_can');
  can.charges = 0; // Empty can

  sim.chunks.setTile(10, 11, { terrainType: 2, flags: TILE_FLAGS.TILLED, moisture: 0, fertility: 50 });
  sim.enqueueCommand('WATER', player, { targetTileX: 10, targetTileY: 11 });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.lastCommandResult);
  assert.equal(snapshot.lastCommandResult.success, false);
  assert.equal(snapshot.lastCommandResult.reason, 'Watering can empty');

  // 3. Full inventory feedback on HARVEST
  // Fill all inventory slots
  inv.slots = [
    { itemId: 'tool_hoe', quantity: 1 },
    { itemId: 'tool_watering_can', quantity: 1, charges: 40 },
    { itemId: 'seed_parsnip', quantity: 15 },
    { itemId: 'item_stone', quantity: 99 },
    { itemId: 'item_wood', quantity: 99 },
    { itemId: 'item_fiber', quantity: 99 },
    { itemId: 'item_clay', quantity: 99 },
    { itemId: 'item_iron', quantity: 99 },
    { itemId: 'item_gold', quantity: 99 },
    { itemId: 'item_copper', quantity: 99 }
  ];
  // Mature crop on tile
  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.TILLED,
    cropTypeId: 1,
    cropStage: 3, // Mature Parsnip
    moisture: 50,
    fertility: 50
  });

  sim.enqueueCommand('HARVEST', player, { targetTileX: 11, targetTileY: 10 });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.lastCommandResult);
  assert.equal(snapshot.lastCommandResult.success, false);
  assert.equal(snapshot.lastCommandResult.reason, 'Inventory full');

  // 4. Invalid sleep (out of reach bed) feedback on SLEEP
  const bedFar = sim.spawnBed(25, 25); // Player is at (10.5, 10.5)
  sim.enqueueCommand('SLEEP', player, { targetEntityId: bedFar });
  sim.step();

  snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.lastCommandResult);
  assert.equal(snapshot.lastCommandResult.success, false);
  assert.equal(snapshot.lastCommandResult.reason, 'Too far from bed');
});

test('GameplayUI Pause: UI reflects isPaused and time does not advance', () => {
  const sim = new WorldSimulation({ seed: 706, initialTick: 7200 });
  sim.spawnPlayer(10, 10);

  // Initial: running
  let snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.isPaused, false);
  assert.equal(formatDayTime(snapshot.tick).fullDisplay, 'Day 1  06:00');

  // Pause simulation
  sim.pause();
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.isPaused, true);

  // Step while paused (should not advance without force)
  sim.step();
  sim.step();
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.tick, 7200, 'Tick must not advance while paused');
  assert.equal(formatDayTime(snapshot.tick).fullDisplay, 'Day 1  06:00');

  // Resume simulation
  sim.resume();
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.isPaused, false);

  sim.step();
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.tick, 7201, 'Tick advances after resume');
});

test('GameplayUI Gold: formatGoldDisplay formats 100g, 0g, large values, and undefined values cleanly', () => {
  assert.equal(formatGoldDisplay(100), '🪙 100g');
  assert.equal(formatGoldDisplay(0), '🪙 0g');
  assert.equal(formatGoldDisplay(2500), '🪙 2500g');
  assert.equal(formatGoldDisplay(undefined), '🪙 0g');
  assert.equal(formatGoldDisplay(-50), '🪙 0g');
  assert.equal(formatGoldDisplay(45.8), '🪙 45g');
});

test('GameplayUI Gold: updates dynamically from simulation snapshot without optimistic drift', () => {
  const sim = new WorldSimulation({ seed: 707 });
  const { playerEntityId } = FarmsteadLayout.initialize(sim);

  // 1. Initial snapshot has starting gold (100g)
  let snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 100);
  assert.equal(formatGoldDisplay(snapshot.player?.wallet.gold), '🪙 100g');

  // 2. Authoritative state mutation (e.g. overnight shipping or seed purchase)
  const wallet = sim.ecs.getComponent<any>(playerEntityId, 'Wallet');
  wallet.gold = 350;

  // 3. Next snapshot reflects updated gold exactly
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.player?.wallet.gold, 350);
  assert.equal(formatGoldDisplay(snapshot.player?.wallet.gold), '🪙 350g');
});

test('GameplayUI Gold DOM: GameplayUI.update() is the single authoritative owner of #hud-gold', () => {
  const dummyGoldElem = { textContent: '' };
  (globalThis as any).document = {
    getElementById: (id: string) => {
      if (id === 'hud-gold') return dummyGoldElem;
      return null;
    }
  };

  try {
    const ui = new GameplayUI();
    ui.bindDomElements();

    const sim = new WorldSimulation({ seed: 709 });
    const { playerEntityId } = FarmsteadLayout.initialize(sim);

    // Initial update reflects starting gold (100g)
    let snapshot = sim.getRenderSnapshot();
    ui.update(snapshot);
    assert.equal(dummyGoldElem.textContent, '🪙 100g');

    // Simulate authoritative gold balance mutation
    const wallet = sim.ecs.getComponent<any>(playerEntityId, 'Wallet');
    wallet.gold = 520;

    snapshot = sim.getRenderSnapshot();
    ui.update(snapshot);
    assert.equal(dummyGoldElem.textContent, '🪙 520g');
  } finally {
    delete (globalThis as any).document;
  }
});

test('Commerce Entity Render Data: snapshot assigns correct kinds and coordinates for Bed, ShippingBin, and SeedCatalog', () => {
  const sim = new WorldSimulation({ seed: 708 });
  const { bedEntityId, shippingBinEntityId, seedCatalogEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);

  const snapshot = sim.getRenderSnapshot();

  const bed = snapshot.entities.find(e => e.id === bedEntityId);
  assert.ok(bed, 'Bed entity must exist in snapshot');
  assert.equal(bed.kind, 'bed', 'Bed entity kind must be "bed"');
  assert.equal(bed.x, 12.5);
  assert.equal(bed.y, 12.5);

  const bin = snapshot.entities.find(e => e.id === shippingBinEntityId);
  assert.ok(bin, 'Shipping bin entity must exist in snapshot');
  assert.equal(bin.kind, 'shipping_bin', 'Shipping bin entity kind must be "shipping_bin"');
  assert.equal(bin.x, 14.5);
  assert.equal(bin.y, 12.5);

  const cat = snapshot.entities.find(e => e.id === seedCatalogEntityId);
  assert.ok(cat, 'Seed catalog entity must exist in snapshot');
  assert.equal(cat.kind, 'seed_catalog', 'Seed catalog entity kind must be "seed_catalog"');
  assert.equal(cat.x, 15.5);
  assert.equal(cat.y, 12.5);

  const player = snapshot.entities.find(e => e.id === playerEntityId);
  assert.ok(player, 'Player entity must exist in snapshot');
  assert.equal(player.kind, 'player', 'Player entity kind must be "player"');
  assert.equal(player.x, 16.5);
  assert.equal(player.y, 16.5);
});

