const fs = require('fs'), http = require('http'), http2 = require('http2'), https = require('https'),
    mongoose = require('mongoose'), config = require('./config'), createApp = require('./app'),
    GameStore = require('./game/game.store'), Jobs = require('./jobs/jobs'), OpsStore = require('./ops/ops.store'),
    RbacService = require('./rbac/rbac.service'), WebSocketServer = require('./realtime/websocket.server'),
    RCON_Server = require('./rcon/rcon.server'), UserModel = require('./users/users.model'), runtime = {
      activationInProgress: false,
      lastSetupError: '',
      setupMode: false,
      setupReason: '',
      isSetupMode() {
        return this.setupMode;
      },
    }, app = createApp(runtime);


let activationPromise = null;
let httpServer = null;
let httpsServer = null;
let serversStarted = false;
let servicesStarted = false;
let signalHandlersRegistered = false;
let sslWatchers = [];
let shuttingDown = false;

const usesMongoConnection = () => config.game_db_driver === 'mongo' || config.ops_db_driver === 'mongo';
const getDefaultSetupReason = () => (config.requires_first_run_setup ? 'database_not_configured' : '');

mongoose.set('strictQuery', false);
mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB');
});
mongoose.connection.on('disconnected', () => {
  console.log('Disconnected from MongoDB');
});
mongoose.connection.on('error', (error) => {
  console.error('Connection to MongoDB failed', error);
});

const validateConfig = () => {
  const errors = [];
  const warnings = [];

  if (!config.allow_http && !config.allow_https) {
    errors.push('At least one of ALLOW_HTTP or ALLOW_HTTPS must be enabled.');
  }

  if (config.allow_http && config.allow_https && config.port === config.port_https) {
    errors.push('PORT and PORT_HTTPS must be different when HTTP and HTTPS are both enabled.');
  }

  if (config.node_env === 'production' && config.is_default_jwt_secret) {
    errors.push('JWT_SECRET must be changed before running in production.');
  }

  if (config.smtp_enabled) {
    const smtpFields = ['smtp_email', 'smtp_server', 'smtp_user', 'smtp_password'];
    const missingSmtpFields = smtpFields.filter((field) => !config[field]);
    if (missingSmtpFields.length > 0) {
      errors.push(`SMTP is enabled but these values are missing: ${missingSmtpFields.join(', ')}.`);
    }
  }

  if (!['mongo', 'mysql', 'postgres', 'mssql'].includes(config.ops_db_driver)) {
    errors.push('OPS_DB_DRIVER must be one of: mongo, mysql, postgres, mssql.');
  }

  if (!['mongo', 'mysql', 'postgres', 'mssql'].includes(config.game_db_driver)) {
    errors.push('GAME_DB_DRIVER must be one of: mongo, mysql, postgres, mssql.');
  }

  if (!['node', 'http2'].includes(config.network_stack)) {
    errors.push('NETWORK_STACK must be one of: node, http2.');
  }

  if (config.network_stack === 'http2' && !config.allow_https) {
    errors.push('NETWORK_STACK=http2 requires ALLOW_HTTPS to be enabled.');
  }

  if (!config.websocket_path || !config.websocket_path.startsWith('/')) {
    errors.push('WEBSOCKET_PATH must start with /.');
  }

  if (config.rcon_enabled && (!Number.isInteger(config.rcon_port) || config.rcon_port <= 0)) {
    errors.push('RCON_PORT must be a positive integer when RCON is enabled.');
  }

  if (config.is_default_jwt_secret && config.node_env !== 'production') {
    warnings.push('JWT_SECRET is using the default development value.');
  }

  return { errors, warnings };
};

const readSslCredentials = () => ({
  key: fs.readFileSync(config.https_key, 'utf8'),
  cert: fs.readFileSync(config.https_cert, 'utf8'),
  ca: fs.readFileSync(config.https_ca, 'utf8'),
});

const getMissingHttpsFiles = () => {
  const files = [config.https_key, config.https_cert, config.https_ca];
  return files.filter((filePath) => !filePath || !fs.existsSync(filePath));
};

const closeServer = (server) => new Promise((resolve, reject) => {
  if (!server) {
    resolve();
    return;
  }

  let forceTimer = null;

  server.close((error) => {
    if (forceTimer) {
      clearTimeout(forceTimer);
    }

    if (error) {
      reject(error);
      return;
    }

    resolve();
  });

  if (typeof server.closeIdleConnections === 'function') {
    server.closeIdleConnections();
  }

  if (typeof server.closeAllConnections === 'function') {
    forceTimer = setTimeout(() => {
      server.closeAllConnections();
    }, 1000);

    if (typeof forceTimer.unref === 'function') {
      forceTimer.unref();
    }
  }
});

const formatStartupError = (title, details, error) => new Error(
  `${title}\n${details.join('\n')}`,
  { cause: error }
);

const getMongoStartupDetails = () => ([
  `- GAME_DB_DRIVER=${config.game_db_driver}`,
  `- OPS_DB_DRIVER=${config.ops_db_driver}`,
  `- MONGO_URI=${config.mongo_uri}`,
  '- Start MongoDB on that address, or switch GAME_DB_DRIVER / OPS_DB_DRIVER to mysql, postgres, or mssql and configure GAME_DB_URL / OPS_DB_URL.',
]);

