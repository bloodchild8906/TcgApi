const fs = require('fs');
const path = require('path');
const Activity = require('../activity/activity.model');
const CardModel = require('../cards/cards.model');
const config = require('../config');
const EventBus = require('../realtime/event-bus');
const GameStore = require('../game/game.store');
const { createId } = require('../game/game.helpers');
const HttpTool = require('../tools/http.tool');
const MatchModel = require('../matches/matches.model');
const OpsStore = require('../ops/ops.store');
const RbacService = require('../rbac/rbac.service');
const RconServer = require('../rcon/rcon.server');
const UserModel = require('../users/users.model');
const UserTool = require('../users/users.tool');

const activityCollection = GameStore.collection('activity');
const bansCollection = GameStore.collection('bans');
const cardsCollection = GameStore.collection('cards');
const cardBacksCollection = GameStore.collection('card_backs');
const cardFramesCollection = GameStore.collection('card_frames');
const cardTypesCollection = GameStore.collection('card_types');
const gameFlowsCollection = GameStore.collection('game_flows');
const keywordsCollection = GameStore.collection('keywords');
const marketCollection = GameStore.collection('market');
const matchmakingQueueCollection = GameStore.collection('matchmaking_queue');
const matchmakingSettingsCollection = GameStore.collection('matchmaking_settings');
const matchEventsCollection = GameStore.collection('match_events');
const matchesCollection = GameStore.collection('matches');
const packsCollection = GameStore.collection('packs');
const playerMessagesCollection = GameStore.collection('player_messages');
const rewardsCollection = GameStore.collection('rewards');
const setsCollection = GameStore.collection('sets');
const usersCollection = GameStore.collection('users');
const adminAssetUploadRoot = path.resolve(__dirname, '../public/uploads/admin-assets');
const imageExtensionByMimeType = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

