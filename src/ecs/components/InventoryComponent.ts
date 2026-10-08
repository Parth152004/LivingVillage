/**
 * Minimal Inventory Component for Player Entities.
 * 
 * Supports discrete item stacks with quantity and optional tool charges (e.g. watering can).
 * Strictly scoped to tools, seeds, and crops for Phase 1B-1.
 */

export interface ItemStack {
  readonly itemId: string;
  quantity: number;
  charges?: number;
}

export interface InventoryComponent {
  slots: (ItemStack | null)[];
}

/**
 * Checks if inventory contains at least minQty of itemId.
 */
export function hasItem(inv: InventoryComponent, itemId: string, minQty: number = 1): boolean {
  let count = 0;
  for (const slot of inv.slots) {
    if (slot && slot.itemId === itemId) {
      count += slot.quantity;
      if (count >= minQty) return true;
    }
  }
  return false;
}

/**
 * Returns total quantity of an item across all inventory slots.
 */
export function getItemCount(inv: InventoryComponent, itemId: string): number {
  let count = 0;
  for (const slot of inv.slots) {
    if (slot && slot.itemId === itemId) {
      count += slot.quantity;
    }
  }
  return count;
}

/**
 * Retrieves the first stack of a given itemId.
 */
export function getFirstItem(inv: InventoryComponent, itemId: string): ItemStack | undefined {
  for (const slot of inv.slots) {
    if (slot && slot.itemId === itemId) {
      return slot;
    }
  }
  return undefined;
}

/**
 * Deducts quantity of an item from inventory.
 * Returns true if successful, false if insufficient items.
 */
export function deductItem(inv: InventoryComponent, itemId: string, qty: number = 1): boolean {
  if (!hasItem(inv, itemId, qty)) {
    return false;
  }

  let remaining = qty;
  for (let i = 0; i < inv.slots.length; i++) {
    const slot = inv.slots[i];
    if (slot && slot.itemId === itemId) {
      if (slot.quantity <= remaining) {
        remaining -= slot.quantity;
        inv.slots[i] = null;
      } else {
        slot.quantity -= remaining;
        remaining = 0;
      }
      if (remaining === 0) break;
    }
  }
  return true;
}

/**
 * Checks if inventory can accept an incoming item stack.
 */
export function canAcceptItem(inv: InventoryComponent, itemId: string, maxStack: number = 99): boolean {
  for (const slot of inv.slots) {
    if (slot === null) return true;
    if (slot.itemId === itemId && slot.quantity < maxStack) return true;
  }
  return false;
}

/**
 * Checks if inventory has sufficient capacity to accept a specific quantity of an item.
 */
export function canAcceptItemQuantity(
  inv: InventoryComponent,
  itemId: string,
  qty: number,
  maxStack: number = 99
): boolean {
  if (qty <= 0) return true;
  let capacity = 0;
  for (const slot of inv.slots) {
    if (slot === null) {
      capacity += maxStack;
    } else if (slot.itemId === itemId && slot.charges === undefined) {
      capacity += Math.max(0, maxStack - slot.quantity);
    }
    if (capacity >= qty) return true;
  }
  return capacity >= qty;
}

/**
 * Adds items to inventory.
 * Stacks with existing items if charges are not present, or places in first empty slot.
 */
export function addItem(
  inv: InventoryComponent,
  itemId: string,
  qty: number = 1,
  charges?: number,
  maxStack: number = 99
): boolean {
  // If item has charges (e.g. watering can), place into empty slot to avoid merging charges
  if (charges !== undefined) {
    for (let i = 0; i < inv.slots.length; i++) {
      if (inv.slots[i] === null) {
        inv.slots[i] = { itemId, quantity: qty, charges };
        return true;
      }
    }
    return false;
  }

  let remaining = qty;
  // Try stacking with existing slots
  for (const slot of inv.slots) {
    if (slot && slot.itemId === itemId && slot.charges === undefined) {
      const space = maxStack - slot.quantity;
      if (space > 0) {
        const toAdd = Math.min(space, remaining);
        slot.quantity += toAdd;
        remaining -= toAdd;
        if (remaining === 0) return true;
      }
    }
  }

  // Place into empty slots
  for (let i = 0; i < inv.slots.length; i++) {
    if (inv.slots[i] === null) {
      const toAdd = Math.min(maxStack, remaining);
      inv.slots[i] = { itemId, quantity: toAdd };
      remaining -= toAdd;
      if (remaining === 0) return true;
    }
  }

  return remaining === 0;
}
