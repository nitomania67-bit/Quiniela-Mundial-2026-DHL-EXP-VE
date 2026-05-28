const express = require('express');
const session = require('express-session');
const path = require('path');
const { db, initDB } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'quiniela-mundial-2026-secret-key';

// Init DB
initDB();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Session setup with SQLite store
const SQLiteStore = require('connect-sqlite3')(session);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'quiniela.db');

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.dirname(DB_PATH) }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }
}));

// Auth middleware
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// ─── AUTH ROUTES ────────────────────────────────────────────────────────────
const bcrypt = require('bcryptjs');

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  req.session.userId = user.id;
  req.session.isAdmin = !!user.is_admin;
  req.session.displayName = user.display_name;
  res.json({ id: user.id, username: user.username, displayName: user.display_name, isAdmin: !!user.is_admin });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  const user = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.json(null);
  res.json({ id: user.id, username: user.username, displayName: user.display_name, isAdmin: !!user.is_admin });
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, is_admin, created_at FROM users WHERE is_admin = 0 ORDER BY display_name').all();
  res.json(users);
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ error: 'Faltan campos' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)').run(username, hash, displayName);
    res.json({ id: result.lastInsertRowid, username, displayName });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'El usuario ya existe' });
    throw e;
  }
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM predictions WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ? AND is_admin = 0').run(id);
  res.json({ ok: true });
});

app.put('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  res.json({ ok: true });
});

// Admin: set match result
app.put('/api/admin/matches/:id/result', requireAdmin, (req, res) => {
  const { result1, result2, team1, team2 } = req.body;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(req.params.id);
  if (!match) return res.status(404).json({ error: 'Partido no encontrado' });
  
  db.prepare('UPDATE matches SET result1 = ?, result2 = ?, is_locked = 1, team1 = ?, team2 = ? WHERE id = ?')
    .run(result1, result2, team1 || match.team1, team2 || match.team2, req.params.id);
  
  res.json({ ok: true });
});

// Admin: clear match result
app.delete('/api/admin/matches/:id/result', requireAdmin, (req, res) => {
  db.prepare('UPDATE matches SET result1 = NULL, result2 = NULL, is_locked = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Admin: lock/unlock quiniela submission
app.put('/api/admin/settings/lock', requireAdmin, (req, res) => {
  // Lock all matches that have no result yet (prevents new predictions)
  // We use a separate approach: just return current lock status based on any locked match
  const { locked } = req.body;
  db.prepare('UPDATE matches SET is_locked = ? WHERE result1 IS NULL').run(locked ? 1 : 0);
  res.json({ ok: true });
});

// ─── MATCHES ROUTES ──────────────────────────────────────────────────────────
app.get('/api/matches', (req, res) => {
  const matches = db.prepare('SELECT * FROM matches ORDER BY phase, group_name, match_number, id').all();
  res.json(matches);
});

// ─── PREDICTIONS ROUTES ──────────────────────────────────────────────────────
app.get('/api/predictions/mine', requireAuth, (req, res) => {
  const preds = db.prepare('SELECT * FROM predictions WHERE user_id = ?').all(req.session.userId);
  res.json(preds);
});

app.get('/api/predictions/complete', requireAuth, (req, res) => {
  const totalMatches = db.prepare('SELECT COUNT(*) as c FROM matches').get().c;
  const userPreds = db.prepare('SELECT COUNT(*) as c FROM predictions WHERE user_id = ?').get(req.session.userId).c;
  res.json({ total: totalMatches, filled: userPreds, complete: userPreds === totalMatches });
});

app.post('/api/predictions', requireAuth, (req, res) => {
  const userId = req.session.userId;
  
  // Check if user already submitted all predictions
  const totalMatches = db.prepare('SELECT COUNT(*) as c FROM matches').get().c;
  const existingPreds = db.prepare('SELECT COUNT(*) as c FROM predictions WHERE user_id = ?').get(userId).c;
  if (existingPreds >= totalMatches) {
    return res.status(400).json({ error: 'Ya completaste tu quiniela. No se puede modificar.' });
  }

  const { predictions } = req.body; // Array of { match_id, pred1, pred2 }
  if (!Array.isArray(predictions) || predictions.length === 0) {
    return res.status(400).json({ error: 'No hay predicciones' });
  }

  const insert = db.prepare(`
    INSERT INTO predictions (user_id, match_id, pred1, pred2)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, match_id) DO UPDATE SET pred1=excluded.pred1, pred2=excluded.pred2
  `);

  const insertMany = db.transaction((preds) => {
    for (const p of preds) {
      insert.run(userId, p.match_id, p.pred1, p.pred2);
    }
  });

  try {
    insertMany(predictions);
    
    // Check if now complete - lock if so
    const newCount = db.prepare('SELECT COUNT(*) as c FROM predictions WHERE user_id = ?').get(userId).c;
    res.json({ ok: true, filled: newCount, total: totalMatches, complete: newCount >= totalMatches });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ─── RANKING ROUTE ───────────────────────────────────────────────────────────
app.get('/api/ranking', (req, res) => {
  const users = db.prepare('SELECT id, display_name FROM users WHERE is_admin = 0').all();
  const results = db.prepare('SELECT id, result1, result2 FROM matches WHERE result1 IS NOT NULL AND result2 IS NOT NULL').all();
  
  if (results.length === 0) {
    const ranking = users.map(u => ({
      userId: u.id,
      displayName: u.display_name,
      points: 0,
      exact: 0,
      winner: 0,
      played: 0,
      total: db.prepare('SELECT COUNT(*) as c FROM predictions WHERE user_id = ?').get(u.id).c
    }));
    return res.json(ranking);
  }

  const ranking = users.map(user => {
    let points = 0, exact = 0, winner = 0;
    
    for (const match of results) {
      const pred = db.prepare('SELECT pred1, pred2 FROM predictions WHERE user_id = ? AND match_id = ?').get(user.id, match.id);
      if (!pred) continue;
      
      if (pred.pred1 === match.result1 && pred.pred2 === match.result2) {
        points += 3;
        exact++;
      } else {
        const matchWinner = match.result1 > match.result2 ? 1 : match.result1 < match.result2 ? 2 : 0;
        const predWinner = pred.pred1 > pred.pred2 ? 1 : pred.pred1 < pred.pred2 ? 2 : 0;
        if (matchWinner === predWinner) {
          points += 1;
          winner++;
        }
      }
    }

    const totalPreds = db.prepare('SELECT COUNT(*) as c FROM predictions WHERE user_id = ?').get(user.id).c;
    
    return {
      userId: user.id,
      displayName: user.display_name,
      points,
      exact,
      winner,
      played: results.length,
      total: totalPreds
    };
  });

  ranking.sort((a, b) => b.points - a.points || b.exact - a.exact);
  res.json(ranking);
});

// Public: get another user's predictions (only visible after quiniela is locked/complete)
app.get('/api/predictions/user/:id', requireAuth, (req, res) => {
  const targetUser = db.prepare('SELECT id, display_name FROM users WHERE id = ?').get(req.params.id);
  if (!targetUser) return res.status(404).json({ error: 'Usuario no encontrado' });
  
  const preds = db.prepare('SELECT * FROM predictions WHERE user_id = ?').all(req.params.id);
  res.json({ user: targetUser, predictions: preds });
});

// ─── SPA fallback ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Quiniela Mundial 2026 running on port ${PORT}`);
});