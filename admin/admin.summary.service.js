const os = require('os');
const mongoose = require('mongoose');

const config = require('../config');
const GameStore = require('../game/game.store');
const OpsStore = require('../ops/ops.store');
const RbacService = require('../rbac/rbac.service');

const activityCollection = GameStore.collection('activity');
const bansCollection = GameStore.collection('bans');
const cardsCollection = GameStore.collection('cards');
const cardTypesCollection = GameStore.collection('card_types');
const decksCollection = GameStore.collection('decks');
const gameFlowsCollection = GameStore.collection('game_flows');
const keywordsCollection = GameStore.collection('keywords');
const marketCollection = GameStore.collection('market');
const matchesCollection = GameStore.collection('matches');
const packsCollection = GameStore.collection('packs');
const rewardsCollection = GameStore.collection('rewards');
const setsCollection = GameStore.collection('sets');
const usersCollection = GameStore.collection('users');
const variantsCollection = GameStore.collection('variants');

const ONLINE_WINDOW_MS = 10 * 60 * 1000;

const usesMongoConnection = () => config.game_db_driver === 'mongo' || config.ops_db_driver === 'mongo';

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

  if (data._id && !data.id) {
    data.id = String(data._id);
    delete data._id;
  }

  delete data.__v;
  return data;
};

const getDatabaseInfo = (gameStatus) => {
  const gameDriverIsMongo = config.game_db_driver === 'mongo';

  return {
    connected: gameStatus.connected,
    driver: config.game_db_driver,
    detail: gameStatus.detail,
    ready_state: gameDriverIsMongo ? mongoose.connection.readyState : (gameStatus.connected ? 1 : 0),
    host: gameDriverIsMongo ? config.mongo_host : config.game_db_host,
    database: gameDriverIsMongo ? config.mongo_db : config.game_db_name,
  };
};

const getAlerts = (gameStatus, opsStatus) => {
  const alerts = [];

  if (!gameStatus.connected) {
    alerts.push({
      level: 'danger',
      title: 'Gameplay store disconnected',
      detail: `The ${gameStatus.driver} gameplay store is not ready. Core game data may be unavailable.`,
    });
  }

  if (!opsStatus.connected) {
    alerts.push({
      level: 'warning',
      title: 'Operational store disconnected',
      detail: `The ${opsStatus.driver} ops store is not connected. Trading and RBAC changes may be unavailable.`,
    });
  }

  if (config.is_default_jwt_secret) {
    alerts.push({
      level: 'warning',
      title: 'Default JWT secret in use',
      detail: 'Set JWT_SECRET before exposing this API outside development.',
    });
  }

  if (config.node_env === 'production' && !config.allow_https) {
    alerts.push({
      level: 'warning',
      title: 'HTTPS disabled',
      detail: 'Production traffic is currently configured without HTTPS termination.',
    });
  }

  if (!config.smtp_enabled) {
    alerts.push({
      level: 'info',
      title: 'SMTP disabled',
      detail: 'Email-driven flows such as password recovery will not send messages.',
    });
  }

  if (!config.websocket_enabled) {
    alerts.push({
      level: 'info',
      title: 'Websocket transport disabled',
      detail: 'Realtime notifications are currently turned off.',
    });
  }

  if (config.rcon_enabled && !config.rcon_password) {
    alerts.push({
      level: 'info',
      title: 'RCON password not set',
      detail: 'RCON is enabled without a shared password; JWT auth is still required for role-scoped access.',
    });
  }

  return alerts;
};

const safeGetStats = (modulePath, fallback) => {
  try {
    return require(modulePath).getStats();
  } catch (error) {
    return fallback;
  }
};

const safeStoreCall = async (factory, fallback) => {
  try {
    return await factory();
  } catch (error) {
    return fallback;
  }
};

