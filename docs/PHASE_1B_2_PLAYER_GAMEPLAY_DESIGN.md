# Phase 1B-2 — Player Gameplay Loop Design

**Project:** LivingVillage  
**Phase:** 1B-2  
**Status:** DESIGN SPECIFICATION — REVISED DRAFT  
**Version:** 1.2.0

---

## 1. Purpose

Phase 1B-2 transforms the existing Phase 1A foundation engine and Phase 1B-1 farming engine into a complete, playable, day-to-day player loop.

The player should be able to:

1. Spawn in the village adjacent to a homestead bed.
2. Walk freely around the terrain.
3. Select tools (Hoe, Watering Can) and seeds from the inventory via a visible hotbar.
4. Interact with the farmland using the authoritative Phase 1B-1 agricultural engine.
5. Manage a finite daily stamina/energy pool that bounds farming labor.
6. Return to bed when energy is depleted or work is complete.
7. Initiate sleep via an authoritative command.
8. Experience a short presentation fade (2–3 seconds) while the simulation deterministically fast-forwards time.
9. Wake at 06:00 AM the next in-game day with energy restored to 100.
10. Observe accurate overnight biological crop growth, soil evaporation, and furrow degradation.
11. Save and reload the world at any point with bit-for-bit deterministic continuity.

The goal is **not** to build NPCs, economy, weather, or family systems. The goal is to establish the core player feedback loop upon which all future life-simulation systems rely.

---

## 2. Architectural Precedents & Foundations

Phase 1B-2 strictly preserves all Phase 1A and Phase 1B-1 foundations:

- **Authoritative 20Hz Tick Simulation:** `SimClock` remains the single source of time.
- **Sparse-Set ECS:** Player and Bed exist as ECS entities with decoupled components.
- **ChunkGrid Architecture:** 32×32 chunks store terrain, flags, moisture, fertility, and crop state.
- **Authoritative Command Queue:** Client sends input via `PlayerCommand`; simulation authoritatively executes commands.
- **Render Snapshot Decoupling:** Presentation layer reads only read-only `WorldRenderSnapshot`.
- **Cryptographic Persistence:** Save state serializes to JSON with SHA-256 verification (Schema Version 1).
- **Deterministic RNG:** All random resolutions derive strictly from `DeterministicRng`.

---

## 3. Core Gameplay Loop

```text
               ┌────────────────────────┐
               │  Day Start (06:00 AM)  │
               │      Energy = 100      │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │    Explore & Move      │
               │   (Energy cost = 0)    │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │  Farm Work with Tools  │
               │ Till: 5, Sow: 2,       │
               │ Water: 1, Harvest: 2   │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │   Energy Decreases     │
               │ If 0: Move/sleep only  │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │   Return to Bed Tile   │
               │  Within 1.5 tile reach │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │     SLEEP Command      │
               │ 2–3s presentation fade │
               │ Fast-forward to 06:00  │
               └───────────┬────────────┘
                           │
                           ▼
               ┌────────────────────────┐
               │ Daily Dawn Evaluation  │
               │ Crops grow, soil dries │
               │     Energy -> 100      │
               └───────────┬────────────┘
                           │
                           └────────► (Repeat for Next Day)
```

---

## 4. Phase 1B-2 Scope

### 4.1 Included in Phase 1B-2
- **Authoritative Energy System:** `EnergyComponent` on player entity; validated energy costs per farming action; sleep restoration.
- **Authoritative Bed & Sleep Command:** `BedComponent` on bed entity; `PlayerCommandType.SLEEP`; proximity validation ($\le 1.5$ tiles).
- **Deterministic Fast-Forward Engine:** `advanceSimulationTo(targetTick)` with exact chronological interleaving of hourly evaporation and dawn evaluations.
- **Extended Render Snapshot:** Exposing player energy and inventory hotbar data to `WorldRenderSnapshot` without exposing ECS internals.
- **Client Presentation UI:** Hotbar, inventory inspection, energy bar, in-game clock, interaction prompt, and 2–3s visual sleep fade overlay.
- **Persistence Extension:** Serializing `EnergyComponent` and `BedComponent` seamlessly within existing Schema Version 1.

