const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, initDB, getResults, setResults, getPrediction } = require('./db/database');
const { TEAMS, GROUPS, buildGroupMatches } = require('./db/tournament');
const engine = require('./db/engine');

const app = express();
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET || 'quiniela-dhl-mundial-2026';

initDB();
const GROUP_MATCHES = buildGroupMatches(); // 72 partidos, orden estable

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SQLiteStore = require('connect-sqlite3')(session);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'quiniela.db');
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.dirname(DB_PATH) }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'No autenticado' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.userId || !req.session.isAdmin) return res.status(403).json({ error: 'Acceso denegado' });
  next();
}

// Clave canónica de un partido a partir de su orden (estable). Devuelve "T1-T2".
function matchKey(m) { return `${m.team1}-${m.team2}`; }

// ─── META (datos del torneo para el front) ───────────────────────────────────
app.get('/api/meta', (req, res) => {
  res.json({
    teams: TEAMS,
    groups: GROUPS,
    matches: GROUP_MATCHES.map((m, i) => ({
      idx: i, key: matchKey(m), group: m.group_name, jornada: m.jornada,
      team1: m.team1, team2: m.team2,
    })),
  });
});

// ─── AUTH ─────────────────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get((username||'').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
  }
  req.session.userId = user.id;
  req.session.isAdmin = !!user.is_admin;
  res.json({ id: user.id, username: user.username, displayName: user.display_name, isAdmin: !!user.is_admin });
});
app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', (req, res) => {
  if (!req.session.userId) return res.json(null);
  const u = db.prepare('SELECT id, username, display_name, is_admin FROM users WHERE id = ?').get(req.session.userId);
  if (!u) return res.json(null);
  res.json({ id: u.id, username: u.username, displayName: u.display_name, isAdmin: !!u.is_admin });
});

// ─── PREDICCIÓN DEL USUARIO ───────────────────────────────────────────────────
app.get('/api/prediction', requireAuth, (req, res) => {
  res.json(getPrediction(req.session.userId));
});

// Guardar borrador (no bloquea). body: { scores }
app.put('/api/prediction', requireAuth, (req, res) => {
  const cur = getPrediction(req.session.userId);
  if (cur.submitted) return res.status(400).json({ error: 'Tu quiniela ya fue enviada y no se puede modificar.' });
  const scores = sanitizeScores(req.body.scores);
  db.prepare(`INSERT INTO predictions (user_id, scores_json, submitted) VALUES (?, ?, 0)
    ON CONFLICT(user_id) DO UPDATE SET scores_json = excluded.scores_json`)
    .run(req.session.userId, JSON.stringify(scores));
  res.json({ ok: true, saved: Object.keys(scores).length });
});

// Enviar definitivamente (bloquea). Requiere los 72 partidos.
app.post('/api/prediction/submit', requireAuth, (req, res) => {
  const cur = getPrediction(req.session.userId);
  if (cur.submitted) return res.status(400).json({ error: 'Tu quiniela ya fue enviada.' });
  const scores = sanitizeScores(req.body.scores);
  const validKeys = new Set(GROUP_MATCHES.map(matchKey));
  let filled = 0;
  for (const k of validKeys) {
    const s = scores[k];
    if (s && Number.isInteger(s.a) && Number.isInteger(s.b)) filled++;
  }
  if (filled < 72) return res.status(400).json({ error: `Faltan ${72 - filled} partidos por completar.` });
  db.prepare(`INSERT INTO predictions (user_id, scores_json, submitted, submitted_at) VALUES (?, ?, 1, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET scores_json = excluded.scores_json, submitted = 1, submitted_at = datetime('now')`)
    .run(req.session.userId, JSON.stringify(scores));
  res.json({ ok: true });
});

