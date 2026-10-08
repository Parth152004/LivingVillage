import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';

test('Determinism: Seed 12345 produces bit-for-bit identical state across 10,000 ticks', () => {
  const SEED = 12345;
  const TOTAL_TICKS = 10000;

  function runSimulation(seed: number): {
    finalTick: number;
    entityCount: number;
    rngChecksum: number;
    snapshotJson: string;
  } {
    const sim = new WorldSimulation({ seed });

    // Populate initial world identically
    for (let i = 0; i < 20; i++) {
      const e = sim.ecs.createEntity();
      sim.ecs.addComponent<PositionComponent>(e, 'Position', {
        x: (i * 7) % 64,
        y: (i * 13) % 64
      });
      sim.chunks.setTile(i, i, {
        terrainType: i % 4,
        moisture: (i * 5) % 100,
        fertility: (i * 7) % 100
      });
    }

    // Run 10,000 ticks with deterministic events and RNG usage
    let rngChecksum = 0;
    for (let t = 0; t < TOTAL_TICKS; t++) {
      // Periodic command
      if (t % 500 === 0) {
        sim.enqueueCommand('TEST_COMMAND', 1, { payload: { tick: t } });
      }

      // Intermittent movement driven by deterministic PRNG
      if (t % 10 === 0) {
        const activeEntities = sim.ecs.queryEntities(['Position']);
        for (const id of activeEntities) {
          const pos = sim.ecs.getComponent<PositionComponent>(id, 'Position')!;
          pos.x += sim.rng.nextFloat() * 0.2 - 0.1;
          pos.y += sim.rng.nextFloat() * 0.2 - 0.1;
        }
      }

      rngChecksum = (rngChecksum + sim.rng.nextUint32()) >>> 0;
      sim.step();
    }

    sim.assertInvariants();

    return {
      finalTick: sim.currentTick,
      entityCount: sim.ecs.activeEntityCount,
      rngChecksum,
      snapshotJson: JSON.stringify(sim.getSnapshot())
    };
  }

  console.log(`Running Run A (${TOTAL_TICKS} ticks)...`);
  const runA = runSimulation(SEED);

  console.log(`Running Run B (${TOTAL_TICKS} ticks)...`);
  const runB = runSimulation(SEED);

  assert.equal(runA.finalTick, TOTAL_TICKS);
  assert.equal(runB.finalTick, TOTAL_TICKS);
  assert.equal(runA.entityCount, runB.entityCount);
  assert.equal(runA.rngChecksum, runB.rngChecksum, 'PRNG streams diverged between runs');
  assert.equal(runA.snapshotJson, runB.snapshotJson, 'World snapshot JSON diverged between identical runs');

  console.log('Result: DETERMINISTIC PASS (10,000 ticks bit-identical)');
});
