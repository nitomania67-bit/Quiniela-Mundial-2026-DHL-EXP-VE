const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const { db, initDB, getResults, setResultScores, setResultKnockout, getPrediction } = require('./db/database');
const { TEAMS, GROUPS, buildGroupMatches } = require('./db/tournament');
const engine = require('./db/engine');
const bracket = require('./db/bracket');

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
    bracket: {
      rounds: bracket.ROUNDS,
      roundLabel: bracket.ROUND_LABEL,
      feeds: bracket.FEEDS,
      r32: bracket.R32,
      thirdSlotWinnerGroup: bracket.THIRD_SLOT_WINNER_GROUP,
      thirdSlotOrder: bracket.THIRD_SLOT_ORDER,
      thirdSlotAllowed: bracket.THIRD_SLOT_ALLOWED,
      teamGroup: bracket.TEAM_GROUP,
    },
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

// Guardar borrador (grupos y/o bracket). body: { scores?, bracketPicks? }
app.put('/api/prediction', requireAuth, (req, res) => {
  const cur = getPrediction(req.session.userId);
  if (cur.submitted) return res.status(400).json({ error: 'Tu quiniela ya fue enviada y no se puede modificar.' });
  const scores = req.body.scores !== undefined ? sanitizeScores(req.body.scores) : cur.scores;
  const picks = req.body.bracketPicks !== undefined ? sanitizePicks(req.body.bracketPicks) : cur.bracketPicks;
  db.prepare(`INSERT INTO predictions (user_id, scores_json, bracket_json, submitted) VALUES (?, ?, ?, 0)
    ON CONFLICT(user_id) DO UPDATE SET scores_json = excluded.scores_json, bracket_json = excluded.bracket_json`)
    .run(req.session.userId, JSON.stringify(scores), JSON.stringify(picks));
  res.json({ ok: true });
});

// Enviar definitivamente (bloquea). Requiere 72 partidos + bracket completo.
app.post('/api/prediction/submit', requireAuth, (req, res) => {
  const cur = getPrediction(req.session.userId);
  if (cur.submitted) return res.status(400).json({ error: 'Tu quiniela ya fue enviada.' });
  const scores = req.body.scores !== undefined ? sanitizeScores(req.body.scores) : cur.scores;
  const picks = req.body.bracketPicks !== undefined ? sanitizePicks(req.body.bracketPicks) : cur.bracketPicks;

  const validKeys = new Set(GROUP_MATCHES.map(matchKey));
  let filled = 0;
  for (const k of validKeys) { const s = scores[k]; if (s && Number.isInteger(s.a) && Number.isInteger(s.b)) filled++; }
  if (filled < 72) return res.status(400).json({ error: `Faltan ${72 - filled} partidos de grupos por completar.` });

  // Validar bracket: reconstruir desde los grupos del usuario y comprobar picks coherentes.
  const st = engine.standingsFrom(scores);
  if (!validatePicks(st, picks)) return res.status(400).json({ error: 'Tu cuadro eliminatorio está incompleto o tiene elecciones inválidas. Vuelve a la pestaña "Mi cuadro".' });

  db.prepare(`INSERT INTO predictions (user_id, scores_json, bracket_json, submitted, submitted_at) VALUES (?, ?, ?, 1, datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET scores_json = excluded.scores_json, bracket_json = excluded.bracket_json, submitted = 1, submitted_at = datetime('now')`)
    .run(req.session.userId, JSON.stringify(scores), JSON.stringify(picks));
  res.json({ ok: true });
});

// Cuadro del usuario: estructura con equipos resueltos desde sus grupos + sus picks.
app.get('/api/prediction/bracket', requireAuth, (req, res) => {
  const pred = getPrediction(req.session.userId);
  const st = engine.standingsFrom(pred.scores);
  const pruned = pruneInvalidPicks(st, pred.bracketPicks);
  if (pruned.changed) {
    db.prepare('UPDATE predictions SET bracket_json = ? WHERE user_id = ?')
      .run(JSON.stringify(pruned.picks), req.session.userId);
  }
  const bb = bracket.buildBracket(st, st.qualifiedThirds, pruned.picks);
  res.json({
    allTables: st.allTables, qualifiedThirds: st.qualifiedThirds,
    matches: bb.matches, picks: pruned.picks,
    complete: bracket.bracketComplete(pruned.picks),
  });
});