### 4.2 Explicitly Out of Scope
Phase 1B-2 MUST NOT implement:
- **No NPCs or NPC AI:** No villagers, dialogue, or schedules.
- **No Economy or Currency:** No shops, coins, buying seeds, or selling crops.
- **No Calendar or Season Subsystems:** No 28-day season advancement or calendar progression.
- **No Dynamic Weather System:** Precipitation remains driven by `SimpleEnvironmentProvider`.
- **No Water Can Refilling Mechanic:** Watering can starts with 40 charges (sufficient for 40 waterings); `REFILL` command is postponed to a future phase.
- **No Survival System Penalties:** No hunger, thirst, health, fainting, or passing out penalties.
- **No Building or Construction System:** No house walls, roofs, or furniture placement.
- **No Generic Interaction Abstraction Framework:** No generic interaction buses or script components.
- **No Final Art or Audio Assets:** Uses clean procedural/PixiJS geometric rendering.

---

## 5. Authoritative Player State & Components

Player state is stored strictly inside the authoritative ECS world:

```typescript
// src/ecs/components/EnergyComponent.ts
export interface EnergyComponent {
  current: number; // 0 to max
  max: number;     // baseline 100
}
```

The player entity is initialized at spawn with:
1. `PositionComponent` (`{ x: 10.5, y: 10.5 }`)
2. `VelocityComponent` (`{ vx: 0, vy: 0 }`)
3. `InventoryComponent` (10 slots with Hoe, Watering Can [40 charges], 15 Parsnip Seeds)
4. `EnergyComponent` (`{ current: 100, max: 100 }`)

---

## 6. Energy System Specification

### 6.1 Tunable Energy Configuration
All energy parameters must be centralized in a dedicated configuration file:

```typescript
// src/player/PlayerConfig.ts
export const PLAYER_CONFIG = {
  MAX_ENERGY: 100,
  STARTING_ENERGY: 100,

  // Action energy costs
  ENERGY_COST_TILL: 5,
  ENERGY_COST_SOW: 2,
  ENERGY_COST_WATER: 1,
  ENERGY_COST_HARVEST_MATURE: 2,
  ENERGY_COST_CLEAR_WILTED: 1,
  ENERGY_COST_MOVE: 0,

  // Interaction constraints
  BED_INTERACTION_REACH: 1.5,
  WAKE_UP_HOUR: 6,
  MIN_SLEEP_BUFFER_HOURS: 1
} as const;
```

### 6.2 Strict Validation & Consumption Pipeline
To prevent energy leaks or accidental consumption on failure, all energy-consuming commands (`TILL`, `SOW`, `WATER`, `HARVEST`) must follow this strict sequence:

```text
1. Validate Actor & Distance:
   - Check entity exists and has Position & Energy components.
   - Verify Euclidean distance to target tile <= FARMING_CONFIG.INTERACTION_REACH_TILES (1.5).

2. Validate Action Preconditions:
   - TILL: Hoe in inventory; tile is valid untilled dirt or grass (not stone, water, or already tilled).
   - SOW: Seed in inventory; tile is tilled and unoccupied.
   - WATER: Watering can in inventory with charges > 0; tile is tilled.
   - HARVEST: Crop present; if Stage 3 (Mature), player inventory has space (canAcceptItem).

3. Check Energy Sufficiency:
   - If energy.current < actionCost: REJECT command immediately.
   - Return false; emit no state change; consume ZERO energy.

4. Mutate World & Inventory State:
   - Mutate tile (till furrow, sow seed, add moisture, clear crop).
   - Mutate inventory (deduct seed, deduct watering charge, add harvested produce).

5. Deduct Energy Cost:
   - energy.current = Math.max(0, energy.current - actionCost).

6. Emit Simulation Event:
   - Emit authoritative event (e.g. 'PLAYER_TILLED', 'PLAYER_HARVESTED') with new energy balance.
   - Return true.
```