exports.getSummary = async () => {
  const onlineSince = new Date(Date.now() - ONLINE_WINDOW_MS);
  const gameStatus = GameStore.getStatus();
  const opsStatus = OpsStore.getStatus();
  const websocketStats = safeGetStats('../realtime/websocket.server', {
    enabled: config.websocket_enabled,
    connected_clients: 0,
    authenticated_clients: 0,
    admin_observers: 0,
    path: config.websocket_path,
    servers: 0,
  });
  const rconStats = safeGetStats('../rcon/rcon.server', {
    enabled: config.rcon_enabled,
    active_clients: 0,
    host: config.rcon_host,
    port: config.rcon_port,
  });

  const [
    totalUsers,
    validatedUsers,
    adminUsers,
    serverUsers,
    playerUsers,
    disabledUsers,
    onlineCount,
    onlineUsers,
    cards,
    packs,
    decks,
    variants,
    rewards,
    matches,
    offers,
    activities,
    bans,
    keywords,
    sets,
    cardTypes,
    gameFlows,
    newestUsers,
    recentActivity,
    recentMatches,
    recentOffers,
    recentTrades,
    roles,
  ] = await Promise.all([
    usersCollection.count({}),
    usersCollection.count({ validation_level: { $gte: 1 } }),
    usersCollection.count({ permission_level: { $gte: config.permissions.ADMIN } }),
    usersCollection.count({
      permission_level: {
        $gte: config.permissions.SERVER,
        $lt: config.permissions.ADMIN,
      },
    }),
    usersCollection.count({
      permission_level: {
        $gte: config.permissions.USER,
        $lt: config.permissions.SERVER,
      },
    }),
    usersCollection.count({ permission_level: { $lt: config.permissions.USER } }),
    usersCollection.count({ last_online_time: { $gte: onlineSince } }),
    usersCollection.find(
      { last_online_time: { $gte: onlineSince } },
      { sort: { last_online_time: -1 }, limit: 12 }
    ),
    cardsCollection.count({}),
    packsCollection.count({}),
    decksCollection.count({}),
    variantsCollection.count({}),
    rewardsCollection.count({}),
    matchesCollection.count({}),
    marketCollection.count({}),
    activityCollection.count({}),
    bansCollection.count({}),
    keywordsCollection.count({}),
    setsCollection.count({}),
    cardTypesCollection.count({}),
    gameFlowsCollection.count({}),
    usersCollection.find({}, {
      sort: { account_create_time: -1 },
      limit: 6,
    }),
    activityCollection.find({}, {
      sort: { timestamp: -1 },
      limit: 10,
    }),
    matchesCollection.find({}, {
      sort: { end: -1, start: -1 },
      limit: 10,
    }),
    marketCollection.find({}, {
      sort: { time: -1 },
      limit: 10,
    }),
    safeStoreCall(() => OpsStore.listTrades({ limit: 10 }), []),
    safeStoreCall(() => OpsStore.listRoles(), []),
  ]);

  return {
    generated_at: new Date(),
    system: {
      title: config.api_title,
      version: config.version,
      environment: config.node_env,
      uptime_seconds: Math.round(process.uptime()),
      hostname: os.hostname(),
      platform: process.platform,
      node_version: process.version,
      memory: process.memoryUsage(),
    },
    database: getDatabaseInfo(gameStatus),
    operations: {
      store: opsStatus,
      game_store: gameStatus,
      transport: {
        stack: config.network_stack,
        compression_enabled: config.http_compression_enabled,
        keep_alive_timeout_ms: config.http_keep_alive_timeout_ms,
        request_timeout_ms: config.http_request_timeout_ms,
      },
      websocket: websocketStats,
      rcon: rconStats,
      roles: roles.length,
      recent_trades: recentTrades.length,
    },
    security: {
      permissions: { ...config.permissions },
      permission_scopes: RbacService.PERMISSIONS.slice(),
      allow_http: config.allow_http,
      allow_https: config.allow_https,
      smtp_enabled: config.smtp_enabled,
      request_log_enabled: config.request_log_enabled,
      limiter_proxy: config.limiter_proxy,
      api_host_restriction: config.api_host || '',
      rbac_legacy_admin_fallback: config.rbac_legacy_admin_fallback,
    },
    alerts: getAlerts(gameStatus, opsStatus),
    collections: {
      users: totalUsers,
      cards,
      packs,
      decks,
      variants,
      rewards,
      matches,
      offers,
      activities,
      bans,
      keywords,
      sets,
      card_types: cardTypes,
      game_flows: gameFlows,
    },
    users: {
      total: totalUsers,
      validated: validatedUsers,
      online: onlineCount,
      permission_breakdown: {
        admin: adminUsers,
        server: serverUsers,
        user: playerUsers,
        disabled: disabledUsers,
      },
      online_users: onlineUsers.map((entry) => normalizeDoc(entry)),
      newest_users: newestUsers.map((entry) => normalizeDoc(entry)),
    },
    recent_activity: recentActivity.map((entry) => normalizeDoc(entry)),
    recent_matches: recentMatches.map((entry) => normalizeDoc(entry)),
    recent_offers: recentOffers.map((entry) => normalizeDoc(entry, ['offer_id'])),
    recent_trades: recentTrades.map((entry) => normalizeDoc(entry)),
    roles: roles.map((entry) => normalizeDoc(entry)),
    mongo: {
      enabled: usesMongoConnection(),
      ready_state: mongoose.connection.readyState,
    },
  };
};
