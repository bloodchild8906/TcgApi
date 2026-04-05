const serializeJson = (value, fallback) => JSON.stringify(value ?? fallback);

const parseJson = (value, fallback) => {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return fallback;
  }
};

const nowIso = () => new Date().toISOString();

const normalizeRole = (row) => {
  if (!row) {
    return null;
  }

  return {
    role_id: row.role_id,
    name: row.name || row.role_id,
    description: row.description || '',
    permissions: Array.isArray(row.permissions) ? row.permissions : parseJson(row.permissions_json, []),
    is_system: typeof row.is_system === 'boolean'
      ? row.is_system
      : Boolean(Number(row.is_system || 0)),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
};

const normalizeAssignment = (row) => {
  if (!row) {
    return null;
  }

  return {
    user_id: row.user_id,
    roles: Array.isArray(row.roles) ? row.roles : parseJson(row.roles_json, []),
    metadata: row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : parseJson(row.metadata_json, {}),
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
};

const normalizeTrade = (row) => {
  if (!row) {
    return null;
  }

  return {
    trade_id: row.trade_id,
    initiator_id: row.initiator_id,
    initiator_username: row.initiator_username,
    target_id: row.target_id,
    target_username: row.target_username,
    status: row.status,
    offer: row.offer && typeof row.offer === 'object' ? row.offer : parseJson(row.offer_json, {}),
    request: row.request && typeof row.request === 'object' ? row.request : parseJson(row.request_json, {}),
    note: row.note || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    resolved_at: row.resolved_at || null,
    resolver_id: row.resolver_id || '',
    metadata: row.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : parseJson(row.metadata_json, {}),
  };
};

module.exports = {
  nowIso,
  parseJson,
  serializeJson,
  normalizeRole,
  normalizeAssignment,
  normalizeTrade,
};
