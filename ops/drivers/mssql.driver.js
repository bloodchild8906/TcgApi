// noinspection SqlNoDataSourceInspection

const { resolveSqlServerClient } = require('../../tools/mssql.tool');

const {
  nowIso,
  normalizeAssignment,
  normalizeRole,
  normalizeTrade,
  serializeJson,
} = require('../ops.helpers');

let pool = null;
let activeSql = null;
let runtime = 'tedious';

const schemaStatements = [
  `IF OBJECT_ID('admin_roles', 'U') IS NULL
   CREATE TABLE admin_roles (
     role_id NVARCHAR(191) PRIMARY KEY,
     name NVARCHAR(191) NOT NULL,
     description NVARCHAR(MAX) NULL,
     permissions_json NVARCHAR(MAX) NOT NULL,
     is_system BIT NOT NULL DEFAULT 0,
     created_at NVARCHAR(40) NOT NULL,
     updated_at NVARCHAR(40) NOT NULL
   )`,
  `IF OBJECT_ID('admin_role_assignments', 'U') IS NULL
   CREATE TABLE admin_role_assignments (
     user_id NVARCHAR(191) PRIMARY KEY,
     roles_json NVARCHAR(MAX) NOT NULL,
     metadata_json NVARCHAR(MAX) NOT NULL,
     created_at NVARCHAR(40) NOT NULL,
     updated_at NVARCHAR(40) NOT NULL
   )`,
  `IF OBJECT_ID('trade_records', 'U') IS NULL
   CREATE TABLE trade_records (
     trade_id NVARCHAR(191) PRIMARY KEY,
     initiator_id NVARCHAR(191) NOT NULL,
     initiator_username NVARCHAR(191) NOT NULL,
     target_id NVARCHAR(191) NOT NULL,
     target_username NVARCHAR(191) NOT NULL,
     status NVARCHAR(64) NOT NULL,
     offer_json NVARCHAR(MAX) NOT NULL,
     request_json NVARCHAR(MAX) NOT NULL,
     note NVARCHAR(MAX) NULL,
     created_at NVARCHAR(40) NOT NULL,
     updated_at NVARCHAR(40) NOT NULL,
     resolved_at NVARCHAR(40) NULL,
     resolver_id NVARCHAR(191) NULL,
     metadata_json NVARCHAR(MAX) NOT NULL
   )`,
];

const inputFromValue = (request, key, value) => {
  if (typeof value === 'boolean') {
    request.input(key, activeSql.Bit, value);
  } else if (typeof value === 'number') {
    request.input(key, activeSql.Int, value);
  } else if (value === null || value === undefined) {
    request.input(key, activeSql.NVarChar(activeSql.MAX), null);
  } else {
    request.input(key, activeSql.NVarChar(activeSql.MAX), String(value));
  }
};

const query = async (statement, params = {}) => {
  const request = pool.request();
  Object.entries(params).forEach(([key, value]) => {
    inputFromValue(request, key, value);
  });
  const result = await request.query(statement);
  return result.recordset || [];
};

exports.connect = async (config) => {
  const resolved = resolveSqlServerClient({
    connectionString: config.ops_db_url,
    server: config.ops_db_host,
    port: Number(config.ops_db_port),
    database: config.ops_db_name,
    user: config.ops_db_user || undefined,
    password: config.ops_db_pass || undefined,
    options: {
      encrypt: Boolean(config.ops_db_ssl),
      trustServerCertificate: !config.ops_db_ssl,
    },
  });

  activeSql = resolved.sql;
  runtime = resolved.runtime;

  const connectionPool = new activeSql.ConnectionPool(resolved.config);
  pool = await connectionPool.connect();

  for (const statement of schemaStatements) {
    await query(statement);
  }
};

exports.close = async () => {
  if (pool) {
    await pool.close();
    pool = null;
  }
  activeSql = null;
};

exports.getStatus = () => ({
  driver: 'mssql',
  connected: Boolean(pool),
  detail: pool ? `SQL Server operational store connected via ${runtime}` : 'SQL Server operational store disconnected',
});

exports.clearAll = async () => {
  await query('DELETE FROM admin_role_assignments');
  await query('DELETE FROM admin_roles');
  await query('DELETE FROM trade_records');
};

exports.listRoles = async () => {
  const rows = await query('SELECT * FROM admin_roles ORDER BY role_id ASC');
  return rows.map(normalizeRole);
};

exports.getRole = async (roleId) => {
  const rows = await query('SELECT TOP 1 * FROM admin_roles WHERE role_id = @role_id', { role_id: roleId });
  return normalizeRole(rows[0]);
};

exports.upsertRole = async (role) => {
  const existing = await exports.getRole(role.role_id);
  const timestamp = nowIso();

  if (existing) {
    await query(
      `UPDATE admin_roles SET
         name = @name,
         description = @description,
         permissions_json = @permissions_json,
         is_system = @is_system,
         updated_at = @updated_at
       WHERE role_id = @role_id`,
      {
        role_id: role.role_id,
        name: role.name,
        description: role.description || '',
        permissions_json: serializeJson(role.permissions, []),
        is_system: Boolean(role.is_system),
        updated_at: timestamp,
      }
    );
  } else {
    await query(
      `INSERT INTO admin_roles (role_id, name, description, permissions_json, is_system, created_at, updated_at)
       VALUES (@role_id, @name, @description, @permissions_json, @is_system, @created_at, @updated_at)`,
      {
        role_id: role.role_id,
        name: role.name,
        description: role.description || '',
        permissions_json: serializeJson(role.permissions, []),
        is_system: Boolean(role.is_system),
        created_at: timestamp,
        updated_at: timestamp,
      }
    );
  }

  return exports.getRole(role.role_id);
};

