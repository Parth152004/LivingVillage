/**
 * Authoritative Animal Component.
 * 
 * Tracks species, health, happiness, feeding state, and daily produce generation
 * for farm livestock (Chickens, Dairy Cows).
 */
export interface AnimalComponent {
  species: 'chicken' | 'cow';
  name: string;
  happiness: number;     // 0 - 100
  hunger: number;        // 0 - 100 (0 = full, 100 = starving)
  pettedToday: boolean;
  fedToday: boolean;
  producedToday: boolean;
  homeX: number;
  homeY: number;
  wanderRadius: number;
  productItemId: string; // 'product_egg' or 'product_milk'
}

export function createAnimalComponent(
  species: 'chicken' | 'cow',
  name: string,
  homeX: number,
  homeY: number,
  wanderRadius: number = 3.0
): AnimalComponent {
  return {
    species,
    name,
    happiness: 80,
    hunger: 20,
    pettedToday: false,
    fedToday: true,
    producedToday: false,
    homeX,
    homeY,
    wanderRadius,
    productItemId: species === 'chicken' ? 'product_egg' : 'product_milk'
  };
}
