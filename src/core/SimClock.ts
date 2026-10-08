/**
 * Deterministic Simulation Clock.
 * 
 * Advances virtual time strictly in fixed 50ms ticks (20Hz).
 * Fully independent of presentation framerate or wall-clock timestamps.
 */
export interface SimClockSnapshot {
  currentTick: number;
  isPaused: boolean;
  speedMultiplier: number;
}

export class SimClock {
  public static readonly TICK_RATE_HZ: number = 20;
  public static readonly STEP_MS: number = 50; // 1000ms / 20 = 50ms
  public static readonly STEP_SECONDS: number = 0.05;

  private tickCount: number;
  private paused: boolean;
  private speed: number;

  constructor(initialTick: number = 0) {
    if (initialTick < 0 || !Number.isInteger(initialTick)) {
      throw new Error(`Initial tick must be a non-negative integer, got: ${initialTick}`);
    }
    this.tickCount = initialTick;
    this.paused = false;
    this.speed = 1.0;
  }

  /**
   * Current authoritative simulation tick.
   */
  public get currentTick(): number {
    return this.tickCount;
  }

  /**
   * Total elapsed virtual in-game time in seconds.
   */
  public get virtualTimeSeconds(): number {
    return this.tickCount * SimClock.STEP_SECONDS;
  }

  /**
   * Whether the clock is paused.
   */
  public get isPaused(): boolean {
    return this.paused;
  }

  /**
   * Speed multiplier for simulation progression (default: 1.0).
   */
  public get speedMultiplier(): number {
    return this.speed;
  }

  public setSpeedMultiplier(multiplier: number): void {
    if (multiplier <= 0 || !Number.isFinite(multiplier)) {
      throw new Error(`Speed multiplier must be a positive finite number, got: ${multiplier}`);
    }
    this.speed = multiplier;
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  /**
   * Advances the simulation by exactly 1 tick if not paused.
   * If `force` is true, advances even when paused (useful for manual debugging).
   * Returns true if tick advanced, false if skipped due to pause.
   */
  public step(force: boolean = false): boolean {
    if (this.paused && !force) {
      return false;
    }
    this.tickCount++;
    return true;
  }

  /**
   * Advances the simulation by N ticks.
   * Returns the actual number of ticks advanced.
   */
  public stepMany(count: number, force: boolean = false): number {
    if (count < 0 || !Number.isInteger(count)) {
      throw new Error(`Step count must be a non-negative integer, got: ${count}`);
    }
    if (this.paused && !force) {
      return 0;
    }
    this.tickCount += count;
    return count;
  }

  /**
   * Captures a snapshot of the clock state.
   */
  public getSnapshot(): SimClockSnapshot {
    return {
      currentTick: this.tickCount,
      isPaused: this.paused,
      speedMultiplier: this.speed
    };
  }

  /**
   * Restores clock state from a snapshot.
   */
  public restoreSnapshot(snapshot: SimClockSnapshot): void {
    if (snapshot.currentTick < 0 || !Number.isInteger(snapshot.currentTick)) {
      throw new Error(`Invalid snapshot currentTick: ${snapshot.currentTick}`);
    }
    this.tickCount = snapshot.currentTick;
    this.paused = snapshot.isPaused;
    this.speed = snapshot.speedMultiplier;
  }
}
