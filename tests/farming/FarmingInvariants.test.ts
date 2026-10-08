import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { TIME_CONFIG, FARMING_CONFIG } from '../../src/farming/FarmingConfig.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { InventoryComponent } from '../../src/ecs/components/InventoryComponent.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';

test('FarmingInvariants: Paused simulation completely halts biological growth and commands', () => {
  const sim = new WorldSimulation({ seed: 401 });
  const playerId = sim.spawnPlayer(10, 10);

  sim.chunks.setTile(11, 10, {
    terrainType: 2,
    moisture: 100,
    cropTypeId: 1,
    cropStage: 0,
    growthDays: 0
  });

  sim.pause();
  assert.equal(sim.isPaused, true);

  // Attempting to till adjacent grass while paused
  sim.chunks.setTile(10, 11, { terrainType: 0 });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 10, targetTileY: 11 });

  // Step 100 ticks (paused)
  sim.stepMany(100);

  // Command was NOT processed, crop did NOT grow
  assert.equal(sim.chunks.getTile(10, 11)!.terrainType, 0, 'Command must not execute while paused');
  assert.equal(sim.chunks.getTile(11, 10)!.growthDays, 0, 'Growth must freeze while paused');
  assert.equal(sim.clock.currentTick, 0, 'Clock must not advance while paused');
});

test('FarmingInvariants: Euclidean distance boundary strictly rejects > 1.5 tiles', () => {
  const sim = new WorldSimulation({ seed: 402 });
  const playerId = sim.spawnPlayer(10, 10); // Player center is at (10.5, 10.5)

  // Direct Cardinal: (11, 10) -> center (11.5, 10.5) -> dist = 1.0 <= 1.5 (VALID)
  sim.chunks.setTile(11, 10, { terrainType: 0 });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 10 });
  sim.step();
  assert.equal(sim.chunks.getTile(11, 10)!.terrainType, 2, 'Cardinal neighbor distance 1.0 must be allowed');

  // Direct Diagonal: (11, 11) -> center (11.5, 11.5) -> dist = sqrt(1^2 + 1^2) = 1.414 <= 1.5 (VALID)
  sim.chunks.setTile(11, 11, { terrainType: 0 });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 11, targetTileY: 11 });
  sim.step();
  assert.equal(sim.chunks.getTile(11, 11)!.terrainType, 2, 'Diagonal neighbor distance 1.414 must be allowed');

  // Two tiles away: (12, 10) -> center (12.5, 10.5) -> dist = 2.0 > 1.5 (REJECTED)
  sim.chunks.setTile(12, 10, { terrainType: 0 });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 12, targetTileY: 10 });
  sim.step();
  assert.equal(sim.chunks.getTile(12, 10)!.terrainType, 0, 'Distance 2.0 must be rejected');

  // Knight move: (12, 11) -> center (12.5, 11.5) -> dist = sqrt(2^2 + 1^2) = 2.236 > 1.5 (REJECTED)
  sim.chunks.setTile(12, 11, { terrainType: 0 });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 12, targetTileY: 11 });
  sim.step();
  assert.equal(sim.chunks.getTile(12, 11)!.terrainType, 0, 'Distance 2.236 must be rejected');
});

test('FarmingInvariants: Neglected unseeded tilled soil reverts to untilled dirt after 2 days at zero moisture', () => {
  const sim = new WorldSimulation({ seed: 403 });
  // Tilled furrow with zero moisture, no seeds
  sim.chunks.setTile(10, 10, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    moisture: 0,
    cropTypeId: 0,
    dryDays: 0
  });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;

  // Day 1
  sim.stepMany(DAY_TICKS);
  let tile = sim.chunks.getTile(10, 10)!;
  assert.equal(tile.terrainType, 2, 'Day 1: Furrow still tilled');
  assert.equal(tile.dryDays, 1);

  // Day 2: Reaches FALLOW_DEGRADE_DAYS (2) -> Reverts to untilled Dirt (1)
  sim.stepMany(DAY_TICKS);
  tile = sim.chunks.getTile(10, 10)!;
  assert.equal(tile.terrainType, 1, 'Day 2: Furrow must revert to untilled Dirt (1)');
  assert.ok((tile.flags & TILE_FLAGS.TILLED) === 0, 'TILLED flag must be removed');
  assert.equal(tile.dryDays, 0);
});

