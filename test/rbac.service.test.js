const test = require('node:test');
const assert = require('node:assert/strict');

const RbacService = require('../rbac/rbac.service');

test('hasPermission accepts exact matches', () => {
  assert.equal(RbacService.hasPermission({ permissions: ['admin.dashboard.read'] }, 'admin.dashboard.read'), true);
});

test('hasPermission accepts wildcard permissions', () => {
  assert.equal(RbacService.hasPermission({ permissions: ['admin.roles.*'] }, 'admin.roles.manage'), true);
  assert.equal(RbacService.hasPermission({ permissions: ['*'] }, 'admin.rcon.use'), true);
});

test('hasPermission rejects unrelated permissions', () => {
  assert.equal(RbacService.hasPermission({ permissions: ['admin.audit.read'] }, 'admin.content.manage'), false);
});
