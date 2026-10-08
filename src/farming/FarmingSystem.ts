import { ChunkGrid, WorldChunk, TILE_FLAGS } from '../world/ChunkGrid.js';
import { SimEventManager } from '../core/SimEvents.js';
import { TIME_CONFIG, FARMING_CONFIG } from './FarmingConfig.js';
import { CropRegistry } from './CropRegistry.js';
import { IEnvironmentProvider } from './EnvironmentProvider.js';

export interface FarmingSystemSnapshot {
  nextHourlyTick: number;
  nextDawnTick: number;
}

/**
 * Authoritative Farming & Agricultural Simulation Subsystem.
 * 
 * Manages low-frequency environmental scheduling:
 * - Hourly continuous atmospheric moisture evaporation / rain infiltration
 * - Daily dawn (06:00 AM) biological crop growth advancement, drought checks,
 *   mature crop hold timer, and unseeded tilled furrow degradation.
 */
export class FarmingSystem {
  private nextHourlyTick: number;
  private nextDawnTick: number;

  constructor() {
    this.nextHourlyTick = TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
    this.nextDawnTick = TIME_CONFIG.DAWN_HOUR * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
  }

  /**
   * Evaluates scheduled environmental updates against current simulation tick.
   * Runs hourly and daily dawn loops deterministically.
   */
  public update(
    currentTick: number,
    chunkGrid: ChunkGrid,
    environment: IEnvironmentProvider,
    events: SimEventManager,
    onDawn?: (dawnTick: number) => void
  ): void {
    // 1. Process all pending hourly updates (hourly moisture evaporation)
    while (currentTick >= this.nextHourlyTick) {
      this.processHourlyUpdate(this.nextHourlyTick, chunkGrid, environment);
      this.nextHourlyTick += TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
    }

    // 2. Process all pending daily dawn updates (overnight settlement THEN crop dawn growth)
    while (currentTick >= this.nextDawnTick) {
      const dawnTick = this.nextDawnTick;
      if (onDawn) {
        onDawn(dawnTick);
      }
      this.processDailyDawnUpdate(dawnTick, chunkGrid, events);
      this.nextDawnTick += TIME_CONFIG.TICKS_PER_IN_GAME_DAY;
    }
  }

  /**
   * Executes continuous hourly moisture dynamics:
   * - Rain infiltration (+25 * intensity, clamped to 100)
   * - Atmospheric evaporation (-2 on dry unshaded soil, clamped to 0)
   */
  public processHourlyUpdate(
    tick: number,
    chunkGrid: ChunkGrid,
    environment: IEnvironmentProvider
  ): void {
    const isRaining = environment.isRaining(tick);
    const rainIntensity = environment.getRainIntensity(tick);
    const chunks = chunkGrid.getAllLoadedChunks();

    for (const chunk of chunks) {
      let chunkChanged = false;
      for (let i = 0; i < WorldChunk.TOTAL_TILES; i++) {
        const tile = chunk.tiles[i]!;
        // Non-water tiles experience moisture changes
        if ((tile.flags & TILE_FLAGS.WATER) === 0) {
          if (isRaining) {
            const rainInfiltration = Math.round(FARMING_CONFIG.RAIN_MOISTURE_PER_HOUR * rainIntensity);
            const newMoisture = Math.min(100, tile.moisture + rainInfiltration);
            if (newMoisture !== tile.moisture) {
              tile.moisture = newMoisture;
              chunkChanged = true;
            }
          } else if (tile.moisture > 0) {
            const newMoisture = Math.max(0, tile.moisture - FARMING_CONFIG.HOURLY_EVAPORATION_RATE);
            if (newMoisture !== tile.moisture) {
              tile.moisture = newMoisture;
              chunkChanged = true;
            }
          }
        }
      }
      if (chunkChanged) {
        chunk.isDirty = true;
      }
    }
  }

