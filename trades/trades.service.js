const crypto = require('crypto');

const OpsStore = require('../ops/ops.store');
const UserModel = require('../users/users.model');
const UserTool = require('../users/users.tool');
const LockTool = require('../tools/lock.tool');
const Activity = require('../activity/activity.model');
const EventBus = require('../realtime/event-bus');
const RbacService = require('../rbac/rbac.service');
const HttpTool = require('../tools/http.tool');

const normalizeCardEntries = (list) => (Array.isArray(list) ? list : [])
  .map((entry) => ({
    tid: String(entry?.tid || '').trim(),
    variant: String(entry?.variant || '').trim(),
    quantity: Number.parseInt(entry?.quantity ?? 0, 10),
  }))
  .filter((entry) => entry.tid && entry.variant && Number.isInteger(entry.quantity) && entry.quantity > 0);

const normalizePackEntries = (list) => (Array.isArray(list) ? list : [])
  .map((entry) => ({
    tid: String(entry?.tid || '').trim(),
    quantity: Number.parseInt(entry?.quantity ?? 0, 10),
  }))
  .filter((entry) => entry.tid && Number.isInteger(entry.quantity) && entry.quantity > 0);

const normalizeStringList = (list) => Array.from(new Set(
  (Array.isArray(list) ? list : [])
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
));

const normalizeBundle = (input = {}) => ({
  coins: Math.max(Number.parseInt(input.coins ?? 0, 10) || 0, 0),
  cards: normalizeCardEntries(input.cards),
  packs: normalizePackEntries(input.packs),
  avatars: normalizeStringList(input.avatars),
  card_backs: normalizeStringList(input.card_backs),
});

const isBundleEmpty = (bundle) =>
  bundle.coins === 0
  && bundle.cards.length === 0
  && bundle.packs.length === 0
  && bundle.avatars.length === 0
  && bundle.card_backs.length === 0;

const isTradeParticipant = (trade, userId) => trade.initiator_id === userId || trade.target_id === userId;

const ensureTradeAccess = (trade, actor, access) => {
  if (isTradeParticipant(trade, actor.userId)) {
    return true;
  }

  return RbacService.hasPermission(access, 'admin.trades.manage');
};

const tradeModifiedFields = ['coins', 'cards', 'packs', 'avatars', 'card_backs'];

const withTradeLock = (trade, action) => LockTool.withLocks([
  `trade:${trade.trade_id}`,
  trade.initiator_id,
  trade.target_id,
], action);

const getPendingTradeForMutation = async (tradeId) => {
  const trade = await OpsStore.getTrade(tradeId);
  if (!trade) {
    return null;
  }

  if (trade.status !== 'pending') {
    throw HttpTool.createError(400, 'Only pending trades can be modified');
  }

  return trade;
};

exports.createTrade = async (actor, body) => {
  const targetUsername = String(body?.target_username || body?.target || '').trim();
  const note = String(body?.note || '').trim();
  const offer = normalizeBundle(body?.offer);
  const request = normalizeBundle(body?.request);

  if (!targetUsername) {
    throw HttpTool.createError(400, 'target_username is required');
  }

  if (isBundleEmpty(offer) && isBundleEmpty(request)) {
    throw HttpTool.createError(400, 'A trade must include an offer or a request');
  }

  const initiator = await UserModel.getById(actor.userId);
  const target = await UserModel.getByUsername(targetUsername);

  if (!initiator || !target) {
    throw HttpTool.createError(404, 'Trade users were not found');
  }

  if (initiator.id === target.id) {
    throw HttpTool.createError(400, 'You cannot trade with yourself');
  }

  if (!UserTool.hasAssets(initiator, offer)) {
    throw HttpTool.createError(400, 'You do not own the offered assets');
  }

  const trade = await OpsStore.createTrade({
    trade_id: crypto.randomUUID(),
    initiator_id: initiator.id,
    initiator_username: initiator.username,
    target_id: target.id,
    target_username: target.username,
    status: 'pending',
    offer,
    request,
    note,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    resolved_at: null,
    resolver_id: '',
    metadata: {
      created_by: initiator.username,
    },
  });

  await Activity.LogActivity('trade_create', initiator.username, {
    trade_id: trade.trade_id,
    target_username: target.username,
    offer,
    request,
  });

  EventBus.publish('trade.created', trade, {
    admin: true,
    user_ids: [initiator.id, target.id],
  });

  return trade;
};

exports.listTrades = async (actor, access, filter = {}) => {
  const normalizedFilter = {
    status: filter.status ? String(filter.status).trim() : '',
    limit: Number.parseInt(filter.limit ?? 50, 10),
  };

  if (RbacService.hasPermission(access, 'admin.trades.manage') && filter.all) {
    return OpsStore.listTrades(normalizedFilter);
  }

  return OpsStore.listTrades({
    ...normalizedFilter,
    user_id: actor.userId,
  });
};

