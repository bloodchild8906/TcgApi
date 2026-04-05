// noinspection SqlNoDataSourceInspection

const { Pool } = require('pg');

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
    role_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NULL,
    permissions_json TEXT NOT NULL,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS admin_role_assignments (
    user_id TEXT PRIMARY KEY,
    roles_json TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS trade_records (
    trade_id TEXT PRIMARY KEY,
    initiator_id TEXT NOT NULL,
    initiator_username TEXT NOT NULL,
    target_id TEXT NOT NULL,
    target_username TEXT NOT NULL,
    status TEXT NOT NULL,
    offer_json TEXT NOT NULL,
    request_json TEXT NOT NULL,
    note TEXT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    resolved_at TEXT NULL,
    resolver_id TEXT NULL,
    metadata_json TEXT NOT NULL
  )`,
];

const query = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows;
};

exports.connect = async (config) => {
  pool = new Pool({
    connectionString: config.ops_db_url,
    ssl: config.ops_db_ssl ? { rejectUnauthorized: false } : false,
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
  driver: 'postgres',
  connected: Boolean(pool),
  detail: pool ? 'Postgres operational store connected' : 'Postgres operational store disconnected',
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
  const rows = await query('SELECT * FROM admin_roles WHERE role_id = $1 LIMIT 1', [roleId]);
  return normalizeRole(rows[0]);
};

exports.upsertRole = async (role) => {
  const timestamp = nowIso();
  await query(
    `INSERT INTO admin_roles (role_id, name, description, permissions_json, is_system, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (role_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       permissions_json = EXCLUDED.permissions_json,
       is_system = EXCLUDED.is_system,
       updated_at = EXCLUDED.updated_at`,
    [
      role.role_id,
      role.name,
      role.description || '',
      serializeJson(role.permissions, []),
      Boolean(role.is_system),
      timestamp,
      timestamp,
    ]
  );
  return exports.getRole(role.role_id);
};

exports.deleteRole = async (roleId) => {
  const rows = await query('DELETE FROM admin_roles WHERE role_id = $1 RETURNING role_id', [roleId]);
  return rows.length > 0;
};

exports.getUserRoleAssignment = async (userId) => {
  const rows = await query('SELECT * FROM admin_role_assignments WHERE user_id = $1 LIMIT 1', [userId]);
  return normalizeAssignment(rows[0]);
};

exports.setUserRoleAssignment = async (userId, roleIds, metadata = {}) => {
  const timestamp = nowIso();
  await query(
    `INSERT INTO admin_role_assignments (user_id, roles_json, metadata_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id)
     DO UPDATE SET
       roles_json = EXCLUDED.roles_json,
       metadata_json = EXCLUDED.metadata_json,
       updated_at = EXCLUDED.updated_at`,
    [userId, serializeJson(roleIds, []), serializeJson(metadata, {}), timestamp, timestamp]
  );
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
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
  const rows = await query('SELECT * FROM trade_records WHERE trade_id = $1 LIMIT 1', [tradeId]);
  return normalizeTrade(rows[0]);
};

exports.listTrades = async (filter = {}) => {
  const conditions = [];
  const params = [];
  let index = 1;

  if (filter.status) {
    conditions.push(`status = $${index}`);
    params.push(filter.status);
    index += 1;
  }

  if (filter.user_id) {
    conditions.push(`(initiator_id = $${index} OR target_id = $${index + 1})`);
    params.push(filter.user_id, filter.user_id);
    index += 2;
  }

  const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : 100;
  params.push(limit);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = await query(`SELECT * FROM trade_records ${where} ORDER BY created_at DESC LIMIT $${index}`, params);
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
      status = $1,
      offer_json = $2,
      request_json = $3,
      note = $4,
      updated_at = $5,
      resolved_at = $6,
      resolver_id = $7,
      metadata_json = $8
     WHERE trade_id = $9`,
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
