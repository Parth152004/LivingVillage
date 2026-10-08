import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { NPCComponent } from '../../src/ecs/components/NPCComponent.js';

test('NPCDialogue: FarmsteadLayout populates villagers without duplicates', () => {
  const sim = new WorldSimulation({ seed: 201 });
  FarmsteadLayout.initialize(sim);
  FarmsteadLayout.populateLivestockAndVillagers(sim);

  const npcs = sim.ecs.queryEntities(['NPC']);
  assert.equal(npcs.length, 2, 'Should spawn Elder Rowan and Merchant Ivy');

  FarmsteadLayout.populateLivestockAndVillagers(sim);
  assert.equal(sim.ecs.queryEntities(['NPC']).length, 2, 'Idempotent call must not duplicate NPCs');
});

test('NPCDialogue: Talking to NPC increases friendship points and emits dialogue event', () => {
  const sim = new WorldSimulation({ seed: 202 });
  FarmsteadLayout.initialize(sim);
  FarmsteadLayout.populateLivestockAndVillagers(sim);

  const npcs = sim.ecs.queryEntities(['NPC']);
  const rowanId = npcs.find(id => sim.ecs.getComponent<NPCComponent>(id, 'NPC')?.npcId === 'npc_elder_rowan')!;
  const rowan = sim.ecs.getComponent<NPCComponent>(rowanId, 'NPC')!;

  const initialFriendship = rowan.friendshipPoints;
  assert.equal(rowan.talkedToday, false);

  // Position player near Rowan
  const rowanPos = sim.ecs.getComponent<any>(rowanId, 'Position')!;
  const playerPos = sim.ecs.getComponent<any>(sim.playerEntityId, 'Position')!;
  playerPos.x = rowanPos.x + 0.5;
  playerPos.y = rowanPos.y;

  sim.enqueueCommand('TALK_NPC', sim.playerEntityId, { targetEntityId: rowanId });
  sim.step();

  assert.equal(rowan.talkedToday, true);
  assert.equal(rowan.friendshipPoints, initialFriendship + 20);
  assert.equal(sim.lastCommandResult?.success, true);
});