const exactCaseInsensitive = (value) => new RegExp(`^${String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

const sanitizePathSegment = (value, fallback = 'asset') => {
  const cleaned = String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || fallback;
};

const decodeImageDataUrl = (value) => {
  const match = String(value || '').match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    throw HttpTool.createError(400, 'data_url must be a base64-encoded image data URL.');
  }

  const mimeType = String(match[1] || '').toLowerCase();
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) {
    throw HttpTool.createError(400, 'Uploaded image is empty.');
  }

  return { buffer, mimeType };
};

const resolveImageExtension = (mimeType, fileName = '') => {
  const fromMime = imageExtensionByMimeType[mimeType] || '';
  const fromName = path.extname(String(fileName || '')).toLowerCase();
  return fromMime || (Object.values(imageExtensionByMimeType).includes(fromName) ? fromName : '.png');
};

const parseBoundedInteger = (value, field, { min = null, max = null } = {}) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw HttpTool.createError(400, `${field} must be an integer`);
  }

  if (min !== null && parsed < min) {
    throw HttpTool.createError(400, `${field} must be >= ${min}`);
  }

  if (max !== null && parsed > max) {
    throw HttpTool.createError(400, `${field} must be <= ${max}`);
  }

  return parsed;
};

const parseTextField = (value, field, maxLength = 100) => {
  if (typeof value !== 'string') {
    throw HttpTool.createError(400, `${field} must be a string`);
  }

  if (value.length > maxLength) {
    throw HttpTool.createError(400, `${field} is too long`);
  }

  return value;
};

const parseLimit = (value, fallback = 25, max = 100) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw HttpTool.createError(400, 'limit must be a positive integer');
  }

  return Math.min(parsed, max);
};

const normalizeDoc = (doc, includeFields = []) => {
  if (!doc) {
    return null;
  }

  const data = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  includeFields.forEach((field) => {
    if (doc[field] !== undefined) {
      data[field] = doc[field];
    }
  });

  delete data.__v;
  return data;
};

const requireTid = (data, field = 'tid') => {
  const value = String(data?.[field] || '').trim();
  if (!value) {
    throw HttpTool.createError(400, `${field} is required`);
  }
  return value;
};

const saveTidDocument = async (collection, data) => {
  const tid = requireTid(data);
  const existing = await collection.get(tid);

  if (existing) {
    Object.assign(existing, data, { tid });
    return collection.save(existing);
  }

  return collection.create({
    ...data,
    tid,
  });
};

const saveKeyedDocument = async (collection, keyField, key, data) => {
  const existing = await collection.get(key);

  if (existing) {
    Object.assign(existing, data, { [keyField]: key });
    return collection.save(existing);
  }

  return collection.create({
    ...data,
    [keyField]: key,
  });
};

const deleteTidDocument = async (collection, tid) => {
  const entry = await collection.get(tid);
  if (!entry) {
    throw HttpTool.createError(404, `Document not found: ${tid}`);
  }

  await collection.remove(tid, entry.$meta);
  return entry;
};

const normalizeStringArray = (value) => (Array.isArray(value) ? value : [])
  .map((entry) => String(entry || '').trim())
  .filter(Boolean);

const normalizeNumber = (value, fallback, { min = null, max = null } = {}) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  if (min !== null && numeric < min) {
    return min;
  }

  if (max !== null && numeric > max) {
    return max;
  }

  return numeric;
};

const normalizeInteger = (value, fallback, options = {}) => Math.round(normalizeNumber(value, fallback, options));

const sanitizeJsonValue = (value) => {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeJsonValue(entry));
  }

  if (value && typeof value === 'object') {
    return Object.entries(value).reduce((output, [key, entry]) => {
      output[String(key)] = sanitizeJsonValue(entry);
      return output;
    }, {});
  }

  return String(value ?? '');
};

const normalizeStudioZone = (zone = {}) => {
  const normalizedZIndex = normalizeInteger(zone.z_index ?? zone.metadata?.z_index, 10, { min: -999, max: 999 });
  const metadata = sanitizeJsonValue(zone.metadata || {});
  return {
    id: String(zone.id || createId()),
    kind: String(zone.kind || zone.prefab || 'text'),
    label: String(zone.label || zone.id || 'Zone'),
    binding: String(zone.binding || zone.field || ''),
    text: String(zone.text || ''),
    x: normalizeNumber(zone.x, 20, { min: 0, max: 2000 }),
    y: normalizeNumber(zone.y, 20, { min: 0, max: 2000 }),
    width: normalizeNumber(zone.width, 120, { min: 20, max: 2000 }),
    height: normalizeNumber(zone.height, 48, { min: 20, max: 2000 }),
    align: String(zone.align || 'left'),
    font_size: normalizeNumber(zone.font_size, 16, { min: 8, max: 120 }),
    font_weight: String(zone.font_weight || '600'),
    color: String(zone.color || '#edf6f2'),
    background: String(zone.background || ''),
    radius: normalizeNumber(zone.radius, 12, { min: 0, max: 400 }),
    opacity: normalizeNumber(zone.opacity, 1, { min: 0, max: 1 }),
    z_index: normalizedZIndex,
    metadata: {
      ...metadata,
      z_index: normalizedZIndex,
    },
  };
};

const normalizeStudioLayout = (layout = {}) => ({
  width: normalizeNumber(layout.width, 320, { min: 120, max: 2000 }),
  height: normalizeNumber(layout.height, 460, { min: 120, max: 2000 }),
  background: String(layout.background || ''),
  accent: String(layout.accent || ''),
  border_color: String(layout.border_color || ''),
  art_url: String(layout.art_url || ''),
  frame_z_index: normalizeInteger(layout.frame_z_index, 40, { min: -999, max: 999 }),
  artwork_mode: String(layout.artwork_mode || 'cover'),
  zones: (Array.isArray(layout.zones) ? layout.zones : []).map((zone) => normalizeStudioZone(zone)),
});

const normalizeStudioFields = (fields = []) => (Array.isArray(fields) ? fields : []).map((field, index) => ({
  key: String(field.key || `field_${index + 1}`).trim(),
  label: String(field.label || field.key || `Field ${index + 1}`).trim(),
  type: String(field.type || 'text').trim(),
  required: Boolean(field.required),
  placeholder: String(field.placeholder || ''),
  help: String(field.help || ''),
  options: normalizeStringArray(field.options),
  default_value: sanitizeJsonValue(field.default_value ?? ''),
})).filter((field) => field.key);

const normalizeStudioTemplatePayload = (data = {}, kind) => {
  const tid = requireTid(data);
  return {
    tid,
    name: String(data.name || tid),
    description: String(data.description || ''),
    kind,
    tags: normalizeStringArray(data.tags),
    default_frame_tid: String(data.default_frame_tid || ''),
    default_back_tid: String(data.default_back_tid || ''),
    preview_values: sanitizeJsonValue(data.preview_values || {}),
    layout: normalizeStudioLayout(data.layout || {}),
    fields: normalizeStudioFields(data.fields),
    metadata: sanitizeJsonValue(data.metadata || {}),
    updatedAt: new Date(),
  };
};

const sortHistoryEntries = (entries) => entries
  .slice()
  .sort((left, right) => {
    const leftTime = new Date(left.timestamp || left.createdAt || 0).getTime();
    const rightTime = new Date(right.timestamp || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });

const sumQuantities = (entries = []) => entries.reduce((total, entry) => {
  const quantity = Number(entry?.quantity);
  return total + (Number.isFinite(quantity) ? quantity : 1);
}, 0);

const uniqueEntryCount = (entries = [], field = 'tid') => {
  const values = new Set();
  entries.forEach((entry) => {
    const value = String(entry?.[field] || '').trim();
    if (value) {
      values.add(value);
    }
  });
  return values.size;
};

const toPercent = (owned, total) => {
  if (!Number.isFinite(total) || total <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((owned / total) * 1000) / 10);
};

const buildCollectionDensity = ({
  totalCards = 0,
  totalDeckTemplates = 0,
  totalPacks = 0,
  totalRewards = 0,
  availableRewardIds = [],
  user = {},
}) => {
  const uniqueOwnedCards = uniqueEntryCount(user.cards || []);
  const totalOwnedCards = sumQuantities(user.cards || []);
  const uniqueOwnedPacks = uniqueEntryCount(user.packs || []);
  const totalOwnedPacks = sumQuantities(user.packs || []);
  const ownedDecks = Array.isArray(user.decks) ? user.decks.length : 0;
  const rewardIdSet = new Set((Array.isArray(availableRewardIds) ? availableRewardIds : [])
    .map((rewardId) => String(rewardId || '').trim())
    .filter(Boolean));
  const claimedRewards = rewardIdSet.size > 0
    ? uniqueEntryCount((user.rewards || [])
      .filter((rewardId) => rewardIdSet.has(String(rewardId || '').trim()))
      .map((rewardId) => ({ tid: rewardId })))
    : uniqueEntryCount((user.rewards || []).map((rewardId) => ({ tid: rewardId })));

  const categories = [
    {
      key: 'cards',
      label: 'Cards',
      owned_total: totalOwnedCards,
      owned_unique: uniqueOwnedCards,
      percent: toPercent(uniqueOwnedCards, totalCards),
      total_available: totalCards,
    },
    {
      key: 'packs',
      label: 'Packs',
      owned_total: totalOwnedPacks,
      owned_unique: uniqueOwnedPacks,
      percent: toPercent(uniqueOwnedPacks, totalPacks),
      total_available: totalPacks,
    },
    {
      key: 'decks',
      label: 'Decks',
      owned_total: ownedDecks,
      owned_unique: ownedDecks,
      percent: toPercent(ownedDecks, totalDeckTemplates),
      total_available: totalDeckTemplates,
    },
    {
      key: 'rewards',
      label: 'Rewards',
      owned_total: claimedRewards,
      owned_unique: claimedRewards,
      percent: toPercent(claimedRewards, totalRewards),
      total_available: totalRewards,
    },
  ];

  const overallOwned = categories.reduce(
    (total, category) => total + Math.min(category.owned_unique, category.total_available || category.owned_unique),
    0
  );
  const overallAvailable = categories.reduce((total, category) => total + category.total_available, 0);

  return {
    categories,
    inventory: {
      avatars: Array.isArray(user.avatars) ? user.avatars.length : 0,
      card_backs: Array.isArray(user.card_backs) ? user.card_backs.length : 0,
      coins: Number(user.coins || 0),
      decks: ownedDecks,
      friends: Array.isArray(user.friends) ? user.friends.length : 0,
      packs: totalOwnedPacks,
      packs_unique: uniqueOwnedPacks,
      cards: totalOwnedCards,
      cards_unique: uniqueOwnedCards,
      rewards: claimedRewards,
    },
    overall_percent: toPercent(overallOwned, overallAvailable),
    overall_unique_owned: overallOwned,
    overall_total_available: overallAvailable,
  };
};

const summarizeDecks = (user = {}) => (Array.isArray(user.decks) ? user.decks : []).map((deck) => {
  const cards = Array.isArray(deck.cards) ? deck.cards : [];
  return {
    casual_losses: Number(deck.casual_losses || 0),
    casual_matches: Number(deck.casual_matches || 0),
    casual_mmr: Number(deck.casual_mmr || user.casual_mmr || user.elo || config.start_elo),
    casual_win_rate: toPercent(Number(deck.casual_wins || 0), Number(deck.casual_matches || 0)),
    casual_wins: Number(deck.casual_wins || 0),
    card_count: sumQuantities(cards),
    hero: deck.hero || {},
    preview_cards: cards.slice(0, 8).map((card) => ({
      quantity: Number(card.quantity || 1),
      tid: String(card.tid || ''),
      variant: String(card.variant || ''),
    })),
    ranked_losses: Number(deck.ranked_losses || 0),
    ranked_matches: Number(deck.ranked_matches || 0),
    ranked_mmr: Number(deck.ranked_mmr || user.elo || config.start_elo),
    ranked_win_rate: toPercent(Number(deck.ranked_wins || 0), Number(deck.ranked_matches || 0)),
    ranked_wins: Number(deck.ranked_wins || 0),
    tid: String(deck.tid || ''),
    title: String(deck.title || ''),
    unique_cards: uniqueEntryCount(cards),
  };
});

const resolveParticipantSide = (match = {}, username = '') => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const teams = match.teams || {};
  if (Array.isArray(teams.solo) && teams.solo.some((entry) => String(entry.username || '').trim().toLowerCase() === normalizedUsername)) {
    return 'solo';
  }
  if (Array.isArray(teams.opponent) && teams.opponent.some((entry) => String(entry.username || '').trim().toLowerCase() === normalizedUsername)) {
    return 'opponent';
  }
  const snapshot = (Array.isArray(match.udata) ? match.udata : []).find((entry) => String(entry.username || '').trim().toLowerCase() === normalizedUsername);
  const side = String(snapshot?.team_key || snapshot?.requested_side || '').trim().toLowerCase();
  return side === 'solo' || side === 'opponent' ? side : '';
};

const summarizePerformance = (matches = [], username = '') => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const completedMatches = matches.filter((match) => match.completed);
  const wins = completedMatches.filter((match) => {
    const winnerSide = String(match.winner_side || '').trim().toLowerCase();
    if (winnerSide) {
      return resolveParticipantSide(match, username) === winnerSide;
    }
    return String(match.winner || '').trim().toLowerCase() === normalizedUsername;
  }).length;
  const losses = completedMatches.filter((match) => {
    const winnerSide = String(match.winner_side || '').trim().toLowerCase();
    if (winnerSide) {
      const side = resolveParticipantSide(match, username);
      return side && side !== winnerSide;
    }
    const winner = String(match.winner || '').trim().toLowerCase();
    return winner && winner !== normalizedUsername;
  }).length;
  const draws = completedMatches.filter((match) => !String(match.winner || '').trim()).length;
  const totalCompleted = completedMatches.length;

  return {
    completed_matches: totalCompleted,
    draws,
    losses,
    total_matches: matches.length,
    win_loss_ratio: losses > 0 ? Math.round((wins / losses) * 100) / 100 : (wins > 0 ? wins : 0),
    win_rate: toPercent(wins, totalCompleted || 0),
    wins,
  };
};

const summarizeMatchForPlayer = (match, username) => {
  const normalizedUsername = String(username || '').trim().toLowerCase();
  const players = Array.isArray(match.players) ? match.players : [];
  const side = resolveParticipantSide(match, username);
  const opponent = side
    ? players.filter((player) => resolveParticipantSide(match, player) !== side).join(', ')
    : (players.find((player) => String(player || '').trim().toLowerCase() !== normalizedUsername) || '');
  const winner = String(match.winner || '').trim();
  const normalizedWinner = winner.toLowerCase();
  const winnerSide = String(match.winner_side || '').trim().toLowerCase();

  let result = 'pending';
  if (match.completed) {
    if (!winner && !winnerSide) {
      result = 'draw';
    } else if (winnerSide) {
      result = side === winnerSide ? 'win' : 'loss';
    } else if (normalizedWinner === normalizedUsername) {
      result = 'win';
    } else {
      result = 'loss';
    }
  }

  return {
    completed: Boolean(match.completed),
    end: match.end,
    mode: match.mode || (match.ranked ? 'Ranked' : 'Casual'),
    opponent,
    ranked: Boolean(match.ranked),
    result,
    start: match.start,
    tid: match.tid,
    winner,
  };
};

const summarizePlayerMessage = (entry) => ({
  channel: String(entry.channel || 'system'),
  content: String(entry.content || ''),
  direction: String(entry.direction || 'system'),
  peer: String(entry.peer || ''),
  timestamp: entry.timestamp,
  userId: String(entry.userId || ''),
  username: String(entry.username || ''),
});

const ensurePlayerUser = (user) => {
  if (!user) {
    throw HttpTool.createError(404, 'Player not found');
  }

  if (Number(user.permission_level || 0) >= config.permissions.SERVER) {
    throw HttpTool.createError(400, `${user.username} is a staff/admin account, not a player`);
  }

  return user;
};

exports.resetDatabase = async (actor = 'system') => {
  const collections = [
    activityCollection,
    bansCollection,
    cardsCollection,
    cardBacksCollection,
    cardFramesCollection,
    cardTypesCollection,
    gameFlowsCollection,
    keywordsCollection,
    marketCollection,
    matchmakingQueueCollection,
    matchmakingSettingsCollection,
    matchesCollection,
    matchEventsCollection,
    packsCollection,
    playerMessagesCollection,
    setsCollection,
    GameStore.collection('decks'),
    rewardsCollection,
    GameStore.collection('users'),
    GameStore.collection('variants'),
  ];

  for (let index = 0; index < collections.length; index += 1) {
    await collections[index].removeAll();
  }

  await OpsStore.clearAll();
  await RbacService.seedBuiltins();
  await Activity.LogActivity('admin_database_reset', actor, { timestamp: new Date() });

  EventBus.publish('system.reset', { actor }, { broadcast: true, admin: true });

  return {
    success: true,
    message: 'Database reset successfully. All collections cleared.',
  };
};

exports.toggleRcon = async (enabled, actor = 'system') => {
  config.rcon_enabled = Boolean(enabled);

  if (config.rcon_enabled) {
    RconServer.start();
  } else {
    await RconServer.stop();
  }

  await Activity.LogActivity('admin_system_rcon_toggle', actor, { enabled: config.rcon_enabled });
  EventBus.publish('system.rcon.status', { enabled: config.rcon_enabled, actor }, { broadcast: true, admin: true });

  return {
    success: true,
    enabled: config.rcon_enabled,
  };
};

exports.updateIpBlacklist = async (ipList, actor = 'system') => {
  if (!Array.isArray(ipList)) {
    throw HttpTool.createError(400, 'IP List must be an array');
  }

  config.ip_blacklist = ipList.slice();
  await Activity.LogActivity('admin_system_blacklist_update', actor, { ip_count: ipList.length });

  return {
    success: true,
    blacklist: config.ip_blacklist,
  };
};

exports.listPlayers = async (query = {}) => {
  const limit = parseLimit(query.limit, 20, 100);
  const page = parseBoundedInteger(query.page || 0, 'page', { min: 0 });

  return (await usersCollection.find({
    permission_level: { $lt: config.permissions.SERVER },
  }, {
    limit,
    skip: page * limit,
    sort: { last_online_time: -1, username: 1 },
  })).map((user) => user.deleteSecrets());
};

exports.listStaff = async (query = {}) => {
  const limit = parseLimit(query.limit, 20, 100);
  const page = parseBoundedInteger(query.page || 0, 'page', { min: 0 });

  return (await usersCollection.find({
    permission_level: { $gte: config.permissions.SERVER },
  }, {
    limit,
    skip: page * limit,
    sort: { permission_level: -1, username: 1 },
  })).map((user) => user.deleteSecrets());
};

exports.updatePlayer = async (userId, payload = {}, actor = 'system') => {
  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, `User not found: ${userId}`);
  }

  const previousPermissionLevel = user.permission_level;

  const patch = {};

  if (payload.coins !== undefined) patch.coins = parseBoundedInteger(payload.coins, 'coins', { min: 0 });
  if (payload.xp !== undefined) patch.xp = parseBoundedInteger(payload.xp, 'xp', { min: 0 });
  if (payload.elo !== undefined) patch.elo = parseBoundedInteger(payload.elo, 'elo', { min: 0 });
  if (payload.validation_level !== undefined) patch.validation_level = parseBoundedInteger(payload.validation_level, 'validation_level', { min: 0 });
  if (payload.permission_level !== undefined) patch.permission_level = parseBoundedInteger(payload.permission_level, 'permission_level', { min: 0, max: config.permissions.ADMIN });
  if (payload.avatar !== undefined) patch.avatar = parseTextField(payload.avatar, 'avatar');
  if (payload.cardback !== undefined) patch.cardback = parseTextField(payload.cardback, 'cardback');
  if (payload.banned !== undefined) patch.banned = Boolean(payload.banned);

  if (Object.keys(patch).length === 0) {
    throw HttpTool.createError(400, 'At least one player field is required');
  }

  const updated = await UserModel.update(user, patch);
  if (!updated) {
    throw HttpTool.createError(500, 'Unable to update player');
  }

  if (
    patch.permission_level !== undefined
    && patch.permission_level < config.permissions.ADMIN
    && previousPermissionLevel >= config.permissions.ADMIN
  ) {
    await OpsStore.setUserRoleAssignment(user.id, [], {
      actor,
      source: 'admin.demote',
    });
  }

  await Activity.LogActivity('admin_player_update', actor, {
    user: user.username,
    user_id: user.id,
    changes: patch,
  });

  EventBus.publish('player.updated', {
    userId: user.id,
    changes: patch,
  }, {
    user_ids: [user.id],
    admin: true,
  });

  if (patch.banned === true) {
    EventBus.publish('player.kick', {
      userId: user.id,
      reason: 'Banned',
    }, {
      user_ids: [user.id],
      admin: true,
    });
  }

  return updated.deleteSecrets();
};

exports.banPlayer = async (userId, type = 'permanent', reason = 'No reason provided', actor = 'system', metadata = {}) => {
  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, `User not found: ${userId}`);
  }

  const normalizedType = String(type || 'permanent').trim().toLowerCase();
  const durationMap = {
    warning: 2,
    softban: 24 * 7,
    permanent: 999999,
  };

  if (!Object.prototype.hasOwnProperty.call(durationMap, normalizedType)) {
    throw HttpTool.createError(400, 'type must be one of: warning, softban, permanent');
  }

  const durationHours = durationMap[normalizedType];
  const expiresAt = durationHours > 0 ? new Date(Date.now() + durationHours * 60 * 60 * 1000) : null;

  const banEntry = await saveKeyedDocument(bansCollection, 'userId', user.id, {
    actor,
    createdAt: new Date(),
    expiresAt,
    metadata: {
      linked_chats: Array.isArray(metadata.linked_chats) ? metadata.linked_chats : [],
      notes: typeof metadata.notes === 'string' ? metadata.notes : '',
    },
    reason: String(reason || 'No reason provided'),
    type: normalizedType,
    userId: user.id,
    username: user.username,
  });

  await exports.updatePlayer(userId, { banned: true }, actor);
  await Activity.LogActivity('admin_player_ban', actor, {
    expiresAt,
    reason: banEntry.reason,
    type: normalizedType,
    user: user.username,
  });

  EventBus.publish('player.banned', normalizeDoc(banEntry), {
    user_ids: [user.id],
    admin: true,
  });

  return normalizeDoc(banEntry);
};

exports.unbanPlayer = async (userId, actor = 'system') => {
  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, `User not found: ${userId}`);
  }

  await bansCollection.remove(user.id);
  const result = await exports.updatePlayer(userId, { banned: false }, actor);
  await Activity.LogActivity('admin_player_unban', actor, {
    user: user.username,
    user_id: user.id,
  });

  EventBus.publish('player.unbanned', {
    userId: user.id,
    username: user.username,
  }, {
    user_ids: [user.id],
    admin: true,
  });

  return result;
};

exports.kickPlayer = async (userId, reason = 'Kicked by administrator', actor = 'system') => {
  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, `User not found: ${userId}`);
  }

  EventBus.publish('player.kick', {
    reason: String(reason || 'Kicked by administrator'),
    userId: user.id,
  }, {
    user_ids: [user.id],
    admin: true,
  });

  await Activity.LogActivity('admin_player_kick', actor, {
    reason: String(reason || 'Kicked by administrator'),
    user: user.username,
    user_id: user.id,
  });

  return {
    success: true,
    userId: user.id,
  };
};

exports.getPlayerHistory = async (userId) => {
  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, 'User not found');
  }

  const activity = await Activity.Get({ username: user.username });
  const banEntry = await bansCollection.get(user.id);
  const history = activity.map((entry) => normalizeDoc(entry));

  if (banEntry) {
    history.push({
      ...normalizeDoc(banEntry),
      timestamp: banEntry.createdAt,
      type: 'ban_record',
    });
  }

  return sortHistoryEntries(history);
};

exports.getPlayerFriends = async (userId) => {
  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, 'User not found');
  }

  const friendsList = user.friends || [];
  const friends = await UserModel.getUsernameList(friendsList);

  return friends.map((friend) => ({
    avatar: friend.avatar,
    id: friend.id,
    last_online_time: friend.last_online_time,
    username: friend.username,
  }));
};

exports.getPlayerDeck = async (userId, deckTid) => {
  const user = ensurePlayerUser(await UserModel.getById(userId));

  const deck = UserTool.getDeck(user, deckTid);
  if (!deck || !deck.tid) {
    throw HttpTool.createError(404, 'Deck not found');
  }

  const enhancedCards = [];
  for (let index = 0; index < deck.cards.length; index += 1) {
    const cardRef = deck.cards[index];
    const cardData = await CardModel.get(cardRef.tid);
    if (cardData) {
      enhancedCards.push({
        ...cardRef,
        details: normalizeDoc(cardData),
      });
    }
  }

  return {
    ...deck,
    casual_win_rate: toPercent(Number(deck.casual_wins || 0), Number(deck.casual_matches || 0)),
    ranked_win_rate: toPercent(Number(deck.ranked_wins || 0), Number(deck.ranked_matches || 0)),
    cards: enhancedCards,
  };
};

exports.getPlayerProfile = async (userId) => {
  const user = ensurePlayerUser(await UserModel.getById(userId));
  const username = String(user.username || '').trim();

  const [
    totalCards,
    totalDeckTemplates,
    totalPacks,
    rewardDocuments,
    matches,
    activity,
    banEntry,
    messageHistory,
    friends,
  ] = await Promise.all([
    cardsCollection.count({}),
    GameStore.collection('decks').count({}),
    packsCollection.count({}),
    GameStore.collection('rewards').find({}, { limit: 10000 }),
    matchesCollection.find({ players: username }, {
      sort: { end: -1, start: -1 },
      limit: 20,
    }),
    Activity.Get({ username }),
    bansCollection.get(user.id),
    playerMessagesCollection.find({ userId: user.id }, {
      sort: { timestamp: -1 },
      limit: 50,
    }),
    exports.getPlayerFriends(userId),
  ]);

  const availableRewardIds = rewardDocuments
    .map((reward) => String(reward.tid || '').trim())
    .filter(Boolean);
  const normalizedMatches = matches.map((match) => normalizeDoc(match));
  const performance = summarizePerformance(normalizedMatches, username);
  const activityHistory = sortHistoryEntries([
    ...activity.map((entry) => normalizeDoc(entry)),
    ...(banEntry ? [{
      ...normalizeDoc(banEntry),
      timestamp: banEntry.createdAt,
      type: 'ban_record',
    }] : []),
  ]);

  return {
    activity_history: activityHistory.slice(0, 50),
    collection_density: buildCollectionDensity({
      totalCards,
      totalDeckTemplates,
      totalPacks,
      totalRewards: availableRewardIds.length,
      availableRewardIds,
      user,
    }),
    decks: summarizeDecks(user),
    friends,
    message_history: messageHistory.map((entry) => summarizePlayerMessage(normalizeDoc(entry))),
    performance,
    player: user.deleteSecrets(),
    recent_matches: normalizedMatches.map((match) => summarizeMatchForPlayer(match, username)),
  };
};

exports.listGames = async (query = {}) => {
  const limit = parseLimit(query.limit, 25, 100);
  const filter = {};

  if (query.userId) {
    filter.players = String(query.userId).trim();
  }

  if (query.completed !== undefined && query.completed !== '') {
    filter.completed = String(query.completed).trim().toLowerCase() === 'true';
  }

  return (await matchesCollection.find(filter, {
    limit,
    sort: { end: -1, start: -1 },
  })).map((match) => normalizeDoc(match));
};

exports.getGameEvents = async (matchId) => {
  return (await matchEventsCollection.find(
    { match_id: String(matchId || '').trim() },
    { sort: { timestamp: 1 } }
  )).map((event) => normalizeDoc(event));
};

exports.deleteGame = async (matchId, actor = 'system') => {
  const match = await MatchModel.get(matchId);
  if (!match) {
    throw HttpTool.createError(404, `Match not found: ${matchId}`);
  }

  const events = await matchEventsCollection.find({ match_id: matchId });
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    await matchEventsCollection.remove(event.id, event.$meta);
  }

  const deleted = await MatchModel.remove(matchId);
  if (!deleted) {
    throw HttpTool.createError(500, 'Unable to delete match');
  }

  await Activity.LogActivity('admin_match_delete', actor, {
    event_count: events.length,
    match_id: match.tid,
    players: match.players || [],
    winner: match.winner || '',
  });

  EventBus.publish('match.deleted', { matchId }, { broadcast: true, admin: true });

  return normalizeDoc(match);
};

exports.listKeywords = async () => (await keywordsCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.saveKeyword = async (data, actor = 'system') => {
  const result = await saveTidDocument(keywordsCollection, data || {});
  await Activity.LogActivity('admin_keyword_save', actor, { tid: result.tid });
  EventBus.publish('content.keyword.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deleteKeyword = async (tid, actor = 'system') => {
  const result = await deleteTidDocument(keywordsCollection, tid);
  await Activity.LogActivity('admin_keyword_delete', actor, { tid });
  EventBus.publish('content.keyword.deleted', { tid }, { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.listSets = async () => (await setsCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.saveSet = async (data, actor = 'system') => {
  const payload = {
    ...data,
    releaseDate: data?.releaseDate ? new Date(data.releaseDate) : undefined,
  };
  if (!payload.releaseDate || Number.isNaN(payload.releaseDate.getTime())) {
    delete payload.releaseDate;
  }

  const result = await saveTidDocument(setsCollection, payload);
  await Activity.LogActivity('admin_set_save', actor, { tid: result.tid });
  EventBus.publish('content.set.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deleteSet = async (tid, actor = 'system') => {
  const result = await deleteTidDocument(setsCollection, tid);
  await Activity.LogActivity('admin_set_delete', actor, { tid });
  EventBus.publish('content.set.deleted', { tid }, { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.listPacks = async () => (await packsCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.savePack = async (data, actor = 'system') => {
  const result = await saveTidDocument(packsCollection, data || {});
  await Activity.LogActivity('admin_pack_save', actor, { tid: result.tid });
  EventBus.publish('content.pack.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deletePack = async (tid, actor = 'system') => {
  const result = await deleteTidDocument(packsCollection, tid);
  await Activity.LogActivity('admin_pack_delete', actor, { tid });
  EventBus.publish('content.pack.deleted', { tid }, { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.listCardTypes = async () => (await cardTypesCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.saveCardType = async (data, actor = 'system') => {
  const payload = normalizeStudioTemplatePayload(data || {}, 'card_type');
  const result = await saveTidDocument(cardTypesCollection, payload);
  await Activity.LogActivity('admin_card_type_save', actor, { tid: result.tid });
  EventBus.publish('content.card_type.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deleteCardType = async (tid, actor = 'system') => {
  const result = await deleteTidDocument(cardTypesCollection, tid);
  await Activity.LogActivity('admin_card_type_delete', actor, { tid });
  EventBus.publish('content.card_type.deleted', { tid }, { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.listCardFrames = async () => (await cardFramesCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.saveCardFrame = async (data, actor = 'system') => {
  const payload = normalizeStudioTemplatePayload(data || {}, 'card_frame');
  const result = await saveTidDocument(cardFramesCollection, payload);
  await Activity.LogActivity('admin_card_frame_save', actor, { tid: result.tid });
  EventBus.publish('content.card_frame.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deleteCardFrame = async (tid, actor = 'system') => {
  const result = await deleteTidDocument(cardFramesCollection, tid);
  await Activity.LogActivity('admin_card_frame_delete', actor, { tid });
  EventBus.publish('content.card_frame.deleted', { tid }, { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.listCardBacks = async () => (await cardBacksCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.saveCardBack = async (data, actor = 'system') => {
  const payload = normalizeStudioTemplatePayload(data || {}, 'card_back');
  const result = await saveTidDocument(cardBacksCollection, payload);
  await Activity.LogActivity('admin_card_back_save', actor, { tid: result.tid });
  EventBus.publish('content.card_back.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deleteCardBack = async (tid, actor = 'system') => {
  const result = await deleteTidDocument(cardBacksCollection, tid);
  await Activity.LogActivity('admin_card_back_delete', actor, { tid });
  EventBus.publish('content.card_back.deleted', { tid }, { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.saveAdminImageAsset = async (data, actor = 'system') => {
  const { buffer, mimeType } = decodeImageDataUrl(data?.data_url);
  const category = sanitizePathSegment(data?.category, 'misc');
  const requestedName = String(data?.file_name || data?.label || 'image');
  const fileStem = sanitizePathSegment(path.parse(requestedName).name, 'image');
  const extension = resolveImageExtension(mimeType, requestedName);
  const fileName = `${fileStem}_${Date.now().toString(36)}_${createId().slice(-6)}${extension}`;
  const targetDir = path.join(adminAssetUploadRoot, category);
  const targetPath = path.join(targetDir, fileName);
  const urlPath = `/uploads/admin-assets/${encodeURIComponent(category)}/${encodeURIComponent(fileName)}`;

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, buffer);

  await Activity.LogActivity('admin_asset_upload', actor, {
    bytes: buffer.length,
    category,
    file_name: fileName,
    mime_type: mimeType,
  });

  return {
    bytes: buffer.length,
    category,
    file_name: fileName,
    mime_type: mimeType,
    path: urlPath,
    url: urlPath,
  };
};

exports.listGameFlows = async () => (await gameFlowsCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.getGameFlow = async (tid) => {
  const flow = await gameFlowsCollection.get(tid);
  if (!flow) {
    throw HttpTool.createError(404, `Game Flow not found: ${tid}`);
  }

  return normalizeDoc(flow);
};

exports.saveGameFlow = async (data, actor = 'system') => {
  const tid = requireTid(data || {});
  const timestamp = new Date();
  const payload = {
    ...data,
    connections: Array.isArray(data?.connections) ? data.connections.map((connection) => ({
      from: String(connection.from || ''),
      label: String(connection.label || ''),
      to: String(connection.to || ''),
    })) : [],
    nodes: Array.isArray(data?.nodes) ? data.nodes.map((node) => ({
      data: node.data || {},
      id: String(node.id || ''),
      type: String(node.type || 'state'),
      x: Number(node.x || 0),
      y: Number(node.y || 0),
    })) : [],
    tid,
    updatedAt: timestamp,
  };

  const existing = await gameFlowsCollection.get(tid);
  let result = null;

  if (existing) {
    Object.assign(existing, payload);
    result = await gameFlowsCollection.save(existing);
  } else {
    result = await gameFlowsCollection.create({
      ...payload,
      createdAt: timestamp,
    });
  }

  await Activity.LogActivity('admin_game_flow_save', actor, { tid });
  EventBus.publish('content.game_flow.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deleteGameFlow = async (tid, actor = 'system') => {
  const flow = await gameFlowsCollection.get(tid);
  if (!flow) {
    throw HttpTool.createError(404, `Game Flow not found: ${tid}`);
  }

  await gameFlowsCollection.remove(tid, flow.$meta);
  await Activity.LogActivity('admin_game_flow_delete', actor, { tid });
  EventBus.publish('content.game_flow.deleted', { tid }, { broadcast: true, admin: true });

  return {
    success: true,
    tid,
  };
};

exports.listCards = async (query = {}) => {
  const limit = parseLimit(query.limit, 100, 500);
  const filter = {};

  if (query.pack) filter.packs = { $in: [String(query.pack).trim()] };
  if (query.set) filter.set = String(query.set).trim();
  if (query.type) filter.type = String(query.type).trim();

  return (await cardsCollection.find(filter, {
    limit,
    sort: { tid: 1 },
  })).map((card) => normalizeDoc(card));
};

exports.getCard = async (tid) => {
  const card = await cardsCollection.get(tid);
  if (!card) {
    throw HttpTool.createError(404, `Card not found: ${tid}`);
  }

  return normalizeDoc(card);
};

exports.saveCard = async (cardData, actor = 'system') => {
  const tid = requireTid(cardData || {});
  const card = await CardModel.get(tid);
  const typeId = String(cardData?.type || card?.type || '');
  const cardType = typeId ? await cardTypesCollection.findOne({ tid: typeId }) : null;
  const explicitBackTid = cardData?.card_back_tid !== undefined
    ? String(cardData?.card_back_tid || '')
    : String(card?.card_back_tid || '');
  const sanitizedData = {
    ...cardData,
    tid,
    title: String(cardData?.title || cardData?.name || ''),
    name: String(cardData?.name || cardData?.title || ''),
    type: typeId,
    team: String(cardData?.team || ''),
    rarity: String(cardData?.rarity || ''),
    set: String(cardData?.set || ''),
    artist: String(cardData?.artist || ''),
    description: String(cardData?.description || ''),
    art_url: String(cardData?.art_url || ''),
    frame_tid: String(cardType?.default_frame_tid || ''),
    card_back_tid: explicitBackTid || String(cardType?.default_back_tid || ''),
    matchmaking_modifier: normalizeInteger(
      cardData?.matchmaking_modifier !== undefined ? cardData.matchmaking_modifier : card?.matchmaking_modifier,
      0,
      { min: -9999, max: 9999 }
    ),
    packs: normalizeStringArray(cardData?.packs),
    tags: normalizeStringArray(cardData?.tags),
    traits: normalizeStringArray(cardData?.traits),
    mana: normalizeInteger(cardData?.mana, 0, { min: 0 }),
    attack: normalizeInteger(cardData?.attack, 0, { min: 0 }),
    hp: normalizeInteger(cardData?.hp, 0, { min: 0 }),
    cost: normalizeInteger(cardData?.cost, 0, { min: 0 }),
    backs: Array.isArray(cardData?.backs) ? cardData.backs.map((back) => sanitizeJsonValue(back)) : [],
    frames: Array.isArray(cardData?.frames) ? cardData.frames.map((frame) => ({
      art: String(frame.art || ''),
      type: String(frame.type || 'default'),
      zones: Array.isArray(frame.zones) ? frame.zones.map((zone) => ({
        content: zone.content || {},
        height: Number(zone.height || 0),
        id: String(zone.id || ''),
        prefab: String(zone.prefab || ''),
        width: Number(zone.width || 0),
        x: Number(zone.x || 0),
        y: Number(zone.y || 0),
      })) : [],
    })) : [],
    studio_fields: sanitizeJsonValue(cardData?.studio_fields || {}),
    studio_notes: String(cardData?.studio_notes || ''),
  };

  const result = card
    ? await CardModel.update(card, sanitizedData)
    : await CardModel.create(sanitizedData);

  await Activity.LogActivity('admin_card_save', actor, { tid: result.tid });
  EventBus.publish('content.card.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.deleteCard = async (tid, actor = 'system') => {
  const card = await CardModel.get(tid);
  if (!card) {
    throw HttpTool.createError(404, `Card not found: ${tid}`);
  }

  const deleted = await CardModel.remove(tid);
  if (!deleted) {
    throw HttpTool.createError(500, 'Unable to delete card');
  }

  await Activity.LogActivity('admin_card_delete', actor, { tid });
  EventBus.publish('content.card.deleted', { tid }, { broadcast: true, admin: true });
  return normalizeDoc(card);
};

exports.listOffers = async (query = {}) => {
  const limit = parseLimit(query.limit, 25, 100);
  const filter = {};

  if (query.seller) filter.seller = exactCaseInsensitive(query.seller);
  if (query.card) filter.card = String(query.card).trim();

  return (await marketCollection.find(filter, {
    limit,
    sort: { time: -1 },
  })).map((offer) => normalizeDoc(offer, ['offer_id']));
};

exports.deleteOffer = async (offerId, actor = 'system') => {
  const offer = await marketCollection.get(offerId);
  if (!offer) {
    throw HttpTool.createError(404, `Offer not found: ${offerId}`);
  }

  const seller = await UserModel.getByUsername(offer.seller);
  if (seller) {
    const restored = await UserTool.addCards(seller, [{
      quantity: offer.quantity,
      tid: offer.card,
      variant: offer.variant,
    }]);

    if (!restored) {
      throw HttpTool.createError(500, 'Unable to restore cards to seller');
    }

    const savedUser = await UserModel.update(seller, { cards: seller.cards });
    if (!savedUser) {
      throw HttpTool.createError(500, 'Unable to update seller after offer removal');
    }

    EventBus.publish('player.updated', {
      userId: seller.id,
      changes: { cards: seller.cards },
    }, {
      user_ids: [seller.id],
      admin: true,
    });
  }

  const deleted = await marketCollection.remove(offerId, offer.$meta);
  if (!deleted) {
    throw HttpTool.createError(500, 'Unable to delete offer');
  }

  await Activity.LogActivity('admin_offer_remove', actor, {
    card: offer.card,
    offer_id: offerId,
    quantity: offer.quantity,
    restored_to_seller: Boolean(seller),
    seller: offer.seller,
    variant: offer.variant,
  });

  EventBus.publish('market.offer.deleted', { offerId, seller: offer.seller }, { broadcast: true, admin: true });
  return normalizeDoc(offer, ['offer_id']);
};

exports.giveReward = async (userId, reward = {}, actor = 'system') => {
  if (!reward || typeof reward !== 'object' || Array.isArray(reward)) {
    throw HttpTool.createError(400, 'reward must be an object');
  }

  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, `User not found: ${userId}`);
  }

  const valid = await UserTool.GainUserReward(user, reward);
  if (!valid) {
    throw HttpTool.createError(500, 'Error when adding rewards');
  }

  const updatedUser = await UserModel.save(user);
  if (!updatedUser) {
    throw HttpTool.createError(500, 'Error updating user');
  }

  await Activity.LogActivity('admin_reward_give', actor, {
    reward,
    user: user.username,
  });

  EventBus.publish('player.rewarded', { reward, userId: user.id }, { user_ids: [user.id], admin: true });
  EventBus.publish('player.updated', { changes: reward, userId: user.id }, { user_ids: [user.id], admin: true });
  return updatedUser.deleteSecrets();
};

exports._private = {
  buildCollectionDensity,
  summarizePerformance,
};