// Reconstruye paso a paso y elimina picks que ya no correspondan a su llave.
function pruneInvalidPicks(standings, picks) {
  const order = [...bracket.ROUNDS.R32, ...bracket.ROUNDS.R16, ...bracket.ROUNDS.QF, ...bracket.ROUNDS.SF, ...bracket.ROUNDS.THIRD, ...bracket.ROUNDS.FINAL];
  const clean = {}; let changed = false;
  for (const id of order) {
    const bb = bracket.buildBracket(standings, standings.qualifiedThirds, clean);
    const m = bb.matches[id];
    const p = picks[id];
    if (p && m && (p === m.team1 || p === m.team2)) clean[id] = p;
    else if (p) changed = true;
  }
  return { picks: clean, changed };
}

function sanitizePicks(picks) {
  const out = {};
  if (!picks || typeof picks !== 'object') return out;
  const validIds = new Set([...bracket.ROUNDS.R32, ...bracket.ROUNDS.R16, ...bracket.ROUNDS.QF, ...bracket.ROUNDS.SF, ...bracket.ROUNDS.THIRD, ...bracket.ROUNDS.FINAL].map(String));
  for (const k of Object.keys(picks)) {
    if (!validIds.has(String(k))) continue;
    const v = picks[k];
    if (typeof v === 'string' && TEAMS[v]) out[k] = v;
  }
  return out;
}

// Reconstruye el cuadro aplicando picks paso a paso y verifica que cada pick
// sea uno de los dos equipos reales de su llave y que esté completo.
function validatePicks(standings, picks) {
  const required = [...bracket.ROUNDS.R32, ...bracket.ROUNDS.R16, ...bracket.ROUNDS.QF, ...bracket.ROUNDS.SF, ...bracket.ROUNDS.FINAL];
  const applied = {};
  for (const id of required) {
    const bb = bracket.buildBracket(standings, standings.qualifiedThirds, applied);
    const m = bb.matches[id];
    const pick = picks[id];
    if (!pick || !m || !m.team1 || !m.team2) return false;
    if (pick !== m.team1 && pick !== m.team2) return false;
    applied[id] = pick;
  }
  // tercer puesto (opcional): si viene, validar
  const bb3 = bracket.buildBracket(standings, standings.qualifiedThirds, applied);
  if (picks[103]) {
    const m = bb3.matches[103];
    if (m.team1 && m.team2 && picks[103] !== m.team1 && picks[103] !== m.team2) return false;
    applied[103] = picks[103];
  }
  return true;
}

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

// Cuadro REAL para mostrar (estructura desde standings reales)
app.get('/api/results/bracket', requireAuth, (req, res) => {
  const real = getResults();
  if (!engine.isGroupStageComplete(real.scores)) return res.json({ ready: false });
  const st = engine.standingsFrom(real.scores);
  res.json({ ready: true, allTables: st.allTables, qualifiedThirds: st.qualifiedThirds, knockout: real.knockout || {} });
});

// ─── ADMIN: resultados reales de grupos ───────────────────────────────────────
app.get('/api/admin/results', requireAdmin, (req, res) => res.json(getResults()));
app.put('/api/admin/results', requireAdmin, (req, res) => {
  const scores = sanitizeScores(req.body.scores);
  setResultScores(scores);
  res.json({ ok: true, count: Object.keys(scores).length });
});

