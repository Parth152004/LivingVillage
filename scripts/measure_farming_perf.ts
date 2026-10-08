import { performance } from 'node:perf_hooks';
import { WorldSimulation } from '../src/core/WorldSimulation.js';
import { SaveManager } from '../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../src/persistence/StorageDriver.js';
import { TIME_CONFIG } from '../src/farming/FarmingConfig.js';

console.log('==================================================');
console.log('PHASE 1B-1 SOIL & FARMING PERFORMANCE BENCHMARKS');
console.log('==================================================');

const sim = new WorldSimulation({ seed: 42 });
const player = sim.spawnPlayer(10, 10);

// Populate a full 32x32 chunk with 1,024 active farming tiles
for (let y = 0; y < 32; y++) {
  for (let x = 0; x < 32; x++) {
    sim.chunks.setTile(x, y, {
      terrainType: 2, // TilledSoil
      moisture: (x + y) % 2 === 0 ? 100 : 0,
      fertility: 60,
      cropTypeId: 1, // Parsnip
      cropStage: (x + y) % 4,
      growthDays: 0,
      matureDays: 0,
      dryDays: 0
    });
  }
}

// 1. Normal 20Hz Simulation Tick Duration (across 1,000 non-interval ticks)
const normalTickTimes: number[] = [];
for (let i = 0; i < 1000; i++) {
  const start = performance.now();
  sim.step();
  const dur = performance.now() - start;
  normalTickTimes.push(dur);
}
const avgNormalTick = normalTickTimes.reduce((a, b) => a + b, 0) / normalTickTimes.length;
console.log(`[Measured Result] Normal Simulation Tick Duration: ${avgNormalTick.toFixed(4)} ms`);

// 2. Hourly Farming Update (1,024 tiles moisture evaporation/rain check)
const hourlyTimes: number[] = [];
for (let i = 0; i < 50; i++) {
  const start = performance.now();
  sim.farming.processHourlyUpdate(sim.clock.currentTick, sim.chunks, sim.environment);
  const dur = performance.now() - start;
  hourlyTimes.push(dur);
}
const avgHourly = hourlyTimes.reduce((a, b) => a + b, 0) / hourlyTimes.length;
console.log(`[Measured Result] Hourly Farming Update (1,024 tiles): ${avgHourly.toFixed(4)} ms`);

// 3. Daily Dawn Farming Update (1,024 tiles biological crop progression & fallow check)
const dailyDawnTimes: number[] = [];
for (let i = 0; i < 50; i++) {
  const start = performance.now();
  sim.farming.processDailyDawnUpdate(sim.clock.currentTick, sim.chunks, sim.events);
  const dur = performance.now() - start;
  dailyDawnTimes.push(dur);
}
const avgDailyDawn = dailyDawnTimes.reduce((a, b) => a + b, 0) / dailyDawnTimes.length;
console.log(`[Measured Result] Daily Dawn Update (1,024 tiles biological evaluation): ${avgDailyDawn.toFixed(4)} ms`);

// 4. Save and Load with Full Farming Data (1,024 crops + inventory + persistence)
const driver = new MemoryStorageDriver();

const saveTimes: number[] = [];
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  SaveManager.save('perf_save_slot', sim, driver);
  const dur = performance.now() - start;
  saveTimes.push(dur);
}
const avgSave = saveTimes.reduce((a, b) => a + b, 0) / saveTimes.length;
const serialized = driver.load('perf_save_slot');
console.log(`[Measured Result] Save Snapshot with 1,024 Farming Tiles: ${avgSave.toFixed(3)} ms (Payload: ${(serialized.length / 1024).toFixed(2)} KB)`);

const loadTimes: number[] = [];
for (let i = 0; i < 20; i++) {
  const freshSim = new WorldSimulation({ seed: 1 });
  const start = performance.now();
  SaveManager.load('perf_save_slot', freshSim, driver);
  const dur = performance.now() - start;
  loadTimes.push(dur);
}
const avgLoad = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
console.log(`[Measured Result] Load Snapshot Deserialization & SHA-256 Check: ${avgLoad.toFixed(3)} ms`);

console.log('==================================================');
