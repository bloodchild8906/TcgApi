const locks = new Map();

const acquire = async (key) => {
  while (locks.has(key)) {
    await locks.get(key);
  }

  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });

  locks.set(key, wait);

  return () => {
    if (locks.get(key) === wait) {
      locks.delete(key);
    }
    release();
  };
};

exports.withLocks = async (keys, action) => {
  const normalizedKeys = Array.from(new Set((keys || []).filter(Boolean))).sort();
  const releases = [];

  for (const key of normalizedKeys) {
    releases.push(await acquire(key));
  }

  try {
    return await action();
  } finally {
    releases.reverse().forEach((release) => release());
  }
};