// ─── ADMIN: resultados reales de eliminatorias (conjuntos por ronda) ──────────
// body: { reach8:[...16], reach4:[...8], reachSemi:[...4], reachFinal:[...2], champion }
app.put('/api/admin/knockout', requireAdmin, (req, res) => {
  const real = getResults();
  if (!engine.isGroupStageComplete(real.scores)) return res.status(400).json({ error: 'Primero completa los 72 resultados de grupos.' });
  const st = engine.standingsFrom(real.scores);
  const qualified = new Set(engine.computeQualifiers(real.scores).qualifiers.map(q => q.team));

  const clean = (arr, max) => Array.isArray(arr) ? [...new Set(arr.filter(t => TEAMS[t] && qualified.has(t)))].slice(0, max) : [];
  const ko = {
    reach8: clean(req.body.reach8, 16),
    reach4: clean(req.body.reach4, 8),
    reachSemi: clean(req.body.reachSemi, 4),
    reachFinal: clean(req.body.reachFinal, 2),
    champion: (TEAMS[req.body.champion] && qualified.has(req.body.champion)) ? req.body.champion : null,
  };
  // Coherencia: cada ronda debe ser subconjunto de la anterior
  const sub = (a, b) => a.every(t => b.includes(t));
  if (!sub(ko.reach4, ko.reach8) || !sub(ko.reachSemi, ko.reach4) || !sub(ko.reachFinal, ko.reachSemi) ||
      (ko.champion && !ko.reachFinal.includes(ko.champion))) {
    return res.status(400).json({ error: 'Cada ronda debe ser subconjunto de la anterior (los de cuartos deben estar entre los de octavos, etc.).' });
  }
  setResultKnockout(ko);
  res.json({ ok: true });
});

// ─── RANKING (público para usuarios autenticados) ─────────────────────────────
app.get('/api/ranking', requireAuth, (req, res) => {
  const real = getResults();
  const users = db.prepare('SELECT id, display_name FROM users WHERE is_admin = 0').all();
  const ranking = users.map(u => {
    const pred = getPrediction(u.id);
    const sc = engine.scoreUser(pred, real);
    return {
      userId: u.id, displayName: u.display_name,
      total: sc.total, groupPoints: sc.groupPoints, koPoints: sc.koPoints, championBonus: sc.championBonus,
      exactCount: sc.exactCount, correctResultCount: sc.correctResultCount,
      correctQualifiers: sc.correctQualifiers, qualifiersScored: sc.qualifiersScored,
      championHit: sc.championHit, submitted: pred.submitted,
    };
  });
  ranking.sort((a, b) => b.total - a.total || b.exactCount - a.exactCount || a.displayName.localeCompare(b.displayName));
  const playedMatches = Object.values(real.scores).filter(s => s && s.a != null).length;
  // ¿El que consulta ya envió su quiniela? (define si puede ver las de otros)
  const meSubmitted = req.session.isAdmin ? 1 : (getPrediction(req.session.userId).submitted || 0);
  res.json({ ranking, playedMatches, totalMatches: 72, groupStageComplete: engine.isGroupStageComplete(real.scores), meSubmitted, viewerIsAdmin: !!req.session.isAdmin });
});

// Ver la quiniela completa de un participante (grupos + cuadro).
// Acceso: el admin siempre; un usuario solo si YA envió la suya.
app.get('/api/participant/:id', requireAuth, (req, res) => {
  if (!req.session.isAdmin) {
    const mine = getPrediction(req.session.userId);
    if (!mine.submitted) return res.status(403).json({ error: 'Primero debes enviar tu propia quiniela para ver las de los demás.' });
  }
  const id = parseInt(req.params.id);
  const u = db.prepare('SELECT id, display_name, is_admin FROM users WHERE id = ?').get(id);
  if (!u || u.is_admin) return res.status(404).json({ error: 'Participante no encontrado.' });

  const pred = getPrediction(id);
  const st = engine.standingsFrom(pred.scores);
  const pruned = pruneInvalidPicks(st, pred.bracketPicks);
  const bb = bracket.buildBracket(st, st.qualifiedThirds, pruned.picks);
  const real = getResults();
  const sc = engine.scoreUser(pred, real);

  res.json({
    displayName: u.display_name,
    submitted: pred.submitted, submittedAt: pred.submitted_at,
    scores: pred.scores,
    allTables: st.allTables, qualifiedThirds: st.qualifiedThirds,
    matches: bb.matches, picks: pruned.picks,
    score: {
      total: sc.total, groupPoints: sc.groupPoints, koPoints: sc.koPoints, championBonus: sc.championBonus,
      exactCount: sc.exactCount, correctResultCount: sc.correctResultCount,
      correctQualifiers: sc.correctQualifiers, qualifiersScored: sc.qualifiersScored, championHit: sc.championHit,
    },
  });
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`Quiniela DHL Mundial 2026 en puerto ${PORT}`));
