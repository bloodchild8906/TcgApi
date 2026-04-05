const GameStore = require('../game/game.store');

const collection = GameStore.collection('rewards');

exports.get = async (rewardId) => collection.get(rewardId);

exports.getGroup = async (group) => collection.find({ group });

exports.getAll = async () => collection.find({});

exports.create = async (data) => collection.create(data);

exports.update = async (reward, data) => {
  if (!reward) {
    return null;
  }

  Object.keys(data || {}).forEach((key) => {
    reward[key] = data[key];
  });

  return collection.save(reward);
};

exports.remove = async (rewardId) => collection.remove(rewardId);

exports.removeAll = async () => collection.removeAll();
