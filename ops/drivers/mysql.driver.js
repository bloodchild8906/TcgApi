// noinspection SqlNoDataSourceInspection

const mysql = require('mysql2/promise');

const {
  nowIso,
  normalizeAssignment,
  normalizeRole,
  normalizeTrade,
  serializeJson,
} = require('../ops.helpers');

let pool = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS admin_roles (
    role_id VARCHAR(191) PRIMARY KEY,
    name VARCHAR(191) NOT NULL,
    description TEXT NULL,
    permissions_json LONGTEXT NOT NULL,
    is_system TINYINT(1) NOT NULL DEFAULT 0,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_role_assignments (
    user_id VARCHAR(191) PRIMARY KEY,
    roles_json LONGTEXT NOT NULL,
    metadata_json LONGTEXT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS trade_records (
    trade_id VARCHAR(191) PRIMARY KEY,
    initiator_id VARCHAR(191) NOT NULL,
    initiator_username VARCHAR(191) NOT NULL,
    target_id VARCHAR(191) NOT NULL,
    target_username VARCHAR(191) NOT NULL,
    status VARCHAR(64) NOT NULL,
    offer_json LONGTEXT NOT NULL,
    request_json LONGTEXT NOT NULL,
    note TEXT NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    resolved_at VARCHAR(40) NULL,
    resolver_id VARCHAR(191) NULL,
    metadata_json LONGTEXT NOT NULL
  )`,
];

const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

exports.connect = async (config) => {
  pool = config.ops_db_url
    ? mysql.createPool(config.ops_db_url)
    : mysql.createPool({
      host: config.ops_db_host,
      port: Number(config.ops_db_port),
      user: config.ops_db_user,
      password: config.ops_db_pass,
      database: config.ops_db_name,
      waitForConnections: true,
      connectionLimit: 10,
      ssl: config.ops_db_ssl ? {} : undefined,
    });

  for (const statement of schemaStatements) {
    await query(statement);
  }
};

exports.close = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

exports.getStatus = () => ({
  driver: 'mysql',
  connected: Boolean(pool),
  detail: pool ? 'MySQL operational store connected' : 'MySQL operational store disconnected',
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
  const rows = await query('SELECT * FROM admin_roles WHERE role_id = ? LIMIT 1', [roleId]);
  return normalizeRole(rows[0]);
};

exports.upsertRole = async (role) => {
  const existing = await exports.getRole(role.role_id);
  const timestamp = nowIso();

  if (existing) {
    await query(
      'UPDATE admin_roles SET name = ?, description = ?, permissions_json = ?, is_system = ?, updated_at = ? WHERE role_id = ?',
      [
        role.name,
        role.description || '',
        serializeJson(role.permissions, []),
        role.is_system ? 1 : 0,
        timestamp,
        role.role_id,
      ]
    );
  } else {
    await query(
      'INSERT INTO admin_roles (role_id, name, description, permissions_json, is_system, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        role.role_id,
        role.name,
        role.description || '',
        serializeJson(role.permissions, []),
        role.is_system ? 1 : 0,
        timestamp,
        timestamp,
      ]
    );
  }

  return exports.getRole(role.role_id);
};

exports.deleteRole = async (roleId) => {
  const result = await query('DELETE FROM admin_roles WHERE role_id = ?', [roleId]);
  return result.affectedRows > 0;
};

exports.getUserRoleAssignment = async (userId) => {
  const rows = await query('SELECT * FROM admin_role_assignments WHERE user_id = ? LIMIT 1', [userId]);
  return normalizeAssignment(rows[0]);
};

exports.setUserRoleAssignment = async (userId, roleIds, metadata = {}) => {
  const existing = await exports.getUserRoleAssignment(userId);
  const timestamp = nowIso();

  if (existing) {
    await query(
      'UPDATE admin_role_assignments SET roles_json = ?, metadata_json = ?, updated_at = ? WHERE user_id = ?',
      [serializeJson(roleIds, []), serializeJson(metadata, {}), timestamp, userId]
    );
  } else {
    await query(
      'INSERT INTO admin_role_assignments (user_id, roles_json, metadata_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [userId, serializeJson(roleIds, []), serializeJson(metadata, {}), timestamp, timestamp]
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      trade.trade_id,
      trade.initiator_id,
      trade.initiator_username,
      trade.target_id,
      trade.target_username,
      trade.status,
      serializeJson(trade.offer, {}),
      serializeJson(trade.request, {}),
      trade.note || '',
      trade.created_at,
      trade.updated_at,
      trade.resolved_at || null,
      trade.resolver_id || null,
      serializeJson(trade.metadata, {}),
    ]
  );

  return exports.getTrade(trade.trade_id);
};

exports.getTrade = async (tradeId) => {
  const rows = await query('SELECT * FROM trade_records WHERE trade_id = ? LIMIT 1', [tradeId]);
  return normalizeTrade(rows[0]);
};

exports.listTrades = async (filter = {}) => {
  const conditions = [];
  const params = [];

  if (filter.status) {
    conditions.push('status = ?');
    params.push(filter.status);
  }

  if (filter.user_id) {
    conditions.push('(initiator_id = ? OR target_id = ?)');
    params.push(filter.user_id, filter.user_id);
  }

  const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : 100;
  params.push(limit);

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(`SELECT * FROM trade_records ${where} ORDER BY created_at DESC LIMIT ?`, params);
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
      status = ?, offer_json = ?, request_json = ?, note = ?, updated_at = ?, resolved_at = ?, resolver_id = ?, metadata_json = ?
      WHERE trade_id = ?`,
    [
      next.status,
      serializeJson(next.offer, {}),
      serializeJson(next.request, {}),
      next.note || '',
      next.updated_at,
      next.resolved_at || null,
      next.resolver_id || null,
      serializeJson(next.metadata, {}),
      tradeId,
    ]
  );

  return exports.getTrade(tradeId);
};
