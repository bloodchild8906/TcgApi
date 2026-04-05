const HttpTool = require('../tools/http.tool');
const SetupService = require('./setup.service');

const requireSetupMode = async (runtime) => {
  const setupState = await SetupService.getSetupState(runtime);
  if (!setupState.setup_required) {
    throw HttpTool.createError(409, 'First-run setup is not active');
  }

  return setupState;
};

const exposeError = (error, status, message) => {
  if (error?.expose && error?.status) {
    return error;
  }

  return HttpTool.createError(status, message || error?.message || 'Setup failed');
};

exports.getStatus = (runtime) => async (req, res) => {
  res.status(200).send(await SetupService.getStatus(runtime));
};

exports.validateConnections = (runtime) => async (req, res) => {
  try {
    await requireSetupMode(runtime);

    const payload = SetupService.normalizeSetupPayload(req.body);
    const skipValidation = req.body.skip_validation === true || req.body.skip_validation === 'true';

    if (skipValidation) {
      // Skip actual connection test - useful for restricted network environments
      const connections = [
        { driver: payload.game_db.driver, label: 'Gameplay store', success: true, skipped: true },
        { driver: payload.ops_db.driver, label: 'Operations store', success: true, skipped: true },
      ];
      res.status(200).send({
        connections,
        success: true,
        validation_skipped: true,
      });
      return;
    }

    const connections = await SetupService.validateConnections(payload);

    res.status(200).send({
      connections,
      success: true,
    });
  } catch (error) {
    throw exposeError(error, 400);
  }
};

exports.applySetup = (runtime) => async (req, res) => {
  try {
    await requireSetupMode(runtime);

    const payload = SetupService.normalizeSetupPayload(req.body);
    const skipValidation = req.body.skip_validation === true || req.body.skip_validation === 'true';

    let connections;
    if (skipValidation) {
      connections = [
        { driver: payload.game_db.driver, label: 'Gameplay store', success: true, skipped: true },
        { driver: payload.ops_db.driver, label: 'Operations store', success: true, skipped: true },
      ];
    } else {
      connections = await SetupService.validateConnections(payload);
    }

    const env = SetupService.writeSetupEnv(payload);
    console.log('[v0] applySetup - .env written, contents:', env);

    if (typeof runtime.completeSetup !== 'function') {
      throw new Error('Server runtime is missing the setup activation hook');
    }

    console.log('[v0] applySetup - calling runtime.completeSetup()');
    await runtime.completeSetup();
    console.log('[v0] applySetup - runtime.completeSetup() completed');
    const admin = await SetupService.bootstrapAdminUser(payload.admin);
    const setupState = await SetupService.getSetupState(runtime);

    if (setupState.setup_required && setupState.setup_reason === 'user_not_initialized') {
      throw HttpTool.createError(400, 'Create the first admin account during setup to finish initialization.');
    }

    res.status(201).send({
      admin,
      connections,
      env,
      next_steps: admin.created
        ? ['Sign in at /admin with the admin account you just created']
        : ['Open /admin and sign in with an existing admin account'],
      redirect_to: '/admin',
      success: true,
    });
  } catch (error) {
    throw exposeError(error, 500, runtime?.lastSetupError || error?.message);
  }
};