function sanitizeScores(scores) {
  const out = {};
  if (!scores || typeof scores !== 'object') return out;
  const validKeys = new Set(GROUP_MATCHES.map(matchKey));
  for (const k of Object.keys(scores)) {
    if (!validKeys.has(k)) continue;
    const s = scores[k];
    if (!s) continue;
    const a = parseInt(s.a), b = parseInt(s.b);
    if (Number.isInteger(a) && Number.isInteger(b) && a >= 0 && b >= 0 && a < 50 && b < 50) {
      out[k] = { a, b };
    }
  }
  return out;
}

// Cuadro derivado de la predicción del usuario (sus 32 clasificados + tablas)
app.get('/api/prediction/bracket', requireAuth, (req, res) => {
  const pred = getPrediction(req.session.userId);
  const q = engine.computeQualifiers(pred.scores);
  res.json(q);
});

// ─── ADMIN: usuarios ──────────────────────────────────────────────────────────
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, display_name, created_at FROM users WHERE is_admin = 0 ORDER BY display_name').all();
  const withStatus = users.map(u => {
    const p = getPrediction(u.id);
    return { ...u, submitted: p.submitted, filled: Object.keys(p.scores).length };
  });
  res.json(withStatus);
});
app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, displayName } = req.body;
  if (!username || !password || !displayName) return res.status(400).json({ error: 'Faltan campos' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const r = db.prepare('INSERT INTO users (username, password_hash, display_name) VALUES (?, ?, ?)')
      .run(username.trim(), hash, displayName.trim());
    res.json({ id: r.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return res.status(400).json({ error: 'Ese usuario ya existe' });
    throw e;
  }
});
app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM predictions WHERE user_id = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ? AND is_admin = 0').run(req.params.id);
  res.json({ ok: true });
});
app.put('/api/admin/users/:id/password', requireAdmin, (req, res) => {
  const hash = bcrypt.hashSync(req.body.password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND is_admin = 0').run(hash, req.params.id);
  res.json({ ok: true });
});
// Desbloquear quiniela de un usuario (por si se equivocó y el admin lo permite)
app.put('/api/admin/users/:id/unlock', requireAdmin, (req, res) => {
  db.prepare('UPDATE predictions SET submitted = 0 WHERE user_id = ?').run(req.params.id);
  res.json({ ok: true });
});

// Resultados visibles para cualquier usuario autenticado (solo lectura)
app.get('/api/results', requireAuth, (req, res) => res.json(getResults()));

// ─── ADMIN: resultados reales ─────────────────────────────────────────────────
app.get('/api/admin/results', requireAdmin, (req, res) => res.json(getResults()));
app.put('/api/admin/results', requireAdmin, (req, res) => {
  const scores = sanitizeScores(req.body.scores);
  setResults(scores);
  res.json({ ok: true, count: Object.keys(scores).length });
});

// ─── RANKING (público para usuarios autenticados) ─────────────────────────────
app.get('/api/ranking', requireAuth, (req, res) => {
  const real = getResults();
  const users = db.prepare('SELECT id, display_name FROM users WHERE is_admin = 0').all();
  const ranking = users.map(u => {
    const pred = getPrediction(u.id);
    const sc = engine.scoreUser(pred.scores, real);
    return {
      userId: u.id, displayName: u.display_name,
      total: sc.total, groupPoints: sc.groupPoints, qualifierPoints: sc.qualifierPoints,
      exactCount: sc.exactCount, correctResultCount: sc.correctResultCount,
      correctQualifiers: sc.correctQualifiers, qualifiersScored: sc.qualifiersScored,
      submitted: pred.submitted,
    };
  });
  // Orden: total → exactos (desempate oficial) → nombre
  ranking.sort((a, b) => b.total - a.total || b.exactCount - a.exactCount || a.displayName.localeCompare(b.displayName));
  const playedMatches = Object.values(real).filter(s => s && s.a != null).length;
  res.json({ ranking, playedMatches, totalMatches: 72, groupStageComplete: engine.isGroupStageComplete(real) });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Quiniela DHL Mundial 2026 en puerto ${PORT}`));