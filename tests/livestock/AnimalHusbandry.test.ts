import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { AnimalComponent } from '../../src/ecs/components/AnimalComponent.js';
import { InventoryComponent, hasItem } from '../../src/ecs/components/InventoryComponent.js';

test('AnimalHusbandry: FarmsteadLayout populates livestock without duplicates', () => {
  const sim = new WorldSimulation({ seed: 101 });
  FarmsteadLayout.initialize(sim);
  FarmsteadLayout.populateLivestockAndVillagers(sim);

  const animals = sim.ecs.queryEntities(['Animal']);
  assert.equal(animals.length, 3, 'Should spawn 2 chickens and 1 cow');

  // Second call must be idempotent
  FarmsteadLayout.populateLivestockAndVillagers(sim);
  assert.equal(sim.ecs.queryEntities(['Animal']).length, 3, 'Idempotent call must not duplicate animals');
});

test('AnimalHusbandry: Petting an animal increases happiness and marks pettedToday', () => {
  const sim = new WorldSimulation({ seed: 102 });
  FarmsteadLayout.initialize(sim);
  FarmsteadLayout.populateLivestockAndVillagers(sim);

  const animals = sim.ecs.queryEntities(['Animal']);
  const chickenId = animals[0]!;
  const chicken = sim.ecs.getComponent<AnimalComponent>(chickenId, 'Animal')!;

  const initialHappiness = chicken.happiness;
  assert.equal(chicken.pettedToday, false);

  // Position player next to chicken
  const chickenPos = sim.ecs.getComponent<any>(chickenId, 'Position')!;
  const playerPos = sim.ecs.getComponent<any>(sim.playerEntityId, 'Position')!;
  playerPos.x = chickenPos.x + 0.5;
  playerPos.y = chickenPos.y;

  sim.enqueueCommand('PET_ANIMAL', sim.playerEntityId, { targetEntityId: chickenId });
  sim.step();

  assert.equal(chicken.pettedToday, true);
  assert.equal(chicken.happiness, Math.min(100, initialHappiness + 15));
  assert.equal(sim.lastCommandResult?.success, true);
});

test('AnimalHusbandry: Dawn settlement resets pettedToday and produces eggs/milk when happy', () => {
  const sim = new WorldSimulation({ seed: 103 });
  FarmsteadLayout.initialize(sim);
  FarmsteadLayout.populateLivestockAndVillagers(sim);

  const animals = sim.ecs.queryEntities(['Animal']);
  const cowId = animals.find(id => sim.ecs.getComponent<AnimalComponent>(id, 'Animal')?.species === 'cow')!;
  const cow = sim.ecs.getComponent<AnimalComponent>(cowId, 'Animal')!;
  cow.happiness = 90;
  cow.pettedToday = true;

  // Simulate dawn settlement
  sim.settleShipping(sim.clock.currentTick);

  assert.equal(cow.pettedToday, false, 'pettedToday should reset at dawn');
  assert.equal(cow.producedToday, true, 'cow should be ready to produce milk when happiness >= 50');

  // Player interacts with cow to collect milk
  const cowPos = sim.ecs.getComponent<any>(cowId, 'Position')!;
  const playerPos = sim.ecs.getComponent<any>(sim.playerEntityId, 'Position')!;
  playerPos.x = cowPos.x + 0.5;
  playerPos.y = cowPos.y;

  sim.enqueueCommand('PET_ANIMAL', sim.playerEntityId, { targetEntityId: cowId });
  sim.step();

  const inv = sim.ecs.getComponent<InventoryComponent>(sim.playerEntityId, 'Inventory')!;
  assert.equal(hasItem(inv, 'product_milk', 1), true, 'Player should have collected fresh milk');
  assert.equal(cow.producedToday, false, 'Product should be marked collected');
});
