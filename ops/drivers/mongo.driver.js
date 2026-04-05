const mongoose = require('mongoose');

const { nowIso, normalizeAssignment, normalizeRole, normalizeTrade } = require('../ops.helpers');

const roleSchema = new mongoose.Schema({
  role_id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, default: '' },
  description: { type: String, default: '' },
  permissions: [{ type: String }],
  is_system: { type: Boolean, default: false },
  created_at: { type: String, default: nowIso },
  updated_at: { type: String, default: nowIso },
}, { versionKey: false });

const assignmentSchema = new mongoose.Schema({
  user_id: { type: String, required: true, unique: true, index: true },
  roles: [{ type: String }],
  metadata: { type: Object, default: {} },
  created_at: { type: String, default: nowIso },
  updated_at: { type: String, default: nowIso },
}, { versionKey: false });

const tradeSchema = new mongoose.Schema({
  trade_id: { type: String, required: true, unique: true, index: true },
  initiator_id: { type: String, required: true, index: true },
  initiator_username: { type: String, required: true, index: true },
  target_id: { type: String, required: true, index: true },
  target_username: { type: String, required: true, index: true },
  status: { type: String, required: true, index: true },
  offer: { type: Object, default: {} },
  request: { type: Object, default: {} },
  note: { type: String, default: '' },
  created_at: { type: String, default: nowIso },
  updated_at: { type: String, default: nowIso },
  resolved_at: { type: String, default: null },
  resolver_id: { type: String, default: '' },
  metadata: { type: Object, default: {} },
}, { versionKey: false });

const AdminRole = mongoose.models.AdminRole || mongoose.model('AdminRole', roleSchema);
const AdminRoleAssignment = mongoose.models.AdminRoleAssignment || mongoose.model('AdminRoleAssignment', assignmentSchema);
const TradeRecord = mongoose.models.TradeRecord || mongoose.model('TradeRecord', tradeSchema);

exports.connect = async () => {
};

exports.close = async () => {
};

exports.getStatus = () => ({
  driver: 'mongo',
  connected: mongoose.connection.readyState === 1,
  detail: mongoose.connection.readyState === 1 ? 'Using primary MongoDB connection' : 'MongoDB not connected',
});

exports.clearAll = async () => {
  await AdminRole.deleteMany({});
  await AdminRoleAssignment.deleteMany({});
  await TradeRecord.deleteMany({});
};

exports.listRoles = async () => {
  const roles = await AdminRole.find({}).sort({ role_id: 1 }).lean();
  return roles.map(normalizeRole);
};

exports.getRole = async (roleId) => normalizeRole(await AdminRole.findOne({ role_id: roleId }).lean());

exports.upsertRole = async (role) => {
  const timestamp = nowIso();
  await AdminRole.updateOne(
    { role_id: role.role_id },
    {
      $set: {
        name: role.name,
        description: role.description || '',
        permissions: role.permissions || [],
        is_system: Boolean(role.is_system),
        updated_at: timestamp,
      },
      $setOnInsert: {
        created_at: timestamp,
      },
    },
    { upsert: true }
  );
  return exports.getRole(role.role_id);
};

exports.deleteRole = async (roleId) => {
  const result = await AdminRole.deleteOne({ role_id: roleId });
  return result.deletedCount > 0;
};

exports.getUserRoleAssignment = async (userId) => normalizeAssignment(await AdminRoleAssignment.findOne({ user_id: userId }).lean());

exports.setUserRoleAssignment = async (userId, roleIds, metadata = {}) => {
  const timestamp = nowIso();
  await AdminRoleAssignment.updateOne(
    { user_id: userId },
    {
      $set: {
        roles: roleIds,
        metadata,
        updated_at: timestamp,
      },
      $setOnInsert: {
        created_at: timestamp,
      },
    },
    { upsert: true }
  );
  return exports.getUserRoleAssignment(userId);
};

exports.listUserRoleAssignments = async () => {
  const rows = await AdminRoleAssignment.find({}).sort({ user_id: 1 }).lean();
  return rows.map(normalizeAssignment);
};

exports.createTrade = async (trade) => {
  const created = await TradeRecord.create(trade);
  return normalizeTrade(created.toObject());
};

exports.getTrade = async (tradeId) => normalizeTrade(await TradeRecord.findOne({ trade_id: tradeId }).lean());

exports.listTrades = async (filter = {}) => {
  const query = {};

  if (filter.status) {
    query.status = filter.status;
  }

  if (filter.user_id) {
    query.$or = [
      { initiator_id: filter.user_id },
      { target_id: filter.user_id },
    ];
  }

  const limit = Number.isInteger(filter.limit) && filter.limit > 0 ? filter.limit : 100;
  const rows = await TradeRecord.find(query).sort({ created_at: -1 }).limit(limit).lean();
  return rows.map(normalizeTrade);
};

exports.updateTrade = async (tradeId, patch) => {
  await TradeRecord.updateOne(
    { trade_id: tradeId },
    {
      $set: {
        ...patch,
        updated_at: nowIso(),
      },
    }
  );
  return exports.getTrade(tradeId);
};
