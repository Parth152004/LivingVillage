import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { GameClient } from '../../src/client/GameClient.js';
import { LocalStorageDriver, MemoryStorageDriver } from '../../src/persistence/StorageDriver.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { WalletComponent } from '../../src/ecs/components/WalletComponent.js';

function createMockLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; }
  };
}

test('ClientPersistence: GameClient uses LocalStorageDriver in browser environment', () => {
  const mockStorage = createMockLocalStorage();
  (globalThis as any).localStorage = mockStorage;

  try {
    const sim = new WorldSimulation({ seed: 42 });
    const dummyContainer = {} as any;
    const client = new GameClient(sim, { containerElement: dummyContainer });

    assert.ok(client.storage instanceof LocalStorageDriver, 'Client must default to LocalStorageDriver when localStorage is available');
  } finally {
    delete (globalThis as any).localStorage;
  }
});

test('ClientPersistence: quickSave() persists to LocalStorage and survives browser refresh reload', () => {
  const mockStorage = createMockLocalStorage();
  (globalThis as any).localStorage = mockStorage;

  try {
    // 1. Session 1: Player plays, earns gold, mutates position
    const sim1 = new WorldSimulation({ seed: 42, initialTick: 7200 });
    const { playerEntityId } = FarmsteadLayout.initialize(sim1);

    const playerPos = sim1.ecs.getComponent<PositionComponent>(playerEntityId, 'Position')!;
    playerPos.x = 20.5;
    playerPos.y = 22.5;

    const wallet = sim1.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
    wallet.gold = 450;

    const dummyContainer = {} as any;
    const client1 = new GameClient(sim1, { containerElement: dummyContainer });

    // Quick save in session 1
    client1.quickSave();

    // Verify written to localStorage
    const savedData = mockStorage.getItem('living_village_save_quicksave_slot');
    assert.ok(savedData, 'Save data must exist in localStorage under living_village_save_quicksave_slot');

    // 2. Session 2 (Simulating page refresh: new WorldSimulation, new GameClient instance)
    const sim2 = new WorldSimulation({ seed: 999 }); // Fresh uninitialized simulation
    const client2 = new GameClient(sim2, { containerElement: dummyContainer });

    // Quick load in session 2
    client2.quickLoad();

    // 3. Verify restored state exactly matches session 1
    const snapshot2 = sim2.getRenderSnapshot();
    assert.equal(snapshot2.tick, 7200, 'Tick must be restored');
    assert.equal(snapshot2.player?.wallet.gold, 450, 'Gold must be restored');
    const playerEntity = snapshot2.entities.find(e => e.id === snapshot2.playerEntityId);
    assert.equal(playerEntity?.x, 20.5, 'Player X position must be restored');
    assert.equal(playerEntity?.y, 22.5, 'Player Y position must be restored');
  } finally {
    delete (globalThis as any).localStorage;
  }
});

test('ClientPersistence: quickLoad() handles missing save gracefully without throwing', () => {
  const storage = new MemoryStorageDriver();
  const sim = new WorldSimulation({ seed: 42 });
  const dummyContainer = {} as any;
  const client = new GameClient(sim, { containerElement: dummyContainer, storage });

  // No save exists
  let feedbackMessage = '';
  client.notifyHUD = (msg) => { feedbackMessage = msg; };

  client.quickLoad();
  assert.ok(feedbackMessage.includes('No Quick Save Found'), 'Must notify user that no save was found');
});
