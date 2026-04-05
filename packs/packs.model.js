const GameStore = require('../game/game.store');

const collection = GameStore.collection('packs');

exports.create = async (data) => collection.create(data);

exports.get = async (set_tid) => collection.get(set_tid);

exports.getAll = async () => collection.find({});

exports.update = async (pack, data) => {
  if (!pack) {
    return null;
  }

  Object.keys(data || {}).forEach((key) => {
    pack[key] = data[key];
  });

  return collection.save(pack);
};

exports.remove = async (pack_tid) => collection.remove(pack_tid);

exports.removeAll = async () => collection.removeAll();
