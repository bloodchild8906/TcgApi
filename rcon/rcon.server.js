const net = require('net');
const jwt = require('jsonwebtoken');

const config = require('../config');
const SummaryService = require('../admin/admin.summary.service');
const ManagementService = require('../admin/admin.management.service');
const OpsStore = require('../ops/ops.store');
const RbacService = require('../rbac/rbac.service');
const UserModel = require('../users/users.model');
const Activity = require('../activity/activity.model');
const EventBus = require('../realtime/event-bus');

let server = null;
const clients = new Map();

const commandPermissions = {
  summary: 'admin.dashboard.read',
  trades: 'admin.trades.manage',
  activity: 'admin.audit.read',
  'roles.list': 'admin.roles.read',
  'roles.assign': 'admin.roles.manage',
  'roles.remove': 'admin.roles.manage',
  broadcast: 'admin.system.broadcast',
  'users.find': 'admin.users.manage',
  'users.update': 'admin.users.manage',
  'users.ban': 'admin.users.manage',
  'users.unban': 'admin.users.manage',
  'users.kick': 'admin.users.manage',
  'users.reward': 'admin.users.manage',
  'cards.list': 'admin.content.manage',
  'cards.get': 'admin.content.manage',
  'cards.save': 'admin.content.manage',
  'cards.delete': 'admin.content.manage',
};

const send = (socket, payload) => {
  socket.write(`${JSON.stringify(payload)}\n`);
};

const sessionHasPermission = (session, permission) => {
  if (!permission) return true;
  if (session.superuser) return true;
  return RbacService.hasPermission({ permissions: session.permissions || [] }, permission);
};

const resolveUser = async (selector) => {
  const normalized = String(selector || '').trim();
  if (!normalized) return null;
  let user = await UserModel.getById(normalized);
  if (!user) user = await UserModel.getByUsername(normalized);
  return user;
};

const logRconCommand = async (session, socket, command) => {
    const actor = session.username || 'unknown';
    const ip = socket.remoteAddress;
    await Activity.LogActivity('rcon_command', actor, {
        ip,
        command: command.command,
        payload: { ...command, token: command.token ? '***' : undefined, password: command.password ? '***' : undefined }
    });
};

