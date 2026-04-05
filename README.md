# TCG Engine API

REST API for TCG Engine user accounts, card content, packs, decks, rewards, matches, market listings, and activity logs.

## Improvements in this pass

- Split app construction from server startup.
- Added environment-variable overrides on top of `config.js`.
- Added startup validation for ports, HTTPS, SMTP, and production JWT configuration.
- Added `/health` and `/ready` endpoints.
- Added an admin UI at `/admin` for monitoring and management.
- Added an admin summary endpoint for the dashboard.
- Added direct player-to-player trading endpoints.
- Added websocket transport for realtime notifications.
- Added an RCON TCP server for authenticated operator commands.
- Added RBAC roles for admin users.
- Moved gameplay collections onto a generic store abstraction so cards, users, matches, market data, and other game documents are no longer tied to Mongo schemas.
- Added pluggable operational-store support for MongoDB, MySQL, PostgreSQL, and SQL Server.
- Added pluggable gameplay-store support for MongoDB, MySQL, PostgreSQL, and SQL Server using a generic document collection layer.
- Added admin management actions for player state, recent matches, and market offers.
- Completed the admin/content management layer for player moderation, card-suite content, game-flow editing, and full datastore reset.
- Added HTTP compression plus socket/keep-alive tuning, with optional HTTPS HTTP/2 transport.
- Added graceful shutdown for HTTP, HTTPS, and configured datastore connections.
- Added async-safe route wrapping so rejected promises reach the error handler.
- Added a first-run installer at `/setup` that validates datastore settings, writes `.env`, and can bootstrap the first admin account.
- Added support for `Authorization: Bearer <token>` while keeping legacy raw token headers working.
- Fixed several controller/model issues, including the broken `UserModel.patch()` lookup.
- Added `npm` scripts and a small unit test surface.
- Updated `nodemailer` to a non-vulnerable release and verified `npm audit` is clean.

## Requirements

- Node.js 18+
- A database backend for gameplay data: MongoDB, MySQL, PostgreSQL, or SQL Server
- A database backend for operational data: MongoDB, MySQL, PostgreSQL, or SQL Server

MongoDB is only required when `GAME_DB_DRIVER` or `OPS_DB_DRIVER` is set to `mongo`.

## Quick Start

1. Install dependencies:

```powershell
npm install
```

2. Configure the server.

   Recommended: copy [`.env.example`](/E:/TcgEngineAPI/.env.example) to `.env` and edit the values for your environment.
   Shell environment variables still override `.env` and `.env.local` when present.
   Fallback: edit [`config.js`](/E:/TcgEngineAPI/config.js).

3. Start the API:

```powershell
npm start
```

If no explicit database settings are present in the shell environment, `.env`, or `.env.local`, the API starts in installer mode and serves `/setup` instead of attempting the default local MongoDB connection.
If the datastore is configured but no users exist yet, `/admin` also routes back to `/setup` until bootstrap is completed.

## First-Run Installer

- Open `/setup` after `npm start` when the instance has no datastore configured yet, or when the datastore exists but no users have been created.
- The installer collects:
  - gameplay-store driver + connection string
  - operations-store driver + connection string, or reuse the gameplay-store settings
  - a JWT secret
  - an optional bootstrap admin username/email/password
- `Test Connection` validates the supplied backends before anything is written.
- `Apply Setup` writes `.env`, reloads config, connects the stores, and activates the full API without a manual restart.
- While bootstrap is incomplete, `/admin` redirects back to `/setup`.
- Once the datastore is configured and at least one user exists, `/setup` redirects to `/admin`.

## First-Run Access

- There is no seeded default username or password for the API or admin UI.
- Recommended: create the first admin account in `/setup`.
- If you skip that step, the first account created through `POST /users/register` still becomes the initial admin, and `/setup` stops redirecting once that user exists.
- The first registered user is promoted automatically:
  - `permission_level = 10` (`ADMIN`)
  - `validation_level = 1` (already validated)
- Later users default to normal player access:
  - `permission_level = 1`
  - `validation_level = 0`
- New users start with:
  - `coins = 5000`
  - `elo = 1000`
  - `xp = 0`

Credential-related defaults:

- Default `JWT_SECRET`: `JWT_123456789`
  - Development only. Change it before any non-local deployment.
