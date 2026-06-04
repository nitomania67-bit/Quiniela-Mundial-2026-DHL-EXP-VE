const { GROUPS, buildGroupMatches } = require('../db/tournament');
const engine = require('../db/engine');

// Helper: random score
function rnd() { return Math.floor(Math.random() * 4); }

// Build a full set of 72 random scores keyed by "T1-T2"
function randomScores() {
  const scores = {};
  const matches = buildGroupMatches();
  for (const m of matches) {
    scores[`${m.team1}-${m.team2}`] = { a: rnd(), b: rnd() };
  }
  return scores;
}

// TEST 1: fixtures count
const matches = buildGroupMatches();
console.log('TEST 1 - partidos generados:', matches.length, matches.length === 72 ? 'OK' : 'FALLO');

// TEST 2: each group has exactly 6 matches and all unique pairings
let ok2 = true;
for (const g of Object.keys(GROUPS)) {
  const gm = matches.filter(m => m.group_name === g);
  if (gm.length !== 6) ok2 = false;
  const pairs = new Set(gm.map(m => [m.team1, m.team2].sort().join('-')));
  if (pairs.size !== 6) ok2 = false;
}
console.log('TEST 2 - 6 partidos únicos por grupo:', ok2 ? 'OK' : 'FALLO');

// TEST 3: standings - run 10000 random groups, verify always 4 teams, positions 1-4
let ok3 = true;
for (let i = 0; i < 2000; i++) {
  const s = randomScores();
  const q = engine.computeQualifiers(s);
  for (const g of Object.keys(GROUPS)) {
    const tbl = q.allTables[g];
    if (tbl.length !== 4) ok3 = false;
    if (tbl[0].pos !== 1 || tbl[3].pos !== 4) ok3 = false;
    // monotonic points (1st >= 4th in our order after tiebreaks)
    if (tbl[0].pts < tbl[3].pts) ok3 = false;
  }
  // Exactly 32 qualifiers, no duplicates
  if (q.qualifiers.length !== 32) ok3 = false;
  const uniq = new Set(q.qualifiers.map(x => x.team));
  if (uniq.size !== 32) ok3 = false;
  // Exactly 8 thirds
  if (q.qualifiedThirds.length !== 8) ok3 = false;
}
console.log('TEST 3 - tablas y 32 clasificados (2000 sims):', ok3 ? 'OK' : 'FALLO');

// TEST 4: scoring rules
const sm = engine.scoreMatch;
console.log('TEST 4 - exacto (2-1 vs 2-1):', sm({a:2,b:1},{a:2,b:1}) === 5 ? 'OK (5)' : 'FALLO');
console.log('TEST 4 - ganador (2-1 vs 3-0):', sm({a:2,b:1},{a:3,b:0}) === 2 ? 'OK (2)' : 'FALLO');
console.log('TEST 4 - empate exacto (1-1 vs 1-1):', sm({a:1,b:1},{a:1,b:1}) === 5 ? 'OK (5)' : 'FALLO');
console.log('TEST 4 - empate result (1-1 vs 2-2):', sm({a:1,b:1},{a:2,b:2}) === 2 ? 'OK (2)' : 'FALLO');
console.log('TEST 4 - fallo (2-1 vs 0-2):', sm({a:2,b:1},{a:0,b:2}) === 0 ? 'OK (0)' : 'FALLO');

// TEST 5: full user scoring, perfect groups prediction (sin bracket) = 360 + 128 qualifiers
const real = randomScores();
const userScore = engine.scoreUser({scores:real, bracketPicks:{}}, {scores:real, knockout:{}});
// 72 exactos * 5 = 360, + 32 clasificados * 4 = 128 => 488 (sin rondas posteriores)
console.log('TEST 5 - grupos perfectos + clasificados:', userScore.total, userScore.total === 360 + 128 ? 'OK (488)' : 'FALLO');
console.log('         exactos:', userScore.exactCount, '| clasificados correctos:', userScore.correctQualifiers);

// TEST 6: empty prediction = 0
const empty = engine.scoreUser({scores:{}, bracketPicks:{}}, {scores:real, knockout:{}});
console.log('TEST 6 - predicción vacía total:', empty.total, empty.total === 0 ? 'OK (0)' : 'FALLO');

// TEST 7: determinism - same input same output
const s7 = randomScores();
const r1 = JSON.stringify(engine.computeQualifiers(s7).qualifiers.map(q=>q.team).sort());
const r2 = JSON.stringify(engine.computeQualifiers(s7).qualifiers.map(q=>q.team).sort());
console.log('TEST 7 - determinismo:', r1 === r2 ? 'OK' : 'FALLO');

// TEST 8: REGRESIÓN — la tabla debe contar TODOS los partidos aunque la clave
// se haya guardado en orden invertido (t2-t1). Antes este bug omitía partidos
// (incluidos empates), dando puntos y PJ incorrectos.
let t8fail = 0;
for (let trial = 0; trial < 100; trial++) {
  const matches = buildGroupMatches();
  const scoresNorm = {}, scoresFlip = {};
  for (const m of matches) {
    const a = Math.floor(Math.random()*5), b = Math.floor(Math.random()*5);
    scoresNorm[`${m.team1}-${m.team2}`] = { a, b };
    // mismo resultado pero clave invertida
    scoresFlip[`${m.team2}-${m.team1}`] = { a: b, b: a };
  }
  for (const g of Object.keys(GROUPS)) {
    const tN = engine.computeGroupTable(g, scoresNorm);
    const tF = engine.computeGroupTable(g, scoresFlip);
    // cada equipo debe tener PJ=3 y los mismos puntos en ambos órdenes
    for (const row of tN) if (row.pj !== 3) t8fail++;
    const mapN = Object.fromEntries(tN.map(r=>[r.team,r.pts]));
    const mapF = Object.fromEntries(tF.map(r=>[r.team,r.pts]));
    for (const t of Object.keys(mapN)) if (mapN[t] !== mapF[t]) t8fail++;
    // suma de PJ del grupo debe ser 12
    if (tN.reduce((s,r)=>s+r.pj,0) !== 12) t8fail++;
  }
}
console.log('TEST 8 - claves en cualquier orden + PJ correcto:', t8fail === 0 ? 'OK' : `FALLO (${t8fail})`);

// TEST 9: caso real del Grupo A reportado (empates deben sumar 1 punto)
const gA = {
  'MEX-RSA': {a:4,b:3}, 'KOR-CZE': {a:3,b:5}, 'MEX-KOR': {a:35,b:6},
  'CZE-RSA': {a:4,b:4}, 'CZE-MEX': {a:3,b:3}, 'RSA-KOR': {a:1,b:2},
};
const tA = engine.computeGroupTable('A', gA);
const ptsA = Object.fromEntries(tA.map(r=>[r.team,r.pts]));
const expA = { MEX:7, CZE:5, KOR:3, RSA:1 };
const okA = Object.keys(expA).every(t=>ptsA[t]===expA[t]);
console.log('TEST 9 - Grupo A real (MEX7/CZE5/KOR3/RSA1):', okA ? 'OK' : `FALLO ${JSON.stringify(ptsA)}`);