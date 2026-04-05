const { Pool } = require('pg');

let pool = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS game_documents (
    collection_name TEXT NOT NULL,
    document_id TEXT NOT NULL,
    document_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (collection_name, document_id)
  )`,
];

const query = async (sql, params = []) => {
  const result = await pool.query(sql, params);
  return result.rows;
};

const nowIso = () => new Date().toISOString();

exports.connect = async (config) => {
  pool = new Pool({
    connectionString: config.game_db_url,
    ssl: config.game_db_ssl ? { rejectUnauthorized: false } : false,
  });

  for (const statement of schemaStatements) {
    await query(statement);
  }
};

exports.close = async () => {
  if (pool) {
    await pool.end();
    pool = null;
  }
};

exports.getStatus = () => ({
  driver: 'postgres',
  connected: Boolean(pool),
  detail: pool ? 'Postgres game store connected' : 'Postgres game store disconnected',
});

exports.listDocuments = async (collectionName) => {
  const rows = await query(
    'SELECT document_json FROM game_documents WHERE collection_name = $1 ORDER BY updated_at DESC',
    [collectionName]
  );
  return rows.map((row) => JSON.parse(row.document_json));
};

exports.upsertDocument = async (collectionName, keyField, key, document) => {
  const timestamp = nowIso();
  await query(
    `INSERT INTO game_documents (collection_name, document_id, document_json, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (collection_name, document_id)
     DO UPDATE SET
       document_json = EXCLUDED.document_json,
       updated_at = EXCLUDED.updated_at`,
    [
      collectionName,
      key,
      JSON.stringify(document),
      timestamp,
      timestamp,
    ]
  );
};

exports.deleteDocument = async (collectionName, keyField, key) => {
  const rows = await query(
    'DELETE FROM game_documents WHERE collection_name = $1 AND document_id = $2 RETURNING document_id',
    [collectionName, key]
  );
  return rows.length > 0;
};

exports.deleteCollection = async (collectionName) => {
  await query('DELETE FROM game_documents WHERE collection_name = $1', [collectionName]);
  return true;
};
