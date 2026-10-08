import test from 'node:test';
import assert from 'node:assert/strict';
import { EntityRenderer } from '../../src/client/EntityRenderer.js';
import { Camera } from '../../src/client/Camera.js';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { WorldRenderSnapshot } from '../../src/presentation/RenderSnapshot.js';

test('EntityRenderer lifecycle: attaches exactly one Graphics instance to container upon construction', () => {
  const renderer = new EntityRenderer();
  assert.ok(renderer.container, 'Container must be defined');
  assert.equal(renderer.container.children.length, 1, 'Container must have exactly 1 child (the Graphics instance)');
});

test('EntityRenderer lifecycle: renders shipping_bin and seed_catalog branches without duplicating container children', () => {
  const renderer = new EntityRenderer();
  const camera = new Camera();

  const dummySnapshot: WorldRenderSnapshot = {
    tick: 100,
    isPaused: false,
    chunks: [],
    entities: [
      { id: 1, x: 14.5, y: 12.5, isPlayer: false, kind: 'shipping_bin' },
      { id: 2, x: 15.5, y: 12.5, isPlayer: false, kind: 'seed_catalog' },
      { id: 3, x: 12.5, y: 12.5, isPlayer: false, kind: 'bed' },
      { id: 4, x: 16.5, y: 16.5, isPlayer: true, kind: 'player' }
    ],
    playerEntityId: 4,
    bedEntityId: 3,
    shippingBinEntityId: 1,
    seedCatalogEntityId: 2,
    recentEvents: []
  };

  renderer.render(dummySnapshot, camera);
  assert.equal(renderer.container.children.length, 1, 'Container must retain exactly 1 child after rendering');
});

test('EntityRenderer lifecycle: repeated frames clear and reuse graphics without child accumulation', () => {
  const renderer = new EntityRenderer();
  const camera = new Camera();

  // Simulate 50 frames of animation / entity updates
  for (let frame = 0; frame < 50; frame++) {
    const frameSnapshot: WorldRenderSnapshot = {
      tick: frame * 10,
      isPaused: false,
      chunks: [],
      entities: [
        { id: 1, x: 14.5 + Math.sin(frame * 0.1), y: 12.5, isPlayer: false, kind: 'shipping_bin' },
        { id: 2, x: 15.5, y: 12.5 + Math.cos(frame * 0.1), isPlayer: false, kind: 'seed_catalog' },
        { id: 3, x: 12.5, y: 12.5, isPlayer: false, kind: 'bed' },
        { id: 4, x: 16.5 + frame * 0.05, y: 16.5, isPlayer: true, kind: 'player' }
      ],
      playerEntityId: 4,
      bedEntityId: 3,
      shippingBinEntityId: 1,
      seedCatalogEntityId: 2,
      recentEvents: []
    };

    renderer.render(frameSnapshot, camera);
    assert.equal(renderer.container.children.length, 1, `Container child count must remain 1 at frame ${frame}`);
  }
});

test('EntityRenderer lifecycle: renders full authoritative FarmsteadLayout snapshot cleanly', () => {
  const sim = new WorldSimulation({ seed: 710 });
  FarmsteadLayout.initialize(sim);

  const snapshot = sim.getRenderSnapshot();
  const renderer = new EntityRenderer();
  const camera = new Camera();
  camera.setTarget(16.5, 16.5, true);

  renderer.render(snapshot, camera);
  assert.equal(renderer.container.children.length, 1, 'FarmsteadLayout snapshot rendered into single Graphics child');
});
