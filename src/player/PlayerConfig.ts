/**
 * Authoritative Player Gameplay Configuration.
 * 
 * Centralizes all player parameters: stamina/energy limits and action costs.
 */
export const PLAYER_CONFIG = {
  // Energy baseline
  MAX_ENERGY: 100,
  STARTING_ENERGY: 100,

  // Action energy costs (exact names per design & aliases)
  TILL: 5,
  SOW: 2,
  WATER: 1,
  REFILL_WATER: 1,
  HARVEST: 2,
  MOVE: 0,
  CLEAR_WILTED: 1,

  ENERGY_COST_TILL: 5,
  ENERGY_COST_SOW: 2,
  ENERGY_COST_WATER: 1,
  ENERGY_COST_REFILL_WATER: 1,
  ENERGY_COST_HARVEST: 2,
  ENERGY_COST_CLEAR_WILTED: 1,
  ENERGY_COST_MOVE: 0,

  // Interaction constraints
  BED_INTERACTION_REACH: 1.5,
  WAKE_UP_HOUR: 6,
  MIN_SLEEP_BUFFER_HOURS: 1,

  // Homestead layout defaults
  DEFAULT_BED_X: 12,
  DEFAULT_BED_Y: 12
} as const;

import { TIME_CONFIG } from '../farming/FarmingConfig.js';

/**
 * Calculates the next valid 06:00 AM dawn tick deterministically.
 * 
 * Rules:
 * - If currentTick is at or past today's dawn, sleep carries through to tomorrow's 06:00 AM dawn.
 * - If strictly less than 1 in-game hour remains until today's dawn (< 1,200 ticks),
 *   sleep carries through to tomorrow's 06:00 AM dawn (1-hour minimum buffer rule).
 * - If at least 1 in-game hour remains until today's dawn (>= 1,200 ticks, e.g. at exactly 05:00 AM),
 *   sleep targets today's 06:00 AM dawn.
 */
export function calculateNextDawnTick(currentTick: number): number {
  const dawnHourTicks = TIME_CONFIG.DAWN_HOUR * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR; // 7,200
  const dayTicks = TIME_CONFIG.TICKS_PER_IN_GAME_DAY; // 28,800
  const minBufferTicks = PLAYER_CONFIG.MIN_SLEEP_BUFFER_HOURS * TIME_CONFIG.TICKS_PER_IN_GAME_HOUR; // 1,200

  const currentDayIndex = Math.floor(currentTick / dayTicks);
  let targetDawnTick = currentDayIndex * dayTicks + dawnHourTicks;

  // If already at or past today's dawn, OR if strictly less than 1 hour remains until today's dawn,
  // sleep carries through to tomorrow's 06:00 AM dawn.
  if (currentTick >= targetDawnTick || (targetDawnTick - currentTick) < minBufferTicks) {
    targetDawnTick += dayTicks;
  }

  return targetDawnTick;
}
