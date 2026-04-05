const crypto = require('crypto');
const fs = require('fs');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const mysql = require('mysql2/promise');
const { Client: PgClient } = require('pg');

const config = require('../config');
const Activity = require('../activity/activity.model');
const { resolveSqlServerClient } = require('../tools/mssql.tool');
const UserModel = require('../users/users.model');
const UserTool = require('../users/users.tool');
const Validator = require('../tools/validator.tool');

const SUPPORTED_DRIVERS = ['mongo', 'mysql', 'postgres', 'mssql'];
const CONNECTION_TIMEOUT_MS = 30000;
const ENV_FILE_NAME = '.env';
const DRIVER_EXAMPLES = {
  mongo: 'mongodb://127.0.0.1:27017/tcgengine',
  mysql: 'mysql://user:password@127.0.0.1:3306/tcgengine',
  postgres: 'postgres://user:password@127.0.0.1:5432/tcgengine',
  mssql: 'Data Source=SERVER;Initial Catalog=tcgengine;User ID=user;Password=password;Encrypt=False',
};

const trimText = (value) => String(value ?? '').trim();

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
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

const withTimeout = async (executor, label) => {
  let timeoutId = null;

  try {
    return await Promise.race([
      Promise.resolve().then(executor),
      new Promise((resolve, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`${label} timed out after ${CONNECTION_TIMEOUT_MS}ms`));
        }, CONNECTION_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
};

const getConfiguredStoreDefaults = () => ({
  game_db: config.has_explicit_database_config
    ? {
      driver: config.game_db_driver,
      url: config.game_db_url,
    }
    : null,
  ops_db: config.has_explicit_database_config
    ? {
      driver: config.ops_db_driver,
      url: config.ops_db_url,
    }
    : null,
  use_same_operations_store: config.has_explicit_database_config
    ? config.game_db_driver === config.ops_db_driver && config.game_db_url === config.ops_db_url
    : true,
});

const normalizeStoreInput = (input, label, fallback = null) => {
  const driver = config.normalizeDbDriver(trimText(input?.driver) || fallback?.driver);
  const url = trimText(input?.url) || trimText(fallback?.url);

  if (!SUPPORTED_DRIVERS.includes(driver)) {
    throw new Error(`${label} driver must be one of: ${SUPPORTED_DRIVERS.join(', ')}`);
  }

  if (!url) {
    throw new Error(`${label} connection string is required`);
  }

  return { driver, url };
};

const normalizeAdminInput = (input = {}) => {
  const username = trimText(input.username);
  const email = trimText(input.email).toLowerCase();
  const password = String(input.password ?? '');
  const hasAnyValue = Boolean(username || email || password);

  if (!hasAnyValue) {
    return null;
  }

  if (!username || !email || !password) {
    throw new Error('Provide admin username, email, and password, or leave the admin section empty');
  }

  if (!Validator.validateUsername(username)) {
    throw new Error('Admin username must be 3-50 characters, start with a letter, and use only letters or digits');
  }

  if (!Validator.validateEmail(email)) {
    throw new Error('Admin email is invalid');
  }

  if (!Validator.validatePassword(password)) {
    throw new Error('Admin password must be 4-50 characters');
  }

  return { username, email, password };
};

const generateJwtSecret = () => crypto.randomBytes(32).toString('hex');

const testMongoConnection = async (url) => {
  const instance = new mongoose.Mongoose();

  try {
    await instance.connect(url, {
      serverSelectionTimeoutMS: CONNECTION_TIMEOUT_MS,
      connectTimeoutMS: CONNECTION_TIMEOUT_MS,
      socketTimeoutMS: CONNECTION_TIMEOUT_MS,
    });
  } finally {
    await instance.disconnect().catch(() => {});
  }
};

const testMySqlConnection = async (url) => {
  const connection = await mysql.createConnection(url);

  try {
    await connection.query('SELECT 1');
  } finally {
    await connection.end().catch(() => {});
  }
};

const testPostgresConnection = async (url) => {
  const client = new PgClient({
    connectionString: url,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
  });

  try {
    await client.connect();
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => {});
  }
};

const testMsSqlConnection = async (url) => {
  const resolved = resolveSqlServerClient({
    connectionString: url,
  });

  const pool = await new resolved.sql.ConnectionPool(resolved.config).connect();
  try {
    await pool.request().query('SELECT 1 AS ok');
  } finally {
    await pool.close().catch(() => {});
  }
};

const testConnection = async (store, label) => {
  const testerMap = {
    mongo: () => testMongoConnection(store.url),
    mysql: () => testMySqlConnection(store.url),
    postgres: () => testPostgresConnection(store.url),
    mssql: () => testMsSqlConnection(store.url),
  };

  await withTimeout(testerMap[store.driver], `${label} connection`);

  return {
    driver: store.driver,
    label,
    success: true,
  };
};

const readEnvFile = () => {
  const envPath = config.getEnvFilePath(ENV_FILE_NAME);
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return dotenv.parse(fs.readFileSync(envPath, 'utf8'));
};

const formatEnvValue = (value) => {
  const text = String(value ?? '');
  // Always quote values that contain special characters commonly found in connection strings
  // This includes +, ?, =, &, #, spaces, quotes, and other characters that could cause parsing issues
  if (/^[A-Za-z0-9_./:-]+$/.test(text)) {
    return text;
  }
  // Use double quotes and escape any internal double quotes
  return `"${text.replace(/"/g, '\\"')}"`;
};

const buildEnvFileContents = (entries) => {
  const lines = [
    '# Generated by TCG Engine first-run setup',
    `# Updated ${new Date().toISOString()}`,
    '',
  ];

  Object.keys(entries).sort().forEach((key) => {
    lines.push(`${key}=${formatEnvValue(entries[key])}`);
  });

  lines.push('');
  return lines.join('\n');
};

const buildSetupEnvEntries = (payload) => {
  const existing = readEnvFile();

  const entries = {
    ...existing,
    API_TITLE: payload.api_title,
    GAME_DB_DRIVER: payload.game_db.driver,
    GAME_DB_URL: payload.game_db.url,
    JWT_SECRET: payload.jwt_secret,
    OPS_DB_DRIVER: payload.ops_db.driver,
    OPS_DB_URL: payload.ops_db.url,
  };

  // When using MongoDB, also set MONGO_URI for proper config.mongo_uri resolution
  if (payload.game_db.driver === 'mongo') {
    entries.MONGO_URI = payload.game_db.url;
  }

  return entries;
};

exports.normalizeSetupPayload = (input = {}) => {
  const configuredDefaults = getConfiguredStoreDefaults();
  const useSameOperationsStore = parseBoolean(
    input.use_same_operations_store,
    configuredDefaults.use_same_operations_store
  );

  const gameStore = normalizeStoreInput({
    driver: input.game_db_driver || input.game_db?.driver,
    url: input.game_db_url || input.game_db?.url,
  }, 'Gameplay store', configuredDefaults.game_db);

  const operationsStore = useSameOperationsStore
    ? { ...gameStore }
    : normalizeStoreInput({
      driver: input.ops_db_driver || input.ops_db?.driver,
      url: input.ops_db_url || input.ops_db?.url,
    }, 'Operations store', configuredDefaults.ops_db);

  const jwtSecret = trimText(input.jwt_secret) || generateJwtSecret();
  if (jwtSecret.length < 16) {
    throw new Error('JWT secret must be at least 16 characters');
  }

  return {
    admin: normalizeAdminInput({
      username: input.admin_username || input.admin?.username,
      email: input.admin_email || input.admin?.email,
      password: input.admin_password || input.admin?.password,
    }),
    api_title: trimText(input.api_title) || config.api_title,
    game_db: gameStore,
    jwt_secret: jwtSecret,
    ops_db: operationsStore,
    use_same_operations_store: useSameOperationsStore,
  };
};

exports.getSetupState = async (runtime = {}) => {
  if (typeof runtime.getSetupState === 'function') {
    const state = await runtime.getSetupState();
    return {
      activation_in_progress: Boolean(runtime.activationInProgress),
      has_users: state?.has_users ?? null,
      last_error: state?.last_error || runtime.lastSetupError || '',
      setup_reason: state?.setup_reason || runtime.setupReason || (config.requires_first_run_setup ? 'database_not_configured' : ''),
      setup_required: Boolean(state?.setup_required),
      user_count: Number.isInteger(state?.user_count) ? state.user_count : null,
    };
  }

  return {
    activation_in_progress: Boolean(runtime.activationInProgress),
    has_users: null,
    last_error: runtime.lastSetupError || '',
    setup_reason: runtime.setupReason || (config.requires_first_run_setup ? 'database_not_configured' : ''),
    setup_required: Boolean(runtime.isSetupMode?.()),
    user_count: null,
  };
};

exports.getStatus = async (runtime = {}) => {
  const setupState = await exports.getSetupState(runtime);
  const configuredDefaults = getConfiguredStoreDefaults();

  return {
    activation_in_progress: setupState.activation_in_progress,
    configured: !setupState.setup_required && config.has_explicit_database_config,
    current: {
      api_title: config.api_title,
      game_db_driver: configuredDefaults.game_db?.driver || '',
      ops_db_driver: configuredDefaults.ops_db?.driver || '',
      use_same_operations_store: configuredDefaults.use_same_operations_store,
    },
    defaults: {
      api_title: config.api_title,
      jwt_secret_is_default: config.is_default_jwt_secret,
    },
    driver_examples: DRIVER_EXAMPLES,
    env_file: ENV_FILE_NAME,
    env_file_exists: fs.existsSync(config.getEnvFilePath(ENV_FILE_NAME)),
    has_explicit_database_config: config.has_explicit_database_config,
    has_users: setupState.has_users,
    last_error: setupState.last_error,
    setup_reason: setupState.setup_reason,
    setup_required: setupState.setup_required,
    supported_drivers: SUPPORTED_DRIVERS,
    user_count: setupState.user_count,
  };
};

exports.validateConnections = async (payload) => {
  const stores = [{ ...payload.game_db, label: 'Gameplay store' }];

  if (
    payload.ops_db.driver !== payload.game_db.driver
    || payload.ops_db.url !== payload.game_db.url
  ) {
    stores.push({ ...payload.ops_db, label: 'Operations store' });
  }

  const results = [];
  for (let index = 0; index < stores.length; index += 1) {
    const store = stores[index];
    results.push(await testConnection(store, store.label));
  }

  if (stores.length === 1) {
    results.push({
      driver: payload.ops_db.driver,
      label: 'Operations store (shared)',
      success: true,
    });
  }

  return results;
};

exports.writeSetupEnv = (payload) => {
  const envPath = config.getEnvFilePath(ENV_FILE_NAME);
  const entries = buildSetupEnvEntries(payload);
  fs.writeFileSync(envPath, buildEnvFileContents(entries), 'utf8');

  return {
    env_file: ENV_FILE_NAME,
    written_keys: Object.keys(entries).sort(),
  };
};

exports.bootstrapAdminUser = async (admin) => {
  if (!admin) {
    return {
      created: false,
      reason: 'skipped',
    };
  }

  const userCount = await UserModel.count();
  if (userCount > 0) {
    return {
      created: false,
      reason: 'users_exist',
    };
  }

  const existingUsername = await UserModel.getByUsername(admin.username);
  if (existingUsername) {
    throw new Error('Admin username already exists');
  }

  const existingEmail = await UserModel.getByEmail(admin.email);
  if (existingEmail) {
    throw new Error('Admin email already exists');
  }

  const user = {
    account_create_time: new Date(),
    avatar: '',
    coins: config.start_coins,
    elo: config.start_elo,
    email: admin.email,
    email_confirm_key: UserTool.generateID(20),
    last_login_time: new Date(),
    last_online_time: new Date(),
    permission_level: config.permissions.ADMIN,
    username: admin.username,
    validation_level: 1,
    xp: 0,
  };

  UserTool.setUserPassword(user, admin.password);

  const createdUser = await UserModel.create(user);
  if (!createdUser) {
    throw new Error('Failed to create the initial admin account');
  }

  await Activity.LogActivity('register', admin.username, {
    email: admin.email,
    source: 'setup',
    username: admin.username,
  }).catch(() => {});

  return {
    created: true,
    email: admin.email,
    user_id: createdUser.id,
    username: admin.username,
  };
};

exports.getSuggestedJwtSecret = generateJwtSecret;

exports._private = {
  buildEnvFileContents,
  buildSetupEnvEntries,
  formatEnvValue,
  normalizeAdminInput,
  normalizeStoreInput,
};
