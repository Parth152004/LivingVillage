import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialHash } from '../../src/world/SpatialHash.js';

test('SpatialHash: insert, update, remove, and range query', () => {
  const hash = new SpatialHash(4.0);

  hash.insert(1, 0, 0);
  hash.insert(2, 2, 0);
  hash.insert(3, 10, 10);

  assert.equal(hash.totalEntities, 3);
  assert.equal(hash.hasEntity(1), true);
  assert.equal(hash.hasEntity(99), false);

  // Range query centered at (0, 0) with radius 3 meters
  const resultsNear = hash.queryRange(0, 0, 3.0);
  assert.equal(resultsNear.length, 2);
  assert.equal(resultsNear[0]!.entityId, 1); // Closest (dist = 0)
  assert.equal(resultsNear[1]!.entityId, 2); // Next closest (dist = 2)

  // Update entity 2 to be far away
  hash.update(2, 50, 50);
  const resultsAfterMove = hash.queryRange(0, 0, 3.0);
  assert.equal(resultsAfterMove.length, 1);
  assert.equal(resultsAfterMove[0]!.entityId, 1);

  // Remove entity 1
  assert.equal(hash.remove(1), true);
  assert.equal(hash.remove(1), false); // Double remove returns false
  assert.equal(hash.queryRange(0, 0, 3.0).length, 0);
});

test('SpatialHash: deterministic ordering for equidistant entities', () => {
  const hash = new SpatialHash(4.0);

  // Insert multiple entities equidistant from origin (distance = 2m)
  hash.insert(50, 2, 0);
  hash.insert(10, 0, 2);
  hash.insert(30, -2, 0);
  hash.insert(20, 0, -2);

  const results = hash.queryRange(0, 0, 2.5);
  assert.equal(results.length, 4);

  // All have distanceSquared = 4. Tie-breaking MUST be ascending EntityId: 10, 20, 30, 50
  assert.equal(results[0]!.entityId, 10);
  assert.equal(results[1]!.entityId, 20);
  assert.equal(results[2]!.entityId, 30);
  assert.equal(results[3]!.entityId, 50);
});

test('SpatialHash: snapshot and restore preserves spatial lookups', () => {
  const hash = new SpatialHash(4.0);
  hash.insert(101, 12.5, 14.2);
  hash.insert(102, 13.0, 14.0);

  const snapshot = hash.getSnapshot();

  const restored = new SpatialHash(4.0);
  restored.restoreSnapshot(snapshot);

  assert.equal(restored.totalEntities, 2);
  const query = restored.queryRange(12.5, 14.0, 2.0);
  assert.equal(query.length, 2);
});
