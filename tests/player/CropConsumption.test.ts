import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { EnergyComponent } from '../../src/ecs/components/EnergyComponent.js';
import { InventoryComponent, addItem } from '../../src/ecs/components/InventoryComponent.js';
import { PLAYER_CONFIG } from '../../src/player/PlayerConfig.js';

test('CropConsumption: Consuming Parsnip restores +20 energy and decrements 1 item', () => {
  const sim = new WorldSimulation({ seed: 501 });
  const playerId = sim.spawnPlayer(16, 16);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;

  // Give player 3 Parsnip crops in slot 3
  inv.slots[3] = { itemId: 'crop_parsnip', quantity: 3 };
  energy.current = 40; // Reduced energy

  // Enqueue CONSUME targeting slot 3
  sim.enqueueCommand('CONSUME', playerId, { slotIndex: 3 });
  sim.step();

  assert.equal(energy.current, 60, 'Parsnip must restore exactly +20 energy (40 -> 60)');
  assert.equal(inv.slots[3]?.quantity, 2, 'Inventory slot quantity must decrement by exactly 1 (3 -> 2)');
  assert.equal(sim.lastCommandResult?.success, true);
});

test('CropConsumption: Energy recovery strictly caps at MAX_ENERGY (100)', () => {
  const sim = new WorldSimulation({ seed: 502 });
  const playerId = sim.spawnPlayer(16, 16);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;

  // Give player 1 Parsnip in slot 3
  inv.slots[3] = { itemId: 'crop_parsnip', quantity: 1 };
  energy.current = 90; // Only 10 below max

  sim.enqueueCommand('CONSUME', playerId, { slotIndex: 3 });
  sim.step();

  assert.equal(energy.current, PLAYER_CONFIG.MAX_ENERGY, 'Energy must cap at 100, not exceed it (90 + 20 -> 100)');
  assert.equal(inv.slots[3], null, 'Consuming last item of stack must clear the slot to null');
  assert.equal(sim.lastCommandResult?.success, true);
});

test('CropConsumption: Consuming non-edible items rejects with zero energy and inventory mutation', () => {
  const sim = new WorldSimulation({ seed: 503 });
  const playerId = sim.spawnPlayer(16, 16);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;

  energy.current = 50;
  // Slot 0 has tool_hoe, Slot 2 has seed_parsnip (15 seeds)
  assert.equal(inv.slots[0]?.itemId, 'tool_hoe');
  assert.equal(inv.slots[2]?.itemId, 'seed_parsnip');

  // Attempt to consume tool_hoe
  sim.enqueueCommand('CONSUME', playerId, { slotIndex: 0 });
  sim.step();

  assert.equal(energy.current, 50, 'Energy must NOT mutate when attempting to eat a tool');
  assert.equal(inv.slots[0]?.quantity, 1, 'Tool must NOT be decremented');
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Item is not edible');

  // Attempt to consume seed_parsnip
  sim.enqueueCommand('CONSUME', playerId, { slotIndex: 2 });
  sim.step();

  assert.equal(energy.current, 50, 'Energy must NOT mutate when attempting to eat seeds');
  assert.equal(inv.slots[2]?.quantity, 15, 'Seeds must NOT be decremented');
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Item is not edible');
});

test('CropConsumption: Consuming an empty slot rejects with zero state mutation', () => {
  const sim = new WorldSimulation({ seed: 504 });
  const playerId = sim.spawnPlayer(16, 16);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;

  energy.current = 30;
  // Slot 5 is empty (null)
  assert.equal(inv.slots[5], null);

  sim.enqueueCommand('CONSUME', playerId, { slotIndex: 5 });
  sim.step();

  assert.equal(energy.current, 30, 'Energy must NOT mutate when consuming empty slot');
  assert.equal(inv.slots[5], null);
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'No item to consume');
});

test('CropConsumption: Multi-step consumption runs deterministically across ticks', () => {
  const sim = new WorldSimulation({ seed: 505 });
  const playerId = sim.spawnPlayer(16, 16);
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;

  inv.slots[3] = { itemId: 'crop_parsnip', quantity: 2 };
  energy.current = 10;

  // Consume 1st parsnip
  sim.enqueueCommand('CONSUME', playerId, { slotIndex: 3 });
  sim.step();
  assert.equal(energy.current, 30);
  assert.equal(inv.slots[3]?.quantity, 1);

  // Advance 5 idle ticks
  sim.stepMany(5);
  assert.equal(energy.current, 30);

  // Consume 2nd parsnip
  sim.enqueueCommand('CONSUME', playerId, { slotIndex: 3 });
  sim.step();
  assert.equal(energy.current, 50);
  assert.equal(inv.slots[3], null);
});
