const GameStore = require('../game/game.store');

const collection = GameStore.collection('matches');

exports.get = async (matchId) => collection.get(matchId);

exports.getAll = async () => collection.find({});

exports.create = async (matchData) => collection.create(matchData);

exports.list = async (startTime, endTime, winnerId, completed) => {
  const options = {};

  if (startTime || endTime) {
    options.end = {};
    if (startTime) {
      options.end.$gte = startTime;
    }
    if (endTime) {
      options.end.$lte = endTime;
    }
  }

  if (winnerId) {
    options.players = winnerId;
  }

  if (completed) {
    options.completed = true;
  }

  return collection.find(options);
};

exports.getLast = async (userId) => {
  const [match] = await collection.find({ players: userId }, { sort: { end: -1, start: -1 }, limit: 1 });
  return match || null;
};

exports.remove = async (matchId) => collection.remove(matchId);
