const { cloneValue, decorateValue } = require('./game.helpers');

const toPlainObject = (document, definition) => {
  const output = {};

  Object.keys(document).forEach((key) => {
    if (!key.startsWith('$')) {
      output[key] = cloneValue(document[key]);
    }
  });

  (definition.hiddenFields || []).forEach((field) => {
    delete output[field];
  });

  return output;
};

class BaseDocument {
  constructor(data, definition, collection, meta = {}) {
    Object.keys(data || {}).forEach((key) => {
      this[key] = decorateValue(cloneValue(data[key]));
    });

    Object.defineProperty(this, '$definition', {
      value: definition,
      enumerable: false,
    });
    Object.defineProperty(this, '$collection', {
      value: collection,
      enumerable: false,
    });
    Object.defineProperty(this, '$meta', {
      value: { ...meta },
      enumerable: false,
      writable: true,
    });
  }

  markModified() {
    return this;
  }

  async save() {
    return this.$collection.save(this);
  }

  toObject() {
    return toPlainObject(this, this.$definition);
  }

  toObj() {
    return this.toObject();
  }
}

class UserDocument extends BaseDocument {
  toObj() {
    return this.toObject();
  }

  deleteSecrets() {
    const user = this.toObject();
    delete user.password;
    delete user.refresh_key;
    delete user.proof_key;
    delete user.email_confirm_key;
    delete user.password_recovery_key;
    return user;
  }

  deleteAdminOnly() {
    const user = this.toObject();
    delete user.id;
    delete user.email;
    delete user.permission_level;
    delete user.validation_level;
    delete user.password;
    delete user.refresh_key;
    delete user.proof_key;
    delete user.email_confirm_key;
    delete user.password_recovery_key;
    return user;
  }
}

const createDocument = (definition, data, collection, meta = {}) => {
  if (!data) {
    return null;
  }

  if (definition.type === 'user') {
    return new UserDocument(data, definition, collection, meta);
  }

  return new BaseDocument(data, definition, collection, meta);
};

module.exports = {
  createDocument,
};
