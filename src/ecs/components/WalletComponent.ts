/**
 * Authoritative Player Wallet Component.
 * 
 * Stores the player's current gold balance.
 * Gold is guaranteed to remain a non-negative integer.
 */
export interface WalletComponent {
  gold: number;
}
