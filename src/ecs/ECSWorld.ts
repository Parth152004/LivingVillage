import { EntityId, EntityIdAllocator, EntityIdAllocatorSnapshot } from './EntityIdAllocator.js';
import { SparseSet, ComponentPoolSnapshot } from './SparseSet.js';

export interface ECSWorldSnapshot {
  allocator: EntityIdAllocatorSnapshot;
  pools: ComponentPoolSnapshot<any>[];
}

export class ECSWorld {
  private allocator: EntityIdAllocator;
  private pools: Map<string, SparseSet<any>> = new Map();

  constructor() {
    this.allocator = new EntityIdAllocator();
  }

  /**
   * Creates a new unique entity.
   */
  public createEntity(): EntityId {
    return this.allocator.allocate();
  }

  /**
   * Destroys an entity and removes all its attached components.
   * Returns true if destroyed, false if entity was already invalid.
   */
  public destroyEntity(id: EntityId): boolean {
    if (!this.allocator.isValid(id)) {
      return false;
    }

    // Clean up all component attachments
    for (const pool of this.pools.values()) {
      pool.remove(id);
    }

    return this.allocator.release(id);
  }

  /**
   * Checks if an entity is currently alive and valid.
   */
  public isValidEntity(id: EntityId): boolean {
    return this.allocator.isValid(id);
  }

  /**
   * Registers or retrieves a component pool.
   */
  public getPool<T>(componentName: string): SparseSet<T> {
    let pool = this.pools.get(componentName);
    if (!pool) {
      pool = new SparseSet<T>(componentName);
      this.pools.set(componentName, pool);
    }
    return pool as SparseSet<T>;
  }

  /**
   * Attaches a component to an entity. Throws if entity is invalid.
   */
  public addComponent<T>(entityId: EntityId, componentName: string, component: T): void {
    if (!this.allocator.isValid(entityId)) {
      throw new Error(`Cannot add component '${componentName}' to invalid entity: ${entityId}`);
    }
    this.getPool<T>(componentName).set(entityId, component);
  }

  /**
   * Gets a component attached to an entity, or undefined if missing/invalid.
   */
  public getComponent<T>(entityId: EntityId, componentName: string): T | undefined {
    if (!this.allocator.isValid(entityId)) {
      return undefined;
    }
    return this.getPool<T>(componentName).get(entityId);
  }

  /**
   * Checks if an entity has a specific component.
   */
  public hasComponent(entityId: EntityId, componentName: string): boolean {
    if (!this.allocator.isValid(entityId)) {
      return false;
    }
    const pool = this.pools.get(componentName);
    return pool ? pool.has(entityId) : false;
  }

  /**
   * Removes a component from an entity.
   */
  public removeComponent(entityId: EntityId, componentName: string): boolean {
    if (!this.allocator.isValid(entityId)) {
      return false;
    }
    const pool = this.pools.get(componentName);
    return pool ? pool.remove(entityId) : false;
  }

  /**
   * Queries all entities possessing all specified component names.
   * Returns a deterministically sorted list of EntityIds.
   */
  public queryEntities(componentNames: string[]): EntityId[] {
    if (componentNames.length === 0) {
      return this.allocator.getAllActive();
    }

    // Find the smallest pool to minimize checks
    let smallestPool: SparseSet<any> | null = null;
    for (const name of componentNames) {
      const pool = this.pools.get(name);
      if (!pool || pool.size === 0) {
        return []; // If any pool is empty or missing, intersection is empty
      }
      if (smallestPool === null || pool.size < smallestPool.size) {
        smallestPool = pool;
      }
    }

    if (!smallestPool) {
      return [];
    }

    const matches: EntityId[] = [];
    const candidates = smallestPool.getEntities();

    for (let i = 0; i < candidates.length; i++) {
      const entityId = candidates[i]!;
      if (!this.allocator.isValid(entityId)) {
        continue;
      }

      let hasAll = true;
      for (const name of componentNames) {
        const pool = this.pools.get(name)!;
        if (!pool.has(entityId)) {
          hasAll = false;
          break;
        }
      }

      if (hasAll) {
        matches.push(entityId);
      }
    }

    // Deterministic sort order
    return matches.sort((a, b) => a - b);
  }

  public get activeEntityCount(): number {
    return this.allocator.activeEntityCount;
  }

  public getAllActiveEntities(): EntityId[] {
    return this.allocator.getAllActive();
  }

  /**
   * Captures complete ECS state snapshot.
   */
  public getSnapshot(): ECSWorldSnapshot {
    const poolsSnapshots: ComponentPoolSnapshot<any>[] = [];
    for (const pool of this.pools.values()) {
      poolsSnapshots.push(pool.getSnapshot());
    }

    return {
      allocator: this.allocator.getSnapshot(),
      pools: poolsSnapshots
    };
  }

  /**
   * Restores ECS state from snapshot.
   */
  public restoreSnapshot(snapshot: ECSWorldSnapshot): void {
    this.allocator.restoreSnapshot(snapshot.allocator);
    this.pools.clear();

    for (const poolSnap of snapshot.pools) {
      const pool = new SparseSet<any>(poolSnap.name);
      pool.restoreSnapshot(poolSnap);
      this.pools.set(poolSnap.name, pool);
    }
  }

  public clear(): void {
    this.pools.clear();
    this.allocator = new EntityIdAllocator();
  }
}
