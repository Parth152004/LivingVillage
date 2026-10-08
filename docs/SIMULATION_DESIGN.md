# Simulation Design: Living Village ⏱️🧠

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative Simulation Specification  
> **Owners:** [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md), [Performance Engineer](file:///g:/LivingVillage/agents/performance_engineer.md)

---

## 1. The Clock & Virtual Time Model

The simulation ticks at a fixed frequency of **20Hz (50ms per tick)**:

| Unit | Simulation Ticks | In-Game Duration | Real-Time Equivalent (1x speed) |
| :--- | :--- | :--- | :--- |
| **Tick** | 1 tick | 3.0 in-game seconds | 50 milliseconds (20Hz) |
| **In-Game Minute** | 20 ticks | 1 in-game minute | 1.0 real second |
| **In-Game Hour** | 1,200 ticks | 1 in-game hour | 60.0 real seconds (1 min) |
| **In-Game Day** | 28,800 ticks | 24 in-game hours | 24.0 real minutes |
| **Season** | 806,400 ticks | 28 in-game days | 11.2 real hours |
| **Year (4 Seasons)** | 3,225,600 ticks | 112 in-game days | 44.8 real hours |

---

## 2. Homogeneous Simulation Architecture (20–50 NPCs)

To eliminate the instability, teleporting bugs, and dual-logic maintenance of multi-tier LODs, **the initial implementation uses a single, homogeneous 20Hz simulation loop for all 20–50 village NPCs.**

### 2.1 Why 3-Tier LOD Was Removed
- **Premature Complexity:** Running concentric LOD rings (continuous vs. grid vs. analytical) adds massive bookkeeping overhead before core village routines are even functional.
- **Trivial CPU Load at Small Scale:** Ticking 50 NPCs with Utility AI and Behavior Trees takes **<1.5ms** per tick—well within the 50ms tick window.

### 2.2 Future LOD Expansion Path (Non-Breaking)
The architecture is structured so that when the world expands to multiple villages:
1. Inactive chunks can adopt a **Spatial Sleep Flag** (`chunk.isSleeping = true`), skipping local updates until an entity enters or an interval alarm fires.
2. The core NPC Behavior Tree interface will remain completely unchanged.

---

## 3. Autonomous NPC Decision Architecture: Utility + Behavior Trees

GOAP (Goal-Oriented Action Planning) has been replaced by a robust, predictable **Utility-Scored Behavior Tree** architecture:

```
┌────────────────────────────────────────────────────────┐
│                   1. Needs & Context                   │
│   (Hunger, Energy, Social, Work Time, Current Weather) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                  2. Utility Scoring                    │
│   (Evaluate curves modified by 2-4 discrete traits)    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                  3. Goal Selection                     │
│      (Pick highest-scoring goal: EAT, WORK, REST)      │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            4. Behavior Tree Execution                  │
│   (Execute deterministic task nodes: Move, Use, Wait)  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│              5. World Action & State Change            │
│       (Consume item from inventory, restore energy)     │
└────────────────────────────────────────────────────────┘
```

### 3.1 Utility Scoring Model
Needs decay over time and are evaluated using simple, deterministic quadratic or linear response curves:

$$\text{Utility}_{\text{Eat}} = \left( 1.0 - \frac{\text{Hunger}}{100} \right)^2 \times \text{TraitModifier}$$

- If an NPC has the `hardworking` trait, their `Work` utility is boosted by $+20\%$.
- If an NPC has the `cautious` trait, stormy weather reduces their desire to work outdoors by $-50\%$.

### 3.2 Behavior Tree Tasks
Once a goal is selected, execution transfers to a standard, deterministic Behavior Tree:

```
Goal: EAT
└── Sequence
    ├── HasFoodInInventory? (Condition)
    │   └── [Fail] -> Sequence
    │       ├── FindNearestPantryOrStall (Action)
    │       ├── MoveToLocation (Action / Pathfind)
    │       └── TakeFoodItem (Action)
    ├── MoveToDiningTable (Action / Pathfind)
    └── ConsumeFood (Action: Restores Hunger, Decrements Item)
```

---

## 4. Grid Pathfinding Architecture

The initial pathfinding system uses standard **Grid A\*** over the chunk walkability layer:

### 4.1 Pathfinding Specifications
- **Navigation Grid:** 1 tile = 1 navigation node ($1\text{m} \times 1\text{m}$).
- **Static Obstacles:** Water tiles, cliff edges, constructed walls, closed gates.
- **Dynamic Obstacles:** Sleeping animals, temporary barricades, other NPCs. Dynamic obstacles register their tile positions into the local navigation mask without reallocating maps.
- **Request Queue & Time Slicing:** A centralized `PathfindingManager` processes a maximum of **5 path requests per tick** (capped at 0.8ms). If an NPC makes a request during a heavy tick, the request sits in the queue and the NPC waits 1–2 ticks in an `AwaitingPath` state.
- **Failure Handling:** If A* cannot reach a target (e.g. door blocked), the Behavior Tree fails the action node cleanly, decrementing target utility and falling back to an idle or alternative behavior.
- **Deterministic Tie-Breaking:** When multiple nodes have equal $f$-costs, tie-breaking is resolved strictly by node coordinate hash (`(x * 73856093) ^ (y * 19349663)`), guaranteeing identical paths across runs.

---

## 5. Event History & Localized Knowledge

Complex generative memory streams have been replaced by a lightweight **Central Event History with Local Knowledge References**:

```typescript
export interface WorldEvent {
  eventId: number;
  tick: number;
  type: 'THEFT' | 'FESTIVAL' | 'BLIGHT' | 'TRADE' | 'MARRIAGE' | 'DEATH';
  actorEntityId: number;
  locationChunkX: number;
  locationChunkY: number;
  description: string;
}

export class KnowledgeComponent {
  // Array of Event IDs that this NPC is aware of
  public knownEventIds: number[] = [];
  
  public knowsAbout(eventId: number): boolean {
    return this.knownEventIds.includes(eventId);
  }
}
```

### 5.1 How NPCs Learn
- **Direct Witness:** If an event occurs within an NPC's line-of-sight/hearing radius (e.g. 15 tiles), the `eventId` is immediately added to their `knownEventIds`.
- **Conversation / Word of Mouth:** When two NPCs converse during their `Socialize` behavior, they exchange 1–2 recent `eventIds` that the other does not know.
- This creates realistic, localized information spread without memory bloat or complex reflection algorithms.
