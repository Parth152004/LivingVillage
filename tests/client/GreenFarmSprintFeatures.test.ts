import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { GameplayUI } from '../../src/client/GameplayUI.js';
import { InputController } from '../../src/client/InputController.js';
import { audioManager } from '../../src/client/AudioSystem.js';
import { AnimalComponent } from '../../src/ecs/components/AnimalComponent.js';
import { NPCComponent } from '../../src/ecs/components/NPCComponent.js';
import { PositionComponent } from '../../src/ecs/components/PositionComponent.js';
import { ShippingBinComponent } from '../../src/ecs/components/ShippingBinComponent.js';
import { getSeedBuyPrice, getCropSellPrice, isShippableItem } from '../../src/economy/EconomyConfig.js';
import { CropRegistry } from '../../src/farming/CropRegistry.js';

function createDummyDomElement(): any {
  const children: any[] = [];
  const el = {
    style: { display: 'none', width: '', opacity: '', color: '' },
    textContent: '',
    innerHTML: '',
    disabled: false,
    dataset: {} as Record<string, string>,
    appendChild: (child: any) => { children.push(child); return child; },
    querySelectorAll: () => children,
    addEventListener: () => {},
    removeEventListener: () => {},
    onclick: null as any
  };
  return el;
}

test('Mobile Controls: virtual joystick and action cluster triggers', () => {
  const sim = new WorldSimulation({ seed: 42 });
  sim.spawnPlayer(16, 16);
  const input = new InputController(sim);
  
  // Set joystick direction and update
  input.setTouchJoystick(0.6, -0.8);
  input.update();

  const queued = (sim as any).commands.getPendingForTick(sim.clock.currentTick);
  assert(queued.length > 0, 'MOVE command should be queued from joystick input');
  assert.equal(queued[0].type, 'MOVE');
  assert(Math.abs(queued[0].payload.dx - 0.6) < 0.001);
  assert(Math.abs(queued[0].payload.dy - (-0.8)) < 0.001);

  // Clear joystick
  input.setTouchJoystick(0, 0);

  // Action cluster callbacks
  let contextFired = false;
  let consumeFired = false;
  let invFired = false;

  input.setCallbacks({
    onContextAction: () => { contextFired = true; },
    onConsumeAction: () => { consumeFired = true; },
    onToggleInventory: () => { invFired = true; }
  });

  input.triggerContextAction();
  input.triggerConsumeAction();
  input.triggerToggleInventory();

  assert.equal(contextFired, true);
  assert.equal(consumeFired, true);
  assert.equal(invFired, true);
});

test('Procedural Audio: sound manager toggles and handles synthesis without errors', () => {
  const initialMuted = audioManager.muted;
  const toggled = audioManager.toggleMute();
  assert.equal(toggled, !initialMuted);
  assert.equal(audioManager.muted, !initialMuted);
  
  // Revert mute
  audioManager.toggleMute();
  assert.equal(audioManager.muted, initialMuted);

  // Calling sound triggers should be safe even in node environment (no AudioContext)
  assert.doesNotThrow(() => {
    audioManager.playClick();
    audioManager.playTill();
    audioManager.playSow();
    audioManager.playWater();
    audioManager.playHarvest();
    audioManager.playCoin();
    audioManager.playSleep();
  });
});

test('NPC Dialogue Modal: open, populate, and close lifecycle', () => {
  const domMap: Record<string, any> = {
    'dialogue-modal': createDummyDomElement(),
    'dialogue-avatar': createDummyDomElement(),
    'dialogue-name': createDummyDomElement(),
    'dialogue-title': createDummyDomElement(),
    'dialogue-body': createDummyDomElement(),
    'dialogue-close-btn': createDummyDomElement()
  };

  (globalThis as any).document = {
    getElementById: (id: string) => domMap[id] ?? createDummyDomElement(),
    createElement: () => createDummyDomElement()
  };

  const ui = new GameplayUI();
  ui.bindDomElements();

  assert.equal(ui.isDialogueOpen, false);
  assert.equal(ui.isModalOpen, false);

  ui.openDialogue({
    npcId: 'elder_rowan',
    name: 'Elder Rowan',
    title: 'Village Elder',
    role: 'Elder',
    portraitIcon: '👴',
    text: 'May your harvest be bountiful this season!'
  });

  assert.equal(ui.isDialogueOpen, true);
  assert.equal(ui.isModalOpen, true);
  assert.equal(domMap['dialogue-name'].textContent, 'Elder Rowan');
  assert.equal(domMap['dialogue-title'].textContent, 'Village Elder');
  assert.equal(domMap['dialogue-body'].textContent, 'May your harvest be bountiful this season!');
  assert.equal(domMap['dialogue-modal'].style.display, 'block');

  ui.closeDialogue();
  assert.equal(ui.isDialogueOpen, false);
  assert.equal(ui.isModalOpen, false);
  assert.equal(domMap['dialogue-modal'].style.display, 'none');
});

