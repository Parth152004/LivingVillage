/**
 * Authoritative Player Energy / Stamina Component.
 * 
 * Governs the daily labor budget for physical tasks (tilling, sowing, watering, harvesting).
 */
export interface EnergyComponent {
  current: number;
  max: number;
}
