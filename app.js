const fs = require('fs');
const path = require('path');
const compression = require('compression');
const express = require('express');
const mongoose = require('mongoose');

const config = require('./config');
const GameStore = require('./game/game.store');
const HttpTool = require('./tools/http.tool');
const Limiter = require('./tools/limiter.tool');
const OpsStore = require('./ops/ops.store');

const AuthorizationRouter = require('./authorization/auth.routes');
const UsersRouter = require('./users/users.routes');
const CardsRouter = require('./cards/cards.routes');
const PacksRouter = require('./packs/packs.routes');
const DecksRouter = require('./decks/decks.routes');
const VariantRouter = require('./variants/variants.routes');
const MatchesRouter = require('./matches/matches.routes');
const MatchmakingRouter = require('./matchmaking/matchmaking.routes');
const RewardsRouter = require('./rewards/rewards.routes');
const MarketRouter = require('./market/market.routes');
const ActivityRouter = require('./activity/activity.routes');
const AdminRouter = require('./admin/admin.routes');
const RbacRouter = require('./rbac/rbac.routes');
const TradesRouter = require('./trades/trades.routes');
const SetupRouter = require('./setup/setup.routes');

const getOriginHost = (value) => {
  if (!value) {
    return '';
  }

  try {
    return new URL(value).hostname.toLowerCase();
  } catch (error) {
    return '';
  }
};

const usesMongoConnection = () => config.game_db_driver === 'mongo' || config.ops_db_driver === 'mongo';
const getSetupState = async (runtime) => {
  if (typeof runtime?.getSetupState === 'function') {
    return runtime.getSetupState();
  }

  return {
    setup_reason: runtime?.setupReason || (config.requires_first_run_setup ? 'database_not_configured' : ''),
    setup_required: Boolean(runtime?.isSetupMode?.()),
  };
};

const createSetupGatePayload = (runtime) => ({
  error: 'First-run setup is required before the API can be used.',
  setup_reason: runtime?.setupReason || (config.requires_first_run_setup ? 'database_not_configured' : ''),
  setup_url: '/setup',
});
const REQUEST_BODY_LIMIT = '500mb';

