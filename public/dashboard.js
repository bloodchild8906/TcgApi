(() => {
  const {
    api,
    clearSession,
    escapeHtml,
    formatNumber,
    hasPermission,
    loadSession,
    setStatusMessage,
    storeSession,
    toast,
  } = window.AdminCommon;

  const VIEW_CONFIG = {
    overview: {
      title: 'Service Overview',
      permission: 'admin.dashboard.read',
    },
    'player-center': {
      title: 'Player Center',
      permission: 'admin.users.manage',
    },
    operators: {
      title: 'Operators',
      permission: 'admin.roles.read',
    },
    'card-studio': {
      title: 'Card Studio',
      permission: 'admin.content.manage',
    },
    'turn-phase-designer': {
      title: 'Turn Phase Designer',
      permission: 'admin.game_flows.manage',
    },
    catalog: {
      title: 'Visual Catalog',
      permission: 'admin.content.manage',
    },
    'news-events': {
      title: 'News & Events',
      permission: 'admin.content.manage',
    },
  };

  const state = {
    activeView: 'overview',
    session: loadSession(),
    summary: null,
  };

  const elements = {};

  const emit = (name, detail) => {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  };

  const isAuthError = (error) => Number(error?.status) === 401 || Number(error?.status) === 403;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    bindElements();
    bindEvents();
    const urlView = getViewFromUrl();
    if (urlView) {
      state.activeView = urlView;
    }
    await loadVersion();

    if (state.session?.access_token) {
      await validateExistingSession();
      return;
    }

    renderSignedOut();
  }

  function bindElements() {
    elements.authPanel = document.getElementById('authPanel');
    elements.authMessage = document.getElementById('authMessage');
    elements.dashboardApp = document.getElementById('dashboardApp');
    elements.loginForm = document.getElementById('loginForm');
    elements.loginMode = document.getElementById('loginMode');
    elements.identityLabel = document.getElementById('identityLabel');
    elements.loginIdentity = document.getElementById('loginIdentity');
    elements.loginPassword = document.getElementById('loginPassword');
    elements.sessionState = document.getElementById('sessionState');
    elements.sessionDetails = document.getElementById('sessionDetails');
    elements.refreshAllButton = document.getElementById('refreshAllButton');
    elements.logoutButton = document.getElementById('logoutButton');
    elements.systemVersion = document.getElementById('systemVersion');
    elements.dbState = document.getElementById('dbState');
    elements.rconStatusLabel = document.getElementById('rconStatusLabel');
    elements.wsStatusLabel = document.getElementById('wsStatusLabel');
    elements.viewTitle = document.getElementById('viewTitle');
    elements.viewButtons = Array.from(document.querySelectorAll('[data-view-button]'));
    elements.viewSections = Array.from(document.querySelectorAll('[data-view]'));
  }

  function bindEvents() {
    elements.loginMode?.addEventListener('change', updateIdentityLabel);
    elements.loginForm?.addEventListener('submit', handleLogin);
    elements.logoutButton?.addEventListener('click', handleLogout);
    elements.refreshAllButton?.addEventListener('click', handleRefresh);

    elements.viewButtons.forEach((button) => {
      button.addEventListener('click', () => setView(button.dataset.viewButton));
    });
  }

  function updateIdentityLabel() {
    if (!elements.identityLabel || !elements.loginMode) {
      return;
    }

    elements.identityLabel.textContent = elements.loginMode.value === 'email' ? 'Email' : 'Username';
  }

  async function loadVersion() {
    try {
      const payload = await api('/version');
      elements.systemVersion.textContent = `Version ${payload?.version || 'unknown'}`;
    } catch (error) {
      elements.systemVersion.textContent = 'Version unavailable';
    }
  }

  async function validateExistingSession() {
    try {
      const validated = await api('/auth/validate', { session: state.session });
      applySession({
        ...state.session,
        ...validated,
      });
      await afterSessionReady();
    } catch (error) {
      renderSignedOut('Your previous session is no longer valid.');
    }
  }

  async function handleLogin(event) {
    event.preventDefault();

    const identity = String(elements.loginIdentity?.value || '').trim();
    const password = String(elements.loginPassword?.value || '');
    const body = { password };

    if (elements.loginMode?.value === 'email') {
      body.email = identity;
    } else {
      body.username = identity;
    }

    try {
      setStatusMessage(elements.authMessage, 'Signing in...');
      const session = await api('/auth', {
        method: 'POST',
        body,
      });
      applySession(session);
      await afterSessionReady();
      toast('Operator session opened.', 'success');
    } catch (error) {
      setStatusMessage(elements.authMessage, error.message || 'Unable to sign in.', 'danger');
    }
  }

  async function afterSessionReady() {
    renderSignedIn();
    await refreshSummary();
    updateViewAvailability();
    const preferredView = getFirstAllowedView(state.activeView);
    setView(preferredView);
    emit('admin:session', state.session);
    emit('admin:refresh', { reason: 'session_ready' });
  }

  function applySession(session) {
    state.session = session;
    storeSession(session);
    renderSession();
    emit('admin:session', session);
  }

  function renderSignedOut(message = 'Use an account with the required admin scopes for the views you need.') {
    state.session = null;
    state.summary = null;
    clearSession();
    elements.authPanel?.classList.remove('is-hidden');
    elements.dashboardApp?.classList.add('is-hidden');
    elements.refreshAllButton.disabled = true;
    elements.logoutButton.disabled = true;
    elements.sessionState.textContent = 'Signed out';
    elements.sessionDetails.innerHTML = '<p>No active operator session.</p>';
    setStatusMessage(elements.authMessage, message);
    elements.dbState.textContent = 'Database unknown';
    elements.rconStatusLabel.textContent = 'Unknown';
    elements.wsStatusLabel.textContent = 'Unknown';
    emit('admin:session', null);
    emit('admin:summary', null);
  }

  function renderSignedIn() {
    elements.authPanel?.classList.add('is-hidden');
    elements.dashboardApp?.classList.remove('is-hidden');
    elements.refreshAllButton.disabled = false;
    elements.logoutButton.disabled = false;
    setStatusMessage(elements.authMessage, '');
    renderSession();
  }

  function renderSession() {
    const session = state.session;
    if (!session) {
      return;
    }

    elements.sessionState.textContent = 'Signed in';
    elements.sessionDetails.innerHTML = `
      <p><strong>${escapeHtml(session.username || 'Unknown')}</strong></p>
      <p>Permission level ${escapeHtml(String(session.permission_level ?? '-'))}</p>
      <p>${escapeHtml(String((session.role_ids || []).length))} assigned role(s)</p>
      <p>${escapeHtml(String((session.permissions || []).length))} effective permission scope(s)</p>
    `;
  }

  async function refreshSummary() {
    if (!state.session || !hasPermission(state.session, VIEW_CONFIG.overview.permission)) {
      state.summary = null;
      emit('admin:summary', null);
      return;
    }

    try {
      const summary = await api('/admin/api/summary', { session: state.session });
      state.summary = summary;
      renderSummaryMeta(summary);
      emit('admin:summary', summary);
    } catch (error) {
      if (isAuthError(error)) {
        renderSignedOut('Your operator session expired.');
        return;
      }

      toast(error.message || 'Unable to refresh summary.', 'danger');
    }
  }

  function renderSummaryMeta(summary) {
    const driver = summary?.database?.driver || 'unknown';
    const connected = Boolean(summary?.database?.connected);
    elements.dbState.textContent = `${driver} ${connected ? 'connected' : 'disconnected'}`;
    elements.dbState.classList.toggle('is-danger', !connected);
    elements.rconStatusLabel.textContent = summary?.operations?.rcon?.enabled ? 'Enabled' : 'Disabled';
    elements.wsStatusLabel.textContent = summary?.operations?.websocket?.enabled
      ? `${formatNumber(summary.operations.websocket.connected_clients || 0)} connected`
      : 'Disabled';
    if (summary?.system?.version) {
      elements.systemVersion.textContent = `Version ${summary.system.version}`;
    }
  }

  function updateViewAvailability() {
    elements.viewButtons.forEach((button) => {
      const view = button.dataset.viewButton;
      const requiredPermission = VIEW_CONFIG[view]?.permission;
      const allowed = hasPermission(state.session, requiredPermission);
      button.hidden = !allowed;
    });
  }

  function getFirstAllowedView(preferredView) {
    if (preferredView && hasPermission(state.session, VIEW_CONFIG[preferredView]?.permission)) {
      return preferredView;
    }

    return Object.keys(VIEW_CONFIG).find((view) => hasPermission(state.session, VIEW_CONFIG[view].permission)) || 'overview';
  }

  function getViewFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const view = params.get('view');
    return VIEW_CONFIG[view] ? view : null;
  }

  function setView(view) {
    if (!VIEW_CONFIG[view] || !hasPermission(state.session, VIEW_CONFIG[view].permission)) {
      return;
    }

    state.activeView = view;
    elements.viewTitle.textContent = VIEW_CONFIG[view].title;

    elements.viewButtons.forEach((button) => {
      button.classList.toggle('is-active', button.dataset.viewButton === view);
    });

    elements.viewSections.forEach((section) => {
      section.classList.toggle('is-active', section.dataset.view === view);
    });

    emit('admin:view', view);
  }

  async function handleRefresh() {
    await refreshSummary();
    emit('admin:refresh', { reason: 'manual' });
    toast('Dashboard data refreshed.', 'success');
  }

  function handleLogout() {
    renderSignedOut('Operator session closed.');
    toast('Signed out.', 'success');
  }

  window.AdminDashboardShell = {
    getSession: () => state.session,
    getSummary: () => state.summary,
    getView: () => state.activeView,
    handleAuthError(error) {
      if (isAuthError(error)) {
        renderSignedOut('Your operator session expired.');
        return true;
      }

      return false;
    },
    refresh: handleRefresh,
    setView,
  };
})();