test('Quest Journal Modal: display 6 starter quests and reward claiming', () => {
  const questsListContainer = createDummyDomElement();
  const questsModal = createDummyDomElement();
  const domMap: Record<string, any> = {
    'quests-modal': questsModal,
    'quests-list-container': questsListContainer,
    'quests-close-btn': createDummyDomElement()
  };

  (globalThis as any).document = {
    getElementById: (id: string) => domMap[id] ?? createDummyDomElement(),
    createElement: () => createDummyDomElement()
  };

  const ui = new GameplayUI();
  ui.bindDomElements();

  const sim = new WorldSimulation({ seed: 42 });
  const snapshot = sim.getRenderSnapshot();

  assert(snapshot.quests !== undefined);
  assert.equal(snapshot.quests.length, 6);

  let claimedQuestId = '';
  ui.setCallbacks({
    onClaimQuest: (id) => { claimedQuestId = id; }
  });

  ui.openQuests(snapshot);
  assert.equal(ui.isQuestsOpen, true);
  assert.equal(ui.isModalOpen, true);
  assert.equal(questsModal.style.display, 'block');

  ui.closeQuests();
  assert.equal(ui.isQuestsOpen, false);
  assert.equal(ui.isModalOpen, false);
  assert.equal(questsModal.style.display, 'none');
});

test('Livestock & Villagers: population, petting, dialogue, and produce generation', () => {
  const sim = new WorldSimulation({ seed: 42 });
  FarmsteadLayout.initialize(sim);
  FarmsteadLayout.populateLivestockAndVillagers(sim);

  const snapshot = sim.getRenderSnapshot();
  const animals = snapshot.entities.filter(e => e.kind === 'animal');
  const npcs = snapshot.entities.filter(e => e.kind === 'npc');

  assert.equal(animals.length, 3, 'Should have 2 chickens and 1 cow');
  assert.equal(npcs.length, 2, 'Should have Elder Rowan and Merchant Ivy');

  // Idempotent test
  FarmsteadLayout.populateLivestockAndVillagers(sim);
  assert.equal(sim.getRenderSnapshot().entities.filter(e => e.kind === 'animal').length, 3);

  // Find Daisy the Cow
  const cowEntity = animals.find(a => a.name === 'Daisy')!;
  assert(cowEntity !== undefined);
  const cowComp = sim.ecs.getComponent<AnimalComponent>(cowEntity.id, 'Animal')!;
  assert.equal(cowComp.species, 'cow');
  assert.equal(cowComp.pettedToday, false);

  // Position player next to Daisy
  const cowPos = sim.ecs.getComponent<PositionComponent>(cowEntity.id, 'Position')!;
  const playerPos = sim.ecs.getComponent<PositionComponent>(sim.playerEntityId, 'Position')!;
  playerPos.x = cowPos.x;
  playerPos.y = cowPos.y;

  // Pet Daisy
  sim.enqueueCommand('PET_ANIMAL', sim.playerEntityId, { targetEntityId: cowEntity.id });
  sim.step();

  assert.equal(sim.lastCommandResult?.success, true);
  assert.equal(cowComp.pettedToday, true);
  assert(cowComp.happiness > 80);

  // Find Rowan the NPC and position player next to Rowan
  const rowanEntity = npcs.find(n => n.name === 'Elder Rowan')!;
  assert(rowanEntity !== undefined);
  const npcComp = sim.ecs.getComponent<NPCComponent>(rowanEntity.id, 'NPC')!;
  const rowanPos = sim.ecs.getComponent<PositionComponent>(rowanEntity.id, 'Position')!;
  assert.equal(npcComp.talkedToday, false);

  playerPos.x = rowanPos.x;
  playerPos.y = rowanPos.y;

  // Talk to Rowan
  sim.enqueueCommand('TALK_NPC', sim.playerEntityId, { targetEntityId: rowanEntity.id });
  sim.step();

  assert.equal(npcComp.talkedToday, true);
  assert.equal(npcComp.friendshipPoints, 270); // 250 base + 20 talked

  // Move back to bed and sleep to trigger dawn settlement
  playerPos.x = 12.5;
  playerPos.y = 12.5;
  sim.enqueueCommand('SLEEP', sim.playerEntityId, { bedEntityId: sim.bedEntityId });
  sim.step();

  assert.equal(cowComp.pettedToday, false, 'Dawn resets pettedToday');
  assert.equal(cowComp.producedToday, true, 'Happy cow produces milk at dawn');
});

test('Expanded Agronomy & Economy: Carrot, Tomato, and livestock produce pricing', () => {
  assert.equal(getSeedBuyPrice('seed_carrot'), 25);
  assert.equal(getSeedBuyPrice('seed_tomato'), 50);
  assert.equal(getCropSellPrice('crop_carrot'), 45);
  assert.equal(getCropSellPrice('crop_tomato'), 60);
  assert.equal(getCropSellPrice('product_egg'), 40);
  assert.equal(getCropSellPrice('product_milk'), 85);
  assert.equal(isShippableItem('product_milk'), true);
  assert.equal(isShippableItem('product_egg'), true);

  assert(CropRegistry.get(4) !== undefined, 'Carrot registered');
  assert(CropRegistry.get(5) !== undefined, 'Tomato registered');

  const sim = new WorldSimulation({ seed: 42, initialTick: 7200 });
  FarmsteadLayout.initialize(sim);

  // Deposit milk and egg into shipping bin
  const shippingBinId = sim.shippingBinEntityId;
  const bin = sim.ecs.getComponent<ShippingBinComponent>(shippingBinId, 'ShippingBin')!;
  bin.items.push({ itemId: 'product_milk', quantity: 2 });
  bin.items.push({ itemId: 'product_egg', quantity: 3 });

  const snapshot = sim.getRenderSnapshot();
  // 2 milk * 85 = 170; 3 egg * 40 = 120 -> total 290g
  assert.equal(snapshot.shippingBin?.estimatedRevenue, 290);
});
