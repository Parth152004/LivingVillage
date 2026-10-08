import { TileData } from '../world/ChunkGrid.js';
import { SimEvent } from '../core/SimEvents.js';
import { ItemStack } from '../ecs/components/InventoryComponent.js';
import { QuestRenderData } from '../quests/QuestSystem.js';

export type InventorySlot = ItemStack;

/**
 * Pure data presentation contract.
 * Decoupled from PixiJS, DOM, and rendering engines.
 */

export interface EntityRenderData {
  id: number;
  x: number;
  y: number;
  isPlayer: boolean;
  facing?: 'up' | 'down' | 'left' | 'right' | undefined;
  kind?: 'player' | 'bed' | 'shipping_bin' | 'seed_catalog' | 'animal' | 'npc' | 'generic' | undefined;
  animalSpecies?: 'chicken' | 'cow' | undefined;
  name?: string | undefined;
  npcRole?: string | undefined;
  friendship?: number | undefined;
}

export interface PlayerRenderData {
  energy: {
    current: number;
    max: number;
  };
  wallet: {
    gold: number;
  };
  inventory: readonly (InventorySlot | null)[];
}

export interface ChunkRenderData {
  chunkX: number;
  chunkY: number;
  isDirty: boolean;
  tiles: TileData[];
}

export interface CommandResultData {
  commandId: number;
  tick: number;
  type: string;
  success: boolean;
  reason?: string | undefined;
}

export interface ShippingBinRenderData {
  items: readonly ItemStack[];
  estimatedRevenue: number;
}

export interface WorldRenderSnapshot {
  tick: number;
  subTickAlpha: number; // 0.0 - 1.0 interpolation factor
  isPaused: boolean;
  playerEntityId: number;
  bedEntityId?: number;
  shippingBinEntityId?: number;
  seedCatalogEntityId?: number;
  player?: PlayerRenderData | undefined;
  shippingBin?: ShippingBinRenderData | undefined;
  entities: EntityRenderData[];
  chunks: ChunkRenderData[];
  recentEvents: readonly SimEvent[];
  lastCommandResult?: CommandResultData | null;
  quests?: readonly QuestRenderData[];
  season?: string;
  weather?: string;
}