### 6.3 Invariant Guarantees
- **Failed actions consume zero energy:** Out-of-reach, wrong tool, invalid tile, or insufficient inventory space never deducts energy.
- **Harvesting wilted crops:** Clearing a dead Stage 4 crop yields no produce, requires no inventory space, and costs **1 energy** (`ENERGY_COST_CLEAR_WILTED`), differentiating it from a 2-energy mature harvest.
- **Zero energy exhaustion behavior:** When `energy.current === 0`, the player can still move, open inventory, return home, and sleep. No health loss, fainting, or automatic sleep occurs.

---

## 7. Bed Entity & Sleep Command Specification

### 7.1 Authoritative Bed Representation
The homestead bed is an authoritative ECS entity spawned into the world simulation:

```typescript
// src/ecs/components/BedComponent.ts
export interface BedComponent {
  isOccupied: boolean;
}
```

The Bed entity has:
- `PositionComponent`: World coordinates (e.g. `{ x: 12.5, y: 12.5 }`).
- `BedComponent`: Authoritative tag identifying it as a valid sleep target.

No generic interaction framework is created. Sleep uses a concrete `PlayerCommand`.

### 7.2 The SLEEP Command
Add `SLEEP` to `CommandType`:

```typescript
export type CommandType = 'TEST_COMMAND' | 'MOVE' | 'TILL' | 'SOW' | 'WATER' | 'HARVEST' | 'SLEEP';
```

#### Sleep Execution Rules:
1. **Validate Bed Target:** Find active entity with `BedComponent`.
2. **Validate Proximity:** Euclidean distance from player to bed entity must be $\le 1.5$ tiles.
3. **Calculate Target Tick:** Compute next valid 06:00 AM dawn tick $T_{\text{target}}$.
4. **Advance Simulation:** Execute `sim.advanceSimulationTo(targetTick)`.
5. **Restore Energy:** Set `playerEnergy.current = playerEnergy.max` (100).
6. **Emit Event:** Emit `PLAYER_SLEPT` with `{ actorEntityId, startTick, targetTick, restoredEnergy: 100 }`.

---

## 8. Sleep Timing & Mathematical Target Calculation

### 8.1 Universal Next-Dawn Formula
Given:
- $T_{\text{day}} = \text{TIME\_CONFIG.TICKS\_PER\_IN\_GAME\_DAY} = 28,800$
- $T_{\text{dawn}} = \text{TIME\_CONFIG.DAWN\_HOUR} \times \text{TIME\_CONFIG.TICKS\_PER\_IN\_GAME\_HOUR} = 7,200$
- $T_{\text{buffer}} = \text{PLAYER\_CONFIG.MIN\_SLEEP\_BUFFER\_HOURS} \times \text{TIME\_CONFIG.TICKS\_PER\_IN\_GAME\_HOUR} = 1,200$ (1 hour)
- $T_{\text{current}} = \text{sim.clock.currentTick}$

The target wake-up tick $T_{\text{target}}$ is calculated deterministically:

```typescript
export function calculateNextDawnTick(currentTick: number): number {
  const currentDayIndex = Math.floor(currentTick / TIME_CONFIG.TICKS_PER_IN_GAME_DAY);
  let targetDawnTick = currentDayIndex * TIME_CONFIG.TICKS_PER_IN_GAME_DAY + TIME_CONFIG.DAWN_TICKS;

  // If already at or past today's dawn, OR if less than 1 hour remains until today's dawn,
  // sleep carries through to tomorrow's 06:00 AM dawn.
  if (currentTick >= targetDawnTick || (targetDawnTick - currentTick) < PLAYER_CONFIG.MIN_SLEEP_BUFFER_TICKS) {
    targetDawnTick += TIME_CONFIG.TICKS_PER_IN_GAME_DAY;
  }

  return targetDawnTick;
}
```

### 8.2 Documented Edge Cases
1. **Normal Evening Sleep (22:00 Day 1 $\to$ 06:00 Day 2):**
   - Current tick: $26,400$. Target dawn: $36,000$ (+9,600 ticks / 8 hours).
