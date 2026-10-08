import { WorldSimulation } from '../core/WorldSimulation.js';
import { GameClient } from './GameClient.js';
import { TILE_FLAGS, TERRAIN_TYPES } from '../world/ChunkGrid.js';
import { FarmsteadLayout } from '../world/FarmsteadLayout.js';

async function bootstrap() {
  const container = document.getElementById('game-container');
  const hud = document.getElementById('hud-container');
  if (!container) {
    throw new Error('Canvas container #game-container not found in DOM');
  }

  // 1. Initialize Authoritative WorldSimulation (Seed: 42, starting at Day 1 06:00 AM / tick 7200)
  const sim = new WorldSimulation({ seed: 42, initialTick: 7200 });

  // 2. Populate one 32x32 ChunkGrid chunk with varied terrain
  console.log('Generating 32x32 foundation chunk...');
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      let terrain: number = TERRAIN_TYPES.GRASS;
      let flags = TILE_FLAGS.WALKABLE;
      let moisture = 20;
      let fertility = 50;

      // Winding dirt road through center
      if (Math.abs(y - 16) <= 1 || Math.abs(x - 16) <= 1) {
        terrain = TERRAIN_TYPES.DIRT;
        fertility = 30;
      }
      // Small tilled farmland plot
      else if (x >= 4 && x <= 9 && y >= 4 && y <= 9) {
        terrain = TERRAIN_TYPES.TILLED_SOIL;
        flags = TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED;
        moisture = 75;
        fertility = 90;
      }
      // Stone boulder outcrop
      else if (Math.hypot(x - 8, y - 24) < 3) {
        terrain = TERRAIN_TYPES.STONE;
        flags = TILE_FLAGS.OCCUPIED_BY_STRUCTURE; // Blocked for walking
      }

      sim.chunks.setTile(x, y, {
        terrainType: terrain,
        flags,
        moisture,
        fertility
      });
    }
  }

  // 3. Initialize Authoritative Farmstead Layout (3x3 pond at (22,7)-(24,9), bed at (12,12), player at (16,16))
  const { bedEntityId, playerEntityId } = FarmsteadLayout.initialize(sim);
  FarmsteadLayout.populateLivestockAndVillagers(sim);
  console.log(`Initialized Farmstead Layout - Bed ID: ${bedEntityId}, Player ID: ${playerEntityId}`);

  // 4. Initialize PixiJS Game Client
  const client = new GameClient(sim, {
    containerElement: container,
    hudElement: hud ?? undefined,
    width: window.innerWidth,
    height: window.innerHeight
  });

  await client.init({
    containerElement: container,
    hudElement: hud ?? undefined,
    width: window.innerWidth,
    height: window.innerHeight
  });

  // Handle window resizing
  window.addEventListener('resize', () => {
    client.app.renderer.resize(window.innerWidth, window.innerHeight);
    client.camera.resize(window.innerWidth, window.innerHeight);
  });

  // 5. Start Client Presentation Loop
  client.start();
  (window as any).__gameClient = client;

  // Seamlessly restore saved state if available in persistent storage
  if (client.storage.exists('quicksave_slot')) {
    client.quickLoad();
  }

  console.log('Living Village Phase 1B-0 First Playable Slice Running!');
}

bootstrap().catch(err => {
  console.error('Failed to start Living Village client:', err);
});
