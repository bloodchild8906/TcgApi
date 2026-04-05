const jwt = require('jsonwebtoken');
const { WebSocketServer } = require('ws');

const config = require('../config');
const RbacService = require('../rbac/rbac.service');
const ManagementService = require('../admin/admin.management.service');
const EventBus = require('./event-bus');

const servers = [];
const clients = new Map();
let unsubscribe = null;
let heartbeat = null;

const parseToken = (token) => String(token || '').replace(/^Bearer\s+/i, '').trim();

const send = (socket, type, payload) => {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify({ type, payload, timestamp: new Date().toISOString() }));
};

const getConnectionInfo = (request) => {
  const url = new URL(request.url, 'http://localhost');
  return { token: parseToken(url.searchParams.get('token')) };
};

const authenticate = async (socket, token) => {
  const parsedToken = parseToken(token);
  if (!parsedToken) throw new Error('Missing token');

  const decoded = jwt.verify(parsedToken, config.jwt_secret);
  const access = await RbacService.getUserAccess({
    userId: decoded.userId,
    username: decoded.username,
    permission_level: decoded.permission_level,
  });

  const meta = clients.get(socket) || {};
  meta.authenticated = true;
  meta.userId = decoded.userId;
  meta.username = decoded.username;
  meta.access = access;
  meta.isAdminObserver = access.is_admin && RbacService.hasPermission(access, 'admin.ws.observe');
  meta.lastSeenAt = Date.now();
  clients.set(socket, meta);

  send(socket, 'session', {
    user_id: meta.userId,
    username: meta.username,
    admin_observer: meta.isAdminObserver,
    permissions: access.permissions,
    roles: access.role_ids,
  });
};

const routeEvent = (event) => {
  for (const [socket, meta] of clients.entries()) {
    if (!meta.authenticated) continue;
    const targetedUser = event.targets.user_ids.includes(meta.userId);
    const targetedAdmin = event.targets.admin && meta.isAdminObserver;
    const targetedBroadcast = event.targets.broadcast;
    if (targetedUser || targetedAdmin || targetedBroadcast) send(socket, event.type, event.payload);
  }
};

const handleMessage = async (socket, rawMessage) => {
  let payload = null;
  try { payload = JSON.parse(String(rawMessage)); } catch (error) { send(socket, 'error', { error: 'Messages must be valid JSON' }); return; }

  const type = String(payload.type || '').trim();
  const meta = clients.get(socket) || {};
  meta.lastSeenAt = Date.now();
  clients.set(socket, meta);

  if (type === 'auth') {
    try { await authenticate(socket, payload.token); send(socket, 'auth.ok', { success: true }); } 
    catch (error) { send(socket, 'auth.error', { error: error.message || 'Authentication failed' }); }
    return;
  }

  if (type === 'ping') { send(socket, 'pong', { uptime_seconds: Math.round(process.uptime()) }); return; }

  if (!meta.authenticated) { send(socket, 'error', { error: 'Authenticate before sending commands' }); return; }

  // Admin Websocket Commands
  if (meta.isAdminObserver) {
      switch (type) {
          case 'admin.player.get':
              try { const player = await ManagementService.updatePlayer(payload.userId, {}); send(socket, 'admin.player.data', player); } catch (e) { send(socket, 'error', { error: e.message }); }
              return;
          case 'admin.broadcast':
              EventBus.publish('system.broadcast', { message: payload.message, actor: meta.username }, { broadcast: true, admin: true });
              return;
      }
  }

  if (type === 'subscribe') { send(socket, 'subscribe.ok', { admin_observer: meta.isAdminObserver, user_id: meta.userId }); return; }

  send(socket, 'error', { error: `Unsupported websocket message type: ${type}` });
};

const createServer = (server, label) => {
  const wss = new WebSocketServer({ server, path: config.websocket_path, clientTracking: false, perMessageDeflate: false, maxPayload: 262144 });

  wss.on('connection', async (socket, request) => {
    clients.set(socket, { authenticated: false, label, connectedAt: Date.now(), lastSeenAt: Date.now(), userId: '', username: '', isAdminObserver: false });
    send(socket, 'hello', { message: 'Websocket connected', path: config.websocket_path, requires_auth: true });
    const initial = getConnectionInfo(request);
    if (initial.token) { try { await authenticate(socket, initial.token); } catch (e) { send(socket, 'auth.error', { error: e.message }); } }
    socket.on('message', (message) => handleMessage(socket, message).catch((e) => send(socket, 'error', { error: e.message })));
    socket.on('pong', () => { const m = clients.get(socket); if (m) { m.lastSeenAt = Date.now(); clients.set(socket, m); } });
    socket.on('close', () => clients.delete(socket));
  });
  servers.push(wss);
};

const startHeartbeat = () => {
  if (heartbeat) return;
  heartbeat = setInterval(() => {
    for (const [socket, meta] of clients.entries()) {
      if (Date.now() - meta.lastSeenAt > 120000) { socket.terminate(); clients.delete(socket); continue; }
      if (socket.readyState === socket.OPEN) socket.ping();
    }
  }, 30000);
};

exports.start = ({ httpServer, httpsServer }) => {
  if (!config.websocket_enabled) return;
  if (httpServer) createServer(httpServer, 'http');
  if (httpsServer) createServer(httpsServer, 'https');
  if (!unsubscribe) unsubscribe = EventBus.subscribe(routeEvent);
  startHeartbeat();
};

exports.stop = async () => {
  if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
  for (const socket of clients.keys()) socket.close();
  clients.clear();
  while (servers.length > 0) { const s = servers.pop(); s.close(); }
};

exports.getStats = () => {
  const all = Array.from(clients.values());
  return { enabled: config.websocket_enabled, path: config.websocket_path, servers: servers.length, connected_clients: all.length, authenticated_clients: all.filter((c) => c.authenticated).length, admin_observers: all.filter((c) => c.isAdminObserver).length };
};
