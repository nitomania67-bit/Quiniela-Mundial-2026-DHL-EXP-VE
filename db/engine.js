// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE CÁLCULO — tablas, mejores terceros y puntuación.
// Esta es la lógica de la que depende el dinero. Determinista y testeada.
// ─────────────────────────────────────────────────────────────────────────────
const { GROUPS } = require('./tournament');

// Orden fijo de los grupos para desempates totalmente deterministas (último criterio).
const GROUP_ORDER = ['A','B','C','D','E','F','G','H','I','J','K','L'];

// ── Tabla de un grupo ────────────────────────────────────────────────────────
// scores: objeto { "TEAM1-TEAM2": {a,b}, ... } con los marcadores de los 6 partidos.
// Devuelve los 4 equipos ordenados con sus estadísticas (pos 1..4).
function computeGroupTable(groupCode, scores) {
  const teams = GROUPS[groupCode];
  const stats = {};
  for (const t of teams) stats[t] = { team: t, pts: 0, gf: 0, gc: 0, dg: 0, pj: 0 };

  // Recorre todos los pares del grupo
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      const t1 = teams[i], t2 = teams[j];
      const key = `${t1}-${t2}`;
      const s = scores[key];
      if (!s || s.a == null || s.b == null) continue;
      const a = Number(s.a), b = Number(s.b);
      stats[t1].gf += a; stats[t1].gc += b; stats[t1].pj++;
      stats[t2].gf += b; stats[t2].gc += a; stats[t2].pj++;
      if (a > b) { stats[t1].pts += 3; }
      else if (b > a) { stats[t2].pts += 3; }
      else { stats[t1].pts += 1; stats[t2].pts += 1; }
    }
  }
  for (const t of teams) stats[t].dg = stats[t].gf - stats[t].gc;

  const ordered = teams.map(t => stats[t]).sort((x, y) => compareTeams(x, y, scores));
  ordered.forEach((s, i) => s.pos = i + 1);
  return ordered;
}

// Comparador FIFA: pts → DG → GF → enfrentamiento directo → orden de grupo.
function compareTeams(x, y, scores) {
  if (y.pts !== x.pts) return y.pts - x.pts;
  if (y.dg !== x.dg) return y.dg - x.dg;
  if (y.gf !== x.gf) return y.gf - x.gf;
  // Enfrentamiento directo entre los dos
  const h2h = headToHead(x.team, y.team, scores);
  if (h2h !== 0) return h2h;
  // Desempate determinista final por orden alfabético de equipo (estable)
  return x.team < y.team ? -1 : 1;
}

function headToHead(t1, t2, scores) {
  const key = scores[`${t1}-${t2}`] ? `${t1}-${t2}` : `${t2}-${t1}`;
  const s = scores[key];
  if (!s || s.a == null || s.b == null) return 0;
  const [first, second] = key.split('-');
  let g1, g2; // goles de t1 y t2
  if (first === t1) { g1 = Number(s.a); g2 = Number(s.b); }
  else { g1 = Number(s.b); g2 = Number(s.a); }
  if (g1 > g2) return -1; // t1 gana → t1 va antes
  if (g2 > g1) return 1;
  return 0;
}

// ── Los 8 mejores terceros ───────────────────────────────────────────────────
// Devuelve { qualifiedThirds:[team...], allTables:{A:[...],...}, thirdsRanking:[...] }
function computeQualifiers(scores) {
  const allTables = {};
  for (const g of GROUP_ORDER) allTables[g] = computeGroupTable(g, scores);

  // Recolecta los 12 terceros con su grupo
  const thirds = GROUP_ORDER.map(g => {
    const t = allTables[g][2]; // posición 3 (índice 2)
    return { ...t, group: g };
  });

  // Ordena los terceros entre sí (mismos criterios; sin h2h porque son de grupos distintos)
  thirds.sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    if (y.dg !== x.dg) return y.dg - x.dg;
    if (y.gf !== x.gf) return y.gf - x.gf;
    // desempate determinista por orden de grupo
    return GROUP_ORDER.indexOf(x.group) - GROUP_ORDER.indexOf(y.group);
  });

  const qualifiedThirds = thirds.slice(0, 8).map(t => t.team);

  // 32 clasificados: 1° y 2° de cada grupo + 8 mejores terceros
  const qualifiers = [];
  for (const g of GROUP_ORDER) {
    qualifiers.push({ team: allTables[g][0].team, group: g, pos: 1 });
    qualifiers.push({ team: allTables[g][1].team, group: g, pos: 2 });
  }
  for (const t of qualifiedThirds) {
    const g = thirds.find(x => x.team === t).group;
    qualifiers.push({ team: t, group: g, pos: 3 });
  }

  return { allTables, thirdsRanking: thirds, qualifiedThirds, qualifiers };
}

// ── Puntuación de un partido (5/2/0) ──────────────────────────────────────────
function scoreMatch(pred, real) {
  if (!pred || pred.a == null || pred.b == null) return 0;
  if (!real || real.a == null || real.b == null) return 0;
  const pa = Number(pred.a), pb = Number(pred.b);
  const ra = Number(real.a), rb = Number(real.b);
  if (pa === ra && pb === rb) return 5;                 // marcador exacto
  const pr = pa > pb ? 1 : pa < pb ? 2 : 0;             // resultado predicho
  const rr = ra > rb ? 1 : ra < rb ? 2 : 0;             // resultado real
  if (pr === rr) return 2;                              // acierta ganador/empate
  return 0;
}

// ── Puntuación total de un participante ───────────────────────────────────────
// predScores / realScores: { "T1-T2": {a,b} }
// QUALIFIER_POINTS: puntos por cada equipo correctamente predicho como clasificado a 16avos.
const QUALIFIER_POINTS = 3;

function scoreUser(predScores, realScores) {
  let groupPoints = 0, exactCount = 0, correctResultCount = 0;
  let playedMatches = 0;

  for (const key of Object.keys(realScores)) {
    const real = realScores[key];
    if (!real || real.a == null || real.b == null) continue;
    playedMatches++;
    const pts = scoreMatch(predScores[key], real);
    groupPoints += pts;
    if (pts === 5) exactCount++;
    else if (pts === 2) correctResultCount++;
  }

  // Puntos por clasificados a 16avos (solo si la fase de grupos real está completa)
  let qualifierPoints = 0, correctQualifiers = 0, qualifiersScored = false;
  const realComplete = isGroupStageComplete(realScores);
  if (realComplete && Object.keys(predScores).length > 0) {
    qualifiersScored = true;
    const realQ = new Set(computeQualifiers(realScores).qualifiers.map(q => q.team));
    const predQ = new Set(computeQualifiers(predScores).qualifiers.map(q => q.team));
    for (const t of predQ) {
      if (realQ.has(t)) { correctQualifiers++; qualifierPoints += QUALIFIER_POINTS; }
    }
  }

  return {
    total: groupPoints + qualifierPoints,
    groupPoints,
    qualifierPoints,
    exactCount,
    correctResultCount,
    correctQualifiers,
    qualifiersScored,
    playedMatches,
  };
}

function isGroupStageComplete(scores) {
  // 72 partidos con marcador
  let count = 0;
  for (const k of Object.keys(scores)) {
    const s = scores[k];
    if (s && s.a != null && s.b != null) count++;
  }
  return count >= 72;
}

module.exports = {
  computeGroupTable,
  computeQualifiers,
  scoreMatch,
  scoreUser,
  isGroupStageComplete,
  QUALIFIER_POINTS,
  GROUP_ORDER,
};