const authenticateSession = async (session, command, socket) => {
  if (command.password) {
    if (!config.rcon_password || command.password !== config.rcon_password) throw new Error('Invalid RCON password');
    session.authenticated = true;
    session.superuser = true;
    session.username = 'rcon-password';
    session.permissions = ['*'];
    return;
  }

  const token = String(command.token || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('token or password is required');

  const decoded = jwt.verify(token, config.jwt_secret);
  const access = await RbacService.getUserAccess({
    userId: decoded.userId,
    username: decoded.username,
    permission_level: decoded.permission_level,
  });

  if (!access.is_admin || !RbacService.hasPermission(access, 'admin.rcon.use')) throw new Error('User is not allowed to use RCON');

  session.authenticated = true;
  session.superuser = false;
  session.userId = decoded.userId;
  session.username = decoded.username;
  session.permissions = access.permissions;
  
  console.log(`RCON: User ${session.username} connected from ${socket.remoteAddress}`);
};

const listHelp = () => ([
  { command: 'auth', description: 'Authenticate with {token} or {password}' },
  { command: 'ping', description: 'Check connection health' },
  { command: 'summary', description: 'Fetch the admin summary payload' },
  { command: 'trades', description: 'List trades with optional {status, limit}' },
  { command: 'activity', description: 'List activity with optional {type, username, limit}' },
  { command: 'roles.list', description: 'List RBAC roles' },
  { command: 'roles.assign', description: 'Assign roles with {user, roles}' },
  { command: 'roles.remove', description: 'Remove one role with {user, role}' },
  { command: 'users.find', description: 'Resolve user by {user}' },
  { command: 'users.update', description: 'Update user data with {user, data}' },
  { command: 'users.ban', description: 'Ban user with {user, type, reason, notes, linked_chats}' },
  { command: 'users.unban', description: 'Unban user with {user}' },
  { command: 'users.kick', description: 'Kick user with {user, reason}' },
  { command: 'users.reward', description: 'Give reward to user with {user, reward}' },
  { command: 'users.set_coins', description: 'Set user coins with {user, coins}' },
  { command: 'users.set_xp', description: 'Set user XP with {user, xp}' },
  { command: 'users.set_level', description: 'Set user level (permission_level) with {user, level}' },
  { command: 'cards.list', description: 'List cards with {pack, type, limit}' },
  { command: 'cards.get', description: 'Get card details by {tid}' },
  { command: 'cards.save', description: 'Create or update card with {data}' },
  { command: 'cards.delete', description: 'Delete card by {tid}' },
  { command: 'broadcast', description: 'Broadcast websocket message with {message}' },
]);

const handleCommand = async (socket, session, command) => {
  const action = String(command.command || '').trim().toLowerCase();

  if (action === 'auth') {
    await authenticateSession(session, command, socket);
    send(socket, { ok: true, command: action, data: { authenticated: true, username: session.username, superuser: session.superuser } });
    return;
  }

  if (action === 'help') {
    send(socket, { ok: true, command: action, data: listHelp() });
    return;
  }

  if (!session.authenticated) throw new Error('Authenticate first');
  if (!sessionHasPermission(session, commandPermissions[action === 'users.set_coins' || action === 'users.set_xp' || action === 'users.set_level' ? 'users.update' : action])) throw new Error('Permission Denied');

  await logRconCommand(session, socket, command);

  switch (action) {
    case 'ping':
      send(socket, { ok: true, command: action, data: { uptime_seconds: Math.round(process.uptime()) } });
      return;
    case 'summary':
      send(socket, { ok: true, command: action, data: await SummaryService.getSummary() });
      return;
    case 'trades':
      send(socket, {
        ok: true,
        command: action,
        data: await OpsStore.listTrades({
          status: command.status ? String(command.status).trim() : '',
          limit: Number.parseInt(command.limit ?? 20, 10),
        }),
      });
      return;
    case 'activity': {
      const filter = {};
      if (command.type) filter.type = String(command.type).trim();
      else if (command.username) filter.username = String(command.username).trim();
      const list = await Activity.Get(filter);
      send(socket, { ok: true, command: action, data: list.slice(0, Number.parseInt(command.limit ?? 20, 10)).map((entry) => entry.toObj()) });
      return;
    }
    case 'roles.list':
      send(socket, { ok: true, command: action, data: await RbacService.listRoles() });
      return;
    case 'roles.assign': {
      const user = await resolveUser(command.user);
      if (!user) throw new Error('User not found');
      const result = await RbacService.assignRolesToUser(user.id, command.roles || [], { actor: session.username, source: 'rcon' });
      send(socket, { ok: true, command: action, data: result });
      return;
    }
    case 'roles.remove': {
      const user = await resolveUser(command.user);
      if (!user) throw new Error('User not found');
      const current = await RbacService.getUserAccessById(user.id);
      const roles = (current?.access?.role_ids || []).filter((roleId) => roleId !== command.role);
      const result = await RbacService.assignRolesToUser(user.id, roles, { actor: session.username, source: 'rcon' });
      send(socket, { ok: true, command: action, data: result });
      return;
    }
    case 'users.find': {
      const user = await resolveUser(command.user);
      if (!user) throw new Error('User not found');
      send(socket, { ok: true, command: action, data: user.deleteSecrets() });
      return;
    }
    case 'users.update': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.updatePlayer(user.id, command.data || {}, session.username);
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'users.set_coins': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.updatePlayer(user.id, { coins: command.coins }, session.username);
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'users.set_xp': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.updatePlayer(user.id, { xp: command.xp }, session.username);
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'users.set_level': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.updatePlayer(user.id, { permission_level: command.level }, session.username);
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'users.ban': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.banPlayer(user.id, command.type, command.reason, session.username, {
            notes: command.notes,
            linked_chats: command.linked_chats
        });
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'users.unban': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.unbanPlayer(user.id, session.username);
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'users.kick': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.kickPlayer(user.id, command.reason, session.username);
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'users.reward': {
        const user = await resolveUser(command.user);
        if (!user) throw new Error('User not found');
        const result = await ManagementService.giveReward(user.id, command.reward, session.username);
        send(socket, { ok: true, command: action, data: result });
        return;
    }
    case 'cards.list':
        send(socket, { ok: true, command: action, data: await ManagementService.listCards(command) });
        return;
    case 'cards.get':
        send(socket, { ok: true, command: action, data: await ManagementService.getCard(command.tid) });
        return;
    case 'cards.save':
        send(socket, { ok: true, command: action, data: await ManagementService.saveCard(command.data, session.username) });
        return;
    case 'cards.delete':
        send(socket, { ok: true, command: action, data: await ManagementService.deleteCard(command.tid, session.username) });
        return;
    case 'broadcast':
      EventBus.publish('system.broadcast', { message: String(command.message || '').trim(), source: 'rcon', actor: session.username }, { broadcast: true, admin: true });
      send(socket, { ok: true, command: action, data: { success: true } });
      return;
    default:
      throw new Error(`Unknown command: ${action}`);
  }
};

const onConnection = (socket) => {
  const ip = socket.remoteAddress;
  if (config.ip_blacklist && config.ip_blacklist.includes(ip)) {
      console.log(`RCON: Rejected connection from blacklisted IP: ${ip}`);
      socket.destroy();
      return;
  }

  if (typeof socket.setNoDelay === 'function') socket.setNoDelay(Boolean(config.network_socket_no_delay));
  if (typeof socket.setKeepAlive === 'function') socket.setKeepAlive(Boolean(config.network_socket_keep_alive), config.network_keep_alive_initial_delay_ms);

  socket.setEncoding('utf8');
  const session = { authenticated: false, superuser: false, userId: '', username: '', permissions: [], buffer: '' };

  clients.set(socket, session);
  send(socket, { ok: true, command: 'hello', data: { protocol: 'json-lines', requires_auth: true } });

  socket.on('data', (chunk) => {
    session.buffer += chunk;
    const parts = session.buffer.split('\n');
    session.buffer = parts.pop() || '';

    parts.forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      let payload = null;
      try { payload = JSON.parse(trimmed); } catch (error) { send(socket, { ok: false, error: 'Commands must be valid JSON' }); return; }
      handleCommand(socket, session, payload).catch((error) => { send(socket, { ok: false, command: payload.command || '', error: error.message || 'RCON error' }); });
    });
  });

  socket.on('close', () => clients.delete(socket));
};

exports.start = () => {
  if (!config.rcon_enabled || server) return;
  server = net.createServer(onConnection);
  server.listen(config.rcon_port, config.rcon_host, () => console.log(`RCON listening on ${config.rcon_host}:${config.rcon_port}`));
};

exports.stop = async () => {
  if (!server) return;
  for (const socket of clients.keys()) socket.destroy();
  clients.clear();
  await new Promise((resolve, reject) => { server.close((error) => { if (error) { reject(error); return; } resolve(); }); });
  server = null;
};

exports.getStats = () => ({ enabled: config.rcon_enabled, host: config.rcon_host, port: config.rcon_port, active_clients: clients.size });
