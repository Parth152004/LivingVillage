import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { FarmsteadLayout } from '../../src/world/FarmsteadLayout.js';
import { WalletComponent } from '../../src/ecs/components/WalletComponent.js';
import { ECONOMY_CONFIG } from '../../src/economy/EconomyConfig.js';

test('Wallet: Player starts with authoritative starting gold (100g)', () => {
  const sim = new WorldSimulation({ seed: 701 });
  const { playerEntityId } = FarmsteadLayout.initialize(sim);

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet');
  assert.ok(wallet, 'Player entity must have WalletComponent');
  assert.equal(wallet.gold, ECONOMY_CONFIG.STARTING_GOLD, `Starting gold must equal ${ECONOMY_CONFIG.STARTING_GOLD}`);
  assert.equal(wallet.gold, 100, 'Starting gold must be exactly 100');
  sim.assertInvariants();
});

test('Wallet: Direct or authoritative mutations update gold and assert invariants', () => {
  const sim = new WorldSimulation({ seed: 702 });
  const { playerEntityId } = FarmsteadLayout.initialize(sim);

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  assert.equal(wallet.gold, 100);

  // Add gold
  wallet.gold += 50;
  assert.equal(wallet.gold, 150);
  sim.assertInvariants();

  // Deduct gold
  wallet.gold -= 30;
  assert.equal(wallet.gold, 120);
  sim.assertInvariants();
});

test('Wallet: Gold can never become negative, assertion fails on negative gold', () => {
  const sim = new WorldSimulation({ seed: 703 });
  const { playerEntityId } = FarmsteadLayout.initialize(sim);

  const wallet = sim.ecs.getComponent<WalletComponent>(playerEntityId, 'Wallet')!;
  
  // Set invalid negative gold to verify invariant catches it
  wallet.gold = -10;
  assert.throws(() => {
    sim.assertInvariants();
  }, /Invariant failed: Player gold invalid/);

  // Set fractional gold to verify integer invariant
  wallet.gold = 10.5;
  assert.throws(() => {
    sim.assertInvariants();
  }, /Invariant failed: Player gold invalid/);

  // Reset to valid non-negative integer
  wallet.gold = 0;
  assert.doesNotThrow(() => {
    sim.assertInvariants();
  });
});

test('Wallet: Deterministic wallet continuation across identical seeds', () => {
  const simA = new WorldSimulation({ seed: 704 });
  const simB = new WorldSimulation({ seed: 704 });

  FarmsteadLayout.initialize(simA);
  FarmsteadLayout.initialize(simB);

  const walletA = simA.ecs.getComponent<WalletComponent>(simA.playerEntityId, 'Wallet')!;
  const walletB = simB.ecs.getComponent<WalletComponent>(simB.playerEntityId, 'Wallet')!;

  assert.equal(walletA.gold, walletB.gold);

  simA.stepMany(100);
  simB.stepMany(100);

  assert.equal(walletA.gold, walletB.gold);
});
