import { SimClock, SimClockSnapshot } from './SimClock.js';
import { DeterministicRng, RngStateSnapshot } from './DeterministicRng.js';
import { SimEventManager, SimEventsSnapshot } from './SimEvents.js';
import { CommandQueue, PlayerCommand, CommandType } from './Commands.js';
import { ECSWorld, ECSWorldSnapshot } from '../ecs/ECSWorld.js';
import { ChunkGrid, ChunkSnapshot } from '../world/ChunkGrid.js';
import { SpatialHash, SpatialHashSnapshot } from '../world/SpatialHash.js';
import { PositionComponent } from '../ecs/components/PositionComponent.js';
import { VelocityComponent } from '../ecs/components/VelocityComponent.js';
import { EnergyComponent } from '../ecs/components/EnergyComponent.js';
import { BedComponent } from '../ecs/components/BedComponent.js';
import { WorldRenderSnapshot, EntityRenderData, ChunkRenderData, PlayerRenderData, CommandResultData, ShippingBinRenderData } from '../presentation/RenderSnapshot.js';
import { FarmingSystem, FarmingSystemSnapshot } from '../farming/FarmingSystem.js';
import { SimpleEnvironmentProvider } from '../farming/EnvironmentProvider.js';
import { TIME_CONFIG, FARMING_CONFIG } from '../farming/FarmingConfig.js';
import { PLAYER_CONFIG, calculateNextDawnTick } from '../player/PlayerConfig.js';
import { CropRegistry } from '../farming/CropRegistry.js';
import { TILE_FLAGS, TERRAIN_TYPES } from '../world/ChunkGrid.js';
import { WalletComponent } from '../ecs/components/WalletComponent.js';
import { ShippingBinComponent } from '../ecs/components/ShippingBinComponent.js';
import { SeedCatalogComponent } from '../ecs/components/SeedCatalogComponent.js';
import {
  InventoryComponent,
  ItemStack,
  hasItem,
  deductItem,
  addItem,
  canAcceptItem,
  canAcceptItemQuantity,
  getFirstItem
} from '../ecs/components/InventoryComponent.js';
import {
  ECONOMY_CONFIG,
  getSeedBuyPrice,
  getCropSellPrice,
  isShippableItem
} from '../economy/EconomyConfig.js';
import { AnimalComponent, createAnimalComponent } from '../ecs/components/AnimalComponent.js';
import { NPCComponent, createNPCComponent } from '../ecs/components/NPCComponent.js';
import { QuestSystem } from '../quests/QuestSystem.js';

/**
 * Authoritative Root Simulation State for Living Village.
 * 
 * Orchestrates the deterministic 20Hz tick pipeline:
 * 1. Process pending validated player commands
 * 2. Advance time clock
 * 3. Update ECS systems
 * 4. Sync spatial hash
 * 5. Update environmental & agricultural subsystems
 * 6. Flush tick events
 */

export interface WorldSimulationConfig {
  seed: number;
  initialTick?: number;
}

export interface SimulationSnapshot {
  schemaVersion: number;
  seed: number;
  playerEntityId?: number;
  bedEntityId?: number;
  shippingBinEntityId?: number;
  seedCatalogEntityId?: number;
  clock: SimClockSnapshot;
  rng: RngStateSnapshot;
  ecs: ECSWorldSnapshot;
  chunks: ChunkSnapshot[];
  spatialHash: SpatialHashSnapshot;
  events: SimEventsSnapshot;
  commands: PlayerCommand[];
  farming?: FarmingSystemSnapshot;
  quests?: any[];
}

export class WorldSimulation {
  public static readonly SCHEMA_VERSION = 1;

  public seed: number;
  public playerEntityId: number = 0;
  public bedEntityId: number = 0;
  public shippingBinEntityId: number = 0;
  public seedCatalogEntityId: number = 0;
  public readonly clock: SimClock;
  public readonly rng: DeterministicRng;
  public readonly ecs: ECSWorld;
  public readonly chunks: ChunkGrid;
  public readonly spatialHash: SpatialHash;
  public readonly events: SimEventManager;
  public readonly commands: CommandQueue;
  public readonly farming: FarmingSystem;
  public readonly environment: SimpleEnvironmentProvider;
  public readonly quests: QuestSystem;
  public static readonly COMMAND_RESULT_LIFETIME_TICKS = 20; // 1 in-game second (20 ticks at 20Hz)
  public lastCommandResult: CommandResultData | null = null;

  public recordCommandResult(cmd: PlayerCommand, success: boolean, reason?: string): boolean {
    this.lastCommandResult = {
      commandId: cmd.commandId,
      tick: this.clock.currentTick,
      type: cmd.type,
      success,
      reason
    };
    return success;
  }

  constructor(config: WorldSimulationConfig) {
    this.seed = config.seed;
    this.clock = new SimClock(config.initialTick ?? 0);
    this.rng = new DeterministicRng(config.seed);
    this.ecs = new ECSWorld();
    this.chunks = new ChunkGrid();
    this.spatialHash = new SpatialHash(4.0);
    this.events = new SimEventManager();
    this.commands = new CommandQueue();
    this.farming = new FarmingSystem();
    this.environment = new SimpleEnvironmentProvider();
    this.quests = new QuestSystem();

    this.registerBuiltInCommands();
  }

  private registerBuiltInCommands(): void {
    // Register built-in test command handler for Phase 1A verification
    this.commands.registerHandler('TEST_COMMAND', (cmd, sim: WorldSimulation) => {
      sim.events.emit(sim.clock.currentTick, 'TEST_COMMAND_EXECUTED', {
        actorEntityId: cmd.issuerEntityId,
        payload: cmd.payload
      });
      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative player MOVE command handler
    this.commands.registerHandler('MOVE', (cmd, sim: WorldSimulation) => {
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) {
        return false;
      }
      const pos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!pos) {
        return false;
      }

      const dx = Number(cmd.payload?.dx ?? 0);
      const dy = Number(cmd.payload?.dy ?? 0);
      if (dx === 0 && dy === 0) {
        return true;
      }

      // Base movement speed in tiles per second (e.g. 5 tiles/sec)
      const speed = Number(cmd.payload?.speed ?? 5.0);
      const dt = SimClock.STEP_SECONDS;

      // Normalize if diagonal
      const length = Math.hypot(dx, dy);
      const normDx = length > 0 ? dx / length : 0;
      const normDy = length > 0 ? dy / length : 0;

      const newX = pos.x + normDx * speed * dt;
      const newY = pos.y + normDy * speed * dt;

      // Check tile walkability
      const targetTileX = Math.floor(newX);
      const targetTileY = Math.floor(newY);

      if (sim.chunks.isWalkable(targetTileX, targetTileY)) {
        pos.x = newX;
        pos.y = newY;
        sim.spatialHash.update(cmd.issuerEntityId, newX, newY);

        sim.events.emit(sim.clock.currentTick, 'PLAYER_MOVED', {
          actorEntityId: cmd.issuerEntityId,
          tileX: targetTileX,
          tileY: targetTileY,
          payload: { x: newX, y: newY }
        });
        return true;
      }

      // Blocked by obstacle
      return false;
    });

    const isWithinReach = (playerX: number, playerY: number, tileX: number, tileY: number): boolean => {
      return Math.hypot(playerX - (tileX + 0.5), playerY - (tileY + 0.5)) <= FARMING_CONFIG.INTERACTION_REACH_TILES;
    };

    // Register authoritative TILL command handler
    this.commands.registerHandler('TILL', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & target proximity
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const pos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!pos) return false;

      const targetTileX = cmd.targetTileX;
      const targetTileY = cmd.targetTileY;
      if (targetTileX === undefined || targetTileY === undefined) return false;

      if (!isWithinReach(pos.x, pos.y, targetTileX, targetTileY)) {
        return sim.recordCommandResult(cmd, false, 'Too far away');
      }

      // 2. Validate action preconditions
      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!inv || !hasItem(inv, 'tool_hoe')) {
        return sim.recordCommandResult(cmd, false, 'Missing hoe');
      }

