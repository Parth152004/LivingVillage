import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { TILE_FLAGS, TERRAIN_TYPES } from '../../src/world/ChunkGrid.js';
import { FARMING_CONFIG } from '../../src/farming/FarmingConfig.js';
import { PLAYER_CONFIG } from '../../src/player/PlayerConfig.js';
import { EnergyComponent } from '../../src/ecs/components/EnergyComponent.js';
import { InventoryComponent, getFirstItem } from '../../src/ecs/components/InventoryComponent.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';

test('WaterRefill: Successful REFILL_WATER restores charges to 40 and deducts 1 energy', () => {
  const sim = new WorldSimulation({ seed: 401 });
  FarmsteadLayout.initialize(sim);

  const playerId = sim.playerEntityId;
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerId, 'Position')!;
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  const can = getFirstItem(inv, 'tool_watering_can')!;

  // Place player right adjacent to pond at (21.5, 7.5), pond is at (22, 7)
  playerPos.x = 21.5;
  playerPos.y = 7.5;

  // Drain can to 12 charges and set energy to 80
  can.charges = 12;
  energy.current = 80;

  // Enqueue REFILL_WATER targeting pond tile (22, 7)
  sim.enqueueCommand('REFILL_WATER', playerId, { targetTileX: 22, targetTileY: 7 });
  sim.step();

  assert.equal(can.charges, FARMING_CONFIG.WATERING_CAN_MAX_CHARGES, 'Can charges must be restored to 40');
  assert.equal(energy.current, 79, 'Energy must decrease by exactly 1 (80 -> 79)');
  assert.ok(sim.lastCommandResult?.success, 'Command result must report success');
});

test('WaterRefill: Reach failure (> 1.5 tiles) rejects with zero state mutation and zero energy cost', () => {
  const sim = new WorldSimulation({ seed: 402 });
  FarmsteadLayout.initialize(sim);

  const playerId = sim.playerEntityId;
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerId, 'Position')!;
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  const can = getFirstItem(inv, 'tool_watering_can')!;

  // Player at (16, 16) is far away from pond at (22, 7)
  playerPos.x = 16.5;
  playerPos.y = 16.5;
  can.charges = 5;
  energy.current = 50;

  sim.enqueueCommand('REFILL_WATER', playerId, { targetTileX: 22, targetTileY: 7 });
  sim.step();

  assert.equal(can.charges, 5, 'Charges must NOT mutate on reach failure');
  assert.equal(energy.current, 50, 'Energy must NOT mutate on reach failure');
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Too far away');
});

test('WaterRefill: Non-water tile target rejects with zero state mutation and zero energy cost', () => {
  const sim = new WorldSimulation({ seed: 403 });
  FarmsteadLayout.initialize(sim);

  const playerId = sim.playerEntityId;
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerId, 'Position')!;
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  const can = getFirstItem(inv, 'tool_watering_can')!;

  // Stand adjacent to grass tile at (15, 16)
  playerPos.x = 16.5;
  playerPos.y = 16.5;
  can.charges = 10;
  energy.current = 60;

  // Target grass tile (15, 16) which is NOT water
  const tile = sim.chunks.getTile(15, 16)!;
  assert.notEqual(tile.flags & TILE_FLAGS.WATER, TILE_FLAGS.WATER);

  sim.enqueueCommand('REFILL_WATER', playerId, { targetTileX: 15, targetTileY: 16 });
  sim.step();

  assert.equal(can.charges, 10, 'Charges must NOT mutate when target is not water');
  assert.equal(energy.current, 60, 'Energy must NOT mutate when target is not water');
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Target is not a water source');
});

test('WaterRefill: Refill when already at 40 charges rejects with zero state mutation and zero energy cost', () => {
  const sim = new WorldSimulation({ seed: 404 });
  FarmsteadLayout.initialize(sim);

  const playerId = sim.playerEntityId;
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerId, 'Position')!;
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  const can = getFirstItem(inv, 'tool_watering_can')!;

  // Adjacent to pond
  playerPos.x = 21.5;
  playerPos.y = 7.5;
  can.charges = 40; // Already full
  energy.current = 75;

  sim.enqueueCommand('REFILL_WATER', playerId, { targetTileX: 22, targetTileY: 7 });
  sim.step();

  assert.equal(can.charges, 40, 'Charges must remain 40');
  assert.equal(energy.current, 75, 'Energy must NOT be deducted when can is already full');
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Watering can already full');
});

test('WaterRefill: Missing watering can in inventory rejects with zero state mutation', () => {
  const sim = new WorldSimulation({ seed: 405 });
  FarmsteadLayout.initialize(sim);

  const playerId = sim.playerEntityId;
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerId, 'Position')!;
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;

  // Remove watering can from inventory
  for (let i = 0; i < inv.slots.length; i++) {
    if (inv.slots[i]?.itemId === 'tool_watering_can') {
      inv.slots[i] = null;
    }
  }

  playerPos.x = 21.5;
  playerPos.y = 7.5;
  energy.current = 80;

  sim.enqueueCommand('REFILL_WATER', playerId, { targetTileX: 22, targetTileY: 7 });
  sim.step();

  assert.equal(energy.current, 80, 'Energy must NOT mutate when missing watering can');
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Missing watering can');
});

test('WaterRefill: Insufficient energy (< 1) rejects with zero state mutation', () => {
  const sim = new WorldSimulation({ seed: 406 });
  FarmsteadLayout.initialize(sim);

  const playerId = sim.playerEntityId;
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerId, 'Position')!;
  const energy = sim.ecs.getComponent<EnergyComponent>(playerId, 'Energy')!;
  const inv = sim.ecs.getComponent<InventoryComponent>(playerId, 'Inventory')!;
  const can = getFirstItem(inv, 'tool_watering_can')!;

  playerPos.x = 21.5;
  playerPos.y = 7.5;
  can.charges = 0;
  energy.current = 0; // Exhausted

  sim.enqueueCommand('REFILL_WATER', playerId, { targetTileX: 22, targetTileY: 7 });
  sim.step();

  assert.equal(can.charges, 0, 'Can charges must NOT refill with 0 energy');
  assert.equal(energy.current, 0);
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Not enough energy');
});
