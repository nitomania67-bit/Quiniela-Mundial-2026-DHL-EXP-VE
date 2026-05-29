// ─────────────────────────────────────────────────────────────────────────────
// MOTOR DE CÁLCULO — tablas, mejores terceros y puntuación.
// Esta es la lógica de la que depende el dinero. Determinista y testeada.
// ─────────────────────────────────────────────────────────────────────────────
const { GROUPS } = require('./tournament');
const bracket = require('./bracket');

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

// Devuelve { winners:{A:team}, runners:{A:team}, qualifiedThirds:[...] } desde scores.
function standingsFrom(scores) {
  const q = computeQualifiers(scores);
  const winners = {}, runners = {};
  for (const g of GROUP_ORDER) { winners[g] = q.allTables[g][0].team; runners[g] = q.allTables[g][1].team; }
  return { winners, runners, qualifiedThirds: q.qualifiedThirds, allTables: q.allTables };
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

// ── Puntuación de eliminatorias (por equipos que avanzan a cada ronda) ────────
// Multiplicadores: 16avos/8avos/4tos ×2, semis/final ×3 (base 2 por equipo).
// + bonus por campeón. Editable aquí.
const KO_POINTS = {
  qualify16: 4,   // clasifica a 16avos (32 equipos)  base2 ×2
  reach8:    4,   // llega a octavos    (16)          base2 ×2
  reach4:    4,   // llega a cuartos    (8)           base2 ×2
  reachSemi: 6,   // llega a semifinales(4)           base2 ×3
  reachFinal:6,   // llega a final      (2)           base2 ×3
};
const CHAMPION_BONUS = 15;

function setIntersectCount(predArr, realSet) {
  let n = 0; const seen = new Set();
  for (const t of predArr) { if (t && !seen.has(t) && realSet.has(t)) { n++; seen.add(t); } }
  return n;
}

// ── Puntuación total de un participante ───────────────────────────────────────
// pred: { scores:{...}, bracketPicks:{...} }
// real: { scores:{...}, knockout:{reach8,reach4,reachSemi,reachFinal,champion} }
function scoreUser(pred, real) {
  const predScores = pred.scores || {};
  const realScores = real.scores || {};
  const realKO = real.knockout || {};

  let groupPoints = 0, exactCount = 0, correctResultCount = 0, playedMatches = 0;
  for (const key of Object.keys(realScores)) {
    const r = realScores[key];
    if (!r || r.a == null || r.b == null) continue;
    playedMatches++;
    const pts = scoreMatch(predScores[key], r);
    groupPoints += pts;
    if (pts === 5) exactCount++;
    else if (pts === 2) correctResultCount++;
  }

  // ── Eliminatorias ──
  let koPoints = 0, championBonus = 0, correctQualifiers = 0;
  const detail = { reach8: 0, reach4: 0, reachSemi: 0, reachFinal: 0 };
  const realComplete = isGroupStageComplete(realScores);

  // 16avos (clasificados): se otorgan cuando la fase de grupos real está completa
  let qualifiersScored = false;
  if (realComplete && Object.keys(predScores).length > 0) {
    qualifiersScored = true;
    const realQ = new Set(computeQualifiers(realScores).qualifiers.map(q => q.team));
    const predQ = computeQualifiers(predScores).qualifiers.map(q => q.team);
    correctQualifiers = setIntersectCount(predQ, realQ);
    koPoints += correctQualifiers * KO_POINTS.qualify16;
  }

  // Rondas posteriores: requieren picks del usuario y el conjunto real de cada ronda.
  const picks = pred.bracketPicks || {};
  const userSets = bracket.deriveSets(picks);
  function roundScore(predArr, realArr, perTeam) {
    if (!Array.isArray(realArr) || realArr.length === 0) return 0;
    const rset = new Set(realArr);
    return setIntersectCount(predArr, rset) * perTeam;
  }
  detail.reach8    = roundScore(userSets.reach8,    realKO.reach8,    KO_POINTS.reach8);
  detail.reach4    = roundScore(userSets.reach4,    realKO.reach4,    KO_POINTS.reach4);
  detail.reachSemi = roundScore(userSets.reachSemi, realKO.reachSemi, KO_POINTS.reachSemi);
  detail.reachFinal= roundScore(userSets.reachFinal,realKO.reachFinal,KO_POINTS.reachFinal);
  koPoints += detail.reach8 + detail.reach4 + detail.reachSemi + detail.reachFinal;

  if (realKO.champion && userSets.champion && userSets.champion === realKO.champion) {
    championBonus = CHAMPION_BONUS;
  }

  return {
    total: groupPoints + koPoints + championBonus,
    groupPoints, koPoints, championBonus,
    exactCount, correctResultCount, correctQualifiers, qualifiersScored,
    koDetail: detail, championHit: championBonus > 0,
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
  standingsFrom,
  scoreMatch,
  scoreUser,
  isGroupStageComplete,
  KO_POINTS,
  CHAMPION_BONUS,
  GROUP_ORDER,
};