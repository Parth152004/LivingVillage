import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import {
  formatDayTime,
  getEnergyDisplay,
  checkBedProximity,
  GameplayUI
} from '../../src/client/GameplayUI.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';
import { PLAYER_CONFIG } from '../../src/player/PlayerConfig.js';

test('Manual Acceptance Scenario: 26-step end-to-end player gameplay and presentation loop', () => {
  // Step 1: Start Day 1 at 06:00 (tick 7200)
  const sim = new WorldSimulation({ seed: 42, initialTick: 7200 });
  const bedId = sim.spawnBed(12, 12);
  const playerId = sim.spawnPlayer(16, 16);
  const ui = new GameplayUI();

  let snapshot = sim.getRenderSnapshot();

  // Step 2: UI shows Energy 100/100
  const initialEnergy = getEnergyDisplay(snapshot.player?.energy);
  assert.equal(initialEnergy.text, 'Energy: 100 / 100');
  assert.equal(initialEnergy.current, 100);
  assert.equal(initialEnergy.max, 100);

  // Step 3: UI shows correct time: Day 1  06:00
  const initialTime = formatDayTime(snapshot.tick);
  assert.equal(initialTime.day, 1);
  assert.equal(initialTime.timeString, '06:00');
  assert.equal(initialTime.fullDisplay, 'Day 1  06:00');

  // Step 4: Select Hoe (Slot 0)
  ui.selectSlot(0);
  assert.equal(ui.selectedHotbarSlot, 0);
  assert.equal(snapshot.player?.inventory[0]?.itemId, 'tool_hoe');

  // Step 5: Till a valid tile at (16, 15)
  sim.chunks.setTile(16, 15, { terrainType: 0, flags: TILE_FLAGS.WALKABLE, moisture: 20, fertility: 60 });
  sim.enqueueCommand('TILL', playerId, { targetTileX: 16, targetTileY: 15 });
  sim.step();

  // Step 6: Energy decreases to 95
  snapshot = sim.getRenderSnapshot();
  const energyAfterTill = getEnergyDisplay(snapshot.player?.energy);
  assert.equal(energyAfterTill.current, 95);
  assert.equal(energyAfterTill.text, 'Energy: 95 / 100');

  // Step 7: Select seeds (Slot 2)
  ui.selectSlot(2);
  assert.equal(ui.selectedHotbarSlot, 2);
  assert.equal(snapshot.player?.inventory[2]?.itemId, 'seed_parsnip');
  assert.equal(snapshot.player?.inventory[2]?.quantity, 15);

  // Step 8: Sow
  sim.enqueueCommand('SOW', playerId, { targetTileX: 16, targetTileY: 15, payload: { seedItemId: 'seed_parsnip' } });
  sim.step();

  // Step 9: Energy decreases to 93
  snapshot = sim.getRenderSnapshot();
  const energyAfterSow = getEnergyDisplay(snapshot.player?.energy);
  assert.equal(energyAfterSow.current, 93);
  assert.equal(energyAfterSow.text, 'Energy: 93 / 100');
  assert.equal(snapshot.player?.inventory[2]?.quantity, 14, 'Parsnip seed quantity decremented to 14');

  // Step 10: Select watering can (Slot 1)
  ui.selectSlot(1);
  assert.equal(ui.selectedHotbarSlot, 1);
  assert.equal(snapshot.player?.inventory[1]?.itemId, 'tool_watering_can');
  assert.equal(snapshot.player?.inventory[1]?.charges, 40);

  // Step 11: Water crop
  sim.enqueueCommand('WATER', playerId, { targetTileX: 16, targetTileY: 15 });
  sim.step();

  // Step 12: Energy decreases to 92
  snapshot = sim.getRenderSnapshot();
  const energyAfterWater = getEnergyDisplay(snapshot.player?.energy);
  assert.equal(energyAfterWater.current, 92);
  assert.equal(energyAfterWater.text, 'Energy: 92 / 100');
  assert.equal(snapshot.player?.inventory[1]?.charges, 39, 'Watering can charges decremented to 39');

  // Step 13: Continue farming until energy becomes low (simulate farming to 15 energy)
  const energyComp = sim.ecs.getComponent<any>(playerId, 'Energy');
  energyComp.current = 15;
  snapshot = sim.getRenderSnapshot();
  const lowEnergy = getEnergyDisplay(snapshot.player?.energy);
  assert.equal(lowEnergy.current, 15);
  assert.equal(lowEnergy.text, 'Energy: 15 / 100');

  // Step 14: Return to bed at (12, 12)
  const playerPos = sim.ecs.getComponent<any>(playerId, 'Position');
  playerPos.x = 12.5;
  playerPos.y = 12.5;
  snapshot = sim.getRenderSnapshot();
  const playerEntity = snapshot.entities.find(e => e.id === playerId)!;
  const bedEntity = snapshot.entities.find(e => e.id === bedId)!;
  assert.equal(checkBedProximity(playerEntity, bedEntity), true, 'Player should be within 1.5 reach of bed');

  // Step 15: Trigger Sleep
  sim.enqueueCommand('SLEEP', playerId, { targetEntityId: bedId });

  // Step 16: Screen performs short fade/sleep transition
  ui.startSleepTransition();
  assert.equal(ui.isSleeping, true);
  const tickPreSleep = sim.currentTick;

  // Simulation processes authoritative sleep
  sim.step();

  // Step 17: Simulation advances to next valid 06:00 (tick 36,000)
  assert.equal(sim.currentTick, 36000, 'Authoritative simulation must reach tick 36000');
  assert.notEqual(sim.currentTick, tickPreSleep);

  // Step 18: Farming state progresses (watered parsnip grows from stage 0 seed to stage 1 sprout)
  const farmTile = sim.chunks.getTile(16, 15)!;
  assert.equal(farmTile.cropStage, 1, 'Crop must have progressed to Stage 1 Sprout');

  // Step 19: Energy displays 100/100
  snapshot = sim.getRenderSnapshot();
  const energyAfterSleep = getEnergyDisplay(snapshot.player?.energy);
  assert.equal(energyAfterSleep.current, 100);
  assert.equal(energyAfterSleep.text, 'Energy: 100 / 100');

  // Step 20: UI shows next day: Day 2  06:00
  const timeAfterSleep = formatDayTime(snapshot.tick);
  assert.equal(timeAfterSleep.day, 2);
  assert.equal(timeAfterSleep.hour, 6);
  assert.equal(timeAfterSleep.timeString, '06:00');
  assert.equal(timeAfterSleep.fullDisplay, 'Day 2  06:00');

  // Step 21: Continue farming
  // Advance crop to mature stage 3
  farmTile.cropStage = 3;
  playerPos.x = 16.5;
  playerPos.y = 16.5;

  // Step 22: Harvest a mature crop
  const harvestCost = PLAYER_CONFIG.HARVEST;
  sim.enqueueCommand('HARVEST', playerId, { targetTileX: 16, targetTileY: 15 });
  sim.step();

  // Step 23: Verify inventory quantity updates
  snapshot = sim.getRenderSnapshot();
  const harvestedCrop = snapshot.player?.inventory.find(s => s?.itemId === 'crop_parsnip');
  assert.ok(harvestedCrop, 'Harvested crop parsnip must be in inventory');
  assert.ok(harvestedCrop!.quantity >= 1, 'Crop quantity must be at least 1');
  assert.equal(farmTile.cropTypeId, 0, 'Crop tile should now be cleared');
  assert.equal(getEnergyDisplay(snapshot.player?.energy).current, 100 - harvestCost);

  // Step 24: Save
  const storage = new MemoryStorageDriver();
  SaveManager.save('acceptance_slot', sim, storage);
  assert.ok(storage.exists('acceptance_slot'));

  // Step 25: Reload
  const restoredSim = new WorldSimulation({ seed: 42 });
  SaveManager.load('acceptance_slot', restoredSim, storage);

  // Step 26: Verify UI matches authoritative restored state
  const restoredSnapshot = restoredSim.getRenderSnapshot();
  assert.equal(
    formatDayTime(restoredSnapshot.tick).fullDisplay,
    formatDayTime(snapshot.tick).fullDisplay,
    'Restored Day and Time UI must match saved state'
  );
  assert.equal(
    getEnergyDisplay(restoredSnapshot.player?.energy).text,
    getEnergyDisplay(snapshot.player?.energy).text,
    'Restored Energy UI must match saved state'
  );

  const restoredCrop = restoredSnapshot.player?.inventory.find(s => s?.itemId === 'crop_parsnip');
  assert.equal(restoredCrop?.quantity, harvestedCrop?.quantity, 'Restored inventory quantity must match');
});
