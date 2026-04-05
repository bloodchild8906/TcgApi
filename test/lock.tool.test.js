const test = require('node:test');
const assert = require('node:assert/strict');

const LockTool = require('../tools/lock.tool');

test('withLocks serializes access for the same key', async () => {
  const order = [];

  const first = LockTool.withLocks(['user-1'], async () => {
    order.push('first-start');
    await new Promise((resolve) => setTimeout(resolve, 20));
    order.push('first-end');
  });

  const second = LockTool.withLocks(['user-1'], async () => {
    order.push('second-start');
    order.push('second-end');
  });

  await Promise.all([first, second]);

  assert.deepEqual(order, ['first-start', 'first-end', 'second-start', 'second-end']);
});
