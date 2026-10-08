import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { Camera } from '../../src/client/Camera.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';

test('PlayerClientPipeline: Spawning player generates valid render snapshot', () => {
  const sim = new WorldSimulation({ seed: 42 });

  // Setup 32x32 grass chunk
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      sim.chunks.setTile(x, y, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
    }
  }

  const playerId = sim.spawnPlayer(10, 12);
  assert.ok(playerId > 0);
  assert.equal(sim.playerEntityId, playerId);

  const snapshot = sim.getRenderSnapshot(0.0);
  assert.equal(snapshot.playerEntityId, playerId);
  assert.equal(snapshot.entities.length, 1);

  const playerRender = snapshot.entities[0]!;
  assert.equal(playerRender.id, playerId);
  assert.equal(playerRender.isPlayer, true);
  assert.equal(playerRender.x, 10.5);
  assert.equal(playerRender.y, 12.5);

  assert.equal(snapshot.chunks.length, 1);
  assert.equal(snapshot.chunks[0]!.tiles.length, 1024);
});

test('PlayerClientPipeline: Input -> Command -> Simulation -> Render State update', () => {
  const sim = new WorldSimulation({ seed: 42 });

  // All tiles walkable
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      sim.chunks.setTile(x, y, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
    }
  }

  const playerId = sim.spawnPlayer(10, 10);
  const initialSnapshot = sim.getRenderSnapshot(0.0);
  assert.equal(initialSnapshot.entities[0]!.x, 10.5);
  assert.equal(initialSnapshot.entities[0]!.y, 10.5);

  // Enqueue MOVE right command (dx: 1, dy: 0, speed: 10.0 tiles/sec)
  // In 1 tick (50ms), distance moved = 10 * 0.05 = 0.5 tiles
  sim.enqueueCommand('MOVE', playerId, { payload: { dx: 1, dy: 0, speed: 10.0 } });

  // Authoritative step
  sim.step();

  const nextSnapshot = sim.getRenderSnapshot(0.0);
  const playerRender = nextSnapshot.entities[0]!;
  assert.equal(playerRender.x, 11.0);
  assert.equal(playerRender.y, 10.5);

  // Verify spatial hash synchronized
  const nearby = sim.spatialHash.queryRange(11.0, 10.5, 0.5);
  assert.equal(nearby.length, 1);
  assert.equal(nearby[0]!.entityId, playerId);

  // Verify event emitted
  const events = sim.events.getHistory();
  const moveEvent = events.find(e => e.type === 'PLAYER_MOVED');
  assert.ok(moveEvent);
  assert.equal(moveEvent.actorEntityId, playerId);
});

test('PlayerClientPipeline: Obstacle collision blocks movement authoritatively', () => {
  const sim = new WorldSimulation({ seed: 42 });

  // Tile (10, 10) walkable, Tile (11, 10) is water/blocked
  sim.chunks.setTile(10, 10, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  sim.chunks.setTile(11, 10, { terrainType: 4, flags: TILE_FLAGS.WATER }); // Blocked

  const playerId = sim.spawnPlayer(10, 10); // Center at (10.5, 10.5)

  // Try moving right into water
  sim.enqueueCommand('MOVE', playerId, { payload: { dx: 1, dy: 0, speed: 15.0 } });
  sim.step();

  const snapshot = sim.getRenderSnapshot(0.0);
  // Should NOT enter tile 11 (Math.floor(x) remains 10)
  assert.ok(snapshot.entities[0]!.x < 11.0, `Player breached blocked obstacle: ${snapshot.entities[0]!.x}`);
});

test('PlayerClientPipeline: Destroyed or invalid player cannot be controlled', () => {
  const sim = new WorldSimulation({ seed: 42 });
  sim.chunks.setTile(5, 5, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  const playerId = sim.spawnPlayer(5, 5);

  // Destroy player entity in ECS
  sim.ecs.destroyEntity(playerId);
  assert.equal(sim.ecs.isValidEntity(playerId), false);

  // Enqueue MOVE command for destroyed player
  sim.enqueueCommand('MOVE', playerId, { payload: { dx: 1, dy: 0 } });
  sim.step(); // Must not throw or crash

  const snapshot = sim.getRenderSnapshot(0.0);
  assert.equal(snapshot.entities.length, 0); // No entities rendered
});

test('PlayerClientPipeline: Paused simulation does not advance from player input', () => {
  const sim = new WorldSimulation({ seed: 42 });
  sim.chunks.setTile(5, 5, { terrainType: 0, flags: TILE_FLAGS.WALKABLE });
  const playerId = sim.spawnPlayer(5, 5);

  sim.pause();
  assert.equal(sim.isPaused, true);

  const initialX = sim.getRenderSnapshot(0.0).entities[0]!.x;

  // Enqueue move while paused
  sim.enqueueCommand('MOVE', playerId, { payload: { dx: 1, dy: 0 } });
  sim.step(); // Should be skipped due to pause

  const pausedSnapshot = sim.getRenderSnapshot(0.0);
  assert.equal(pausedSnapshot.entities[0]!.x, initialX);
  assert.equal(pausedSnapshot.isPaused, true);

  // Resume
  sim.resume();
  sim.step(); // Now command executes
  assert.ok(sim.getRenderSnapshot(0.0).entities[0]!.x > initialX);
});

test('PlayerClientPipeline: Save and load restores player state and snapshot fidelity', () => {
  const sim = new WorldSimulation({ seed: 42 });
  sim.chunks.setTile(8, 8, { terrainType: 1, moisture: 60 });
  const playerId = sim.spawnPlayer(8, 8);

  // Move player
  sim.enqueueCommand('MOVE', playerId, { payload: { dx: 1, dy: 1, speed: 10.0 } });
  sim.step();

  const originalSnapshot = sim.getRenderSnapshot(0.0);
  const memDriver = new MemoryStorageDriver();

  // Save via memory driver
  SaveManager.save('slot_test', sim, memDriver);

  // Restore into fresh sim
  const freshSim = new WorldSimulation({ seed: 0 });
  SaveManager.load('slot_test', freshSim, memDriver);

  assert.equal(freshSim.playerEntityId, playerId);
  const loadedSnapshot = freshSim.getRenderSnapshot(0.0);

  assert.equal(loadedSnapshot.playerEntityId, playerId);
  assert.equal(loadedSnapshot.entities.length, 1);
  assert.equal(loadedSnapshot.entities[0]!.x, originalSnapshot.entities[0]!.x);
  assert.equal(loadedSnapshot.entities[0]!.y, originalSnapshot.entities[0]!.y);
});

test('Camera: 60Hz smooth follow and coordinate transformations', () => {
  const camera = new Camera(800, 600);
  camera.setTarget(10, 10, true); // Immediate placement

  assert.equal(camera.x, 10);
  assert.equal(camera.y, 10);

  // Center tile should map to exact screen center (400, 300)
  const screenCenter = camera.worldToScreen(10, 10);
  assert.equal(screenCenter.screenX, 400);
  assert.equal(screenCenter.screenY, 300);

  // Screen center should map back to world (10, 10)
  const worldCenter = camera.screenToWorld(400, 300);
  assert.equal(worldCenter.worldX, 10);
  assert.equal(worldCenter.worldY, 10);

  // Move target
  camera.setTarget(20, 20, false);
  camera.update(0.1); // 100ms delta

  // Camera should smoothly move towards (20, 20) without snapping
  assert.ok(camera.x > 10 && camera.x < 20);
  assert.ok(camera.y > 10 && camera.y < 20);
});
