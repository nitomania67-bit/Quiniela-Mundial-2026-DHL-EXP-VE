// ─────────────────────────────────────────────────────────────────────────────
// ESTRUCTURA OFICIAL DEL CUADRO ELIMINATORIO — Mundial 2026 (partidos 73–104).
// Fuente: estructura FIFA de dieciseisavos a final.
// El usuario elige ganadores ronda por ronda; la puntuación es por equipos que
// avanzan a cada ronda (conjuntos), por lo que la colocación de los terceros es
// determinista e ilustrativa y NO afecta los puntos.
// ─────────────────────────────────────────────────────────────────────────────
const { GROUPS } = require('./tournament');

// Mapa equipo -> grupo
const TEAM_GROUP = {};
for (const [g, teams] of Object.entries(GROUPS)) for (const t of teams) TEAM_GROUP[t] = g;

// Dieciseisavos (R32): slot '1X'/'2X' = 1°/2° del grupo X; 'T' = un mejor tercero.
const R32 = {
  73: ['2A', '2B'], 75: ['1F', '2C'], 76: ['1C', '2F'], 78: ['2E', '2I'],
  83: ['2K', '2L'], 84: ['1H', '2J'], 86: ['1J', '2H'], 88: ['2D', '2G'],
  79: ['1A', 'T'],  85: ['1B', 'T'],  81: ['1D', 'T'],  74: ['1E', 'T'],
  82: ['1G', 'T'],  77: ['1I', 'T'],  87: ['1K', 'T'],  80: ['1L', 'T'],
};
// Grupo del ganador en cada llave que enfrenta a un tercero (para no repetir grupo)
const THIRD_SLOT_WINNER_GROUP = { 79:'A', 85:'B', 81:'D', 74:'E', 82:'G', 77:'I', 87:'K', 80:'L' };
const THIRD_SLOT_ORDER = [79, 85, 81, 74, 82, 77, 87, 80];

// Restricciones OFICIALES FIFA (Annex C): qué grupo-tercero puede ir a cada llave.
// Cada ganador solo puede enfrentar al tercero de uno de estos grupos.
const THIRD_SLOT_ALLOWED = {
  74: ['A','B','C','D','F'], // 1E
  77: ['C','D','F','G','H'], // 1I
  79: ['C','E','F','H','I'], // 1A
  80: ['E','H','I','J','K'], // 1L
  81: ['B','E','F','I','J'], // 1D
  82: ['A','E','H','I','J'], // 1G
  85: ['E','F','G','I','J'], // 1B
  87: ['D','E','I','J','L'], // 1K
};

// Rondas siguientes: 'W##' = ganador del partido ##, 'L##' = perdedor.
const FEEDS = {
  89: ['W74','W77'], 90: ['W73','W75'], 91: ['W76','W78'], 92: ['W79','W80'],
  93: ['W83','W84'], 94: ['W81','W82'], 95: ['W86','W88'], 96: ['W85','W87'],
  97: ['W89','W90'], 98: ['W93','W94'], 99: ['W91','W92'], 100: ['W95','W96'],
  101: ['W97','W98'], 102: ['W99','W100'],
  103: ['L101','L102'], // tercer puesto
  104: ['W101','W102'], // final
};

const ROUNDS = {
  R32:  [73,74,75,76,77,78,79,80,81,82,83,84,85,86,87,88],
  R16:  [89,90,91,92,93,94,95,96],
  QF:   [97,98,99,100],
  SF:   [101,102],
  THIRD:[103],
  FINAL:[104],
};
const ROUND_OF = {};
for (const [r, ids] of Object.entries(ROUNDS)) for (const id of ids) ROUND_OF[id] = r;

const ROUND_LABEL = { R32:'Dieciseisavos', R16:'Octavos', QF:'Cuartos', SF:'Semifinales', THIRD:'Tercer puesto', FINAL:'Final' };

