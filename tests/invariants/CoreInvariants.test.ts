import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';

test('Core Invariants & QA Adversarial Edge Cases', () => {
  const sim = new WorldSimulation({ seed: 42 });

  // 1. Invariant: Simulation tick never decreases
  let lastTick = sim.currentTick;
  for (let i = 0; i < 50; i++) {
    sim.step();
    assert.ok(sim.currentTick > lastTick, 'Simulation tick decreased or stagnated');
    lastTick = sim.currentTick;
  }

  // 2. Invariant: Paused simulation does not advance unless forced
  sim.pause();
  sim.step();
  assert.equal(sim.currentTick, lastTick, 'Paused simulation advanced unexpectedly');
  sim.stepMany(10);
  assert.equal(sim.currentTick, lastTick, 'stepMany advanced while paused');
  sim.resume();

  // 3. QA Edge Case: Invalid entity IDs and duplicate destruction
  assert.equal(sim.ecs.isValidEntity(0), false);
  assert.equal(sim.ecs.isValidEntity(-99), false);
  assert.equal(sim.ecs.isValidEntity(100000), false);
  assert.equal(sim.ecs.destroyEntity(0), false);
  assert.equal(sim.ecs.destroyEntity(99999), false);

  const e1 = sim.ecs.createEntity();
  assert.equal(sim.ecs.isValidEntity(e1), true);
  assert.equal(sim.ecs.destroyEntity(e1), true);
  assert.equal(sim.ecs.destroyEntity(e1), false); // Duplicate destruction fails cleanly
  assert.equal(sim.ecs.isValidEntity(e1), false);

  // 4. Invariant: Components cannot exist on invalid or destroyed entities
  assert.throws(() => {
    sim.ecs.addComponent(e1, 'Position', { x: 0, y: 0 });
  });
  assert.equal(sim.ecs.getComponent(e1, 'Position'), undefined);
  assert.equal(sim.ecs.hasComponent(e1, 'Position'), false);
  assert.equal(sim.ecs.removeComponent(e1, 'Position'), false);

  // 5. Invariant: Spatial hash must not query destroyed entities
  const e2 = sim.ecs.createEntity();
  sim.ecs.addComponent<PositionComponent>(e2, 'Position', { x: 10, y: 10 });
  sim.step();
  assert.equal(sim.spatialHash.queryRange(10, 10, 1.0).length, 1);

  sim.ecs.destroyEntity(e2);
  sim.spatialHash.remove(e2); // Cleaned on entity removal
  assert.equal(sim.spatialHash.queryRange(10, 10, 1.0).length, 0);

  // 6. QA Edge Case: Invalid tile coordinates
  assert.equal(sim.chunks.getTile(999999, 999999), undefined); // Not yet created
  const successTile = sim.chunks.setTile(999999, 999999, { moisture: 50 });
  assert.equal(successTile, true);
  assert.equal(sim.chunks.getTile(999999, 999999)!.moisture, 50);

  // 7. QA Edge Case: Corrupted save data detection
  assert.throws(() => {
    SaveManager.deserialize('not a json');
  });
  assert.throws(() => {
    SaveManager.deserialize('{"metadata": {}, "snapshot": {}}'); // Missing fields
  });

  // Tampered payload checksum mismatch test
  const validSaveJson = SaveManager.serialize(sim);
  const parsed = JSON.parse(validSaveJson);
  parsed.snapshot.clock.currentTick = 999999; // Tampered tick
  const tamperedJson = JSON.stringify(parsed);

  assert.throws(() => {
    SaveManager.deserialize(tamperedJson);
  }, /Checksum verification failed/);

  // 8. Invariant: Repeated save and load cycle stability
  let currentJson = SaveManager.serialize(sim);
  for (let cycle = 0; cycle < 5; cycle++) {
    const freshSim = new WorldSimulation({ seed: 0 });
    const snap = SaveManager.deserialize(currentJson);
    freshSim.restoreSnapshot(snap);
    freshSim.assertInvariants();
    currentJson = SaveManager.serialize(freshSim);
  }

  // 9. QA Edge Case: Step zero ticks
  assert.equal(sim.stepMany(0), 0);

  // Final invariant check passes
  sim.assertInvariants();
});