- Default `RCON_PASSWORD`: empty
  - RCON shared-password auth is disabled until you set one.
- Default DB usernames/passwords:
  - `MONGO_USER`, `MONGO_PASS`, `GAME_DB_USER`, `GAME_DB_PASS`, `OPS_DB_USER`, `OPS_DB_PASS` are empty by default.
- For SQL Server Integrated Security / Trusted Connection:
  - No DB username or password is used.
  - Access runs as the Windows account that starts the Node.js process.

## Configuration

`config.js` contains the default values. Every setting can be overridden with environment variables at runtime.

Environment loading order:

- Shell/process environment variables win.
- Then `.env.local` overrides `.env`.
- Then `config.js` defaults fill anything still unset.

Storage model:

- Gameplay collections such as users, cards, packs, decks, rewards, matches, activity, and market offers now use the gameplay store abstraction.
- Operational features such as RBAC and direct trades use the operational store abstraction.
- `GAME_DB_DRIVER` can be `mongo`, `mysql`, `postgres`, or `mssql`.
- `OPS_DB_DRIVER` can be `mongo`, `mysql`, `postgres`, or `mssql`.
- Aliases are also accepted for both stores: `myql` maps to `mysql`, and `sql` / `sqlserver` map to `mssql`.
- SQL gameplay backends store documents in a generic `game_documents` table so the controller/model layer stays storage-agnostic.
- SQL Server Integrated Security / Trusted Connection is supported and switches to the `msnodesqlv8` runtime automatically.

Important settings:

| Variable | Purpose | Default |
| --- | --- | --- |
| `PORT` | HTTP port | `80` |
| `PORT_HTTPS` | HTTPS port | `443` |
| `ALLOW_HTTP` | Enable HTTP listener | `true` |
| `ALLOW_HTTPS` | Enable HTTPS listener | `false` |
| `JWT_SECRET` | JWT signing secret | `JWT_123456789` |
| `JWT_EXPIRATION` | Access token lifetime in seconds | `36000` |
| `JWT_REFRESH_EXPIRATION` | Refresh token lifetime in seconds | `360000` |
| `MONGO_URI` | Full Mongo connection string | derived from host/port/db fields |
| `MONGO_HOST` | Mongo hostname | `127.0.0.1` |
| `MONGO_PORT` | Mongo port | `27017` |
| `MONGO_DB` | Mongo database name | `tcgengine` |
| `MONGO_USER` | Mongo username | empty |
| `MONGO_PASS` | Mongo password | empty |
| `GAME_DB_DRIVER` | Gameplay store driver | `mongo` |
| `GAME_DB_URL` | Gameplay store connection string | derived from driver fields |
| `GAME_DB_HOST` | Gameplay store hostname | `127.0.0.1` |
| `GAME_DB_PORT` | Gameplay store port | driver-specific |
| `GAME_DB_NAME` | Gameplay store database name | `tcgengine` |
| `GAME_DB_USER` | Gameplay store username | empty |
| `GAME_DB_PASS` | Gameplay store password | empty |
| `GAME_DB_SSL` | Enable SSL for gameplay store | `false` |
| `OPS_DB_DRIVER` | Operational store driver | `mongo` |
| `OPS_DB_URL` | Operational store connection string | derived from driver fields |
| `OPS_DB_HOST` | Operational store hostname | `127.0.0.1` |
| `OPS_DB_PORT` | Operational store port | driver-specific |
| `OPS_DB_NAME` | Operational store database name | `tcgengine_ops` |
| `OPS_DB_USER` | Operational store username | empty |
| `OPS_DB_PASS` | Operational store password | empty |
| `OPS_DB_SSL` | Enable SSL for operational store | `false` |
| `NETWORK_STACK` | Listener stack (`node`, `http2`) | `node` |
| `NETWORK_SOCKET_NO_DELAY` | Enable TCP no-delay on accepted sockets | `true` |
| `NETWORK_SOCKET_KEEP_ALIVE` | Enable TCP keep-alive on accepted sockets | `true` |
| `NETWORK_KEEP_ALIVE_INITIAL_DELAY_MS` | Initial keep-alive delay in ms | `1000` |
| `HTTP_COMPRESSION_ENABLED` | Enable HTTP response compression | `true` |
| `HTTP_COMPRESSION_THRESHOLD` | Compress responses above this size | `1024` |
| `HTTP_KEEP_ALIVE_TIMEOUT_MS` | HTTP keep-alive timeout | `65000` |
| `HTTP_HEADERS_TIMEOUT_MS` | HTTP headers timeout | `66000` |
| `HTTP_REQUEST_TIMEOUT_MS` | HTTP request timeout | `30000` |
| `HTTP_MAX_REQUESTS_PER_SOCKET` | Max requests per keep-alive socket (`0` = unlimited) | `0` |
| `API_URL` | Restrict requests to a hostname or URL | empty |
| `LIMITER_PROXY` | Trust reverse-proxy IP forwarding | `false` |
| `IP_WHITELIST` | Comma-separated limiter bypass IPs | `127.0.0.1` |
| `IP_BLACKLIST` | Comma-separated blocked IPs | empty |
| `SMTP_ENABLED` | Enable email sending | `false` |
| `SMTP_SERVER` | SMTP hostname | empty |
| `SMTP_PORT` | SMTP port | `465` |
| `SMTP_USER` | SMTP username | empty |
| `SMTP_PASSWORD` | SMTP password | empty |
| `WEBSOCKET_ENABLED` | Enable websocket transport | `true` |
| `WEBSOCKET_PATH` | Websocket path | `/ws` |
| `RCON_ENABLED` | Enable RCON TCP server | `false` |
| `RCON_HOST` | RCON bind host | `127.0.0.1` |
| `RCON_PORT` | RCON port | `27090` |
| `RCON_PASSWORD` | Optional shared RCON password | empty |
| `RBAC_LEGACY_ADMIN_FALLBACK` | Keep legacy admin wildcard access when no RBAC roles are assigned | `true` |
| `REQUEST_LOG_ENABLED` | Enable request logging | `true` |

