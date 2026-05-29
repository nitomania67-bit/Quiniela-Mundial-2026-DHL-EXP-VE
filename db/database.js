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

    -- Predicción de fase de grupos + cuadro eliminatorio del usuario.
    CREATE TABLE IF NOT EXISTS predictions (
      user_id INTEGER PRIMARY KEY,
      scores_json TEXT NOT NULL,       -- { "T1-T2": {a,b}, ... }
      bracket_json TEXT DEFAULT '{}',  -- { matchId: equipoGanador, ... }
      submitted INTEGER DEFAULT 0,     -- 1 = enviada y bloqueada
      submitted_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- Resultados reales (los ingresa el admin).
    CREATE TABLE IF NOT EXISTS results (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      scores_json TEXT NOT NULL,
      knockout_json TEXT DEFAULT '{}'  -- {reach8:[],reach4:[],reachSemi:[],reachFinal:[],champion}
    );
  `);

  // Migración suave por si la tabla existía sin las columnas nuevas
  try { db.prepare('SELECT bracket_json FROM predictions LIMIT 1').get(); }
  catch { db.exec("ALTER TABLE predictions ADD COLUMN bracket_json TEXT DEFAULT '{}'"); }
  try { db.prepare('SELECT knockout_json FROM results LIMIT 1').get(); }
  catch { db.exec("ALTER TABLE results ADD COLUMN knockout_json TEXT DEFAULT '{}'"); }

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
  const row = db.prepare('SELECT scores_json, knockout_json FROM results WHERE id = 1').get();
  if (!row) return { scores: {}, knockout: {} };
  return {
    scores: JSON.parse(row.scores_json || '{}'),
    knockout: JSON.parse(row.knockout_json || '{}'),
  };
}
function setResultScores(obj) {
  db.prepare('UPDATE results SET scores_json = ? WHERE id = 1').run(JSON.stringify(obj));
}
function setResultKnockout(obj) {
  db.prepare('UPDATE results SET knockout_json = ? WHERE id = 1').run(JSON.stringify(obj));
}

function getPrediction(userId) {
  const row = db.prepare('SELECT scores_json, bracket_json, submitted, submitted_at FROM predictions WHERE user_id = ?').get(userId);
  if (!row) return { scores: {}, bracketPicks: {}, submitted: 0, submitted_at: null };
  return {
    scores: JSON.parse(row.scores_json || '{}'),
    bracketPicks: JSON.parse(row.bracket_json || '{}'),
    submitted: row.submitted,
    submitted_at: row.submitted_at,
  };
}

module.exports = { db, initDB, getResults, setResultScores, setResultKnockout, getPrediction };