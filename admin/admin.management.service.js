const Activity = require('../activity/activity.model');
const CardModel = require('../cards/cards.model');
const config = require('../config');
const EventBus = require('../realtime/event-bus');
const GameStore = require('../game/game.store');
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
const cardTypesCollection = GameStore.collection('card_types');
const gameFlowsCollection = GameStore.collection('game_flows');
const keywordsCollection = GameStore.collection('keywords');
const marketCollection = GameStore.collection('market');
const matchEventsCollection = GameStore.collection('match_events');
const matchesCollection = GameStore.collection('matches');
const packsCollection = GameStore.collection('packs');
const setsCollection = GameStore.collection('sets');
const usersCollection = GameStore.collection('users');

const exactCaseInsensitive = (value) => new RegExp(`^${String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');

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

const sortHistoryEntries = (entries) => entries
  .slice()
  .sort((left, right) => {
    const leftTime = new Date(left.timestamp || left.createdAt || 0).getTime();
    const rightTime = new Date(right.timestamp || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });

exports.resetDatabase = async (actor = 'system') => {
  const collections = [
    activityCollection,
    bansCollection,
    cardsCollection,
    cardTypesCollection,
    gameFlowsCollection,
    keywordsCollection,
    marketCollection,
    matchesCollection,
    matchEventsCollection,
    packsCollection,
    setsCollection,
    GameStore.collection('decks'),
    GameStore.collection('rewards'),
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
  const user = await UserModel.getById(userId);
  if (!user) {
    throw HttpTool.createError(404, 'User not found');
  }

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
    cards: enhancedCards,
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

exports.listPacks = async () => (await packsCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.savePack = async (data, actor = 'system') => {
  const result = await saveTidDocument(packsCollection, data || {});
  await Activity.LogActivity('admin_pack_save', actor, { tid: result.tid });
  EventBus.publish('content.pack.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
};

exports.listCardTypes = async () => (await cardTypesCollection.find({}, { sort: { tid: 1 } })).map((entry) => normalizeDoc(entry));

exports.saveCardType = async (data, actor = 'system') => {
  const result = await saveTidDocument(cardTypesCollection, data || {});
  await Activity.LogActivity('admin_card_type_save', actor, { tid: result.tid });
  EventBus.publish('content.card_type.updated', normalizeDoc(result), { broadcast: true, admin: true });
  return normalizeDoc(result);
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
  const sanitizedData = {
    ...cardData,
    backs: Array.isArray(cardData?.backs) ? cardData.backs : [],
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
    tid,
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
