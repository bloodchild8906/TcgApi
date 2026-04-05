const GameStore = require('../game/game.store');

const collection = GameStore.collection('variants');

exports.Variant = collection;

exports.create = async (data) => collection.create(data);

exports.get = async (variant_tid) => collection.get(variant_tid);

exports.getDefault = async () => collection.findOne({ is_default: true });

exports.getAll = async () => collection.find({});

exports.update = async (variant, data) => {
  if (!variant) {
    return null;
  }

  Object.keys(data || {}).forEach((key) => {
    variant[key] = data[key];
  });

  return collection.save(variant);
};

exports.remove = async (variant_tid) => collection.remove(variant_tid);

exports.removeAll = async () => collection.removeAll();
