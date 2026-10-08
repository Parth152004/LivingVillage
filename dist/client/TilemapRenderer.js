import { Container, Graphics } from 'pixi.js';
/**
 * Procedural 2D Tilemap Renderer using PixiJS.
 *
 * Renders 32x32 ChunkGrid tiles with distinct placeholder colors.
 * Positioned in world tile space; Camera container handles screen transformations.
 */
export class TilemapRenderer {
    container;
    tileGraphics;
    renderedChunkKeys = new Set();
    static TERRAIN_COLORS = {
        0: 0x5a9e4b, // Grass (Meadow Green)
        1: 0x94683d, // Dirt (Earth Brown)
        2: 0x5c3c1e, // Tilled Soil (Dark Rich Loam)
        3: 0x7d8c99, // Stone (Slate Gray)
        4: 0x4a88c7 // Water (River Blue)
    };
    constructor() {
        this.container = new Container();
        this.tileGraphics = new Graphics();
        this.container.addChild(this.tileGraphics);
    }
    render(snapshot, camera) {
        // Check if we need to redraw tiles (on first load or dirty flag)
        let needsRedraw = false;
        for (const chunk of snapshot.chunks) {
            const key = `${chunk.chunkX},${chunk.chunkY}`;
            if (!this.renderedChunkKeys.has(key) || chunk.isDirty) {
                needsRedraw = true;
                this.renderedChunkKeys.add(key);
            }
        }
        if (needsRedraw) {
            this.redrawAllChunks(snapshot.chunks);
        }
        // Align container with camera viewport transformation
        const origin = camera.worldToScreen(0, 0);
        this.container.position.set(origin.screenX, origin.screenY);
        this.container.scale.set(camera.zoom / 32.0); // Base tile unit is 32px
    }
    redrawAllChunks(chunks) {
        this.tileGraphics.clear();
        const TILE_PX = 32;
        for (const chunk of chunks) {
            const chunkOffsetX = chunk.chunkX * 32 * TILE_PX;
            const chunkOffsetY = chunk.chunkY * 32 * TILE_PX;
            for (let ly = 0; ly < 32; ly++) {
                for (let lx = 0; lx < 32; lx++) {
                    const idx = ly * 32 + lx;
                    const tile = chunk.tiles[idx];
                    if (!tile)
                        continue;
                    let color = TilemapRenderer.TERRAIN_COLORS[tile.terrainType] ?? 0x5a9e4b;
                    // Distinguish damp vs dry tilled soil
                    if (tile.terrainType === 2) {
                        color = tile.moisture > 0 ? 0x3d2314 : 0x7c5635;
                    }
                    const px = chunkOffsetX + lx * TILE_PX;
                    const py = chunkOffsetY + ly * TILE_PX;
                    // Fill tile base
                    this.tileGraphics.rect(px, py, TILE_PX, TILE_PX);
                    this.tileGraphics.fill({ color });
                    // Subtle grid outline
                    this.tileGraphics.rect(px, py, TILE_PX, TILE_PX);
                    this.tileGraphics.stroke({ color: 0x000000, alpha: 0.08, width: 1 });
                    // Visual cue for moisture droplets if not tilled (or damp overlay)
                    if (tile.terrainType !== 2 && tile.moisture > 20) {
                        this.tileGraphics.rect(px + 2, py + 2, 6, 6);
                        this.tileGraphics.fill({ color: 0x64b5f6, alpha: Math.min(0.6, tile.moisture / 100) });
                    }
                    // Visual cue for crop stages 0 to 4
                    if (tile.cropTypeId > 0) {
                        const centerX = px + TILE_PX * 0.5;
                        const centerY = py + TILE_PX * 0.5;
                        if (tile.cropStage === 0) {
                            // Stage 0: Seed (small seed dots in furrow)
                            this.tileGraphics.circle(centerX - 3, centerY, 1.5);
                            this.tileGraphics.circle(centerX + 3, centerY, 1.5);
                            this.tileGraphics.fill({ color: 0xd7ccc8 });
                        }
                        else if (tile.cropStage === 1) {
                            // Stage 1: Sprout (tiny green shoot)
                            this.tileGraphics.circle(centerX, centerY, 3);
                            this.tileGraphics.fill({ color: 0x81c784 });
                        }
                        else if (tile.cropStage === 2) {
                            // Stage 2: Growing (medium leafy circle)
                            this.tileGraphics.circle(centerX, centerY, 6);
                            this.tileGraphics.fill({ color: 0x388e3c });
                        }
                        else if (tile.cropStage === 3) {
                            // Stage 3: Mature (large leafy plant with ripe produce pip)
                            this.tileGraphics.circle(centerX, centerY, 8);
                            this.tileGraphics.fill({ color: 0x2e7d32 });
                            let produceColor = 0xffa000; // Parsnip default
                            if (tile.cropTypeId === 2)
                                produceColor = 0x8d6e63; // Potato
                            else if (tile.cropTypeId === 3)
                                produceColor = 0xfff9c4; // Cauliflower
                            else if (tile.cropTypeId === 4)
                                produceColor = 0xff6d00; // Carrot
                            else if (tile.cropTypeId === 5)
                                produceColor = 0xd32f2f; // Tomato
                            this.tileGraphics.circle(centerX, centerY, 4.5);
                            this.tileGraphics.fill({ color: produceColor });
                        }
                        else if (tile.cropStage === 4) {
                            // Stage 4: Wilted (dead drooping stalk)
                            this.tileGraphics.circle(centerX, centerY, 5);
                            this.tileGraphics.fill({ color: 0x6d4c41 });
                        }
                    }
                }
            }
        }
    }
}
