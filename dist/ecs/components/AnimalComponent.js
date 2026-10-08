export function createAnimalComponent(species, name, homeX, homeY, wanderRadius = 3.0) {
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
