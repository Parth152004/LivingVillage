import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { WalletComponent } from '../../src/ecs/components/WalletComponent.js';

test('QuestSystem: Progresses quests authoritatively and allows reward claiming', () => {
  const sim = new WorldSimulation({ seed: 301 });
  FarmsteadLayout.initialize(sim);

  const quest = sim.quests.getQuests().find(q => q.id === 'quest_first_furrow')!;
  assert.equal(quest.currentCount, 0);
  assert.equal(quest.isCompleted, false);

  // Till 3 soil plots
  sim.quests.recordAction('TILL', 1);
  sim.quests.recordAction('TILL', 1);
  assert.equal(quest.currentCount, 2);
  assert.equal(quest.isCompleted, false);

  sim.quests.recordAction('TILL', 1);
  assert.equal(quest.currentCount, 3);
  assert.equal(quest.isCompleted, true);

  const wallet = sim.ecs.getComponent<WalletComponent>(sim.playerEntityId, 'Wallet')!;
  const startGold = wallet.gold;

  // Claim reward
  sim.enqueueCommand('CLAIM_QUEST', sim.playerEntityId, { payload: { questId: 'quest_first_furrow' } });
  sim.step();

  assert.equal(quest.isClaimed, true);
  assert.equal(wallet.gold, startGold + 50, 'Player wallet should have received 50 gold');
});

test('QuestSystem: Snapshot serialization and deserialization roundtrip preserves quest state', () => {
  const sim = new WorldSimulation({ seed: 302 });
  FarmsteadLayout.initialize(sim);

  sim.quests.recordAction('TILL', 2);
  sim.quests.recordAction('SOW', 1);

  const snap = sim.getSnapshot();

  const restoredSim = new WorldSimulation({ seed: 999 });
  restoredSim.restoreSnapshot(snap);

  const qTill = restoredSim.quests.getQuests().find(q => q.id === 'quest_first_furrow')!;
  const qSow = restoredSim.quests.getQuests().find(q => q.id === 'quest_spring_sowing')!;

  assert.equal(qTill.currentCount, 2);
  assert.equal(qSow.currentCount, 1);
});
