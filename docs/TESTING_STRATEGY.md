# Testing Strategy & Quality Assurance: Living Village 🧪🛡️

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative Testing Specification  
> **Owners:** [QA Engineer](file:///g:/LivingVillage/agents/qa_engineer.md), [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md)

---

## 1. Practical Testing Philosophy

The audit identified that attempting to simulate "100 years in 60 seconds" is physically impossible in single-threaded JavaScript (requiring 370 nanoseconds per tick).

Our reconciled testing strategy focuses on **high-frequency, realistic headless simulations of 1 to 3 game years** backed by strict systemic invariants and deterministic regression checks.

---

## 2. Test Execution Tiers

```
┌────────────────────────────────────────────────────────┐
│  Tier 4: 3-Year Headless Stress Test (Nightly CI)      │
│  (Demographic balance, market stability, save cycles)  │
├────────────────────────────────────────────────────────┤
│  Tier 3: 1-Year Fast-Forward Sim (<15s on PR)          │
│  (Verify zero deadlocks, accounting faucets & sinks)   │
├────────────────────────────────────────────────────────┤
│  Tier 2: Subsystem Integration Tests (<5s)             │
│  (Crop growth transitions, Behavior Tree completions)  │
├────────────────────────────────────────────────────────┤
│  Tier 1: Deterministic Unit Tests (<2s)                │
│  (PRNG distributions, spatial hash math, inventory)    │
└────────────────────────────────────────────────────────┘
```

---

## 3. Core Systemic Invariants

During headless test runs, an Invariant Monitor asserts the following rules every 1,200 ticks (1 in-game hour):

### 3.1 State Validity & Boundary Invariants
1. **Coordinate Integrity:** No entity position may equal `NaN`, `Infinity`, or drift outside allocated chunk boundaries.
2. **Soil Bounds:** Soil moisture and fertility must strictly obey $0 \le M \le 100$ and $0 \le F \le 100$.
3. **Crop Stage Invariant:** Crop stages must reside strictly within $[0, 4]$ (`Seed` to `Wilted`).

### 3.2 Inventory & Resource Solvency
1. **Non-Negative Balances:** No player, NPC, or municipal wallet balance may drop below $0$ gold.
2. **Item Count Solvency:** No inventory stack quantity may be negative or exceed `maxStack`.
3. **Transactional Integrity:** During trades, total money exchanged must equal `quantity * unitPrice`, and items transferred must not duplicate or disappear.

### 3.3 Demographic & Lineage Invariants
1. **Acyclic Family Tree:** An entity's ancestral graph must remain a strict Directed Acyclic Graph (DAG); an entity cannot be their own ancestor.
2. **Deadlock Detection:** No NPC may remain in an unresolvable action state or pathfinding loop for more than $240$ consecutive ticks ($12$ in-game minutes).

### 3.4 Monetary Balance Invariant (Intentional Faucets & Sinks)
$$\text{Gold}_{\text{Current}} = \text{Gold}_{\text{Initial}} + \sum \text{Injections}_{\text{Caravan/Wages}} - \sum \text{Drains}_{\text{Imports/Permits/Sinks}}$$
*The QA harness validates that every change in total world coin is accounted for by an explicit registered source or sink.*

### 3.5 Save/Load Parity Invariant
- At tick $10,000$, the simulation serializes a snapshot to memory, restores a fresh `WorldSimulation` instance from the snapshot, and executes for $1,000$ further ticks.
- The state hash of the restored instance must match the uninterrupted instance with $100\%$ parity.

---

## 4. Headless Simulation Test Harness

The headless harness runs in Node.js without any presentation or graphics dependencies:

```typescript
// tests/headless/stress_test_1year.ts
import { WorldSimulation } from '../../src/core/WorldSimulation';

const world = new WorldSimulation({
  seed: 424242,
  headless: true
});

console.log("Simulating 1 Game Year (3,225,600 Ticks)...");
const startTime = performance.now();

// Run 1 year = 112 days (4 seasons x 28 days)
for (let day = 1; day <= 112; day++) {
  world.simulateDay();
  world.assertInvariants(); // Validates solvency, boundaries, and zero deadlocks
}

const elapsedMs = performance.now() - startTime;
console.log(`Successfully completed 1 year in ${(elapsedMs / 1000).toFixed(2)}s!`);
```

---

## 5. CI/CD Gating Benchmarks

- **Pull Request Gate:**
  - Full Unit & Integration Test Suite (<5s).
  - 1-Season Fast-Forward Simulation (~28 in-game days, <3s) validating state invariants.
- **Nightly Deep Run:**
  - 3-Year Headless Simulation run across 5 randomized seeds.
  - Save/Load roundtrip verification at each seasonal boundary.
