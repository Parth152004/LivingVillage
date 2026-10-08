import { EntityId, EntityIdAllocator } from './EntityIdAllocator.js';

/**
 * High-performance Sparse-Set Component Pool.
 * 
 * Provides:
 * - O(1) component attachment
 * - O(1) component removal via swap-with-back
 * - O(1) component lookup
 * - Cache-friendly contiguous iteration over dense arrays
 */
export interface ComponentPoolSnapshot<T> {
  name: string;
  dense: EntityId[];
  components: T[];
}

export class SparseSet<T> {
  public readonly name: string;
  private dense: EntityId[] = [];
  private sparse: number[] = [];
  private components: T[] = [];

  constructor(name: string) {
    this.name = name;
  }

  public has(entityId: EntityId): boolean {
    const { index } = EntityIdAllocator.unpack(entityId);
    const denseIndex = this.sparse[index];
    return denseIndex !== undefined && denseIndex < this.dense.length && this.dense[denseIndex] === entityId;
  }

  public get(entityId: EntityId): T | undefined {
    const { index } = EntityIdAllocator.unpack(entityId);
    const denseIndex = this.sparse[index];
    if (denseIndex !== undefined && denseIndex < this.dense.length && this.dense[denseIndex] === entityId) {
      return this.components[denseIndex];
    }
    return undefined;
  }

  public set(entityId: EntityId, component: T): void {
    const { index } = EntityIdAllocator.unpack(entityId);
    const denseIndex = this.sparse[index];

    if (denseIndex !== undefined && denseIndex < this.dense.length && this.dense[denseIndex] === entityId) {
      // Overwrite existing component
      this.components[denseIndex] = component;
      return;
    }

    // Add new component
    const newDenseIndex = this.dense.length;
    this.sparse[index] = newDenseIndex;
    this.dense.push(entityId);
    this.components.push(component);
  }

  public remove(entityId: EntityId): boolean {
    const { index } = EntityIdAllocator.unpack(entityId);
    const denseIndex = this.sparse[index];

    if (denseIndex === undefined || denseIndex >= this.dense.length || this.dense[denseIndex] !== entityId) {
      return false;
    }

    const lastDenseIndex = this.dense.length - 1;
    const lastEntityId = this.dense[lastDenseIndex]!;
    const lastComponent = this.components[lastDenseIndex]!;

    // Move the last element to the deleted slot
    this.dense[denseIndex] = lastEntityId;
    this.components[denseIndex] = lastComponent;

    const { index: lastEntityIndex } = EntityIdAllocator.unpack(lastEntityId);
    this.sparse[lastEntityIndex] = denseIndex;

    // Pop the last element
    this.dense.pop();
    this.components.pop();
    delete this.sparse[index];

    return true;
  }

  public get size(): number {
    return this.dense.length;
  }

  public getEntities(): readonly EntityId[] {
    return this.dense;
  }

  public getComponents(): readonly T[] {
    return this.components;
  }

  /**
   * Serializes component pool.
   */
  public getSnapshot(): ComponentPoolSnapshot<T> {
    return {
      name: this.name,
      dense: [...this.dense],
      components: JSON.parse(JSON.stringify(this.components))
    };
  }

  /**
   * Restores component pool.
   */
  public restoreSnapshot(snapshot: ComponentPoolSnapshot<T>): void {
    this.dense = [...snapshot.dense];
    this.components = JSON.parse(JSON.stringify(snapshot.components));
    this.sparse = [];

    for (let i = 0; i < this.dense.length; i++) {
      const entityId = this.dense[i]!;
      const { index } = EntityIdAllocator.unpack(entityId);
      this.sparse[index] = i;
    }
  }

  public clear(): void {
    this.dense.length = 0;
    this.components.length = 0;
    this.sparse.length = 0;
  }
}
