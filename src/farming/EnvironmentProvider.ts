/**
 * External Environmental / Weather Boundary Interface.
 * 
 * Provides precipitation state to agricultural systems without
 * entangling farming with meteorological simulation.
 */
export interface IEnvironmentProvider {
  /**
   * Returns true if rain is actively falling on exposed terrain at currentTick.
   */
  isRaining(currentTick: number): boolean;

  /**
   * Returns rain precipitation intensity from 0.0 (light mist) to 1.0 (heavy storm).
   */
  getRainIntensity(currentTick: number): number;
}

/**
 * Deterministic test/runtime environment provider.
 */
export class SimpleEnvironmentProvider implements IEnvironmentProvider {
  private raining: boolean = false;
  private rainIntensity: number = 1.0;

  public setRaining(isRaining: boolean, intensity: number = 1.0): void {
    this.raining = isRaining;
    this.rainIntensity = Math.max(0.0, Math.min(1.0, intensity));
  }

  public isRaining(_currentTick: number): boolean {
    return this.raining;
  }

  public getRainIntensity(_currentTick: number): number {
    return this.rainIntensity;
  }
}
