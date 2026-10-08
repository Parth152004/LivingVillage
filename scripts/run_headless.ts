import * as path from 'node:path';
import * as fs from 'node:fs';
import { WorldSimulation } from '../src/core/WorldSimulation.js';
import { SaveManager } from '../src/persistence/SaveManager.js';
import { PositionComponent } from '../src/ecs/components/PositionComponent.js';

/**
 * Headless CLI Test Runner for Living Village.
 * 
 * Demonstrates:
 * 1. World creation with fixed seed
 * 2. Running N simulation ticks
 * 3. Inspecting state
 * 4. Atomic save to disk
 * 5. Fresh instance loading from save
 * 6. Continued simulation
 * 7. Invariant assertion
 */

function main() {
  const SEED = 424242;
  const TICKS_STAGE_1 = 5000;
  const TICKS_STAGE_2 = 5000;
  const SAVE_FILE = path.join(process.cwd(), 'temp_headless_run.sav');

  console.log('==================================================');
  console.log('LIVING VILLAGE HEADLESS TEST RUNNER');
  console.log(`Seed: ${SEED}`);
  console.log('==================================================\n');

  // 1. Create world
  console.log('1. Creating world simulation...');
  const sim = new WorldSimulation({ seed: SEED });

  // Populate dynamic entities and terrain
  for (let i = 0; i < 25; i++) {
    const e = sim.ecs.createEntity();
    sim.ecs.addComponent<PositionComponent>(e, 'Position', {
      x: (i * 3.5) % 64,
      y: (i * 4.2) % 64
    });
    sim.chunks.setTile(i, i, {
      terrainType: 1, // Dirt
      moisture: (i * 4) % 100,
      fertility: 75
    });
  }

  // 2. Run initial ticks
  console.log(`2. Simulating ${TICKS_STAGE_1} ticks (Stage 1)...`);
  const t0 = performance.now();
  for (let t = 0; t < TICKS_STAGE_1; t++) {
    sim.step();
  }
  const stage1Ms = performance.now() - t0;
  console.log(`   Stage 1 completed in ${stage1Ms.toFixed(2)} ms (avg ${(stage1Ms / TICKS_STAGE_1).toFixed(4)} ms/tick)`);

  // 3. Inspect state
  console.log('3. Inspecting simulation state:');
  console.log(`   - Current Tick: ${sim.currentTick}`);
  console.log(`   - Active Entities: ${sim.ecs.activeEntityCount}`);
  console.log(`   - Loaded Chunks: ${sim.chunks.loadedChunkCount}`);
  console.log(`   - Spatial Entities: ${sim.spatialHash.totalEntities}`);
  sim.assertInvariants();
  console.log('   - Invariants: PASS');

  // 4. Save state
  console.log(`4. Saving state atomically to: ${SAVE_FILE}`);
  SaveManager.saveAtomicSync(SAVE_FILE, sim);
  console.log(`   - Save verified with SHA-256 digest`);

  // 5. Load state into fresh simulation
  console.log('5. Loading state into fresh simulation instance...');
  const restoredSim = new WorldSimulation({ seed: 0 });
  SaveManager.loadSync(SAVE_FILE, restoredSim);
  console.log(`   - Restored Tick: ${restoredSim.currentTick}`);
  console.log(`   - Restored Active Entities: ${restoredSim.ecs.activeEntityCount}`);
  restoredSim.assertInvariants();
  console.log('   - Loaded Invariants: PASS');

  // 6. Continue simulation
  console.log(`6. Continuing simulation for ${TICKS_STAGE_2} more ticks (Stage 2)...`);
  const t1 = performance.now();
  for (let t = 0; t < TICKS_STAGE_2; t++) {
    restoredSim.step();
  }
  const stage2Ms = performance.now() - t1;
  console.log(`   Stage 2 completed in ${stage2Ms.toFixed(2)} ms (avg ${(stage2Ms / TICKS_STAGE_2).toFixed(4)} ms/tick)`);
  console.log(`   - Final Authoritative Tick: ${restoredSim.currentTick}`);

  // 7. Verify final invariants
  console.log('7. Verifying final invariants on restored world...');
  restoredSim.assertInvariants();
  console.log('   - Final Invariants: PASS');

  // Clean up test save file
  if (fs.existsSync(SAVE_FILE)) {
    fs.unlinkSync(SAVE_FILE);
  }

  console.log('\n==================================================');
  console.log('HEADLESS RUNNER COMPLETED SUCCESSFULLY: ALL CHECKS PASS');
  console.log('==================================================');
}

main();
