/**
 * Dedicated Chunk Grid System (Non-ECS).
 * 
 * Manages dense environmental tiles (terrain, elevation, moisture, fertility, crops).
 * Organized into 32x32 tile chunks.
 */

export interface TileData {
  terrainType: number;  // 0=Grass, 1=Dirt, 2=TilledSoil, 3=Stone, 4=Water
  elevation: number;    // 0-255 height level
  flags: number;        // Bit 0: Walkable (1), Bit 1: Water (2), Bit 2: Occupied (4), Bit 3: Tilled (8)
  moisture: number;     // 0-100
  fertility: number;    // 0-100
  cropTypeId: number;   // 0 = None, 1..N = Registered Crop Type
  cropStage: number;    // 0=Seed, 1=Sprout, 2=Growing, 3=Mature, 4=Wilted
  cropProgress: number; // 0-255
  growthDays: number;   // Cumulative watered days in current stage
  matureDays: number;   // Consecutive days spent ripe in Stage 3
  dryDays: number;      // Consecutive days without adequate moisture
}

export const TILE_FLAGS = {
  WALKABLE: 1 << 0,
  WATER: 1 << 1,
  OCCUPIED_BY_STRUCTURE: 1 << 2,
  TILLED: 1 << 3
} as const;

export const TERRAIN_TYPES = {
  GRASS: 0,
  DIRT: 1,
  TILLED_SOIL: 2,
  STONE: 3,
  WATER: 4
} as const;

export type TerrainType = typeof TERRAIN_TYPES[keyof typeof TERRAIN_TYPES];

export interface ChunkSnapshot {
  chunkX: number;
  chunkY: number;
  tiles: TileData[];
}

export class WorldChunk {
  public static readonly CHUNK_SIZE = 32;
  public static readonly TOTAL_TILES = WorldChunk.CHUNK_SIZE * WorldChunk.CHUNK_SIZE; // 1024

  public readonly chunkX: number;
  public readonly chunkY: number;
  public readonly tiles: TileData[];
  public isDirty: boolean = false;

  constructor(chunkX: number, chunkY: number, initialTerrain: number = 0) {
    this.chunkX = chunkX;
    this.chunkY = chunkY;
    this.tiles = new Array(WorldChunk.TOTAL_TILES);

    for (let i = 0; i < WorldChunk.TOTAL_TILES; i++) {
      this.tiles[i] = {
        terrainType: initialTerrain,
        elevation: 0,
        flags: TILE_FLAGS.WALKABLE,
        moisture: 0,
        fertility: 50,
        cropTypeId: 0,
        cropStage: 0,
        cropProgress: 0,
        growthDays: 0,
        matureDays: 0,
        dryDays: 0
      };
    }
  }

  public static getTileIndex(localX: number, localY: number): number {
    return localY * WorldChunk.CHUNK_SIZE + localX;
  }

  public getTile(localX: number, localY: number): TileData | undefined {
    if (localX < 0 || localX >= WorldChunk.CHUNK_SIZE || localY < 0 || localY >= WorldChunk.CHUNK_SIZE) {
      return undefined;
    }
    return this.tiles[WorldChunk.getTileIndex(localX, localY)];
  }

  public setTile(localX: number, localY: number, data: Partial<TileData>): boolean {
    if (localX < 0 || localX >= WorldChunk.CHUNK_SIZE || localY < 0 || localY >= WorldChunk.CHUNK_SIZE) {
      return false;
    }
    const idx = WorldChunk.getTileIndex(localX, localY);
    const existing = this.tiles[idx]!;

    this.tiles[idx] = {
      ...existing,
      ...data
    };
    this.isDirty = true;
    return true;
  }

  public getSnapshot(): ChunkSnapshot {
    return {
      chunkX: this.chunkX,
      chunkY: this.chunkY,
      tiles: JSON.parse(JSON.stringify(this.tiles))
    };
  }

  public restoreSnapshot(snapshot: ChunkSnapshot): void {
    if (snapshot.tiles.length !== WorldChunk.TOTAL_TILES) {
      throw new Error(`Corrupted chunk snapshot: Expected ${WorldChunk.TOTAL_TILES} tiles, got ${snapshot.tiles.length}`);
    }
    for (let i = 0; i < WorldChunk.TOTAL_TILES; i++) {
      const snapTile = snapshot.tiles[i]!;
      this.tiles[i] = {
        ...snapTile,
        growthDays: (snapTile as any).growthDays ?? 0,
        matureDays: (snapTile as any).matureDays ?? 0,
        dryDays: (snapTile as any).dryDays ?? 0
      };
    }
    this.isDirty = false;
  }
}

