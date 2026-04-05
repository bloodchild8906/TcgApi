const GameStore = require('../game/game.store');

const collection = GameStore.collection('cards');

exports.get = async (tid) => collection.get(tid);

exports.getAll = async (filter = {}) => collection.find(filter);

exports.getByPack = async (packId, filter = {}) => {
  const nextFilter = { ...(filter || {}) };
  if (packId) {
    nextFilter.packs = { $in: [packId] };
  }
  return collection.find(nextFilter);
};

exports.create = async (data) => collection.create(data);

exports.update = async (card, data) => {
  if (!card) {
    return null;
  }

  Object.keys(data || {}).forEach((key) => {
    card[key] = data[key];
  });

  return collection.save(card);
};

exports.remove = async (tid) => collection.remove(tid);

exports.removeAll = async () => collection.removeAll();
