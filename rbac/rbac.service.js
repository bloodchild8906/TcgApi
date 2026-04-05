const config = require('../config');
const OpsStore = require('../ops/ops.store');
const UserModel = require('../users/users.model');
const HttpTool = require('../tools/http.tool');

const BUILTIN_ROLES = [
  {
    role_id: 'super-admin',
    name: 'Super Admin',
    description: 'Full administrative access.',
    permissions: ['*'],
    is_system: true,
  },
  {
    role_id: 'ops-admin',
    name: 'Operations Admin',
    description: 'Monitoring, audit, realtime, and RCON access.',
    permissions: [
      'admin.dashboard.read',
      'admin.audit.read',
      'admin.games.manage',
      'admin.market.manage',
      'admin.trades.manage',
      'admin.roles.read',
      'admin.ws.observe',
      'admin.rcon.use',
      'admin.system.broadcast',
    ],
    is_system: true,
  },
  {
    role_id: 'content-admin',
    name: 'Content Admin',
    description: 'Catalog and reward management.',
    permissions: [
      'admin.dashboard.read',
      'admin.content.manage',
      'admin.game_flows.manage',
      'admin.roles.read',
    ],
    is_system: true,
  },
  {
    role_id: 'support-admin',
    name: 'Support Admin',
    description: 'User, audit, and trade support operations.',
    permissions: [
      'admin.dashboard.read',
      'admin.users.manage',
      'admin.games.manage',
      'admin.market.manage',
      'admin.audit.read',
      'admin.trades.manage',
      'admin.roles.read',
    ],
    is_system: true,
  },
  {
    role_id: 'security-admin',
    name: 'Security Admin',
    description: 'RBAC and privileged system operations.',
    permissions: [
      'admin.dashboard.read',
      'admin.roles.read',
      'admin.roles.manage',
      'admin.rcon.use',
      'admin.ws.observe',
      'admin.system.email',
      'admin.system.broadcast',
      'admin.system.reset',
    ],
    is_system: true,
  },
];

const PERMISSIONS = [
  'admin.dashboard.read',
  'admin.audit.read',
  'admin.users.manage',
  'admin.games.manage',
  'admin.market.manage',
  'admin.content.manage',
  'admin.game_flows.manage',
  'admin.trades.manage',
  'admin.roles.read',
  'admin.roles.manage',
  'admin.system.email',
  'admin.system.broadcast',
  'admin.system.reset',
  'admin.ws.observe',
  'admin.rcon.use',
];

let seedPromise = null;

const normalizeUserRef = (userLike) => ({
  userId: userLike?.userId || userLike?.id || '',
  username: userLike?.username || '',
  permission_level: Number.parseInt(userLike?.permission_level ?? 0, 10) || 0,
});

const uniqueStrings = (values) => Array.from(new Set(
  (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean)
));

const permissionMatches = (grantedPermission, requiredPermission) => {
  if (!grantedPermission) {
    return false;
  }

  if (grantedPermission === '*') {
    return true;
  }

  if (grantedPermission === requiredPermission) {
    return true;
  }

  if (grantedPermission.endsWith('*')) {
    return requiredPermission.startsWith(grantedPermission.slice(0, -1));
  }

  return false;
};

const seedBuiltins = async () => {
  if (!seedPromise) {
    seedPromise = (async () => {
      for (const role of BUILTIN_ROLES) {
        await OpsStore.upsertRole(role);
      }
    })().catch((error) => {
      seedPromise = null;
      throw error;
    });
  }

  await seedPromise;
};

const getResolvedRoles = async (roleIds) => {
  const resolved = [];
  for (const roleId of uniqueStrings(roleIds)) {
    const role = await OpsStore.getRole(roleId);
    if (role) {
      resolved.push(role);
    }
  }
  return resolved;
};

exports.PERMISSIONS = PERMISSIONS;
exports.BUILTIN_ROLES = BUILTIN_ROLES;
exports.seedBuiltins = seedBuiltins;

