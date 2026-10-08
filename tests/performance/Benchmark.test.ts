import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { VelocityComponent } from '../../src/ecs/components/VelocityComponent.js';

test('Performance: Foundation Engine Benchmarks & Micro-Timings', () => {
  console.log('\n==================================================');
  console.log('PHASE 1A FOUNDATION PERFORMANCE BENCHMARKS');
  console.log('==================================================');

  const sim = new WorldSimulation({ seed: 42 });

  // 1. ECS Allocation Benchmark (50 entities with Position + Velocity)
  const ecsStart = performance.now();
  for (let i = 0; i < 50; i++) {
    const e = sim.ecs.createEntity();
    sim.ecs.addComponent<PositionComponent>(e, 'Position', { x: i * 2, y: i * 3 });
    sim.ecs.addComponent<VelocityComponent>(e, 'Velocity', { vx: 0.1, vy: 0.2 });
  }
  const ecsCreationMs = performance.now() - ecsStart;
  console.log(`[Measured Result] ECS 50 Entities + 100 Components Creation: ${ecsCreationMs.toFixed(3)} ms`);

  // 2. ECS Query Benchmark (1,000 queries over Position + Velocity)
  const queryStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    sim.ecs.queryEntities(['Position', 'Velocity']);
  }
  const queryMs = performance.now() - queryStart;
  console.log(`[Measured Result] ECS 1,000 Component Queries: ${queryMs.toFixed(3)} ms (avg ${(queryMs / 1000).toFixed(4)} ms/query)`);

  // 3. ChunkGrid Write Benchmark (Write full 32x32 = 1,024 tiles)
  const chunkStart = performance.now();
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      sim.chunks.setTile(x, y, { moisture: 80, fertility: 90, cropStage: 1 });
    }
  }
  const chunkWriteMs = performance.now() - chunkStart;
  console.log(`[Measured Result] ChunkGrid 1,024 Tile Updates: ${chunkWriteMs.toFixed(3)} ms (avg ${(chunkWriteMs / 1024).toFixed(4)} ms/tile)`);

  // 4. Spatial Hash Range Queries (1,000 queries)
  const spatialStart = performance.now();
  for (let i = 0; i < 1000; i++) {
    sim.spatialHash.queryRange((i % 50) * 2, (i % 50) * 3, 5.0);
  }
  const spatialMs = performance.now() - spatialStart;
  console.log(`[Measured Result] SpatialHash 1,000 Range Queries: ${spatialMs.toFixed(3)} ms (avg ${(spatialMs / 1000).toFixed(4)} ms/query)`);

  // 5. Simulation Tick Timings (Run warmup then 2,000 steady-state ticks)
  // Warm up V8 JIT compiler
  for (let w = 0; w < 100; w++) {
    sim.step();
  }

  const tickTimes: number[] = [];
  const TOTAL_BENCHMARK_TICKS = 2000;

  for (let t = 0; t < TOTAL_BENCHMARK_TICKS; t++) {
    const tStart = performance.now();
    sim.step();
    const tDuration = performance.now() - tStart;
    tickTimes.push(tDuration);
  }

  const totalTickTime = tickTimes.reduce((a, b) => a + b, 0);
  const avgTickMs = totalTickTime / TOTAL_BENCHMARK_TICKS;
  const worstTickMs = Math.max(...tickTimes);
  const sortedTicks = [...tickTimes].sort((a, b) => a - b);
  const p95TickMs = sortedTicks[Math.floor(TOTAL_BENCHMARK_TICKS * 0.95)]!;
  const p99TickMs = sortedTicks[Math.floor(TOTAL_BENCHMARK_TICKS * 0.99)]!;

  console.log(`[Measured Result] 2,000 Simulation Ticks Total Time: ${totalTickTime.toFixed(2)} ms`);
  console.log(`[Measured Result] Average Simulation Tick Duration: ${avgTickMs.toFixed(4)} ms`);
  console.log(`[Measured Result] 95th Percentile Tick Duration: ${p95TickMs.toFixed(4)} ms`);
  console.log(`[Measured Result] 99th Percentile Tick Duration: ${p99TickMs.toFixed(4)} ms`);
  console.log(`[Measured Result] Worst-Case Simulation Tick Duration: ${worstTickMs.toFixed(4)} ms`);

  // 6. Save & Load Serialization Timing
  const saveStart = performance.now();
  const serializedSave = SaveManager.serialize(sim);
  const saveMs = performance.now() - saveStart;
  console.log(`[Measured Result] Save Snapshot Serialization: ${saveMs.toFixed(3)} ms (Payload: ${(serializedSave.length / 1024).toFixed(2)} KB)`);

  const loadStart = performance.now();
  SaveManager.deserialize(serializedSave);
  const loadMs = performance.now() - loadStart;
  console.log(`[Measured Result] Save Snapshot Deserialization & SHA-256 Check: ${loadMs.toFixed(3)} ms`);

  console.log('==================================================\n');

  // Assert foundational efficiency
  assert.ok(avgTickMs < 1.0, `Average tick time ${avgTickMs}ms exceeded 1.0ms foundation budget`);
  assert.ok(p95TickMs < 1.0, `95th percentile tick time ${p95TickMs}ms exceeded 1.0ms foundation budget`);
  assert.ok(p99TickMs < 5.0, `99th percentile tick time ${p99TickMs}ms exceeded 5.0ms hard budget`);
  assert.ok(worstTickMs < 50.0, `Worst tick time ${worstTickMs}ms exceeded 50.0ms OS jitter budget`);
});
