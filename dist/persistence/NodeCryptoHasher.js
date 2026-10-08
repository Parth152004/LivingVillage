/**
 * Node.js native OpenSSL SHA-256 hasher.
 *
 * Provides hardware-accelerated cryptographic integrity checks in Node.js CLI,
 * test runners, and server-side simulation workers.
 */
export class NodeCryptoHasher {
    cryptoModule;
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
    static resolveNodeCrypto() {
        if (typeof process !== 'undefined' && process.versions?.node) {
            if (typeof process.getBuiltinModule === 'function') {
                return process.getBuiltinModule('node:crypto');
            }
            try {
                const req = globalThis.require;
                if (typeof req === 'function') {
                    return req('node:crypto');
                }
            }
            catch { }
        }
        return null;
    }
    /**
     * Computes standard SHA-256 hex digest using Node crypto.
     */
    hash(data) {
        return this.cryptoModule.createHash('sha256').update(data).digest('hex');
    }
}
