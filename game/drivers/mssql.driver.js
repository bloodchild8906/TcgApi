const { resolveSqlServerClient } = require('../../tools/mssql.tool');

let pool = null;
let activeSql = null;
let runtime = 'tedious';

const schemaStatements = [
  `IF OBJECT_ID('game_documents', 'U') IS NULL
   CREATE TABLE game_documents (
     collection_name NVARCHAR(191) NOT NULL,
     document_id NVARCHAR(191) NOT NULL,
     document_json NVARCHAR(MAX) NOT NULL,
     created_at NVARCHAR(40) NOT NULL,
     updated_at NVARCHAR(40) NOT NULL,
     CONSTRAINT PK_game_documents PRIMARY KEY (collection_name, document_id)
   )`,
];

const inputFromValue = (request, key, value) => {
  if (value === null || value === undefined) {
    request.input(key, activeSql.NVarChar(activeSql.MAX), null);
    return;
  }

  request.input(key, activeSql.NVarChar(activeSql.MAX), String(value));
};

const query = async (statement, params = {}) => {
  const request = pool.request();
  Object.entries(params).forEach(([key, value]) => {
    inputFromValue(request, key, value);
  });
  const result = await request.query(statement);
  return result.recordset || [];
};

const nowIso = () => new Date().toISOString();

exports.connect = async (config) => {
  const resolved = resolveSqlServerClient({
    connectionString: config.game_db_url,
    server: config.game_db_host,
    port: Number(config.game_db_port),
    database: config.game_db_name,
    user: config.game_db_user || undefined,
    password: config.game_db_pass || undefined,
    options: {
      encrypt: Boolean(config.game_db_ssl),
      trustServerCertificate: !config.game_db_ssl,
    },
  });

  activeSql = resolved.sql;
  runtime = resolved.runtime;

  const connectionPool = new activeSql.ConnectionPool(resolved.config);
  pool = await connectionPool.connect();

  for (const statement of schemaStatements) {
    await query(statement);
  }
};

exports.close = async () => {
  if (pool) {
    await pool.close();
    pool = null;
  }
  activeSql = null;
};

exports.getStatus = () => ({
  driver: 'mssql',
  connected: Boolean(pool),
  detail: pool ? `SQL Server game store connected via ${runtime}` : 'SQL Server game store disconnected',
});

exports.listDocuments = async (collectionName) => {
  const rows = await query(
    'SELECT document_json FROM game_documents WHERE collection_name = @collection_name ORDER BY updated_at DESC',
    { collection_name: collectionName }
  );
  return rows.map((row) => JSON.parse(row.document_json));
};

exports.upsertDocument = async (collectionName, keyField, key, document) => {
  const timestamp = nowIso();
  const rows = await query(
    'SELECT document_id FROM game_documents WHERE collection_name = @collection_name AND document_id = @document_id',
    {
      collection_name: collectionName,
      document_id: key,
    }
  );

  if (rows.length > 0) {
    await query(
      `UPDATE game_documents SET
         document_json = @document_json,
         updated_at = @updated_at
       WHERE collection_name = @collection_name AND document_id = @document_id`,
      {
        collection_name: collectionName,
        document_id: key,
        document_json: JSON.stringify(document),
        updated_at: timestamp,
      }
    );
    return;
  }

  await query(
    `INSERT INTO game_documents (collection_name, document_id, document_json, created_at, updated_at)
     VALUES (@collection_name, @document_id, @document_json, @created_at, @updated_at)`,
    {
      collection_name: collectionName,
      document_id: key,
      document_json: JSON.stringify(document),
      created_at: timestamp,
      updated_at: timestamp,
    }
  );
};

exports.deleteDocument = async (collectionName, keyField, key) => {
  const rows = await query(
    `DELETE FROM game_documents
     OUTPUT DELETED.document_id
     WHERE collection_name = @collection_name AND document_id = @document_id`,
    {
      collection_name: collectionName,
      document_id: key,
    }
  );
  return rows.length > 0;
};

exports.deleteCollection = async (collectionName) => {
  await query(
    'DELETE FROM game_documents WHERE collection_name = @collection_name',
    { collection_name: collectionName }
  );
  return true;
};
