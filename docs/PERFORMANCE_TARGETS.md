# Performance Targets & Budgets: Living Village ⚡⏱️

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative Performance Specification  
> **Owners:** [Performance Engineer](file:///g:/LivingVillage/agents/performance_engineer.md), [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md)

---

## 1. Frame & Tick Time Budgets

The primary performance mandate is maintaining a steady **60 FPS** on consumer hardware (desktop browsers, laptops, and handheld devices like Steam Deck) with zero garbage-collection stutter.

```
Total Frame Budget @ 60 FPS = 16.66 ms
┌─────────────────────────────────────────────────────────────┐
│ Sim Tick (if run this frame @ 20Hz): Max 5.0 ms             │
├─────────────────────────────────────────┬───────────────────┤
│ Presentation & Render Pipeline: 9.0 ms  │ GC / Headroom:    │
│ (2D Tilemap, Sprites, Lighting, UI)     │ 2.66 ms           │
└─────────────────────────────────────────┴───────────────────┘
```

---

## 2. Realistic Simulation Tick Budget (20–50 NPCs)

The initial implementation targets **20 to 50 active autonomous villagers**. The 5.0ms tick budget is allocated as follows:

| Subsystem | Max Budget | Scalability Strategy |
| :--- | :--- | :--- |
| **Time & Weather State** | 0.20 ms | Fast lookup; single seasonal Markov transition at dawn. |
| **Soil & Crop Grid Tick** | 0.60 ms | Direct 2D typed array loops over dirty/active farming chunks only. |
| **NPC Utility & Behavior Trees** | 1.50 ms | Simple evaluation curves; Behavior Trees execute 1 node per tick. |
| **Grid Pathfinding Queue** | 1.00 ms | Time-sliced queue processing a maximum of 5 A* requests per tick. |
| **Spatial Hash & Collision** | 0.50 ms | Uniform 4m grid bucket updates; zero memory allocations. |
| **Action Resolution & Economy** | 0.50 ms | Direct wallet and inventory atomic transactions. |
| **Presentation Snapshot Build** | 0.40 ms | Flat copy of dynamic entity positions into read-only buffer. |
| **TOTAL SIMULATION TICK BUDGET** | **4.70 ms** | **Target ceiling: < 5.0 ms** |

---

## 3. Entity Scaling Tiers & Benchmarking Policy

To ensure engineering honesty, all performance figures are categorized into three distinct statuses:
- **[Target]:** Official production requirement.
- **[Estimate]:** Theoretical model based on algorithmic complexity.
- **[Measured Result]:** Verified hardware benchmark data from automated profiling suites.

### Scalability Progression Matrix

| Entity Tier | Expected Tick Time | Status | Action / Architecture Path |
| :--- | :--- | :--- | :--- |
| **20–50 NPCs** | **1.2 – 2.0 ms** | **[Target]** | **Phase 1 Baseline:** Full homogeneous 20Hz execution. |
| **100 NPCs** | **3.0 – 4.5 ms** | **[Estimate]** | **Phase 3 Target:** Fits within 5.0ms budget with time-sliced AI. |
| **250 NPCs** | **6.0 – 9.0 ms** | **[Estimate]** | **Future Expansion:** Requires chunk-based spatial sleep flags. |
| **500+ NPCs** | **15.0+ ms** | **[Estimate]** | **Future Expansion:** Requires LOD tiering or native WASM acceleration. |

*Unsubstantiated claims (e.g. "1,000 NPCs at 5ms in JavaScript") are strictly removed.*

---

## 4. Memory & Garbage Collection (GC) Policy

- **Target Memory Footprint:** $\le 200\text{ MB}$ RAM for initial 50-villager world.
- **Zero Allocations in Hot Paths:**
  - No `new Object()`, no object spread `{ ... }`, no `Array.push()` inside the 20Hz tick loop or 60Hz render loop.
  - Scratch vectors, path buffers, and spatial query arrays must be pre-allocated singletons.
- **Infrequent Event Exceptions:** Infrequent, high-level lifecycle events (e.g. annual village council elections, wedding ceremonies, funeral registrations) are permitted to perform standard object allocations as they execute outside the hot frame budget.
