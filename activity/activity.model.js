const GameStore = require('../game/game.store');

const collection = GameStore.collection('activity');

exports.Activity = collection;

exports.LogActivity = async (type, username, data) => {
  return collection.create({
    type,
    username,
    timestamp: new Date(),
    data,
  });
};

exports.GetAll = async () => collection.find({}, { sort: { timestamp: -1 } });

exports.Get = async (data) => collection.find(data || {}, { sort: { timestamp: -1 } });