  /**
   * Executes daily dawn agricultural evaluation (06:00 AM):
   * - Evaluates moisture uptake and stage advancement for growing crops
   * - Increments mature hold timer for ripe crops (wilts on day 5)
   * - Increments drought counter for unwatered crops (wilts on day 3)
   * - Degrades neglected unplanted tilled soil (reverts to dirt on day 2 of zero moisture)
   */
  public processDailyDawnUpdate(
    dawnTick: number,
    chunkGrid: ChunkGrid,
    events: SimEventManager
  ): void {
    const chunks = chunkGrid.getAllLoadedChunks();

    for (const chunk of chunks) {
      let chunkChanged = false;
      for (let localY = 0; localY < WorldChunk.CHUNK_SIZE; localY++) {
        for (let localX = 0; localX < WorldChunk.CHUNK_SIZE; localX++) {
          const tile = chunk.getTile(localX, localY)!;
          const { worldTileX, worldTileY } = ChunkGrid.chunkLocalToWorldTile(
            chunk.chunkX,
            chunk.chunkY,
            localX,
            localY
          );

          // 1. Active Crop Biological Progression
          if (tile.cropTypeId > 0) {
            const cropDef = CropRegistry.get(tile.cropTypeId);
            if (cropDef) {
              if (tile.cropStage === 3) {
                // Mature Stage: Increment mature timer
                tile.matureDays++;
                chunkChanged = true;
                if (tile.matureDays >= FARMING_CONFIG.MAX_UNHARVESTED_DAYS) {
                  tile.cropStage = 4; // Wilted
                  tile.matureDays = 0;
                  events.emit(dawnTick, 'CROP_WILTED', {
                    actorEntityId: 0,
                    tileX: worldTileX,
                    tileY: worldTileY,
                    payload: { cropTypeId: tile.cropTypeId, reason: 'OVERRIPE' }
                  });
                }
              } else if (tile.cropStage >= 0 && tile.cropStage <= 2) {
                // Vegetative Stage (0 Seed, 1 Sprout, 2 Growing)
                if (tile.moisture >= cropDef.dailyMoistureNeed) {
                  // Sufficient moisture: consume daily hydration and advance growth
                  tile.moisture = Math.max(0, tile.moisture - FARMING_CONFIG.CROP_DAILY_MOISTURE_CONSUMPTION);
                  tile.growthDays++;
                  tile.dryDays = 0;
                  chunkChanged = true;

                  const requiredDays = cropDef.stageDays[tile.cropStage]!;
                  if (tile.growthDays >= requiredDays) {
                    tile.cropStage++;
                    tile.growthDays = 0;
                    if (tile.cropStage === 3) {
                      tile.matureDays = 0;
                      events.emit(dawnTick, 'CROP_MATURED', {
                        actorEntityId: 0,
                        tileX: worldTileX,
                        tileY: worldTileY,
                        payload: { cropTypeId: tile.cropTypeId }
                      });
                    } else {
                      events.emit(dawnTick, 'CROP_ADVANCED', {
                        actorEntityId: 0,
                        tileX: worldTileX,
                        tileY: worldTileY,
                        payload: { cropTypeId: tile.cropTypeId, newStage: tile.cropStage }
                      });
                    }
                  }
                } else {
                  // Insufficient moisture: drought counter increments, growth halted
                  tile.dryDays++;
                  chunkChanged = true;
                  if (tile.dryDays >= FARMING_CONFIG.MAX_DROUGHT_DAYS) {
                    tile.cropStage = 4; // Wilted
                    events.emit(dawnTick, 'CROP_WILTED', {
                      actorEntityId: 0,
                      tileX: worldTileX,
                      tileY: worldTileY,
                      payload: { cropTypeId: tile.cropTypeId, reason: 'DROUGHT' }
                    });
                  }
                }
              }
            }
          }

          // 2. Unplanted Tilled Furrow Degradation
          if (tile.terrainType === 2 && tile.cropTypeId === 0) {
            if (tile.moisture === 0) {
              tile.dryDays++;
              chunkChanged = true;
              if (tile.dryDays >= FARMING_CONFIG.FALLOW_DEGRADE_DAYS) {
                tile.terrainType = 1; // Reverts to untilled Dirt
                tile.flags &= ~TILE_FLAGS.TILLED;
                tile.dryDays = 0;
                events.emit(dawnTick, 'SOIL_DEGRADED', {
                  actorEntityId: 0,
                  tileX: worldTileX,
                  tileY: worldTileY
                });
              }
            } else {
              tile.dryDays = 0;
            }
          }
        }
      }
      if (chunkChanged) {
        chunk.isDirty = true;
      }
    }
  }

