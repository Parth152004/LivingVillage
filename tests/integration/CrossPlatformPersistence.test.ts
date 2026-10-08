import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { WorldSimulation } from '../../src/core/WorldSimulation.js';
import { SaveManager } from '../../src/persistence/SaveManager.js';
import { NodeCryptoHasher } from '../../src/persistence/NodeCryptoHasher.js';
import { BrowserSha256Hasher } from '../../src/persistence/BrowserSha256Hasher.js';
import { NodeFsStorageDriver, MemoryStorageDriver, LocalStorageDriver } from '../../src/persistence/StorageDriver.js';
import { TILE_FLAGS } from '../../src/world/ChunkGrid.js';

test('CrossPlatformPersistence: NIST standard SHA-256 test vectors match in both hashers', () => {
  const nodeHasher = new NodeCryptoHasher();
  const browserHasher = new BrowserSha256Hasher();

  const nistVectors = [
    {
      input: '',
      expected: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    },
    {
      input: 'abc',
      expected: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    },
    {
      input: 'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      expected: '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'
    }
  ];

  for (const { input, expected } of nistVectors) {
    const nodeDigest = nodeHasher.hash(input);
    const browserDigest = browserHasher.hash(input);

    assert.equal(nodeDigest, expected, `NodeCryptoHasher digest mismatch for "${input}"`);
    assert.equal(browserDigest, expected, `BrowserSha256Hasher digest mismatch for "${input}"`);
    assert.equal(nodeDigest, browserDigest, `Hashers must produce identical digest for "${input}"`);
  }
});

test('CrossPlatformPersistence: Node and Browser hashers produce identical digests across diverse inputs', () => {
  const nodeHasher = new NodeCryptoHasher();
  const browserHasher = new BrowserSha256Hasher();

  const testPayloads = [
    'LivingVillage',
    '{"tick":100,"entities":[{"id":1,"pos":{"x":12.5,"y":18.2}}]}',
    '🌾🚜🌻 Multibyte Unicode characters: 日本語, 한국어, Español, العربية, Русский',
    'x'.repeat(128),
    'y'.repeat(1024),
    JSON.stringify({
      worldSeed: 987654321,
      chunks: Array.from({ length: 1024 }, (_, i) => ({ id: i, type: i % 5 }))
    })
  ];

  for (const payload of testPayloads) {
    const nodeHash = nodeHasher.hash(payload);
    const browserHash = browserHasher.hash(payload);

    assert.equal(nodeHash.length, 64, 'Digest must be exactly 64 hex characters');
    assert.equal(browserHash.length, 64, 'Digest must be exactly 64 hex characters');
    assert.equal(nodeHash, browserHash, `Digest mismatch for payload of length ${payload.length}`);
  }
});

test('CrossPlatformPersistence: Node save -> load -> checksum verification with NodeCryptoHasher and NodeFsStorageDriver', () => {
  const sim = new WorldSimulation({ seed: 777 });
  sim.spawnPlayer(15, 20);
  sim.step();
  sim.step();

  const testSaveDir = path.resolve(process.cwd(), 'tests', 'fixtures');
  const testSavePath = path.join(testSaveDir, 'node_crypto_test_save.json');

  try {
    // Configure Node-specific hasher and driver
    SaveManager.setHasher(new NodeCryptoHasher());
    const nodeDriver = new NodeFsStorageDriver();

    // Save
    SaveManager.save(testSavePath, sim, nodeDriver);
    assert.ok(fs.existsSync(testSavePath), 'Save file must exist on disk');

    // Load into fresh simulation instance
    const restoredSim = new WorldSimulation({ seed: 1 });
    SaveManager.load(testSavePath, restoredSim, nodeDriver);

    // Verify state fidelity
    assert.equal(restoredSim.clock.currentTick, sim.clock.currentTick);
    assert.equal(restoredSim.playerEntityId, sim.playerEntityId);

    const origPlayer = sim.ecs.getComponent(sim.playerEntityId!, 'Position');
    const restoredPlayer = restoredSim.ecs.getComponent(restoredSim.playerEntityId!, 'Position');
    assert.deepEqual(restoredPlayer, origPlayer);
  } finally {
    // Clean up
    if (fs.existsSync(testSavePath)) {
      fs.unlinkSync(testSavePath);
    }
  }
});

test('CrossPlatformPersistence: Browser save -> load -> checksum verification with BrowserSha256Hasher and MemoryStorageDriver', () => {
  const sim = new WorldSimulation({ seed: 888 });
  sim.spawnPlayer(5, 8);
  for (let i = 0; i < 5; i++) {
    sim.step();
  }

  // Configure Browser-compatible hasher and driver
  SaveManager.setHasher(new BrowserSha256Hasher());
  const memoryDriver = new MemoryStorageDriver();

  SaveManager.save('browser_slot_1', sim, memoryDriver);
  assert.ok(memoryDriver.exists('browser_slot_1'), 'Slot must exist in memory driver');

  const restoredSim = new WorldSimulation({ seed: 999 });
  SaveManager.load('browser_slot_1', restoredSim, memoryDriver);

  assert.equal(restoredSim.clock.currentTick, 5);
  assert.equal(restoredSim.playerEntityId, sim.playerEntityId);

  const origPlayerPos = sim.ecs.getComponent(sim.playerEntityId!, 'Position');
  const restoredPlayerPos = restoredSim.ecs.getComponent(restoredSim.playerEntityId!, 'Position');
  assert.deepEqual(restoredPlayerPos, origPlayerPos);
});

