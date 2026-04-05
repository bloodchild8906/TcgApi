const crypto = require('crypto');

const arrayRemove = function remove(value) {
  let index = this.indexOf(value);
  while (index >= 0) {
    this.splice(index, 1);
    index = this.indexOf(value);
  }
  return this;
};

const addArrayHelpers = (value) => {
  if (!Array.isArray(value)) {
    return value;
  }

  if (!Object.prototype.hasOwnProperty.call(value, 'remove')) {
    Object.defineProperty(value, 'remove', {
      value: arrayRemove,
      enumerable: false,
    });
  }

  value.forEach((entry) => decorateValue(entry));
  return value;
};

const decorateValue = (value) => {
  if (Array.isArray(value)) {
    return addArrayHelpers(value);
  }

  if (!value || typeof value !== 'object' || value instanceof Date) {
    return value;
  }

  Object.keys(value).forEach((key) => {
    value[key] = decorateValue(value[key]);
  });

  return value;
};

const cloneValue = (value) => {
  if (value instanceof Date) {
    return new Date(value.getTime());
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const next = {};
  Object.keys(value).forEach((key) => {
    next[key] = cloneValue(value[key]);
  });
  return next;
};

const stripInternalFields = (value) => {
  const data = cloneValue(value || {});
  delete data.__v;
  delete data._id;
  return data;
};

const normalizeDateFields = (data, fields = []) => {
  fields.forEach((field) => {
    if (!data[field]) {
      return;
    }

    if (!(data[field] instanceof Date)) {
      const parsed = new Date(data[field]);
      if (!Number.isNaN(parsed.getTime())) {
        data[field] = parsed;
      }
    }
  });

  return data;
};

const compareValues = (left, right) => {
  if (left === right) {
    return 0;
  }

  if (left === undefined || left === null) {
    return -1;
  }

  if (right === undefined || right === null) {
    return 1;
  }

  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }

  return String(left).localeCompare(String(right));
};

const matchesOperator = (value, operator, expected) => {
  switch (operator) {
    case '$in':
      if (!Array.isArray(expected)) {
        return false;
      }
      if (Array.isArray(value)) {
        return value.some((entry) => expected.includes(entry));
      }
      return expected.includes(value);
    case '$gte':
      return value >= expected;
    case '$gt':
      return value > expected;
    case '$lte':
      return value <= expected;
    case '$lt':
      return value < expected;
    default:
      return false;
  }
};

const matchesFilterValue = (value, expected) => {
  if (expected instanceof RegExp) {
    return expected.test(String(value || ''));
  }

  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    return Object.entries(expected).every(([operator, operatorValue]) => matchesOperator(value, operator, operatorValue));
  }

  if (Array.isArray(value)) {
    return value.includes(expected);
  }

  return value === expected;
};

const matchesFilter = (doc, filter = {}) => {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or' && Array.isArray(expected)) {
      return expected.some((entry) => matchesFilter(doc, entry));
    }

    return matchesFilterValue(doc[key], expected);
  });
};

const sortDocuments = (docs, sort = null) => {
  if (!sort || typeof sort !== 'object') {
    return docs.slice();
  }

  const entries = Object.entries(sort);
  return docs.slice().sort((left, right) => {
    for (const [field, direction] of entries) {
      const comparison = compareValues(left[field], right[field]);
      if (comparison !== 0) {
        return direction >= 0 ? comparison : comparison * -1;
      }
    }
    return 0;
  });
};

const paginateDocuments = (docs, options = {}) => {
  const skip = Number.isInteger(options.skip) && options.skip > 0 ? options.skip : 0;
  const limit = Number.isInteger(options.limit) && options.limit >= 0 ? options.limit : null;

  if (limit === null) {
    return docs.slice(skip);
  }

  return docs.slice(skip, skip + limit);
};

const createId = () => crypto.randomUUID();

module.exports = {
  cloneValue,
  createId,
  decorateValue,
  matchesFilter,
  normalizeDateFields,
  paginateDocuments,
  sortDocuments,
  stripInternalFields,
};