const createApp = (runtime = {}) => {
  const app = express();
  const publicDir = path.join(__dirname, 'public');
  const dashboardFile = path.join(publicDir, 'dashboard.html');
  const playerFile = path.join(publicDir, 'player.html');
  const setupFile = path.join(publicDir, 'setup.html');
  const setupCssFile = path.join(publicDir, 'setup.css');
  const setupJsFile = path.join(publicDir, 'setup.js');

  app.disable('x-powered-by');

  Limiter.limit(app);

  if (config.http_compression_enabled) {
    app.use(compression({
      threshold: config.http_compression_threshold,
    }));
  }

  app.use((req, res, next) => {
    const requestOrigin = req.headers.origin;
    const requestOriginHost = getOriginHost(requestOrigin);
    const allowCredentialOrigin = requestOrigin && config.api_host && requestOriginHost === config.api_host;

    if (allowCredentialOrigin) {
      res.header('Access-Control-Allow-Origin', requestOrigin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    res.header('Access-Control-Expose-Headers', 'Content-Length');
    res.header('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type, X-Requested-With, Range');

    if (req.method === 'OPTIONS') {
      return HttpTool.sendNoContent(res);
    }

    return next();
  });

  app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: true, limit: REQUEST_BODY_LIMIT }));

  app.use((req, res, next) => {
    if (config.request_log_enabled) {
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${req.ip || req.socket.remoteAddress}`);
    }
    next();
  });

  app.get('/health', ...HttpTool.wrap(async (req, res) => {
    const setupState = await getSetupState(runtime);
    const gameStatus = GameStore.getStatus();
    const opsStatus = OpsStore.getStatus();
    const mongoEnabled = usesMongoConnection();
    const mongoState = mongoose.connection.readyState;

    res.status(200).send({
      status: setupState.setup_required ? 'setup_required' : 'ok',
      version: config.version,
      uptime_seconds: Math.round(process.uptime()),
      setup_required: setupState.setup_required,
      setup_reason: setupState.setup_reason || '',
      game_store: gameStatus,
      operations_store: opsStatus,
      mongo: {
        enabled: mongoEnabled,
        connected: mongoEnabled ? mongoState === 1 : false,
        ready_state: mongoState,
      },
      network: {
        stack: config.network_stack,
        compression_enabled: config.http_compression_enabled,
        keep_alive_timeout_ms: config.http_keep_alive_timeout_ms,
        request_timeout_ms: config.http_request_timeout_ms,
      },
      server_time: new Date(),
    });
  }));

  app.get('/ready', ...HttpTool.wrap(async (req, res) => {
    const setupState = await getSetupState(runtime);
    const gameStatus = GameStore.getStatus();
    const opsStatus = OpsStore.getStatus();
    const ready = !setupState.setup_required && gameStatus.connected && opsStatus.connected;

    res.status(ready ? 200 : 503).send({
      status: ready ? 'ready' : (setupState.setup_required ? 'setup_required' : 'starting'),
      gameplay_ready: gameStatus.connected,
      operations_ready: opsStatus.connected,
      mongo_ready: usesMongoConnection() ? mongoose.connection.readyState === 1 : null,
      setup_required: setupState.setup_required,
      setup_reason: setupState.setup_reason || '',
      server_time: new Date(),
    });
  }));

  SetupRouter.route(app, runtime);

  if (fs.existsSync(setupFile)) {
    app.get(['/setup', '/install'], ...HttpTool.wrap(async (req, res) => {
      const setupState = await getSetupState(runtime);
      if (!setupState.setup_required) {
        return res.redirect('/admin');
      }

      res.sendFile(setupFile);
      return undefined;
    }));
  }

  if (fs.existsSync(setupCssFile)) {
    app.get('/setup.css', (req, res) => {
      res.sendFile(setupCssFile);
    });
  }

  if (fs.existsSync(setupJsFile)) {
    app.get('/setup.js', (req, res) => {
      res.sendFile(setupJsFile);
    });
  }

  app.use((req, res, next) => {
    if (!runtime?.isSetupMode?.()) {
      return next();
    }

    if (req.path === '/favicon.ico') {
      return HttpTool.sendNoContent(res);
    }

    if (
      req.path === '/setup'
      || req.path === '/install'
      || req.path === '/setup.css'
      || req.path === '/setup.js'
      || req.path.startsWith('/setup/api/')
      || req.path === '/health'
      || req.path === '/ready'
    ) {
      return next();
    }

    if (req.accepts('html')) {
      return res.redirect('/setup');
    }

    return res.status(503).send(createSetupGatePayload(runtime));
  });

  app.get('/', (req, res) => {
    res.status(200).send({
      title: config.api_title,
      version: config.version,
      environment: config.node_env,
    });
  });

  if (fs.existsSync(publicDir)) {
    app.use('/', express.static(publicDir));
  }

  AuthorizationRouter.route(app);
  UsersRouter.route(app);
  CardsRouter.route(app);
  PacksRouter.route(app);
  DecksRouter.route(app);
  VariantRouter.route(app);
  MatchesRouter.route(app);
  MatchmakingRouter.route(app);
  RewardsRouter.route(app);
  MarketRouter.route(app);
  TradesRouter.route(app);
  ActivityRouter.route(app);
  AdminRouter.route(app);
  RbacRouter.route(app);

  if (fs.existsSync(dashboardFile)) {
    app.get(['/admin', '/dashboard'], ...HttpTool.wrap(async (req, res) => {
      const setupState = await getSetupState(runtime);
      if (setupState.setup_required) {
        return res.redirect('/setup');
      }

      res.sendFile(dashboardFile);
      return undefined;
    }));
  }

  if (fs.existsSync(playerFile)) {
    app.get('/admin/players/:userId', ...HttpTool.wrap(async (req, res) => {
      const setupState = await getSetupState(runtime);
      if (setupState.setup_required) {
        return res.redirect('/setup');
      }

      res.sendFile(playerFile);
      return undefined;
    }));
  }

  app.use((req, res) => {
    res.status(404).send({ error: `Route not found: ${req.method} ${req.originalUrl}` });
  });

  app.use((err, req, res, next) => {
    console.error('Unhandled request error', {
      method: req.method,
      url: req.originalUrl,
      error: err && (err.stack || err.message || err),
    });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(err.status || 500).send({
      error: err.expose ? err.message : 'Internal Server Error',
    });
  });

  return app;
};

module.exports = createApp;
