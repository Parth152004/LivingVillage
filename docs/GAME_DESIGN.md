# Game Design Document: Living Village 🎮🌾

> **Document Version:** 1.0.0  
> **Status:** Core Specification  
> **Owners:** [Game Director](file:///g:/LivingVillage/agents/game_director.md), [Gameplay Engineer](file:///g:/LivingVillage/agents/gameplay_engineer.md)

---

## 1. The Core Gameplay Loops

The gameplay loop of `Living Village` operates across three synchronized temporal tiers:

```mermaid
graph TD
    subgraph MicroLoop [Minute-to-Minute: Tactile Craft]
        A[Explore & Observe World] --> B[Perform Physical Action: Till/Sow/Water/Chop]
        B --> C[Interact with Villager / Barter]
        C --> D[Manage Stamina & Tool Durability]
        D --> A
    end

    subgraph MesoLoop [Day-to-Day / Seasonal Rhythm]
        E[Dawn Rooster: Check Weather & Mail] --> F[Execute Morning Chores & Field Care]
        F --> G[Village Life: Market Stalls, Council, Social Visits]
        G --> H[Evening Rest & Journal Update]
        H --> I[Night Simulation Tick & Soil State Calculation]
        I --> E
    end

    subgraph MacroLoop [Yearly & Generational Legacy]
        J[Seasonal Transitions & Festivals] --> K[Lineage Progression: Courtship, Births, Aging]
        K --> L[Village Infrastructure & Economic Expansion]
        L --> M[Passing the Mantle: Generational Inheritance]
        M --> J
    end
```

---

## 2. Player Character & Action Economy

### 2.1 Attributes & Vital Stats
- **Stamina (0–100):** Consumed by manual labor (hoeing, chopping, hauling). Restored through wholesome meals, restful sleep, and short respites at village benches or hot springs. Exhaustion causes slowness and susceptibility to illness.
- **Health / Vitality (0–100):** Represents physical wellness. Impacted by disease, extreme hypothermia/heatstroke, and severe exhaustion.
- **Sociability / Warmth (0–100):** Reflects engagement with the community. Spending days in total isolation slowly triggers melancholy; greeting neighbors and sharing meals boosts morale and work efficiency.

### 2.2 Movement & Interaction Scheme
- **Dual-Grid Navigation:** The player moves freely in continuous 2D/isometric space, but tool interactions snap to an intelligent **1x1 meter contextual grid overlay**.
- **Contextual Reticle:** Hovering over a tile with a tool equips an action indicator previewing the outcome:
  - *Hoe on Grass* -> Tills soil, exposes earthworms/seeds.
  - *Watering Can on Tilled Soil* -> Shows soil saturation level change.
  - *Empty Hand on Mature Crop* -> Displays harvest prompt with quality preview.
  - *Talking to NPC* -> Shows current mood icon and affinity status.

---

## 3. Social Interaction & Dialogue Mechanics

### 3.1 Topic-Based & Context-Driven Dialogue
Instead of static branching trees, conversation options emerge dynamically from recent simulation events:
- **Shared Memories:** *"Did you hear about the hail storm that wrecked Old Man Caleb's barley field?"*
- **Market Inquiries:** *"The apothecary is paying double for wild lavender this week."*
- **Personal State:** Asking a villager how they feel queries their current highest-priority unmet need (hunger, loneliness, lack of firewood).
- **Proposals & Collaborations:** Propose joint farming projects, hire day laborers, borrow livestock, or propose marriage.

### 3.2 Reputation & Village Standing
- **Communal Trust (0–100):** Built by contributing to public grain silos, maintaining roads, and honoring trade agreements. High trust unlocks village council voting rights and communal land grants.
- **Personal Affinities (-100 to +100):** Tracked pairwise between the player and every individual NPC, dictating personal warmth, favors, and romantic courtship eligibility.

---

## 4. Construction, Crafting & Settlements

### 4.1 Modular Construction
- Players can construct, upgrade, and repair outbuildings using physical harvested materials (timber, stone, thatch, lime mortar).
- Buildings feature internal insulation, weather protection, and functional machinery (windmills, smokehouses, fermentation cellars).

### 4.2 Artisanal Processing Chains
Items are transformed through physical simulation stations:
1. **Raw Harvest:** Wheat sheaves.
2. **Threshing & Milling:** Threshed with a flail, ground in the millstone into fine flour.
3. **Baking:** Mixed with water and wild yeast, baked in an earthen brick oven.
4. **Value Multipliers:** Higher quality ingredients, proper oven temperature, and age create masterwork goods with premium market value.

---

## 5. UI/UX Philosophy

- **Diegetic & Minimalist:** Critical information is visible directly in the world (dry soil looks dusty pale; plants droop when dehydrated; villagers show natural body language).
- **The Village Almanac:** A handheld journal containing:
  - Daily calendar with moon phases, weather forecast, and birthdays.
  - Soil analysis pages with color-coded nutrient indicators.
  - Ledger of debts, trade balances, and active contracts.
  - Complete village family tree and lineage chronicle.