  /**
   * Authoritative Seasonal Boundary Integration: Fallow Soil Fertility Regeneration.
   * 
   * Regenerates +15 fertility (capped at baseline 50) for all untilled, unplanted dirt tiles
   * across loaded chunks.
   * 
   * This is an explicit external integration boundary method. In accordance with LivingVillage
   * architecture, Phase 1B-1 Farming does NOT own or advance calendar seasons. A future
   * Calendar / World system is responsible for determining season transitions and explicitly
   * invokes this authoritative fallow-recovery boundary.
   * 
   * @param chunkGrid Authoritative chunk grid
   * @param events Optional simulation event manager for event recording
   * @param tick Current simulation tick for event timestamping
   * @returns Number of fallow tiles that regenerated fertility
   */
  public applyFallowRecovery(
    chunkGrid: ChunkGrid,
    events?: SimEventManager,
    tick: number = 0
  ): number {
    let recoveredCount = 0;
    const chunks = chunkGrid.getAllLoadedChunks();

    for (const chunk of chunks) {
      let chunkChanged = false;
      for (let localY = 0; localY < WorldChunk.CHUNK_SIZE; localY++) {
        for (let localX = 0; localX < WorldChunk.CHUNK_SIZE; localX++) {
          const tile = chunk.getTile(localX, localY)!;

          // Natural fallow fertility recovery applies strictly to:
          // 1. Untilled Dirt (terrainType === 1, TILLED flag not set)
          // 2. Unseeded (cropTypeId === 0)
          // 3. Below natural baseline fertility (< 50)
          if (
            tile.terrainType === 1 &&
            (tile.flags & TILE_FLAGS.TILLED) === 0 &&
            tile.cropTypeId === 0 &&
            tile.fertility < FARMING_CONFIG.BASELINE_FERTILITY
          ) {
            tile.fertility = Math.min(
              FARMING_CONFIG.BASELINE_FERTILITY,
              tile.fertility + FARMING_CONFIG.FALLOW_FERTILITY_RECOVERY
            );
            recoveredCount++;
            chunkChanged = true;
          }
        }
      }
      if (chunkChanged) {
        chunk.isDirty = true;
      }
    }

    if (recoveredCount > 0 && events) {
      events.emit(tick, 'FALLOW_RECOVERY_APPLIED', {
        payload: {
          recoveredTiles: recoveredCount,
          recoveryAmount: FARMING_CONFIG.FALLOW_FERTILITY_RECOVERY,
          baselineFertility: FARMING_CONFIG.BASELINE_FERTILITY
        }
      });
    }

    return recoveredCount;
  }

  public getSnapshot(): FarmingSystemSnapshot {
    return {
      nextHourlyTick: this.nextHourlyTick,
      nextDawnTick: this.nextDawnTick
    };
  }

  public restoreSnapshot(snapshot?: FarmingSystemSnapshot): void {
    if (snapshot) {
      this.nextHourlyTick = snapshot.nextHourlyTick;
      this.nextDawnTick = snapshot.nextDawnTick;
    } else {
      this.nextHourlyTick = TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
      this.nextDawnTick = TIME_CONFIG.DAWN_HOUR * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
    }
  }
}
