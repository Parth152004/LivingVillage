import { WorldSimulation, SimulationSnapshot } from '../core/WorldSimulation.js';
import { SaveFileContent } from './SaveSchema.js';
import { IStorageDriver, createDefaultStorageDriver } from './StorageDriver.js';
import { ISha256Hasher } from './Hasher.js';
import { NodeCryptoHasher } from './NodeCryptoHasher.js';
import { BrowserSha256Hasher } from './BrowserSha256Hasher.js';

/**
 * Creates the default SHA-256 hasher based on runtime environment.
 * In Node.js environments (CLI, test suites, workers), uses Node's native OpenSSL crypto.
 * In browser/client environments, uses pure TypeScript synchronous SHA-256.
 */
export function createDefaultHasher(): ISha256Hasher {
  const isNode = typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
  if (isNode) {
    try {
      return new NodeCryptoHasher();
    } catch {
      return new BrowserSha256Hasher();
    }
  }
  return new BrowserSha256Hasher();
}

/**
 * Authoritative Save and Persistence Manager.
 * 
 * Implements atomic writes, SHA-256 integrity verification,
 * pluggable storage drivers, cross-platform hashing, and corrupted-save detection.
 */
export class SaveManager {
  public static readonly CURRENT_SAVE_VERSION = 1;
  public static readonly GAME_VERSION = '0.1.0-phase1a';

  private static hasher: ISha256Hasher = createDefaultHasher();
  private static defaultDriver: IStorageDriver = createDefaultStorageDriver();

  /**
   * Configures the cryptographic hasher used for save integrity verification.
   */
  public static setHasher(hasher: ISha256Hasher): void {
    SaveManager.hasher = hasher;
  }

  /**
   * Retrieves the current cryptographic hasher.
   */
  public static getHasher(): ISha256Hasher {
    return SaveManager.hasher;
  }

  /**
   * Configures the default storage driver.
   */
  public static setDefaultDriver(driver: IStorageDriver): void {
    SaveManager.defaultDriver = driver;
  }

  /**
   * Retrieves the current default storage driver.
   */
  public static getDefaultDriver(): IStorageDriver {
    return SaveManager.defaultDriver;
  }

  /**
   * Computes SHA-256 checksum of raw serialized state string using active hasher.
   */
  public static computeChecksum(data: string): string {
    return SaveManager.hasher.hash(data);
  }

  /**
   * Serializes simulation state to JSON string with metadata and SHA-256 checksum.
   */
  public static serialize(sim: WorldSimulation): string {
    const snapshot: SimulationSnapshot = sim.getSnapshot();
    const rawSnapshotStr = JSON.stringify(snapshot);
    const checksum = SaveManager.computeChecksum(rawSnapshotStr);

    const fileContent: SaveFileContent = {
      metadata: {
        saveVersion: SaveManager.CURRENT_SAVE_VERSION,
        gameVersion: SaveManager.GAME_VERSION,
        savedAtTimestamp: Date.now(),
        checksum
      },
      snapshot
    };

    return JSON.stringify(fileContent, null, 2);
  }

  /**
   * Deserializes and validates a save string into authoritative state.
   * Throws detailed error if corrupted or tampered.
   */
  public static deserialize(serializedContent: string): SimulationSnapshot {
    let parsed: any;
    try {
      parsed = JSON.parse(serializedContent);
    } catch (e: any) {
      throw new Error(`Corrupted save file: Invalid JSON syntax (${e.message})`);
    }

    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Corrupted save file: Root must be a valid JSON object');
    }

    const { metadata, snapshot } = parsed as SaveFileContent;
    if (!metadata || !snapshot) {
      throw new Error('Corrupted save file: Missing required metadata or snapshot payload');
    }

    if (metadata.saveVersion !== SaveManager.CURRENT_SAVE_VERSION) {
      throw new Error(`Unsupported save version: ${metadata.saveVersion} (expected: ${SaveManager.CURRENT_SAVE_VERSION})`);
    }

    // Verify cryptographic integrity
    const rawSnapshotStr = JSON.stringify(snapshot);
    const expectedChecksum = SaveManager.computeChecksum(rawSnapshotStr);

    if (metadata.checksum !== expectedChecksum) {
      throw new Error(`Corrupted save file: Checksum verification failed (stored: ${metadata.checksum}, expected: ${expectedChecksum})`);
    }

    return snapshot;
  }

  /**
   * Saves authoritative world state using a storage driver.
   */
  public static save(key: string, sim: WorldSimulation, driver: IStorageDriver = SaveManager.defaultDriver): void {
    const serialized = SaveManager.serialize(sim);
    driver.save(key, serialized);
  }

  /**
   * Loads authoritative world state using a storage driver.
   */
  public static load(key: string, sim: WorldSimulation, driver: IStorageDriver = SaveManager.defaultDriver): void {
    const content = driver.load(key);
    const snapshot = SaveManager.deserialize(content);
    sim.restoreSnapshot(snapshot);
  }

  /**
   * Backwards-compatible alias for Node.js filesystem save.
   */
  public static saveAtomicSync(filePath: string, sim: WorldSimulation): void {
    SaveManager.save(filePath, sim, SaveManager.defaultDriver);
  }

  /**
   * Backwards-compatible alias for Node.js filesystem load.
   */
  public static loadSync(filePath: string, sim: WorldSimulation): void {
    SaveManager.load(filePath, sim, SaveManager.defaultDriver);
  }
}