      const tile = sim.chunks.getTile(targetTileX, targetTileY);
      if (!tile) {
        return sim.recordCommandResult(cmd, false, 'Cannot till here');
      }

      // Preconditions: Grass (0) or Dirt (1), walkable, not water/occupied
      if (tile.terrainType !== 0 && tile.terrainType !== 1) {
        return sim.recordCommandResult(cmd, false, 'Cannot till here');
      }
      if ((tile.flags & TILE_FLAGS.WALKABLE) === 0 || (tile.flags & TILE_FLAGS.WATER) !== 0) {
        return sim.recordCommandResult(cmd, false, 'Cannot till here');
      }

      // 3. Check energy >= cost
      const energy = sim.ecs.getComponent<EnergyComponent>(cmd.issuerEntityId, 'Energy');
      const cost = PLAYER_CONFIG.TILL;
      if (!energy || energy.current < cost) {
        return sim.recordCommandResult(cmd, false, 'Not enough energy');
      }

      // 4. Mutate authoritative state
      tile.terrainType = 2; // TilledSoil
      tile.flags |= TILE_FLAGS.TILLED;
      tile.dryDays = 0;

      // 5. Deduct energy
      energy.current -= cost;

      // 6. Emit event
      sim.events.emit(sim.clock.currentTick, 'SOIL_TILLED', {
        actorEntityId: cmd.issuerEntityId,
        tileX: targetTileX,
        tileY: targetTileY
      });
      sim.quests.recordAction('TILL', 1);
      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative SOW command handler
    this.commands.registerHandler('SOW', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & target proximity
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const pos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!pos) return false;

      const targetTileX = cmd.targetTileX;
      const targetTileY = cmd.targetTileY;
      if (targetTileX === undefined || targetTileY === undefined) return false;

      if (!isWithinReach(pos.x, pos.y, targetTileX, targetTileY)) {
        return sim.recordCommandResult(cmd, false, 'Too far away');
      }

      // 2. Validate action preconditions
      const tile = sim.chunks.getTile(targetTileX, targetTileY);
      if (!tile) return sim.recordCommandResult(cmd, false, 'Cannot sow here');

      // Preconditions: tilled soil, empty furrow
      if (tile.terrainType !== 2 || tile.cropTypeId !== 0) {
        return sim.recordCommandResult(cmd, false, 'Cannot sow here');
      }

