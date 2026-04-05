(() => {
  const STORAGE_KEY = 'tcg_engine_dashboard_session';
  const DEFAULT_ACTIVITY_LIMIT = 30;

  const permissionFallbacks = {
    USER: 1,
    SERVER: 5,
    ADMIN: 10,
  };

  const permissionMatches = (grantedPermission, requiredPermission) => {
    if (!grantedPermission || !requiredPermission) {
      return false;
    }

    if (grantedPermission === '*' || grantedPermission === requiredPermission) {
      return true;
    }

    if (grantedPermission.endsWith('*')) {
      return requiredPermission.startsWith(grantedPermission.slice(0, -1));
    }

    return false;
  };

  const contentModules = {
    cards: {
      label: 'Cards',
      title: 'Card catalog',
      loadPath: '/cards',
      savePath: '/cards/add',
      deletePath: (item) => `/cards/${encodeURIComponent(item.tid)}`,
      identifier: (item) => item.tid,
      summary: (item) => [
        item.type || 'type unknown',
        item.team || 'team unknown',
        `Cost ${item.cost ?? 0}`,
        `ATK ${item.attack ?? 0}`,
        `HP ${item.hp ?? 0}`,
      ],
      fields: [
        { key: 'tid', label: 'Card ID', type: 'text', required: true, placeholder: 'card_knight' },
        { key: 'type', label: 'Type', type: 'text', required: true, placeholder: 'Unit' },
        { key: 'team', label: 'Team', type: 'text', required: true, placeholder: 'Alliance' },
        { key: 'rarity', label: 'Rarity', type: 'text', placeholder: 'Rare' },
        { key: 'mana', label: 'Mana', type: 'number', min: 0, defaultValue: 0 },
        { key: 'attack', label: 'Attack', type: 'number', min: 0, defaultValue: 0 },
        { key: 'hp', label: 'Health', type: 'number', min: 0, defaultValue: 0 },
        { key: 'cost', label: 'Coin cost', type: 'number', min: 0, defaultValue: 0 },
        { key: 'packs', label: 'Pack IDs', type: 'text', placeholder: 'starter, premium' },
      ],
      serialize(values) {
        return {
          tid: values.tid,
          type: values.type,
          team: values.team,
          rarity: values.rarity || '',
          mana: parseInteger(values.mana, 0),
          attack: parseInteger(values.attack, 0),
          hp: parseInteger(values.hp, 0),
          cost: parseInteger(values.cost, 0),
          packs: splitComma(values.packs),
        };
      },
      populate(item) {
        return {
          tid: item.tid || '',
          type: item.type || '',
          team: item.team || '',
          rarity: item.rarity || '',
          mana: item.mana ?? 0,
          attack: item.attack ?? 0,
          hp: item.hp ?? 0,
          cost: item.cost ?? 0,
          packs: joinComma(item.packs),
        };
      },
    },
    packs: {
      label: 'Packs',
      title: 'Pack definitions',
      loadPath: '/packs',
      savePath: '/packs/add',
      deletePath: (item) => `/packs/${encodeURIComponent(item.tid)}`,
      identifier: (item) => item.tid,
      summary: (item) => [
        `${item.cards ?? 1} card(s)`,
        `Cost ${item.cost ?? 0}`,
        item.random ? 'Random' : 'Fixed',
      ],
      fields: [
        { key: 'tid', label: 'Pack ID', type: 'text', required: true, placeholder: 'starter' },
        { key: 'cards', label: 'Cards per pack', type: 'number', min: 1, defaultValue: 1 },
        { key: 'cost', label: 'Coin cost', type: 'number', min: 0, defaultValue: 0 },
        { key: 'random', label: 'Randomized pack', type: 'checkbox', defaultValue: true },
        { key: 'rarities_1st', label: 'First-slot rarities JSON', type: 'textarea', placeholder: '[{\"tid\":\"Rare\",\"chance\":25}]' },
        { key: 'rarities', label: 'Rarities JSON', type: 'textarea', placeholder: '[{\"tid\":\"Common\",\"chance\":70}]' },
        { key: 'variants', label: 'Variants JSON', type: 'textarea', placeholder: '[{\"tid\":\"foil\",\"chance\":5}]' },
      ],
      serialize(values) {
        return {
          tid: values.tid,
          cards: parseInteger(values.cards, 1),
          cost: parseInteger(values.cost, 0),
          random: Boolean(values.random),
          rarities_1st: parseJsonOrEmptyArray(values.rarities_1st),
          rarities: parseJsonOrEmptyArray(values.rarities),
          variants: parseJsonOrEmptyArray(values.variants),
        };
      },
      populate(item) {
        return {
          tid: item.tid || '',
          cards: item.cards ?? 1,
          cost: item.cost ?? 0,
          random: Boolean(item.random),
          rarities_1st: stringifyPretty(item.rarities_1st || []),
          rarities: stringifyPretty(item.rarities || []),
          variants: stringifyPretty(item.variants || []),
        };
      },
    },
    decks: {
      label: 'Decks',
      title: 'Deck templates',
      loadPath: '/decks',
      savePath: '/decks/add',
      deletePath: (item) => `/decks/${encodeURIComponent(item.tid)}`,
      identifier: (item) => item.tid,
      summary: (item) => [
        item.title || 'Untitled deck',
        `Cards ${Array.isArray(item.cards) ? item.cards.length : 0}`,
      ],
      fields: [
        { key: 'tid', label: 'Deck ID', type: 'text', required: true, placeholder: 'starter_mage' },
        { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'Starter Mage' },
        { key: 'hero', label: 'Hero JSON', type: 'textarea', placeholder: '{"tid":"hero_mage","variant":"default"}' },
        { key: 'cards', label: 'Cards JSON', type: 'textarea', placeholder: '[{"tid":"spell_fire","variant":"default","quantity":2}]' },
      ],
      serialize(values) {
        return {
          tid: values.tid,
          title: values.title,
          hero: parseJsonOrEmptyObject(values.hero),
          cards: parseJsonOrEmptyArray(values.cards),
        };
      },
      populate(item) {
        return {
          tid: item.tid || '',
          title: item.title || '',
          hero: stringifyPretty(item.hero || {}),
          cards: stringifyPretty(item.cards || []),
        };
      },
    },
    variants: {
      label: 'Variants',
      title: 'Variant modifiers',
      loadPath: '/variants',
      savePath: '/variants/add',
      deletePath: (item) => `/variants/${encodeURIComponent(item.tid)}`,
      identifier: (item) => item.tid,
      summary: (item) => [
        `Cost factor ${item.cost_factor ?? 1}`,
        item.is_default ? 'Default variant' : 'Optional variant',
      ],
      fields: [
        { key: 'tid', label: 'Variant ID', type: 'text', required: true, placeholder: 'foil' },
        { key: 'cost_factor', label: 'Cost factor', type: 'number', min: 1, defaultValue: 1 },
        { key: 'is_default', label: 'Default variant', type: 'checkbox', defaultValue: false },
      ],
      serialize(values) {
        return {
          tid: values.tid,
          cost_factor: parseInteger(values.cost_factor, 1),
          is_default: Boolean(values.is_default),
        };
      },
      populate(item) {
        return {
          tid: item.tid || '',
          cost_factor: item.cost_factor ?? 1,
          is_default: Boolean(item.is_default),
        };
      },
    },
    rewards: {
      label: 'Rewards',
      title: 'Reward catalog',
      loadPath: '/rewards',
      savePath: '/rewards/add',
      deletePath: (item) => `/rewards/${encodeURIComponent(item.tid)}`,
      identifier: (item) => item.tid,
      summary: (item) => [
        item.group ? `Group ${item.group}` : 'No group',
        item.repeat ? 'Repeatable' : 'One-time',
        `Coins ${item.coins ?? 0}`,
        `XP ${item.xp ?? 0}`,
      ],
      fields: [
        { key: 'tid', label: 'Reward ID', type: 'text', required: true, placeholder: 'launch_bonus' },
        { key: 'group', label: 'Group', type: 'text', placeholder: 'welcome' },
        { key: 'repeat', label: 'Repeatable reward', type: 'checkbox', defaultValue: false },
        { key: 'xp', label: 'XP', type: 'number', min: 0, defaultValue: 0 },
        { key: 'coins', label: 'Coins', type: 'number', min: 0, defaultValue: 0 },
        { key: 'cards', label: 'Card IDs', type: 'text', placeholder: 'card_knight, card_mage' },
        { key: 'packs', label: 'Pack IDs', type: 'text', placeholder: 'starter' },
        { key: 'decks', label: 'Deck IDs', type: 'text', placeholder: 'starter_mage' },
        { key: 'avatars', label: 'Avatar IDs', type: 'text', placeholder: 'avatar_fox' },
        { key: 'card_backs', label: 'Cardback IDs', type: 'text', placeholder: 'cb_fire' },
      ],
      serialize(values) {
        return {
          tid: values.tid,
          group: values.group || '',
          repeat: Boolean(values.repeat),
          xp: parseInteger(values.xp, 0),
          coins: parseInteger(values.coins, 0),
          cards: splitComma(values.cards),
          packs: splitComma(values.packs),
          decks: splitComma(values.decks),
          avatars: splitComma(values.avatars),
          card_backs: splitComma(values.card_backs),
        };
      },
      populate(item) {
        return {
          tid: item.tid || '',
          group: item.group || '',
          repeat: Boolean(item.repeat),
          xp: item.xp ?? 0,
          coins: item.coins ?? 0,
          cards: joinComma(item.cards),
          packs: joinComma(item.packs),
          decks: joinComma(item.decks),
          avatars: joinComma(item.avatars),
          card_backs: joinComma(item.card_backs),
        };
      },
    },
  };

  const state = {
    session: loadStoredSession(),
    summary: null,
    users: [],
    games: [],
    marketOffers: [],
    selectedUserId: null,
    selectedUserAccess: null,
    rewards: [],
    rolesCatalog: [],
    activity: [],
    activeView: 'overview',
    activeContentType: 'cards',
    contentCache: {},
    websocket: {
      socket: null,
      status: 'offline',
      reconnectTimer: null,
      refreshTimer: null,
    },
  };

  const elements = {};

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    bindElements();
    bindEvents();
    renderNavigation();
    buildContentTabs();
    renderContentForm();
    refreshSessionUi();
    if (state.session) {
      hydrateSession();
    }
  }

  function bindElements() {
    elements.authPanel = document.getElementById('authPanel');
    elements.dashboardApp = document.getElementById('dashboardApp');
    elements.loginForm = document.getElementById('loginForm');
    elements.loginMode = document.getElementById('loginMode');
    elements.identityLabel = document.getElementById('identityLabel');
    elements.loginIdentity = document.getElementById('loginIdentity');
    elements.loginPassword = document.getElementById('loginPassword');
    elements.authMessage = document.getElementById('authMessage');
    elements.loginButton = document.getElementById('loginButton');
    elements.refreshAllButton = document.getElementById('refreshAllButton');
    elements.logoutButton = document.getElementById('logoutButton');
    elements.sessionState = document.getElementById('sessionState');
    elements.sessionDetails = document.getElementById('sessionDetails');
    elements.systemVersion = document.getElementById('systemVersion');
    elements.dbState = document.getElementById('dbState');
    elements.metricsGrid = document.getElementById('metricsGrid');
    elements.healthGrid = document.getElementById('healthGrid');
    elements.collectionBars = document.getElementById('collectionBars');
    elements.alertList = document.getElementById('alertList');
    elements.onlineUsersList = document.getElementById('onlineUsersList');
    elements.overviewActivityBody = document.getElementById('overviewActivityBody');
    elements.overviewOffersBody = document.getElementById('overviewOffersBody');
    elements.usersTableBody = document.getElementById('usersTableBody');
    elements.userSearchInput = document.getElementById('userSearchInput');
    elements.reloadUsersButton = document.getElementById('reloadUsersButton');
    elements.userDetailEmpty = document.getElementById('userDetailEmpty');
    elements.userDetailCard = document.getElementById('userDetailCard');
    elements.detailUsername = document.getElementById('detailUsername');
    elements.detailEmail = document.getElementById('detailEmail');
    elements.detailBadges = document.getElementById('detailBadges');
    elements.detailStats = document.getElementById('detailStats');
    elements.permissionForm = document.getElementById('permissionForm');
    elements.permissionSelect = document.getElementById('permissionSelect');
    elements.playerStateForm = document.getElementById('playerStateForm');
    elements.playerCoinsInput = document.getElementById('playerCoinsInput');
    elements.playerXpInput = document.getElementById('playerXpInput');
    elements.playerEloInput = document.getElementById('playerEloInput');
    elements.playerValidationInput = document.getElementById('playerValidationInput');
    elements.playerAvatarInput = document.getElementById('playerAvatarInput');
    elements.playerCardbackInput = document.getElementById('playerCardbackInput');
    elements.rewardGrantForm = document.getElementById('rewardGrantForm');
    elements.rewardSelect = document.getElementById('rewardSelect');
    elements.roleAssignForm = document.getElementById('roleAssignForm');
    elements.roleSelect = document.getElementById('roleSelect');
    elements.roleHint = document.getElementById('roleHint');
    elements.userJsonPreview = document.getElementById('userJsonPreview');
    elements.copyUserJsonButton = document.getElementById('copyUserJsonButton');
    elements.contentTabs = document.getElementById('contentTabs');
    elements.contentForm = document.getElementById('contentForm');
    elements.contentFormTitle = document.getElementById('contentFormTitle');
    elements.contentListTitle = document.getElementById('contentListTitle');
    elements.contentSearchInput = document.getElementById('contentSearchInput');
    elements.contentList = document.getElementById('contentList');
    elements.reloadContentButton = document.getElementById('reloadContentButton');
    elements.activityFilterForm = document.getElementById('activityFilterForm');
    elements.activityTypeInput = document.getElementById('activityTypeInput');
    elements.activityUserInput = document.getElementById('activityUserInput');
    elements.activityLimitInput = document.getElementById('activityLimitInput');
    elements.activityTableBody = document.getElementById('activityTableBody');
    elements.reloadActivityButton = document.getElementById('reloadActivityButton');
    elements.matchesTableBody = document.getElementById('matchesTableBody');
    elements.tradesTableBody = document.getElementById('tradesTableBody');
    elements.marketOffersTableBody = document.getElementById('marketOffersTableBody');
    elements.newUsersList = document.getElementById('newUsersList');
    elements.toastRegion = document.getElementById('toastRegion');
    elements.viewButtons = Array.from(document.querySelectorAll('[data-view-button]'));
    elements.views = Array.from(document.querySelectorAll('[data-view]'));
  }

  function bindEvents() {
    elements.loginMode.addEventListener('change', () => {
      elements.identityLabel.textContent = elements.loginMode.value === 'email' ? 'Email' : 'Username';
      elements.loginIdentity.setAttribute('autocomplete', elements.loginMode.value === 'email' ? 'email' : 'username');
    });

    elements.loginForm.addEventListener('submit', handleLogin);
    elements.refreshAllButton.addEventListener('click', () => {
      refreshDashboardData(true).catch((error) => {
        toast('Refresh failed', error.message || 'Unable to refresh dashboard data.', 'danger');
      });
    });
    elements.logoutButton.addEventListener('click', () => logout(true));
    elements.reloadUsersButton.addEventListener('click', () => {
      loadUsers().catch((error) => {
        toast('User reload failed', error.message || 'Unable to load users.', 'danger');
      });
    });
    elements.userSearchInput.addEventListener('input', renderUsersTable);
    elements.permissionForm.addEventListener('submit', handlePermissionSave);
    elements.playerStateForm.addEventListener('submit', handlePlayerStateSave);
    elements.rewardGrantForm.addEventListener('submit', handleRewardGrant);
    elements.roleAssignForm.addEventListener('submit', handleRoleAssignmentSave);
    elements.copyUserJsonButton.addEventListener('click', copySelectedUserJson);
    elements.contentSearchInput.addEventListener('input', renderContentList);
    elements.reloadContentButton.addEventListener('click', () => {
      loadContent(state.activeContentType, true).catch((error) => {
        toast('Catalog reload failed', error.message || 'Unable to reload this catalog.', 'danger');
      });
    });
    elements.contentForm.addEventListener('submit', handleContentSubmit);
    elements.activityFilterForm.addEventListener('submit', handleActivityFilter);
    elements.reloadActivityButton.addEventListener('click', () => {
      loadActivity(true).catch((error) => {
        toast('Activity reload failed', error.message || 'Unable to reload activity.', 'danger');
      });
    });

    elements.viewButtons.forEach((button) => {
      button.addEventListener('click', () => {
        state.activeView = button.dataset.viewButton;
        renderNavigation();
      });
    });
  }

  async function hydrateSession() {
    try {
      const session = await apiRequest('/auth/validate');
      applySessionData(session);
      storeSession();
    } catch (error) {
      logout(false);
      toast('Session expired', error.message || 'Please sign in again.', 'warning');
      return;
    }

    if (!hasDashboardAccess()) {
      logout(false);
      toast('Session expired', 'This account is missing admin dashboard access.', 'warning');
      return;
    }

    await afterAuthentication();
  }

  async function handleLogin(event) {
    event.preventDefault();
    setAuthMessage('Signing in...', 'info');
    elements.loginButton.disabled = true;

    const mode = elements.loginMode.value;
    const body = {
      password: elements.loginPassword.value,
    };
    body[mode] = elements.loginIdentity.value.trim();

    try {
      const session = await rawRequest('/auth', {
        method: 'POST',
        body,
      });

      state.session = {
        id: session.id,
        username: session.username,
        permission_level: session.permission_level,
        validation_level: session.validation_level,
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        role_ids: Array.isArray(session.role_ids) ? session.role_ids : [],
        permissions: Array.isArray(session.permissions) ? session.permissions : [],
        duration: session.duration,
      };

      if (!hasDashboardAccess()) {
        state.session = null;
        clearStoredSession();
        refreshSessionUi();
        setAuthMessage('This account is missing admin dashboard access.', 'danger');
        toast('Sign-in failed', 'This account is missing admin dashboard access.', 'danger');
        elements.loginButton.disabled = false;
        return;
      }

      storeSession();

      elements.loginForm.reset();
      elements.identityLabel.textContent = 'Username';
      elements.loginMode.value = 'username';
      await afterAuthentication();
      setAuthMessage('Admin session ready.', 'success');
      toast('Signed in', `Welcome back, ${state.session.username}.`, 'success');
    } catch (error) {
      state.session = null;
      clearStoredSession();
      refreshSessionUi();
      setAuthMessage(error.message || 'Unable to sign in.', 'danger');
      toast('Sign-in failed', error.message || 'Unable to sign in.', 'danger');
    } finally {
      elements.loginButton.disabled = false;
    }
  }

  async function afterAuthentication() {
    refreshSessionUi();
    elements.authPanel.classList.add('is-hidden');
    elements.dashboardApp.classList.remove('is-hidden');
    await refreshDashboardData();
    connectRealtime();
  }

  function logout(showToast = true) {
    disconnectRealtime();
    state.session = null;
    state.summary = null;
    state.users = [];
    state.games = [];
    state.marketOffers = [];
    state.selectedUserId = null;
    state.selectedUserAccess = null;
    state.rewards = [];
    state.rolesCatalog = [];
    state.activity = [];
    state.contentCache = {};
    clearStoredSession();
    refreshSessionUi();
    renderEmptyDashboard();
    elements.dashboardApp.classList.add('is-hidden');
    elements.authPanel.classList.remove('is-hidden');
    setAuthMessage('Use an account with admin permissions.', 'info');
    if (showToast) {
      toast('Signed out', 'The admin session has been cleared.', 'info');
    }
  }

  async function refreshDashboardData(showToast = false) {
    if (!state.session) {
      return;
    }

    elements.refreshAllButton.disabled = true;

    try {
      const tasks = [
        loadSummary(),
        loadUsers(),
        loadContent(state.activeContentType),
      ];

      if (canManageUsers()) {
        tasks.push(loadRewards());
      } else {
        state.rewards = [];
        renderRewardOptions();
      }

      if (canReadRoles()) {
        tasks.push(loadRoles());
      } else {
        state.rolesCatalog = [];
        state.selectedUserAccess = null;
        renderRoleOptions();
      }

      if (canReadAudit()) {
        tasks.push(loadActivity(false));
      } else {
        state.activity = [];
        renderActivityTable();
      }

      if (canManageGames()) {
        tasks.push(loadGames());
      } else {
        state.games = [];
      }

      if (canManageMarket()) {
        tasks.push(loadOffers());
      } else {
        state.marketOffers = [];
      }

      const [summary] = await Promise.all(tasks);

      renderSummary(summary);
      if (!state.selectedUserId && state.users.length > 0) {
        state.selectedUserId = state.users[0].id;
      }
      renderSelectedUser();
      if (showToast) {
        toast('Dashboard refreshed', 'All monitoring and management data has been updated.', 'success');
      }
    } finally {
      elements.refreshAllButton.disabled = false;
    }
  }

  async function loadSummary() {
    const summary = await apiRequest('/admin/api/summary');
    state.summary = summary;
    refreshSessionUi();
    return summary;
  }

  async function loadUsers() {
    const users = await apiRequest('/users');
    state.users = Array.isArray(users) ? users : [];
    if (state.selectedUserId && !state.users.some((user) => user.id === state.selectedUserId)) {
      state.selectedUserId = state.users[0]?.id || null;
    }
    if (!state.selectedUserId && state.users.length > 0) {
      state.selectedUserId = state.users[0].id;
    }
    renderUsersTable();
    if (canReadRoles()) {
      await loadSelectedUserAccess();
    } else {
      state.selectedUserAccess = null;
    }
    renderSelectedUser();
    return state.users;
  }

  async function loadRewards() {
    if (!canManageUsers()) {
      state.rewards = [];
      renderRewardOptions();
      return state.rewards;
    }

    const rewards = await apiRequest('/rewards');
    state.rewards = Array.isArray(rewards) ? rewards : [];
    renderRewardOptions();
    return state.rewards;
  }

  async function loadActivity(showToast = false) {
    if (!canReadAudit()) {
      state.activity = [];
      renderActivityTable();
      return state.activity;
    }

    const params = new URLSearchParams();
    const type = elements.activityTypeInput.value.trim();
    const username = elements.activityUserInput.value.trim();
    const limit = parseInteger(elements.activityLimitInput.value, DEFAULT_ACTIVITY_LIMIT);

    if (type) {
      params.set('type', type);
    }
    if (username) {
      params.set('username', username);
    }
    params.set('limit', String(limit));

    const activity = await apiRequest(`/activity?${params.toString()}`);
    state.activity = Array.isArray(activity) ? activity : [];
    renderActivityTable();
    if (showToast) {
      toast('Activity updated', `Loaded ${state.activity.length} log entries.`, 'success');
    }
    return state.activity;
  }

  async function loadRoles() {
    if (!canReadRoles()) {
      state.rolesCatalog = [];
      renderRoleOptions();
      return state.rolesCatalog;
    }

    const payload = await apiRequest('/admin/roles');
    state.rolesCatalog = Array.isArray(payload.roles) ? payload.roles : [];
    renderRoleOptions();
    return state.rolesCatalog;
  }

  async function loadSelectedUserAccess() {
    if (!canReadRoles()) {
      state.selectedUserAccess = null;
      renderRoleOptions();
      return null;
    }

    const user = getSelectedUser();
    if (!user) {
      state.selectedUserAccess = null;
      renderRoleOptions();
      return null;
    }

    try {
      state.selectedUserAccess = await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/access`);
    } catch (error) {
      state.selectedUserAccess = null;
    }

    renderRoleOptions();
    return state.selectedUserAccess;
  }

  async function loadGames() {
    if (!canManageGames()) {
      state.games = [];
      return state.games;
    }

    const payload = await apiRequest('/admin/api/games?limit=25');
    state.games = Array.isArray(payload.matches) ? payload.matches : [];
    return state.games;
  }

  async function loadOffers() {
    if (!canManageMarket()) {
      state.marketOffers = [];
      return state.marketOffers;
    }

    const payload = await apiRequest('/admin/api/offers?limit=25');
    state.marketOffers = Array.isArray(payload.offers) ? payload.offers : [];
    return state.marketOffers;
  }

  async function loadContent(type, force = false) {
    const module = contentModules[type];
    if (!module) {
      return [];
    }

    if (!force && Array.isArray(state.contentCache[type])) {
      renderContentList();
      return state.contentCache[type];
    }

    const items = await apiRequest(module.loadPath);
    state.contentCache[type] = Array.isArray(items) ? items : [];
    renderContentList();
    return state.contentCache[type];
  }

  async function handlePermissionSave(event) {
    event.preventDefault();
    const user = getSelectedUser();
    if (!user || !canManageUsers()) {
      return;
    }

    const permissionLevel = parseInteger(elements.permissionSelect.value, user.permission_level || 0);
    try {
      await apiRequest(`/users/permission/edit/${encodeURIComponent(user.id)}`, {
        method: 'POST',
        body: { permission_level: permissionLevel },
      });
      toast('Permission updated', `${user.username} now has level ${permissionLevel}.`, 'success');
      await Promise.all([loadUsers(), loadSummary()]);
    } catch (error) {
      toast('Permission update failed', error.message || 'Unable to update permissions.', 'danger');
    }
  }

  async function handlePlayerStateSave(event) {
    event.preventDefault();
    const user = getSelectedUser();
    if (!user || !canManageUsers()) {
      return;
    }

    try {
      await apiRequest(`/admin/api/players/${encodeURIComponent(user.id)}`, {
        method: 'POST',
        body: {
          coins: elements.playerCoinsInput.value,
          xp: elements.playerXpInput.value,
          elo: elements.playerEloInput.value,
          validation_level: elements.playerValidationInput.value,
          avatar: elements.playerAvatarInput.value,
          cardback: elements.playerCardbackInput.value,
        },
      });
      toast('Player updated', `${user.username} was updated.`, 'success');
      await Promise.all([loadUsers(), loadSummary()]);
    } catch (error) {
      toast('Player update failed', error.message || 'Unable to update this player.', 'danger');
    }
  }

  async function handleRewardGrant(event) {
    event.preventDefault();
    const user = getSelectedUser();
    const reward = elements.rewardSelect.value;
    if (!canManageUsers()) {
      toast('Reward not granted', 'This admin role cannot grant rewards.', 'warning');
      return;
    }

    if (!user || !reward) {
      toast('Reward not granted', 'Select a user and a reward first.', 'warning');
      return;
    }

    try {
      await apiRequest(`/users/rewards/gain/${encodeURIComponent(user.id)}`, {
        method: 'POST',
        body: { reward },
      });
      toast('Reward granted', `${reward} was granted to ${user.username}.`, 'success');
      await Promise.all([loadUsers(), loadSummary(), loadActivity(true)]);
    } catch (error) {
      toast('Reward grant failed', error.message || 'Unable to grant reward.', 'danger');
    }
  }

  async function handleRoleAssignmentSave(event) {
    event.preventDefault();
    const user = getSelectedUser();
    if (!user || !canManageRoles()) {
      return;
    }

    const selectedRoles = Array.from(elements.roleSelect.selectedOptions).map((option) => option.value);

    try {
      await apiRequest(`/admin/users/${encodeURIComponent(user.id)}/roles`, {
        method: 'POST',
        body: { roles: selectedRoles },
      });
      toast('Roles updated', `${user.username} role assignment was updated.`, 'success');
      await Promise.all([loadUsers(), loadSummary(), loadRoles()]);
      await loadSelectedUserAccess();
      renderSelectedUser();
    } catch (error) {
      toast('Role update failed', error.message || 'Unable to update roles.', 'danger');
    }
  }

  async function handleContentSubmit(event) {
    event.preventDefault();
    if (!canManageContent()) {
      toast('Save blocked', 'This admin role cannot change catalog entries.', 'warning');
      return;
    }

    const module = contentModules[state.activeContentType];
    const formData = new FormData(elements.contentForm);
    const values = {};

    module.fields.forEach((field) => {
      if (field.type === 'checkbox') {
        values[field.key] = formData.get(field.key) === 'on';
      } else {
        values[field.key] = String(formData.get(field.key) || '').trim();
      }
    });

    try {
      const payload = module.serialize(values);
      await apiRequest(module.savePath, {
        method: 'POST',
        body: payload,
      });
      toast(`${module.label} saved`, `${payload.tid || payload.title || 'Entry'} was saved.`, 'success');
      elements.contentForm.reset();
      applyContentFormDefaults();
      await Promise.all([loadContent(state.activeContentType, true), loadSummary()]);
    } catch (error) {
      toast('Save failed', error.message || 'Unable to save this catalog entry.', 'danger');
    }
  }

  async function handleActivityFilter(event) {
    event.preventDefault();
    try {
      await loadActivity(true);
    } catch (error) {
      toast('Activity filter failed', error.message || 'Unable to load activity.', 'danger');
    }
  }

  function renderNavigation() {
    elements.viewButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.viewButton === state.activeView);
    });

    elements.views.forEach((view) => {
      view.classList.toggle('is-active', view.dataset.view === state.activeView);
    });
  }

  function renderEmptyDashboard() {
    elements.metricsGrid.innerHTML = '';
    elements.healthGrid.innerHTML = '';
    elements.collectionBars.innerHTML = '';
    elements.alertList.innerHTML = '';
    elements.onlineUsersList.innerHTML = '';
    elements.overviewActivityBody.innerHTML = '';
    elements.overviewOffersBody.innerHTML = '';
    elements.usersTableBody.innerHTML = '';
    elements.activityTableBody.innerHTML = '';
    elements.matchesTableBody.innerHTML = '';
    elements.tradesTableBody.innerHTML = '';
    elements.newUsersList.innerHTML = '';
    elements.contentList.innerHTML = '';
    elements.systemVersion.textContent = 'Version unknown';
    elements.dbState.textContent = 'Database unknown';
    elements.marketOffersTableBody.innerHTML = '';
    renderRewardOptions();
    renderRoleOptions();
    syncPermissionScopedUi();
    renderSelectedUser();
  }

  function renderSummary(summary) {
    if (!summary) {
      return;
    }

    elements.systemVersion.textContent = `${summary.system.title} v${summary.system.version}`;
    elements.dbState.textContent = summary.database.connected ? 'Gameplay ready' : 'Gameplay offline';

    const metrics = [
      { label: 'Users', value: summary.collections.users, note: `${summary.users.online} online now` },
      { label: 'Cards', value: summary.collections.cards, note: `${summary.collections.packs} packs defined` },
      { label: 'Matches', value: summary.collections.matches, note: `${summary.collections.activities} activity entries` },
      { label: 'Offers', value: summary.collections.offers, note: `${summary.collections.rewards} rewards available` },
      { label: 'Trades', value: summary.operations.recent_trades, note: `${summary.operations.roles} roles loaded` },
      { label: 'Uptime', value: formatDuration(summary.system.uptime_seconds), note: summary.system.environment },
      { label: 'Memory', value: formatBytes(summary.system.memory.rss), note: `Heap ${formatBytes(summary.system.memory.heapUsed)}` },
      { label: 'Realtime', value: summary.operations.websocket.connected_clients, note: `WS clients / RCON ${summary.operations.rcon.active_clients}` },
    ];

    elements.metricsGrid.innerHTML = metrics.map((metric) => `
      <article class="metric-card">
        <span class="metric-label">${escapeHtml(metric.label)}</span>
        <strong class="metric-value">${escapeHtml(String(metric.value))}</strong>
        <span class="metric-note">${escapeHtml(metric.note)}</span>
      </article>
    `).join('');

    const healthCards = [
      { label: 'Hostname', value: summary.system.hostname, note: summary.system.platform },
      { label: 'Node', value: summary.system.node_version, note: `Generated ${formatDateTime(summary.generated_at)}` },
      { label: 'Gameplay store', value: summary.database.driver, note: summary.database.connected ? 'Connected' : 'Disconnected' },
      { label: 'Ops store', value: summary.operations.store.driver, note: summary.operations.store.connected ? 'Connected' : 'Disconnected' },
      { label: 'Traffic', value: summary.security.allow_https ? 'HTTPS on' : 'HTTPS off', note: `${summary.security.allow_http ? 'HTTP on' : 'HTTP off'} / ${summary.operations.transport.stack}` },
      { label: 'Realtime', value: summary.operations.websocket.enabled ? 'WS enabled' : 'WS disabled', note: summary.operations.websocket.path || '/ws' },
      { label: 'Compression', value: summary.operations.transport.compression_enabled ? 'Enabled' : 'Disabled', note: summary.security.api_host_restriction || 'No host restriction' },
      { label: 'Permissions', value: `A${summary.security.permissions.ADMIN}`, note: `S${summary.security.permissions.SERVER} / U${summary.security.permissions.USER}` },
    ];

    elements.healthGrid.innerHTML = healthCards.map((card) => `
      <article class="health-card">
        <span class="metric-label">${escapeHtml(card.label)}</span>
        <strong>${escapeHtml(card.value)}</strong>
        <span class="metric-note">${escapeHtml(card.note)}</span>
      </article>
    `).join('');

    const collectionEntries = Object.entries(summary.collections);
    const maxCount = Math.max(...collectionEntries.map((entry) => entry[1]), 1);
    elements.collectionBars.innerHTML = collectionEntries.map(([key, value]) => `
      <article class="collection-row">
        <header>
          <strong>${escapeHtml(titleCase(key))}</strong>
          <span>${escapeHtml(String(value))}</span>
        </header>
        <div class="collection-track">
          <div class="collection-fill" style="width:${Math.max((value / maxCount) * 100, 5)}%"></div>
        </div>
      </article>
    `).join('');

    const alerts = summary.alerts.length > 0 ? summary.alerts : [{
      level: 'success',
      title: 'No active alerts',
      detail: 'The service currently has no dashboard-generated operator warnings.',
    }];
    elements.alertList.innerHTML = alerts.map((alert) => `
      <article class="stack-item tone-${escapeHtml(alert.level)}">
        <header>
          <strong>${escapeHtml(alert.title)}</strong>
          <span class="tiny-chip">${escapeHtml(alert.level)}</span>
        </header>
        <p>${escapeHtml(alert.detail)}</p>
      </article>
    `).join('');

    renderStackList(elements.onlineUsersList, summary.users.online_users, (user) => `
      <article class="stack-item">
        <header>
          <strong>${escapeHtml(user.username || 'Unknown')}</strong>
          <span class="tiny-chip">${escapeHtml(permissionLabel(user.permission_level, summary.security.permissions))}</span>
        </header>
        <p>${escapeHtml(formatDateTime(user.last_online_time))}</p>
      </article>
    `, 'No users online in the last 10 minutes.');

    renderOverviewTables(summary);
    renderOperationsTables(summary);
    renderNewUsers(summary.users.newest_users || []);
    renderPermissionOptions(summary.security.permissions || permissionFallbacks);
    renderRoleOptions();
    syncPermissionScopedUi();
  }

  function renderOverviewTables(summary) {
    elements.overviewActivityBody.innerHTML = renderTableRows(summary.recent_activity, (activity) => `
      <tr>
        <td>${escapeHtml(activity.type || '-')}</td>
        <td>${escapeHtml(activity.username || '-')}</td>
        <td>${escapeHtml(formatDateTime(activity.timestamp))}</td>
        <td><pre class="payload-chip">${escapeHtml(stringifyCompact(activity.data))}</pre></td>
      </tr>
    `, 4, 'No activity entries yet.');

    elements.overviewOffersBody.innerHTML = renderTableRows(summary.recent_offers, (offer) => `
      <tr>
        <td>${escapeHtml(offer.seller || '-')}</td>
        <td>${escapeHtml(offer.card || '-')}</td>
        <td>${escapeHtml(offer.variant || '-')}</td>
        <td>${escapeHtml(String(offer.quantity ?? '-'))}</td>
        <td>${escapeHtml(String(offer.price ?? '-'))}</td>
      </tr>
    `, 5, 'No active offers found.');

    elements.tradesTableBody.innerHTML = renderTableRows(summary.recent_trades, (trade) => `
      <tr>
        <td>${escapeHtml(trade.trade_id || '-')}</td>
        <td>${escapeHtml(trade.initiator_username || '-')}</td>
        <td>${escapeHtml(trade.target_username || '-')}</td>
        <td>${escapeHtml(trade.status || '-')}</td>
      </tr>
    `, 4, 'No trade activity available.');
  }

  function renderOperationsTables(summary) {
    const matches = state.games.length > 0 ? state.games : (summary?.recent_matches || []);
    const offers = state.marketOffers.length > 0 ? state.marketOffers : (summary?.recent_offers || []);
    const allowGameActions = canManageGames() && state.games.length > 0;
    const allowOfferActions = canManageMarket() && state.marketOffers.length > 0;

    elements.matchesTableBody.innerHTML = renderTableRows(matches, (match) => `
      <tr>
        <td>${escapeHtml(match.tid || '-')}</td>
        <td>${escapeHtml(Array.isArray(match.players) ? match.players.join(' vs ') : '-')}</td>
        <td>${escapeHtml(match.winner || 'Pending')}</td>
        <td>${escapeHtml(match.mode || (match.ranked ? 'Ranked' : 'Casual'))}</td>
        <td>${allowGameActions ? `<button class="ghost-button" type="button" data-match-delete="${escapeHtml(match.tid)}">Delete</button>` : '-'}</td>
      </tr>
    `, 5, 'No match history available.');

    elements.marketOffersTableBody.innerHTML = renderTableRows(offers, (offer) => `
      <tr>
        <td>${escapeHtml(offer.seller || '-')}</td>
        <td>${escapeHtml(offer.card || '-')}</td>
        <td>${escapeHtml(offer.variant || '-')}</td>
        <td>${escapeHtml(String(offer.quantity ?? '-'))}</td>
        <td>${escapeHtml(String(offer.price ?? '-'))}</td>
        <td>${allowOfferActions ? `<button class="ghost-button" type="button" data-offer-delete="${escapeHtml(offer.offer_id || '')}">Remove</button>` : '-'}</td>
      </tr>
    `, 6, 'No market offers available.');

    elements.matchesTableBody.querySelectorAll('[data-match-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const matchId = button.dataset.matchDelete;
        if (!window.confirm(`Delete match ${matchId}?`)) {
          return;
        }

        try {
          await apiRequest(`/admin/api/games/${encodeURIComponent(matchId)}`, { method: 'DELETE' });
          toast('Match deleted', `${matchId} was removed.`, 'success');
          await Promise.all([loadSummary(), loadGames()]);
          renderOperationsTables(state.summary);
        } catch (error) {
          toast('Match delete failed', error.message || 'Unable to delete this match.', 'danger');
        }
      });
    });

    elements.marketOffersTableBody.querySelectorAll('[data-offer-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const offerId = button.dataset.offerDelete;
        if (!offerId || !window.confirm(`Remove market offer ${offerId}? Cards will be returned to the seller when possible.`)) {
          return;
        }

        try {
          await apiRequest(`/admin/api/offers/${encodeURIComponent(offerId)}`, { method: 'DELETE' });
          toast('Offer removed', `${offerId} was removed.`, 'success');
          await Promise.all([loadSummary(), loadOffers(), loadUsers()]);
          renderOperationsTables(state.summary);
        } catch (error) {
          toast('Offer removal failed', error.message || 'Unable to remove this offer.', 'danger');
        }
      });
    });
  }

  function renderUsersTable() {
    const permissions = state.summary?.security?.permissions || permissionFallbacks;
    const search = elements.userSearchInput.value.trim().toLowerCase();
    const filteredUsers = state.users.filter((user) => {
      const haystack = `${user.username || ''} ${user.email || ''}`.toLowerCase();
      return !search || haystack.includes(search);
    });

    elements.usersTableBody.innerHTML = renderTableRows(filteredUsers, (user) => `
      <tr>
        <td>
          <strong>${escapeHtml(user.username || '-')}</strong><br>
          <span class="metric-note">${escapeHtml(user.email || 'No email')}</span>
        </td>
        <td>${escapeHtml(permissionLabel(user.permission_level, permissions))}</td>
        <td>${user.validation_level >= 1 ? 'Yes' : 'No'}</td>
        <td>${escapeHtml(relativeTime(user.last_online_time))}</td>
        <td>
          <div class="row-actions">
            <button class="ghost-button" type="button" data-user-select="${escapeHtml(user.id)}">Inspect</button>
          </div>
        </td>
      </tr>
    `, 5, 'No users match the current filter.');

    elements.usersTableBody.querySelectorAll('[data-user-select]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.selectedUserId = button.dataset.userSelect;
        await loadSelectedUserAccess();
        renderSelectedUser();
      });
    });
  }

  function renderSelectedUser() {
    const user = getSelectedUser();
    if (!user) {
      elements.userDetailEmpty.classList.remove('is-hidden');
      elements.userDetailCard.classList.add('is-hidden');
      return;
    }

    elements.userDetailEmpty.classList.add('is-hidden');
    elements.userDetailCard.classList.remove('is-hidden');
    elements.detailUsername.textContent = user.username || 'Unknown';
    elements.detailEmail.textContent = user.email || 'No email';

    const permissions = state.summary?.security?.permissions || permissionFallbacks;
    elements.detailBadges.innerHTML = `
      <span class="badge">${escapeHtml(permissionLabel(user.permission_level, permissions))}</span>
      <span class="badge">${user.validation_level >= 1 ? 'Validated' : 'Unverified'}</span>
      <span class="badge">${escapeHtml(relativeTime(user.last_online_time))}</span>
    `;

    const stats = [
      ['Coins', user.coins ?? 0],
      ['XP', user.xp ?? 0],
      ['ELO', user.elo ?? 0],
      ['Cards', Array.isArray(user.cards) ? user.cards.length : 0],
      ['Packs', Array.isArray(user.packs) ? user.packs.length : 0],
      ['Friends', Array.isArray(user.friends) ? user.friends.length : 0],
    ];
    elements.detailStats.innerHTML = stats.map(([label, value]) => `
      <article class="mini-stat">
        <span class="metric-label">${escapeHtml(label)}</span>
        <strong>${escapeHtml(String(value))}</strong>
      </article>
    `).join('');

    elements.permissionSelect.value = String(user.permission_level ?? 0);
    elements.playerCoinsInput.value = String(user.coins ?? 0);
    elements.playerXpInput.value = String(user.xp ?? 0);
    elements.playerEloInput.value = String(user.elo ?? 0);
    elements.playerValidationInput.value = String(user.validation_level ?? 0);
    elements.playerAvatarInput.value = user.avatar || '';
    elements.playerCardbackInput.value = user.cardback || '';
    setFormDisabled(elements.permissionForm, !canManageUsers());
    setFormDisabled(elements.playerStateForm, !canManageUsers());
    setFormDisabled(elements.rewardGrantForm, !canManageUsers());
    renderRoleOptions();
    const access = state.selectedUserAccess?.access || null;
    if (!canReadRoles()) {
      elements.roleHint.textContent = 'This session cannot read RBAC assignments.';
      setFormDisabled(elements.roleAssignForm, true);
    } else if (user.permission_level < (state.summary?.security?.permissions?.ADMIN || permissionFallbacks.ADMIN)) {
      elements.roleHint.textContent = 'Raise this user to Admin permission level before assigning RBAC roles.';
      setFormDisabled(elements.roleAssignForm, true);
    } else if (!canManageRoles()) {
      elements.roleHint.textContent = `Assigned roles: ${(access?.role_ids || []).join(', ') || 'none'}.`;
      setFormDisabled(elements.roleAssignForm, true);
    } else {
      elements.roleHint.textContent = access?.legacy_admin_fallback
        ? 'This admin is currently using legacy fallback access. Assign explicit roles to move them onto RBAC.'
        : `Assigned roles: ${(access?.role_ids || []).join(', ') || 'none'}.`;
      setFormDisabled(elements.roleAssignForm, false);
    }
    elements.userJsonPreview.textContent = stringifyPretty(user);
  }

  function renderRewardOptions() {
    const options = ['<option value="">Select reward</option>'];
    state.rewards.forEach((reward) => {
      options.push(`<option value="${escapeHtml(reward.tid)}">${escapeHtml(reward.tid)}</option>`);
    });
    elements.rewardSelect.innerHTML = options.join('');
  }

  function renderPermissionOptions(permissions = permissionFallbacks) {
    const options = [
      { label: 'Disabled', value: 0 },
      { label: 'User', value: permissions.USER },
      { label: 'Server', value: permissions.SERVER },
      { label: 'Admin', value: permissions.ADMIN },
    ];

    elements.permissionSelect.innerHTML = options.map((option) => `
      <option value="${escapeHtml(String(option.value))}">${escapeHtml(option.label)} (${escapeHtml(String(option.value))})</option>
    `).join('');

    if (getSelectedUser()) {
      elements.permissionSelect.value = String(getSelectedUser().permission_level ?? 0);
    }
  }

  function renderRoleOptions() {
    const selectedRoleIds = state.selectedUserAccess?.access?.role_ids || [];
    if (!elements.roleSelect) {
      return;
    }

    if (!canReadRoles()) {
      elements.roleSelect.innerHTML = '';
      return;
    }

    elements.roleSelect.innerHTML = state.rolesCatalog.map((role) => `
      <option value="${escapeHtml(role.role_id)}" ${selectedRoleIds.includes(role.role_id) ? 'selected' : ''}>
        ${escapeHtml(role.name)} (${escapeHtml(role.role_id)})
      </option>
    `).join('');
  }

  function buildContentTabs() {
    elements.contentTabs.innerHTML = Object.entries(contentModules).map(([key, module]) => `
      <button class="tab-button ${key === state.activeContentType ? 'is-active' : ''}" type="button" data-content-tab="${escapeHtml(key)}">
        ${escapeHtml(module.label)}
      </button>
    `).join('');

    elements.contentTabs.querySelectorAll('[data-content-tab]').forEach((button) => {
      button.addEventListener('click', async () => {
        state.activeContentType = button.dataset.contentTab;
        buildContentTabs();
        renderContentForm();
        try {
          await loadContent(state.activeContentType);
        } catch (error) {
          toast('Catalog load failed', error.message || 'Unable to load this catalog.', 'danger');
        }
      });
    });
  }

  function renderContentForm(item = null) {
    const module = contentModules[state.activeContentType];
    elements.contentFormTitle.textContent = module.title;
    elements.contentListTitle.textContent = `${module.label} list`;

    const values = item ? module.populate(item) : module.populate({});
    const fieldsHtml = module.fields.map((field) => renderField(field, values[field.key])).join('');

    elements.contentForm.innerHTML = `
      ${fieldsHtml}
      ${canManageContent() ? '' : '<p class="helper-text">This session can inspect the catalog but cannot change it.</p>'}
      <div class="auth-actions">
        <button class="primary-button" type="submit">Save ${escapeHtml(module.label.slice(0, -1) || module.label)}</button>
        <button id="contentResetButton" class="ghost-button" type="button">Clear Form</button>
      </div>
    `;

    document.getElementById('contentResetButton').addEventListener('click', () => {
      elements.contentForm.reset();
      applyContentFormDefaults();
    });

    applyContentFormDefaults(values);
    setFormDisabled(elements.contentForm, !canManageContent());
  }

  function renderContentList() {
    const module = contentModules[state.activeContentType];
    const canEditContent = canManageContent();
    const search = elements.contentSearchInput.value.trim().toLowerCase();
    const items = Array.isArray(state.contentCache[state.activeContentType]) ? state.contentCache[state.activeContentType] : [];

    const filtered = items.filter((item) => {
      const haystack = `${module.identifier(item)} ${JSON.stringify(item)}`.toLowerCase();
      return !search || haystack.includes(search);
    });

    if (filtered.length === 0) {
      elements.contentList.innerHTML = '<div class="empty-state"><p>No catalog entries match the current filter.</p></div>';
      return;
    }

    elements.contentList.innerHTML = filtered.map((item) => `
      <article class="content-item">
        <header>
          <div>
            <h4>${escapeHtml(module.identifier(item))}</h4>
            <p class="metric-note">${escapeHtml(getContentSubtitle(item))}</p>
          </div>
          <div class="content-actions">
            <button class="ghost-button" type="button" data-content-edit="${escapeHtml(module.identifier(item))}">Edit</button>
            ${canEditContent ? `<button class="ghost-button" type="button" data-content-delete="${escapeHtml(module.identifier(item))}">Delete</button>` : ''}
          </div>
        </header>
        <div class="content-meta">
          ${module.summary(item).map((entry) => `<span>${escapeHtml(String(entry))}</span>`).join('')}
        </div>
        <pre class="payload-chip">${escapeHtml(stringifyPretty(item))}</pre>
      </article>
    `).join('');

    elements.contentList.querySelectorAll('[data-content-edit]').forEach((button) => {
      button.addEventListener('click', () => {
        const item = filtered.find((entry) => module.identifier(entry) === button.dataset.contentEdit);
        renderContentForm(item);
        toast('Form populated', `Editing ${button.dataset.contentEdit}.`, 'info');
      });
    });

    elements.contentList.querySelectorAll('[data-content-delete]').forEach((button) => {
      button.addEventListener('click', async () => {
        const targetId = button.dataset.contentDelete;
        if (!window.confirm(`Delete ${targetId}? This cannot be undone.`)) {
          return;
        }

        try {
          const item = filtered.find((entry) => module.identifier(entry) === targetId);
          await apiRequest(module.deletePath(item), { method: 'DELETE' });
          toast('Entry deleted', `${targetId} was removed from ${module.label.toLowerCase()}.`, 'success');
          await Promise.all([loadContent(state.activeContentType, true), loadSummary()]);
        } catch (error) {
          toast('Delete failed', error.message || 'Unable to delete this entry.', 'danger');
        }
      });
    });
  }

  function renderActivityTable() {
    if (!canReadAudit()) {
      elements.activityTableBody.innerHTML = '<tr><td colspan="4">This admin role cannot read the audit log.</td></tr>';
      return;
    }

    elements.activityTableBody.innerHTML = renderTableRows(state.activity, (entry) => `
      <tr>
        <td>${escapeHtml(entry.type || '-')}</td>
        <td>${escapeHtml(entry.username || '-')}</td>
        <td>${escapeHtml(formatDateTime(entry.timestamp))}</td>
        <td><pre class="payload-chip">${escapeHtml(stringifyCompact(entry.data))}</pre></td>
      </tr>
    `, 4, 'No activity matches the current filter.');
  }

  function renderNewUsers(users) {
    renderStackList(elements.newUsersList, users, (user) => `
      <article class="stack-item">
        <header>
          <strong>${escapeHtml(user.username || '-')}</strong>
          <span class="tiny-chip">${user.validation_level >= 1 ? 'Validated' : 'Unverified'}</span>
        </header>
        <p>${escapeHtml(formatDateTime(user.account_create_time))}</p>
      </article>
    `, 'No recent users available.');
  }

  function renderStackList(target, list, renderItem, emptyMessage) {
    if (!Array.isArray(list) || list.length === 0) {
      target.innerHTML = `<div class="empty-state"><p>${escapeHtml(emptyMessage)}</p></div>`;
      return;
    }
    target.innerHTML = list.map(renderItem).join('');
  }

  function renderTableRows(items, renderRow, colspan, emptyMessage) {
    if (!Array.isArray(items) || items.length === 0) {
      return `<tr><td colspan="${colspan}">${escapeHtml(emptyMessage)}</td></tr>`;
    }
    return items.map(renderRow).join('');
  }

  function refreshSessionUi() {
    const hasSession = Boolean(state.session);
    elements.refreshAllButton.disabled = !hasSession;
    elements.logoutButton.disabled = !hasSession;

    if (!hasSession) {
      elements.sessionState.textContent = 'Signed out';
      elements.sessionDetails.innerHTML = '<p>No active admin session.</p>';
      syncPermissionScopedUi();
      return;
    }

    const websocketStatus = state.websocket.status;
    elements.sessionState.textContent = websocketStatus === 'connected' ? 'Admin live' : 'Admin ready';
    elements.sessionDetails.innerHTML = `
      <p><strong>${escapeHtml(state.session.username || 'Unknown')}</strong></p>
      <p>Permission level ${escapeHtml(String(state.session.permission_level ?? '-'))}</p>
      <p>User ID ${escapeHtml(state.session.id || '-')}</p>
      <p>Websocket ${escapeHtml(websocketStatus)}</p>
    `;
    syncPermissionScopedUi();
  }

  function scheduleRealtimeRefresh() {
    if (state.websocket.refreshTimer) {
      window.clearTimeout(state.websocket.refreshTimer);
    }

    state.websocket.refreshTimer = window.setTimeout(() => {
      if (!state.session) {
        return;
      }

      refreshDashboardData(false).catch(() => {
        toast('Realtime refresh failed', 'A websocket event arrived, but the dashboard refresh failed.', 'warning');
      });
    }, 350);
  }

  function connectRealtime() {
    if (!state.session?.access_token) {
      return;
    }

    disconnectRealtime(false);

    if (state.summary?.operations?.websocket?.enabled === false) {
      state.websocket.status = 'disabled';
      refreshSessionUi();
      return;
    }
    state.websocket.status = 'connecting';
    refreshSessionUi();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const path = state.summary?.operations?.websocket?.path || '/ws';
    const url = `${protocol}//${window.location.host}${path}?token=${encodeURIComponent(state.session.access_token)}`;
    const socket = new WebSocket(url);
    state.websocket.socket = socket;

    socket.addEventListener('open', () => {
      state.websocket.status = 'connected';
      refreshSessionUi();
    });

    socket.addEventListener('message', (event) => {
      let message = null;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      if (message.type === 'auth.error') {
        state.websocket.status = 'auth-error';
        refreshSessionUi();
        return;
      }

      if (message.type === 'trade.created' || message.type === 'trade.updated') {
        toast('Trade event', `${message.payload?.status || 'Trade update'} ${message.payload?.trade_id || ''}`.trim(), 'info');
        scheduleRealtimeRefresh();
      }

      if (message.type === 'system.broadcast') {
        toast('Broadcast', message.payload?.message || 'System broadcast', 'warning');
      }
    });

    socket.addEventListener('close', () => {
      state.websocket.socket = null;
      state.websocket.status = 'disconnected';
      refreshSessionUi();

      if (state.session && !socket.__suppressReconnect) {
        state.websocket.reconnectTimer = window.setTimeout(() => {
          connectRealtime();
        }, 3000);
      }
    });

    socket.addEventListener('error', () => {
      state.websocket.status = 'error';
      refreshSessionUi();
    });
  }

  function disconnectRealtime(clearReconnect = true) {
    if (clearReconnect && state.websocket.reconnectTimer) {
      window.clearTimeout(state.websocket.reconnectTimer);
      state.websocket.reconnectTimer = null;
    }

    if (state.websocket.refreshTimer) {
      window.clearTimeout(state.websocket.refreshTimer);
      state.websocket.refreshTimer = null;
    }

    if (state.websocket.socket) {
      state.websocket.socket.__suppressReconnect = true;
      state.websocket.socket.close();
      state.websocket.socket = null;
    }

    state.websocket.status = 'offline';
    refreshSessionUi();
  }

  async function apiRequest(path, options = {}) {
    if (!state.session?.access_token) {
      throw new Error('Not authenticated.');
    }

    try {
      return await rawRequest(path, {
        ...options,
        headers: {
          ...(options.headers || {}),
          Authorization: `Bearer ${state.session.access_token}`,
        },
      });
    } catch (error) {
      const message = error.message || '';
      if ((message.includes('Expired') || message.includes('Invalid Token')) && state.session?.refresh_token) {
        await refreshAccessToken();
        return rawRequest(path, {
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${state.session.access_token}`,
          },
        });
      }
      throw error;
    }
  }

  async function refreshAccessToken() {
    if (!state.session?.access_token || !state.session?.refresh_token) {
      throw new Error('Missing refresh session data.');
    }

    const refreshed = await rawRequest('/auth/refresh', {
      method: 'POST',
      body: { refresh_token: state.session.refresh_token },
      headers: {
        Authorization: `Bearer ${state.session.access_token}`,
      },
    });

    applySessionData(refreshed);
    if (!hasDashboardAccess()) {
      throw new Error('This account is missing admin dashboard access.');
    }
    storeSession();
    refreshSessionUi();
    return state.session;
  }

  async function rawRequest(path, options = {}) {
    const requestOptions = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    };

    if (options.body !== undefined) {
      requestOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(path, requestOptions);
    const payload = await parseResponse(response);

    if (!response.ok) {
      const errorMessage = typeof payload === 'string'
        ? payload
        : payload?.error || `${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }

    return payload;
  }

  async function parseResponse(response) {
    const text = await response.text();
    if (!text) {
      return {};
    }

    try {
      return JSON.parse(text);
    } catch (error) {
      return text;
    }
  }

  function getSelectedUser() {
    return state.users.find((user) => user.id === state.selectedUserId) || null;
  }

  function copySelectedUserJson() {
    const user = getSelectedUser();
    if (!user) {
      return;
    }

    navigator.clipboard.writeText(stringifyPretty(user))
      .then(() => toast('Copied', 'User JSON copied to clipboard.', 'success'))
      .catch(() => toast('Copy failed', 'Clipboard access was not available.', 'warning'));
  }

  function storeSession() {
    if (!state.session) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.session));
  }

  function loadStoredSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function clearStoredSession() {
    localStorage.removeItem(STORAGE_KEY);
  }

  function applySessionData(payload) {
    if (!payload) {
      return;
    }

    state.session = {
      ...(state.session || {}),
      id: payload.id ?? state.session?.id ?? '',
      username: payload.username ?? state.session?.username ?? '',
      permission_level: payload.permission_level ?? state.session?.permission_level ?? 0,
      validation_level: payload.validation_level ?? state.session?.validation_level ?? 0,
      access_token: payload.access_token ?? state.session?.access_token ?? '',
      refresh_token: payload.refresh_token ?? state.session?.refresh_token ?? '',
      role_ids: Array.isArray(payload.role_ids) ? payload.role_ids : (state.session?.role_ids || []),
      permissions: Array.isArray(payload.permissions) ? payload.permissions : (state.session?.permissions || []),
      duration: payload.duration ?? state.session?.duration ?? 0,
    };
  }

  function getSessionPermissions(session = state.session) {
    return Array.isArray(session?.permissions) ? session.permissions : [];
  }

  function hasAdminLevel(session = state.session) {
    return Number(session?.permission_level ?? 0) >= permissionFallbacks.ADMIN;
  }

  function hasSessionPermission(requiredPermission, session = state.session) {
    if (!requiredPermission) {
      return true;
    }

    return getSessionPermissions(session).some((permission) => permissionMatches(permission, requiredPermission));
  }

  function hasDashboardAccess(session = state.session) {
    return hasAdminLevel(session) && hasSessionPermission('admin.dashboard.read', session);
  }

  function canManageUsers() {
    return hasDashboardAccess() && hasSessionPermission('admin.users.manage');
  }

  function canManageGames() {
    return hasDashboardAccess() && hasSessionPermission('admin.games.manage');
  }

  function canManageMarket() {
    return hasDashboardAccess() && hasSessionPermission('admin.market.manage');
  }

  function canReadAudit() {
    return hasDashboardAccess() && hasSessionPermission('admin.audit.read');
  }

  function canReadRoles() {
    return hasDashboardAccess() && hasSessionPermission('admin.roles.read');
  }

  function canManageRoles() {
    return hasDashboardAccess() && hasSessionPermission('admin.roles.manage');
  }

  function canManageContent() {
    return hasDashboardAccess() && hasSessionPermission('admin.content.manage');
  }

  function setFormDisabled(form, disabled) {
    if (!form) {
      return;
    }

    form.querySelectorAll('input, select, textarea, button').forEach((control) => {
      control.disabled = disabled;
    });
  }

  function syncPermissionScopedUi() {
    setFormDisabled(elements.activityFilterForm, !canReadAudit());

    if (elements.reloadActivityButton) {
      elements.reloadActivityButton.disabled = !canReadAudit();
    }

    setFormDisabled(elements.permissionForm, !canManageUsers());
    setFormDisabled(elements.playerStateForm, !canManageUsers());
    setFormDisabled(elements.rewardGrantForm, !canManageUsers());
  }

  function setAuthMessage(message) {
    elements.authMessage.textContent = message;
  }

  function toast(title, detail, tone = 'info') {
    const element = document.createElement('article');
    element.className = `toast tone-${tone}`;
    element.innerHTML = `<strong>${escapeHtml(title)}</strong><span>${escapeHtml(detail)}</span>`;
    elements.toastRegion.appendChild(element);
    window.setTimeout(() => {
      element.remove();
    }, 4200);
  }

  function renderField(field, value) {
    const id = `field_${field.key}`;
    if (field.type === 'textarea') {
      return `
        <label class="field" for="${escapeHtml(id)}">
          <span>${escapeHtml(field.label)}</span>
          <textarea id="${escapeHtml(id)}" name="${escapeHtml(field.key)}" placeholder="${escapeHtml(field.placeholder || '')}">${escapeHtml(value ?? '')}</textarea>
        </label>
      `;
    }

    if (field.type === 'checkbox') {
      return `
        <label class="field" for="${escapeHtml(id)}">
          <span>${escapeHtml(field.label)}</span>
          <input id="${escapeHtml(id)}" name="${escapeHtml(field.key)}" type="checkbox" ${value ? 'checked' : ''}>
        </label>
      `;
    }

    return `
      <label class="field" for="${escapeHtml(id)}">
        <span>${escapeHtml(field.label)}</span>
        <input
          id="${escapeHtml(id)}"
          name="${escapeHtml(field.key)}"
          type="${escapeHtml(field.type || 'text')}"
          value="${escapeHtml(value ?? '')}"
          ${field.required ? 'required' : ''}
          ${field.min !== undefined ? `min="${escapeHtml(String(field.min))}"` : ''}
          placeholder="${escapeHtml(field.placeholder || '')}"
        >
      </label>
    `;
  }

  function applyContentFormDefaults(values = null) {
    const module = contentModules[state.activeContentType];
    module.fields.forEach((field) => {
      const control = elements.contentForm.elements[field.key];
      if (!control) {
        return;
      }

      if (values && Object.prototype.hasOwnProperty.call(values, field.key)) {
        if (field.type === 'checkbox') {
          control.checked = Boolean(values[field.key]);
        } else {
          control.value = values[field.key];
        }
        return;
      }

      if (field.type === 'checkbox') {
        control.checked = Boolean(field.defaultValue);
      } else if (field.defaultValue !== undefined) {
        control.value = field.defaultValue;
      } else {
        control.value = '';
      }
    });
  }

  function permissionLabel(value, permissions) {
    if (value >= permissions.ADMIN) {
      return 'Admin';
    }
    if (value >= permissions.SERVER) {
      return 'Server';
    }
    if (value >= permissions.USER) {
      return 'User';
    }
    return 'Disabled';
  }

  function parseInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) ? parsed : fallback;
  }

  function parseJsonOrEmptyArray(value) {
    if (!value) {
      return [];
    }
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  }

  function parseJsonOrEmptyObject(value) {
    if (!value) {
      return {};
    }
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  }

  function splitComma(value) {
    return String(value || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function joinComma(value) {
    return Array.isArray(value) ? value.join(', ') : '';
  }

  function stringifyPretty(value) {
    return JSON.stringify(value ?? {}, null, 2);
  }

  function stringifyCompact(value) {
    return JSON.stringify(value ?? {});
  }

  function titleCase(value) {
    return String(value)
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  function formatDateTime(value) {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  }

  function relativeTime(value) {
    if (!value) {
      return 'Never';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.round(diffMs / 60000);
    if (Math.abs(diffMinutes) < 1) {
      return 'Just now';
    }
    if (Math.abs(diffMinutes) < 60) {
      return `${Math.abs(diffMinutes)}m ago`;
    }
    const diffHours = Math.round(Math.abs(diffMinutes) / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }
    const diffDays = Math.round(diffHours / 24);
    return `${diffDays}d ago`;
  }

  function formatDuration(totalSeconds) {
    const seconds = Number(totalSeconds) || 0;
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (days > 0) {
      return `${days}d ${hours}h`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < 1024) {
      return `${value} B`;
    }
    const units = ['KB', 'MB', 'GB', 'TB'];
    let size = value;
    let index = -1;
    do {
      size /= 1024;
      index += 1;
    } while (size >= 1024 && index < units.length - 1);
    return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
  }

  function getContentSubtitle(item) {
    return item.title || item.type || item.group || item.team || 'Catalog entry';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
})();