exports.deleteRole = async (roleId) => {
  const rows = await query(
    `DELETE FROM admin_roles OUTPUT DELETED.role_id WHERE role_id = @role_id`,
    { role_id: roleId }
  );
  return rows.length > 0;
};

exports.getUserRoleAssignment = async (userId) => {
  const rows = await query('SELECT TOP 1 * FROM admin_role_assignments WHERE user_id = @user_id', { user_id: userId });
  return normalizeAssignment(rows[0]);
};

exports.setUserRoleAssignment = async (userId, roleIds, metadata = {}) => {
  const existing = await exports.getUserRoleAssignment(userId);
  const timestamp = nowIso();

  if (existing) {
    await query(
      `UPDATE admin_role_assignments SET
         roles_json = @roles_json,
         metadata_json = @metadata_json,
         updated_at = @updated_at
       WHERE user_id = @user_id`,
      {
        user_id: userId,
        roles_json: serializeJson(roleIds, []),
        metadata_json: serializeJson(metadata, {}),
        updated_at: timestamp,
      }
    );
  } else {
    await query(
      `INSERT INTO admin_role_assignments (user_id, roles_json, metadata_json, created_at, updated_at)
       VALUES (@user_id, @roles_json, @metadata_json, @created_at, @updated_at)`,
      {
        user_id: userId,
        roles_json: serializeJson(roleIds, []),
        metadata_json: serializeJson(metadata, {}),
        created_at: timestamp,
        updated_at: timestamp,
      }
    );
  }

  return exports.getUserRoleAssignment(userId);
};

exports.listUserRoleAssignments = async () => {
  const rows = await query('SELECT * FROM admin_role_assignments ORDER BY user_id ASC');
  return rows.map(normalizeAssignment);
};

exports.createTrade = async (trade) => {
  await query(
    `INSERT INTO trade_records (
      trade_id, initiator_id, initiator_username, target_id, target_username, status,
      offer_json, request_json, note, created_at, updated_at, resolved_at, resolver_id, metadata_json
    ) VALUES (
      @trade_id, @initiator_id, @initiator_username, @target_id, @target_username, @status,
      @offer_json, @request_json, @note, @created_at, @updated_at, @resolved_at, @resolver_id, @metadata_json
    )`,
    {
      trade_id: trade.trade_id,
      initiator_id: trade.initiator_id,
      initiator_username: trade.initiator_username,
      target_id: trade.target_id,
      target_username: trade.target_username,
      status: trade.status,
      offer_json: serializeJson(trade.offer, {}),
      request_json: serializeJson(trade.request, {}),
      note: trade.note || '',
      created_at: trade.created_at,
      updated_at: trade.updated_at,
      resolved_at: trade.resolved_at || null,
      resolver_id: trade.resolver_id || null,
      metadata_json: serializeJson(trade.metadata, {}),
    }
  );

  return exports.getTrade(trade.trade_id);
};

exports.getTrade = async (tradeId) => {
  const rows = await query('SELECT TOP 1 * FROM trade_records WHERE trade_id = @trade_id', { trade_id: tradeId });
  return normalizeTrade(rows[0]);
};

exports.listTrades = async (filter = {}) => {
  const conditions = [];
  const params = {};

  if (filter.status) {
    conditions.push('status = @status');
    params.status = filter.status;
  }

  if (filter.user_id) {
    conditions.push('(initiator_id = @user_id OR target_id = @user_id)');
    params.user_id = filter.user_id;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(
    `SELECT TOP ${Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : 100} * FROM trade_records ${where} ORDER BY created_at DESC`,
    params
  );
  return rows.map(normalizeTrade);
};

exports.updateTrade = async (tradeId, patch) => {
  const current = await exports.getTrade(tradeId);
  if (!current) {
    return null;
  }

  const next = {
    ...current,
    ...patch,
    offer: patch.offer || current.offer,
    request: patch.request || current.request,
    metadata: patch.metadata || current.metadata,
    updated_at: nowIso(),
  };

  await query(
    `UPDATE trade_records SET
       status = @status,
       offer_json = @offer_json,
       request_json = @request_json,
       note = @note,
       updated_at = @updated_at,
       resolved_at = @resolved_at,
       resolver_id = @resolver_id,
       metadata_json = @metadata_json
     WHERE trade_id = @trade_id`,
    {
      trade_id: tradeId,
      status: next.status,
      offer_json: serializeJson(next.offer, {}),
      request_json: serializeJson(next.request, {}),
      note: next.note || '',
      updated_at: next.updated_at,
      resolved_at: next.resolved_at || null,
      resolver_id: next.resolver_id || null,
      metadata_json: serializeJson(next.metadata, {}),
    }
  );

  return exports.getTrade(tradeId);
};