test('FarmingInvariants: Farming does not independently define seasons or recover fallow fertility without external signal', () => {
  const sim = new WorldSimulation({ seed: 404 });
  // Depleted untilled dirt
  sim.chunks.setTile(10, 10, {
    terrainType: 1, // Dirt
    fertility: 20
  });

  const DAY_TICKS = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;
  const DAWN_TICKS = TIME_CONFIG.DAWN_HOUR * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
  const ARBITRARY_28_DAYS = 28;

  // Step through 28 days (plus dawn offset) without any external calendar signal
  sim.stepMany(DAY_TICKS * ARBITRARY_28_DAYS + DAWN_TICKS);

  const tile = sim.chunks.getTile(10, 10)!;
  // Farming subsystem must NOT unilaterally advance seasons or regenerate fertility
  assert.equal(tile.fertility, 20, 'Fallow fertility must NOT change passively after 28 days without external season signal');

  // Step another 28 days (56 days total)
  sim.stepMany(DAY_TICKS * ARBITRARY_28_DAYS);
  assert.equal(tile.fertility, 20, 'Fallow fertility must remain 20 after 56 days without external season signal');
});

test('FarmingInvariants: Fallow depleted dirt recovers fertility up to baseline 50 when external seasonal boundary is triggered', () => {
  const sim = new WorldSimulation({ seed: 405 });
  // Depleted untilled dirt (eligible for fallow recovery)
  sim.chunks.setTile(10, 10, {
    terrainType: 1, // Dirt
    fertility: 20,
    cropTypeId: 0
  });

  // Tilled furrow (not fallow, ineligible)
  sim.chunks.setTile(10, 11, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    fertility: 20,
    cropTypeId: 0
  });

  // Cultivated crop tile (active crop, ineligible)
  sim.chunks.setTile(10, 12, {
    terrainType: 2,
    flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED,
    cropTypeId: 1,
    fertility: 20
  });

  // Stone terrain (ineligible)
  sim.chunks.setTile(10, 13, {
    terrainType: 3,
    fertility: 20
  });

  // Trigger Season 1 Boundary externally
  const recovered1 = sim.triggerSeasonalFallowRecovery();
  assert.equal(recovered1, 1, 'Exactly 1 untilled fallow dirt tile must recover');

  const dirtTile = sim.chunks.getTile(10, 10)!;
  assert.equal(dirtTile.fertility, 35, 'Season 1 fallow recovery: 20 + 15 = 35');

  // Non-fallow tiles must NOT recover
  assert.equal(sim.chunks.getTile(10, 11)!.fertility, 20, 'Tilled furrow must not recover fertility');
  assert.equal(sim.chunks.getTile(10, 12)!.fertility, 20, 'Planted crop tile must not recover fertility');
  assert.equal(sim.chunks.getTile(10, 13)!.fertility, 20, 'Stone tile must not recover fertility');

  // Verify event emitted
  const events = sim.events.getEventsOfType('FALLOW_RECOVERY_APPLIED');
  assert.equal(events.length, 1);
  assert.equal(events[0]?.payload?.recoveredTiles, 1);
  assert.equal(events[0]?.payload?.recoveryAmount, FARMING_CONFIG.FALLOW_FERTILITY_RECOVERY);

  // Trigger Season 2 Boundary externally (reaches baseline 50, capped)
  const recovered2 = sim.triggerSeasonalFallowRecovery();
  assert.equal(recovered2, 1);
  assert.equal(dirtTile.fertility, 50, 'Season 2 fallow recovery: 35 + 15 = 50 (capped at baseline)');

  // Trigger Season 3 Boundary externally (already at 50, no recovery above baseline)
  const recovered3 = sim.triggerSeasonalFallowRecovery();
  assert.equal(recovered3, 0, 'No tiles below baseline 50, recovered count is 0');
  assert.equal(dirtTile.fertility, 50, 'Fallow recovery must not exceed baseline 50');
});

test('FarmingInvariants: Fallow fertility state and recovery remain deterministic across save/load', () => {
  const sim = new WorldSimulation({ seed: 407 });
  sim.chunks.setTile(10, 10, {
    terrainType: 1,
    fertility: 20
  });

  // External trigger applied
  sim.triggerSeasonalFallowRecovery();
  assert.equal(sim.chunks.getTile(10, 10)!.fertility, 35);

  // Serialize simulation state
  const serialized = SaveManager.serialize(sim);

  // Create clean simulation and restore
  const simRestored = new WorldSimulation({ seed: 999 });
  const snapshot = SaveManager.deserialize(serialized);
  simRestored.restoreSnapshot(snapshot);

  assert.equal(simRestored.chunks.getTile(10, 10)!.fertility, 35, 'Restored tile fertility must match exactly');

  // Trigger next seasonal recovery on restored sim
  simRestored.triggerSeasonalFallowRecovery();
  assert.equal(simRestored.chunks.getTile(10, 10)!.fertility, 50, 'Restored sim must deterministically cap at baseline 50');
});