2. **Late Night Post-Midnight Sleep (02:00 AM Day 2 $\to$ 06:00 AM Day 2):**
   - Current tick: $31,200$. Today's dawn is $36,000$.
   - Difference: $4,800 \ge 1,200$ buffer ticks. Target dawn: $36,000$ (+4,800 ticks / 4 hours).
3. **Immediate Wake-Up Sleep (06:00 AM Day 1 $\to$ 06:00 AM Day 2):**
   - Current tick: $7,200$. Current tick $\ge$ today's dawn ($7,200$).
   - Advances to tomorrow's dawn: $36,000$ (+28,800 ticks / 24 hours).
4. **Pre-Dawn Exploitation (05:55 AM Day 1 $\to$ 06:00 AM Day 2):**
   - Current tick: $7,100$. Difference to today's dawn is 100 ticks ($< 1,200$ buffer).
   - Enforces the 1-hour minimum sleep gameplay rule: advances to tomorrow's dawn ($36,000$). Prevents 5-second sleep energy-reset exploits.

---

## 9. Fast-Forward Architecture (`advanceSimulationTo`)

### 9.1 Core Principles
- **`SimClock` is the Single Source of Time:** Virtual time is advanced strictly via `clock.stepMany(elapsed, true)`. No separate calendar or day variables exist.
- **Cadence-Derived Progression:** Hourly and dawn events are derived chronologically from `SimClock` tick arithmetic rather than independent temporal counters.
- **Chronological Interleaving:** Subsystems must execute in exact chronological order. Multi-hour evaporation must never precede an earlier dawn evaluation.
- **Simultaneous Tick Precedence:** At 06:00 AM dawn, hourly evaporation for Hour 6 executes **first**, followed immediately by daily biological crop evaluation.

### 9.2 Concrete Fast-Forward Algorithm
The authoritative fast-forward loop in `WorldSimulation`:

```typescript
public advanceSimulationTo(targetTick: number): void {
  if (targetTick <= this.clock.currentTick) {
    return;
  }

  while (this.clock.currentTick < targetTick) {
    // 1. Identify next scheduled hourly tick and dawn tick
    const nextHourly = this.farming.nextHourlyTick;
    const nextDawn = this.farming.nextDawnTick;

    // 2. The next event is the earliest scheduled update, bounded by targetTick
    const nextEventTick = Math.min(nextHourly, nextDawn, targetTick);

    // 3. Advance SimClock directly to the event tick
    const elapsed = nextEventTick - this.clock.currentTick;
    this.clock.stepMany(elapsed, true);

    // 4. Execute scheduled updates for newly reached tick
    // FarmingSystem.update() processes hourly first, then dawn if tick matches
    this.farming.update(this.clock.currentTick, this.chunks, this.environment, this.events);

    // 5. Clear per-tick event buffer
    this.events.endTick();
  }
}
```

### 9.3 Equivalence Invariant
The simulation must guarantee:
$$\text{State}(\text{advanceSimulationTo}(T)) \equiv \text{State}(\text{stepMany}(T - T_0))$$
Soil moisture, drought counters, crop growth stages, mature timers, furrow degradation, and event histories must be bit-for-bit identical between normal 20Hz stepping and fast-forward progression.

---

## 10. Extended Render Snapshot Contract

The presentation layer needs player status to render UI elements (energy bar, hotbar items, charges) without violating ECS encapsulation.