      const seedItemId = String(cmd.payload?.seedItemId ?? 'seed_parsnip');
      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!inv || !hasItem(inv, seedItemId, 1)) {
        return sim.recordCommandResult(cmd, false, 'No seeds in inventory');
      }

      const cropDef = CropRegistry.getBySeedItem(seedItemId);
      if (!cropDef) return sim.recordCommandResult(cmd, false, 'Unknown seed');

      // 3. Check energy >= cost
      const energy = sim.ecs.getComponent<EnergyComponent>(cmd.issuerEntityId, 'Energy');
      const cost = PLAYER_CONFIG.SOW;
      if (!energy || energy.current < cost) {
        return sim.recordCommandResult(cmd, false, 'Not enough energy');
      }

      // 4. Mutate authoritative state
      deductItem(inv, seedItemId, 1);
      tile.cropTypeId = cropDef.id;
      tile.cropStage = 0; // Seed
      tile.cropProgress = 0;
      tile.growthDays = 0;
      tile.matureDays = 0;
      tile.dryDays = 0;

      // 5. Deduct energy
      energy.current -= cost;

      // 6. Emit event
      sim.events.emit(sim.clock.currentTick, 'CROP_SOWN', {
        actorEntityId: cmd.issuerEntityId,
        tileX: targetTileX,
        tileY: targetTileY,
        payload: { cropTypeId: cropDef.id, seedItemId }
      });
      sim.quests.recordAction('SOW', 1);
      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative WATER command handler
    this.commands.registerHandler('WATER', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & target proximity
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const pos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!pos) return false;

      const targetTileX = cmd.targetTileX;
      const targetTileY = cmd.targetTileY;
      if (targetTileX === undefined || targetTileY === undefined) return false;

      if (!isWithinReach(pos.x, pos.y, targetTileX, targetTileY)) {
        return sim.recordCommandResult(cmd, false, 'Too far away');
      }

      // 2. Validate action preconditions
      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!inv) return false;

      const wateringCan = getFirstItem(inv, 'tool_watering_can');
      if (!wateringCan) {
        return sim.recordCommandResult(cmd, false, 'Missing watering can');
      }
      if (wateringCan.charges === undefined || wateringCan.charges <= 0) {
        return sim.recordCommandResult(cmd, false, 'Watering can empty');
      }

      const tile = sim.chunks.getTile(targetTileX, targetTileY);
      if (!tile) return sim.recordCommandResult(cmd, false, 'Cannot water here');

      // Must be tilled or have crop
      if (tile.terrainType !== 2 && tile.cropTypeId === 0) {
        return sim.recordCommandResult(cmd, false, 'Cannot water here');
      }

      // 3. Check energy >= cost
      const energy = sim.ecs.getComponent<EnergyComponent>(cmd.issuerEntityId, 'Energy');
      const cost = PLAYER_CONFIG.WATER;
      if (!energy || energy.current < cost) {
        return sim.recordCommandResult(cmd, false, 'Not enough energy');
      }

      // 4. Mutate authoritative state
      wateringCan.charges--;
      tile.moisture = Math.min(100, tile.moisture + FARMING_CONFIG.WATERING_CAN_MOISTURE_AMOUNT);

      // 5. Deduct energy
      energy.current -= cost;

      // 6. Emit event
      sim.events.emit(sim.clock.currentTick, 'SOIL_WATERED', {
        actorEntityId: cmd.issuerEntityId,
        tileX: targetTileX,
        tileY: targetTileY,
        payload: { chargesRemaining: wateringCan.charges, moisture: tile.moisture }
      });
      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative HARVEST command handler
    this.commands.registerHandler('HARVEST', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & target proximity
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const pos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!pos) return false;

      const targetTileX = cmd.targetTileX;
      const targetTileY = cmd.targetTileY;
      if (targetTileX === undefined || targetTileY === undefined) return false;

      if (!isWithinReach(pos.x, pos.y, targetTileX, targetTileY)) {
        return sim.recordCommandResult(cmd, false, 'Too far away');
      }

      // 2. Validate action preconditions (target tile & crop existence)
      const tile = sim.chunks.getTile(targetTileX, targetTileY);
      if (!tile || tile.cropTypeId === 0) {
        return sim.recordCommandResult(cmd, false, 'No crop to harvest');
      }

      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!inv) return false;

      const energy = sim.ecs.getComponent<EnergyComponent>(cmd.issuerEntityId, 'Energy');
      if (!energy) return false;

      // Case A: Stage 3 (Mature)
      if (tile.cropStage === 3) {
        const cropDef = CropRegistry.get(tile.cropTypeId);
        if (!cropDef) return false;

        // Check inventory capacity first - reject without state mutation if full
        if (!canAcceptItem(inv, cropDef.harvestItemId)) {
          return sim.recordCommandResult(cmd, false, 'Inventory full');
        }

        // Check energy >= cost
        const cost = PLAYER_CONFIG.HARVEST;
        if (energy.current < cost) {
          return sim.recordCommandResult(cmd, false, 'Not enough energy');
        }

        // Mutate authoritative state
        const yieldCount = sim.rng.nextIntRange(cropDef.baseYieldMin, cropDef.baseYieldMax);
        const added = addItem(inv, cropDef.harvestItemId, yieldCount);
        if (!added) return false;

        tile.fertility = Math.max(0, tile.fertility - cropDef.fertilityConsumption);
        tile.cropTypeId = 0;
        tile.cropStage = 0;
        tile.cropProgress = 0;
        tile.growthDays = 0;
        tile.matureDays = 0;
        tile.dryDays = 0;

        // Deduct energy
        energy.current -= cost;

        // Emit event
        sim.events.emit(sim.clock.currentTick, 'CROP_HARVESTED', {
          actorEntityId: cmd.issuerEntityId,
          tileX: targetTileX,
          tileY: targetTileY,
          payload: { itemId: cropDef.harvestItemId, quantity: yieldCount }
        });
        sim.quests.recordAction('HARVEST', yieldCount);
        return sim.recordCommandResult(cmd, true);
      }

      // Case B: Stage 4 (Wilted)
      if (tile.cropStage === 4) {
        // Check energy >= cost (clearing wilted crop costs 1 energy)
        const cost = PLAYER_CONFIG.CLEAR_WILTED;
        if (energy.current < cost) {
          return sim.recordCommandResult(cmd, false, 'Not enough energy');
        }

        // Mutate authoritative state
        tile.cropTypeId = 0;
        tile.cropStage = 0;
        tile.cropProgress = 0;
        tile.growthDays = 0;
        tile.matureDays = 0;
        tile.dryDays = 0;

        // Deduct energy
        energy.current -= cost;

        // Emit event
        sim.events.emit(sim.clock.currentTick, 'CROP_CLEARED', {
          actorEntityId: cmd.issuerEntityId,
          tileX: targetTileX,
          tileY: targetTileY
        });
        return sim.recordCommandResult(cmd, true);
      }

      // Immature crops (Stages 0, 1, 2) cannot be harvested - reject with zero energy consumed
      return sim.recordCommandResult(cmd, false, 'Crop not ready to harvest');
    });

    // Register authoritative SLEEP command handler
    this.commands.registerHandler('SLEEP', (cmd, sim: WorldSimulation) => {
      // 1. Validate player entity and required components
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const playerPos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      const energy = sim.ecs.getComponent<EnergyComponent>(cmd.issuerEntityId, 'Energy');
      if (!playerPos || !energy) return false;

      // 2. Validate simulation is not paused
      if (sim.isPaused) {
        return sim.recordCommandResult(cmd, false, 'Simulation is paused');
      }

      // 3. Resolve and validate target bed entity
      const bedId = cmd.targetEntityId ?? cmd.payload?.bedEntityId ?? cmd.payload?.targetEntityId ?? (sim.bedEntityId !== 0 ? sim.bedEntityId : undefined);
      if (bedId === undefined || !sim.ecs.isValidEntity(bedId)) {
        return sim.recordCommandResult(cmd, false, 'Cannot sleep here');
      }
      if (!sim.ecs.hasComponent(bedId, 'Bed')) {
        return sim.recordCommandResult(cmd, false, 'Cannot sleep here');
      }

      const bedPos = sim.ecs.getComponent<PositionComponent>(bedId, 'Position');
      if (!bedPos) {
        return sim.recordCommandResult(cmd, false, 'Cannot sleep here');
      }

      // 4. Validate proximity (Euclidean distance <= 1.5 tiles)
      const dist = Math.hypot(playerPos.x - bedPos.x, playerPos.y - bedPos.y);
      if (dist > PLAYER_CONFIG.BED_INTERACTION_REACH) {
        return sim.recordCommandResult(cmd, false, 'Too far from bed');
      }

      // 5. Calculate next valid dawn tick
      const startTick = sim.clock.currentTick;
      const targetTick = calculateNextDawnTick(startTick);
      if (targetTick <= startTick) {
        return sim.recordCommandResult(cmd, false, 'Cannot sleep right now');
      }

      // 6. Authoritatively fast-forward simulation time to target dawn
      sim.advanceSimulationTo(targetTick);

      // 7. Restore authoritative player energy
      energy.current = energy.max;

      // 8. Emit authoritative sleep event
      sim.events.emit(sim.clock.currentTick, 'PLAYER_SLEPT', {
        actorEntityId: cmd.issuerEntityId,
        targetEntityId: bedId,
        payload: {
          startTick,
          targetTick,
          restoredEnergy: energy.max
        }
      });

      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative REFILL_WATER command handler
    this.commands.registerHandler('REFILL_WATER', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & position
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const pos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!pos) return false;

      const targetTileX = cmd.targetTileX;
      const targetTileY = cmd.targetTileY;
      if (targetTileX === undefined || targetTileY === undefined) {
        return sim.recordCommandResult(cmd, false, 'Invalid target tile');
      }

      // 2. Validate reach (<= 1.5 tiles)
      if (!isWithinReach(pos.x, pos.y, targetTileX, targetTileY)) {
        return sim.recordCommandResult(cmd, false, 'Too far away');
      }

      // 3. Validate target tile exists and has TILE_FLAGS.WATER and TERRAIN_TYPES.WATER
      const tile = sim.chunks.getTile(targetTileX, targetTileY);
      if (!tile || (tile.flags & TILE_FLAGS.WATER) === 0 || tile.terrainType !== TERRAIN_TYPES.WATER) {
        return sim.recordCommandResult(cmd, false, 'Target is not a water source');
      }

      // 4. Validate watering can presence
      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!inv) return false;

      const wateringCan = getFirstItem(inv, 'tool_watering_can');
      if (!wateringCan) {
        return sim.recordCommandResult(cmd, false, 'Missing watering can');
      }

      // 5. Explicitly check if watering can is already full (prevent exploit / zero mutation)
      if (wateringCan.charges !== undefined && wateringCan.charges >= FARMING_CONFIG.WATERING_CAN_MAX_CHARGES) {
        return sim.recordCommandResult(cmd, false, 'Watering can already full');
      }

      // 6. Validate energy
      const energy = sim.ecs.getComponent<EnergyComponent>(cmd.issuerEntityId, 'Energy');
      const cost = PLAYER_CONFIG.REFILL_WATER;
      if (!energy || energy.current < cost) {
        return sim.recordCommandResult(cmd, false, 'Not enough energy');
      }

      // 7. Mutate authoritative state
      wateringCan.charges = FARMING_CONFIG.WATERING_CAN_MAX_CHARGES;
      energy.current -= cost;

      // 8. Emit event
      sim.events.emit(sim.clock.currentTick, 'WATERING_CAN_REFILLED', {
        actorEntityId: cmd.issuerEntityId,
        tileX: targetTileX,
        tileY: targetTileY,
        payload: { charges: wateringCan.charges }
      });

      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative CONSUME command handler
    this.commands.registerHandler('CONSUME', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & components
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const energy = sim.ecs.getComponent<EnergyComponent>(cmd.issuerEntityId, 'Energy');
      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!energy || !inv) return false;

      // 2. Identify target inventory slot or item
      let targetSlot = cmd.slotIndex ?? cmd.payload?.slotIndex;
      let stack: ItemStack | null | undefined = null;
      if (targetSlot !== undefined && targetSlot >= 0 && targetSlot < inv.slots.length) {
        stack = inv.slots[targetSlot];
      } else {
        const targetItemId = cmd.payload?.itemId;
        if (targetItemId) {
          targetSlot = inv.slots.findIndex(s => s?.itemId === targetItemId);
          if (targetSlot !== -1) {
            stack = inv.slots[targetSlot];
          }
        }
      }

      if (!stack || stack.quantity <= 0) {
        return sim.recordCommandResult(cmd, false, 'No item to consume');
      }

      // 3. Resolve crop definition and verify it is edible
      const cropDef = CropRegistry.getByHarvestItem(stack.itemId);
      if (!cropDef || cropDef.energyRestored === undefined || cropDef.energyRestored <= 0) {
        return sim.recordCommandResult(cmd, false, 'Item is not edible');
      }

      // 4. Decrement exactly one inventory item (respect existing inventory stack semantics)
      const restored = cropDef.energyRestored;
      stack.quantity -= 1;
      if (stack.quantity <= 0) {
        inv.slots[targetSlot!] = null;
      }

      // 5. Restore energy, strictly capped at MAX_ENERGY
      energy.current = Math.min(PLAYER_CONFIG.MAX_ENERGY, energy.current + restored);

      // 6. Emit event
      sim.events.emit(sim.clock.currentTick, 'PLAYER_CONSUMED_FOOD', {
        actorEntityId: cmd.issuerEntityId,
        payload: {
          itemId: cropDef.harvestItemId,
          energyRestored: restored,
          energyCurrent: energy.current
        }
      });

      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative SHIP_ITEM command handler
    this.commands.registerHandler('SHIP_ITEM', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & position
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const playerPos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!playerPos) return false;

      // 2. Resolve target shipping bin entity
      const binId = cmd.targetEntityId ?? cmd.payload?.targetEntityId ?? (sim.shippingBinEntityId !== 0 ? sim.shippingBinEntityId : undefined);
      if (binId === undefined || !sim.ecs.isValidEntity(binId)) {
        return sim.recordCommandResult(cmd, false, 'Invalid shipping bin target');
      }
      if (!sim.ecs.hasComponent(binId, 'ShippingBin')) {
        return sim.recordCommandResult(cmd, false, 'Target is not a shipping bin');
      }

      const binPos = sim.ecs.getComponent<PositionComponent>(binId, 'Position');
      if (!binPos) {
        return sim.recordCommandResult(cmd, false, 'Shipping bin has no position');
      }

      // 3. Proximity validation (<= 1.5 tiles reach)
      const dist = Math.hypot(playerPos.x - binPos.x, playerPos.y - binPos.y);
      if (dist > FARMING_CONFIG.INTERACTION_REACH_TILES) {
        return sim.recordCommandResult(cmd, false, 'Too far from shipping bin');
      }

      // 4. Validate item & positive quantity
      const itemId = String(cmd.payload?.itemId ?? (cmd as any).itemId ?? '');
      const quantity = Number(cmd.payload?.quantity ?? (cmd as any).quantity ?? 1);
      if (!itemId || !Number.isInteger(quantity) || quantity <= 0) {
        return sim.recordCommandResult(cmd, false, 'Invalid item or quantity');
      }

      // 5. Validate item is an eligible shippable harvested crop (no tools, seeds, etc.)
      if (!isShippableItem(itemId)) {
        return sim.recordCommandResult(cmd, false, 'Item cannot be shipped');
      }

      // 6. Validate player owns requested quantity in inventory
      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!inv || !hasItem(inv, itemId, quantity)) {
        return sim.recordCommandResult(cmd, false, 'Not enough items in inventory');
      }

      const bin = sim.ecs.getComponent<ShippingBinComponent>(binId, 'ShippingBin');
      if (!bin) {
        return sim.recordCommandResult(cmd, false, 'Shipping bin component missing');
      }

      // 7. Atomic state mutation: remove from player inventory, deposit into shipping bin
      const deducted = deductItem(inv, itemId, quantity);
      if (!deducted) {
        return sim.recordCommandResult(cmd, false, 'Failed to deduct item');
      }

      const existingStack = bin.items.find(i => i.itemId === itemId);
      if (existingStack) {
        existingStack.quantity += quantity;
      } else {
        bin.items.push({ itemId, quantity });
      }

      // 8. Emit authoritative event
      sim.events.emit(sim.clock.currentTick, 'ITEM_SHIPPED', {
        actorEntityId: cmd.issuerEntityId,
        targetEntityId: binId,
        payload: { itemId, quantity }
      });

      sim.quests.recordAction('SHIP', quantity);

      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative BUY_SEED command handler
    this.commands.registerHandler('BUY_SEED', (cmd, sim: WorldSimulation) => {
      // 1. Validate entity & position
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const playerPos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!playerPos) return false;

      // 2. Resolve target seed catalog entity
      const catalogId = cmd.targetEntityId ?? cmd.payload?.targetEntityId ?? (sim.seedCatalogEntityId !== 0 ? sim.seedCatalogEntityId : undefined);
      if (catalogId === undefined || !sim.ecs.isValidEntity(catalogId)) {
        return sim.recordCommandResult(cmd, false, 'Invalid seed catalog target');
      }
      if (!sim.ecs.hasComponent(catalogId, 'SeedCatalog')) {
        return sim.recordCommandResult(cmd, false, 'Target is not a seed catalog');
      }

      const catalogPos = sim.ecs.getComponent<PositionComponent>(catalogId, 'Position');
      if (!catalogPos) {
        return sim.recordCommandResult(cmd, false, 'Seed catalog has no position');
      }

      // 3. Proximity validation (<= 1.5 tiles reach)
      const dist = Math.hypot(playerPos.x - catalogPos.x, playerPos.y - catalogPos.y);
      if (dist > FARMING_CONFIG.INTERACTION_REACH_TILES) {
        return sim.recordCommandResult(cmd, false, 'Too far from seed catalog');
      }

      // 4. Validate requested quantity is supported (1 or 5 only)
      const quantity = Number(cmd.payload?.quantity ?? (cmd as any).quantity ?? 1);
      if (quantity !== 1 && quantity !== 5) {
        return sim.recordCommandResult(cmd, false, 'Unsupported purchase quantity (supported: 1, 5)');
      }

      // 5. Validate requested crop / seed type
      let seedItemId = String(cmd.payload?.seedItemId ?? (cmd as any).seedItemId ?? '');
      if (!seedItemId) {
        const cropType = cmd.payload?.cropType ?? (cmd as any).cropType;
        if (cropType) {
          seedItemId = `seed_${String(cropType).toLowerCase()}`;
        }
      }
      const unitPrice = getSeedBuyPrice(seedItemId);
      if (unitPrice === undefined) {
        return sim.recordCommandResult(cmd, false, 'Invalid seed type');
      }

      const totalCost = unitPrice * quantity;

      // 6. Validate wallet has sufficient gold
      const wallet = sim.ecs.getComponent<WalletComponent>(cmd.issuerEntityId, 'Wallet');
      if (!wallet || wallet.gold < totalCost) {
        return sim.recordCommandResult(cmd, false, 'Not enough gold');
      }

      // 7. Validate inventory has sufficient capacity for total quantity
      const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
      if (!inv || !canAcceptItemQuantity(inv, seedItemId, quantity)) {
        return sim.recordCommandResult(cmd, false, 'Inventory full');
      }

      // 8. Atomic mutation: deduct gold and add seeds
      wallet.gold -= totalCost;
      const added = addItem(inv, seedItemId, quantity);
      if (!added) {
        // Defensive rollback
        wallet.gold += totalCost;
        return sim.recordCommandResult(cmd, false, 'Failed to add items to inventory');
      }

      // 9. Emit authoritative event
      sim.events.emit(sim.clock.currentTick, 'SEED_PURCHASED', {
        actorEntityId: cmd.issuerEntityId,
        targetEntityId: catalogId,
        payload: {
          seedItemId,
          quantity,
          unitPrice,
          totalCost,
          remainingGold: wallet.gold
        }
      });

      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative PET_ANIMAL command handler
    this.commands.registerHandler('PET_ANIMAL', (cmd, sim: WorldSimulation) => {
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const playerPos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!playerPos) return false;

      const animalId = cmd.targetEntityId ?? cmd.payload?.targetEntityId;
      if (animalId === undefined || !sim.ecs.isValidEntity(animalId)) {
        return sim.recordCommandResult(cmd, false, 'Invalid animal target');
      }
      const animal = sim.ecs.getComponent<AnimalComponent>(animalId, 'Animal');
      if (!animal) {
        return sim.recordCommandResult(cmd, false, 'Target is not an animal');
      }
      const animalPos = sim.ecs.getComponent<PositionComponent>(animalId, 'Position');
      if (!animalPos) {
        return sim.recordCommandResult(cmd, false, 'Animal has no position');
      }

      const dist = Math.hypot(playerPos.x - animalPos.x, playerPos.y - animalPos.y);
      if (dist > 2.0) {
        return sim.recordCommandResult(cmd, false, 'Too far from animal');
      }

      if (!animal.pettedToday) {
        animal.happiness = Math.min(100, animal.happiness + 15);
        animal.pettedToday = true;
      }

      let collectedProduce: string | undefined = undefined;
      if (animal.producedToday) {
        const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
        if (inv && canAcceptItem(inv, animal.productItemId)) {
          addItem(inv, animal.productItemId, 1);
          animal.producedToday = false;
          collectedProduce = animal.productItemId;
        }
      }

      sim.quests.recordAction('PET', 1);

      sim.events.emit(sim.clock.currentTick, 'ANIMAL_PETTED', {
        actorEntityId: cmd.issuerEntityId,
        targetEntityId: animalId,
        payload: {
          animalName: animal.name,
          species: animal.species,
          happiness: animal.happiness,
          collectedProduce
        }
      });

      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative TALK_NPC command handler
    this.commands.registerHandler('TALK_NPC', (cmd, sim: WorldSimulation) => {
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const playerPos = sim.ecs.getComponent<PositionComponent>(cmd.issuerEntityId, 'Position');
      if (!playerPos) return false;

      const npcId = cmd.targetEntityId ?? cmd.payload?.targetEntityId;
      if (npcId === undefined || !sim.ecs.isValidEntity(npcId)) {
        return sim.recordCommandResult(cmd, false, 'Invalid NPC target');
      }
      const npc = sim.ecs.getComponent<NPCComponent>(npcId, 'NPC');
      if (!npc) {
        return sim.recordCommandResult(cmd, false, 'Target is not an NPC');
      }
      const npcPos = sim.ecs.getComponent<PositionComponent>(npcId, 'Position');
      if (!npcPos) {
        return sim.recordCommandResult(cmd, false, 'NPC has no position');
      }

      const dist = Math.hypot(playerPos.x - npcPos.x, playerPos.y - npcPos.y);
      if (dist > 2.5) {
        return sim.recordCommandResult(cmd, false, 'Too far from NPC');
      }

      if (!npc.talkedToday) {
        npc.friendshipPoints = Math.min(2500, npc.friendshipPoints + 20);
        npc.talkedToday = true;
      }

      const currentDay = Math.floor(sim.clock.currentTick / TIME_CONFIG.TICKS_PER_IN_GAME_DAY) + 1;
      const dialogueIndex = Math.abs(currentDay % npc.dialoguePool.length);
      const text = npc.dialoguePool[dialogueIndex] ?? 'Hello neighbor!';

      sim.quests.recordAction('TALK', 1);

      sim.events.emit(sim.clock.currentTick, 'NPC_TALKED', {
        actorEntityId: cmd.issuerEntityId,
        targetEntityId: npcId,
        payload: {
          npcId: npc.npcId,
          name: npc.name,
          title: npc.title,
          role: npc.role,
          portraitIcon: npc.portraitIcon,
          text,
          friendshipPoints: npc.friendshipPoints
        }
      });

      return sim.recordCommandResult(cmd, true);
    });

    // Register authoritative CLAIM_QUEST command handler
    this.commands.registerHandler('CLAIM_QUEST', (cmd, sim: WorldSimulation) => {
      if (!sim.ecs.isValidEntity(cmd.issuerEntityId)) return false;
      const questId = String(cmd.payload?.questId ?? '');
      const reward = sim.quests.claimReward(questId);
      if (!reward) {
        return sim.recordCommandResult(cmd, false, 'Quest reward not available');
      }

      const wallet = sim.ecs.getComponent<WalletComponent>(cmd.issuerEntityId, 'Wallet');
      if (wallet && reward.rewardGold > 0) {
        wallet.gold += reward.rewardGold;
      }

      if (reward.rewardItem) {
        const inv = sim.ecs.getComponent<InventoryComponent>(cmd.issuerEntityId, 'Inventory');
        if (inv) {
          addItem(inv, reward.rewardItem.itemId, reward.rewardItem.quantity);
        }
      }

      sim.events.emit(sim.clock.currentTick, 'QUEST_CLAIMED', {
        actorEntityId: cmd.issuerEntityId,
        payload: {
          questId,
          rewardGold: reward.rewardGold,
          rewardItem: reward.rewardItem
        }
      });

      return sim.recordCommandResult(cmd, true);
    });
  }

  /**
   * Spawns the player character entity at given tile coordinates.
   */
  public spawnPlayer(tileX: number, tileY: number): number {
    const player = this.ecs.createEntity();
    this.ecs.addComponent<PositionComponent>(player, 'Position', { x: tileX + 0.5, y: tileY + 0.5 });
    this.ecs.addComponent<VelocityComponent>(player, 'Velocity', { vx: 0, vy: 0 });
    this.ecs.addComponent<EnergyComponent>(player, 'Energy', {
      current: PLAYER_CONFIG.STARTING_ENERGY,
      max: PLAYER_CONFIG.MAX_ENERGY
    });
    this.ecs.addComponent<InventoryComponent>(player, 'Inventory', {
      slots: [
        { itemId: 'tool_hoe', quantity: 1 },
        { itemId: 'tool_watering_can', quantity: 1, charges: FARMING_CONFIG.WATERING_CAN_MAX_CHARGES },
        { itemId: 'seed_parsnip', quantity: 15 },
        null,
        null,
        null,
        null,
        null,
        null,
        null
      ]
    });
    this.ecs.addComponent<WalletComponent>(player, 'Wallet', {
      gold: ECONOMY_CONFIG.STARTING_GOLD
    });
    this.spatialHash.insert(player, tileX + 0.5, tileY + 0.5);
    this.playerEntityId = player;
    return player;
  }

  /**
   * Spawns an authoritative bed entity at given tile coordinates.
   */
  public spawnBed(tileX: number = PLAYER_CONFIG.DEFAULT_BED_X, tileY: number = PLAYER_CONFIG.DEFAULT_BED_Y): number {
    const bed = this.ecs.createEntity();
    this.ecs.addComponent<PositionComponent>(bed, 'Position', { x: tileX + 0.5, y: tileY + 0.5 });
    this.ecs.addComponent<BedComponent>(bed, 'Bed', { isOccupied: false });
    this.spatialHash.insert(bed, tileX + 0.5, tileY + 0.5);
    this.bedEntityId = bed;
    return bed;
  }

  /**
   * Spawns an authoritative Shipping Bin entity at given tile coordinates.
   */
  public spawnShippingBin(tileX: number = 14, tileY: number = 12): number {
    const bin = this.ecs.createEntity();
    this.ecs.addComponent<PositionComponent>(bin, 'Position', { x: tileX + 0.5, y: tileY + 0.5 });
    this.ecs.addComponent<ShippingBinComponent>(bin, 'ShippingBin', { items: [] });
    this.spatialHash.insert(bin, tileX + 0.5, tileY + 0.5);
    this.shippingBinEntityId = bin;
    return bin;
  }

  /**
   * Spawns an authoritative Seed Catalog entity at given tile coordinates.
   */
  public spawnSeedCatalog(tileX: number = 15, tileY: number = 12): number {
    const catalog = this.ecs.createEntity();
    this.ecs.addComponent<PositionComponent>(catalog, 'Position', { x: tileX + 0.5, y: tileY + 0.5 });
    this.ecs.addComponent<SeedCatalogComponent>(catalog, 'SeedCatalog', { catalogId: 'farmstead_seed_catalog' });
    this.spatialHash.insert(catalog, tileX + 0.5, tileY + 0.5);
    this.seedCatalogEntityId = catalog;
    return catalog;
  }

  /**
   * Spawns an authoritative livestock Animal entity at given tile coordinates.
   */
  public spawnAnimal(species: 'chicken' | 'cow', name: string, tileX: number, tileY: number, wanderRadius: number = 3.0): number {
    const animal = this.ecs.createEntity();
    this.ecs.addComponent<PositionComponent>(animal, 'Position', { x: tileX + 0.5, y: tileY + 0.5 });
    this.ecs.addComponent<AnimalComponent>(animal, 'Animal', createAnimalComponent(species, name, tileX + 0.5, tileY + 0.5, wanderRadius));
    this.spatialHash.insert(animal, tileX + 0.5, tileY + 0.5);
    return animal;
  }

  /**
   * Spawns an authoritative Village NPC entity at given tile coordinates.
   */
  public spawnNPC(
    npcId: string,
    name: string,
    role: 'elder' | 'shopkeeper' | 'blacksmith',
    title: string,
    portraitIcon: string,
    tileX: number,
    tileY: number,
    dialogue: readonly string[]
  ): number {
    const npc = this.ecs.createEntity();
    this.ecs.addComponent<PositionComponent>(npc, 'Position', { x: tileX + 0.5, y: tileY + 0.5 });
    this.ecs.addComponent<NPCComponent>(npc, 'NPC', createNPCComponent(npcId, name, role, title, portraitIcon, dialogue));
    this.spatialHash.insert(npc, tileX + 0.5, tileY + 0.5);
    return npc;
  }

  /**
   * Authoritative Overnight Shipping Settlement at Dawn (06:00 AM).
   * 
   * Iterates shipping bin items, computes revenue using fixed ECONOMY_CONFIG prices,
   * adds gold to player's WalletComponent, clears the shipping bin, and emits an event.
   * Deterministic ordering and zero negative gold guarantee.
   */
  public settleShipping(dawnTick: number): number {
    // Reset daily animal and NPC interaction states at dawn
    const animalEntities = this.ecs.queryEntities(['Animal']);
    for (const id of animalEntities) {
      const animal = this.ecs.getComponent<AnimalComponent>(id, 'Animal');
      if (animal) {
        animal.pettedToday = false;
        if (animal.happiness >= 50) {
          animal.producedToday = true;
        }
      }
    }

    const npcEntities = this.ecs.queryEntities(['NPC']);
    for (const id of npcEntities) {
      const npc = this.ecs.getComponent<NPCComponent>(id, 'NPC');
      if (npc) {
        npc.talkedToday = false;
      }
    }
    let binId = this.shippingBinEntityId;
    if (binId === 0 || !this.ecs.isValidEntity(binId)) {
      const bins = this.ecs.queryEntities(['ShippingBin']);
      if (bins.length > 0 && bins[0] !== undefined) {
        binId = bins[0];
        this.shippingBinEntityId = binId;
      } else {
        return 0;
      }
    }

    const bin = this.ecs.getComponent<ShippingBinComponent>(binId, 'ShippingBin');
    if (!bin || bin.items.length === 0) {
      return 0;
    }

    if (this.playerEntityId === 0 || !this.ecs.isValidEntity(this.playerEntityId)) {
      return 0;
    }
    const wallet = this.ecs.getComponent<WalletComponent>(this.playerEntityId, 'Wallet');
    if (!wallet) {
      return 0;
    }

    let totalRevenue = 0;
    const settledBreakdown: Array<{ itemId: string; quantity: number; revenue: number }> = [];

    // Deterministic iteration over bin items
    for (const item of bin.items) {
      if (item.quantity <= 0) continue;
      const unitPrice = getCropSellPrice(item.itemId) ?? 0;
      const revenue = unitPrice * item.quantity;
      if (revenue > 0) {
        totalRevenue += revenue;
        settledBreakdown.push({
          itemId: item.itemId,
          quantity: item.quantity,
          revenue
        });
      }
    }

    if (totalRevenue > 0) {
      wallet.gold += totalRevenue;
    }

    // Clear shipping bin
    bin.items = [];

    // Emit settlement event
    this.events.emit(dawnTick, 'SHIPPING_SETTLED', {
      actorEntityId: this.playerEntityId,
      targetEntityId: binId,
      payload: {
        totalRevenue,
        newGoldBalance: wallet.gold,
        breakdown: settledBreakdown
      }
    });

    return totalRevenue;
  }

  public get currentTick(): number {
    return this.clock.currentTick;
  }

  public get isPaused(): boolean {
    return this.clock.isPaused;
  }

  public pause(): void {
    this.clock.pause();
  }

  public resume(): void {
    this.clock.resume();
  }

  /**
   * Advances the simulation by exactly 1 tick.
   * Executes the strict deterministic tick pipeline.
   */
  public step(force: boolean = false): boolean {
    if (this.clock.isPaused && !force) {
      return false;
    }

    // 1. Process player commands scheduled for current tick
    const currentTick = this.clock.currentTick;
    const pendingCommands = this.commands.getPendingForTick(currentTick);
    const processedIds = new Set<number>();

    for (const cmd of pendingCommands) {
      this.commands.execute(cmd, this);
      processedIds.add(cmd.commandId);
    }
    this.commands.removeProcessed(processedIds);

    // If a command (such as SLEEP) advanced simulation time via fast-forward,
    // simulation has already reached targetTick and processed all subsystems.
    if (this.clock.currentTick !== currentTick) {
      return true;
    }

    // 2. Synchronize spatial hash with all active PositionComponents
    const positionedEntities = this.ecs.queryEntities(['Position']);
    for (const id of positionedEntities) {
      const pos = this.ecs.getComponent<PositionComponent>(id, 'Position')!;
      this.spatialHash.update(id, pos.x, pos.y);
    }

    // 2b. Periodic animal wandering every 40 ticks (~2 seconds at 20Hz)
    if (this.clock.currentTick % 40 === 0) {
      const animalEntities = this.ecs.queryEntities(['Animal', 'Position']);
      for (const id of animalEntities) {
        const animal = this.ecs.getComponent<AnimalComponent>(id, 'Animal');
        const pos = this.ecs.getComponent<PositionComponent>(id, 'Position');
        if (animal && pos) {
          const dx = (this.rng.nextFloat() - 0.5) * 0.8;
          const dy = (this.rng.nextFloat() - 0.5) * 0.8;
          const targetX = pos.x + dx;
          const targetY = pos.y + dy;
          const distFromHome = Math.hypot(targetX - animal.homeX, targetY - animal.homeY);
          if (distFromHome <= animal.wanderRadius && this.chunks.isWalkable(Math.floor(targetX), Math.floor(targetY))) {
            pos.x = targetX;
            pos.y = targetY;
            this.spatialHash.update(id, targetX, targetY);
          }
        }
      }
    }

    // 3. Advance virtual time clock
    this.clock.step(true);

    // 4. Update environmental & agricultural subsystems for newly reached tick
    this.farming.update(
      this.clock.currentTick,
      this.chunks,
      this.environment,
      this.events,
      (dawnTick) => this.settleShipping(dawnTick)
    );

    // 5. Clear per-tick event buffer
    this.events.endTick();

    // 6. Expire stale command results beyond presentation lifetime (20 ticks / 1 second)
    if (this.lastCommandResult && (this.clock.currentTick - this.lastCommandResult.tick > WorldSimulation.COMMAND_RESULT_LIFETIME_TICKS)) {
      this.lastCommandResult = null;
    }

    return true;
  }

  /**
   * Steps the simulation forward by N ticks.
   */
  public stepMany(ticks: number, force: boolean = false): number {
    if (ticks < 0) {
      throw new Error(`Cannot step negative ticks: ${ticks}`);
    }
    let executed = 0;
    for (let i = 0; i < ticks; i++) {
      if (this.step(force)) {
        executed++;
      } else {
        break; // paused and not forced
      }
    }
    return executed;
  }

  /**
   * Authoritative chronological simulation fast-forward.
   * 
   * Advances SimClock to targetTick by stepping forward to each intervening
   * hourly and dawn event boundary in strict chronological order.
   * At 06:00 AM dawn, executes hourly moisture update first, followed by daily dawn crop evaluation.
   */
  public advanceSimulationTo(targetTick: number): void {
    if (targetTick <= this.clock.currentTick) {
      return;
    }

    const hourTicks = TIME_CONFIG.TICKS_PER_IN_GAME_HOUR;
    const dayTicks = TIME_CONFIG.TICKS_PER_IN_GAME_DAY;
    const dawnTicks = TIME_CONFIG.DAWN_HOUR * hourTicks;

    while (this.clock.currentTick < targetTick) {
      // 1. Next hourly boundary strictly after currentTick
      const nextHourly = (Math.floor(this.clock.currentTick / hourTicks) + 1) * hourTicks;

      // 2. Next daily dawn boundary strictly after currentTick
      const currentDawnDay = Math.floor((this.clock.currentTick - dawnTicks) / dayTicks);
      const nextDawn = (currentDawnDay + 1) * dayTicks + dawnTicks;

      // 3. The next event tick is the earliest boundary, capped by targetTick
      const nextEventTick = Math.min(nextHourly, nextDawn, targetTick);

      const elapsed = nextEventTick - this.clock.currentTick;
      if (elapsed <= 0) {
        break;
      }

      // 4. Advance SimClock to boundary
      this.clock.stepMany(elapsed, true);

      // 5. Execute scheduled subsystem processing for the newly reached tick
      this.farming.update(
        this.clock.currentTick,
        this.chunks,
        this.environment,
        this.events,
        (dawnTick) => this.settleShipping(dawnTick)
      );

      // 6. Clear per-tick event buffer
      this.events.endTick();
    }

    // 7. Expire stale command results beyond presentation lifetime
    if (this.lastCommandResult && (this.clock.currentTick - this.lastCommandResult.tick > WorldSimulation.COMMAND_RESULT_LIFETIME_TICKS)) {
      this.lastCommandResult = null;
    }
  }

  /**
   * Enqueues a player command into the authoritative queue.
   */
  public enqueueCommand(type: CommandType, issuerEntityId: number, params: any = {}) {
    return this.commands.enqueue(this.clock.currentTick, type, issuerEntityId, params);
  }

  /**
   * Authoritative simulation boundary: triggers seasonal fallow soil fertility recovery.
   * To be invoked by the future Calendar / Season subsystem upon seasonal transitions.
   * 
   * @returns Number of tiles that recovered fertility.
   */
  public triggerSeasonalFallowRecovery(): number {
    return this.farming.applyFallowRecovery(this.chunks, this.events, this.clock.currentTick);
  }

  /**
   * Exports an authoritative read-only render snapshot for the presentation layer.
   */
  public getRenderSnapshot(subTickAlpha: number = 0.0): WorldRenderSnapshot {
    const entityIds = this.ecs.queryEntities(['Position']);
    const entities: EntityRenderData[] = [];

    for (const id of entityIds) {
      const pos = this.ecs.getComponent<PositionComponent>(id, 'Position')!;
      let kind: 'player' | 'bed' | 'shipping_bin' | 'seed_catalog' | 'animal' | 'npc' | 'generic' = 'generic';
      let animalSpecies: 'chicken' | 'cow' | undefined = undefined;
      let name: string | undefined = undefined;
      let npcRole: string | undefined = undefined;
      let friendship: number | undefined = undefined;

      if (id === this.playerEntityId) {
        kind = 'player';
      } else if (id === this.bedEntityId) {
        kind = 'bed';
      } else if (id === this.shippingBinEntityId) {
        kind = 'shipping_bin';
      } else if (id === this.seedCatalogEntityId) {
        kind = 'seed_catalog';
      } else {
        const animal = this.ecs.getComponent<AnimalComponent>(id, 'Animal');
        if (animal) {
          kind = 'animal';
          animalSpecies = animal.species;
          name = animal.name;
        } else {
          const npc = this.ecs.getComponent<NPCComponent>(id, 'NPC');
          if (npc) {
            kind = 'npc';
            name = npc.name;
            npcRole = npc.role;
            friendship = npc.friendshipPoints;
          }
        }
      }

      entities.push({
        id,
        x: pos.x,
        y: pos.y,
        isPlayer: id === this.playerEntityId,
        kind,
        animalSpecies,
        name,
        npcRole,
        friendship
      });
    }

    const chunks: ChunkRenderData[] = [];
    for (const chunk of this.chunks.getAllLoadedChunks()) {
      chunks.push({
        chunkX: chunk.chunkX,
        chunkY: chunk.chunkY,
        isDirty: chunk.isDirty,
        tiles: chunk.tiles
      });
    }

    let playerData: PlayerRenderData | undefined = undefined;
    if (this.playerEntityId !== 0 && this.ecs.isValidEntity(this.playerEntityId)) {
      const energy = this.ecs.getComponent<EnergyComponent>(this.playerEntityId, 'Energy');
      const inv = this.ecs.getComponent<InventoryComponent>(this.playerEntityId, 'Inventory');
      const wallet = this.ecs.getComponent<WalletComponent>(this.playerEntityId, 'Wallet');
      if (energy) {
        playerData = {
          energy: {
            current: energy.current,
            max: energy.max
          },
          wallet: {
            gold: wallet?.gold ?? ECONOMY_CONFIG.STARTING_GOLD
          },
          inventory: inv ? inv.slots.map(s => (s ? { ...s } : null)) : []
        };
      }
    }

    let shippingBinData: ShippingBinRenderData | undefined = undefined;
    let binId = this.shippingBinEntityId;
    if (binId === 0 || !this.ecs.isValidEntity(binId)) {
      const bins = this.ecs.queryEntities(['ShippingBin']);
      if (bins.length > 0 && bins[0] !== undefined) {
        binId = bins[0];
      }
    }
    if (binId !== 0 && this.ecs.isValidEntity(binId)) {
      const bin = this.ecs.getComponent<ShippingBinComponent>(binId, 'ShippingBin');
      if (bin) {
        let estimatedRevenue = 0;
        const clonedItems: ItemStack[] = [];
        for (const item of bin.items) {
          clonedItems.push({
            itemId: item.itemId,
            quantity: item.quantity,
            ...(item.charges !== undefined ? { charges: item.charges } : {})
          });
          estimatedRevenue += (getCropSellPrice(item.itemId) ?? 0) * item.quantity;
        }
        shippingBinData = {
          items: clonedItems,
          estimatedRevenue
        };
      }
    }

    return {
      tick: this.clock.currentTick,
      subTickAlpha,
      isPaused: this.clock.isPaused,
      playerEntityId: this.playerEntityId,
      bedEntityId: this.bedEntityId,
      shippingBinEntityId: this.shippingBinEntityId,
      seedCatalogEntityId: this.seedCatalogEntityId,
      player: playerData,
      shippingBin: shippingBinData,
      entities,
      chunks,
      recentEvents: this.events.getHistory(),
      lastCommandResult: this.lastCommandResult,
      quests: this.quests.getRenderData(),
      season: 'Spring',
      weather: 'Sunny'
    };
  }

  /**
   * Validates core systemic invariants. Throws if any invariant is violated.
   */
  public assertInvariants(): void {
    // Invariant 1: Clock tick must be non-negative integer
    if (this.clock.currentTick < 0 || !Number.isInteger(this.clock.currentTick)) {
      throw new Error(`Invariant failed: Invalid clock tick: ${this.clock.currentTick}`);
    }

    // Invariant 2: ECS active count must match actual entities
    const activeEntities = this.ecs.getAllActiveEntities();
    if (activeEntities.length !== this.ecs.activeEntityCount) {
      throw new Error(`Invariant failed: ECS entity count mismatch (${activeEntities.length} vs ${this.ecs.activeEntityCount})`);
    }

    // Invariant 3: Spatial hash must not contain destroyed entities
    const spatialIds = Array.from((this.spatialHash as any).entityPositions.keys()) as number[];
    for (const id of spatialIds) {
      if (!this.ecs.isValidEntity(id)) {
        throw new Error(`Invariant failed: SpatialHash contains destroyed entity: ${id}`);
      }
    }

    // Invariant 4: Soil moisture and fertility must be bounded [0, 100]
    for (const chunk of this.chunks.getAllLoadedChunks()) {
      for (let i = 0; i < chunk.tiles.length; i++) {
        const tile = chunk.tiles[i]!;
        if (tile.moisture < 0 || tile.moisture > 100) {
          throw new Error(`Invariant failed: Chunk (${chunk.chunkX}, ${chunk.chunkY}) tile ${i} moisture out of bounds: ${tile.moisture}`);
        }
        if (tile.fertility < 0 || tile.fertility > 100) {
          throw new Error(`Invariant failed: Chunk (${chunk.chunkX}, ${chunk.chunkY}) tile ${i} fertility out of bounds: ${tile.fertility}`);
        }
        if (tile.cropStage < 0 || tile.cropStage > 4) {
          throw new Error(`Invariant failed: Chunk (${chunk.chunkX}, ${chunk.chunkY}) tile ${i} crop stage invalid: ${tile.cropStage}`);
        }
      }
    }

    // Invariant 5: Player energy must be bounded [0, max] if player exists
    if (this.playerEntityId !== 0 && this.ecs.isValidEntity(this.playerEntityId)) {
      const energy = this.ecs.getComponent<EnergyComponent>(this.playerEntityId, 'Energy');
      if (energy) {
        if (energy.current < 0 || energy.current > energy.max) {
          throw new Error(`Invariant failed: Player energy out of bounds: current=${energy.current}, max=${energy.max}`);
        }
      }
    }

    // Invariant 6: All bed entities must have PositionComponent
    const bedEntities = this.ecs.queryEntities(['Bed']);
    for (const bedId of bedEntities) {
      if (!this.ecs.hasComponent(bedId, 'Position')) {
        throw new Error(`Invariant failed: Bed entity ${bedId} missing PositionComponent`);
      }
    }

    // Invariant 7: Player wallet gold must be a non-negative integer if player exists
    if (this.playerEntityId !== 0 && this.ecs.isValidEntity(this.playerEntityId)) {
      const wallet = this.ecs.getComponent<WalletComponent>(this.playerEntityId, 'Wallet');
      if (wallet) {
        if (wallet.gold < 0 || !Number.isInteger(wallet.gold)) {
          throw new Error(`Invariant failed: Player gold invalid: ${wallet.gold}`);
        }
      }
    }

    // Invariant 8: Shipping bin contents must have non-empty valid item stacks
    const binEntities = this.ecs.queryEntities(['ShippingBin']);
    for (const binId of binEntities) {
      if (!this.ecs.hasComponent(binId, 'Position')) {
        throw new Error(`Invariant failed: Shipping bin entity ${binId} missing PositionComponent`);
      }
      const bin = this.ecs.getComponent<ShippingBinComponent>(binId, 'ShippingBin');
      if (bin) {
        for (const item of bin.items) {
          if (!item.itemId || item.quantity <= 0 || !Number.isInteger(item.quantity)) {
            throw new Error(`Invariant failed: Shipping bin ${binId} has invalid item stack: ${JSON.stringify(item)}`);
          }
        }
      }
    }

    // Invariant 9: Seed catalog must have PositionComponent and valid catalogId
    const catalogEntities = this.ecs.queryEntities(['SeedCatalog']);
    for (const catId of catalogEntities) {
      if (!this.ecs.hasComponent(catId, 'Position')) {
        throw new Error(`Invariant failed: Seed catalog entity ${catId} missing PositionComponent`);
      }
      const cat = this.ecs.getComponent<SeedCatalogComponent>(catId, 'SeedCatalog');
      if (!cat || !cat.catalogId) {
        throw new Error(`Invariant failed: Seed catalog entity ${catId} missing catalogId`);
      }
    }
  }

  /**
   * Captures full authoritative snapshot of the simulation state.
   */
  public getSnapshot(): SimulationSnapshot {
    return {
      schemaVersion: WorldSimulation.SCHEMA_VERSION,
      seed: this.seed,
      playerEntityId: this.playerEntityId,
      bedEntityId: this.bedEntityId,
      shippingBinEntityId: this.shippingBinEntityId,
      seedCatalogEntityId: this.seedCatalogEntityId,
      clock: this.clock.getSnapshot(),
      rng: this.rng.getState(),
      ecs: this.ecs.getSnapshot(),
      chunks: this.chunks.getSnapshot(),
      spatialHash: this.spatialHash.getSnapshot(),
      events: this.events.getSnapshot(),
      commands: this.commands.getSnapshot(),
      farming: this.farming.getSnapshot(),
      quests: this.quests.serialize()
    };
  }

  /**
   * Restores authoritative simulation state from a snapshot.
   */
  public restoreSnapshot(snapshot: SimulationSnapshot): void {
    if (snapshot.schemaVersion !== WorldSimulation.SCHEMA_VERSION) {
      throw new Error(`Unsupported schema version: ${snapshot.schemaVersion} (current: ${WorldSimulation.SCHEMA_VERSION})`);
    }

    this.seed = snapshot.seed;
    this.playerEntityId = snapshot.playerEntityId ?? 0;
    this.bedEntityId = snapshot.bedEntityId ?? 0;
    this.shippingBinEntityId = snapshot.shippingBinEntityId ?? 0;
    this.seedCatalogEntityId = snapshot.seedCatalogEntityId ?? 0;
    this.clock.restoreSnapshot(snapshot.clock);
    this.rng.setState(snapshot.rng);
    this.ecs.restoreSnapshot(snapshot.ecs);
    this.chunks.restoreSnapshot(snapshot.chunks);
    this.spatialHash.restoreSnapshot(snapshot.spatialHash);
    this.events.restoreSnapshot(snapshot.events);
    this.commands.restoreSnapshot(snapshot.commands);
    this.farming.restoreSnapshot(snapshot.farming);
    if (snapshot.quests) {
      this.quests.deserialize(snapshot.quests);
    }

    // Save/load migration:
    // If player exists but has no WalletComponent, attach WalletComponent with STARTING_GOLD (100)
    if (this.playerEntityId !== 0 && this.ecs.isValidEntity(this.playerEntityId)) {
      if (!this.ecs.hasComponent(this.playerEntityId, 'Wallet')) {
        this.ecs.addComponent<WalletComponent>(this.playerEntityId, 'Wallet', {
          gold: ECONOMY_CONFIG.STARTING_GOLD
        });
      }
    }

    // Migration from older homestead saves (which have a bed/homestead but missing commerce entities)
    if (this.bedEntityId !== 0) {
      if (this.shippingBinEntityId === 0 || !this.ecs.isValidEntity(this.shippingBinEntityId)) {
        const existingBins = this.ecs.queryEntities(['ShippingBin']);
        if (existingBins.length > 0 && existingBins[0] !== undefined) {
          this.shippingBinEntityId = existingBins[0];
        } else if (snapshot.shippingBinEntityId === undefined) {
          this.spawnShippingBin(14, 12);
        }
      }

      if (this.seedCatalogEntityId === 0 || !this.ecs.isValidEntity(this.seedCatalogEntityId)) {
        const existingCatalogs = this.ecs.queryEntities(['SeedCatalog']);
        if (existingCatalogs.length > 0 && existingCatalogs[0] !== undefined) {
          this.seedCatalogEntityId = existingCatalogs[0];
        } else if (snapshot.seedCatalogEntityId === undefined) {
          this.spawnSeedCatalog(15, 12);
        }
      }
    }
  }
}
