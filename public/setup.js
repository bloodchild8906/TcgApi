(function setupInstaller() {
  const fallbackExamples = {
    mongo: 'mongodb://127.0.0.1:27017/tcgengine',
    mysql: 'mysql://user:password@127.0.0.1:3306/tcgengine',
    postgres: 'postgres://user:password@127.0.0.1:5432/tcgengine',
    mssql: 'Data Source=SERVER;Initial Catalog=tcgengine;User ID=user;Password=password;Encrypt=False',
  };

  const elements = {
    adminEmailInput: document.getElementById('adminEmailInput'),
    adminPasswordInput: document.getElementById('adminPasswordInput'),
    adminUsernameInput: document.getElementById('adminUsernameInput'),
    apiTitleInput: document.getElementById('apiTitleInput'),
    applySetupButton: document.getElementById('applySetupButton'),
    connectionResults: document.getElementById('connectionResults'),
    envFileState: document.getElementById('envFileState'),
    exampleGrid: document.getElementById('exampleGrid'),
    formMessage: document.getElementById('formMessage'),
    gameDriverHint: document.getElementById('gameDriverHint'),
    gameDriverSelect: document.getElementById('gameDriverSelect'),
    gameUrlInput: document.getElementById('gameUrlInput'),
    generateJwtSecretButton: document.getElementById('generateJwtSecretButton'),
    installerMessage: document.getElementById('installerMessage'),
    jwtSecretInput: document.getElementById('jwtSecretInput'),
    jwtState: document.getElementById('jwtState'),
    opsDriverHint: document.getElementById('opsDriverHint'),
    opsDriverSelect: document.getElementById('opsDriverSelect'),
    opsFields: document.getElementById('opsFields'),
    opsUrlInput: document.getElementById('opsUrlInput'),
    setupForm: document.getElementById('setupForm'),
    setupReason: document.getElementById('setupReason'),
    shareOpsCheckbox: document.getElementById('shareOpsCheckbox'),
    statusBadge: document.getElementById('statusBadge'),
    supportedDrivers: document.getElementById('supportedDrivers'),
    testConnectionButton: document.getElementById('testConnectionButton'),
  };

  const state = {
    busy: false,
    redirectScheduled: false,
    status: null,
  };

  const getExample = (driver) => {
    return state.status?.driver_examples?.[driver] || fallbackExamples[driver] || '';
  };

  const generateSecret = () => {
    const values = new Uint8Array(32);
    if (window.crypto && typeof window.crypto.getRandomValues === 'function') {
      window.crypto.getRandomValues(values);
      return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('');
    }

    return `${Date.now().toString(16)}${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}`;
  };

  const setFormMessage = (message, tone) => {
    elements.formMessage.textContent = message;
    elements.formMessage.classList.remove('is-error', 'is-success');
    if (tone === 'error') {
      elements.formMessage.classList.add('is-error');
    } else if (tone === 'success') {
      elements.formMessage.classList.add('is-success');
    }
  };

  const setBusy = (busy) => {
    state.busy = busy;
    elements.applySetupButton.disabled = busy;
    elements.testConnectionButton.disabled = busy;
    elements.generateJwtSecretButton.disabled = busy;
  };

  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const renderExamples = () => {
    const drivers = state.status?.supported_drivers || Object.keys(fallbackExamples);
    elements.supportedDrivers.innerHTML = '';
    elements.exampleGrid.innerHTML = '';

    drivers.forEach((driver) => {
      const chip = document.createElement('li');
      chip.textContent = driver;
      elements.supportedDrivers.appendChild(chip);

      const card = document.createElement('article');
      card.className = 'example-card';
      card.innerHTML = `
        <h4>${escapeHtml(driver)}</h4>
        <code>${escapeHtml(getExample(driver))}</code>
      `;
      elements.exampleGrid.appendChild(card);
    });
  };

  const renderConnections = (connections) => {
    if (!Array.isArray(connections) || connections.length === 0) {
      elements.connectionResults.innerHTML = '<p class="empty-copy">No connection test has been run yet.</p>';
      return;
    }

    elements.connectionResults.innerHTML = '';
    connections.forEach((entry) => {
      const item = document.createElement('article');
      item.className = 'result-item';
      item.innerHTML = `
        <span class="result-mark">${entry.success ? 'OK' : '!'}</span>
        <div>
          <h4>${escapeHtml(entry.label)}</h4>
          <p>${escapeHtml(entry.driver)} connection validated.</p>
        </div>
      `;
      elements.connectionResults.appendChild(item);
    });
  };

  const updateDriverHints = () => {
    elements.gameDriverHint.textContent = `Example: ${getExample(elements.gameDriverSelect.value)}`;
    elements.opsDriverHint.textContent = `Example: ${getExample(elements.opsDriverSelect.value)}`;

    if (!elements.gameUrlInput.value.trim()) {
      elements.gameUrlInput.placeholder = getExample(elements.gameDriverSelect.value);
    }

    if (!elements.opsUrlInput.value.trim()) {
      elements.opsUrlInput.placeholder = getExample(elements.opsDriverSelect.value);
    }
  };

  const updateOpsVisibility = () => {
    const shared = elements.shareOpsCheckbox.checked;
    elements.opsFields.classList.toggle('is-hidden', shared);
  };

  const setInstallerState = (status) => {
    state.status = status;

    elements.statusBadge.className = 'status-pill';
    if (status.setup_required) {
      elements.statusBadge.classList.add('is-pending');
      elements.statusBadge.textContent = 'Setup required';
    } else {
      elements.statusBadge.classList.add('is-ready');
      elements.statusBadge.textContent = 'Configured';
    }

    elements.installerMessage.textContent = status.setup_required
      ? (status.setup_reason === 'user_not_initialized'
        ? 'The database is configured, but the first user does not exist yet. Finish bootstrap here to unlock the admin console.'
        : 'The API is running in installer mode. Complete the form below to activate the full stack.')
      : 'This instance is already configured. Redirecting to the admin console.';
    elements.envFileState.textContent = status.env_file_exists ? '.env present' : 'No .env file yet';
    elements.jwtState.textContent = status.defaults?.jwt_secret_is_default ? 'Default dev secret' : 'Custom secret';
    elements.setupReason.textContent = status.setup_reason || 'n/a';

    if (status.current?.game_db_driver) {
      elements.gameDriverSelect.value = status.current.game_db_driver;
    }

    if (status.current?.ops_db_driver) {
      elements.opsDriverSelect.value = status.current.ops_db_driver;
    }

    if (typeof status.current?.use_same_operations_store === 'boolean') {
      elements.shareOpsCheckbox.checked = status.current.use_same_operations_store;
    }

    if (!elements.apiTitleInput.value) {
      elements.apiTitleInput.value = status.current?.api_title || status.defaults?.api_title || 'TCG Engine API';
    }

    if (!elements.jwtSecretInput.value || status.defaults?.jwt_secret_is_default) {
      elements.jwtSecretInput.value = generateSecret();
    }

    renderExamples();
    updateDriverHints();
    updateOpsVisibility();

    if (!status.setup_required) {
      setFormMessage('Setup is already complete. Redirecting to /admin.', 'success');
      if (!state.redirectScheduled) {
        state.redirectScheduled = true;
        window.setTimeout(() => {
          window.location.replace('/admin');
        }, 250);
      }
      return;
    }

    if (status.setup_reason === 'user_not_initialized') {
      setFormMessage('Create the first admin account below to finish initialization.', 'success');
      return;
    }

    if (status.last_error) {
      setFormMessage(status.last_error, 'error');
    }
  };

  const request = async (url, options) => {
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json',
      },
      ...options,
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || data.message || `Request failed with status ${response.status}`);
    }

    return data;
  };

  const buildPayload = () => {
    return {
      admin_email: elements.adminEmailInput.value,
      admin_password: elements.adminPasswordInput.value,
      admin_username: elements.adminUsernameInput.value,
      api_title: elements.apiTitleInput.value,
      game_db_driver: elements.gameDriverSelect.value,
      game_db_url: elements.gameUrlInput.value,
      jwt_secret: elements.jwtSecretInput.value,
      ops_db_driver: elements.opsDriverSelect.value,
      ops_db_url: elements.opsUrlInput.value,
      use_same_operations_store: elements.shareOpsCheckbox.checked,
    };
  };

  const handleTest = async () => {
    setBusy(true);
    setFormMessage('Testing database connections...', '');

    try {
      const data = await request('/setup/api/validate', {
        body: JSON.stringify(buildPayload()),
        method: 'POST',
      });
      renderConnections(data.connections);
      setFormMessage('Connection test passed for every configured store.', 'success');
    } catch (error) {
      setFormMessage(error.message || 'Connection test failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    setFormMessage('Validating and applying setup...', '');

    try {
      const data = await request('/setup/api/apply', {
        body: JSON.stringify(buildPayload()),
        method: 'POST',
      });

      renderConnections(data.connections);
      const nextStep = Array.isArray(data.next_steps) && data.next_steps.length > 0
        ? data.next_steps.join(' ')
        : 'Setup completed.';
      setFormMessage(nextStep, 'success');

      if (data.redirect_to === '/admin') {
        window.setTimeout(() => {
          window.location.href = data.redirect_to;
        }, 1200);
      }
    } catch (error) {
      setFormMessage(error.message || 'Setup failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const loadStatus = async () => {
    try {
      const status = await request('/setup/api/status');
      setInstallerState(status);
    } catch (error) {
      elements.statusBadge.className = 'status-pill is-error';
      elements.statusBadge.textContent = 'Status error';
      setFormMessage(error.message || 'Unable to read installer status', 'error');
    }
  };

  elements.shareOpsCheckbox.addEventListener('change', updateOpsVisibility);
  elements.gameDriverSelect.addEventListener('change', updateDriverHints);
  elements.opsDriverSelect.addEventListener('change', updateDriverHints);
  elements.generateJwtSecretButton.addEventListener('click', () => {
    elements.jwtSecretInput.value = generateSecret();
  });
  elements.testConnectionButton.addEventListener('click', handleTest);
  elements.setupForm.addEventListener('submit', (event) => {
    event.preventDefault();
    handleApply();
  });

  loadStatus();
})();
