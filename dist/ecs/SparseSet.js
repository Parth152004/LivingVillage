import { EntityIdAllocator } from './EntityIdAllocator.js';
export class SparseSet {
    name;
    dense = [];
    sparse = [];
    components = [];
    constructor(name) {
        this.name = name;
    }
    has(entityId) {
        const { index } = EntityIdAllocator.unpack(entityId);
        const denseIndex = this.sparse[index];
        return denseIndex !== undefined && denseIndex < this.dense.length && this.dense[denseIndex] === entityId;
    }
    get(entityId) {
        const { index } = EntityIdAllocator.unpack(entityId);
        const denseIndex = this.sparse[index];
        if (denseIndex !== undefined && denseIndex < this.dense.length && this.dense[denseIndex] === entityId) {
            return this.components[denseIndex];
        }
        return undefined;
    }
    set(entityId, component) {
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
    remove(entityId) {
        const { index } = EntityIdAllocator.unpack(entityId);
        const denseIndex = this.sparse[index];
        if (denseIndex === undefined || denseIndex >= this.dense.length || this.dense[denseIndex] !== entityId) {
            return false;
        }
        const lastDenseIndex = this.dense.length - 1;
        const lastEntityId = this.dense[lastDenseIndex];
        const lastComponent = this.components[lastDenseIndex];
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
    get size() {
        return this.dense.length;
    }
    getEntities() {
        return this.dense;
    }
    getComponents() {
        return this.components;
    }
    /**
     * Serializes component pool.
     */
    getSnapshot() {
        return {
            name: this.name,
            dense: [...this.dense],
            components: JSON.parse(JSON.stringify(this.components))
        };
    }
    /**
     * Restores component pool.
     */
    restoreSnapshot(snapshot) {
        this.dense = [...snapshot.dense];
        this.components = JSON.parse(JSON.stringify(snapshot.components));
        this.sparse = [];
        for (let i = 0; i < this.dense.length; i++) {
            const entityId = this.dense[i];
            const { index } = EntityIdAllocator.unpack(entityId);
            this.sparse[index] = i;
        }
    }
    clear() {
        this.dense.length = 0;
        this.components.length = 0;
        this.sparse.length = 0;
    }
}
