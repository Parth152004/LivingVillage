# Save System & Persistence Architecture: Living Village 💾📦

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative Persistence Specification  
> **Owners:** [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md), [QA Engineer](file:///g:/LivingVillage/agents/qa_engineer.md)

---

## 1. Direct Authoritative State Snapshot Architecture

The audit rejected the "Seed + Mutation Delta" model because procedural generator changes between versions corrupt delta-reconstructed saves.

`Living Village` uses **Direct Authoritative State Snapshots**:
- Active and modified chunks are serialized directly with their full tile and soil buffers.
- All dynamic ECS entities, inventories, relationships, and municipal balances are serialized as structured, versioned data records.
- Loading a save directly restores the world state without re-running procedural generation algorithms.

---

## 2. Complete Save State Schema

A valid save file (`LivingVillage_Slot1.sav`) encapsulates all authoritative simulation variables:

```typescript
export interface WorldSaveData {
  // 1. Metadata & Versioning
  saveVersion: number;       // e.g. 1
  gameVersion: string;       // e.g. "0.1.0"
  timestamp: number;         // Real-world unix timestamp
  
  // 2. Temporal & Deterministic State
  simulationTick: number;    // Absolute 20Hz tick count
  inGameDay: number;         // Day 1 to 28
  inGameSeason: number;      // 0=Spring, 1=Summer, 2=Autumn, 3=Winter
  inGameYear: number;
  rngState: number;          // Current internal PRNG integer state
  currentWeather: string;    // 'CLEAR' | 'RAIN' | etc.

  // 3. Player State
  player: {
    entityId: number;
    position: { x: number; y: number };
    stamina: number;
    health: number;
    inventory: ItemStack[];
    wallet: number;
  };

  // 4. World Chunks (Terrain, Soil & Crops)
  chunks: Array<{
    chunkX: number;
    chunkY: number;
    tiles: TileRecord[];     // 1,024 tile array (terrain, moisture, fertility, crop)
  }>;

  // 5. Dynamic Entities (NPCs, Animals, Buildings)
  entities: Array<{
    id: number;
    type: string;
    position: { x: number; y: number };
    needs?: { hunger: number; energy: number; social: number };
    traits?: string[];
    inventory?: ItemStack[];
    wallet?: number;
    relationships?: Array<{ targetId: number; affinity: number; respect: number }>;
    knownEventIds?: number[];
    lineage?: { familyId: number; parent1?: number; parent2?: number; spouse?: number; children: number[] };
  }>;

  // 6. Economy & Municipal State
  economy: {
    treasuryBalance: number;
    marketStockpiles: Record<number, number>; // itemId -> total stock
    recentConsumption: Record<number, number>; // itemId -> 7-day demand
  };

  // 7. World Event History
  events: WorldEvent[];
}
```

---

## 3. Atomic Disk Writes & Rolling Backups

To eliminate save file corruption caused by crashes or sudden power loss:

```
[Sim World Snapshot] ──> [Serialize to JSON or Binary Buffer]
                                      │
                                      ▼
                           [Write to `save.tmp`]
                                      │
                         (Success)    ▼   (Failure -> Keep Existing)
                           [Atomic File Rename / Replace]
                                      │
                                      ▼
                         [`LivingVillage_Slot1.sav`]
```

### 3.1 Rolling Backup Policy
The engine maintains three rolling slots per playthrough:
1. `slot1_current.sav`: The latest dawn autosave or manual save.
2. `slot1_previous.sav`: The save from the previous in-game dawn.
3. `slot1_season_start.sav`: An immutable milestone save captured on Day 1 of each season.

---

## 4. Schema Migration Strategy

As game features expand across versions, save files include an explicit `saveVersion` integer:

```typescript
export interface SaveMigration {
  fromVersion: number;
  toVersion: number;
  migrate(rawState: any): any;
}

export const SaveMigrations: SaveMigration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate: (rawState) => {
      // Example: Adding new fields with safe defaults
      for (const entity of rawState.entities) {
        if (!entity.traits) entity.traits = ['calm'];
      }
      rawState.saveVersion = 2;
      return rawState;
    }
  }
];
```

---

## 5. Replay Logging Clarification

- **Save/Load Independence:** Normal save and load operations **never** rely on replaying tick streams from tick 0.
- **Diagnostic Tool Only:** Input logging exists strictly as an optional developer/QA diagnostic tool to capture and reproduce short regression sequences (<10,000 ticks) in automated test runs.
