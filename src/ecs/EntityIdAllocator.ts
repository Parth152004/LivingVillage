/**
 * Deterministic Generational Entity ID Allocator.
 * 
 * Uses generational indices to detect and prevent use-after-free bugs.
 * Packed 32-bit format:
 * - Upper 12 bits: Generation (0 - 4095)
 * - Lower 20 bits: Index (0 - 1,048,575)
 */
export type EntityId = number;

export interface EntityIdAllocatorSnapshot {
  generations: number[];
  freeList: number[];
  nextIndex: number;
}

export class EntityIdAllocator {
  public static readonly INDEX_BITS = 20;
  public static readonly INDEX_MASK = (1 << EntityIdAllocator.INDEX_BITS) - 1; // 0xFFFFF
  public static readonly GEN_BITS = 12;
  public static readonly GEN_MASK = (1 << EntityIdAllocator.GEN_BITS) - 1; // 0xFFF
  public static readonly MAX_ENTITIES = EntityIdAllocator.INDEX_MASK;

  private generations: number[] = [];
  private freeList: number[] = [];
  private nextIndex: number = 1; // Entity ID 0 is reserved as NULL_ENTITY
  private activeCount: number = 0;

  public static readonly NULL_ENTITY: EntityId = 0;

  /**
   * Packs an index and generation into a 32-bit integer EntityId.
   */
  public static pack(index: number, generation: number): EntityId {
    return ((generation & EntityIdAllocator.GEN_MASK) << EntityIdAllocator.INDEX_BITS) | (index & EntityIdAllocator.INDEX_MASK);
  }

  /**
   * Unpacks an EntityId into its index and generation components.
   */
  public static unpack(id: EntityId): { index: number; generation: number } {
    return {
      index: id & EntityIdAllocator.INDEX_MASK,
      generation: (id >>> EntityIdAllocator.INDEX_BITS) & EntityIdAllocator.GEN_MASK
    };
  }

  /**
   * Allocates a new valid, unique EntityId.
   */
  public allocate(): EntityId {
    let index: number;

    if (this.freeList.length > 0) {
      index = this.freeList.pop()!;
    } else {
      if (this.nextIndex > EntityIdAllocator.MAX_ENTITIES) {
        throw new Error(`Maximum entity capacity exceeded (${EntityIdAllocator.MAX_ENTITIES})`);
      }
      index = this.nextIndex++;
      this.generations[index] = 1;
    }

    const gen = this.generations[index] ?? 1;
    this.activeCount++;
    return EntityIdAllocator.pack(index, gen);
  }

  /**
   * Releases an EntityId, invalidating it and incrementing its generation.
   * Returns true if successfully released, false if already invalid/destroyed.
   */
  public release(id: EntityId): boolean {
    if (!this.isValid(id)) {
      return false;
    }

    const { index } = EntityIdAllocator.unpack(id);
    // Increment generation so existing packed IDs with the old generation become invalid
    const nextGen = ((this.generations[index] ?? 1) + 1) & EntityIdAllocator.GEN_MASK;
    this.generations[index] = nextGen === 0 ? 1 : nextGen; // Skip 0
    this.freeList.push(index);
    this.activeCount--;
    return true;
  }

  /**
   * Verifies if an EntityId is currently active and matches the current generation.
   */
  public isValid(id: EntityId): boolean {
    if (id === EntityIdAllocator.NULL_ENTITY || id <= 0) {
      return false;
    }

    const { index, generation } = EntityIdAllocator.unpack(id);
    if (index >= this.nextIndex || index <= 0) {
      return false;
    }

    // Must match current generation and not be sitting in freeList
    const currentGen = this.generations[index];
    if (currentGen !== generation) {
      return false;
    }

    // Extra safety: Verify index is not free
    return !this.freeList.includes(index);
  }

  /**
   * Returns total count of currently active entities.
   */
  public get activeEntityCount(): number {
    return this.activeCount;
  }

  /**
   * Returns all currently active entity IDs deterministically sorted.
   */
  public getAllActive(): EntityId[] {
    const active: EntityId[] = [];
    for (let i = 1; i < this.nextIndex; i++) {
      if (!this.freeList.includes(i)) {
        const gen = this.generations[i] ?? 1;
        active.push(EntityIdAllocator.pack(i, gen));
      }
    }
    return active.sort((a, b) => a - b);
  }

  /**
   * Serializes allocator state.
   */
  public getSnapshot(): EntityIdAllocatorSnapshot {
    return {
      generations: [...this.generations],
      freeList: [...this.freeList],
      nextIndex: this.nextIndex
    };
  }

  /**
   * Restores allocator state.
   */
  public restoreSnapshot(snapshot: EntityIdAllocatorSnapshot): void {
    this.generations = [...snapshot.generations];
    this.freeList = [...snapshot.freeList];
    this.nextIndex = snapshot.nextIndex;
    this.activeCount = (this.nextIndex - 1) - this.freeList.length;
  }
}
