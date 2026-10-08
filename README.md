# Living Village 🌾🏘️

> **A Next-Generation Emergent Autonomous Village Life & Ecosystem Simulation**

[![Architecture: Chunk Grid + Sparse-Set ECS](https://img.shields.io/badge/Architecture-Grid%20%2B%20ECS-blue.svg)](#technical-architecture)
[![Simulation: Deterministic 20Hz](https://img.shields.io/badge/Simulation-Deterministic%2020Hz-green.svg)](#simulation-engine)
[![Agents: Autonomous Multi--Role](https://img.shields.io/badge/Agents-Autonomous%20Team-orange.svg)](#specialized-agents)

`Living Village` is an ambitious, deeply systemic simulation game blending the coziness of farming and village life with the rich, unscripted emergence of complex autonomous agents, dynamic open economies, and generational family legacies.

---

## 🌟 Core Pillars

1. **A World That Breathes on Its Own**: NPCs are autonomous agents driven by physiological needs, discrete personality traits, sparse social relationships, and deterministic Behavior Trees. They form friendships, marry, raise children, and pass traditions across generations.
2. **Tactile Agriculture & Ecology**: Soil moisture, natural fertility, seasonal weather compatibility, and companion planting make farming an engaging, organic craft without tedious microscopic bookkeeping.
3. **Regulated Open Economy**: Dynamic supply-and-demand market pricing protected by safety clamps, backed by intentional monetary faucets (trade caravans, public works) and sinks (import tariffs, tools, permits).
4. **Generational Legacy**: Watch families grow, inherit intact family homesteads, develop reputations, and remember historical village events across decades.
5. **Rigorous Systems Engineering**: Built on a high-performance hybrid architecture: a dedicated Chunk Grid for static terrain and soil, paired with a deterministic Sparse-Set ECS for dynamic actors, running at a fixed 20Hz tick rate with authoritative snapshot persistence.

---

## 📂 Repository Structure

```
LivingVillage/
├── agents/                     # Multi-Agent Engineering Personas & Guidelines
│   ├── AGENTS.md               # Agent coordination protocol & workflows
│   ├── game_director.md        # Creative vision & game loop steward
│   ├── simulation_architect.md # Chunk Grid, Sparse-Set ECS & deterministic loop
│   ├── gameplay_engineer.md    # Player mechanics, farming, crafting, UI
│   ├── world_builder.md        # Procedural world, biomes, Markov weather & audio
│   ├── qa_engineer.md          # Headless test harnesses & systemic invariants
│   └── performance_engineer.md # Profiling, memory budgets & 50 NPC targets
│
├── docs/                       # Comprehensive Architecture & Design Docs
│   ├── GAME_VISION.md          # Vision, emotional resonance & player fantasy
│   ├── GAME_DESIGN.md          # Core loops, controls & interaction design
│   ├── TECH_ARCHITECTURE.md    # Engine, Chunk Grid, Sparse-Set ECS & commands
│   ├── SIMULATION_DESIGN.md    # 20Hz tick runner, Utility + BT AI, pathfinding
│   ├── ECONOMY_DESIGN.md       # Regulated open market, price math & trade
│   ├── NPC_DESIGN.md           # Discrete traits, routines, sparse relationships
│   ├── FAMILY_DESIGN.md        # Streamlined ages, DAG lineage, direct succession
│   ├── FARMING_DESIGN.md       # Moisture & fertility, 5 crop stages, companion plants
│   ├── WORLD_DESIGN.md         # 32x32 Chunks, biomes, Markov weather & lighting
│   ├── SAVE_SYSTEM.md          # Direct authoritative snapshots, atomic writes
│   ├── TESTING_STRATEGY.md     # 1-3 Year headless sims, systemic invariants
│   ├── PERFORMANCE_TARGETS.md  # 20-50 NPC budgets, zero-allocation hot loops
│   └── ROADMAP.md              # Pragmatic roadmap: Phase 0 to Production
│
└── README.md                   # This project overview
```

---

## 🤖 The Multi-Agent Team

`Living Village` is designed to be developed, maintained, and balanced through a collaborative multi-agent architecture. Each agent role is explicitly scoped with clear domain ownership:

| Agent Role | Domain Focus | Primary Specs & Deliverables |
| :--- | :--- | :--- |
| **[Game Director](file:///g:/LivingVillage/agents/game_director.md)** | Creative vision, player experience, balance | [GAME_VISION.md](file:///g:/LivingVillage/docs/GAME_VISION.md), [GAME_DESIGN.md](file:///g:/LivingVillage/docs/GAME_DESIGN.md) |
| **[Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md)** | Chunk Grid, ECS, deterministic tick loop, state flow | [TECH_ARCHITECTURE.md](file:///g:/LivingVillage/docs/TECH_ARCHITECTURE.md), [SIMULATION_DESIGN.md](file:///g:/LivingVillage/docs/SIMULATION_DESIGN.md) |
| **[Gameplay Engineer](file:///g:/LivingVillage/agents/gameplay_engineer.md)** | Player interactions, farming, tools, UI | [FARMING_DESIGN.md](file:///g:/LivingVillage/docs/FARMING_DESIGN.md), [NPC_DESIGN.md](file:///g:/LivingVillage/docs/NPC_DESIGN.md) |
| **[World Builder](file:///g:/LivingVillage/agents/world_builder.md)** | Terrains, biomes, Markov weather, lighting | [WORLD_DESIGN.md](file:///g:/LivingVillage/docs/WORLD_DESIGN.md) |
| **[QA Engineer](file:///g:/LivingVillage/agents/qa_engineer.md)** | Headless tests, invariants, fuzzing | [TESTING_STRATEGY.md](file:///g:/LivingVillage/docs/TESTING_STRATEGY.md), Test Harnesses |
| **[Performance Engineer](file:///g:/LivingVillage/agents/performance_engineer.md)** | Frame budgets, cache optimization, 20-50 NPC scaling | [PERFORMANCE_TARGETS.md](file:///g:/LivingVillage/docs/PERFORMANCE_TARGETS.md), Profilers |

See [AGENTS.md](file:///g:/LivingVillage/agents/AGENTS.md) for collaboration protocols, consensus patterns, and delegation guidelines.

---

## 📖 Quick Links to Documentation

* 🎮 **Vision & Gameplay**:
  * [Game Vision & Fantasy](file:///g:/LivingVillage/docs/GAME_VISION.md)
  * [Game Design Document](file:///g:/LivingVillage/docs/GAME_DESIGN.md)
* ⚙️ **Systems & Simulation**:
  * [Technical Architecture](file:///g:/LivingVillage/docs/TECH_ARCHITECTURE.md)
  * [Simulation & Tick Pipeline](file:///g:/LivingVillage/docs/SIMULATION_DESIGN.md)
  * [NPC Architecture & Routines](file:///g:/LivingVillage/docs/NPC_DESIGN.md)
  * [Family Lineages & Lineage](file:///g:/LivingVillage/docs/FAMILY_DESIGN.md)
* 🌾 **World & Economy**:
  * [Farming & Agronomy Systems](file:///g:/LivingVillage/docs/FARMING_DESIGN.md)
  * [Economic Models & Markets](file:///g:/LivingVillage/docs/ECONOMY_DESIGN.md)
  * [World & Climate Design](file:///g:/LivingVillage/docs/WORLD_DESIGN.md)
* 🛡️ **Engineering Standards**:
  * [Save & Snapshot System](file:///g:/LivingVillage/docs/SAVE_SYSTEM.md)
  * [Testing Strategy & Invariants](file:///g:/LivingVillage/docs/TESTING_STRATEGY.md)
  * [Performance Budgets](file:///g:/LivingVillage/docs/PERFORMANCE_TARGETS.md)
  * [Development Roadmap](file:///g:/LivingVillage/docs/ROADMAP.md)

---

## 🛠️ Getting Started

### Development Workflow
1. Review the [Technical Architecture](file:///g:/LivingVillage/docs/TECH_ARCHITECTURE.md) to understand the Chunk Grid vs ECS boundaries.
2. Review the [Roadmap](file:///g:/LivingVillage/docs/ROADMAP.md) for active milestones.
3. Consult role-specific agent documents in [agents/](file:///g:/LivingVillage/agents/) prior to implementing cross-cutting features.
4. Run the headless simulation test suite regularly using the guidelines in [TESTING_STRATEGY.md](file:///g:/LivingVillage/docs/TESTING_STRATEGY.md).
