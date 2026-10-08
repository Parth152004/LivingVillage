import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';

test('WorldSimulation: full tick pipeline execution and spatial synchronization', () => {
  const sim = new WorldSimulation({ seed: 42 });

  // Create an entity with a Position
  const player = sim.ecs.createEntity();
  sim.ecs.addComponent<PositionComponent>(player, 'Position', { x: 10.0, y: 15.0 });

  // Set a tile
  sim.chunks.setTile(10, 15, { terrainType: 1, moisture: 50 });

  // Enqueue a command
  sim.enqueueCommand('TEST_COMMAND', player, { payload: { note: 'test' } });

  assert.equal(sim.currentTick, 0);

  // Step 1 tick
  sim.step();

  assert.equal(sim.currentTick, 1);

  // Verify command executed and emitted event in history
  const history = sim.events.getHistory();
  assert.equal(history.length, 1);
  assert.equal(history[0]!.type, 'TEST_COMMAND_EXECUTED');
  assert.equal(history[0]!.actorEntityId, player);

  // Verify spatial hash synchronized with PositionComponent
  const nearby = sim.spatialHash.queryRange(10.0, 15.0, 1.0);
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0]!.entityId, player);

  // Update position component
  const pos = sim.ecs.getComponent<PositionComponent>(player, 'Position')!;
  pos.x = 25.0;
  pos.y = 30.0;

  // Step another tick
  sim.step();
  assert.equal(sim.currentTick, 2);

  // Spatial hash updated
  assert.equal(sim.spatialHash.queryRange(10.0, 15.0, 1.0).length, 0);
  assert.equal(sim.spatialHash.queryRange(25.0, 30.0, 1.0).length, 1);

  // Invariants pass
  sim.assertInvariants();
});
