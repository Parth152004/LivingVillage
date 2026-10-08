import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandQueue } from '../../src/core/Commands.js';

test('CommandQueue: validates, queues, and retrieves commands by tick', () => {
  const queue = new CommandQueue();

  // Invalid command rejected
  const invalidResult = queue.enqueue(-1, 'MOVE', 1);
  assert.equal(invalidResult.result.isValid, false);

  const invalidIssuer = queue.enqueue(0, 'MOVE', -5);
  assert.equal(invalidIssuer.result.isValid, false);

  // Valid commands
  const c1 = queue.enqueue(10, 'MOVE', 1, { targetTileX: 5, targetTileY: 6 });
  assert.equal(c1.result.isValid, true);
  assert.ok(c1.commandId > 0);

  const c2 = queue.enqueue(12, 'INTERACT', 1, { targetEntityId: 2 });
  assert.equal(c2.result.isValid, true);

  assert.equal(queue.pendingCount, 2);

  // At tick 9, nothing ready
  assert.equal(queue.getPendingForTick(9).length, 0);

  // At tick 10, c1 ready
  const ready10 = queue.getPendingForTick(10);
  assert.equal(ready10.length, 1);
  assert.equal(ready10[0]!.commandId, c1.commandId);

  // At tick 12, both ready
  const ready12 = queue.getPendingForTick(12);
  assert.equal(ready12.length, 2);

  // Remove processed c1
  queue.removeProcessed(new Set([c1.commandId]));
  assert.equal(queue.pendingCount, 1);
  assert.equal(queue.getPendingForTick(12).length, 1);
});

test('CommandQueue: executes registered handler', () => {
  const queue = new CommandQueue();
  let executed = false;

  queue.registerHandler('TEST_COMMAND', (cmd, context) => {
    assert.equal(cmd.issuerEntityId, 42);
    assert.equal(context.value, 100);
    executed = true;
    return true;
  });

  const cmdResult = queue.enqueue(0, 'TEST_COMMAND', 42);
  const pending = queue.getPendingForTick(0);
  assert.equal(pending.length, 1);

  const success = queue.execute(pending[0]!, { value: 100 });
  assert.equal(success, true);
  assert.equal(executed, true);
});
