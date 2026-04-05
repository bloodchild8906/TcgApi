const RbacService = require('./rbac.service');

exports.ListRoles = async (req, res) => {
  const roles = await RbacService.listRoles();
  return res.status(200).send({
    roles,
    permissions: RbacService.PERMISSIONS,
  });
};

exports.SaveRole = async (req, res) => {
  const role = await RbacService.saveRole(req.body || {});
  return res.status(200).send(role);
};

exports.DeleteRole = async (req, res) => {
  const deleted = await RbacService.deleteRole(req.params.roleId);
  return res.status(200).send({ success: deleted });
};

exports.GetUserAccess = async (req, res) => {
  const data = await RbacService.getUserAccessById(req.params.userId);
  if (!data) {
    return res.status(404).send({ error: 'User not found' });
  }

  return res.status(200).send(data);
};

exports.SetUserRoles = async (req, res) => {
  const result = await RbacService.assignRolesToUser(
    req.params.userId,
    req.body?.roles || [],
    { actor: req.jwt.username }
  );

  return res.status(200).send(result);
};