const getStoreStartupDetails = (prefix, driver, url) => ([
  `- ${prefix}_DRIVER=${driver}`,
  `- ${prefix}_URL=${url || '(empty)'}`,
  `- Check that the ${prefix.toLowerCase()} backend is running and reachable with these settings.`,
]);

const configureSocket = (socket) => {
  if (config.network_socket_no_delay && typeof socket.setNoDelay === 'function') {
    socket.setNoDelay(true);
  }

  if (typeof socket.setKeepAlive === 'function') {
    socket.setKeepAlive(Boolean(config.network_socket_keep_alive), config.network_keep_alive_initial_delay_ms);
  }
};

const configureServer = (server) => {
  if (!server) {
    return server;
  }

  server.on('connection', configureSocket);

  if (Number.isInteger(config.http_keep_alive_timeout_ms) && config.http_keep_alive_timeout_ms >= 0) {
    server.keepAliveTimeout = config.http_keep_alive_timeout_ms;
  }

  if (Number.isInteger(config.http_headers_timeout_ms) && config.http_headers_timeout_ms > 0) {
    server.headersTimeout = config.http_headers_timeout_ms;
  }

  if (Number.isInteger(config.http_request_timeout_ms) && config.http_request_timeout_ms >= 0) {
    server.requestTimeout = config.http_request_timeout_ms;
  }

  if (Number.isInteger(config.http_max_requests_per_socket) && config.http_max_requests_per_socket >= 0) {
    server.maxRequestsPerSocket = config.http_max_requests_per_socket;
  }

  return server;
};

const createHttpsServer = () => {
  const credentials = readSslCredentials();

  if (config.network_stack === 'http2') {
    return configureServer(http2.createSecureServer({
      ...credentials,
      allowHTTP1: true,
    }, app));
  }

  return configureServer(https.createServer(credentials, app));
};

const watchSslCertificates = () => {
  const watchedFiles = [config.https_key, config.https_cert, config.https_ca];
  let reloadTimer = null;

  sslWatchers = watchedFiles.map((filePath) => fs.watch(filePath, () => {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      try {
        httpsServer.setSecureContext(readSslCredentials());
        console.log('Reloaded HTTPS certificates');
      } catch (error) {
        console.error('Failed to reload HTTPS certificates', error);
      }
    }, 1000);
  }));
};

const startServers = () => {
  if (serversStarted) {
    return;
  }

  if (config.allow_http) {
    httpServer = configureServer(http.createServer(app));
    httpServer.listen(config.port, () => {
      console.log(`HTTP listening on port ${config.port}`);
    });
  }

  if (config.allow_https) {
    const missingHttpsFiles = getMissingHttpsFiles();
    if (missingHttpsFiles.length > 0) {
      throw new Error(`HTTPS is enabled but these certificate files are missing: ${missingHttpsFiles.join(', ')}`);
    }

    httpsServer = createHttpsServer();
    httpsServer.listen(config.port_https, () => {
      const label = config.network_stack === 'http2' ? 'HTTPS/HTTP2' : 'HTTPS';
      console.log(`${label} listening on port ${config.port_https}`);
    });
    watchSslCertificates();
  }

  serversStarted = true;
};

const stopApplicationServices = async () => {
  Jobs.StopJobs();
  await WebSocketServer.stop();
  await RCON_Server.stop();

  await Promise.allSettled([
    GameStore.close(),
    OpsStore.close(),
  ]);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  servicesStarted = false;
};

const connectConfiguredStores = async () => {
  let mongoConnected = false;
  let gameConnected = false;
  let opsConnected = false;

  try {
    if (usesMongoConnection()) {
      console.log('[v0] connectConfiguredStores - config.mongo_uri:', config.mongo_uri);
      console.log('[v0] connectConfiguredStores - process.env.MONGODB_URI:', process.env.MONGODB_URI ? 'SET' : 'NOT SET');
      console.log('[v0] connectConfiguredStores - process.env.MONGO_URI:', process.env.MONGO_URI ? 'SET' : 'NOT SET');
      await mongoose.connect(config.mongo_uri, {
        serverSelectionTimeoutMS: config.mongo_server_selection_timeout_ms,
      });
      mongoConnected = true;
    }

    await GameStore.connect();
    gameConnected = true;

    await OpsStore.connect();
    opsConnected = true;

    await RbacService.seedBuiltins();
    servicesStarted = true;
  } catch (error) {
    if (opsConnected) {
      await OpsStore.close().catch(() => {});
    }

    if (gameConnected) {
      await GameStore.close().catch(() => {});
    }

    if (mongoConnected || mongoose.connection.readyState !== 0) {
      await mongoose.disconnect().catch(() => {});
    }

    servicesStarted = false;
    throw error;
  }
};

