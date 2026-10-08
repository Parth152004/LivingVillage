export class DeterministicRng {
    state;
    inc;
    static MULTIPLIER = 6364136223846793005n;
    static MASK64 = 0xffffffffffffffffn;
    constructor(seed, sequence = 1n) {
        this.inc = ((BigInt(sequence) << 1n) | 1n) & DeterministicRng.MASK64;
        this.state = 0n;
        this.step();
        this.state = (this.state + BigInt(seed)) & DeterministicRng.MASK64;
        this.step();
    }
    step() {
        this.state = ((this.state * DeterministicRng.MULTIPLIER) + this.inc) & DeterministicRng.MASK64;
    }
    /**
     * Generates a pseudo-random unsigned 32-bit integer [0, 4294967295].
     */
    nextUint32() {
        const oldState = this.state;
        this.step();
        // Calculate output function (XSH RR)
        const xorShifted = Number(((oldState >> 18n) ^ oldState) >> 27n) >>> 0;
        const rot = Number(oldState >> 59n);
        return ((xorShifted >>> rot) | (xorShifted << ((-rot) & 31))) >>> 0;
    }
    /**
     * Generates a pseudo-random float in the range [0.0, 1.0).
     */
    nextFloat() {
        return this.nextUint32() / 4294967296.0;
    }
    /**
     * Generates an integer in the inclusive range [min, max].
     */
    nextIntRange(min, max) {
        if (min > max) {
            throw new Error(`Invalid range: min (${min}) cannot be greater than max (${max})`);
        }
        const range = (max - min) + 1;
        return min + Math.floor(this.nextFloat() * range);
    }
    /**
     * Generates a boolean with given probability of true [0.0, 1.0].
     */
    nextBoolean(probability = 0.5) {
        return this.nextFloat() < probability;
    }
    /**
     * Serializes current PRNG state for persistence.
     */
    getState() {
        return {
            state: this.state.toString(),
            inc: this.inc.toString()
        };
    }
    /**
     * Restores PRNG state from a serialized snapshot.
     */
    setState(snapshot) {
        this.state = BigInt(snapshot.state) & DeterministicRng.MASK64;
        // Note: inc is immutable for the sequence, but validated against snapshot
        if (this.inc.toString() !== snapshot.inc) {
            // Allow restoring full state if inc differs
            this.inc = BigInt(snapshot.inc) & DeterministicRng.MASK64;
        }
    }
}
