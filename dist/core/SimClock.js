export class SimClock {
    static TICK_RATE_HZ = 20;
    static STEP_MS = 50; // 1000ms / 20 = 50ms
    static STEP_SECONDS = 0.05;
    tickCount;
    paused;
    speed;
    constructor(initialTick = 0) {
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
    get currentTick() {
        return this.tickCount;
    }
    /**
     * Total elapsed virtual in-game time in seconds.
     */
    get virtualTimeSeconds() {
        return this.tickCount * SimClock.STEP_SECONDS;
    }
    /**
     * Whether the clock is paused.
     */
    get isPaused() {
        return this.paused;
    }
    /**
     * Speed multiplier for simulation progression (default: 1.0).
     */
    get speedMultiplier() {
        return this.speed;
    }
    setSpeedMultiplier(multiplier) {
        if (multiplier <= 0 || !Number.isFinite(multiplier)) {
            throw new Error(`Speed multiplier must be a positive finite number, got: ${multiplier}`);
        }
        this.speed = multiplier;
    }
    pause() {
        this.paused = true;
    }
    resume() {
        this.paused = false;
    }
    /**
     * Advances the simulation by exactly 1 tick if not paused.
     * If `force` is true, advances even when paused (useful for manual debugging).
     * Returns true if tick advanced, false if skipped due to pause.
     */
    step(force = false) {
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
    stepMany(count, force = false) {
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
    getSnapshot() {
        return {
            currentTick: this.tickCount,
            isPaused: this.paused,
            speedMultiplier: this.speed
        };
    }
    /**
     * Restores clock state from a snapshot.
     */
    restoreSnapshot(snapshot) {
        if (snapshot.currentTick < 0 || !Number.isInteger(snapshot.currentTick)) {
            throw new Error(`Invalid snapshot currentTick: ${snapshot.currentTick}`);
        }
        this.tickCount = snapshot.currentTick;
        this.paused = snapshot.isPaused;
        this.speed = snapshot.speedMultiplier;
    }
}