// Asigna los 8 mejores terceros a las 8 llaves respetando las restricciones
// OFICIALES FIFA (Annex C): cada llave solo admite terceros de ciertos grupos.
// Backtracking: encuentra una asignación válida (única en casi todos los casos).
function assignThirds(qualifiedThirds) {
  const slots = THIRD_SLOT_ORDER;
  const used = new Array(qualifiedThirds.length).fill(false);
  const result = {};
  // Heurística para velocidad/estabilidad: procesar primero las llaves cuyo
  // conjunto de terceros candidatos disponibles sea más pequeño (más restringidas).
  function bt(placed) {
    if (placed === slots.length) return true;
    // elige el slot no asignado con menos candidatos válidos
    let bestSlot = null, bestCands = null;
    for (const slotId of slots) {
      if (result[slotId] !== undefined) continue;
      const allowed = THIRD_SLOT_ALLOWED[slotId];
      const cands = [];
      for (let k = 0; k < qualifiedThirds.length; k++) {
        if (used[k]) continue;
        if (allowed.includes(TEAM_GROUP[qualifiedThirds[k]])) cands.push(k);
      }
      if (bestCands === null || cands.length < bestCands.length) { bestSlot = slotId; bestCands = cands; }
    }
    if (bestCands.length === 0) return false; // sin candidatos → retroceder
    for (const k of bestCands) {
      used[k] = true; result[bestSlot] = qualifiedThirds[k];
      if (bt(placed + 1)) return true;
      used[k] = false; delete result[bestSlot];
    }
    return false;
  }
  if (!bt(0)) {
    // Fallback defensivo: respeta al menos "no mismo grupo" si Annex C fallara
    const r2 = {}; const u2 = new Array(qualifiedThirds.length).fill(false);
    function bt2(i) {
      if (i === slots.length) return true;
      const wG = THIRD_SLOT_WINNER_GROUP[slots[i]];
      for (let k = 0; k < qualifiedThirds.length; k++) {
        if (u2[k] || TEAM_GROUP[qualifiedThirds[k]] === wG) continue;
        u2[k] = true; r2[slots[i]] = qualifiedThirds[k];
        if (bt2(i + 1)) return true;
        u2[k] = false; delete r2[slots[i]];
      }
      return false;
    }
    if (bt2(0)) return r2;
    slots.forEach((s, i) => { r2[s] = qualifiedThirds[i] || null; });
    return r2;
  }
  return result;
}

function resolveSlot(slot, standings, thirdAssign, slotId) {
  if (slot === 'T') return thirdAssign[slotId] || null;
  const pos = slot[0], g = slot[1];
  if (pos === '1') return standings.winners[g] || null;
  if (pos === '2') return standings.runners[g] || null;
  return null;
}

// standings: { winners:{A:team..}, runners:{A:team..} }, qualifiedThirds:[8]
// picks: { matchId: team } (ganador elegido)
// Devuelve { matches:{id:{round,team1,team2}}, thirdAssign }
function buildBracket(standings, qualifiedThirds, picks = {}) {
  const thirdAssign = assignThirds(qualifiedThirds || []);
  const matches = {};

  // R32 desde standings
  for (const id of ROUNDS.R32) {
    const [s1, s2] = R32[id];
    matches[id] = {
      round: 'R32',
      team1: resolveSlot(s1, standings, thirdAssign, id),
      team2: resolveSlot(s2, standings, thirdAssign, id),
    };
  }

  // Rondas siguientes en orden ascendente (los feeds referencian ids menores)
  const laterIds = [...ROUNDS.R16, ...ROUNDS.QF, ...ROUNDS.SF, ...ROUNDS.THIRD, ...ROUNDS.FINAL];
  for (const id of laterIds) {
    const [a, b] = FEEDS[id];
    matches[id] = { round: ROUND_OF[id], team1: resolveFeed(a, matches, picks), team2: resolveFeed(b, matches, picks) };
  }
  return { matches, thirdAssign };
}

function resolveFeed(token, matches, picks) {
  const kind = token[0];
  const id = parseInt(token.slice(1));
  if (kind === 'W') return picks[id] || null;
  if (kind === 'L') {
    const m = matches[id];
    const w = picks[id];
    if (!m || !w || !m.team1 || !m.team2) return null;
    return m.team1 === w ? m.team2 : m.team1;
  }
  return null;
}

// Conjuntos de equipos que avanzan a cada ronda según los picks.
function deriveSets(picks) {
  const pick = ids => ids.map(id => picks[id]).filter(Boolean);
  return {
    reach8: pick(ROUNDS.R32),    // ganan 16avos → llegan a octavos (16)
    reach4: pick(ROUNDS.R16),    // → cuartos (8)
    reachSemi: pick(ROUNDS.QF),  // → semis (4)
    reachFinal: pick(ROUNDS.SF), // → final (2)
    champion: picks[104] || null,
  };
}

// ¿El usuario completó todas las elecciones requeridas? (103 tercer puesto es opcional)
function bracketComplete(picks) {
  const required = [...ROUNDS.R32, ...ROUNDS.R16, ...ROUNDS.QF, ...ROUNDS.SF, ...ROUNDS.FINAL];
  return required.every(id => !!picks[id]);
}

module.exports = {
  R32, FEEDS, ROUNDS, ROUND_OF, ROUND_LABEL, TEAM_GROUP,
  THIRD_SLOT_WINNER_GROUP, THIRD_SLOT_ORDER, THIRD_SLOT_ALLOWED,
  buildBracket, deriveSets, bracketComplete, assignThirds,
};
