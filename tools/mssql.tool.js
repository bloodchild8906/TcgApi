const defaultSql = require('mssql');
const { parseSqlConnectionString } = require('@tediousjs/connection-string');

let msNodeSql = null;
const DEFAULT_ODBC_DRIVER = 'ODBC Driver 18 for SQL Server';

const parseBoolean = (value, fallback = false) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (['true', 'yes', '1', 'on', 'sspi'].includes(normalized)) {
    return true;
  }

  if (['false', 'no', '0', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
};

const parseConnectionString = (connectionString) => {
  if (!connectionString || typeof connectionString !== 'string') {
    return null;
  }

  try {
    return parseSqlConnectionString(connectionString, true, true);
  } catch (error) {
    return null;
  }
};

const getConnectionValue = (parsed, keys, fallback = '') => {
  if (!parsed) {
    return fallback;
  }

  for (const key of keys) {
    if (parsed[key] !== undefined && parsed[key] !== null && parsed[key] !== '') {
      return parsed[key];
    }
  }

  return fallback;
};

const escapeConnectionValue = (value) => {
  const text = String(value);
  return /[;{}]/.test(text) ? `{${text.replace(/}/g, '}}')}}` : text;
};

const buildMsNodeConnectionString = (connectionString, fallbackConfig = {}) => {
  const parsed = parseConnectionString(connectionString);
  if (!parsed) {
    return connectionString;
  }

  const trustedConnection = parseBoolean(
    getConnectionValue(parsed, ['trusted_connection', 'trusted connection', 'integrated security']),
    Boolean(fallbackConfig.options?.trustedConnection)
  );
  const encrypt = parseBoolean(
    getConnectionValue(parsed, ['encrypt']),
    Boolean(fallbackConfig.options?.encrypt)
  );
  const trustServerCertificate = parseBoolean(
    getConnectionValue(parsed, ['trustservercertificate']),
    Boolean(fallbackConfig.options?.trustServerCertificate)
  );
  const values = [
    ['Driver', getConnectionValue(parsed, ['driver'], fallbackConfig.driver || DEFAULT_ODBC_DRIVER)],
    ['Server', getConnectionValue(parsed, ['data source', 'server'], fallbackConfig.server)],
    ['Database', getConnectionValue(parsed, ['initial catalog', 'database'])],
    ['Uid', trustedConnection ? '' : getConnectionValue(parsed, ['user id', 'uid'])],
    ['Pwd', trustedConnection ? '' : getConnectionValue(parsed, ['password', 'pwd'])],
    ['Trusted_Connection', trustedConnection ? 'Yes' : 'No'],
    ['Encrypt', encrypt ? 'Yes' : 'No'],
    ['TrustServerCertificate', trustServerCertificate ? 'Yes' : 'No'],
    ['Application Name', getConnectionValue(parsed, ['application name'])],
    ['Connection Timeout', getConnectionValue(parsed, ['connection timeout'])],
    ['Request Timeout', getConnectionValue(parsed, ['request timeout', 'command timeout'])],
    ['MARS_Connection', getConnectionValue(parsed, ['multipleactiveresultsets']) !== ''
      ? (parseBoolean(getConnectionValue(parsed, ['multipleactiveresultsets'])) ? 'Yes' : 'No')
      : ''],
    ['Pooling', getConnectionValue(parsed, ['pooling']) !== ''
      ? (parseBoolean(getConnectionValue(parsed, ['pooling'])) ? 'Yes' : 'No')
      : ''],
    ['Persist Security Info', getConnectionValue(parsed, ['persist security info']) !== ''
      ? (parseBoolean(getConnectionValue(parsed, ['persist security info'])) ? 'Yes' : 'No')
      : ''],
  ];

  return values
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${key}=${escapeConnectionValue(value)}`)
    .join(';');
};

const getMsNodeSql = () => {
  if (!msNodeSql) {
    try {
      msNodeSql = require('mssql/msnodesqlv8');
    } catch (error) {
      throw new Error('msnodesqlv8 is required for SQL Server Integrated Security connections.');
    }
  }

  return msNodeSql;
};

exports.resolveSqlServerClient = (options = {}) => {
  const connectionString = String(options.connectionString || '').trim();
  const parsed = parseConnectionString(connectionString);
  const requestedDriver = String(getConnectionValue(parsed, ['driver'])).trim().toLowerCase();
  const trustedConnection = parseBoolean(
    getConnectionValue(parsed, ['trusted_connection', 'trusted connection', 'integrated security']),
    Boolean(options.trustedConnection)
  );
  const useMsNodeSql = requestedDriver === 'msnodesqlv8' || trustedConnection;

  if (useMsNodeSql) {
    const sql = getMsNodeSql();
    const config = {
      connectionString: buildMsNodeConnectionString(connectionString, options),
      driver: options.driver || DEFAULT_ODBC_DRIVER,
      options: {
        trustedConnection: true,
        encrypt: Boolean(options.options?.encrypt),
        trustServerCertificate: Boolean(options.options?.trustServerCertificate),
      },
    };

    return {
      sql,
      config,
      runtime: 'msnodesqlv8',
    };
  }

  if (connectionString) {
    return {
      sql: defaultSql,
      config: connectionString,
      runtime: 'tedious',
    };
  }

  return {
    sql: defaultSql,
    config: {
      server: options.server,
      port: options.port,
      database: options.database,
      user: options.user,
      password: options.password,
      options: {
        encrypt: Boolean(options.options?.encrypt),
        trustServerCertificate: Boolean(options.options?.trustServerCertificate),
      },
    },
    runtime: 'tedious',
  };
};
