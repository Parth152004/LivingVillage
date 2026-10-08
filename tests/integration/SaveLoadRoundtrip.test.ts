import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';

test('SaveLoadRoundtrip: saves world state to disk and restores with 100% fidelity', () => {
  const testSaveDir = path.join(process.cwd(), 'temp_test_saves');
  const testSavePath = path.join(testSaveDir, 'test_slot1.sav');

  try {
    const originalSim = new WorldSimulation({ seed: 12345 });

    // Populate world
    const e1 = originalSim.ecs.createEntity();
    originalSim.ecs.addComponent<PositionComponent>(e1, 'Position', { x: 12.5, y: 18.5 });

    const e2 = originalSim.ecs.createEntity();
    originalSim.ecs.addComponent<PositionComponent>(e2, 'Position', { x: 50.0, y: 55.0 });

    originalSim.chunks.setTile(12, 18, { terrainType: 2, moisture: 80, fertility: 95 });
    originalSim.chunks.setTile(50, 55, { terrainType: 3, moisture: 10, fertility: 20 });

    // Step 15 ticks
    originalSim.stepMany(15);
    originalSim.assertInvariants();

    // Save to disk atomically
    SaveManager.saveAtomicSync(testSavePath, originalSim);
    assert.equal(fs.existsSync(testSavePath), true);

    // Create a new fresh simulation with different seed
    const loadedSim = new WorldSimulation({ seed: 99999 });
    SaveManager.loadSync(testSavePath, loadedSim);

    // Verify all state matches
    assert.equal(loadedSim.currentTick, originalSim.currentTick);
    assert.equal(loadedSim.seed, originalSim.seed);
    assert.equal(loadedSim.ecs.activeEntityCount, originalSim.ecs.activeEntityCount);

    const pos1 = loadedSim.ecs.getComponent<PositionComponent>(e1, 'Position')!;
    assert.deepEqual(pos1, { x: 12.5, y: 18.5 });

    const tile1 = loadedSim.chunks.getTile(12, 18)!;
    assert.equal(tile1.moisture, 80);
    assert.equal(tile1.fertility, 95);

    // Verify spatial hash works in loaded sim
    const nearby = loadedSim.spatialHash.queryRange(12.5, 18.5, 1.0);
    assert.equal(nearby.length, 1);
    assert.equal(nearby[0]!.entityId, e1);

    // Invariants pass on loaded sim
    loadedSim.assertInvariants();

    // Step both 20 more ticks and verify they stay in lockstep
    for (let i = 0; i < 20; i++) {
      originalSim.step();
      loadedSim.step();
      assert.equal(originalSim.rng.nextUint32(), loadedSim.rng.nextUint32());
    }

    assert.equal(loadedSim.currentTick, originalSim.currentTick);
  } finally {
    // Cleanup temporary test directory
    if (fs.existsSync(testSaveDir)) {
      fs.rmSync(testSaveDir, { recursive: true, force: true });
    }
  }
});
