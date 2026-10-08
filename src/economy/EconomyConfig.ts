/**
 * Authoritative Static Economy Configuration.
 * 
 * Centralizes all approved static commerce parameters:
 * - Starting gold
 * - Seed buy prices
 * - Harvested crop sell prices
 * 
 * Strictly static integer pricing; no dynamic supply/demand formulas or NPC economies.
 */
export const ECONOMY_CONFIG = {
  // Authoritative starting gold balance for new players
  STARTING_GOLD: 100,

  // Approved static prices
  PRICES: {
    // Parsnip
    seed_parsnip: { buy: 20 },
    crop_parsnip: { sell: 35 },

    // Potato
    seed_potato: { buy: 50 },
    crop_potato: { sell: 80 },

    // Cauliflower
    seed_cauliflower: { buy: 80 },
    crop_cauliflower: { sell: 175 },

    // Carrot
    seed_carrot: { buy: 25 },
    crop_carrot: { sell: 45 },

    // Tomato
    seed_tomato: { buy: 50 },
    crop_tomato: { sell: 60 },

    // Animal Products
    product_egg: { sell: 40 },
    product_milk: { sell: 85 }
  } as Record<string, { buy?: number; sell?: number }>
} as const;

/**
 * Retrieves the purchase price for a seed item.
 * Returns undefined if the item is not a purchasable seed.
 */
export function getSeedBuyPrice(seedItemId: string): number | undefined {
  return ECONOMY_CONFIG.PRICES[seedItemId]?.buy;
}

/**
 * Retrieves the sale price for a harvested crop item.
 * Returns undefined if the item is not an eligible produce item.
 */
export function getCropSellPrice(cropItemId: string): number | undefined {
  return ECONOMY_CONFIG.PRICES[cropItemId]?.sell;
}

/**
 * Returns true if an item is an eligible produce crop that can be deposited into the shipping bin.
 */
export function isShippableItem(itemId: string): boolean {
  return getCropSellPrice(itemId) !== undefined;
}
