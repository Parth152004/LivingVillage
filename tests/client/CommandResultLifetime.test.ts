import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { PLAYER_CONFIG } from '../../src/player/PlayerConfig.js';
import { GameplayUI } from '../../src/client/GameplayUI.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';

test('CommandResultLifetime: lastCommandResult expires cleanly after 20 ticks', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  sim.playerEntityId = player;

  // Execute a discrete command: TILL invalid grass/water or without hoe
  // By default, player has hoe in slot 0. Let's till an invalid out-of-reach tile to trigger rejection
  sim.enqueueCommand('TILL', player, { targetTileX: 50, targetTileY: 50 });
  sim.step(); // Executes command on tick 7200

  // Check that command result is recorded
  assert.ok(sim.lastCommandResult !== null, 'Command result should be recorded');
  assert.equal(sim.lastCommandResult?.type, 'TILL');
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(sim.lastCommandResult?.reason, 'Too far away');
  assert.equal(sim.lastCommandResult?.tick, 7200);

  // Snapshot exposes the result
  let snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.lastCommandResult !== null);
  assert.equal(snapshot.lastCommandResult?.success, false);

  // Step 19 ticks forward (tick 7219) -> elapsed 19 ticks <= 20 ticks lifetime
  sim.stepMany(19);
  assert.equal(sim.clock.currentTick, 7220);
  snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.lastCommandResult !== null, 'Should remain visible within 20 ticks');

  // Step 1 more tick (tick 7221) -> elapsed 21 ticks > 20 ticks lifetime
  sim.step();
  assert.equal(sim.clock.currentTick, 7221);
  snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.lastCommandResult, null, 'Should expire to null after 20 ticks');
  assert.equal(sim.lastCommandResult, null, 'Simulation state should have cleared stale result');
});

test('CommandResultLifetime: MOVE commands do not clobber discrete action feedback', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  sim.playerEntityId = player;

  // Trigger rejection feedback
  sim.enqueueCommand('TILL', player, { targetTileX: 50, targetTileY: 50 });
  sim.step();

  assert.equal(sim.lastCommandResult?.type, 'TILL');
  assert.equal(sim.lastCommandResult?.reason, 'Too far away');

  // On next tick, continuous movement occurs
  sim.enqueueCommand('MOVE', player, { payload: { dx: 1, dy: 0, speed: 5.0 } });
  sim.step();

  // MOVE must NOT have overwritten lastCommandResult
  assert.equal(sim.lastCommandResult?.type, 'TILL', 'MOVE should not clobber discrete action feedback');
  assert.equal(sim.lastCommandResult?.reason, 'Too far away');
});

test('CommandResultLifetime: success and rejection results are distinguishable', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  sim.playerEntityId = player;

  // Rejection
  sim.enqueueCommand('TILL', player, { targetTileX: 99, targetTileY: 99 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, false);
  assert.equal(typeof sim.lastCommandResult?.reason, 'string');

  // Valid till directly in reach (e.g. tile 11, 10)
  sim.chunks.setTile(11, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.enqueueCommand('TILL', player, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(sim.lastCommandResult?.reason, undefined);
});

test('CommandResultLifetime: UI feedback does not mutate simulation state', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  sim.playerEntityId = player;

  const ui = new GameplayUI();
  const snapshot = sim.getRenderSnapshot();

  const tickBefore = sim.clock.currentTick;
  const energyBefore = snapshot.player?.energy.current;

  ui.update(snapshot);
  ui.showFeedback('Test Notification', '#1b5e20');

  // Verify zero simulation mutation
  assert.equal(sim.clock.currentTick, tickBefore, 'Tick must not advance');
  assert.equal(sim.getRenderSnapshot().player?.energy.current, energyBefore, 'Energy must not change');
});

test('CommandResultLifetime: getRenderSnapshot() is purely observational and does not mutate state or cause expiration', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  sim.playerEntityId = player;

  sim.enqueueCommand('TILL', player, { targetTileX: 50, targetTileY: 50 });
  sim.step(); // tick 7200, command recorded

  const commandResultBefore = { ...sim.lastCommandResult! };
  const tickBefore = sim.clock.currentTick;
  const rngStateBefore = sim.rng.getState();

  // Call getRenderSnapshot() repeatedly
  const s1 = sim.getRenderSnapshot();
  const s2 = sim.getRenderSnapshot();
  const s3 = sim.getRenderSnapshot();

  // 1. Repeated calls produce identical snapshots
  assert.deepEqual(s1, s2);
  assert.deepEqual(s2, s3);
  assert.deepEqual(s1.lastCommandResult, commandResultBefore);

  // 2. Authoritative state must NOT have changed at all
  assert.equal(sim.clock.currentTick, tickBefore, 'Tick must not advance');
  assert.deepEqual(sim.rng.getState(), rngStateBefore, 'RNG must not mutate');
  assert.deepEqual(sim.lastCommandResult, commandResultBefore, 'lastCommandResult must not mutate on snapshot call');

  // 3. Verify snapshot generation itself does not cause expiration
  // Advance 19 ticks via simulation step()
  sim.stepMany(19);
  assert.equal(sim.clock.currentTick, 7220);

  // Multiple snapshot calls at tick 7220 still preserve command result
  const mid1 = sim.getRenderSnapshot();
  const mid2 = sim.getRenderSnapshot();
  assert.ok(mid1.lastCommandResult !== null);
  assert.deepEqual(mid1.lastCommandResult, commandResultBefore);
  assert.deepEqual(mid2.lastCommandResult, commandResultBefore);
  assert.deepEqual(sim.lastCommandResult, commandResultBefore);

  // 4. Command result expires strictly during simulation step() beyond 20 ticks
  sim.step(); // tick 7221: elapsed 21 ticks > 20
  assert.equal(sim.clock.currentTick, 7221);
  assert.equal(sim.lastCommandResult, null, 'Simulation step must clear expired result');

  const postExpire = sim.getRenderSnapshot();
  assert.equal(postExpire.lastCommandResult, null);
});