test('CrossPlatformPersistence: Cross-platform interoperability (Save in Node -> Load in Browser, and vice versa)', () => {
  const simA = new WorldSimulation({ seed: 10101 });
  simA.spawnPlayer(12, 14);
  simA.step();

  // 1. Save using NodeCryptoHasher
  SaveManager.setHasher(new NodeCryptoHasher());
  const serializedByNode = SaveManager.serialize(simA);

  // 2. Deserialize using BrowserSha256Hasher
  SaveManager.setHasher(new BrowserSha256Hasher());
  const snapshotInBrowser = SaveManager.deserialize(serializedByNode);

  const simB = new WorldSimulation({ seed: 1 });
  simB.restoreSnapshot(snapshotInBrowser);
  assert.equal(simB.clock.currentTick, simA.clock.currentTick);
  assert.equal(simB.playerEntityId, simA.playerEntityId);

  // 3. Save using BrowserSha256Hasher
  const serializedByBrowser = SaveManager.serialize(simB);

  // 4. Deserialize using NodeCryptoHasher
  SaveManager.setHasher(new NodeCryptoHasher());
  const snapshotInNode = SaveManager.deserialize(serializedByBrowser);

  const simC = new WorldSimulation({ seed: 2 });
  simC.restoreSnapshot(snapshotInNode);
  assert.equal(simC.clock.currentTick, simA.clock.currentTick);
  assert.equal(simC.playerEntityId, simA.playerEntityId);
});

test('CrossPlatformPersistence: Tampered save is rejected regardless of active hasher', () => {
  const sim = new WorldSimulation({ seed: 42 });
  sim.spawnPlayer(10, 10);
  sim.step();

  for (const hasher of [new NodeCryptoHasher(), new BrowserSha256Hasher()]) {
    SaveManager.setHasher(hasher);
    const validSerialized = SaveManager.serialize(sim);
    const parsed = JSON.parse(validSerialized);

    // Tamper with snapshot tick
    const tamperedPayload = JSON.parse(JSON.stringify(parsed));
    tamperedPayload.snapshot.clock.currentTick += 999;

    assert.throws(
      () => SaveManager.deserialize(JSON.stringify(tamperedPayload)),
      /Checksum verification failed/,
      `Hasher ${hasher.constructor.name} must reject tampered snapshot payload`
    );

    // Tamper with checksum string itself
    const tamperedChecksum = JSON.parse(JSON.stringify(parsed));
    tamperedChecksum.metadata.checksum = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    assert.throws(
      () => SaveManager.deserialize(JSON.stringify(tamperedChecksum)),
      /Checksum verification failed/,
      `Hasher ${hasher.constructor.name} must reject invalid checksum metadata`
    );
  }
});

test('CrossPlatformPersistence: Save/load preserves player state, entity ID, and chunk tiles', () => {
  const sim = new WorldSimulation({ seed: 555 });
  // Set custom tile
  sim.chunks.setTile(2, 3, { terrainType: 2, flags: TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED });
  const playerId = sim.spawnPlayer(2, 3);
  sim.step();

  SaveManager.setHasher(new BrowserSha256Hasher());
  const memoryDriver = new MemoryStorageDriver();
  SaveManager.save('test_player_preservation', sim, memoryDriver);

  const restoredSim = new WorldSimulation({ seed: 1 });
  SaveManager.load('test_player_preservation', restoredSim, memoryDriver);

  // Check tile
  const tile = restoredSim.chunks.getTile(2, 3);
  assert.equal(tile.terrainType, 2);
  assert.equal(tile.flags, TILE_FLAGS.WALKABLE | TILE_FLAGS.TILLED);

  // Check player
  assert.equal(restoredSim.playerEntityId, playerId);
  const pos = restoredSim.ecs.getComponent(playerId, 'Position');
  assert.equal(pos?.x, 2.5);
  assert.equal(pos?.y, 3.5);

  const renderSnapshot = restoredSim.getRenderSnapshot(0.0);
  assert.equal(renderSnapshot.playerEntityId, playerId);
  assert.equal(renderSnapshot.entities[0]?.x, 2.5);
  assert.equal(renderSnapshot.entities[0]?.y, 3.5);
});

test('CrossPlatformPersistence: Corrupted JSON or unsupported versions throw descriptive errors', () => {
  assert.throws(
    () => SaveManager.deserialize('not a json string'),
    /Corrupted save file: Invalid JSON syntax/
  );

  assert.throws(
    () => SaveManager.deserialize('{"metadata": {"saveVersion": 999}, "snapshot": {}}'),
    /Unsupported save version: 999/
  );

  assert.throws(
    () => SaveManager.deserialize('{"only": "partial"}'),
    /Missing required metadata or snapshot payload/
  );
});
