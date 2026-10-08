import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { ShippingBinComponent } from '../../src/ecs/components/ShippingBinComponent.js';

test('RenderSnapshotCommerce: exposes shipping-bin items and accurately calculates estimated revenue using fixed sell prices', () => {
  const sim = new WorldSimulation({ seed: 801 });
  const { shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  // Parsnip: 35g, Potato: 80g, Cauliflower: 175g
  bin.items.push(
    { itemId: 'crop_parsnip', quantity: 3 },      // 3 * 35 = 105g
    { itemId: 'crop_potato', quantity: 2 },       // 2 * 80 = 160g
    { itemId: 'crop_cauliflower', quantity: 1 }   // 1 * 175 = 175g
  );

  const snapshot = sim.getRenderSnapshot();

  assert.ok(snapshot.shippingBin, 'shippingBin must be defined in snapshot');
  assert.equal(snapshot.shippingBin.items.length, 3, 'Must contain all 3 item stacks');
  assert.deepEqual(snapshot.shippingBin.items[0], { itemId: 'crop_parsnip', quantity: 3 });
  assert.deepEqual(snapshot.shippingBin.items[1], { itemId: 'crop_potato', quantity: 2 });
  assert.deepEqual(snapshot.shippingBin.items[2], { itemId: 'crop_cauliflower', quantity: 1 });

  // 105 + 160 + 175 = 440g
  assert.equal(snapshot.shippingBin.estimatedRevenue, 440, 'Estimated revenue must match exact sum of unit sell prices');
});

test('RenderSnapshotCommerce: deep copies shipping-bin items and preserves mutation isolation', () => {
  const sim = new WorldSimulation({ seed: 802 });
  const { shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  bin.items.push(
    { itemId: 'crop_parsnip', quantity: 3 },
    { itemId: 'crop_potato', quantity: 2 },
    { itemId: 'crop_cauliflower', quantity: 1 }
  );

  const snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.shippingBin);

  // Attempt hostile mutations on the presentation snapshot
  (snapshot.shippingBin.items as any).push({ itemId: 'crop_potato', quantity: 50 });
  (snapshot.shippingBin.items as any)[0].quantity = 999;
  (snapshot.shippingBin.items as any)[0].itemId = 'tampered_item';
  (snapshot.shippingBin as any).estimatedRevenue = 999999;

  // Retrieve authoritative ECS component
  const authoritativeBin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;

  assert.equal(authoritativeBin.items.length, 3, 'Authoritative bin array must not have added elements');
  assert.equal(authoritativeBin.items[0]!.itemId, 'crop_parsnip', 'Authoritative item ID must remain untampered');
  assert.equal(authoritativeBin.items[0]!.quantity, 3, 'Authoritative item quantity must remain untampered');
  assert.equal(authoritativeBin.items[1]!.itemId, 'crop_potato');
  assert.equal(authoritativeBin.items[1]!.quantity, 2);
  assert.equal(authoritativeBin.items[2]!.itemId, 'crop_cauliflower');
  assert.equal(authoritativeBin.items[2]!.quantity, 1);
});

test('RenderSnapshotCommerce: correctly handles empty shipping bin', () => {
  const sim = new WorldSimulation({ seed: 803 });
  FarmsteadLayout.initialize(sim);

  const snapshot = sim.getRenderSnapshot();
  assert.ok(snapshot.shippingBin, 'shippingBin must be defined for initialized farmstead');
  assert.equal(snapshot.shippingBin.items.length, 0, 'Items array must be empty');
  assert.equal(snapshot.shippingBin.estimatedRevenue, 0, 'Estimated revenue must be 0 for empty bin');
});

test('RenderSnapshotCommerce: handles simulation without a shipping bin entity', () => {
  const sim = new WorldSimulation({ seed: 804 });
  // Do NOT spawn shipping bin

  const snapshot = sim.getRenderSnapshot();
  assert.equal(snapshot.shippingBin, undefined, 'shippingBin must be undefined when no ShippingBin entity exists');
});

test('RenderSnapshotCommerce: repeated reads are observational, deterministic, and leave simulation state untouched', () => {
  const sim = new WorldSimulation({ seed: 805 });
  const { shippingBinEntityId } = FarmsteadLayout.initialize(sim);

  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinEntityId, 'ShippingBin')!;
  bin.items.push(
    { itemId: 'crop_potato', quantity: 5 }
  );

  const initialTick = sim.clock.currentTick;
  const initialRngState = sim.rng.getState();
  const initialEcsState = JSON.stringify(sim.ecs.getSnapshot());
  const initialChunkState = JSON.stringify(sim.chunks.getSnapshot());

  // Call getRenderSnapshot() multiple times
  const snap1 = sim.getRenderSnapshot();
  const snap2 = sim.getRenderSnapshot();
  const snap3 = sim.getRenderSnapshot(0.5);

  // Compare snapshot data
  assert.deepEqual(snap1.shippingBin, snap2.shippingBin);
  assert.deepEqual(snap1.shippingBin, snap3.shippingBin);
  assert.equal(snap1.shippingBin?.estimatedRevenue, 5 * 80); // 400g

  // Simulation state must remain bit-identical
  assert.equal(sim.clock.currentTick, initialTick, 'Tick must not advance');
  assert.deepEqual(sim.rng.getState(), initialRngState, 'RNG must not mutate');
  assert.equal(JSON.stringify(sim.ecs.getSnapshot()), initialEcsState, 'ECS must not mutate');
  assert.equal(JSON.stringify(sim.chunks.getSnapshot()), initialChunkState, 'Chunks must not mutate');
});