Notes:

- In production, `JWT_SECRET` must be changed from the default value or startup will fail.
- If `ALLOW_HTTPS=true`, `HTTPS_KEY`, `HTTPS_CERT`, and `HTTPS_CA` must point to existing certificate files.
- If `NETWORK_STACK=http2`, `ALLOW_HTTPS` must also be enabled.
- If `SMTP_ENABLED=true`, the SMTP fields must be populated or startup will fail.
- If either `GAME_DB_DRIVER` or `OPS_DB_DRIVER` is `mongo`, the shared Mongo connection must be valid.
- For SQL Server Integrated Security, use an ADO/ODBC connection string in `GAME_DB_URL` / `OPS_DB_URL`. If no `Database` or `Initial Catalog` is provided, SQL Server uses the login's default database.

## Scripts

- `npm start`: start the API server
- `npm test`: run unit tests
- `npm run check`: syntax-check the main runtime, admin, RBAC, websocket, and RCON files

## Runtime Behavior

- The API now initializes the gameplay store and operational store before opening listeners.
- MongoDB is only connected when the configured gameplay or operational store driver is `mongo`.
- `GET /health` returns uptime plus gameplay-store, ops-store, Mongo, and transport status.
- `GET /ready` returns `200` only when both the gameplay and operational stores are ready.
- `GET /admin/api/summary` returns the dashboard summary payload for admins.
- Websocket clients can connect on `WEBSOCKET_PATH` and authenticate with the same JWT access token.
- The optional RCON server listens on `RCON_HOST:RCON_PORT` and accepts JSON-line commands.
- HTTP listeners now apply socket tuning and optional response compression.
- HTTPS can optionally run with Node's built-in HTTP/2 compatibility mode.
- HTTPS certificates are reloaded automatically when key/cert/CA files change.
- Shutdown on `SIGINT` and `SIGTERM` closes servers and disconnects the configured stores cleanly.

## Admin UI

