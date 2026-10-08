import test from 'node:test';
import assert from 'node:assert/strict';
import { ChunkGrid, WorldChunk, TILE_FLAGS } from '../../src/world/ChunkGrid.js';

test('ChunkGrid: coordinate conversions between world and chunk local tiles', () => {
  // Positive coordinates
  const c1 = ChunkGrid.worldTileToChunkCoord(0, 0);
  assert.deepEqual(c1, { chunkX: 0, chunkY: 0, localX: 0, localY: 0 });

  const c2 = ChunkGrid.worldTileToChunkCoord(31, 31);
  assert.deepEqual(c2, { chunkX: 0, chunkY: 0, localX: 31, localY: 31 });

  const c3 = ChunkGrid.worldTileToChunkCoord(32, 64);
  assert.deepEqual(c3, { chunkX: 1, chunkY: 2, localX: 0, localY: 0 });

  // Negative coordinates
  const c4 = ChunkGrid.worldTileToChunkCoord(-1, -1);
  assert.deepEqual(c4, { chunkX: -1, chunkY: -1, localX: 31, localY: 31 });

  const c5 = ChunkGrid.worldTileToChunkCoord(-32, -32);
  assert.deepEqual(c5, { chunkX: -1, chunkY: -1, localX: 0, localY: 0 });

  // Roundtrip back to world coordinates
  const w1 = ChunkGrid.chunkLocalToWorldTile(c1.chunkX, c1.chunkY, c1.localX, c1.localY);
  assert.deepEqual(w1, { worldTileX: 0, worldTileY: 0 });

  const w4 = ChunkGrid.chunkLocalToWorldTile(c4.chunkX, c4.chunkY, c4.localX, c4.localY);
  assert.deepEqual(w4, { worldTileX: -1, worldTileY: -1 });
});

test('ChunkGrid: tile read, write, and walkability validation', () => {
  const grid = new ChunkGrid();

  // Initially chunk not loaded
  assert.equal(grid.loadedChunkCount, 0);
  assert.equal(grid.getTile(10, 10), undefined);

  // Set tile automatically creates chunk
  const success = grid.setTile(10, 10, {
    terrainType: 2, // Tilled
    moisture: 75,
    fertility: 80,
    cropTypeId: 1,
    cropStage: 2
  });
  assert.equal(success, true);
  assert.equal(grid.loadedChunkCount, 1);

  const tile = grid.getTile(10, 10);
  assert.ok(tile);
  assert.equal(tile.terrainType, 2);
  assert.equal(tile.moisture, 75);
  assert.equal(tile.fertility, 80);
  assert.equal(tile.cropTypeId, 1);
  assert.equal(tile.cropStage, 2);
  assert.equal(grid.isWalkable(10, 10), true);

  // Mark occupied by structure
  grid.setTile(10, 10, { flags: TILE_FLAGS.OCCUPIED_BY_STRUCTURE });
  assert.equal(grid.isWalkable(10, 10), false);
});

test('ChunkGrid: snapshot and restore preserves tiles across chunks', () => {
  const grid = new ChunkGrid();
  grid.setTile(5, 5, { moisture: 90, fertility: 100 });
  grid.setTile(50, 50, { moisture: 30, fertility: 40 }); // in chunk (1, 1)

  assert.equal(grid.loadedChunkCount, 2);

  const snapshot = grid.getSnapshot();
  assert.equal(snapshot.length, 2);

  const restored = new ChunkGrid();
  restored.restoreSnapshot(snapshot);

  assert.equal(restored.loadedChunkCount, 2);
  const t1 = restored.getTile(5, 5);
  assert.ok(t1);
  assert.equal(t1.moisture, 90);
  assert.equal(t1.fertility, 100);

  const t2 = restored.getTile(50, 50);
  assert.ok(t2);
  assert.equal(t2.moisture, 30);
  assert.equal(t2.fertility, 40);
});
