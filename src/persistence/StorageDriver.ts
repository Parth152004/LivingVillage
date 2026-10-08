/**
 * Pluggable Storage Driver Interface.
 * 
 * Allows SaveManager to run identically across:
 * - Node.js CLI / headless tests (File system)
 * - Browser / Web development (LocalStorage / Memory)
 * - Tauri desktop/mobile runtime (Tauri FS plugin)
 */
export interface IStorageDriver {
  save(key: string, data: string): void;
  load(key: string): string;
  exists(key: string): boolean;
  delete(key: string): void;
}

/**
 * Node.js filesystem storage driver with atomic writes (.tmp -> replace).
 * Resolves Node fs/path dynamically to maintain full client bundler compatibility.
 */
export class NodeFsStorageDriver implements IStorageDriver {
  private fs: any;
  private path: any;

  constructor() {
    const modules = NodeFsStorageDriver.resolveNodeModules();
    if (!modules || !modules.fs || !modules.path) {
      throw new Error('NodeFsStorageDriver is only supported in Node.js environments');
    }
    this.fs = modules.fs;
    this.path = modules.path;
  }

  private static resolveNodeModules(): { fs: any; path: any } | null {
    if (typeof process !== 'undefined' && process.versions?.node) {
      if (typeof (process as any).getBuiltinModule === 'function') {
        return {
          fs: (process as any).getBuiltinModule('node:fs'),
          path: (process as any).getBuiltinModule('node:path')
        };
      }
      try {
        const req = (globalThis as any).require;
        if (typeof req === 'function') {
          return {
            fs: req('node:fs'),
            path: req('node:path')
          };
        }
      } catch {}
    }
    return null;
  }

  public save(filePath: string, data: string): void {
    const dir = this.path.dirname(filePath);
    if (!this.fs.existsSync(dir)) {
      this.fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${filePath}.tmp`;
    this.fs.writeFileSync(tempPath, data, 'utf-8');
    this.fs.renameSync(tempPath, filePath);
  }

  public load(filePath: string): string {
    if (!this.fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }
    return this.fs.readFileSync(filePath, 'utf-8');
  }

  public exists(filePath: string): boolean {
    return this.fs.existsSync(filePath);
  }

  public delete(filePath: string): void {
    if (this.fs.existsSync(filePath)) {
      this.fs.unlinkSync(filePath);
    }
  }
}

/**
 * In-Memory storage driver for tests, web sandboxes, and headless mocks.
 */
export class MemoryStorageDriver implements IStorageDriver {
  private store: Map<string, string> = new Map();

  public save(key: string, data: string): void {
    this.store.set(key, data);
  }

  public load(key: string): string {
    const data = this.store.get(key);
    if (data === undefined) {
      throw new Error(`Key does not exist in memory store: ${key}`);
    }
    return data;
  }

  public exists(key: string): boolean {
    return this.store.has(key);
  }

  public delete(key: string): void {
    this.store.delete(key);
  }

  public clear(): void {
    this.store.clear();
  }
}

/**
 * Browser LocalStorage driver for persistent web client storage.
 */
export class LocalStorageDriver implements IStorageDriver {
  private prefix: string;

  constructor(prefix: string = 'living_village_save_') {
    this.prefix = prefix;
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  public save(key: string, data: string): void {
    if (typeof localStorage === 'undefined') {
      throw new Error('LocalStorageDriver requires a browser environment with localStorage support');
    }
    localStorage.setItem(this.getKey(key), data);
  }

  public load(key: string): string {
    if (typeof localStorage === 'undefined') {
      throw new Error('LocalStorageDriver requires a browser environment with localStorage support');
    }
    const data = localStorage.getItem(this.getKey(key));
    if (data === null) {
      throw new Error(`Key does not exist in localStorage: ${key}`);
    }
    return data;
  }

  public exists(key: string): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(this.getKey(key)) !== null;
  }

  public delete(key: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.getKey(key));
    }
  }
}

/**
 * Factory to instantiate the default driver suitable for current runtime environment.
 */
export function createDefaultStorageDriver(): IStorageDriver {
  if (typeof localStorage !== 'undefined') {
    return new LocalStorageDriver();
  }
  const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  if (isNode) {
    try {
      return new NodeFsStorageDriver();
    } catch {
      return new MemoryStorageDriver();
    }
  }
  return new MemoryStorageDriver();
}
