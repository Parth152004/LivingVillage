import { Container, Graphics } from 'pixi.js';
/**
 * 2D Entity Renderer using PixiJS.
 *
 * Draws temporary procedural visuals for the Player and dynamic actors.
 */
export class EntityRenderer {
    container;
    graphics;
    constructor() {
        this.container = new Container();
        this.graphics = new Graphics();
        this.container.addChild(this.graphics);
    }
    render(snapshot, camera) {
        this.graphics.clear();
        for (const entity of snapshot.entities) {
            this.drawEntity(entity, camera);
        }
    }
    drawEntity(entity, camera) {
        const screen = camera.worldToScreen(entity.x, entity.y);
        const radius = 12 * (camera.zoom / 32.0);
        // 1. Drop shadow
        this.graphics.ellipse(screen.screenX, screen.screenY + radius * 0.7, radius * 0.9, radius * 0.4);
        this.graphics.fill({ color: 0x000000, alpha: 0.25 });
        if (entity.isPlayer) {
            // 2. Player Body (Warm terracotta orange / cozy explorer hue)
            this.graphics.circle(screen.screenX, screen.screenY, radius);
            this.graphics.fill({ color: 0xef6c00 });
            this.graphics.stroke({ color: 0xffffff, width: 2 });
            // 3. Player Head/Face accent (Straw hat / visor)
            this.graphics.circle(screen.screenX, screen.screenY - radius * 0.2, radius * 0.55);
            this.graphics.fill({ color: 0xffe082 });
            // Direction dot / nose
            this.graphics.circle(screen.screenX, screen.screenY + radius * 0.2, radius * 0.2);
            this.graphics.fill({ color: 0xd84315 });
        }
        else if (entity.kind === 'bed') {
            // Bed Entity (Wooden frame, white pillow, and forest green blanket)
            const bedW = 28 * (camera.zoom / 32.0);
            const bedH = 30 * (camera.zoom / 32.0);
            const bx = screen.screenX - bedW * 0.5;
            const by = screen.screenY - bedH * 0.5;
            // Wooden Bed Frame
            this.graphics.roundRect(bx, by, bedW, bedH, 4);
            this.graphics.fill({ color: 0x5d4037 });
            this.graphics.stroke({ color: 0x3e2723, width: 1.5 });
            // Pillow (Cream / ivory)
            this.graphics.roundRect(bx + bedW * 0.15, by + bedH * 0.1, bedW * 0.7, bedH * 0.22, 3);
            this.graphics.fill({ color: 0xf5f5f5 });
            this.graphics.stroke({ color: 0xe0e0e0, width: 1 });
            // Cozy Blanket (Forest green)
            this.graphics.roundRect(bx + bedW * 0.08, by + bedH * 0.35, bedW * 0.84, bedH * 0.58, 3);
            this.graphics.fill({ color: 0x2e7d32 });
            // Blanket folded sheet trim
            this.graphics.roundRect(bx + bedW * 0.08, by + bedH * 0.35, bedW * 0.84, bedH * 0.12, 2);
            this.graphics.fill({ color: 0x81c784 });
        }
        else if (entity.kind === 'shipping_bin') {
            // Shipping Bin Entity: Sturdy wooden chest with iron bands and brass clasp
            const binW = 28 * (camera.zoom / 32.0);
            const binH = 26 * (camera.zoom / 32.0);
            const bx = screen.screenX - binW * 0.5;
            const by = screen.screenY - binH * 0.5;
            // 1. Wooden Chest Body (Dark warm oak)
            this.graphics.roundRect(bx, by, binW, binH, 3);
            this.graphics.fill({ color: 0x4e342e });
            this.graphics.stroke({ color: 0x271914, width: 1.5 });
            // 2. Chest Lid / Top Rim (Slightly lighter timber)
            this.graphics.roundRect(bx, by, binW, binH * 0.35, 3);
            this.graphics.fill({ color: 0x5d4037 });
            this.graphics.stroke({ color: 0x271914, width: 1.2 });
            // 3. Iron Reinforcement Bands (Dark slate metal)
            const bandW = 3.5 * (camera.zoom / 32.0);
            // Left band
            this.graphics.rect(bx + binW * 0.2, by, bandW, binH);
            this.graphics.fill({ color: 0x263238 });
            // Right band
            this.graphics.rect(bx + binW * 0.8 - bandW, by, bandW, binH);
            this.graphics.fill({ color: 0x263238 });
            // 4. Brass Latch / Clasp in Center
            const latchW = 6 * (camera.zoom / 32.0);
            const latchH = 5 * (camera.zoom / 32.0);
            this.graphics.roundRect(screen.screenX - latchW * 0.5, by + binH * 0.28, latchW, latchH, 1.5);
            this.graphics.fill({ color: 0xffd54f }); // Golden brass
            this.graphics.stroke({ color: 0xffb300, width: 1 });
        }
        else if (entity.kind === 'seed_catalog') {
            // Seed Catalog Entity: Wooden order stand/lectern with an open parchment botanical ledger
            const catW = 26 * (camera.zoom / 32.0);
            const catH = 28 * (camera.zoom / 32.0);
            const cx = screen.screenX - catW * 0.5;
            const cy = screen.screenY - catH * 0.5;
            // 1. Lectern Wooden Post
            const postW = 8 * (camera.zoom / 32.0);
            const postH = 14 * (camera.zoom / 32.0);
            this.graphics.roundRect(screen.screenX - postW * 0.5, cy + catH * 0.5, postW, postH, 2);
            this.graphics.fill({ color: 0x6d4c41 });
            this.graphics.stroke({ color: 0x3e2723, width: 1.2 });
            // Base plate
            const baseW = 18 * (camera.zoom / 32.0);
            const baseH = 4 * (camera.zoom / 32.0);
            this.graphics.roundRect(screen.screenX - baseW * 0.5, cy + catH - baseH, baseW, baseH, 1.5);
            this.graphics.fill({ color: 0x4e342e });
            // 2. Angled Podium Top Surface
            this.graphics.roundRect(cx, cy, catW, catH * 0.55, 3);
            this.graphics.fill({ color: 0x8d6e63 });
            this.graphics.stroke({ color: 0x4e342e, width: 1.2 });
            // 3. Open Seed Ledger (Parchment pages: left & right page)
            const pageW = 10 * (camera.zoom / 32.0);
            const pageH = 11 * (camera.zoom / 32.0);
            const pageY = cy + 2 * (camera.zoom / 32.0);
            // Left page
            this.graphics.roundRect(screen.screenX - pageW - 1, pageY, pageW, pageH, 1.5);
            this.graphics.fill({ color: 0xfffde7 }); // Warm cream
            this.graphics.stroke({ color: 0xd7ccc8, width: 0.8 });
            // Right page
            this.graphics.roundRect(screen.screenX + 1, pageY, pageW, pageH, 1.5);
            this.graphics.fill({ color: 0xfffde7 });
            this.graphics.stroke({ color: 0xd7ccc8, width: 0.8 });
            // 4. Green Sprout / Seedling Icon on Right Page
            const sproutRadius = 2.5 * (camera.zoom / 32.0);
            this.graphics.circle(screen.screenX + pageW * 0.55, pageY + pageH * 0.45, sproutRadius);
            this.graphics.fill({ color: 0x43a047 }); // Vibrant plant green
        }
        else if (entity.kind === 'animal') {
            // Animal Entity (Chicken or Cow)
            const scale = camera.zoom / 32.0;
            if (entity.animalSpecies === 'chicken') {
                // --- CHICKEN ---
                const chkR = 8 * scale;
                // Plump White Body
                this.graphics.circle(screen.screenX, screen.screenY, chkR);
                this.graphics.fill({ color: 0xffffff });
                this.graphics.stroke({ color: 0xe0e0e0, width: 1.2 });
                // Red Comb
                this.graphics.roundRect(screen.screenX - 2 * scale, screen.screenY - chkR - 3 * scale, 4 * scale, 4 * scale, 1.5);
                this.graphics.fill({ color: 0xe53935 });
                // Orange Beak
                this.graphics.circle(screen.screenX + chkR * 0.7, screen.screenY, 2.5 * scale);
                this.graphics.fill({ color: 0xfb8c00 });
                // Eye
                this.graphics.circle(screen.screenX + chkR * 0.3, screen.screenY - 2 * scale, 1.2 * scale);
                this.graphics.fill({ color: 0x212121 });
                // Wing
                this.graphics.ellipse(screen.screenX - 2 * scale, screen.screenY + 1 * scale, 4 * scale, 2.5 * scale);
                this.graphics.fill({ color: 0xf5f5f5 });
            }
            else {
                // --- DAIRY COW ---
                const cowW = 24 * scale;
                const cowH = 16 * scale;
                const cx = screen.screenX - cowW * 0.5;
                const cy = screen.screenY - cowH * 0.5;
                // White Body
                this.graphics.roundRect(cx, cy, cowW, cowH, 5 * scale);
                this.graphics.fill({ color: 0xffffff });
                this.graphics.stroke({ color: 0x424242, width: 1.5 });
                // Black Piebald Spots
                this.graphics.ellipse(cx + cowW * 0.3, cy + cowH * 0.4, 4 * scale, 3 * scale);
                this.graphics.fill({ color: 0x212121 });
                this.graphics.ellipse(cx + cowW * 0.7, cy + cowH * 0.6, 5 * scale, 4 * scale);
                this.graphics.fill({ color: 0x212121 });
                // Pink Snout
                this.graphics.roundRect(cx + cowW * 0.75, cy + cowH * 0.25, 7 * scale, 8 * scale, 3 * scale);
                this.graphics.fill({ color: 0xf8bbd0 });
                // Nostril
                this.graphics.circle(cx + cowW * 0.88, cy + cowH * 0.5, 1 * scale);
                this.graphics.fill({ color: 0x880e4f });
                // Eye
                this.graphics.circle(cx + cowW * 0.65, cy + cowH * 0.3, 1.5 * scale);
                this.graphics.fill({ color: 0x212121 });
                // Horns / Ears
                this.graphics.ellipse(cx + cowW * 0.55, cy - 2 * scale, 2 * scale, 3.5 * scale);
                this.graphics.fill({ color: 0xffe082 });
            }
        }
        else if (entity.kind === 'npc') {
            // NPC Entity (Mayor Rowan / Merchant Ivy)
            const scale = camera.zoom / 32.0;
            const isElder = entity.npcRole === 'elder';
            // 1. Tunic / Body
            const bodyColor = isElder ? 0x3949ab : 0x2e7d32; // Navy for Rowan, Forest Green for Ivy
            this.graphics.circle(screen.screenX, screen.screenY, radius * 0.95);
            this.graphics.fill({ color: bodyColor });
            this.graphics.stroke({ color: 0xffffff, width: 2 });
            // 2. Hair / Headgear
            const hairColor = isElder ? 0xeeeeee : 0x8d6e63; // Silver hair for Elder, Brunette for Ivy
            this.graphics.circle(screen.screenX, screen.screenY - radius * 0.3, radius * 0.6);
            this.graphics.fill({ color: hairColor });
            // 3. Gold Trim / Merchant Apron
            const trimColor = isElder ? 0xffd54f : 0xfff9c4;
            this.graphics.circle(screen.screenX, screen.screenY + radius * 0.2, radius * 0.35);
            this.graphics.fill({ color: trimColor });
            // 4. Floating Identity Indicator (Role Pip)
            this.graphics.circle(screen.screenX, screen.screenY - radius * 1.3, 3 * scale);
            this.graphics.fill({ color: 0xffeb3b });
            this.graphics.stroke({ color: 0xf57f17, width: 1 });
        }
        else {
            // Generic dynamic entity (Soft blue)
            this.graphics.circle(screen.screenX, screen.screenY, radius * 0.85);
            this.graphics.fill({ color: 0x42a5f5 });
            this.graphics.stroke({ color: 0x1e88e5, width: 1.5 });
        }
    }
}
