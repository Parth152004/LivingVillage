import { WorldSimulation } from '../core/WorldSimulation.js';
import { TILE_FLAGS, TERRAIN_TYPES } from './ChunkGrid.js';
import { FARMING_CONFIG } from '../farming/FarmingConfig.js';
import { PLAYER_CONFIG } from '../player/PlayerConfig.js';

export interface FarmsteadEntities {
  bedEntityId: number;
  playerEntityId: number;
  shippingBinEntityId: number;
  seedCatalogEntityId: number;
}

/**
 * Authoritative Farmstead Layout Initializer.
 * 
 * Provides deterministic setup of core homestead environmental features and entities:
 * - 3x3 natural water pond at (22, 7) to (24, 9)
 * - Bed entity at (12, 12)
 * - Player entity at (16, 16)
 * - Shipping Bin entity at (14, 12)
 * - Seed Catalog entity at (15, 12)
 * 
 * Shared directly by browser bootstrap and headless/integration test harnesses
 * to eliminate ad-hoc, divergent world setups.
 */
export class FarmsteadLayout {
  public static readonly POND_MIN_X = 22;
  public static readonly POND_MAX_X = 24;
  public static readonly POND_MIN_Y = 7;
  public static readonly POND_MAX_Y = 9;

  public static readonly BED_X = PLAYER_CONFIG.DEFAULT_BED_X; // 12
  public static readonly BED_Y = PLAYER_CONFIG.DEFAULT_BED_Y; // 12

  public static readonly PLAYER_SPAWN_X = 16;
  public static readonly PLAYER_SPAWN_Y = 16;

  public static readonly SHIPPING_BIN_X = 14;
  public static readonly SHIPPING_BIN_Y = 12;

  public static readonly SEED_CATALOG_X = 15;
  public static readonly SEED_CATALOG_Y = 12;

  /**
   * Returns true if coordinates fall within the authoritative 3x3 pond.
   */
  public static isPondTile(tileX: number, tileY: number): boolean {
    return (
      tileX >= FarmsteadLayout.POND_MIN_X &&
      tileX <= FarmsteadLayout.POND_MAX_X &&
      tileY >= FarmsteadLayout.POND_MIN_Y &&
      tileY <= FarmsteadLayout.POND_MAX_Y
    );
  }

  /**
   * Initializes the authoritative farmstead layout in the given simulation.
   */
  public static initialize(sim: WorldSimulation): FarmsteadEntities {
    // 1. Carve deterministic 3x3 pond at (22, 7) through (24, 9)
    for (let y = FarmsteadLayout.POND_MIN_Y; y <= FarmsteadLayout.POND_MAX_Y; y++) {
      for (let x = FarmsteadLayout.POND_MIN_X; x <= FarmsteadLayout.POND_MAX_X; x++) {
        sim.chunks.setTile(x, y, {
          terrainType: TERRAIN_TYPES.WATER,
          flags: TILE_FLAGS.WATER, // Not walkable
          moisture: 100,
          fertility: FARMING_CONFIG.BASELINE_FERTILITY,
          cropTypeId: 0,
          cropStage: 0,
          cropProgress: 0,
          growthDays: 0,
          matureDays: 0,
          dryDays: 0
        });
      }
    }

    // 2. Spawn Bed at (12, 12) if not already spawned
    let bedEntityId = sim.bedEntityId;
    if (bedEntityId === 0 || !sim.ecs.isValidEntity(bedEntityId)) {
      const existing = sim.ecs.queryEntities(['Bed']);
      if (existing.length > 0 && existing[0] !== undefined) {
        bedEntityId = existing[0];
        sim.bedEntityId = bedEntityId;
      } else {
        bedEntityId = sim.spawnBed(FarmsteadLayout.BED_X, FarmsteadLayout.BED_Y);
      }
    }

    // 3. Spawn Player at (16, 16) if not already spawned
    let playerEntityId = sim.playerEntityId;
    if (playerEntityId === 0 || !sim.ecs.isValidEntity(playerEntityId)) {
      const existing = sim.ecs.queryEntities(['Position', 'Inventory', 'Energy']);
      if (existing.length > 0 && existing[0] !== undefined) {
        playerEntityId = existing[0];
        sim.playerEntityId = playerEntityId;
      } else {
        playerEntityId = sim.spawnPlayer(FarmsteadLayout.PLAYER_SPAWN_X, FarmsteadLayout.PLAYER_SPAWN_Y);
      }
    }

    // 4. Spawn Shipping Bin at (14, 12) if not already spawned
    let shippingBinEntityId = sim.shippingBinEntityId;
    if (shippingBinEntityId === 0 || !sim.ecs.isValidEntity(shippingBinEntityId)) {
      const existing = sim.ecs.queryEntities(['ShippingBin']);
      if (existing.length > 0 && existing[0] !== undefined) {
        shippingBinEntityId = existing[0];
        sim.shippingBinEntityId = shippingBinEntityId;
      } else {
        shippingBinEntityId = sim.spawnShippingBin(FarmsteadLayout.SHIPPING_BIN_X, FarmsteadLayout.SHIPPING_BIN_Y);
      }
    }

    // 5. Spawn Seed Catalog at (15, 12) if not already spawned
    let seedCatalogEntityId = sim.seedCatalogEntityId;
    if (seedCatalogEntityId === 0 || !sim.ecs.isValidEntity(seedCatalogEntityId)) {
      const existing = sim.ecs.queryEntities(['SeedCatalog']);
      if (existing.length > 0 && existing[0] !== undefined) {
        seedCatalogEntityId = existing[0];
        sim.seedCatalogEntityId = seedCatalogEntityId;
      } else {
        seedCatalogEntityId = sim.spawnSeedCatalog(FarmsteadLayout.SEED_CATALOG_X, FarmsteadLayout.SEED_CATALOG_Y);
      }
    }

    return {
      bedEntityId,
      playerEntityId,
      shippingBinEntityId,
      seedCatalogEntityId
    };
  }

  /**
   * Populates starter livestock and village NPCs for a living farmstead world.
   * Idempotent; will not spawn duplicate animals or NPCs if already present.
   */
  public static populateLivestockAndVillagers(sim: WorldSimulation): void {
    // 1. Spawn starter livestock if not already present
    const existingAnimals = sim.ecs.queryEntities(['Animal']);
    if (existingAnimals.length === 0) {
      sim.spawnAnimal('chicken', 'Pip', 18, 14, 2.5);
      sim.spawnAnimal('chicken', 'Penny', 19, 14, 2.5);
      sim.spawnAnimal('cow', 'Daisy', 20, 15, 3.0);
    }

    // 2. Spawn village NPCs if not already present
    const existingNPCs = sim.ecs.queryEntities(['NPC']);
    if (existingNPCs.length === 0) {
      sim.spawnNPC(
        'npc_elder_rowan',
        'Elder Rowan',
        'elder',
        'Village Elder',
        '👴',
        17,
        10,
        [
          'Welcome to Clover Valley! May your crops grow sweet and tall.',
          'The morning dew brings fortune to those who rise with the dawn.',
          'A bountiful farm begins with gentle care for soil and livestock.'
        ]
      );
      sim.spawnNPC(
        'npc_merchant_ivy',
        'Merchant Ivy',
        'shopkeeper',
        'Town Merchant',
        '👩‍🌾',
        14,
        11,
        [
          'Need fresh seeds? Our stock is certified top-tier spring heirloom!',
          'Drop your produce in the shipping bin, and I will wire your gold by dawn.',
          'A cozy farm needs cheerful animals. Keep Pip and Daisy well-fed!'
        ]
      );
    }
  }
}
