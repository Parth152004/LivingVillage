import test from 'node:test';
import assert from 'node:assert/strict';
import { DeterministicRng } from '../../src/core/DeterministicRng.js';

test('DeterministicRng: produces identical sequence for identical seed', () => {
  const rng1 = new DeterministicRng(12345);
  const rng2 = new DeterministicRng(12345);

  for (let i = 0; i < 1000; i++) {
    const v1 = rng1.nextUint32();
    const v2 = rng2.nextUint32();
    assert.equal(v1, v2, `Sequence diverged at index ${i}`);
  }
});

test('DeterministicRng: produces different sequences for different seeds', () => {
  const rng1 = new DeterministicRng(12345);
  const rng2 = new DeterministicRng(54321);

  let differences = 0;
  for (let i = 0; i < 100; i++) {
    if (rng1.nextUint32() !== rng2.nextUint32()) {
      differences++;
    }
  }
  assert.ok(differences > 90, 'Expected different seeds to diverge significantly');
});

test('DeterministicRng: float bounds [0, 1) and range bounds [min, max]', () => {
  const rng = new DeterministicRng(999);

  for (let i = 0; i < 1000; i++) {
    const f = rng.nextFloat();
    assert.ok(f >= 0.0 && f < 1.0, `Float out of bounds: ${f}`);

    const intVal = rng.nextIntRange(5, 15);
    assert.ok(intVal >= 5 && intVal <= 15, `Int out of bounds: ${intVal}`);
    assert.ok(Number.isInteger(intVal));
  }
});

test('DeterministicRng: state save and restore reproduces exact continuation', () => {
  const rng = new DeterministicRng(777);

  // Advance 250 steps
  for (let i = 0; i < 250; i++) {
    rng.nextUint32();
  }

  // Save state
  const stateSnapshot = rng.getState();

  // Generate next 100 values from original
  const originalNext100: number[] = [];
  for (let i = 0; i < 100; i++) {
    originalNext100.push(rng.nextUint32());
  }

  // Create new RNG and restore state
  const restoredRng = new DeterministicRng(0);
  restoredRng.setState(stateSnapshot);

  // Generate 100 values from restored
  const restoredNext100: number[] = [];
  for (let i = 0; i < 100; i++) {
    restoredNext100.push(restoredRng.nextUint32());
  }

  assert.deepEqual(originalNext100, restoredNext100, 'Restored RNG did not match original continuation');
});
