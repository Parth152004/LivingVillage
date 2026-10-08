import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import {
  formatDayTime,
  getEnergyDisplay,
  GameplayUI
} from '../../src/client/GameplayUI.js';

test('Performance: UI calculations and render snapshot presentation benchmarks', () => {
  const sim = new WorldSimulation({ seed: 999, initialTick: 7200 });
  sim.spawnBed(12, 12);
  sim.spawnPlayer(16, 16);

  const snapshot = sim.getRenderSnapshot();

  // 1. Benchmark formatDayTime (10,000 runs)
  const timeStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    formatDayTime(7200 + i * 20);
  }
  const timeDurationMs = performance.now() - timeStart;
  const avgTimeMicroseconds = (timeDurationMs / 10000) * 1000;

  // 2. Benchmark getEnergyDisplay (10,000 runs)
  const energyStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    getEnergyDisplay(snapshot.player?.energy);
  }
  const energyDurationMs = performance.now() - energyStart;
  const avgEnergyMicroseconds = (energyDurationMs / 10000) * 1000;

  // 3. Benchmark Snapshot extraction + UI update simulation (1,000 runs)
  const ui = new GameplayUI();
  const frameStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    sim.step();
    const frameSnapshot = sim.getRenderSnapshot();
    ui.update(frameSnapshot);
  }
  const frameDurationMs = performance.now() - frameStart;
  const avgFrameDurationMs = frameDurationMs / 1000;

  console.log('\n==================================================');
  console.log('PHASE 1B-2 STEP 3 PRESENTATION & UI BENCHMARKS');
  console.log('==================================================');
  console.log(`[Measured Result] formatDayTime (10,000 calls): ${timeDurationMs.toFixed(3)} ms (avg ${avgTimeMicroseconds.toFixed(3)} µs/call)`);
  console.log(`[Measured Result] getEnergyDisplay (10,000 calls): ${energyDurationMs.toFixed(3)} ms (avg ${avgEnergyMicroseconds.toFixed(3)} µs/call)`);
  console.log(`[Measured Result] 1,000 Tick + Snapshot + UI Updates: ${frameDurationMs.toFixed(3)} ms (avg ${avgFrameDurationMs.toFixed(4)} ms/frame)`);
  console.log('==================================================\n');

  assert.ok(avgTimeMicroseconds < 50, 'formatDayTime must execute under 50µs');
  assert.ok(avgEnergyMicroseconds < 20, 'getEnergyDisplay must execute under 20µs');
  assert.ok(avgFrameDurationMs < 2.0, 'Frame simulation + UI update must easily achieve >500 fps (> 2.0ms budget)');
});
