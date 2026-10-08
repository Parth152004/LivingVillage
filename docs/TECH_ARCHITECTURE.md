# Technical Architecture: Living Village ⚙️💻

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative Architecture Standard  
> **Owners:** [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md), [Performance Engineer](file:///g:/LivingVillage/agents/performance_engineer.md)

---

## 1. Architectural Philosophy

`Living Village` employs a **hybrid data-oriented architecture** that enforces a strict boundary between:
1. **Static / Dense World Grid**: Managed by dedicated **Chunk Grid Buffers** (terrain, elevation, water, soil cells, crops).
2. **Dynamic World Entities**: Managed by a lightweight, deterministic **Sparse-Set Entity Component System (ECS)** (player, NPCs, livestock, wildlife, structures, containers, dropped items).

```
┌─────────────────────────────────────────────────────────────┐
│                    Presentation Layer                       │
│    (Renderer, Camera, HUD/UI, Input Capture, Audio Cues)    │
└──────────────────────────────▲──────────────────────────────┘
                               │ Reads read-only snapshot & subTickAlpha
┌──────────────────────────────▼──────────────────────────────┐
│           Authoritative Deterministic Sim Core              │
│    (20Hz Fixed Tick, Seeded PRNG, Player Command Queue)     │
├──────────────────────────────┬──────────────────────────────┤
│      Chunk Grid System       │    Dynamic Entity ECS        │
│   (32x32 Tiles per Chunk)    │  (Player, NPCs, Drops, etc.) │
│  - Terrain & Elevation       │  - Position & Movement       │
│  - Soil Moisture (0-100)     │  - Needs & Utility AI        │
│  - Soil Fertility (0-100)    │  - Behavior Tree Execution   │
│  - Crop State & Hydration    │  - Inventories & Wallets     │
│  - Static Obstacle Mask      │  - Dynamic Collision Shapes  │
├──────────────────────────────┴──────────────────────────────┤
│                  Spatial & Storage Systems                  │
│  - Uniform Spatial Hash (Dynamic entities: 4m buckets)      │
│  - Grid Pathfinding (Walkability & dynamic obstacle grid)   │
│  - Authoritative Chunk Snapshot Serializer                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Technology Stack & Runtime Configuration

- **Core Simulation Engine:** TypeScript (ES2024) running in a single-threaded deterministic event loop (Node.js 20+ for tests, standard modern browser V8/SpiderMonkey for runtime).
- **Presentation Engine:** 2D WebGL/Canvas renderer completely decoupled from simulation state.
- **Determinism Definition:** *"Deterministic within the supported runtime configuration"* means identical initial seed and ordered input commands produce bit-exact simulation states when executed within standard IEEE-754 double-precision floating point runtimes (Node.js 20+ / Chromium V8).
- **Concurrency Policy:** Single-threaded execution for Phase 1. No WebWorkers or background threads in the initial implementation to eliminate thread race conditions and synchronization locks.

---

## 3. World Memory Model: Chunk Grid vs Dynamic ECS

### 3.1 Dedicated Chunk Grid (Non-ECS)
Terrain, soil, and plants are **not** ECS entities. They are stored in contiguous 2D chunk buffers ($32 \times 32$ tiles per chunk):

```typescript
export interface TileData {
  terrainType: number;     // 0=Grass, 1=Dirt, 2=TilledSoil, 3=Stone, 4=Water
  elevation: number;       // 0-255 height level (used for cliffs & ramps)
  flags: number;           // Bitmask: WALKABLE, WATER, OCCUPIED_BY_STRUCTURE
  moisture: number;        // 0 (Bone dry) to 100 (Saturated)
  fertility: number;       // 0 (Depleted) to 100 (Rich composted loam)
  cropTypeId: number;      // 0 = None, 1..N = Registered Crop Type
  cropStage: number;       // 0=Seed, 1=Sprout, 2=Growing, 3=Mature, 4=Wilted
  cropProgress: number;    // 0-255 progress toward next stage
  hydrationTicks: number;  // Consecutive ticks without moisture
}

export class WorldChunk {
  public readonly chunkX: number;
  public readonly chunkY: number;
  public readonly tiles: TileData[]; // Exactly 1,024 entries (32 x 32)
  public isDirty: boolean = false;   // Set when soil or crops change
}
```

### 3.2 Dynamic Entity ECS (Sparse-Set)
Only dynamic actors and interactive objects exist as ECS entities (`EntityId = u32`):

```typescript
// Core Entity Archetypes
type EntityType = 'PLAYER' | 'NPC' | 'ANIMAL' | 'BUILDING' | 'CONTAINER' | 'ITEM_DROP';

interface PositionComponent {
  x: number;          // World coordinates in tiles (float32)
  y: number;
}

interface VelocityComponent {
  vx: number;
  vy: number;
  maxSpeed: number;
}

interface NeedsComponent {
  hunger: number;     // 0 (Starving) to 100 (Full)
  energy: number;     // 0 (Exhausted) to 100 (Rested)
  social: number;     // 0 (Isolated) to 100 (Fulfilled)
}

interface PersonalityComponent {
  traits: string[];   // 2-4 discrete traits (e.g. ['hardworking', 'cautious'])
}

interface WalletComponent {
  gold: number;       // Integer coin balance (>= 0)
}
```

---

## 4. Practical Inventory Architecture

Inventories are structured data components attached to players, NPCs, chests, and market stalls:

```typescript
export interface ItemStack {
  itemId: number;        // Registry lookup ID
  quantity: number;      // Current stack count
  maxStack: number;      // Stack limit (e.g. 99 for seeds, 1 for tools)
  durability?: number;   // Optional remaining durability (tools)
  quality: number;       // 0=Standard, 1=Fine, 2=Masterwork
}

export interface InventoryComponent {
  slots: (ItemStack | null)[];
  capacity: number;      // Max slots (e.g. Player=24, Chest=36, NPC=8)
}
```
* **Stackable Items:** Seeds, harvested produce, fertilizers, timber, stone, coins.
* **Non-Stackable Items:** Tools (hoe, watering can, scythe), crafted garments.
* **Ownership & Access:** Chests and shop stalls check actor permissions before fulfilling transaction commands.

---

## 5. Player Command Contract (Authoritative Pipeline)

The presentation layer **never** mutates simulation state directly. All player actions are dispatched as discrete commands:

```
[User Input Event] ──> [Player Command] ──> [Validation] ──> [Sim Execution] ──> [State Snapshot]
```

### Initial Player Command Set
```typescript
export type PlayerCommandType = 
  | 'MOVE'        // Direction vector (dx, dy)
  | 'INTERACT'    // Activate adjacent object/door/chest
  | 'TILL'        // Convert dirt/grass to tilled soil at (tx, ty)
  | 'SOW'         // Plant seed from inventory slot into tilled soil
  | 'WATER'       // Apply watering can to soil at (tx, ty)
  | 'HARVEST'     // Collect mature crop at (tx, ty)
  | 'PICKUP'      // Collect dropped item in proximity
  | 'DROP'        // Drop item stack from inventory onto adjacent tile
  | 'TALK'        // Initiate dialogue with NPC entity
  | 'USE'         // Consume food or medicine from inventory
  | 'SLEEP'       // Rest in bed (advances energy, triggers night cycle)
  | 'WORK';       // Initiate workstation crafting (e.g. mill, oven)

export interface PlayerCommand {
  tick: number;
  type: PlayerCommandType;
  targetTileX?: number;
  targetTileY?: number;
  targetEntityId?: number;
  slotIndex?: number;
}
```

---

## 6. Presentation Contract & Rendering Synchronization

For Phase 1, the simulation and presentation execute on the main thread via a **Deterministic Tick Accumulator**:

```typescript
let accumulator = 0.0;
const TICK_INTERVAL = 0.05; // 50ms = 20Hz

function gameLoop(deltaTime: number) {
  accumulator += deltaTime;
  
  // 1. Drain accumulated time with fixed simulation ticks
  while (accumulator >= TICK_INTERVAL) {
    simulation.tick();
    accumulator -= TICK_INTERVAL;
  }
  
  // 2. Render interpolated state
  const subTickAlpha = accumulator / TICK_INTERVAL; // 0.0 to 1.0
  renderer.render(simulation.getRenderSnapshot(), subTickAlpha);
}
```

* **Read-Only Snapshot:** The simulation exports a lightweight read-only snapshot containing entity interpolated positions, sprite frames, and dirty chunk tile updates. The renderer never retains long-term references to internal simulation state.

---

## 7. Deterministic Tick Pipeline Order

Every 50ms tick executes systems in strict, unvarying sequential order:

```
1. Ingest Player Commands     (Validate & queue player actions)
2. Time & Weather Update      (Advance day clock, evaluate weather state)
3. Soil & Crop Tick           (Moisture evaporation, crop growth progression)
4. NPC Need Decay & Utility   (Decay hunger/energy, evaluate utility curves)
5. NPC Behavior Tree Tick     (Execute active behavior tree task nodes)
6. Movement & Grid Collision  (Apply velocities, update spatial hash)
7. Action & Tool Execution    (Resolve till, water, plant, harvest, trade)
8. Economy & Ledger Update    (Process market stall transactions, tax sinks)
9. Snapshot Generation        (Build read-only presentation state)
```

---

## 8. Seeded PRNG Foundation

Deterministic random generation is driven by **PCG32** or **Xoshiro256\*\*** using integer arithmetic:

```typescript
export class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  public nextUint32(): number {
    this.state = (Math.imul(1664525, this.state) + 1013904223) >>> 0;
    return this.state;
  }

  public nextFloat(): number {
    return this.nextUint32() / 4294967296.0;
  }

  public nextRange(min: number, max: number): number {
    return min + Math.floor(this.nextFloat() * (max - min + 1));
  }
}
```
*Zero usage of `Math.random()` or wall-clock timestamps (`Date.now()`) inside simulation systems.*
