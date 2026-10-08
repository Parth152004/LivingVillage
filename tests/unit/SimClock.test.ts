import test from 'node:test';
import assert from 'node:assert/strict';
import { SimClock } from '../../src/core/SimClock.js';

test('SimClock: advances tick by tick deterministically', () => {
  const clock = new SimClock(0);
  assert.equal(clock.currentTick, 0);
  assert.equal(clock.virtualTimeSeconds, 0);

  const advanced = clock.step();
  assert.equal(advanced, true);
  assert.equal(clock.currentTick, 1);
  assert.equal(clock.virtualTimeSeconds, 0.05);

  clock.stepMany(19);
  assert.equal(clock.currentTick, 20); // 1 second of in-game time at 20Hz
  assert.equal(clock.virtualTimeSeconds, 1.0);
});

test('SimClock: handles pause and resume', () => {
  const clock = new SimClock(100);
  clock.pause();
  assert.equal(clock.isPaused, true);

  const advanced = clock.step();
  assert.equal(advanced, false);
  assert.equal(clock.currentTick, 100);

  const advancedMany = clock.stepMany(10);
  assert.equal(advancedMany, 0);
  assert.equal(clock.currentTick, 100);

  // Forced step works even when paused
  clock.step(true);
  assert.equal(clock.currentTick, 101);

  clock.resume();
  assert.equal(clock.isPaused, false);
  clock.step();
  assert.equal(clock.currentTick, 102);
});

test('SimClock: snapshots and restores cleanly', () => {
  const clock = new SimClock(50);
  clock.pause();
  clock.setSpeedMultiplier(2.5);

  const snap = clock.getSnapshot();

  const restored = new SimClock(0);
  restored.restoreSnapshot(snap);

  assert.equal(restored.currentTick, 50);
  assert.equal(restored.isPaused, true);
  assert.equal(restored.speedMultiplier, 2.5);
});

test('SimClock: rejects negative initial tick or invalid steps', () => {
  assert.throws(() => new SimClock(-1));
  assert.throws(() => new SimClock(1.5));
  const clock = new SimClock(0);
  assert.throws(() => clock.stepMany(-5));
  assert.throws(() => clock.setSpeedMultiplier(0));
});
