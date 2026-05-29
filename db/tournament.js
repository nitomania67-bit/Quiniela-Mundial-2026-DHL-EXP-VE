// ─────────────────────────────────────────────────────────────────────────────
// DATOS OFICIALES DEL MUNDIAL 2026
// Sorteo del 5 de diciembre de 2025 (Kennedy Center, Washington D.C.)
// Repechajes resueltos en marzo/abril 2026.
// Formato: 12 grupos de 4. Clasifican 1° y 2° de cada grupo + 8 mejores terceros.
// ─────────────────────────────────────────────────────────────────────────────

// code = ISO-ish corto para mostrar; flag = emoji bandera
const TEAMS = {
  // Grupo A
  MEX: { name: 'México', flag: '🇲🇽' }, RSA: { name: 'Sudáfrica', flag: '🇿🇦' },
  KOR: { name: 'Corea del Sur', flag: '🇰🇷' }, CZE: { name: 'Rep. Checa', flag: '🇨🇿' },
  // Grupo B
  CAN: { name: 'Canadá', flag: '🇨🇦' }, SUI: { name: 'Suiza', flag: '🇨🇭' },
  QAT: { name: 'Qatar', flag: '🇶🇦' }, BIH: { name: 'Bosnia', flag: '🇧🇦' },
  // Grupo C
  BRA: { name: 'Brasil', flag: '🇧🇷' }, MAR: { name: 'Marruecos', flag: '🇲🇦' },
  SCO: { name: 'Escocia', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' }, HAI: { name: 'Haití', flag: '🇭🇹' },
  // Grupo D
  USA: { name: 'Estados Unidos', flag: '🇺🇸' }, PAR: { name: 'Paraguay', flag: '🇵🇾' },
  AUS: { name: 'Australia', flag: '🇦🇺' }, TUR: { name: 'Turquía', flag: '🇹🇷' },
  // Grupo E
  GER: { name: 'Alemania', flag: '🇩🇪' }, ECU: { name: 'Ecuador', flag: '🇪🇨' },
  CIV: { name: 'Costa de Marfil', flag: '🇨🇮' }, CUW: { name: 'Curazao', flag: '🇨🇼' },
  // Grupo F
  NED: { name: 'Países Bajos', flag: '🇳🇱' }, JPN: { name: 'Japón', flag: '🇯🇵' },
  TUN: { name: 'Túnez', flag: '🇹🇳' }, SWE: { name: 'Suecia', flag: '🇸🇪' },
  // Grupo G
  BEL: { name: 'Bélgica', flag: '🇧🇪' }, EGY: { name: 'Egipto', flag: '🇪🇬' },
  IRN: { name: 'Irán', flag: '🇮🇷' }, NZL: { name: 'Nueva Zelanda', flag: '🇳🇿' },
  // Grupo H
  ESP: { name: 'España', flag: '🇪🇸' }, URU: { name: 'Uruguay', flag: '🇺🇾' },
  KSA: { name: 'Arabia Saudí', flag: '🇸🇦' }, CPV: { name: 'Cabo Verde', flag: '🇨🇻' },
  // Grupo I
  FRA: { name: 'Francia', flag: '🇫🇷' }, SEN: { name: 'Senegal', flag: '🇸🇳' },
  NOR: { name: 'Noruega', flag: '🇳🇴' }, IRQ: { name: 'Irak', flag: '🇮🇶' },
  // Grupo J
  ARG: { name: 'Argentina', flag: '🇦🇷' }, AUT: { name: 'Austria', flag: '🇦🇹' },
  ALG: { name: 'Argelia', flag: '🇩🇿' }, JOR: { name: 'Jordania', flag: '🇯🇴' },
  // Grupo K
  POR: { name: 'Portugal', flag: '🇵🇹' }, COL: { name: 'Colombia', flag: '🇨🇴' },
  UZB: { name: 'Uzbekistán', flag: '🇺🇿' }, COD: { name: 'RD Congo', flag: '🇨🇩' },
  // Grupo L
  ENG: { name: 'Inglaterra', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' }, CRO: { name: 'Croacia', flag: '🇭🇷' },
  GHA: { name: 'Ghana', flag: '🇬🇭' }, PAN: { name: 'Panamá', flag: '🇵🇦' },
};

const GROUPS = {
  A: ['MEX', 'RSA', 'KOR', 'CZE'],
  B: ['CAN', 'SUI', 'QAT', 'BIH'],
  C: ['BRA', 'MAR', 'SCO', 'HAI'],
  D: ['USA', 'PAR', 'AUS', 'TUR'],
  E: ['GER', 'ECU', 'CIV', 'CUW'],
  F: ['NED', 'JPN', 'TUN', 'SWE'],
  G: ['BEL', 'EGY', 'IRN', 'NZL'],
  H: ['ESP', 'URU', 'KSA', 'CPV'],
  I: ['FRA', 'SEN', 'NOR', 'IRQ'],
  J: ['ARG', 'AUT', 'ALG', 'JOR'],
  K: ['POR', 'COL', 'UZB', 'COD'],
  L: ['ENG', 'CRO', 'GHA', 'PAN'],
};

// Orden de partidos round-robin dentro de un grupo (índices de los 4 equipos).
// Patrón FIFA estándar de 6 partidos por grupo.
const RR_ORDER = [
  [0, 1], [2, 3],   // Jornada 1
  [0, 2], [3, 1],   // Jornada 2 (1° vs 3°, 4° vs 2°)
  [3, 0], [1, 2],   // Jornada 3
];

// Genera los 72 partidos de fase de grupos de forma determinista.
function buildGroupMatches() {
  const matches = [];
  let order = 0;
  for (const [g, teams] of Object.entries(GROUPS)) {
    let jornada = 0;
    RR_ORDER.forEach((pair, idx) => {
      if (idx % 2 === 0) jornada++;
      matches.push({
        group_name: g,
        jornada,
        team1: teams[pair[0]],
        team2: teams[pair[1]],
        order: order++,
      });
    });
  }
  return matches; // 12 grupos * 6 = 72
}

module.exports = { TEAMS, GROUPS, buildGroupMatches, RR_ORDER };