import { EntityIdAllocator } from './EntityIdAllocator.js';
import { SparseSet } from './SparseSet.js';
export class ECSWorld {
    allocator;
    pools = new Map();
    constructor() {
        this.allocator = new EntityIdAllocator();
    }
    /**
     * Creates a new unique entity.
     */
    createEntity() {
        return this.allocator.allocate();
    }
    /**
     * Destroys an entity and removes all its attached components.
     * Returns true if destroyed, false if entity was already invalid.
     */
    destroyEntity(id) {
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
    isValidEntity(id) {
        return this.allocator.isValid(id);
    }
    /**
     * Registers or retrieves a component pool.
     */
    getPool(componentName) {
        let pool = this.pools.get(componentName);
        if (!pool) {
            pool = new SparseSet(componentName);
            this.pools.set(componentName, pool);
        }
        return pool;
    }
    /**
     * Attaches a component to an entity. Throws if entity is invalid.
     */
    addComponent(entityId, componentName, component) {
        if (!this.allocator.isValid(entityId)) {
            throw new Error(`Cannot add component '${componentName}' to invalid entity: ${entityId}`);
        }
        this.getPool(componentName).set(entityId, component);
    }
    /**
     * Gets a component attached to an entity, or undefined if missing/invalid.
     */
    getComponent(entityId, componentName) {
        if (!this.allocator.isValid(entityId)) {
            return undefined;
        }
        return this.getPool(componentName).get(entityId);
    }
    /**
     * Checks if an entity has a specific component.
     */
    hasComponent(entityId, componentName) {
        if (!this.allocator.isValid(entityId)) {
            return false;
        }
        const pool = this.pools.get(componentName);
        return pool ? pool.has(entityId) : false;
    }
    /**
     * Removes a component from an entity.
     */
    removeComponent(entityId, componentName) {
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
    queryEntities(componentNames) {
        if (componentNames.length === 0) {
            return this.allocator.getAllActive();
        }
        // Find the smallest pool to minimize checks
        let smallestPool = null;
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
        const matches = [];
        const candidates = smallestPool.getEntities();
        for (let i = 0; i < candidates.length; i++) {
            const entityId = candidates[i];
            if (!this.allocator.isValid(entityId)) {
                continue;
            }
            let hasAll = true;
            for (const name of componentNames) {
                const pool = this.pools.get(name);
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
    get activeEntityCount() {
        return this.allocator.activeEntityCount;
    }
    getAllActiveEntities() {
        return this.allocator.getAllActive();
    }
    /**
     * Captures complete ECS state snapshot.
     */
    getSnapshot() {
        const poolsSnapshots = [];
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
    restoreSnapshot(snapshot) {
        this.allocator.restoreSnapshot(snapshot.allocator);
        this.pools.clear();
        for (const poolSnap of snapshot.pools) {
            const pool = new SparseSet(poolSnap.name);
            pool.restoreSnapshot(poolSnap);
            this.pools.set(poolSnap.name, pool);
        }
    }
    clear() {
        this.pools.clear();
        this.allocator = new EntityIdAllocator();
    }
}