exports.hasPermission = (access, requiredPermission) => {
  if (!requiredPermission) {
    return true;
  }

  return (access.permissions || []).some((grantedPermission) => permissionMatches(grantedPermission, requiredPermission));
};

exports.getUserAccess = async (userLike) => {
  await seedBuiltins();

  const user = normalizeUserRef(userLike);
  const isAdmin = user.permission_level >= config.permissions.ADMIN;
  const assignment = user.userId ? await OpsStore.getUserRoleAssignment(user.userId) : null;
  const roleIds = uniqueStrings(assignment?.roles || []);
  const roles = await getResolvedRoles(roleIds);
  const permissions = new Set();

  roles.forEach((role) => {
    (role.permissions || []).forEach((permission) => permissions.add(permission));
  });

  if (isAdmin && roles.length === 0 && config.rbac_legacy_admin_fallback) {
    permissions.add('*');
  }

  return {
    user_id: user.userId,
    username: user.username,
    is_admin: isAdmin,
    role_ids: roleIds,
    roles,
    permissions: Array.from(permissions),
    assignment: assignment || {
      user_id: user.userId,
      roles: [],
      metadata: {},
      created_at: null,
      updated_at: null,
    },
    legacy_admin_fallback: isAdmin && roles.length === 0 && config.rbac_legacy_admin_fallback,
  };
};

exports.getUserAccessById = async (userId) => {
  const user = await UserModel.getById(userId);
  if (!user) {
    return null;
  }

  const access = await exports.getUserAccess({
    id: user.id,
    username: user.username,
    permission_level: user.permission_level,
  });

  return {
    user: user.deleteSecrets(),
    access,
  };
};

exports.listRoles = async () => {
  await seedBuiltins();
  return OpsStore.listRoles();
};

exports.saveRole = async (roleData) => {
  await seedBuiltins();

  const role = {
    role_id: String(roleData.role_id || '').trim(),
    name: String(roleData.name || roleData.role_id || '').trim(),
    description: String(roleData.description || '').trim(),
    permissions: uniqueStrings(roleData.permissions),
    is_system: Boolean(roleData.is_system),
  };

  if (!role.role_id) {
    throw HttpTool.createError(400, 'role_id is required');
  }

  if (!role.name) {
    throw HttpTool.createError(400, 'name is required');
  }

  return OpsStore.upsertRole(role);
};

exports.deleteRole = async (roleId) => {
  await seedBuiltins();
  const role = await OpsStore.getRole(roleId);
  if (!role) {
    return false;
  }

  if (role.is_system) {
    throw HttpTool.createError(400, 'System roles cannot be deleted');
  }

  const assignments = await OpsStore.listUserRoleAssignments();
  for (const assignment of assignments) {
    const nextRoles = assignment.roles.filter((item) => item !== roleId);
    if (nextRoles.length !== assignment.roles.length) {
      await OpsStore.setUserRoleAssignment(assignment.user_id, nextRoles, assignment.metadata || {});
    }
  }

  return OpsStore.deleteRole(roleId);
};

exports.assignRolesToUser = async (userId, roleIds, metadata = {}) => {
  await seedBuiltins();

  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, `User not found: ${userId}`);
  }

  if (user.permission_level < config.permissions.ADMIN) {
    throw HttpTool.createError(400, 'RBAC roles can only be assigned to admin users');
  }

  const normalizedRoleIds = uniqueStrings(roleIds);
  const resolvedRoles = await getResolvedRoles(normalizedRoleIds);

  if (resolvedRoles.length !== normalizedRoleIds.length) {
    throw HttpTool.createError(400, 'One or more roles do not exist');
  }

  const assignment = await OpsStore.setUserRoleAssignment(user.id, normalizedRoleIds, metadata);
  return {
    assignment,
    access: await exports.getUserAccess({
      id: user.id,
      username: user.username,
      permission_level: user.permission_level,
    }),
  };
};
