/**
 * Smooth 60Hz Presentation Camera.
 *
 * Runs independently from the 20Hz simulation tick.
 * Follows the target entity with exponential dampening (lerp).
 */
export class Camera {
    x = 0; // World tile position
    y = 0;
    zoom = 32; // Pixels per world tile (32px tile size)
    viewportWidth = 800;
    viewportHeight = 600;
    targetX = 0;
    targetY = 0;
    lerpSpeed = 10.0; // Smooth camera catch-up speed
    constructor(viewportWidth = 800, viewportHeight = 600) {
        this.viewportWidth = viewportWidth;
        this.viewportHeight = viewportHeight;
    }
    setTarget(tileX, tileY, immediate = false) {
        this.targetX = tileX;
        this.targetY = tileY;
        if (immediate) {
            this.x = tileX;
            this.y = tileY;
        }
    }
    resize(width, height) {
        this.viewportWidth = width;
        this.viewportHeight = height;
    }
    update(deltaTimeSeconds) {
        // Frame-rate independent exponential smoothing
        const t = 1.0 - Math.exp(-this.lerpSpeed * deltaTimeSeconds);
        this.x += (this.targetX - this.x) * t;
        this.y += (this.targetY - this.y) * t;
    }
    /**
     * Converts world tile coordinates to screen pixel coordinates.
     */
    worldToScreen(worldX, worldY) {
        const screenX = (worldX - this.x) * this.zoom + this.viewportWidth * 0.5;
        const screenY = (worldY - this.y) * this.zoom + this.viewportHeight * 0.5;
        return { screenX, screenY };
    }
    /**
     * Converts screen pixel coordinates to world tile coordinates.
     */
    screenToWorld(screenX, screenY) {
        const worldX = (screenX - this.viewportWidth * 0.5) / this.zoom + this.x;
        const worldY = (screenY - this.viewportHeight * 0.5) / this.zoom + this.y;
        return { worldX, worldY };
    }
}