Extend `WorldRenderSnapshot` in [`src/presentation/RenderSnapshot.ts`](file:///g:/LivingVillage/src/presentation/RenderSnapshot.ts):

```typescript
export interface PlayerRenderData {
  entityId: number;
  energy: {
    current: number;
    max: number;
  };
  inventory: readonly (InventorySlot | null)[];
}

export interface WorldRenderSnapshot {
  tick: number;
  subTickAlpha: number;
  isPaused: boolean;
  playerEntityId: number;
  player?: PlayerRenderData; // Authoritative player display state
  entities: EntityRenderData[];
  chunks: ChunkRenderData[];
  recentEvents: readonly SimEvent[];
}
```

- UI components (HTML/DOM or PixiJS) bind exclusively to `snapshot.player.energy` and `snapshot.player.inventory`.
- The client NEVER has direct object references to ECS components or simulation instances.

---

## 11. Presentation Layer & Sleep Transition

1. **Client Input:** Player presses action key near bed $\to$ client enqueues `SLEEP`.
2. **Authoritative Execution:** Simulation synchronously executes `SLEEP` and advances time to 06:00 AM.
3. **Presentation Sleep Fade:**
   - Client receives snapshot with `PLAYER_SLEPT` event.
   - Client disables player movement/action input.
   - Client renders a smooth 2–3 second fade-to-black and fade-in transition.
   - Clock UI updates to Day $D+1$, 06:00 AM; Energy bar displays 100/100.
   - Input re-enables when the visual fade concludes.
4. **Framerate Independence:** Presentation frame rate (60Hz, 144Hz, or frame drops) has zero influence over simulation progression.

---

## 12. Persistence & Save/Load Specification

- **Schema Compatibility:** Adding `EnergyComponent` and `BedComponent` introduces no breaking schema changes. `ECSWorld.getSnapshot()` dynamically serializes all active component pools. Schema version remains `1`.
- **Field Serialization:**
  - `EnergyComponent`: Serialized under `pools` in `ECSWorldSnapshot`.
  - `BedComponent`: Serialized under `pools` in `ECSWorldSnapshot`.
- **Persistence Verification Invariant:**
  Saving before sleep, loading, and sleeping produces state bit-for-bit identical to continuous execution without save/load.

---

## 13. Comprehensive Test Catalog

Phase 1B-2 must implement the following tests:

### 13.1 Energy System Invariants
- `Energy: Player spawns with configured starting energy (100/100)`.
- `Energy: Successful TILL consumes 5 energy`.
- `Energy: Successful SOW consumes 2 energy`.
- `Energy: Successful WATER consumes 1 energy`.
- `Energy: Successful HARVEST of mature crop consumes 2 energy`.
- `Energy: Clearing Stage 4 wilted crop consumes 1 energy`.
- `Energy: Insufficient energy strictly rejects actions with zero state mutation (TILL requires 5, has 4)`.
- `Energy: Failed action due to out-of-reach consumes zero energy`.
- `Energy: Failed harvest due to full inventory consumes zero energy`.
- `Energy: Failed water due to empty watering can consumes zero energy`.
- `Energy: Failed till due to invalid stone/water tile consumes zero energy`.
- `Energy: Zero energy permits MOVE and SLEEP without soft-locking`.

### 13.2 Bed & Sleep Validation
- `Sleep: Valid sleep near bed entity restores energy to 100`.
- `Sleep: Sleep rejected if player is > 1.5 tiles away from bed`.
- `Sleep: Sleep rejected if bed entity does not exist`.
- `Sleep: Sleep advances SimClock to exact 06:00 AM dawn`.

### 13.3 Sleep Timing & Edge Cases
- `SleepTiming: Evening sleep (22:00 Day 1) advances to Day 2 06:00 AM (+9,600 ticks)`.
- `SleepTiming: Post-midnight sleep (02:00 AM Day 2) advances to Day 2 06:00 AM (+4,800 ticks)`.
- `SleepTiming: Morning wake-up sleep (06:00 AM Day 1) advances to Day 2 06:00 AM (+28,800 ticks)`.
- `SleepTiming: Pre-dawn sleep buffer (05:55 AM Day 1) advances to Day 2 06:00 AM (+28,900 ticks)`.

### 13.4 Fast-Forward Equivalence (The Gold Standard)
- `FastForwardEquivalence: 10-hour sleep matches continuous 20Hz simulation bit-for-bit`:
  - Run A: Step continuous 20Hz ticks ($10 \times 1,200$).
  - Run B: Execute `advanceSimulationTo()`.
  - Assert bit-identical serialized snapshots (moisture, crop stage, dry days, fertility, events).
- `FastForwardEquivalence: Full 24-hour sleep matches continuous 20Hz simulation bit-for-bit`.

### 13.5 Persistence & Save/Load
- `Persistence: Player energy survives save and load roundtrip with 100% fidelity`.
- `Persistence: Bed entity survives save and load roundtrip`.
- `Persistence: Save at low energy -> Load -> Sleep restores energy to 100 deterministically`.
- `Persistence: Deterministic continuation after sleep matches continuous run bit-for-bit`.

---

## 14. Acceptance Scenario

Phase 1B-2 is complete only when the following scenario executes end-to-end:

```text
1. Player spawns at homestead (10.5, 10.5) near Bed (12.5, 12.5) on Day 1 at 06:00 AM.
   Energy = 100/100.
2. Player equips Hoe from hotbar, walks to (11, 10), and tills soil.
   Tile becomes tilled furrow. Energy = 95/100.
3. Player equips Parsnip Seeds and sows furrow.
   Seed planted (Stage 0). Energy = 93/100.
4. Player equips Watering Can (40 charges) and waters furrow.
   Tile moisture = 100; charges = 39. Energy = 92/100.
5. Player performs repeated tilling until energy reaches 0/100.
   Subsequent till commands are rejected with 0 energy cost.
6. Player walks back to bed at (12.5, 12.5). Movement succeeds at 0 energy.
7. Player initiates SLEEP command.
8. Presentation displays 2–3s visual fade. Simulation fast-forwards to Day 2 06:00 AM.
9. Player wakes:
   - Clock displays Day 2, 06:00 AM.
   - Energy restored to 100/100.
   - Parsnip crop advanced to Sprout (Stage 1).
   - Soil moisture reduced by overnight evaporation.
10. Save game to disk. Reload game. State matches bit-for-bit.
```

---

## 15. Definition of Done & Stop Condition

### Definition of Done:
- [ ] Authoritative `EnergyComponent` implemented in ECS.
- [ ] Centralized `PLAYER_CONFIG` created.
- [ ] Farming commands validate energy and deduct only on success.
- [ ] Stage 4 wilted crop clearing costs 1 energy.
- [ ] Authoritative Bed entity spawned and `SLEEP` command implemented.
- [ ] Next-dawn calculation implemented with 1-hour minimum buffer.
- [ ] `advanceSimulationTo` implemented with chronological cadence interleaving.
- [ ] `WorldRenderSnapshot` extended with read-only player energy and inventory data.
- [ ] Presentation hotbar, energy bar, and 2–3s visual sleep fade implemented.
- [ ] Fast-forward equivalence tests pass bit-identical across 10-hour and 24-hour cycles.
- [ ] All 68 existing tests pass + new test catalog passes with 0 failures.
- [ ] Build and determinism test pass.

### Explicit Stop Condition:
**AGY MUST STOP after Phase 1B-2 is complete.**  
Do NOT proceed to NPCs, economy, weather, calendar, relationships, or town generation. Further phases require explicit user approval.

---

## 16. Change Summary (Version 1.1.0 $\to$ Version 1.2.0)

| Area | Version 1.1.0 (Draft) | Version 1.2.0 (Approved Revision) |
| :--- | :--- | :--- |
| **Render Snapshot** | No player energy or inventory in snapshot | `WorldRenderSnapshot` extended with `PlayerRenderData` (read-only energy & inventory) |
| **Interaction Framework** | Abstract "generic interaction system" | Removed; explicit `SLEEP` command + ECS `BedComponent` |
| **Fast-Forward Engine** | Abstract `advanceSimulationTo` description | Concrete algorithm with chronological hourly evaporation and dawn interleaving |
| **Sleep Timing** | Ambiguous "next 06:00" | Exact formula with documented edge cases and 1-hour minimum sleep buffer |
| **Wilted Crops** | Undefined energy cost | Explicitly defined: clearing wilted crop costs 1 energy (vs 2 for mature harvest) |
| **Water Refill** | Ambiguous mention of simple refill | Explicitly confirmed **out of scope** (can starts with 40 charges) |
| **Equivalence Testing** | Generic test descriptions | Explicit bit-identical invariant testing for 10-hour and 24-hour fast-forwards |
| **Persistence** | General statement | Explicit Schema Version 1 pool compatibility verified |
