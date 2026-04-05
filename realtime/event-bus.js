const { EventEmitter } = require('events');

const emitter = new EventEmitter();
emitter.setMaxListeners(100);

exports.publish = (type, payload, targets = {}) => {
  emitter.emit('event', {
    type,
    payload,
    targets: {
      admin: Boolean(targets.admin),
      broadcast: Boolean(targets.broadcast),
      user_ids: Array.isArray(targets.user_ids) ? targets.user_ids : [],
    },
    timestamp: new Date().toISOString(),
  });
};

exports.subscribe = (listener) => {
  emitter.on('event', listener);
  return () => emitter.off('event', listener);
};
