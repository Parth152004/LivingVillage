import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { GameplayUI } from '../../src/client/GameplayUI.js';
import { EnergyComponent } from '../../src/ecs/components/EnergyComponent.js';

test('SleepTransitionConsistency: Pre-sleep HUD state is frozen during initial fade to black', async () => {
  const sim = new WorldSimulation({ seed: 42, initialTick: 26400 }); // Day 1 22:00
  const player = sim.spawnPlayer(10, 10);
  const bed = sim.spawnBed(10, 11);
  sim.playerEntityId = player;
  sim.bedEntityId = bed;

  // Deplete energy to 15
  const energy = sim.ecs.getComponent<EnergyComponent>(player, 'Energy')!;
  energy.current = 15;

  // Setup DOM mocks for GameplayUI testing
  const dummyDiv = () => {
    return {
      style: { width: '', backgroundColor: '', opacity: '', display: '' },
      textContent: '',
      classList: { add: () => {}, remove: () => {} },
      querySelectorAll: () => [],
      appendChild: () => {},
      onclick: null as any
    } as any;
  };

  (globalThis as any).document = {
    getElementById: (id: string) => {
      return dummyDiv();
    }
  };

  const ui = new GameplayUI();
  ui.bindDomElements();

  const preSleepSnapshot = sim.getRenderSnapshot();
  assert.equal(preSleepSnapshot.player?.energy.current, 15);
  assert.equal(preSleepSnapshot.tick, 26400);

  // Authoritatively enqueue SLEEP command and step simulation
  sim.enqueueCommand('SLEEP', player, { targetEntityId: bed });
  sim.step();

  // Authoritative simulation is now Day 2 06:00 (tick 36000), Energy 100
  assert.equal(sim.clock.currentTick, 36000);
  assert.equal(energy.current, 100);

  const postSleepSnapshot = sim.getRenderSnapshot();
  assert.equal(postSleepSnapshot.tick, 36000);
  assert.equal(postSleepSnapshot.player?.energy.current, 100);

  // Start sleep transition passing the preSleepSnapshot
  let midTransitionReached = false;
  let transitionCompleted = false;

  ui.startSleepTransition(
    preSleepSnapshot,
    () => { midTransitionReached = true; },
    () => { transitionCompleted = true; }
  );

  // CRITICAL CHECK: While fading to black (before mid-transition callback),
  // UI update with the postSleepSnapshot MUST NOT reveal Day 2 06:00 or Energy 100.
  // It must display the frozen pre-sleep state!
  ui.update(postSleepSnapshot);

  // Verify internal display state is still locked to pre-sleep state
  const dayTimeElem = (ui as any).dayTimeElem;
  const energyTextElem = (ui as any).energyTextElem;
  assert.ok(dayTimeElem.textContent.includes('Day 1'), `Expected Day 1 while fading to black, got ${dayTimeElem.textContent}`);
  assert.ok(dayTimeElem.textContent.includes('22:00'), `Expected 22:00 while fading to black, got ${dayTimeElem.textContent}`);
  assert.ok(energyTextElem.textContent.includes('15 / 100'), `Expected 15 / 100 while fading to black, got ${energyTextElem.textContent}`);

  // Wait for mid-transition (800ms)
  await new Promise(resolve => setTimeout(resolve, 850));
  assert.equal(midTransitionReached, true, 'Mid-transition should have fired');

  // Now that screen is black, ui.update should display the new morning state
  ui.update(postSleepSnapshot);
  assert.ok(dayTimeElem.textContent.includes('Day 2'), `Expected Day 2 after fade-out, got ${dayTimeElem.textContent}`);
  assert.ok(dayTimeElem.textContent.includes('06:00'), `Expected 06:00 after fade-out, got ${dayTimeElem.textContent}`);
  assert.ok(energyTextElem.textContent.includes('100 / 100'), `Expected 100 / 100 after fade-out, got ${energyTextElem.textContent}`);

  // Clean up global mock
  delete (globalThis as any).document;
});

test('SleepTransitionConsistency: Sleep overlay NEVER advances simulation time', async () => {
  const sim = new WorldSimulation({ seed: 42, initialTick: 7200 });
  const ui = new GameplayUI();

  const tickBefore = sim.clock.currentTick;

  // Run sleep transition
  let completed = false;
  ui.startSleepTransition(undefined, undefined, () => {
    completed = true;
  });

  // Verify tick did not change
  assert.equal(sim.clock.currentTick, tickBefore, 'SimClock tick must not be modified by UI transition');

  // Even across timers
  await new Promise(resolve => setTimeout(resolve, 50));
  assert.equal(sim.clock.currentTick, tickBefore, 'SimClock tick must remain unchanged');
});
