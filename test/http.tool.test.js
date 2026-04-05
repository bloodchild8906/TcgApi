const test = require('node:test');
const assert = require('node:assert/strict');

const HttpTool = require('../tools/http.tool');

test('getAuthorizationToken returns bare token when Bearer prefix is used', () => {
  const token = HttpTool.getAuthorizationToken({
    headers: {
      authorization: 'Bearer example-token',
    },
  });

  assert.equal(token, 'example-token');
});

test('getAuthorizationToken returns legacy raw authorization header', () => {
  const token = HttpTool.getAuthorizationToken({
    headers: {
      authorization: 'legacy-token',
    },
  });

  assert.equal(token, 'legacy-token');
});

test('wrap forwards rejected async handlers to next', async () => {
  const [handler] = HttpTool.wrap([
    async () => {
      throw new Error('boom');
    },
  ]);

  await new Promise((resolve) => {
    handler({}, {}, (error) => {
      assert.equal(error.message, 'boom');
      resolve();
    });
  });
});
