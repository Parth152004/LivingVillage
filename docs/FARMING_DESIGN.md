# Farming & Agronomy Design: Living Village 🌾🌱

> **Document Version:** 2.0.0 (Reconciled Post-Audit)  
> **Status:** Authoritative Agronomy Specification  
> **Owners:** [Gameplay Engineer](file:///g:/LivingVillage/agents/gameplay_engineer.md), [Simulation Architect](file:///g:/LivingVillage/agents/simulation_architect.md)

---

## 1. Streamlined Soil Science

The audit removed individual N-P-K chemical compounds, pH tracking, and soil compaction to focus on intuitive, rewarding farming mechanics.

Soil is tracked per tile inside the **Chunk Grid System** (not as ECS entities) using two primary variables:

```typescript
export interface SoilData {
  moisture: number;    // 0 (Bone Dry) to 100 (Saturated)
  fertility: number;   // 0 (Depleted) to 100 (Rich Organic Loam)
}
```

### 1.1 Soil Dynamics
- **Moisture Dynamics:**
  - *Daily Evaporation:* Drops by $15$ to $30$ points per day depending on weather and temperature.
  - *Rain Infiltration:* Natural rain increases moisture by $+40$ to $+70$ points across all exposed tiles.
  - *Manual Watering:* Using a watering can restores moisture to $100$.
- **Fertility Dynamics:**
  - *Crop Consumption:* Mature crops consume $10$ to $20$ fertility points upon harvest.
  - *Composting & Fertilizers:* Spreading compost or manure restores $+30$ to $+50$ fertility.
  - *Fallow Recovery:* Leaving untilled soil fallow across a season restores $+15$ fertility naturally.

---

## 2. Crop Growth Life Cycle (5 Discrete Stages)

All crops advance through 5 discrete, visually distinct stages:

```
[1. Seed] ──> [2. Sprout] ──> [3. Growing] ──> [4. Mature] ──> [5. Wilted]
```

1. **Seed:** Planted in tilled soil. Requires minimum moisture ($\ge 20$) to germinate.
2. **Sprout:** Tender early sprout. Fragile to severe unseasonal freezes.
3. **Growing:** Rapid vegetative expansion. Consumes moisture daily.
4. **Mature (Harvestable):** Peak ripe crop ready for sickle or hand harvest. Yields standard, fine, or masterwork produce based on average soil fertility.
5. **Wilted (Decayed):** Occurs if unharvested for 5 in-game days, or killed by seasonal frost. Can be scythed to yield fiber and biomass for the compost bin.

---

## 3. Seasonal Compatibility & Weather Interactions

Crops have explicit seasonal preferences:

| Crop | Preferred Seasons | Base Days to Mature | Water Need | Special Properties |
| :--- | :--- | :--- | :--- | :--- |
| **Parsnip** | Spring | 4 days | Moderate | Fast early-game staple; tolerant to cool spring rains. |
| **Maize (Corn)** | Summer | 11 days | High | Multi-harvest crop; tall stalks provide shade. |
| **Winter Barley**| Autumn / Winter | 8 days | Low | Frost-hardy; ground cover that prevents soil erosion. |
| **Squash** | Summer / Autumn | 6 days | Moderate | Broad leaves conserve soil moisture. |
| **Flax** | Spring / Summer | 7 days | Low | Non-food cash crop; spun into linen thread. |

### 3.1 Weather Effects
- **Sunny Days:** Maximum growth progression, higher moisture loss.
- **Rainy Days:** Free natural watering, moderate growth rate.
- **Storms:** Risk of minor wind damage to tall crops without windbreaks.
- **Winter Frost:** Freezes and wilts any non-frost-hardy crops instantly unless grown in a sheltered greenhouse.

---

## 4. Companion Planting Synergies

Pairing complementary crops in adjacent tiles provides intuitive bonuses without complex genetics:

* **The Three Sisters (Corn + Climbing Beans + Squash):**
  - Corn provides a natural trellis for beans.
  - Squash leaves shade the ground, reducing moisture loss by **$50\%$**.
  - Beans boost adjacent soil fertility by **$+10$** points per harvest.
* **Aromatic Herb Border (Tomatoes + Basil):**
  - Basil adjacent to tomatoes boosts tomato harvest quality tier chance by **$+25\%$**.

---

## 5. Deferred Systems (Future Botanical Expansion)

To maintain focus on rock-solid core gameplay for Phase 1, the following systems are officially deferred:
- Individual N-P-K chemical ratios.
- Soil pH scale and limestone treatment.
- Soil mechanical compaction and aeration indices.
- 5-allele Mendelian genetic inheritance and hybridization.
