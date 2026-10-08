# NPC Architecture & Social Systems: Living Village 👥💬

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative NPC Specification  
> **Owners:** [Game Director](file:///g:/LivingVillage/agents/game_director.md), [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md)

---

## 1. Anatomy of an Autonomous Villager

Every villager in `Living Village` is an autonomous entity represented in the Sparse-Set ECS:

```
┌────────────────────────────────────────────────────────┐
│                   Villager Entity                      │
├──────────────────────────┬─────────────────────────────┤
│ Identity & Demographics  │ Name, Age, Gender, Role     │
│ Discrete Traits          │ 2 to 4 Distinctive Traits   │
│ Needs State              │ Hunger, Energy, Social      │
│ Sparse Relationships     │ Map<TargetEntityId, RelData>│
│ Local Knowledge Base     │ Array of Known Event IDs    │
│ Occupational Schedule    │ Role Obligations (e.g. Baker│
│ Inventory & Wallet       │ Personal Items & Gold Coins │
└──────────────────────────┴─────────────────────────────┘
```

---

## 2. Discrete Personality Traits

The complex 5-dimensional continuous OCEAN psychological model has been replaced by a **curated set of discrete, understandable traits**. Each NPC is assigned **2 to 4 traits**:

| Trait | Core Behavioral Influence | Concrete Utility Impact |
| :--- | :--- | :--- |
| **`hardworking`** | Takes pride in labor; dislikes idling. | $+25\%$ utility weight for occupational tasks; works later into evening. |
| **`social`** | Seeks companionship; energized by conversation. | Social need decays $50\%$ faster; $+30\%$ utility for tavern and festival visits. |
| **`cautious`** | Prioritizes personal safety and weather comfort. | Refuses to work outdoors during rain or storms; keeps higher food stockpiles. |
| **`ambitious`** | Seeks wealth, skill mastery, and civic standing. | Prioritizes high-margin production; active bidder in village markets. |
| **`generous`** | Willing to assist neighbors; lenient creditor. | Readily gifts items; accepts lower barter terms; boosts relationship gains. |
| **`stubborn`** | Resists schedule disruptions; holds onto grudges. | Slower to adjust prices; negative affinity takes twice as long to decay. |
| **`curious`** | Enjoys exploring outskirts; welcomes travelers. | Investigates novel events; rapid conversation partner with newcomers. |
| **`calm`** | Emotionally steady; resistant to panic or fatigue. | Minimal utility disruption from low food or bad weather; steady work pace. |

---

## 3. Sparse Relationship Model

Rather than maintaining a heavy $N \times N$ dense matrix tracking every pair of entities, `Living Village` uses a **Sparse Relationship Component**:

```typescript
export interface RelationshipData {
  affinity: number; // -100 (Hostile/Resentful) to +100 (Beloved/Family)
  respect: number;  // 0 (Unproven/Ignored) to 100 (Master Artisan/Leader)
}

export class RelationshipComponent {
  // Keyed ONLY for entities this NPC has interacted with
  public relationships: Map<number, RelationshipData> = new Map();

  public getAffinity(targetEntityId: number): number {
    return this.relationships.get(targetEntityId)?.affinity ?? 0;
  }

  public getRespect(targetEntityId: number): number {
    return this.relationships.get(targetEntityId)?.respect ?? 0;
  }
}
```

### 3.1 Who Is Tracked?
Relationships are only created and tracked when meaningful interaction occurs:
- Immediate family members (parents, spouse, children, siblings).
- Work colleagues / master apprentices.
- Direct neighbors.
- The human player character.

---

## 4. Daily Routines & Flexible Schedule Anchors

NPCs organize their days around broad occupational anchors, but remain flexible through utility preemption:

```typescript
export interface RoutineAnchor {
  startHour: number;
  endHour: number;
  activityGoal: 'WORK' | 'LEISURE' | 'SLEEP' | 'COMMUNITY';
  preferredLocation: { x: number; y: number };
}
```

### 4.1 Context-Sensitive Interrupts
- **Critical Hunger:** If hunger falls below 20, the NPC interrupts their work to seek food.
- **Extreme Exhaustion:** If energy falls below 15, the NPC packs up tools and heads home to rest.
- **Hazardous Weather:** NPCs with the `cautious` trait retreat to indoor shelters if a storm strikes during work hours.

---

## 5. Local Knowledge & Conversation

Instead of expensive memory reflection loops, conversations are grounded in shared awareness of **World Events**:
1. When two villagers talk, they compare their `knownEventIds`.
2. If Villager A knows about `Event #42: Player Harvested Giant Pumpkin` and Villager B does not, Villager A shares the event.
3. Villager B adds `42` to their known events and adjusts their `respect` for the player based on the event's positive impact.
