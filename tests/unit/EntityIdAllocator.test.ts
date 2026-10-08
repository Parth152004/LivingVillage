import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityIdAllocator } from '../../src/ecs/EntityIdAllocator.js';

test('EntityIdAllocator: allocates sequential unique IDs', () => {
  const allocator = new EntityIdAllocator();
  const id1 = allocator.allocate();
  const id2 = allocator.allocate();
  const id3 = allocator.allocate();

  assert.notEqual(id1, id2);
  assert.notEqual(id2, id3);
  assert.equal(allocator.activeEntityCount, 3);
  assert.ok(allocator.isValid(id1));
  assert.ok(allocator.isValid(id2));
  assert.ok(allocator.isValid(id3));
});

test('EntityIdAllocator: recycling increments generation and invalidates old ID', () => {
  const allocator = new EntityIdAllocator();
  const idA = allocator.allocate();
  const { index: indexA, generation: genA } = EntityIdAllocator.unpack(idA);

  assert.equal(allocator.isValid(idA), true);

  // Release
  const released = allocator.release(idA);
  assert.equal(released, true);
  assert.equal(allocator.isValid(idA), false);
  assert.equal(allocator.activeEntityCount, 0);

  // Re-allocating reuses the index with an incremented generation
  const idB = allocator.allocate();
  const { index: indexB, generation: genB } = EntityIdAllocator.unpack(idB);

  assert.equal(indexB, indexA);
  assert.equal(genB, genA + 1);
  assert.notEqual(idA, idB);
  assert.equal(allocator.isValid(idA), false); // Old ID remains invalid!
  assert.equal(allocator.isValid(idB), true);  // New ID is valid!
});

test('EntityIdAllocator: rejects double-release and invalid IDs', () => {
  const allocator = new EntityIdAllocator();
  const id = allocator.allocate();

  assert.equal(allocator.release(id), true);
  assert.equal(allocator.release(id), false); // Double release fails cleanly
  assert.equal(allocator.release(EntityIdAllocator.NULL_ENTITY), false);
  assert.equal(allocator.release(9999999), false);
});

test('EntityIdAllocator: snapshot and restore preserves validity and allocation state', () => {
  const allocator = new EntityIdAllocator();
  const id1 = allocator.allocate();
  const id2 = allocator.allocate();
  const id3 = allocator.allocate();
  allocator.release(id2);

  const snapshot = allocator.getSnapshot();

  const restored = new EntityIdAllocator();
  restored.restoreSnapshot(snapshot);

  assert.equal(restored.activeEntityCount, 2);
  assert.equal(restored.isValid(id1), true);
  assert.equal(restored.isValid(id2), false);
  assert.equal(restored.isValid(id3), true);

  // Next allocation on restored allocator should reuse id2's index
  const id4 = restored.allocate();
  assert.equal(EntityIdAllocator.unpack(id4).index, EntityIdAllocator.unpack(id2).index);
});
