const mongoose = require('mongoose');

const toObjectId = (value) => {
  try {
    return new mongoose.Types.ObjectId(String(value));
  } catch (error) {
    return null;
  }
};

const getCollection = (collectionName) => {
  if (!mongoose.connection?.db) {
    throw new Error('MongoDB connection is not ready for the game store');
  }

  return mongoose.connection.db.collection(collectionName);
};

const getFilter = (keyField, key, meta = {}) => {
  if (meta.storageId) {
    const objectId = toObjectId(meta.storageId);
    if (objectId) {
      return { _id: objectId };
    }
  }

  if (keyField === 'id') {
    const objectId = toObjectId(key);
    if (objectId) {
      return {
        $or: [
          { id: key },
          { _id: objectId },
        ],
      };
    }
  }

  return { [keyField]: key };
};

exports.connect = async () => {
};

exports.close = async () => {
};

exports.getStatus = () => ({
  driver: 'mongo',
  connected: mongoose.connection.readyState === 1,
  detail: mongoose.connection.readyState === 1 ? 'MongoDB game store connected' : 'MongoDB game store disconnected',
});

exports.listDocuments = async (collectionName) => {
  return getCollection(collectionName).find({}).toArray();
};

exports.upsertDocument = async (collectionName, keyField, key, document, meta = {}) => {
  const payload = { ...document };
  delete payload._id;

  await getCollection(collectionName).updateOne(
    getFilter(keyField, key, meta),
    { $set: payload },
    { upsert: true }
  );
};

exports.deleteDocument = async (collectionName, keyField, key, meta = {}) => {
  const result = await getCollection(collectionName).deleteOne(getFilter(keyField, key, meta));
  return result.deletedCount > 0;
};

exports.deleteCollection = async (collectionName) => {
  const result = await getCollection(collectionName).deleteMany({});
  return result.deletedCount >= 0;
};
