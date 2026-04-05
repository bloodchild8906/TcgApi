const wrapHandler = (handler) => {
  if (typeof handler !== 'function') {
    return handler;
  }

  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};

exports.wrap = (handlers) => {
  const list = Array.isArray(handlers) ? handlers.flat(Infinity) : [handlers];
  return list.map(wrapHandler);
};

exports.sendNoContent = (res) => {
  res.status(204).end();
};

exports.getAuthorizationToken = (req) => {
  const header = req?.headers?.authorization;
  if (!header || typeof header !== 'string') {
    return null;
  }

  const token = header.replace(/^Bearer\s+/i, '').trim();
  return token || null;
};

exports.createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
};