const getRuntimeSetupState = async () => {
  if (runtime.setupMode) {
    return {
      has_users: null,
      last_error: runtime.lastSetupError || '',
      setup_reason: runtime.setupReason || getDefaultSetupReason(),
      setup_required: true,
      user_count: null,
    };
  }

  if (!GameStore.getStatus().connected) {
    return {
      has_users: null,
      last_error: runtime.lastSetupError || '',
      setup_reason: runtime.lastSetupError ? 'activation_failed' : '',
      setup_required: Boolean(runtime.lastSetupError),
      user_count: null,
    };
  }

  try {
    const userCount = await UserModel.count();

    return {
      has_users: userCount > 0,
      last_error: runtime.lastSetupError || '',
      setup_reason: userCount > 0 ? '' : 'user_not_initialized',
      setup_required: userCount === 0,
      user_count: userCount,
    };
  } catch (error) {
    return {
      has_users: null,
      last_error: error.message || String(error),
      setup_reason: 'activation_failed',
      setup_required: true,
      user_count: null,
    };
  }
};

const startRuntimeServices = () => {
  if (!serversStarted || !servicesStarted) {
    return;
  }

  WebSocketServer.start({ httpServer, httpsServer });
  RCON_Server.start();
  Jobs.InitJobs();
};

const registerSignalHandlers = () => {
  if (signalHandlersRegistered) {
    return;
  }

  process.once('SIGINT', async () => {
    try {
      await stop('SIGINT');
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed', error);
      process.exit(1);
    }
  });

  process.once('SIGTERM', async () => {
    try {
      await stop('SIGTERM');
      process.exit(0);
    } catch (error) {
      console.error('Shutdown failed', error);
      process.exit(1);
    }
  });

  signalHandlersRegistered = true;
};

const activateConfiguredRuntime = async ({ allowSetupModeOnFailure = false } = {}) => {
  if (activationPromise) {
    return activationPromise;
  }

  activationPromise = (async () => {
    runtime.activationInProgress = true;
    runtime.lastSetupError = '';

    const { errors, warnings } = validateConfig();
    warnings.forEach((warning) => console.warn(`Config warning: ${warning}`));

    if (errors.length > 0) {
      throw new Error(`Configuration error:\n- ${errors.join('\n- ')}`);
    }

    try {
      if (servicesStarted) {
        await stopApplicationServices();
      }

      await connectConfiguredStores();
      startServers();
      startRuntimeServices();

      runtime.setupMode = false;
      runtime.setupReason = '';
      runtime.lastSetupError = '';

      return app;
    } catch (error) {
      await stopApplicationServices().catch(() => {});

      if (allowSetupModeOnFailure) {
        runtime.setupMode = true;
        runtime.setupReason = 'activation_failed';
        runtime.lastSetupError = error.message || String(error);
      }

      if (error?.cause || String(error.message || '').includes('startup')) {
        throw error;
      }

      if (usesMongoConnection()) {
        throw formatStartupError(
          'MongoDB connection failed during startup.',
          getMongoStartupDetails(),
          error
        );
      }

      throw formatStartupError(
        'Store connection failed during startup.',
        [
          ...getStoreStartupDetails('GAME_DB', config.game_db_driver, config.game_db_url),
          ...getStoreStartupDetails('OPS_DB', config.ops_db_driver, config.ops_db_url),
        ],
        error
      );
    } finally {
      runtime.activationInProgress = false;
      activationPromise = null;
    }
  })();

  return activationPromise;
};

runtime.getSetupState = getRuntimeSetupState;

runtime.completeSetup = async () => {
    console.log('[v0] completeSetup - before reload, config.mongo_uri:', config.mongo_uri);
    console.log('[v0] completeSetup - before reload, process.env.MONGO_URI:', process.env.MONGO_URI ? 'SET' : 'NOT SET');
    config.reload();
    console.log('[v0] completeSetup - after reload, config.mongo_uri:', config.mongo_uri);
    console.log('[v0] completeSetup - after reload, process.env.MONGO_URI:', process.env.MONGO_URI ? 'SET' : 'NOT SET');
    return activateConfiguredRuntime({ allowSetupModeOnFailure: true });
  };

const stop = async (signal) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  console.log(`Shutting down${signal ? ` (${signal})` : ''}`);

  for (const watcher of sslWatchers) {
    watcher.close();
  }
  sslWatchers = [];

  await stopApplicationServices();

  await Promise.all([
    closeServer(httpServer),
    closeServer(httpsServer),
  ]);

  httpServer = null;
  httpsServer = null;
  serversStarted = false;
};

const start = async () => {
  registerSignalHandlers();

  const { errors, warnings } = validateConfig();
  warnings.forEach((warning) => console.warn(`Config warning: ${warning}`));

  if (errors.length > 0) {
    throw new Error(`Configuration error:\n- ${errors.join('\n- ')}`);
  }

  if (config.requires_first_run_setup) {
    runtime.setupMode = true;
    runtime.setupReason = 'database_not_configured';
    runtime.lastSetupError = '';
    startServers();
    console.log('First-run setup mode enabled at /setup');
    return app;
  }

  await activateConfiguredRuntime();
  return app;
};

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start server', error);
    process.exit(1);
  });
}

module.exports = {
  app,
  runtime,
  start,
  stop,
};
