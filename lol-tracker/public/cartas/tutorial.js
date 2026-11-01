/* Tutorial guiado: una partida siempre igual (misma semilla, mismos mazos) con pausas en las que
   el guía explica lo importante. Cada paso: st = fase (ronda*2 + 0 tienda / 1 combate), kind = 'say' (pausa con botón)
   o 'task' (se queda en pantalla hasta que haces lo pedido), hl = elemento a resaltar. */
(function (root) {
  var E = root.CartasEngine;
  var mesaN = function (s) { return s.p[0].mesa.filter(Boolean).length; };
  var handActions = function (s) { return s.p[0].hand.filter(function (h) { return !E.isTroop(h); }).length; };
  root.CARTAS_TUT = {
    seed: 48,
    deck: ['dashlight-akali', 'sech-thresh', 'javihi-koisito', 'computer-petea', 'entrenamiento', 'arenga'],
    opp: ['computer-hellbramn', 'lihone-correa', 'petea-pokemaniaco', 'computer-lihone', 'armadura', 'banquete'],
    steps: [
      { st: 2, kind: 'say', pose: 'a', text: '¡Hola! Soy tu guía. En esta partida de práctica te enseño lo básico: la <b>tienda</b>, las <b>sinergias</b>, la <b>mejora de estadísticas</b>, tu <b>vida</b> y cómo van las <b>rondas</b>. Siempre es la misma partida, así que puedes repetirla cuando quieras.<br><br>El objetivo es simple: <b>dejar la vida del rival a 0</b>.', btn: 'Empezar' },
      { st: 2, kind: 'say', pose: 'b', hl: '.hud.bottom .orb.life', text: 'Esta es <b>tu vida</b>: empiezas con <b>12</b>. No se ataca al jugador directamente: pierdes vida solo cuando <b>todas tus tropas han muerto</b> y al rival le quedan tropas por atacar (te quita tanta vida como su ataque).' },
      { st: 2, kind: 'say', pose: 'a', hl: '.hud.bottom .orb.gold', text: 'Y este es tu <b>oro</b>: empiezas con <b>10</b> y ganas <b>+2 cada ronda</b>. Se gasta en la tienda y no es lo mismo que las monedas de la tienda principal del juego.' },
      { st: 2, kind: 'say', pose: 'a', hl: '.shopwrap', text: 'Esto es la <b>tienda</b>: 5 cartas al azar <b>de tu propio mazo</b>. El número del círculo dorado es lo que cuesta. Pulsa una carta para comprarla y irá a tu mano. En la primera tienda solo salen tropas Comunes y acciones.' },
      { st: 2, kind: 'say', pose: 'b', hl: '.refwrap', text: 'El botón redondo <b>actualiza</b> la tienda por 1 de oro y te saca otras 5 cartas. En el tutorial lo dejamos desactivado para que siempre salga lo mismo.' },
      { st: 2, kind: 'task', pose: 'b', hl: '.shoprow', text: '<b>Tu turno:</b> tienes justo 10 de oro. <b>Compra las 5 cartas</b> (4 tropas y la acción «Entrenamiento»), a 2 de oro cada una.', done: function (s) { return s.p[0].hand.length + mesaN(s) >= 5; } },
      { st: 2, kind: 'say', pose: 'a', side: 'r', hl: '.synside', text: '¡Mira a la izquierda! Esas son tus <b>sinergias</b>. Cada tropa tiene 1 o 2, y cuentan las <b>cartas distintas</b> que tienes de cada una entre mesa y mano. Tienes <b>4 de Comebacker</b> (nivel 2) y <b>2 de Lol</b> (nivel 1).<br><br>Al llegar a 2, 4 o 6 cartas se activa un bonus; pasa el ratón por encima de una sinergia para ver qué hace.' },
      { st: 2, kind: 'task', pose: 'b', hl: '[data-act=endshop]', text: 'Ya está. Pulsa <b>Terminar tienda</b> para pasar a la primera ronda de combate. (Hay tienda cada 3 rondas: 1, 4, 7…)', done: function (s) { return !s.shopOpen; } },

      { st: 5, kind: 'say', pose: 'a', hl: '.row4.side0', text: '¡Primera <b>ronda de combate</b>! Esta es tu <b>mesa</b>: tienes <b>4 huecos</b> para tus tropas. Abajo está tu mano. Solo las tropas de la mesa luchan.' },
      { st: 5, kind: 'task', pose: 'b', hl: '.handwrap', text: '<b>Coloca las 4 tropas en la mesa</b>: pulsa una carta de tu mano y luego un hueco libre (también puedes arrastrarla).', done: function (s) { return mesaN(s) >= 4; } },
      { st: 5, kind: 'task', pose: 'b', hl: '.hand', text: 'Ahora la acción <b>Entrenamiento</b>: púlsala en tu mano y después la tropa aliada que quieras mejorar. Da <b>+3 de ataque permanente</b>: así se mejoran las estadísticas. Las sinergias también hacen crecer a tus tropas durante la partida.', done: function (s) { return handActions(s) === 0; } },
      { st: 5, kind: 'say', pose: 'b', hl: '.row4.side1', text: 'Arriba están las tropas del <b>rival</b>. Debes <b>elegir un objetivo para cada una de tus tropas</b>: pulsa una tropa tuya y luego la rival a la que atacará. Cada tropa ataca <b>una vez por ronda</b>, alternando bandos de izquierda a derecha.' },
      { st: 5, kind: 'task', pose: 'b', hl: '[data-act=fight]', text: 'Cuando todas tengan objetivo, pulsa <b>¡Combatir!</b> y mira el combate.', done: function (s, ui) { return ui.playing || s.phase !== 'prep'; } },

      { st: 7, kind: 'say', pose: 'a', hl: '.row4.side0', text: '¡Primer combate hecho! Fíjate en tus tropas: ahora tienen <b>más ataque</b> que cuando las compraste. Esa es la <b>mejora de estadísticas</b>: Entrenamiento y las sinergias (Comebacker y Lol) dan bonus <b>permanentes</b>. Pero ojo: las tropas <b>no se curan entre rondas</b>, el daño se acumula.' },
      { st: 7, kind: 'say', pose: 'a', hl: '.hud.top .orb.life', text: 'Arriba está la <b>vida del rival</b>. Si un bando se queda sin tropas y al otro le sobran, ese bando <b>pierde vida</b> igual al ataque de las tropas que quedan. (En el tutorial el rival tiene 40 de vida para que la práctica dure más.) Ya has visto cómo funciona una ronda: <b>preparar → elegir objetivos → combatir</b>.' },
      { st: 7, kind: 'task', pose: 'b', hl: '[data-act=fight]', text: 'Repite: coloca tropas si hay hueco, elige objetivos y pulsa <b>¡Combatir!</b> otra vez.', done: function (s, ui) { return ui.playing || s.phase !== 'prep'; } },

      { st: 8, kind: 'say', pose: 'a', hl: '.shopwrap', text: '¡Otra <b>tienda</b>! Llega <b>cada 3 rondas</b> y esa ronda no hay combate. Compra con tu oro, coloca y vende cartas. Con cada tienda salen <b>más cartas raras, épicas y legendarias</b>.' },
      { st: 8, kind: 'say', pose: 'a', hl: '.shopwrap', text: 'Un truco: si juntas <b>3 copias iguales</b> de una tropa (entre mesa y mano) se <b>fusionan</b> en una con las estadísticas duplicadas (★2), y con 3 cartas ★2 llegas a ★3. En la tienda las cartas que completan una fusión brillan.' },
      { st: 8, kind: 'say', pose: 'a', fin: true, text: '¡Eso es todo, ya sabes jugar! Ahora arma tu mazo, <b>sube en la clasificación</b> y demuestra de qué eres capaz. ¡Suerte en la arena!', btn: 'Terminar tutorial' }
    ],
    over: 'La partida de práctica ha terminado. ¡Ya conoces lo esencial! Ahora arma tu mazo y <b>sube en la clasificación</b>.'
  };
})(window);
