/**
 * Node.js filesystem storage driver with atomic writes (.tmp -> replace).
 * Resolves Node fs/path dynamically to maintain full client bundler compatibility.
 */
export class NodeFsStorageDriver {
    fs;
    path;
    constructor() {
        const modules = NodeFsStorageDriver.resolveNodeModules();
        if (!modules || !modules.fs || !modules.path) {
            throw new Error('NodeFsStorageDriver is only supported in Node.js environments');
        }
        this.fs = modules.fs;
        this.path = modules.path;
    }
    static resolveNodeModules() {
        if (typeof process !== 'undefined' && process.versions?.node) {
            if (typeof process.getBuiltinModule === 'function') {
                return {
                    fs: process.getBuiltinModule('node:fs'),
                    path: process.getBuiltinModule('node:path')
                };
            }
            try {
                const req = globalThis.require;
                if (typeof req === 'function') {
                    return {
                        fs: req('node:fs'),
                        path: req('node:path')
                    };
                }
            }
            catch { }
        }
        return null;
    }
    save(filePath, data) {
        const dir = this.path.dirname(filePath);
        if (!this.fs.existsSync(dir)) {
            this.fs.mkdirSync(dir, { recursive: true });
        }
        const tempPath = `${filePath}.tmp`;
        this.fs.writeFileSync(tempPath, data, 'utf-8');
        this.fs.renameSync(tempPath, filePath);
    }
    load(filePath) {
        if (!this.fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }
        return this.fs.readFileSync(filePath, 'utf-8');
    }
    exists(filePath) {
        return this.fs.existsSync(filePath);
    }
    delete(filePath) {
        if (this.fs.existsSync(filePath)) {
            this.fs.unlinkSync(filePath);
        }
    }
}
/**
 * In-Memory storage driver for tests, web sandboxes, and headless mocks.
 */
export class MemoryStorageDriver {
    store = new Map();
    save(key, data) {
        this.store.set(key, data);
    }
    load(key) {
        const data = this.store.get(key);
        if (data === undefined) {
            throw new Error(`Key does not exist in memory store: ${key}`);
        }
        return data;
    }
    exists(key) {
        return this.store.has(key);
    }
    delete(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}
/**
 * Browser LocalStorage driver for persistent web client storage.
 */
export class LocalStorageDriver {
    prefix;
    constructor(prefix = 'living_village_save_') {
        this.prefix = prefix;
    }
    getKey(key) {
        return `${this.prefix}${key}`;
    }
    save(key, data) {
        if (typeof localStorage === 'undefined') {
            throw new Error('LocalStorageDriver requires a browser environment with localStorage support');
        }
        localStorage.setItem(this.getKey(key), data);
    }
    load(key) {
        if (typeof localStorage === 'undefined') {
            throw new Error('LocalStorageDriver requires a browser environment with localStorage support');
        }
        const data = localStorage.getItem(this.getKey(key));
        if (data === null) {
            throw new Error(`Key does not exist in localStorage: ${key}`);
        }
        return data;
    }
    exists(key) {
        if (typeof localStorage === 'undefined')
            return false;
        return localStorage.getItem(this.getKey(key)) !== null;
    }
    delete(key) {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(this.getKey(key));
        }
    }
}
/**
 * Factory to instantiate the default driver suitable for current runtime environment.
 */
export function createDefaultStorageDriver() {
    if (typeof localStorage !== 'undefined') {
        return new LocalStorageDriver();
    }
    const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
    if (isNode) {
        try {
            return new NodeFsStorageDriver();
        }
        catch {
            return new MemoryStorageDriver();
        }
    }
    return new MemoryStorageDriver();
}
