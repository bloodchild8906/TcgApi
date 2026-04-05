const AuthTool = require('../authorization/auth.tool');
const HttpTool = require('../tools/http.tool');
const RbacController = require('./rbac.controller');

exports.route = function (app) {
  app.get('/admin/roles', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.roles.read'),
    RbacController.ListRoles,
  ]));

  app.post('/admin/roles', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.roles.manage'),
    RbacController.SaveRole,
  ]));

  app.delete('/admin/roles/:roleId', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.roles.manage'),
    RbacController.DeleteRole,
  ]));

  app.get('/admin/users/:userId/access', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.roles.read'),
    RbacController.GetUserAccess,
  ]));

  app.post('/admin/users/:userId/roles', ...HttpTool.wrap([
    AuthTool.isValidJWT,
    AuthTool.isAdminPermission('admin.roles.manage'),
    RbacController.SetUserRoles,
  ]));
};