export class ChunkGrid {
  private chunks: Map<string, WorldChunk> = new Map();

  private static chunkKey(chunkX: number, chunkY: number): string {
    return `${chunkX},${chunkY}`;
  }

  /**
   * Converts world tile coordinates to chunk coordinates and local tile offsets.
   */
  public static worldTileToChunkCoord(worldTileX: number, worldTileY: number): {
    chunkX: number;
    chunkY: number;
    localX: number;
    localY: number;
  } {
    const chunkX = Math.floor(worldTileX / WorldChunk.CHUNK_SIZE);
    const chunkY = Math.floor(worldTileY / WorldChunk.CHUNK_SIZE);
    const localX = ((worldTileX % WorldChunk.CHUNK_SIZE) + WorldChunk.CHUNK_SIZE) % WorldChunk.CHUNK_SIZE;
    const localY = ((worldTileY % WorldChunk.CHUNK_SIZE) + WorldChunk.CHUNK_SIZE) % WorldChunk.CHUNK_SIZE;

    return { chunkX, chunkY, localX, localY };
  }

  /**
   * Converts chunk coordinates and local tile offsets to global world tile coordinates.
   */
  public static chunkLocalToWorldTile(chunkX: number, chunkY: number, localX: number, localY: number): {
    worldTileX: number;
    worldTileY: number;
  } {
    if (localX < 0 || localX >= WorldChunk.CHUNK_SIZE || localY < 0 || localY >= WorldChunk.CHUNK_SIZE) {
      throw new Error(`Local tile coordinates out of bounds: (${localX}, ${localY})`);
    }
    return {
      worldTileX: chunkX * WorldChunk.CHUNK_SIZE + localX,
      worldTileY: chunkY * WorldChunk.CHUNK_SIZE + localY
    };
  }

  public getOrCreateChunk(chunkX: number, chunkY: number, defaultTerrain: number = 0): WorldChunk {
    const key = ChunkGrid.chunkKey(chunkX, chunkY);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new WorldChunk(chunkX, chunkY, defaultTerrain);
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  public getChunk(chunkX: number, chunkY: number): WorldChunk | undefined {
    return this.chunks.get(ChunkGrid.chunkKey(chunkX, chunkY));
  }

  public hasChunk(chunkX: number, chunkY: number): boolean {
    return this.chunks.has(ChunkGrid.chunkKey(chunkX, chunkY));
  }

  public get loadedChunkCount(): number {
    return this.chunks.size;
  }

  public getAllLoadedChunks(): WorldChunk[] {
    const sortedKeys = Array.from(this.chunks.keys()).sort();
    return sortedKeys.map(k => this.chunks.get(k)!);
  }

  public getTile(worldTileX: number, worldTileY: number): TileData | undefined {
    const { chunkX, chunkY, localX, localY } = ChunkGrid.worldTileToChunkCoord(worldTileX, worldTileY);
    const chunk = this.getChunk(chunkX, chunkY);
    return chunk ? chunk.getTile(localX, localY) : undefined;
  }

  public setTile(worldTileX: number, worldTileY: number, data: Partial<TileData>): boolean {
    const { chunkX, chunkY, localX, localY } = ChunkGrid.worldTileToChunkCoord(worldTileX, worldTileY);
    const chunk = this.getOrCreateChunk(chunkX, chunkY);
    return chunk.setTile(localX, localY, data);
  }

  public isWalkable(worldTileX: number, worldTileY: number): boolean {
    const tile = this.getTile(worldTileX, worldTileY);
    if (!tile) return false;
    return (tile.flags & TILE_FLAGS.WALKABLE) !== 0 && (tile.flags & TILE_FLAGS.OCCUPIED_BY_STRUCTURE) === 0;
  }

  public getSnapshot(): ChunkSnapshot[] {
    const snapshots: ChunkSnapshot[] = [];
    // Sort deterministically by chunk coordinates
    const sortedKeys = Array.from(this.chunks.keys()).sort();
    for (const key of sortedKeys) {
      snapshots.push(this.chunks.get(key)!.getSnapshot());
    }
    return snapshots;
  }

  public restoreSnapshot(snapshots: ChunkSnapshot[]): void {
    this.chunks.clear();
    for (const snap of snapshots) {
      const chunk = new WorldChunk(snap.chunkX, snap.chunkY);
      chunk.restoreSnapshot(snap);
      this.chunks.set(ChunkGrid.chunkKey(snap.chunkX, snap.chunkY), chunk);
    }
  }

  public clear(): void {
    this.chunks.clear();
  }
}
