import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import {
  resolveClosestInteractableEntity,
  checkBedProximity,
  GameplayUI
} from '../../src/client/GameplayUI.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { TILE_FLAGS, TERRAIN_TYPES } from '../../src/world/ChunkGrid.js';
import { InputController } from '../../src/client/InputController.js';

test('Interaction Arbitration: resolves Bed when closest within 1.5 tiles', () => {
  const sim = new WorldSimulation({ seed: 901 });
  const { bedEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);

  // Bed is at (12.5, 12.5). Position player at (12.5, 13.0) -> dist = 0.5 <= 1.5
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 12.5;
  playerPos.y = 13.0;

  const snapshot = sim.getRenderSnapshot();
  const closest = resolveClosestInteractableEntity(snapshot);

  assert.ok(closest, 'Must resolve an interactable');
  assert.equal(closest.kind, 'bed');
  assert.equal(closest.id, bedEntityId);
  assert.ok(Math.abs(closest.distance - 0.5) < 1e-4);
});

test('Interaction Arbitration: resolves Shipping Bin when closest within 1.5 tiles', () => {
  const sim = new WorldSimulation({ seed: 902 });
  const { shippingBinEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);

  // Shipping Bin is at (14.5, 12.5). Position player at (14.2, 12.5) -> dist = 0.3
  // Distance to Bed is 1.7 (> 1.5). Distance to Seed Catalog is 1.3
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 14.2;
  playerPos.y = 12.5;

  const snapshot = sim.getRenderSnapshot();
  const closest = resolveClosestInteractableEntity(snapshot);

  assert.ok(closest, 'Must resolve an interactable');
  assert.equal(closest.kind, 'shipping_bin');
  assert.equal(closest.id, shippingBinEntityId);
  assert.ok(Math.abs(closest.distance - 0.3) < 1e-4);
});

test('Interaction Arbitration: resolves Seed Catalog when closest within 1.5 tiles', () => {
  const sim = new WorldSimulation({ seed: 903 });
  const { seedCatalogEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);

  // Seed Catalog is at (15.5, 12.5). Position player at (15.4, 12.5) -> dist = 0.1
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
  playerPos.x = 15.4;
  playerPos.y = 12.5;

  const snapshot = sim.getRenderSnapshot();
  const closest = resolveClosestInteractableEntity(snapshot);

  assert.ok(closest, 'Must resolve an interactable');
  assert.equal(closest.kind, 'seed_catalog');
  assert.equal(closest.id, seedCatalogEntityId);
  assert.ok(Math.abs(closest.distance - 0.1) < 1e-4);
});

