const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { buildGroupMatches } = require('./tournament');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'quiniela.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Predicción de fase de grupos: un JSON con todos los marcadores del usuario.
    CREATE TABLE IF NOT EXISTS predictions (
      user_id INTEGER PRIMARY KEY,
      scores_json TEXT NOT NULL,       -- { "T1-T2": {a,b}, ... }
      submitted INTEGER DEFAULT 0,     -- 1 = enviada y bloqueada
      submitted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Resultados reales (los ingresa el admin). Un solo registro JSON.
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      scores_json TEXT NOT NULL
    );
  `);

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)`)
      .run('admin', hash, 'Administrador');
    console.log('Admin creado. Password:', adminPassword);
  }

  const resRow = db.prepare('SELECT id FROM results WHERE id = 1').get();
  if (!resRow) db.prepare('INSERT INTO results (id, scores_json) VALUES (1, ?)').run('{}');
}

function getResults() {
  const row = db.prepare('SELECT scores_json FROM results WHERE id = 1').get();
  return row ? JSON.parse(row.scores_json) : {};
}
function setResults(obj) {
  db.prepare('UPDATE results SET scores_json = ? WHERE id = 1').run(JSON.stringify(obj));
}

function getPrediction(userId) {
  const row = db.prepare('SELECT scores_json, submitted, submitted_at FROM predictions WHERE user_id = ?').get(userId);
  if (!row) return { scores: {}, submitted: 0, submitted_at: null };
  return { scores: JSON.parse(row.scores_json), submitted: row.submitted, submitted_at: row.submitted_at };
}

module.exports = { db, initDB, getResults, setResults, getPrediction };