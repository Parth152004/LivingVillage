/**
 * Deterministic test/runtime environment provider.
 */
export class SimpleEnvironmentProvider {
    raining = false;
    rainIntensity = 1.0;
    setRaining(isRaining, intensity = 1.0) {
        this.raining = isRaining;
        this.rainIntensity = Math.max(0.0, Math.min(1.0, intensity));
    }
    isRaining(_currentTick) {
        return this.raining;
    }
    getRainIntensity(_currentTick) {
        return this.rainIntensity;
    }
}
