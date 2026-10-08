import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { InputController } from '../../src/client/InputController.js';
import { GameClient } from '../../src/client/GameClient.js';

test('InputDuplication: Keyboard repeat (e.repeat = true) does not fire duplicate actions', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const input = new InputController(sim);

  let contextActionCount = 0;
  let slotSelectCount = 0;
  let inventoryToggleCount = 0;
  let quickSaveCount = 0;

  input.setCallbacks({
    onContextAction: () => contextActionCount++,
    onSelectSlot: () => slotSelectCount++,
    onToggleInventory: () => inventoryToggleCount++,
    onQuickSave: () => quickSaveCount++
  });

  const listeners: Record<string, (e: any) => void> = {};
  const mockTarget = {
    addEventListener: (type: string, fn: any) => {
      listeners[type] = fn;
    },
    removeEventListener: (type: string, fn: any) => {
      delete listeners[type];
    }
  };

  input.attach(mockTarget as any);

  // Initial keydown for 'KeyE'
  listeners['keydown']({
    code: 'KeyE',
    repeat: false,
    preventDefault: () => {}
  });
  assert.equal(contextActionCount, 1, 'Initial press of E fires context action once');

  // OS key repeat while holding 'KeyE' down
  listeners['keydown']({
    code: 'KeyE',
    repeat: true,
    preventDefault: () => {}
  });
  listeners['keydown']({
    code: 'KeyE',
    repeat: true,
    preventDefault: () => {}
  });
  assert.equal(contextActionCount, 1, 'Holding E with repeat=true MUST NOT fire duplicate context action');

  // Hotbar key repeat
  listeners['keydown']({
    code: 'Digit2',
    repeat: false,
    preventDefault: () => {}
  });
  assert.equal(slotSelectCount, 1);
  listeners['keydown']({
    code: 'Digit2',
    repeat: true,
    preventDefault: () => {}
  });
  assert.equal(slotSelectCount, 1, 'Holding Digit2 with repeat=true MUST NOT fire duplicate slot selection');

  // Inventory toggle repeat
  listeners['keydown']({
    code: 'KeyI',
    repeat: false,
    preventDefault: () => {}
  });
  assert.equal(inventoryToggleCount, 1);
  listeners['keydown']({
    code: 'KeyI',
    repeat: true,
    preventDefault: () => {}
  });
  assert.equal(inventoryToggleCount, 1, 'Holding KeyI with repeat=true MUST NOT strobe inventory toggle');

  // Space (pause toggle) repeat
  const pausedBefore = sim.isPaused;
  listeners['keydown']({
    code: 'Space',
    repeat: false,
    preventDefault: () => {}
  });
  assert.notEqual(sim.isPaused, pausedBefore, 'Initial Space toggles pause state');
  const pausedAfterFirst = sim.isPaused;
  listeners['keydown']({
    code: 'Space',
    repeat: true,
    preventDefault: () => {}
  });
  assert.equal(sim.isPaused, pausedAfterFirst, 'Holding Space with repeat=true MUST NOT strobe pause state');
});

test('InputDuplication: Sleep command cannot be accidentally submitted twice', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  const bed = sim.spawnBed(10, 11); // In reach (distance 1.0)
  sim.playerEntityId = player;
  sim.bedEntityId = bed;

  const client = new GameClient(sim, { containerElement: {} as any });

  // Rapidly trigger sleep twice (e.g. keypress + rapid click)
  client.triggerSleep();
  client.triggerSleep();

  // Inspect command queue pending commands
  const pendingCommands = sim.commands.getPendingForTick(7200);
  const sleepCommands = pendingCommands.filter(c => c.type === 'SLEEP');

  assert.equal(sleepCommands.length, 1, 'Exactly one authoritative SLEEP command should be queued');
});

test('InputDuplication: Sleep is rejected and visual overlay is not triggered when out of reach', () => {
  const sim = new WorldSimulation({ seed: 12345, initialTick: 7200 });
  const player = sim.spawnPlayer(10, 10);
  const bed = sim.spawnBed(20, 20); // Out of reach (distance ~14 tiles)
  sim.playerEntityId = player;
  sim.bedEntityId = bed;

  const client = new GameClient(sim, { containerElement: {} as any });

  client.triggerSleep();

  // Verify no command queued and UI is not in sleeping state
  const pendingCommands = sim.commands.getPendingForTick(7200);
  const sleepCommands = pendingCommands.filter(c => c.type === 'SLEEP');
  assert.equal(sleepCommands.length, 0, 'No SLEEP command should be queued when out of reach');
  assert.equal(client.ui.isSleeping, false, 'UI sleep overlay must not start when out of reach');
});
