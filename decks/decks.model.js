const GameStore = require('../game/game.store');

const collection = GameStore.collection('decks');

exports.get = async (deckId) => collection.get(deckId);

exports.getList = async (decks_tids) => collection.find({ tid: { $in: decks_tids || [] } });

exports.getAll = async () => collection.find({});

exports.create = async (data) => collection.create(data);

exports.update = async (deck, data) => {
  if (!deck) {
    return null;
  }

  Object.keys(data || {}).forEach((key) => {
    deck[key] = data[key];
  });

  return collection.save(deck);
};

exports.remove = async (deckId) => collection.remove(deckId);

exports.removeAll = async () => collection.removeAll();
