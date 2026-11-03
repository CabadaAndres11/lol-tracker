/* Temporada y pase de batalla. Compartido por el servidor (progreso y recompensas) y el navegador (textos).
 * Cada misión de temporada da XP; cada nivel del pase se desbloquea con XP y entrega su recompensa.
 * ATENCIÓN: las misiones y recompensas de abajo son DE PRUEBA, se definirán más adelante. Para una temporada nueva
 * cambia el `id` (el progreso de cada cuenta empieza de cero al cambiar de temporada).
 *   stat: games | wins | bestStreak | cards | revive | rumble | mp | v4 | packs   (se cuentan desde que empieza la temporada)
 *   reward: { kind: 'coins', n } | { kind: 'box', n } | { kind: 'card', id } | { kind: 'skin', id } | { kind: 'fx', id } */
(function (root) {
  var MISSIONS = [
    { id: 'g3', stat: 'games', goal: 3, xp: 30, t: 'Primeros pasos', d: 'Juega 3 partidas.' },
    { id: 'g10', stat: 'games', goal: 10, xp: 60, t: 'Constancia', d: 'Juega 10 partidas.' },
    { id: 'g25', stat: 'games', goal: 25, xp: 100, t: 'Sin descanso', d: 'Juega 25 partidas.' },
    { id: 'w3', stat: 'wins', goal: 3, xp: 40, t: 'A por todas', d: 'Gana 3 partidas.' },
    { id: 'w10', stat: 'wins', goal: 10, xp: 80, t: 'Dominio', d: 'Gana 10 partidas.' },
    { id: 'w25', stat: 'wins', goal: 25, xp: 120, t: 'Campeón de temporada', d: 'Gana 25 partidas.' },
    { id: 's3', stat: 'bestStreak', goal: 3, xp: 60, t: 'Racha de temporada', d: 'Gana 3 partidas seguidas.' },
    { id: 'c100', stat: 'cards', goal: 100, xp: 60, t: 'Mazo en movimiento', d: 'Usa 100 cartas en partida.' },
    { id: 'rev3', stat: 'revive', goal: 3, xp: 50, t: 'Resurrecciones', d: 'Juega 3 partidas en modo Resurrección o Royal Rumble.' },
    { id: 'rr2', stat: 'rumble', goal: 2, xp: 50, t: 'Royal Rumble', d: 'Juega 2 partidas de Royal Rumble.' },
    { id: 'mp3', stat: 'mp', goal: 3, xp: 70, t: 'Duelista', d: 'Juega 3 partidas 1 contra 1 con otros jugadores.' },
    { id: 'v43', stat: 'v4', goal: 3, xp: 70, t: 'Mesa de cuatro', d: 'Juega 3 partidas de Versus de 4.' },
    { id: 'pk3', stat: 'packs', goal: 3, xp: 40, t: 'Abriendo sobres', d: 'Abre 3 sobres.' },
    { id: 'pk10', stat: 'packs', goal: 10, xp: 80, t: 'Cazador de sobres', d: 'Abre 10 sobres.' }
  ];
  var LEVELS = [], i;
  for (i = 1; i <= 20; i++) LEVELS.push({ lv: i, reward: i % 5 === 0 ? { kind: 'box', n: 1 } : { kind: 'coins', n: 20 + i * 2 } });
  var SEASON = { id: 't1', name: 'Temporada 1', end: null, xpPerLevel: 45, levels: LEVELS, missions: MISSIONS };
  function levelOf(xp) { return Math.min(SEASON.levels.length, Math.floor(Math.max(0, xp) / SEASON.xpPerLevel)); }
  var API = { SEASON: SEASON, levelOf: levelOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CARTAS_SEASON = API;
})(typeof window !== 'undefined' ? window : globalThis);
