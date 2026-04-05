const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const DEFAULT_JWT_SECRET = 'JWT_123456789';
const DOTENV_FILES = ['.env', '.env.local'];
const DATABASE_ENV_KEYS = [
  'MONGO_URI',
  'MONGODB_URI',
  'MONGO_HOST',
  'MONGO_PORT',
  'MONGO_DB',
  'MONGO_USER',
  'MONGO_PASS',
  'GAME_DB_DRIVER',
  'GAME_DB_URL',
  'GAME_DB_HOST',
  'GAME_DB_PORT',
  'GAME_DB_NAME',
  'GAME_DB_USER',
  'GAME_DB_PASS',
  'GAME_DB_SSL',
  'OPS_DB_DRIVER',
  'OPS_DB_URL',
  'OPS_DB_HOST',
  'OPS_DB_PORT',
  'OPS_DB_NAME',
  'OPS_DB_USER',
  'OPS_DB_PASS',
  'OPS_DB_SSL',
];

const shellEnvKeys = new Set(Object.keys(process.env));
let loadedEnvKeys = new Set();

const getEnvFilePath = (fileName) => path.join(__dirname, fileName);

const loadDotEnvFiles = () => {
  loadedEnvKeys.forEach((key) => {
    if (!shellEnvKeys.has(key)) {
      delete process.env[key];
    }
  });

  loadedEnvKeys = new Set();

  DOTENV_FILES.forEach((fileName) => {
    const filePath = getEnvFilePath(fileName);
    if (!fs.existsSync(filePath)) {
      return;
    }

    const parsed = dotenv.parse(fs.readFileSync(filePath, 'utf8'));
    Object.entries(parsed).forEach(([key, value]) => {
      if (!shellEnvKeys.has(key)) {
        process.env[key] = value;
        loadedEnvKeys.add(key);
      }
    });
  });
};

const parseBoolean = (value, fallback) => {
  if (value === undefined) {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseInteger = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) ? parsed : fallback;
};

const parseList = (value, fallback) => {
  if (value === undefined || value === null || value === '') {
    return fallback.slice();
  }

  if (Array.isArray(value)) {
    return value.map((entry) => String(entry).trim()).filter(Boolean);
  }

  return String(value)
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const normalizeHost = (value) => {
  if (!value) {
    return '';
  }

  const text = String(value).trim();
  try {
    const url = new URL(text.includes('://') ? text : `https://${text}`);
    return url.hostname.toLowerCase();
  } catch (error) {
    return text
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase();
  }
};

const normalizeDbDriver = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const aliases = {
    sql: 'mssql',
    sqlserver: 'mssql',
    postgresql: 'postgres',
    pg: 'postgres',
    myql: 'mysql',
  };

  return aliases[normalized] || normalized;
};

const buildSqlUrl = (scheme, fields) => {
  const credentials = fields.user
    ? `${encodeURIComponent(fields.user)}:${encodeURIComponent(fields.pass || '')}@`
    : '';

  return `${scheme}://${credentials}${fields.host}:${fields.port}/${fields.name}`;
};

const defaults = {
  version: '1.13',
  node_env: process.env.NODE_ENV || 'development',

  port: 3000,
  port_https: 3443,
  api_title: 'TCG Engine API',
  api_url: '',

  https_key: '/etc/letsencrypt/live/yoursite.com/privkey.pem',
  https_ca: '/etc/letsencrypt/live/yoursite.com/chain.pem',
  https_cert: '/etc/letsencrypt/live/yoursite.com/cert.pem',
  allow_http: true,
  allow_https: false,

  jwt_secret: DEFAULT_JWT_SECRET,
  jwt_expiration: 3600 * 10,
  jwt_refresh_expiration: 3600 * 100,

  permissions: {
    USER: 1,
    SERVER: 5,
    ADMIN: 10,
  },

  mongo_user: '',
  mongo_pass: '',
  mongo_host: '127.0.0.1',
  mongo_port: '27017',
  mongo_db: 'tcgengine',
  mongo_server_selection_timeout_ms: 5000,

  game_db_driver: 'mongo',
  game_db_host: '127.0.0.1',
  game_db_port: '',
  game_db_name: 'tcgengine',
  game_db_user: '',
  game_db_pass: '',
  game_db_ssl: false,

  ops_db_driver: 'mongo',
  ops_db_host: '127.0.0.1',
  ops_db_port: '',
  ops_db_name: 'tcgengine_ops',
  ops_db_user: '',
  ops_db_pass: '',
  ops_db_ssl: false,

  limiter_window: 1000 * 120,
  limiter_max: 500,
  limiter_post_max: 100,
  limiter_auth_max: 10,
  limiter_proxy: false,

  ip_whitelist: ['127.0.0.1'],
  ip_blacklist: [],

  smtp_enabled: false,
  smtp_name: 'TCG Engine',
  smtp_email: '',
  smtp_server: '',
  smtp_port: '465',
  smtp_user: '',
  smtp_password: '',

  elo_k: 32,
  elo_ini_k: 128,
  elo_ini_match: 5,

  start_coins: 5000,
  start_elo: 1000,

  coins_victory: 200,
  coins_defeat: 100,
  xp_victory: 100,
  xp_defeat: 50,

  sell_ratio: 0.8,
  avatar_cost: 500,
  cardback_cost: 1000,

  request_log_enabled: true,
  network_stack: 'node',
  network_socket_no_delay: true,
  network_socket_keep_alive: true,
  network_keep_alive_initial_delay_ms: 1000,
  http_compression_enabled: true,
  http_compression_threshold: 1024,
  http_keep_alive_timeout_ms: 65000,
  http_headers_timeout_ms: 66000,
  http_request_timeout_ms: 30000,
  http_max_requests_per_socket: 0,
  websocket_enabled: true,
  websocket_path: '/ws',
  rcon_enabled: false,
  rcon_host: '127.0.0.1',
  rcon_port: 27090,
  rcon_password: '',
  rbac_legacy_admin_fallback: true,
};