exports.getTrade = async (tradeId, actor, access) => {
  const trade = await OpsStore.getTrade(tradeId);
  if (!trade) {
    return null;
  }

  if (!ensureTradeAccess(trade, actor, access)) {
    throw HttpTool.createError(403, 'Permission Denied');
  }

  return trade;
};

exports.cancelTrade = async (tradeId, actor, access) => {
  const trade = await exports.getTrade(tradeId, actor, access);
  if (!trade) {
    return null;
  }

  if (trade.initiator_id !== actor.userId && !RbacService.hasPermission(access, 'admin.trades.manage')) {
      throw HttpTool.createError(403, 'Only the initiator or an admin can cancel this trade');
  }

  return withTradeLock(trade, async () => {
    const current = await getPendingTradeForMutation(tradeId);
    if (!current) {
      return null;
    }

    const updated = await OpsStore.updateTrade(tradeId, {
      status: 'cancelled',
      resolved_at: new Date().toISOString(),
      resolver_id: actor.userId,
      metadata: {
        ...(current.metadata || {}),
        cancelled_by: actor.username,
      },
    });

    await Activity.LogActivity('trade_cancel', actor.username, { trade_id: tradeId });
    EventBus.publish('trade.updated', updated, {
      admin: true,
      user_ids: [current.initiator_id, current.target_id],
    });

    return updated;
  });
};

exports.declineTrade = async (tradeId, actor, access) => {
  const trade = await exports.getTrade(tradeId, actor, access);
  if (!trade) {
    return null;
  }

  if (trade.target_id !== actor.userId && !RbacService.hasPermission(access, 'admin.trades.manage')) {
      throw HttpTool.createError(403, 'Only the recipient or an admin can decline this trade');
  }

  return withTradeLock(trade, async () => {
    const current = await getPendingTradeForMutation(tradeId);
    if (!current) {
      return null;
    }

    const updated = await OpsStore.updateTrade(tradeId, {
      status: 'declined',
      resolved_at: new Date().toISOString(),
      resolver_id: actor.userId,
      metadata: {
        ...(current.metadata || {}),
        declined_by: actor.username,
      },
    });

    await Activity.LogActivity('trade_decline', actor.username, { trade_id: tradeId });
    EventBus.publish('trade.updated', updated, {
      admin: true,
      user_ids: [current.initiator_id, current.target_id],
    });

    return updated;
  });
};

exports.acceptTrade = async (tradeId, actor, access) => {
  const trade = await exports.getTrade(tradeId, actor, access);
  if (!trade) {
    return null;
  }

  if (trade.target_id !== actor.userId && !RbacService.hasPermission(access, 'admin.trades.manage')) {
      throw HttpTool.createError(403, 'Only the recipient or an admin can accept this trade');
  }

  return withTradeLock(trade, async () => {
    const current = await getPendingTradeForMutation(tradeId);
    if (!current) {
      return null;
    }

    const initiator = await UserModel.getById(current.initiator_id);
    const target = await UserModel.getById(current.target_id);

    if (!initiator || !target) {
        throw HttpTool.createError(404, 'Trade users were not found');
    }

    if (!UserTool.hasAssets(initiator, current.offer)) {
        throw HttpTool.createError(400, 'Initiator no longer has the offered assets');
    }

    if (!UserTool.hasAssets(target, current.request)) {
        throw HttpTool.createError(400, 'Recipient no longer has the requested assets');
    }

    const movedOffer = await UserTool.transferAssetBundle(initiator, target, current.offer);
    const movedRequest = await UserTool.transferAssetBundle(target, initiator, current.request);
    if (!movedOffer || !movedRequest) {
        throw HttpTool.createError(500, 'Failed to move trade assets');
    }

    const savedInitiator = await UserModel.save(initiator, tradeModifiedFields);
    const savedTarget = await UserModel.save(target, tradeModifiedFields);
    if (!savedInitiator || !savedTarget) {
        throw HttpTool.createError(500, 'Failed to save trade results');
    }

    const updated = await OpsStore.updateTrade(tradeId, {
      status: 'accepted',
      resolved_at: new Date().toISOString(),
      resolver_id: actor.userId,
      metadata: {
        ...(current.metadata || {}),
        accepted_by: actor.username,
      },
    });

    await Activity.LogActivity('trade_accept', actor.username, {
      trade_id: tradeId,
      initiator: initiator.username,
      target: target.username,
    });

    EventBus.publish('trade.updated', updated, {
      admin: true,
      user_ids: [current.initiator_id, current.target_id],
    });

    return updated;
  });
};
