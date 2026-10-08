import { EntityId } from '../ecs/EntityIdAllocator.js';

/**
 * Deterministic Uniform Spatial Hash for Dynamic Entities.
 * 
 * Cell size is fixed to 4.0 meters (world units).
 * Range queries return entities deterministically sorted by distance,
 * with ties broken by EntityId ascending.
 */
export interface SpatialQueryResult {
  entityId: EntityId;
  x: number;
  y: number;
  distanceSquared: number;
}

export interface SpatialHashSnapshot {
  cellSize: number;
  entries: Array<{
    entityId: EntityId;
    x: number;
    y: number;
  }>;
}

export class SpatialHash {
  public readonly cellSize: number;
  private inverseCellSize: number;

  // Maps cellKey -> Set of EntityIds
  private cells: Map<string, Set<EntityId>> = new Map();
  // Maps EntityId -> Current position and cellKey
  private entityPositions: Map<EntityId, { x: number; y: number; cellKey: string }> = new Map();

  constructor(cellSize: number = 4.0) {
    if (cellSize <= 0 || !Number.isFinite(cellSize)) {
      throw new Error(`SpatialHash cellSize must be a positive finite number, got: ${cellSize}`);
    }
    this.cellSize = cellSize;
    this.inverseCellSize = 1.0 / cellSize;
  }

  private cellCoord(val: number): number {
    return Math.floor(val * this.inverseCellSize);
  }

  private cellKey(cellX: number, cellY: number): string {
    return `${cellX},${cellY}`;
  }

  public insert(entityId: EntityId, x: number, y: number): void {
    if (this.entityPositions.has(entityId)) {
      this.update(entityId, x, y);
      return;
    }

    const cX = this.cellCoord(x);
    const cY = this.cellCoord(y);
    const key = this.cellKey(cX, cY);

    let cell = this.cells.get(key);
    if (!cell) {
      cell = new Set();
      this.cells.set(key, cell);
    }
    cell.add(entityId);

    this.entityPositions.set(entityId, { x, y, cellKey: key });
  }

  public remove(entityId: EntityId): boolean {
    const entry = this.entityPositions.get(entityId);
    if (!entry) {
      return false;
    }

    const cell = this.cells.get(entry.cellKey);
    if (cell) {
      cell.delete(entityId);
      if (cell.size === 0) {
        this.cells.delete(entry.cellKey);
      }
    }

    this.entityPositions.delete(entityId);
    return true;
  }

  public update(entityId: EntityId, newX: number, newY: number): void {
    const entry = this.entityPositions.get(entityId);
    if (!entry) {
      this.insert(entityId, newX, newY);
      return;
    }

    const newCX = this.cellCoord(newX);
    const newCY = this.cellCoord(newY);
    const newKey = this.cellKey(newCX, newCY);

    if (entry.cellKey !== newKey) {
      // Remove from old cell
      const oldCell = this.cells.get(entry.cellKey);
      if (oldCell) {
        oldCell.delete(entityId);
        if (oldCell.size === 0) {
          this.cells.delete(entry.cellKey);
        }
      }

      // Add to new cell
      let newCell = this.cells.get(newKey);
      if (!newCell) {
        newCell = new Set();
        this.cells.set(newKey, newCell);
      }
      newCell.add(entityId);

      entry.cellKey = newKey;
    }

    entry.x = newX;
    entry.y = newY;
  }

  public getPosition(entityId: EntityId): { x: number; y: number } | undefined {
    const entry = this.entityPositions.get(entityId);
    return entry ? { x: entry.x, y: entry.y } : undefined;
  }

  public hasEntity(entityId: EntityId): boolean {
    return this.entityPositions.has(entityId);
  }

  public get totalEntities(): number {
    return this.entityPositions.size;
  }

  /**
   * Performs a deterministic range query.
   * Results are sorted by distance ascending, breaking ties by EntityId ascending.
   */
  public queryRange(centerX: number, centerY: number, radiusMeters: number): SpatialQueryResult[] {
    if (radiusMeters < 0) {
      return [];
    }

    const minCX = this.cellCoord(centerX - radiusMeters);
    const maxCX = this.cellCoord(centerX + radiusMeters);
    const minCY = this.cellCoord(centerY - radiusMeters);
    const maxCY = this.cellCoord(centerY + radiusMeters);

    const radiusSq = radiusMeters * radiusMeters;
    const candidates: SpatialQueryResult[] = [];

    // Iterate bounding cells in deterministic grid order
    for (let cy = minCY; cy <= maxCY; cy++) {
      for (let cx = minCX; cx <= maxCX; cx++) {
        const key = this.cellKey(cx, cy);
        const cell = this.cells.get(key);
        if (!cell) continue;

        for (const entityId of cell) {
          const pos = this.entityPositions.get(entityId)!;
          const dx = pos.x - centerX;
          const dy = pos.y - centerY;
          const distSq = dx * dx + dy * dy;

          if (distSq <= radiusSq) {
            candidates.push({
              entityId,
              x: pos.x,
              y: pos.y,
              distanceSquared: distSq
            });
          }
        }
      }
    }

    // Deterministic sorting: distance squared first, then entityId
    return candidates.sort((a, b) => {
      if (Math.abs(a.distanceSquared - b.distanceSquared) > 0.000001) {
        return a.distanceSquared - b.distanceSquared;
      }
      return a.entityId - b.entityId;
    });
  }

  public clear(): void {
    this.cells.clear();
    this.entityPositions.clear();
  }

  public getSnapshot(): SpatialHashSnapshot {
    const entries: Array<{ entityId: EntityId; x: number; y: number }> = [];
    const sortedIds = Array.from(this.entityPositions.keys()).sort((a, b) => a - b);
    for (const id of sortedIds) {
      const pos = this.entityPositions.get(id)!;
      entries.push({ entityId: id, x: pos.x, y: pos.y });
    }
    return {
      cellSize: this.cellSize,
      entries
    };
  }

  public restoreSnapshot(snapshot: SpatialHashSnapshot): void {
    this.clear();
    for (const entry of snapshot.entries) {
      this.insert(entry.entityId, entry.x, entry.y);
    }
  }
}
