/**
 * Platform-independent SHA-256 Hasher contract.
 * 
 * Provides cryptographic integrity hashing across Node CLI, headless test runners,
 * browser runtimes, and native desktop targets.
 */
export interface ISha256Hasher {
  /**
   * Computes standard SHA-256 hex digest for a UTF-8 string input.
   * Must return a 64-character lowercase hexadecimal string.
   */
  hash(data: string): string;
}