const buildConfig = () => {
  const config = {
    version: process.env.API_VERSION || defaults.version,
    node_env: defaults.node_env,

    port: parseInteger(process.env.PORT, defaults.port),
    port_https: parseInteger(process.env.PORT_HTTPS, defaults.port_https),
    api_title: process.env.API_TITLE || defaults.api_title,
    api_url: process.env.API_URL || defaults.api_url,

    https_key: process.env.HTTPS_KEY || defaults.https_key,
    https_ca: process.env.HTTPS_CA || defaults.https_ca,
    https_cert: process.env.HTTPS_CERT || defaults.https_cert,
    allow_http: parseBoolean(process.env.ALLOW_HTTP, defaults.allow_http),
    allow_https: parseBoolean(process.env.ALLOW_HTTPS, defaults.allow_https),

    jwt_secret: process.env.JWT_SECRET || defaults.jwt_secret,
    jwt_expiration: parseInteger(process.env.JWT_EXPIRATION, defaults.jwt_expiration),
    jwt_refresh_expiration: parseInteger(process.env.JWT_REFRESH_EXPIRATION, defaults.jwt_refresh_expiration),

    permissions: {
      USER: parseInteger(process.env.PERMISSION_USER, defaults.permissions.USER),
      SERVER: parseInteger(process.env.PERMISSION_SERVER, defaults.permissions.SERVER),
      ADMIN: parseInteger(process.env.PERMISSION_ADMIN, defaults.permissions.ADMIN),
    },

    mongo_user: process.env.MONGO_USER || defaults.mongo_user,
    mongo_pass: process.env.MONGO_PASS || defaults.mongo_pass,
    mongo_host: process.env.MONGO_HOST || defaults.mongo_host,
    mongo_port: String(process.env.MONGO_PORT || defaults.mongo_port),
    mongo_db: process.env.MONGO_DB || defaults.mongo_db,
    mongo_server_selection_timeout_ms: parseInteger(
      process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
      defaults.mongo_server_selection_timeout_ms
    ),

    game_db_driver: normalizeDbDriver(process.env.GAME_DB_DRIVER || defaults.game_db_driver),
    game_db_host: process.env.GAME_DB_HOST || defaults.game_db_host,
    game_db_port: String(process.env.GAME_DB_PORT || defaults.game_db_port),
    game_db_name: process.env.GAME_DB_NAME || defaults.game_db_name,
    game_db_user: process.env.GAME_DB_USER || defaults.game_db_user,
    game_db_pass: process.env.GAME_DB_PASS || defaults.game_db_pass,
    game_db_ssl: parseBoolean(process.env.GAME_DB_SSL, defaults.game_db_ssl),

    ops_db_driver: normalizeDbDriver(process.env.OPS_DB_DRIVER || defaults.ops_db_driver),
    ops_db_host: process.env.OPS_DB_HOST || defaults.ops_db_host,
    ops_db_port: String(process.env.OPS_DB_PORT || defaults.ops_db_port),
    ops_db_name: process.env.OPS_DB_NAME || defaults.ops_db_name,
    ops_db_user: process.env.OPS_DB_USER || defaults.ops_db_user,
    ops_db_pass: process.env.OPS_DB_PASS || defaults.ops_db_pass,
    ops_db_ssl: parseBoolean(process.env.OPS_DB_SSL, defaults.ops_db_ssl),

    limiter_window: parseInteger(process.env.LIMITER_WINDOW, defaults.limiter_window),
    limiter_max: parseInteger(process.env.LIMITER_MAX, defaults.limiter_max),
    limiter_post_max: parseInteger(process.env.LIMITER_POST_MAX, defaults.limiter_post_max),
    limiter_auth_max: parseInteger(process.env.LIMITER_AUTH_MAX, defaults.limiter_auth_max),
    limiter_proxy: parseBoolean(process.env.LIMITER_PROXY, defaults.limiter_proxy),

    ip_whitelist: parseList(process.env.IP_WHITELIST, defaults.ip_whitelist),
    ip_blacklist: parseList(process.env.IP_BLACKLIST, defaults.ip_blacklist),

    smtp_enabled: parseBoolean(process.env.SMTP_ENABLED, defaults.smtp_enabled),
    smtp_name: process.env.SMTP_NAME || defaults.smtp_name,
    smtp_email: process.env.SMTP_EMAIL || defaults.smtp_email,
    smtp_server: process.env.SMTP_SERVER || defaults.smtp_server,
    smtp_port: String(process.env.SMTP_PORT || defaults.smtp_port),
    smtp_user: process.env.SMTP_USER || defaults.smtp_user,
    smtp_password: process.env.SMTP_PASSWORD || defaults.smtp_password,

    elo_k: parseInteger(process.env.ELO_K, defaults.elo_k),
    elo_ini_k: parseInteger(process.env.ELO_INI_K, defaults.elo_ini_k),
    elo_ini_match: parseInteger(process.env.ELO_INI_MATCH, defaults.elo_ini_match),

    start_coins: parseInteger(process.env.START_COINS, defaults.start_coins),
    start_elo: parseInteger(process.env.START_ELO, defaults.start_elo),

    coins_victory: parseInteger(process.env.COINS_VICTORY, defaults.coins_victory),
    coins_defeat: parseInteger(process.env.COINS_DEFEAT, defaults.coins_defeat),
    xp_victory: parseInteger(process.env.XP_VICTORY, defaults.xp_victory),
    xp_defeat: parseInteger(process.env.XP_DEFEAT, defaults.xp_defeat),

    sell_ratio: Number(process.env.SELL_RATIO || defaults.sell_ratio),
    avatar_cost: parseInteger(process.env.AVATAR_COST, defaults.avatar_cost),
    cardback_cost: parseInteger(process.env.CARDBACK_COST, defaults.cardback_cost),

    request_log_enabled: parseBoolean(process.env.REQUEST_LOG_ENABLED, defaults.request_log_enabled),
    network_stack: String(process.env.NETWORK_STACK || defaults.network_stack).trim().toLowerCase(),
    network_socket_no_delay: parseBoolean(process.env.NETWORK_SOCKET_NO_DELAY, defaults.network_socket_no_delay),
    network_socket_keep_alive: parseBoolean(process.env.NETWORK_SOCKET_KEEP_ALIVE, defaults.network_socket_keep_alive),
    network_keep_alive_initial_delay_ms: parseInteger(process.env.NETWORK_KEEP_ALIVE_INITIAL_DELAY_MS, defaults.network_keep_alive_initial_delay_ms),
    http_compression_enabled: parseBoolean(process.env.HTTP_COMPRESSION_ENABLED, defaults.http_compression_enabled),
    http_compression_threshold: parseInteger(process.env.HTTP_COMPRESSION_THRESHOLD, defaults.http_compression_threshold),
    http_keep_alive_timeout_ms: parseInteger(process.env.HTTP_KEEP_ALIVE_TIMEOUT_MS, defaults.http_keep_alive_timeout_ms),
    http_headers_timeout_ms: parseInteger(process.env.HTTP_HEADERS_TIMEOUT_MS, defaults.http_headers_timeout_ms),
    http_request_timeout_ms: parseInteger(process.env.HTTP_REQUEST_TIMEOUT_MS, defaults.http_request_timeout_ms),
    http_max_requests_per_socket: parseInteger(process.env.HTTP_MAX_REQUESTS_PER_SOCKET, defaults.http_max_requests_per_socket),
    websocket_enabled: parseBoolean(process.env.WEBSOCKET_ENABLED, defaults.websocket_enabled),
    websocket_path: process.env.WEBSOCKET_PATH || defaults.websocket_path,
    rcon_enabled: parseBoolean(process.env.RCON_ENABLED, defaults.rcon_enabled),
    rcon_host: process.env.RCON_HOST || defaults.rcon_host,
    rcon_port: parseInteger(process.env.RCON_PORT, defaults.rcon_port),
    rcon_password: process.env.RCON_PASSWORD || defaults.rcon_password,
    rbac_legacy_admin_fallback: parseBoolean(process.env.RBAC_LEGACY_ADMIN_FALLBACK, defaults.rbac_legacy_admin_fallback),
  };

  config.api_host = normalizeHost(config.api_url);
  config.is_default_jwt_secret = config.jwt_secret === DEFAULT_JWT_SECRET;

  const mongoCredentials = config.mongo_user && config.mongo_pass
    ? `${encodeURIComponent(config.mongo_user)}:${encodeURIComponent(config.mongo_pass)}@`
    : '';
  const mongoAuthSource = mongoCredentials ? '?authSource=admin' : '';
  config.mongo_uri = process.env.MONGODB_URI || process.env.MONGO_URI
    || `mongodb://${mongoCredentials}${config.mongo_host}:${config.mongo_port}/${config.mongo_db}${mongoAuthSource}`;

  const defaultPorts = {
    mongo: '27017',
    mysql: '3306',
    postgres: '5432',
    mssql: '1433',
  };

  config.game_db_port = config.game_db_port || defaultPorts[config.game_db_driver] || '';
  config.ops_db_port = config.ops_db_port || defaultPorts[config.ops_db_driver] || '';

  if (config.game_db_driver === 'mongo') {
    config.game_db_url = process.env.GAME_DB_URL || config.mongo_uri;
  } else if (config.game_db_driver === 'mysql') {
    config.game_db_url = process.env.GAME_DB_URL || buildSqlUrl('mysql', {
      host: config.game_db_host,
      port: config.game_db_port,
      name: config.game_db_name,
      user: config.game_db_user,
      pass: config.game_db_pass,
    });
  } else if (config.game_db_driver === 'postgres') {
    config.game_db_url = process.env.GAME_DB_URL || buildSqlUrl('postgres', {
      host: config.game_db_host,
      port: config.game_db_port,
      name: config.game_db_name,
      user: config.game_db_user,
      pass: config.game_db_pass,
    });
  } else if (config.game_db_driver === 'mssql') {
    config.game_db_url = process.env.GAME_DB_URL || buildSqlUrl('mssql', {
      host: config.game_db_host,
      port: config.game_db_port,
      name: config.game_db_name,
      user: config.game_db_user,
      pass: config.game_db_pass,
    });
  } else {
    config.game_db_url = process.env.GAME_DB_URL || '';
  }

  if (config.ops_db_driver === 'mongo') {
    config.ops_db_url = process.env.OPS_DB_URL || config.mongo_uri;
  } else if (config.ops_db_driver === 'mysql') {
    config.ops_db_url = process.env.OPS_DB_URL || buildSqlUrl('mysql', {
      host: config.ops_db_host,
      port: config.ops_db_port,
      name: config.ops_db_name,
      user: config.ops_db_user,
      pass: config.ops_db_pass,
    });
  } else if (config.ops_db_driver === 'postgres') {
    config.ops_db_url = process.env.OPS_DB_URL || buildSqlUrl('postgres', {
      host: config.ops_db_host,
      port: config.ops_db_port,
      name: config.ops_db_name,
      user: config.ops_db_user,
      pass: config.ops_db_pass,
    });
  } else if (config.ops_db_driver === 'mssql') {
    config.ops_db_url = process.env.OPS_DB_URL || buildSqlUrl('mssql', {
      host: config.ops_db_host,
      port: config.ops_db_port,
      name: config.ops_db_name,
      user: config.ops_db_user,
      pass: config.ops_db_pass,
    });
  } else {
    config.ops_db_url = process.env.OPS_DB_URL || '';
  }

  const explicitDatabaseConfigKeys = DATABASE_ENV_KEYS.filter(
    (key) => shellEnvKeys.has(key) || loadedEnvKeys.has(key)
  );

  config.has_explicit_database_config = explicitDatabaseConfigKeys.length > 0;
  config.explicit_database_config_keys = explicitDatabaseConfigKeys;
  config.requires_first_run_setup = !config.has_explicit_database_config;

  return config;
};

const syncConfig = (target, source) => {
  Object.keys(target).forEach((key) => {
    delete target[key];
  });

  Object.assign(target, source);
};

const config = {};

const reload = () => {
  loadDotEnvFiles();
  syncConfig(config, buildConfig());
  return config;
};

Object.defineProperties(config, {
  reload: {
    value: reload,
    enumerable: false,
  },
  getEnvFilePath: {
    value: getEnvFilePath,
    enumerable: false,
  },
  getLoadedEnvKeys: {
    value: () => Array.from(loadedEnvKeys),
    enumerable: false,
  },
  getShellEnvKeys: {
    value: () => Array.from(shellEnvKeys),
    enumerable: false,
  },
  normalizeDbDriver: {
    value: normalizeDbDriver,
    enumerable: false,
  },
});

reload();

module.exports = config;