test('Interaction Arbitration: deterministic tie-break orders Bed > ShippingBin > SeedCatalog', () => {
  const sim = new WorldSimulation({ seed: 904 });
  const { bedEntityId, shippingBinEntityId, seedCatalogEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;

  // 1. Equidistant between Bed (12.5, 12.5) and ShippingBin (14.5, 12.5) at (13.5, 12.5) -> dist = 1.0 each
  playerPos.x = 13.5;
  playerPos.y = 12.5;
  let snapshot = sim.getRenderSnapshot();
  let closest = resolveClosestInteractableEntity(snapshot);
  assert.ok(closest);
  assert.equal(closest.kind, 'bed', 'Tie-break between Bed and ShippingBin must favor Bed');
  assert.equal(closest.id, bedEntityId);

  // 2. Equidistant between ShippingBin (14.5, 12.5) and SeedCatalog (15.5, 12.5) at (15.0, 12.5) -> dist = 0.5 each
  playerPos.x = 15.0;
  playerPos.y = 12.5;
  snapshot = sim.getRenderSnapshot();
  closest = resolveClosestInteractableEntity(snapshot);
  assert.ok(closest);
  assert.equal(closest.kind, 'shipping_bin', 'Tie-break between ShippingBin and SeedCatalog must favor ShippingBin');
  assert.equal(closest.id, shippingBinEntityId);
});

test('Interaction Arbitration: distance boundary strictly enforces 1.5 tiles reach', () => {
  const sim = new WorldSimulation({ seed: 905 });
  const { shippingBinEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;

  // Exactly on boundary: (14.5, 14.0) -> dy = 1.5, dx = 0 -> dist = 1.500
  playerPos.x = 14.5;
  playerPos.y = 14.0;
  let snapshot = sim.getRenderSnapshot();
  let closest = resolveClosestInteractableEntity(snapshot);
  assert.ok(closest, 'Entity at exactly 1.5 reach must be resolved');
  assert.equal(closest.kind, 'shipping_bin');

  // Just beyond boundary: (14.5, 14.05) -> dy = 1.55 -> dist = 1.55 > 1.5
  playerPos.x = 14.5;
  playerPos.y = 14.05;
  snapshot = sim.getRenderSnapshot();
  closest = resolveClosestInteractableEntity(snapshot);
  assert.equal(closest, null, 'Entity beyond 1.5 reach must not be resolved');
});

test('Interaction Arbitration: zero accidental sleep when interacting near commerce entities', () => {
  const sim = new WorldSimulation({ seed: 906 });
  const { bedEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;

  // Player at (14.5, 13.0) next to shipping bin:
  // Bed is at (12.5, 12.5) -> dist = hypot(2.0, 0.5) = 2.0615 > 1.5
  playerPos.x = 14.5;
  playerPos.y = 13.0;

  const snapshot = sim.getRenderSnapshot();
  const player = snapshot.entities.find(e => e.id === playerEntityId)!;
  const bed = snapshot.entities.find(e => e.id === bedEntityId)!;

  assert.equal(checkBedProximity(player, bed), false, 'Player next to shipping bin must NOT be in bed reach');
  const closest = resolveClosestInteractableEntity(snapshot);
  assert.ok(closest);
  assert.notEqual(closest.kind, 'bed', 'Closest entity must not be bed');
  assert.equal(closest.kind, 'shipping_bin');
});

test('Interaction Arbitration: fallback to farming when out of entity reach', () => {
  const sim = new WorldSimulation({ seed: 907, initialTick: 7200 });
  const { playerEntityId } = FarmsteadLayout.initialize(sim);
  const playerPos = sim.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;

  // Position player out in the field at (8.5, 8.5)
  playerPos.x = 8.5;
  playerPos.y = 8.5;

  const snapshot = sim.getRenderSnapshot();
  const closest = resolveClosestInteractableEntity(snapshot);
  assert.equal(closest, null, 'No interactable entity within 1.5 reach');

  // Tile at (8, 8) can receive farming action
  sim.chunks.setTile(8, 8, {
    terrainType: TERRAIN_TYPES.GRASS,
    flags: TILE_FLAGS.WALKABLE,
    moisture: 30,
    fertility: 50
  });

  // TILL command executed at player's tile
  sim.enqueueCommand('TILL', playerEntityId, { targetTileX: 8, targetTileY: 8 });
  sim.step();

  const tile = sim.chunks.getTile(8, 8)!;
  assert.equal(tile.terrainType, TERRAIN_TYPES.TILLED_SOIL);
  assert.ok((tile.flags & TILE_FLAGS.TILLED) !== 0);
});

test('Modal Input Lock: isModalOpen and closeAllModals function correctly', () => {
  const ui = new GameplayUI();

  // Initially closed
  assert.equal(ui.isModalOpen, false);
  assert.equal(ui.isInventoryOpen, false);
  assert.equal(ui.isShippingBinOpen, false);
  assert.equal(ui.isSeedCatalogOpen, false);

  // Toggle inventory
  ui.toggleInventory();
  assert.equal(ui.isInventoryOpen, true);
  assert.equal(ui.isModalOpen, true);

  // Close all modals
  ui.closeAllModals();
  assert.equal(ui.isInventoryOpen, false);
  assert.equal(ui.isModalOpen, false);
});

test('Modal Input Lock: InputController suppresses movement, slot selection, and consume actions when modal is open', () => {
  const sim = new WorldSimulation({ seed: 908 });
  const player = sim.spawnPlayer(10, 10);
  const input = new InputController(sim);

  let selectedSlot = -1;
  let consumeTriggered = false;
  let escapeTriggered = false;
  let modalOpen = true;

  input.setCallbacks({
    onSelectSlot: (slot) => { selectedSlot = slot; },
    onConsumeAction: () => { consumeTriggered = true; },
    onEscape: () => { escapeTriggered = true; },
    onIsModalOpen: () => modalOpen
  });

  // 1. With modal OPEN:
  // Keypresses for hotbar and consume must be suppressed
  (input as any).handleKeyDown({ code: 'Digit3', preventDefault: () => {} });
  assert.equal(selectedSlot, -1, 'Slot selection must be suppressed when modal is open');

  (input as any).handleKeyDown({ code: 'KeyC', preventDefault: () => {} });
  assert.equal(consumeTriggered, false, 'Consume action must be suppressed when modal is open');

  // Movement update must be suppressed
  (input as any).activeKeys.add('KeyW');
  input.update();
  assert.equal(sim.commands.getPendingForTick(sim.clock.currentTick).length, 0, 'Movement commands must be suppressed when modal is open');

  // Escape key must trigger onEscape callback
  (input as any).handleKeyDown({ code: 'Escape', preventDefault: () => {} });
  assert.equal(escapeTriggered, true, 'Escape must call onEscape to close modals');

  // 2. With modal CLOSED:
  modalOpen = false;
  (input as any).handleKeyDown({ code: 'Digit3', preventDefault: () => {} });
  assert.equal(selectedSlot, 2, 'Slot selection must function when modal is closed');

  (input as any).handleKeyDown({ code: 'KeyC', preventDefault: () => {} });
  assert.equal(consumeTriggered, true, 'Consume action must function when modal is closed');

  input.update();
  const pending = sim.commands.getPendingForTick(sim.clock.currentTick);
  assert.equal(pending.length, 1, 'Movement command must be enqueued when modal is closed');
  assert.equal(pending[0]?.type, 'MOVE');
});
