const test = require('node:test');
const assert = require('node:assert/strict');

const SetupService = require('../setup/setup.service');

test('normalizeSetupPayload shares the gameplay store when requested', () => {
  const payload = SetupService.normalizeSetupPayload({
    game_db_driver: 'sql',
    game_db_url: 'Data Source=DEVPC;Integrated Security=True',
    jwt_secret: '1234567890abcdef',
    use_same_operations_store: true,
  });

  assert.equal(payload.game_db.driver, 'mssql');
  assert.equal(payload.ops_db.driver, 'mssql');
  assert.equal(payload.ops_db.url, payload.game_db.url);
  assert.equal(payload.admin, null);
});

test('normalizeSetupPayload rejects partial admin bootstrap data', () => {
  assert.throws(() => {
    SetupService.normalizeSetupPayload({
      admin_username: 'adminuser',
      game_db_driver: 'mongo',
      game_db_url: 'mongodb://127.0.0.1:27017/tcgengine',
      jwt_secret: '1234567890abcdef',
    });
  }, /Provide admin username, email, and password/);
});

test('buildEnvFileContents quotes complex values for dotenv output', () => {
  const output = SetupService._private.buildEnvFileContents({
    GAME_DB_URL: 'Data Source=DEVPC;Integrated Security=True;Encrypt=False',
    GAME_DB_DRIVER: 'mssql',
  });

  assert.match(output, /GAME_DB_DRIVER=mssql/);
  assert.match(output, /GAME_DB_URL="Data Source=DEVPC;Integrated Security=True;Encrypt=False"/);
});
