/**
 * Dedicated Chunk Grid System (Non-ECS).
 *
 * Manages dense environmental tiles (terrain, elevation, moisture, fertility, crops).
 * Organized into 32x32 tile chunks.
 */
export const TILE_FLAGS = {
    WALKABLE: 1 << 0,
    WATER: 1 << 1,
    OCCUPIED_BY_STRUCTURE: 1 << 2,
    TILLED: 1 << 3
};
export const TERRAIN_TYPES = {
    GRASS: 0,
    DIRT: 1,
    TILLED_SOIL: 2,
    STONE: 3,
    WATER: 4
};
export class WorldChunk {
    static CHUNK_SIZE = 32;
    static TOTAL_TILES = WorldChunk.CHUNK_SIZE * WorldChunk.CHUNK_SIZE; // 1024
    chunkX;
    chunkY;
    tiles;
    isDirty = false;
    constructor(chunkX, chunkY, initialTerrain = 0) {
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
    static getTileIndex(localX, localY) {
        return localY * WorldChunk.CHUNK_SIZE + localX;
    }
    getTile(localX, localY) {
        if (localX < 0 || localX >= WorldChunk.CHUNK_SIZE || localY < 0 || localY >= WorldChunk.CHUNK_SIZE) {
            return undefined;
        }
        return this.tiles[WorldChunk.getTileIndex(localX, localY)];
    }
    setTile(localX, localY, data) {
        if (localX < 0 || localX >= WorldChunk.CHUNK_SIZE || localY < 0 || localY >= WorldChunk.CHUNK_SIZE) {
            return false;
        }
        const idx = WorldChunk.getTileIndex(localX, localY);
        const existing = this.tiles[idx];
        this.tiles[idx] = {
            ...existing,
            ...data
        };
        this.isDirty = true;
        return true;
    }
    getSnapshot() {
        return {
            chunkX: this.chunkX,
            chunkY: this.chunkY,
            tiles: JSON.parse(JSON.stringify(this.tiles))
        };
    }
    restoreSnapshot(snapshot) {
        if (snapshot.tiles.length !== WorldChunk.TOTAL_TILES) {
            throw new Error(`Corrupted chunk snapshot: Expected ${WorldChunk.TOTAL_TILES} tiles, got ${snapshot.tiles.length}`);
        }
        for (let i = 0; i < WorldChunk.TOTAL_TILES; i++) {
            const snapTile = snapshot.tiles[i];
            this.tiles[i] = {
                ...snapTile,
                growthDays: snapTile.growthDays ?? 0,
                matureDays: snapTile.matureDays ?? 0,
                dryDays: snapTile.dryDays ?? 0
            };
        }
        this.isDirty = false;
    }
}
export class ChunkGrid {
    chunks = new Map();
    static chunkKey(chunkX, chunkY) {
        return `${chunkX},${chunkY}`;
    }
    /**
     * Converts world tile coordinates to chunk coordinates and local tile offsets.
     */
    static worldTileToChunkCoord(worldTileX, worldTileY) {
        const chunkX = Math.floor(worldTileX / WorldChunk.CHUNK_SIZE);
        const chunkY = Math.floor(worldTileY / WorldChunk.CHUNK_SIZE);
        const localX = ((worldTileX % WorldChunk.CHUNK_SIZE) + WorldChunk.CHUNK_SIZE) % WorldChunk.CHUNK_SIZE;
        const localY = ((worldTileY % WorldChunk.CHUNK_SIZE) + WorldChunk.CHUNK_SIZE) % WorldChunk.CHUNK_SIZE;
        return { chunkX, chunkY, localX, localY };
    }
    /**
     * Converts chunk coordinates and local tile offsets to global world tile coordinates.
     */
    static chunkLocalToWorldTile(chunkX, chunkY, localX, localY) {
        if (localX < 0 || localX >= WorldChunk.CHUNK_SIZE || localY < 0 || localY >= WorldChunk.CHUNK_SIZE) {
            throw new Error(`Local tile coordinates out of bounds: (${localX}, ${localY})`);
        }
        return {
            worldTileX: chunkX * WorldChunk.CHUNK_SIZE + localX,
            worldTileY: chunkY * WorldChunk.CHUNK_SIZE + localY
        };
    }
    getOrCreateChunk(chunkX, chunkY, defaultTerrain = 0) {
        const key = ChunkGrid.chunkKey(chunkX, chunkY);
        let chunk = this.chunks.get(key);
        if (!chunk) {
            chunk = new WorldChunk(chunkX, chunkY, defaultTerrain);
            this.chunks.set(key, chunk);
        }
        return chunk;
    }
    getChunk(chunkX, chunkY) {
        return this.chunks.get(ChunkGrid.chunkKey(chunkX, chunkY));
    }
    hasChunk(chunkX, chunkY) {
        return this.chunks.has(ChunkGrid.chunkKey(chunkX, chunkY));
    }
    get loadedChunkCount() {
        return this.chunks.size;
    }
    getAllLoadedChunks() {
        const sortedKeys = Array.from(this.chunks.keys()).sort();
        return sortedKeys.map(k => this.chunks.get(k));
    }
    getTile(worldTileX, worldTileY) {
        const { chunkX, chunkY, localX, localY } = ChunkGrid.worldTileToChunkCoord(worldTileX, worldTileY);
        const chunk = this.getChunk(chunkX, chunkY);
        return chunk ? chunk.getTile(localX, localY) : undefined;
    }
    setTile(worldTileX, worldTileY, data) {
        const { chunkX, chunkY, localX, localY } = ChunkGrid.worldTileToChunkCoord(worldTileX, worldTileY);
        const chunk = this.getOrCreateChunk(chunkX, chunkY);
        return chunk.setTile(localX, localY, data);
    }
    isWalkable(worldTileX, worldTileY) {
        const tile = this.getTile(worldTileX, worldTileY);
        if (!tile)
            return false;
        return (tile.flags & TILE_FLAGS.WALKABLE) !== 0 && (tile.flags & TILE_FLAGS.OCCUPIED_BY_STRUCTURE) === 0;
    }
    getSnapshot() {
        const snapshots = [];
        // Sort deterministically by chunk coordinates
        const sortedKeys = Array.from(this.chunks.keys()).sort();
        for (const key of sortedKeys) {
            snapshots.push(this.chunks.get(key).getSnapshot());
        }
        return snapshots;
    }
    restoreSnapshot(snapshots) {
        this.chunks.clear();
        for (const snap of snapshots) {
            const chunk = new WorldChunk(snap.chunkX, snap.chunkY);
            chunk.restoreSnapshot(snap);
            this.chunks.set(ChunkGrid.chunkKey(snap.chunkX, snap.chunkY), chunk);
        }
    }
    clear() {
        this.chunks.clear();
    }
}
