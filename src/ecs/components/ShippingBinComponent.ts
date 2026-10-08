import { ItemStack } from './InventoryComponent.js';

/**
 * Authoritative Shipping Bin Component.
 * 
 * Attached to the homestead shipping bin entity at (14, 12).
 * Stores produce deposited by the player for overnight settlement at dawn.
 */
export interface ShippingBinComponent {
  items: ItemStack[];
}
