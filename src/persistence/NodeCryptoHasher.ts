import { ISha256Hasher } from './Hasher.js';

/**
 * Node.js native OpenSSL SHA-256 hasher.
 * 
 * Provides hardware-accelerated cryptographic integrity checks in Node.js CLI,
 * test runners, and server-side simulation workers.
 */
export class NodeCryptoHasher implements ISha256Hasher {
  private cryptoModule: any;

  constructor() {
    this.cryptoModule = NodeCryptoHasher.resolveNodeCrypto();
    if (!this.cryptoModule || typeof this.cryptoModule.createHash !== 'function') {
      throw new Error('NodeCryptoHasher requires a Node.js runtime with built-in crypto support');
    }
  }

  /**
   * Dynamically resolves Node.js native crypto module without static import
   * statements that trigger browser bundler externalization warnings.
   */
  private static resolveNodeCrypto(): any {
    if (typeof process !== 'undefined' && process.versions?.node) {
      if (typeof (process as any).getBuiltinModule === 'function') {
        return (process as any).getBuiltinModule('node:crypto');
      }
      try {
        const req = (globalThis as any).require;
        if (typeof req === 'function') {
          return req('node:crypto');
        }
      } catch {}
    }
    return null;
  }

  /**
   * Computes standard SHA-256 hex digest using Node crypto.
   */
  public hash(data: string): string {
    return this.cryptoModule.createHash('sha256').update(data).digest('hex');
  }
}
