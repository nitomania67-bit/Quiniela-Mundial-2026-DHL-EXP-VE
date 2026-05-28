const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

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

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phase TEXT NOT NULL,
      match_number INTEGER,
      team1 TEXT NOT NULL,
      team2 TEXT NOT NULL,
      group_name TEXT,
      match_date TEXT,
      result1 INTEGER,
      result2 INTEGER,
      is_locked INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      match_id INTEGER NOT NULL,
      pred1 INTEGER NOT NULL,
      pred2 INTEGER NOT NULL,
      UNIQUE(user_id, match_id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (match_id) REFERENCES matches(id)
    );
  `);

  // Seed admin user if not exists
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existing) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare(`INSERT INTO users (username, password_hash, display_name, is_admin) VALUES (?, ?, ?, 1)`)
      .run('admin', hash, 'Administrador');
    console.log('Admin user created. Password:', adminPassword);
  }

  // Seed matches if none exist
  const matchCount = db.prepare('SELECT COUNT(*) as c FROM matches').get().c;
  if (matchCount === 0) {
    seedMatches();
    console.log('Matches seeded.');
  }
}

function seedMatches() {
  const groupMatches = [
    // Group A
    { phase: 'Grupos', group_name: 'A', team1: 'México', team2: 'Ecuador' },
    { phase: 'Grupos', group_name: 'A', team1: 'Senegal', team2: 'Países Bajos' },
    { phase: 'Grupos', group_name: 'A', team1: 'México', team2: 'Senegal' },
    { phase: 'Grupos', group_name: 'A', team1: 'Países Bajos', team2: 'Ecuador' },
    { phase: 'Grupos', group_name: 'A', team1: 'Países Bajos', team2: 'México' },
    { phase: 'Grupos', group_name: 'A', team1: 'Ecuador', team2: 'Senegal' },
    // Group B
    { phase: 'Grupos', group_name: 'B', team1: 'Inglaterra', team2: 'Irán' },
    { phase: 'Grupos', group_name: 'B', team1: 'EEUU', team2: 'Gales' },
    { phase: 'Grupos', group_name: 'B', team1: 'Gales', team2: 'Irán' },
    { phase: 'Grupos', group_name: 'B', team1: 'Inglaterra', team2: 'EEUU' },
    { phase: 'Grupos', group_name: 'B', team1: 'Gales', team2: 'Inglaterra' },
    { phase: 'Grupos', group_name: 'B', team1: 'Irán', team2: 'EEUU' },
    // Group C
    { phase: 'Grupos', group_name: 'C', team1: 'Argentina', team2: 'Arabia Saudita' },
    { phase: 'Grupos', group_name: 'C', team1: 'México', team2: 'Polonia' },
    { phase: 'Grupos', group_name: 'C', team1: 'Polonia', team2: 'Arabia Saudita' },
    { phase: 'Grupos', group_name: 'C', team1: 'Argentina', team2: 'México' },
    { phase: 'Grupos', group_name: 'C', team1: 'Polonia', team2: 'Argentina' },
    { phase: 'Grupos', group_name: 'C', team1: 'Arabia Saudita', team2: 'México' },
    // Group D
    { phase: 'Grupos', group_name: 'D', team1: 'Francia', team2: 'Australia' },
    { phase: 'Grupos', group_name: 'D', team1: 'Túnez', team2: 'Dinamarca' },
    { phase: 'Grupos', group_name: 'D', team1: 'Australia', team2: 'Túnez' },
    { phase: 'Grupos', group_name: 'D', team1: 'Francia', team2: 'Dinamarca' },
    { phase: 'Grupos', group_name: 'D', team1: 'Túnez', team2: 'Francia' },
    { phase: 'Grupos', group_name: 'D', team1: 'Dinamarca', team2: 'Australia' },
    // Group E
    { phase: 'Grupos', group_name: 'E', team1: 'España', team2: 'Costa Rica' },
    { phase: 'Grupos', group_name: 'E', team1: 'Alemania', team2: 'Japón' },
    { phase: 'Grupos', group_name: 'E', team1: 'Japón', team2: 'Costa Rica' },
    { phase: 'Grupos', group_name: 'E', team1: 'España', team2: 'Alemania' },
    { phase: 'Grupos', group_name: 'E', team1: 'Japón', team2: 'España' },
    { phase: 'Grupos', group_name: 'E', team1: 'Costa Rica', team2: 'Alemania' },
    // Group F
    { phase: 'Grupos', group_name: 'F', team1: 'Bélgica', team2: 'Canadá' },
    { phase: 'Grupos', group_name: 'F', team1: 'Marruecos', team2: 'Croacia' },
    { phase: 'Grupos', group_name: 'F', team1: 'Croacia', team2: 'Canadá' },
    { phase: 'Grupos', group_name: 'F', team1: 'Bélgica', team2: 'Marruecos' },
    { phase: 'Grupos', group_name: 'F', team1: 'Croacia', team2: 'Bélgica' },
    { phase: 'Grupos', group_name: 'F', team1: 'Canadá', team2: 'Marruecos' },
    // Group G
    { phase: 'Grupos', group_name: 'G', team1: 'Brasil', team2: 'Serbia' },
    { phase: 'Grupos', group_name: 'G', team1: 'Suiza', team2: 'Camerún' },
    { phase: 'Grupos', group_name: 'G', team1: 'Camerún', team2: 'Serbia' },
    { phase: 'Grupos', group_name: 'G', team1: 'Brasil', team2: 'Suiza' },
    { phase: 'Grupos', group_name: 'G', team1: 'Camerún', team2: 'Brasil' },
    { phase: 'Grupos', group_name: 'G', team1: 'Serbia', team2: 'Suiza' },
    // Group H
    { phase: 'Grupos', group_name: 'H', team1: 'Portugal', team2: 'Ghana' },
    { phase: 'Grupos', group_name: 'H', team1: 'Uruguay', team2: 'Corea del Sur' },
    { phase: 'Grupos', group_name: 'H', team1: 'Corea del Sur', team2: 'Ghana' },
    { phase: 'Grupos', group_name: 'H', team1: 'Portugal', team2: 'Uruguay' },
    { phase: 'Grupos', group_name: 'H', team1: 'Corea del Sur', team2: 'Portugal' },
    { phase: 'Grupos', group_name: 'H', team1: 'Ghana', team2: 'Uruguay' },
    // Group I
    { phase: 'Grupos', group_name: 'I', team1: 'Italia', team2: 'Colombia' },
    { phase: 'Grupos', group_name: 'I', team1: 'Chile', team2: 'Nigeria' },
    { phase: 'Grupos', group_name: 'I', team1: 'Italia', team2: 'Chile' },
    { phase: 'Grupos', group_name: 'I', team1: 'Colombia', team2: 'Nigeria' },
    { phase: 'Grupos', group_name: 'I', team1: 'Colombia', team2: 'Chile' },
    { phase: 'Grupos', group_name: 'I', team1: 'Nigeria', team2: 'Italia' },
    // Group J
    { phase: 'Grupos', group_name: 'J', team1: 'Holanda', team2: 'Indonesia' },
    { phase: 'Grupos', group_name: 'J', team1: 'Austria', team2: 'Venezuela' },
    { phase: 'Grupos', group_name: 'J', team1: 'Indonesia', team2: 'Austria' },
    { phase: 'Grupos', group_name: 'J', team1: 'Holanda', team2: 'Venezuela' },
    { phase: 'Grupos', group_name: 'J', team1: 'Austria', team2: 'Holanda' },
    { phase: 'Grupos', group_name: 'J', team1: 'Venezuela', team2: 'Indonesia' },
    // Group K
    { phase: 'Grupos', group_name: 'K', team1: 'Paraguay', team2: 'Argelia' },
    { phase: 'Grupos', group_name: 'K', team1: 'Eslovaquia', team2: 'Rumanía' },
    { phase: 'Grupos', group_name: 'K', team1: 'Paraguay', team2: 'Eslovaquia' },
    { phase: 'Grupos', group_name: 'K', team1: 'Argelia', team2: 'Rumanía' },
    { phase: 'Grupos', group_name: 'K', team1: 'Argelia', team2: 'Eslovaquia' },
    { phase: 'Grupos', group_name: 'K', team1: 'Rumanía', team2: 'Paraguay' },
    // Group L
    { phase: 'Grupos', group_name: 'L', team1: 'China', team2: 'Perú' },
    { phase: 'Grupos', group_name: 'L', team1: 'Ecuador', team2: 'Bolivia' },
    { phase: 'Grupos', group_name: 'L', team1: 'China', team2: 'Ecuador' },
    { phase: 'Grupos', group_name: 'L', team1: 'Perú', team2: 'Bolivia' },
    { phase: 'Grupos', group_name: 'L', team1: 'Perú', team2: 'Ecuador' },
    { phase: 'Grupos', group_name: 'L', team1: 'Bolivia', team2: 'China' },
  ];

  const eliminatoryMatches = [
    // Octavos (16 matches with TBD teams)
    { phase: 'Octavos', match_number: 1, team1: '1A', team2: '2B' },
    { phase: 'Octavos', match_number: 2, team1: '1C', team2: '2D' },
    { phase: 'Octavos', match_number: 3, team1: '1E', team2: '2F' },
    { phase: 'Octavos', match_number: 4, team1: '1G', team2: '2H' },
    { phase: 'Octavos', match_number: 5, team1: '1I', team2: '2J' },
    { phase: 'Octavos', match_number: 6, team1: '1K', team2: '2L' },
    { phase: 'Octavos', match_number: 7, team1: '1B', team2: '2A' },
    { phase: 'Octavos', match_number: 8, team1: '1D', team2: '2C' },
    { phase: 'Octavos', match_number: 9, team1: '1F', team2: '2E' },
    { phase: 'Octavos', match_number: 10, team1: '1H', team2: '2G' },
    { phase: 'Octavos', match_number: 11, team1: '1J', team2: '2I' },
    { phase: 'Octavos', match_number: 12, team1: '1L', team2: '2K' },
    { phase: 'Octavos', match_number: 13, team1: 'Mejor 3° (A/B/C)', team2: 'Mejor 3° (D/E/F)' },
    { phase: 'Octavos', match_number: 14, team1: 'Mejor 3° (G/H/I)', team2: 'Mejor 3° (J/K/L)' },
    { phase: 'Octavos', match_number: 15, team1: 'Mejor 3° (A/B/C/D)', team2: 'Mejor 3° (E/F/G/H)' },
    { phase: 'Octavos', match_number: 16, team1: 'Mejor 3° (I/J/K/L)', team2: 'Mejor 3° (A-L)' },
    // Cuartos (8 matches)
    { phase: 'Cuartos', match_number: 1, team1: 'Gan. Oct 1', team2: 'Gan. Oct 2' },
    { phase: 'Cuartos', match_number: 2, team1: 'Gan. Oct 3', team2: 'Gan. Oct 4' },
    { phase: 'Cuartos', match_number: 3, team1: 'Gan. Oct 5', team2: 'Gan. Oct 6' },
    { phase: 'Cuartos', match_number: 4, team1: 'Gan. Oct 7', team2: 'Gan. Oct 8' },
    { phase: 'Cuartos', match_number: 5, team1: 'Gan. Oct 9', team2: 'Gan. Oct 10' },
    { phase: 'Cuartos', match_number: 6, team1: 'Gan. Oct 11', team2: 'Gan. Oct 12' },
    { phase: 'Cuartos', match_number: 7, team1: 'Gan. Oct 13', team2: 'Gan. Oct 14' },
    { phase: 'Cuartos', match_number: 8, team1: 'Gan. Oct 15', team2: 'Gan. Oct 16' },
    // Semis (4 matches)
    { phase: 'Semis', match_number: 1, team1: 'Gan. Cto 1', team2: 'Gan. Cto 2' },
    { phase: 'Semis', match_number: 2, team1: 'Gan. Cto 3', team2: 'Gan. Cto 4' },
    { phase: 'Semis', match_number: 3, team1: 'Gan. Cto 5', team2: 'Gan. Cto 6' },
    { phase: 'Semis', match_number: 4, team1: 'Gan. Cto 7', team2: 'Gan. Cto 8' },
    // Tercer lugar
    { phase: 'Tercer Lugar', match_number: 1, team1: 'Per. Semi 1/2', team2: 'Per. Semi 3/4' },
    // Final
    { phase: 'Final', match_number: 1, team1: 'Gan. Semi 1/2', team2: 'Gan. Semi 3/4' },
  ];

  const insertMatch = db.prepare(`
    INSERT INTO matches (phase, match_number, team1, team2, group_name)
    VALUES (@phase, @match_number, @team1, @team2, @group_name)
  `);

  const insertMany = db.transaction((matches) => {
    for (const m of matches) {
      insertMatch.run({
        phase: m.phase,
        match_number: m.match_number || null,
        team1: m.team1,
        team2: m.team2,
        group_name: m.group_name || null,
      });
    }
  });

  insertMany([...groupMatches, ...eliminatoryMatches]);
}

module.exports = { db, initDB };