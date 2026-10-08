import { FARMING_CONFIG } from './FarmingConfig.js';

/**
 * Immutable definition of an agricultural crop type.
 */
export interface CropDefinition {
  readonly id: number;
  readonly name: string;
  readonly seedItemId: string;
  readonly harvestItemId: string;
  readonly totalDaysToMature: number;     // Total in-game days of hydration required to reach maturity
  readonly stageDays: readonly number[];  // [Stage 0 -> 1, Stage 1 -> 2, Stage 2 -> 3]
  readonly dailyMoistureNeed: number;     // Minimum moisture (0-100) required to count as watered
  readonly fertilityConsumption: number;  // Fertility subtracted from tile upon harvest
  readonly baseYieldMin: number;          // Minimum produce yield
  readonly baseYieldMax: number;          // Maximum produce yield
  readonly energyRestored?: number;       // Energy restored upon consumption
}

/**
 * Global Registry of all crop types in the simulation.
 */
export class CropRegistry {
  private static crops: Map<number, CropDefinition> = new Map();
  private static seedMap: Map<string, CropDefinition> = new Map();
  private static harvestMap: Map<string, CropDefinition> = new Map();

  public static register(crop: CropDefinition): void {
    CropRegistry.crops.set(crop.id, crop);
    CropRegistry.seedMap.set(crop.seedItemId, crop);
    CropRegistry.harvestMap.set(crop.harvestItemId, crop);
  }

  public static get(id: number): CropDefinition | undefined {
    return CropRegistry.crops.get(id);
  }

  public static getBySeedItem(seedItemId: string): CropDefinition | undefined {
    return CropRegistry.seedMap.get(seedItemId);
  }

  public static getByHarvestItem(harvestItemId: string): CropDefinition | undefined {
    return CropRegistry.harvestMap.get(harvestItemId);
  }

  public static clear(): void {
    CropRegistry.crops.clear();
    CropRegistry.seedMap.clear();
    CropRegistry.harvestMap.clear();
  }
}

/**
 * Reference benchmark crop: Parsnip.
 * Matures in 4 in-game days (Stage 0: 1d, Stage 1: 1d, Stage 2: 2d).
 */
export const PARSNIP_CROP: CropDefinition = {
  id: 1,
  name: 'Parsnip',
  seedItemId: 'seed_parsnip',
  harvestItemId: 'crop_parsnip',
  totalDaysToMature: 4,
  stageDays: [1, 1, 2],
  dailyMoistureNeed: FARMING_CONFIG.MIN_GROWTH_MOISTURE,
  fertilityConsumption: FARMING_CONFIG.PARSNIP_FERTILITY_CONSUMPTION,
  baseYieldMin: FARMING_CONFIG.PARSNIP_BASE_YIELD_MIN,
  baseYieldMax: FARMING_CONFIG.PARSNIP_BASE_YIELD_MAX,
  energyRestored: 20
};

/**
 * Intermediate crop: Potato.
 * Matures in 6 in-game days (Stage 0: 1d, Stage 1: 2d, Stage 2: 3d).
 */
export const POTATO_CROP: CropDefinition = {
  id: 2,
  name: 'Potato',
  seedItemId: 'seed_potato',
  harvestItemId: 'crop_potato',
  totalDaysToMature: 6,
  stageDays: [1, 2, 3],
  dailyMoistureNeed: FARMING_CONFIG.MIN_GROWTH_MOISTURE,
  fertilityConsumption: 15,
  baseYieldMin: 1,
  baseYieldMax: 1,
  energyRestored: 25
};

/**
 * Capital investment crop: Cauliflower.
 * Matures in 12 in-game days (Stage 0: 2d, Stage 1: 4d, Stage 2: 6d).
 */
export const CAULIFLOWER_CROP: CropDefinition = {
  id: 3,
  name: 'Cauliflower',
  seedItemId: 'seed_cauliflower',
  harvestItemId: 'crop_cauliflower',
  totalDaysToMature: 12,
  stageDays: [2, 4, 6],
  dailyMoistureNeed: FARMING_CONFIG.MIN_GROWTH_MOISTURE,
  fertilityConsumption: 20,
  baseYieldMin: 1,
  baseYieldMax: 1,
  energyRestored: 40
};

/**
 * Fast-growing root crop: Carrot.
 * Matures in 4 in-game days (Stage 0: 1d, Stage 1: 1d, Stage 2: 2d).
 */
export const CARROT_CROP: CropDefinition = {
  id: 4,
  name: 'Carrot',
  seedItemId: 'seed_carrot',
  harvestItemId: 'crop_carrot',
  totalDaysToMature: 4,
  stageDays: [1, 1, 2],
  dailyMoistureNeed: FARMING_CONFIG.MIN_GROWTH_MOISTURE,
  fertilityConsumption: 10,
  baseYieldMin: 1,
  baseYieldMax: 1,
  energyRestored: 25
};

/**
 * Summer fruiting vine crop: Tomato.
 * Matures in 8 in-game days (Stage 0: 2d, Stage 1: 3d, Stage 2: 3d).
 */
export const TOMATO_CROP: CropDefinition = {
  id: 5,
  name: 'Tomato',
  seedItemId: 'seed_tomato',
  harvestItemId: 'crop_tomato',
  totalDaysToMature: 8,
  stageDays: [2, 3, 3],
  dailyMoistureNeed: FARMING_CONFIG.MIN_GROWTH_MOISTURE,
  fertilityConsumption: 18,
  baseYieldMin: 1,
  baseYieldMax: 2,
  energyRestored: 30
};

// Register default agricultural crop definitions
CropRegistry.register(PARSNIP_CROP);
CropRegistry.register(POTATO_CROP);
CropRegistry.register(CAULIFLOWER_CROP);
CropRegistry.register(CARROT_CROP);
CropRegistry.register(TOMATO_CROP);
