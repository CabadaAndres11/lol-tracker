/* Misiones y cajas. Compartido por el servidor (progreso y recompensas) y el navegador (textos). */
(function (root) {
  // stat: contador que se compara con goal. Cada misión entrega una caja, una sola vez.
  var MISSIONS = [
    { id: 'g3', stat: 'games', goal: 3, t: 'Calentando motores', d: 'Juega 3 partidas.' },
    { id: 'g10', stat: 'games', goal: 10, t: 'Jugador habitual', d: 'Juega 10 partidas.' },
    { id: 'g25', stat: 'games', goal: 25, t: 'Mesa fija', d: 'Juega 25 partidas.' },
    { id: 'g60', stat: 'games', goal: 60, t: 'Veterano', d: 'Juega 60 partidas.' },
    { id: 'w3', stat: 'wins', goal: 3, t: 'Primeras victorias', d: 'Gana 3 partidas.' },
    { id: 'w10', stat: 'wins', goal: 10, t: 'Cada vez mejor', d: 'Gana 10 partidas.' },
    { id: 'w25', stat: 'wins', goal: 25, t: 'Imparable', d: 'Gana 25 partidas.' },
    { id: 's3', stat: 'streak', goal: 3, t: 'En racha', d: 'Gana 3 partidas seguidas.' },
    { id: 's5', stat: 'streak', goal: 5, t: 'Racha legendaria', d: 'Gana 5 partidas seguidas.' },
    { id: 'c40', stat: 'cards', goal: 40, t: 'Manos a la obra', d: 'Usa 40 cartas en partida (tropas y acciones).' },
    { id: 'c150', stat: 'cards', goal: 150, t: 'Mazo gastado', d: 'Usa 150 cartas en partida.' },
    { id: 'rev3', stat: 'revive', goal: 3, t: 'De entre los muertos', d: 'Juega 3 partidas en modo Resurrección.' },
    { id: 'mp3', stat: 'mp', goal: 3, t: 'Cara a cara', d: 'Juega 3 partidas 1 contra 1 con otros jugadores.' },
    { id: 'v42', stat: 'v4', goal: 2, t: 'Mesa de cuatro', d: 'Juega 2 partidas de Versus de 4.' },
    { id: 'lv1', stat: 'lv3', goal: 1, t: 'Subida de nivel', d: 'Consigue una carta a nivel 3 (4 copias).' },
    { id: 'lv3', stat: 'lv3', goal: 3, t: 'Élite', d: 'Consigue 3 cartas a nivel 3.' },
    { id: 'col25', stat: 'owned', goal: 25, t: 'Coleccionista', d: 'Desbloquea 25 cartas.' },
    { id: 'col45', stat: 'owned', goal: 45, t: 'Gran colección', d: 'Desbloquea 45 cartas.' },
    { id: 'pk1', stat: 'packs', goal: 1, t: 'Primer sobre', d: 'Abre un sobre.' },
    { id: 'pk10', stat: 'packs', goal: 10, t: 'Cazador de sobres', d: 'Abre 10 sobres.' },
    { id: 'sk1', stat: 'skins', goal: 1, t: 'Cambio de look', d: 'Consigue una skin.' },
    { id: 'fx1', stat: 'fx', goal: 1, t: 'Con estilo', d: 'Consigue un efecto (despliegue, funda o victoria y derrota).' }
  ];
  // Una caja por cada rango alcanzado, a partir de Bronce (puntos mínimos de la clasificación).
  var RANK_BOXES = [
    { id: 'bronce', n: 'Bronce', min: 60 }, { id: 'plata', n: 'Plata', min: 140 }, { id: 'oro', n: 'Oro', min: 240 },
    { id: 'platino', n: 'Platino', min: 360 }, { id: 'esmeralda', n: 'Esmeralda', min: 500 }, { id: 'diamante', n: 'Diamante', min: 680 },
    { id: 'maestro', n: 'Maestro', min: 900 }, { id: 'aspirante', n: 'Aspirante', min: 1200 }
  ];
  var API = { MISSIONS: MISSIONS, RANK_BOXES: RANK_BOXES };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CARTAS_MISSIONS = API;
})(typeof window !== 'undefined' ? window : globalThis);
