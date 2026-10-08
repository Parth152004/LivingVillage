/**
 * Smooth 60Hz Presentation Camera.
 * 
 * Runs independently from the 20Hz simulation tick.
 * Follows the target entity with exponential dampening (lerp).
 */
export class Camera {
  public x: number = 0; // World tile position
  public y: number = 0;
  public zoom: number = 32; // Pixels per world tile (32px tile size)

  public viewportWidth: number = 800;
  public viewportHeight: number = 600;

  private targetX: number = 0;
  private targetY: number = 0;
  private lerpSpeed: number = 10.0; // Smooth camera catch-up speed

  constructor(viewportWidth: number = 800, viewportHeight: number = 600) {
    this.viewportWidth = viewportWidth;
    this.viewportHeight = viewportHeight;
  }

  public setTarget(tileX: number, tileY: number, immediate: boolean = false): void {
    this.targetX = tileX;
    this.targetY = tileY;
    if (immediate) {
      this.x = tileX;
      this.y = tileY;
    }
  }

  public resize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  public update(deltaTimeSeconds: number): void {
    // Frame-rate independent exponential smoothing
    const t = 1.0 - Math.exp(-this.lerpSpeed * deltaTimeSeconds);
    this.x += (this.targetX - this.x) * t;
    this.y += (this.targetY - this.y) * t;
  }

  /**
   * Converts world tile coordinates to screen pixel coordinates.
   */
  public worldToScreen(worldX: number, worldY: number): { screenX: number; screenY: number } {
    const screenX = (worldX - this.x) * this.zoom + this.viewportWidth * 0.5;
    const screenY = (worldY - this.y) * this.zoom + this.viewportHeight * 0.5;
    return { screenX, screenY };
  }

  /**
   * Converts screen pixel coordinates to world tile coordinates.
   */
  public screenToWorld(screenX: number, screenY: number): { worldX: number; worldY: number } {
    const worldX = (screenX - this.viewportWidth * 0.5) / this.zoom + this.x;
    const worldY = (screenY - this.viewportHeight * 0.5) / this.zoom + this.y;
    return { worldX, worldY };
  }
}
