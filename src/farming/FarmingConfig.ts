/**
 * Authoritative Time & Calendar Configuration.
 * 
 * Drives all virtual time conversions and simulation cadences.
 */
export const TIME_CONFIG = {
  // Engine tick frequency
  TICKS_PER_SECOND: 20,

  // [TUNABLE] Real seconds per virtual in-game minute
  SECONDS_PER_IN_GAME_MINUTE: 1.0,

  // [TUNABLE] In-game minutes per in-game hour
  MINUTES_PER_IN_GAME_HOUR: 60,

  // [TUNABLE] In-game hours per in-game day
  HOURS_PER_IN_GAME_DAY: 24,

  // [TUNABLE] Dawn evaluation hour when daily crop growth occurs (06:00 AM)
  DAWN_HOUR: 6,

  // Derived constants
  get TICKS_PER_IN_GAME_HOUR(): number {
    return this.TICKS_PER_SECOND * this.SECONDS_PER_IN_GAME_MINUTE * this.MINUTES_PER_IN_GAME_HOUR; // 1,200
  },
  get TICKS_PER_IN_GAME_DAY(): number {
    return this.TICKS_PER_IN_GAME_HOUR * this.HOURS_PER_IN_GAME_DAY; // 28,800
  }
} as const;

/**
 * Authoritative Farming Balance & Configuration.
 * 
 * Centralizes all approved gameplay parameters.
 */
export const FARMING_CONFIG = {
  // [TUNABLE] Maximum Euclidean reach in tiles (1.5 permits cardinal + diagonal)
  INTERACTION_REACH_TILES: 1.5,

  // [TUNABLE] Moisture added per full watering can application
  WATERING_CAN_MOISTURE_AMOUNT: 100,

  // [TUNABLE] Total watering can capacity in charges
  WATERING_CAN_MAX_CHARGES: 40,

  // [TUNABLE] Moisture added per in-game hour of rain
  RAIN_MOISTURE_PER_HOUR: 25,

  // [TUNABLE] Continuous hourly evaporation on unshaded soil
  HOURLY_EVAPORATION_RATE: 2,

  // [TUNABLE] Moisture consumed by growing crop at daily dawn
  CROP_DAILY_MOISTURE_CONSUMPTION: 20,

  // [TUNABLE] Minimum moisture required for a day to count as watered
  MIN_GROWTH_MOISTURE: 20,

  // [TUNABLE] Consecutive drought days before active crops wilt
  MAX_DROUGHT_DAYS: 3,

  // [TUNABLE] Consecutive days a mature crop holds in Stage 3 before wilting
  MAX_UNHARVESTED_DAYS: 5,

  // [TUNABLE] Consecutive dry days before empty tilled furrows revert to dirt
  FALLOW_DEGRADE_DAYS: 2,

  // [TUNABLE] Natural baseline soil fertility
  BASELINE_FERTILITY: 50,

  // [TUNABLE] Natural fertility restored per fallow season
  FALLOW_FERTILITY_RECOVERY: 15,

  // [TUNABLE] Reference Parsnip values
  PARSNIP_FERTILITY_CONSUMPTION: 15,
  PARSNIP_BASE_YIELD_MIN: 1,
  PARSNIP_BASE_YIELD_MAX: 2,
} as const;
