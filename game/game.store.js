const definitions = require('./game.collections');
const { createDocument } = require('./game.documents');
const {
  cloneValue,
  decorateValue,
  matchesFilter,
  normalizeDateFields,
  paginateDocuments,
  sortDocuments,
  stripInternalFields,
} = require('./game.helpers');
const config = require('../config');

const driverMap = {
  mongo: './drivers/mongo.driver',
  mysql: './drivers/mysql.driver',
  postgres: './drivers/postgres.driver',
  mssql: './drivers/mssql.driver',
};

let driver = null;
const collections = new Map();

const getDriver = () => {
  if (!driver) {
    const path = driverMap[config.game_db_driver];
    if (!path) {
      throw new Error(`Unsupported GAME_DB_DRIVER: ${config.game_db_driver}`);
    }
    driver = require(path);
  }

  return driver;
};

const toStorageKey = (definition, document) => {
  if (typeof definition.ensureKey === 'function') {
    const nextKey = definition.ensureKey(document);
    document[definition.keyField] = nextKey;
    return nextKey;
  }

  return document[definition.keyField];
};

class GameCollection {
  constructor(definition) {
    this.definition = definition;
  }

  normalizeLoaded(rawDocument) {
    if (!rawDocument) {
      return null;
    }

    const data = stripInternalFields(rawDocument);
    if (!data[this.definition.keyField] && rawDocument._id && this.definition.keyField === 'id') {
      data.id = String(rawDocument._id);
    }

    if (typeof this.definition.ensureKey === 'function' && !data[this.definition.keyField]) {
      data[this.definition.keyField] = this.definition.ensureKey(data);
    }

    if (typeof this.definition.normalizeOnLoad === 'function') {
      Object.assign(data, this.definition.normalizeOnLoad(data));
    }

    normalizeDateFields(data, this.definition.dateFields);
    decorateValue(data);

    return createDocument(this.definition, data, this, {
      storageId: rawDocument._id ? String(rawDocument._id) : null,
    });
  }

  toStorageDocument(document) {
    const plain = cloneValue(typeof document?.toObject === 'function' ? document.toObject() : document);
    const key = toStorageKey(this.definition, plain);

    if (typeof this.definition.normalizeOnSave === 'function') {
      Object.assign(plain, this.definition.normalizeOnSave(plain));
    }

    return { key, document: plain };
  }

  async listAll() {
    const rows = await getDriver().listDocuments(this.definition.collectionName);
    return rows.map((row) => this.normalizeLoaded(row)).filter(Boolean);
  }

  async find(filter = {}, options = {}) {
    const docs = (await this.listAll()).filter((entry) => matchesFilter(entry, filter));
    const sorted = sortDocuments(docs, options.sort);
    return paginateDocuments(sorted, options);
  }

  async findOne(filter = {}, options = {}) {
    const [document] = await this.find(filter, { ...options, limit: 1 });
    return document || null;
  }

  async get(key) {
    return this.findOne({ [this.definition.keyField]: key });
  }

  async count(filter = {}) {
    const docs = await this.find(filter);
    return docs.length;
  }

  async create(data) {
    const { key, document } = this.toStorageDocument(data);
    await getDriver().upsertDocument(this.definition.collectionName, this.definition.keyField, key, document);
    return this.get(key);
  }

  async save(document) {
    const { key, document: payload } = this.toStorageDocument(document);
    await getDriver().upsertDocument(
      this.definition.collectionName,
      this.definition.keyField,
      key,
      payload,
      document?.$meta || {}
    );
    return this.get(key);
  }

  async remove(key, meta = {}) {
    return getDriver().deleteDocument(this.definition.collectionName, this.definition.keyField, key, meta);
  }

  async removeAll() {
    return getDriver().deleteCollection(this.definition.collectionName);
  }
}

exports.connect = async () => {
  await getDriver().connect(config);
};

exports.close = async () => {
  if (!driver) {
    return;
  }
  await getDriver().close();
  driver = null;
  collections.clear();
};

exports.getStatus = () => {
  if (!driver) {
    return {
      driver: config.game_db_driver,
      connected: false,
      detail: 'Game store not initialized',
    };
  }

  return getDriver().getStatus();
};

exports.collection = (name) => {
  if (!collections.has(name)) {
    const definition = definitions[name];
    if (!definition) {
      throw new Error(`Unknown game collection: ${name}`);
    }

    collections.set(name, new GameCollection(definition));
  }

  return collections.get(name);
};
