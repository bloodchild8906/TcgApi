const mysql = require('mysql2/promise');

let pool = null;

const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS game_documents (
    collection_name VARCHAR(191) NOT NULL,
    document_id VARCHAR(191) NOT NULL,
    document_json LONGTEXT NOT NULL,
    created_at VARCHAR(40) NOT NULL,
    updated_at VARCHAR(40) NOT NULL,
    PRIMARY KEY (collection_name, document_id)
  )`,
];

const query = async (sql, params = []) => {
  const [rows] = await pool.execute(sql, params);
  return rows;
};

const nowIso = () => new Date().toISOString();

exports.connect = async (config) => {
  pool = config.game_db_url
    ? mysql.createPool(config.game_db_url)
    : mysql.createPool({
      host: config.game_db_host,
      port: Number(config.game_db_port),
      user: config.game_db_user,
      password: config.game_db_pass,
      database: config.game_db_name,
      waitForConnections: true,
      connectionLimit: 10,
      ssl: config.game_db_ssl ? {} : undefined,
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
  driver: 'mysql',
  connected: Boolean(pool),
  detail: pool ? 'MySQL game store connected' : 'MySQL game store disconnected',
});

exports.listDocuments = async (collectionName) => {
  const rows = await query(
    'SELECT document_id, document_json FROM game_documents WHERE collection_name = ? ORDER BY updated_at DESC',
    [collectionName]
  );
  return rows.map((row) => JSON.parse(row.document_json));
};

exports.upsertDocument = async (collectionName, keyField, key, document) => {
  const timestamp = nowIso();
  await query(
    `INSERT INTO game_documents (collection_name, document_id, document_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       document_json = VALUES(document_json),
       updated_at = VALUES(updated_at)`,
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
  const result = await query(
    'DELETE FROM game_documents WHERE collection_name = ? AND document_id = ?',
    [collectionName, key]
  );
  return result.affectedRows > 0;
};

exports.deleteCollection = async (collectionName) => {
  await query('DELETE FROM game_documents WHERE collection_name = ?', [collectionName]);
  return true;
};
