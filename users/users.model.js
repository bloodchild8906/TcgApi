const GameStore = require('../game/game.store');

const collection = GameStore.collection('users');

exports.UserModel = collection;

exports.getById = async (id) => collection.findOne({ id });

exports.getByEmail = async (email) => {
  const regex = new RegExp(`^${String(email || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  return collection.findOne({ email: regex });
};

exports.getByUsername = async (username) => {
  const regex = new RegExp(`^${String(username || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
  return collection.findOne({ username: regex });
};

exports.create = async (userData) => collection.create(userData);

exports.getAll = async () => collection.find({});

exports.getAllLimit = async (perPage, page) => collection.find({}, {
  limit: perPage,
  skip: perPage * page,
});

exports.getUsernameList = async (username_list) => collection.find({
  username: { $in: username_list || [] },
});

exports.save = async (user) => {
  if (!user) {
    return null;
  }

  return collection.save(user);
};

exports.update = async (user, userData) => {
  if (!user) {
    return null;
  }

  Object.keys(userData || {}).forEach((key) => {
    user[key] = userData[key];
  });

  return collection.save(user);
};

exports.patch = async (userId, userData) => {
  const user = await exports.getById(userId);
  if (!user) {
    return null;
  }

  return exports.update(user, userData);
};

exports.remove = async (userId) => collection.remove(userId);

exports.count = async () => collection.count({});
