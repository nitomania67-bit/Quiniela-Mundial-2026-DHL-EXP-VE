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
      // El marcador pudo guardarse como "t1-t2" o "t2-t1": buscar ambos órdenes.
      const directKey = `${t1}-${t2}`, reverseKey = `${t2}-${t1}`;
      let a, b; // goles de t1 y t2 respectivamente
      if (scores[directKey] && scores[directKey].a != null && scores[directKey].b != null) {
        a = Number(scores[directKey].a); b = Number(scores[directKey].b);
      } else if (scores[reverseKey] && scores[reverseKey].a != null && scores[reverseKey].b != null) {
        // Guardado al revés: a=goles de t2, b=goles de t1 → invertir
        a = Number(scores[reverseKey].b); b = Number(scores[reverseKey].a);
      } else {
        continue; // partido sin cargar
      }
      stats[t1].gf += a; stats[t1].gc += b; stats[t1].pj++;
      stats[t2].gf += b; stats[t2].gc += a; stats[t2].pj++;
      if (a > b) { stats[t1].pts += 3; }
      else if (b > a) { stats[t2].pts += 3; }
      else { stats[t1].pts += 1; stats[t2].pts += 1; }
    }
  }
  for (const t of teams) stats[t].dg = stats[t].gf - stats[t].gc;

  const ordered = orderGroup(teams.map(t => stats[t]), scores);
  ordered.forEach((s, i) => s.pos = i + 1);
  return ordered;
}

// ── Ordenamiento de un grupo con los desempates OFICIALES FIFA 2026 ───────────
// Orden: 1) Puntos. Entre los EMPATADOS en puntos se aplica un "mini-grupo" solo
// con los partidos entre ellos: 2) puntos h2h, 3) DG h2h, 4) GF h2h. Si aún hay
// empate, criterios generales: 5) DG total, 6) GF total. Último recurso
// determinista: orden alfabético del código (estable).
// (FIFA 2026 invirtió el orden: el enfrentamiento directo va ANTES que la DG general.)
function orderGroup(rows, scores) {
  // Agrupa por puntos
  const byPts = {};
  for (const r of rows) (byPts[r.pts] = byPts[r.pts] || []).push(r);
  const result = [];
  // Puntos de mayor a menor
  for (const pts of Object.keys(byPts).map(Number).sort((a, b) => b - a)) {
    const tied = byPts[pts];
    if (tied.length === 1) { result.push(tied[0]); continue; }
    // Mini-grupo entre los empatados
    const h2h = miniTable(tied.map(r => r.team), scores);
    tied.sort((x, y) => {
      const hx = h2h[x.team], hy = h2h[y.team];
      if (hy.pts !== hx.pts) return hy.pts - hx.pts;   // h2h puntos
      if (hy.dg !== hx.dg) return hy.dg - hx.dg;       // h2h diferencia de gol
      if (hy.gf !== hx.gf) return hy.gf - hx.gf;       // h2h goles a favor
      if (y.dg !== x.dg) return y.dg - x.dg;           // DG total
      if (y.gf !== x.gf) return y.gf - x.gf;           // GF total
      return x.team < y.team ? -1 : 1;                 // desempate determinista
    });
    for (const r of tied) result.push(r);
  }
  return result;
}

// Mini-tabla considerando SOLO los partidos entre los equipos dados.
function miniTable(teamList, scores) {
  const set = new Set(teamList);
  const m = {};
  for (const t of teamList) m[t] = { pts: 0, gf: 0, gc: 0 };
  for (const t1 of teamList) {
    for (const t2 of teamList) {
      if (t1 >= t2) continue; // cada par una vez
      const r = readMatch(t1, t2, scores);
      if (!r) continue;
      const { a, b } = r; // a = goles t1, b = goles t2
      m[t1].gf += a; m[t1].gc += b;
      m[t2].gf += b; m[t2].gc += a;
      if (a > b) m[t1].pts += 3;
      else if (b > a) m[t2].pts += 3;
      else { m[t1].pts += 1; m[t2].pts += 1; }
    }
  }
  for (const t of teamList) m[t].dg = m[t].gf - m[t].gc;
  return m;
}

// Lee el marcador entre t1 y t2 buscando la clave en ambos órdenes.
// Devuelve { a, b } con a=goles de t1, b=goles de t2, o null si no existe.
function readMatch(t1, t2, scores) {
  const d = scores[`${t1}-${t2}`];
  if (d && d.a != null && d.b != null) return { a: Number(d.a), b: Number(d.b) };
  const r = scores[`${t2}-${t1}`];
  if (r && r.a != null && r.b != null) return { a: Number(r.b), b: Number(r.a) };
  return null;
}

function headToHead(t1, t2, scores) {
  const r = readMatch(t1, t2, scores);
  if (!r) return 0;
  if (r.a > r.b) return -1; // gana t1 → va antes
  if (r.b > r.a) return 1;
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
