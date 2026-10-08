/**
 * Deterministic Random Number Generator (PCG32).
 * 
 * Provides fast, statistically robust, and 100% reproducible pseudo-random numbers.
 * Internal 64-bit state is fully serializable for authoritative save/load cycles.
 */
export interface RngStateSnapshot {
  state: string; // Serialized BigInt as decimal string
  inc: string;   // Serialized BigInt as decimal string
}

export class DeterministicRng {
  private state: bigint;
  private readonly inc: bigint;

  private static readonly MULTIPLIER: bigint = 6364136223846793005n;
  private static readonly MASK64: bigint = 0xFFFFFFFFFFFFFFFFn;

  constructor(seed: number | bigint, sequence: number | bigint = 1n) {
    this.inc = ((BigInt(sequence) << 1n) | 1n) & DeterministicRng.MASK64;
    this.state = 0n;
    this.step();
    this.state = (this.state + BigInt(seed)) & DeterministicRng.MASK64;
    this.step();
  }

  private step(): void {
    this.state = ((this.state * DeterministicRng.MULTIPLIER) + this.inc) & DeterministicRng.MASK64;
  }

  /**
   * Generates a pseudo-random unsigned 32-bit integer [0, 4294967295].
   */
  public nextUint32(): number {
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
  public nextFloat(): number {
    return this.nextUint32() / 4294967296.0;
  }

  /**
   * Generates an integer in the inclusive range [min, max].
   */
  public nextIntRange(min: number, max: number): number {
    if (min > max) {
      throw new Error(`Invalid range: min (${min}) cannot be greater than max (${max})`);
    }
    const range = (max - min) + 1;
    return min + Math.floor(this.nextFloat() * range);
  }

  /**
   * Generates a boolean with given probability of true [0.0, 1.0].
   */
  public nextBoolean(probability: number = 0.5): boolean {
    return this.nextFloat() < probability;
  }

  /**
   * Serializes current PRNG state for persistence.
   */
  public getState(): RngStateSnapshot {
    return {
      state: this.state.toString(),
      inc: this.inc.toString()
    };
  }

  /**
   * Restores PRNG state from a serialized snapshot.
   */
  public setState(snapshot: RngStateSnapshot): void {
    this.state = BigInt(snapshot.state) & DeterministicRng.MASK64;
    // Note: inc is immutable for the sequence, but validated against snapshot
    if (this.inc.toString() !== snapshot.inc) {
      // Allow restoring full state if inc differs
      (this as any).inc = BigInt(snapshot.inc) & DeterministicRng.MASK64;
    }
  }
}
