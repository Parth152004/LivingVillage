import test from 'node:test';
import assert from 'node:assert/strict';
import { ECSWorld } from '../../src/ecs/ECSWorld.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { VelocityComponent } from '../../src/ecs/components/VelocityComponent.js';

test('ECSWorld: entity creation, component attachment, query, and destruction', () => {
  const world = new ECSWorld();

  const e1 = world.createEntity();
  const e2 = world.createEntity();
  const e3 = world.createEntity();

  world.addComponent<PositionComponent>(e1, 'Position', { x: 10, y: 20 });
  world.addComponent<VelocityComponent>(e1, 'Velocity', { vx: 1, vy: 0 });

  world.addComponent<PositionComponent>(e2, 'Position', { x: 30, y: 40 });

  world.addComponent<VelocityComponent>(e3, 'Velocity', { vx: 0, vy: 2 });

  // Query Position
  const withPos = world.queryEntities(['Position']);
  assert.deepEqual(withPos, [e1, e2].sort((a, b) => a - b));

  // Query Velocity
  const withVel = world.queryEntities(['Velocity']);
  assert.deepEqual(withVel, [e1, e3].sort((a, b) => a - b));

  // Query Position + Velocity (Intersection)
  const withBoth = world.queryEntities(['Position', 'Velocity']);
  assert.deepEqual(withBoth, [e1]);

  // Read components
  const pos1 = world.getComponent<PositionComponent>(e1, 'Position');
  assert.ok(pos1);
  assert.equal(pos1.x, 10);
  assert.equal(pos1.y, 20);

  // Remove component
  const removed = world.removeComponent(e1, 'Velocity');
  assert.equal(removed, true);
  assert.equal(world.hasComponent(e1, 'Velocity'), false);
  assert.deepEqual(world.queryEntities(['Position', 'Velocity']), []);

  // Destroy e2
  assert.equal(world.destroyEntity(e2), true);
  assert.equal(world.isValidEntity(e2), false);
  assert.equal(world.getComponent(e2, 'Position'), undefined);
  assert.deepEqual(world.queryEntities(['Position']), [e1]);
});

test('ECSWorld: rejects adding components to invalid entity', () => {
  const world = new ECSWorld();
  assert.throws(() => {
    world.addComponent(999999, 'Position', { x: 0, y: 0 });
  });
});

test('ECSWorld: snapshot and restore preserves entities and components', () => {
  const world = new ECSWorld();
  const e1 = world.createEntity();
  const e2 = world.createEntity();

  world.addComponent<PositionComponent>(e1, 'Position', { x: 5, y: 15 });
  world.addComponent<PositionComponent>(e2, 'Position', { x: 25, y: 35 });
  world.addComponent<VelocityComponent>(e2, 'Velocity', { vx: -1, vy: 1 });

  const snapshot = world.getSnapshot();

  const restored = new ECSWorld();
  restored.restoreSnapshot(snapshot);

  assert.equal(restored.activeEntityCount, 2);
  assert.equal(restored.isValidEntity(e1), true);
  assert.equal(restored.isValidEntity(e2), true);

  const pos1 = restored.getComponent<PositionComponent>(e1, 'Position');
  assert.deepEqual(pos1, { x: 5, y: 15 });

  const pos2 = restored.getComponent<PositionComponent>(e2, 'Position');
  assert.deepEqual(pos2, { x: 25, y: 35 });

  const vel2 = restored.getComponent<VelocityComponent>(e2, 'Velocity');
  assert.deepEqual(vel2, { vx: -1, vy: 1 });

  assert.deepEqual(restored.queryEntities(['Position', 'Velocity']), [e2]);
});