- Open [`/admin`](/E:/TcgEngineAPI/public/dashboard.html) in the browser served by this API.
- Sign in with an account that has `ADMIN` permission.
- On a new install, that means either the admin created in `/setup` or, if you skipped that, the first user you register.
- The dashboard now degrades by RBAC scope instead of failing wholesale. Role-scoped admins only see the surfaces they are allowed to use.
- The dashboard includes:
  - Monitoring cards for uptime, transport state, store health, and collection counts
  - Alerting and recent activity/match/market views
  - User management for permission changes, player-state edits, reward grants, RBAC roles, bans, kicks, and history
  - Match and market-offer moderation actions for scoped admins
  - Content management for cards, packs, decks, variants, rewards, keywords, sets, and card types
  - Game-flow editing behind the dedicated `admin.game_flows.manage` scope
  - Database reset behind the `admin.system.reset` scope

The UI is static and lives in:

- [`dashboard.html`](/E:/TcgEngineAPI/public/dashboard.html)
- [`dashboard.css`](/E:/TcgEngineAPI/public/dashboard.css)
- [`dashboard.js`](/E:/TcgEngineAPI/public/dashboard.js)

## Authentication

- Login: `POST /auth`
- Token refresh: `POST /auth/refresh`
- Send tokens using `Authorization: Bearer <token>`
- Legacy raw `Authorization: <token>` headers still work for backward compatibility
- Auth responses now include RBAC `role_ids` and resolved `permissions` for admin users

Permission levels come from [`config.js`](/E:/TcgEngineAPI/config.js):

- `USER`: base authenticated player access
- `SERVER`: server-to-server or elevated automation access
- `ADMIN`: full administrative access

RBAC layers on top of `ADMIN` accounts:

- Numeric admin level still gates administrative access.
- Named RBAC permissions now scope admin capabilities such as dashboard access, user management, content management, trade oversight, websocket observation, and RCON usage.
- Additional admin scopes now include `admin.games.manage` and `admin.market.manage`.
- Admin reward grants now require `admin.users.manage`.
- With `RBAC_LEGACY_ADMIN_FALLBACK=true`, old admin accounts without assigned roles retain wildcard access so existing setups are not locked out during migration.

## Realtime and RCON

Websocket:

- Connect to `ws://host/ws?token=<jwt>` or `wss://host/ws?token=<jwt>`
- Authenticated users receive targeted events such as trade updates
- Admin users with `admin.ws.observe` receive admin event streams

RCON:

- Enable with `RCON_ENABLED=true`
- Connect over TCP and send one JSON object per line
- Authenticate with either:
  - `{"command":"auth","token":"<jwt>"}`
  - `{"command":"auth","password":"<shared-password>"}`
- Example commands:
  - `{"command":"summary"}`
  - `{"command":"trades","status":"pending","limit":10}`
  - `{"command":"roles.list"}`
  - `{"command":"broadcast","message":"Maintenance starts in 5 minutes"}`

## API Reference

Route-level reference lives in [`docs/API.md`](/E:/TcgEngineAPI/docs/API.md).

## Project Layout

- [`.env.example`](/E:/TcgEngineAPI/.env.example): starter environment file for local setup
- [`app.js`](/E:/TcgEngineAPI/app.js): Express app setup, routes, health endpoints, 404/error handling
- [`server.js`](/E:/TcgEngineAPI/server.js): process startup, store initialization, HTTP/HTTPS listeners, transport tuning, shutdown flow
- [`config.js`](/E:/TcgEngineAPI/config.js): default config plus environment overrides
- [`game/`](/E:/TcgEngineAPI/game): storage-agnostic gameplay store and per-driver adapters
- [`ops/`](/E:/TcgEngineAPI/ops): operational-store abstraction and per-driver adapters
- [`authorization/`](/E:/TcgEngineAPI/authorization): auth routes, middleware, token flow
- [`users/`](/E:/TcgEngineAPI/users): users, friends, owned cards, rewards
- [`cards/`](/E:/TcgEngineAPI/cards): card catalog
- [`packs/`](/E:/TcgEngineAPI/packs): pack definitions
- [`decks/`](/E:/TcgEngineAPI/decks): deck templates
- [`variants/`](/E:/TcgEngineAPI/variants): cosmetic or card variants
- [`matches/`](/E:/TcgEngineAPI/matches): match lifecycle and history
- [`market/`](/E:/TcgEngineAPI/market): player card offers and trades
- [`rewards/`](/E:/TcgEngineAPI/rewards): reward definitions
- [`activity/`](/E:/TcgEngineAPI/activity): activity log endpoints and model
