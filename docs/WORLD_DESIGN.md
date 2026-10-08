# World & Climate Design: Living Village 🗺️🌦️

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative World Specification  
> **Owners:** [World Builder](file:///g:/LivingVillage/agents/world_builder.md), [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md)

---

## 1. Chunk Grid vs Dynamic Entity Boundary

The audit established an absolute architectural boundary between the static environmental grid and dynamic actors:

```
┌────────────────────────────────────────────────────────┐
│              Dedicated Chunk Grid (32x32)              │
├────────────────────────────────────────────────────────┤
│ - Terrain Type (Grass, Dirt, Tilled, Stone, Water)     │
│ - Elevation Level (0-255 height for ramps & cliffs)    │
│ - Static Walkability Mask (Walkable vs Blocked)        │
│ - Soil Moisture (0-100) & Soil Fertility (0-100)       │
│ - Crop State (Type ID, 5 Growth Stages, Progress)      │
│ - Building Footprint & Obstacle Mask                   │
└────────────────────────────────────────────────────────┘
                           ▲
                           │ Interacts via coordinates (tileX, tileY)
                           ▼
┌────────────────────────────────────────────────────────┐
│             Dynamic Entity ECS (Sparse-Set)            │
├────────────────────────────────────────────────────────┤
│ - Player & Autonomous Villager Entities                │
│ - Domestic Livestock & Wild Animals                    │
│ - Dropped Item Stacks                                  │
│ - Dynamic Interactive Objects (Chests, Doors)          │
│ - Constructed Building Entities (Workstations, Mills)  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Chunk Structure & Tile Representation

The world is partitioned into contiguous **$32 \times 32$ tile chunks** ($32\text{m} \times 32\text{m}$):

```typescript
export interface TileRecord {
  terrainType: number;  // 0=Grass, 1=Dirt, 2=TilledSoil, 3=Stone, 4=Water
  elevation: number;    // 0-255 height level
  flags: number;        // Bit 0: Walkable, Bit 1: Water, Bit 2: OccupiedByStructure
  moisture: number;     // 0-100
  fertility: number;    // 0-100
  cropTypeId: number;   // 0 = none
  cropStage: number;    // 0=Seed, 1=Sprout, 2=Growing, 3=Mature, 4=Wilted
  cropProgress: number; // 0-255
}

export class WorldChunk {
  public readonly chunkX: number;
  public readonly chunkY: number;
  public readonly tiles: TileRecord[]; // Pre-allocated array of 1,024 entries
}
```

---

## 3. Deterministic Weather State System

The heavy cellular atmospheric pressure model has been replaced with a **Deterministic Seasonal Markov Weather System**.

### 3.1 Supported Weather States
- **`CLEAR`:** High solar exposure, accelerated crop photosynthesis, normal evaporation.
- **`CLOUDY`:** Moderate temperatures, slow evaporation, no precipitation.
- **`RAIN`:** Hydrates all exposed agricultural tiles ($+50$ moisture); villagers equip cloaks.
- **`STORM`:** Torrential rain, lightning, strong winds; cautious NPCs stay indoors.
- **`HEATWAVE`:** Extreme summer heat; double soil moisture evaporation; villagers tire faster.

### 3.2 Probabilistic Seasonal Matrix (River Valley Region)

Weather transitions occur at dawn ($05:00$) based on the current season and yesterday's weather:

| Season | Clear | Cloudy | Rain | Storm | Heatwave |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Spring** | $45\%$ | $25\%$ | $25\%$ | $5\%$ | $0\%$ |
| **Summer** | $60\%$ | $15\%$ | $10\%$ | $5\%$ | $10\%$ |
| **Autumn** | $35\%$ | $35\%$ | $20\%$ | $10\%$ | $0\%$ |
| **Winter** | $30\%$ | $30\%$ | $35\%$ (Snow) | $5\%$ (Blizzard)| $0\%$ |

- Weather decisions are seeded deterministically through the world's `DeterministicRng`.
- This simple state model leaves clean interfaces to add localized regional microclimates later without re-architecting the weather engine.

---

## 4. Separation of Core Sim vs Visual Presentation

```
┌──────────────────────────────────────┐  ┌──────────────────────────────────────┐
│     Authoritative Core Simulation    │  │        Visual Presentation           │
├──────────────────────────────────────┤  ├──────────────────────────────────────┤
│ - Tile terrain type & walkability    │  │ - 2D tilemap rendering & autotiling  │
│ - Soil moisture & fertility values   │  │ - Day/Night ambient lighting curve   │
│ - Crop growth stage & progress tick  │  │ - Rain particle systems & splash FX  │
│ - Weather state ID (RAIN, CLEAR)     │  │ - Screen-space wind & leaf rustle    │
│ - Entity spatial positions           │  │ - Interpolated movement smoothing    │
└──────────────────────────────────────┘  └──────────────────────────────────────┘
```
The simulation loop is 100% headless-capable; presentation visuals consume simulation snapshots without feeding back into simulation state.
