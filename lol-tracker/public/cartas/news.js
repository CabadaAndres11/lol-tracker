/* Parches y noticias. Añade las nuevas AL PRINCIPIO (la más reciente primero). */
(function (root) {
  var NEWS = [
    { date: '2026-11-09', tag: 'Novedad', title: '¡Ya está aquí la versión 2.2! K-Pop, Fantasía y Destino', art: ['aitorlg-singer', 'sech', 'chipy-goku'], gacha: true,
      items: [
        'Versión 2.2: dos sinergias nuevas, un gacha y mucho más. Al entrar verás un pop-up animado con todas las novedades (puedes desactivarlo o volver a verlo desde tu perfil).',
        'Sinergias: K-Pop (KDA, True Damage, Huntrix y SajaBoys; eliges un grupo y AitoRLG Singer lo potencia) y Fantasía (un Protagonista que recibe la vida de las demás cartas Fantasía y todos los ataques rivales; nueva acción Giro de Guion; Chipy Goku pasa a Épica con Guinazo).',
        'Cartas: nueva rareza Mítica (AitoRLG Singer, ocupa 3 huecos y solo sale en Destino), todas las K-Pop en el sobre Set 2 y Singer con reflejos del color de cada grupo. Petea Goblin baja a +2/+5/+10 y los SajaBoys encandilan a un solo rival.',
        'Destino: nuevo gacha en el menú (25 monedas la tirada o 10 juntas; Singer al 10 % y asegurada en la tirada 20). Los efectos y skins repetidos van a la nueva Reforja del inventario: 3 iguales de una clase por uno nuevo.',
        'Clasificación: de Hierro a Platino, cada rango da además una skin exclusiva.',
        'Extras: efecto de victoria y derrota Demon Hunters, logo de K-Pop y barra de navegación en una sola línea.'
      ] },
    { date: '2026-11-04', tag: 'Avance', title: 'Charla con los Desarrolladores: bajas, 2.2 y más', pet: true,
      items: ['Segunda charla con los desarrolladores: confirmamos lo que se ha retirado en la 2.1 y adelantamos lo que viene en la 2.2 y más allá. Con una visita inesperada.'],
      chat: [
        { w: 'g', t: '¡Hola otra vez! La 2.1 ya está aquí y el equipo de desarrollo vuelve a pasarse por aquí para contarnos cosas.' },
        { w: 'd', t: '¡Buenas! Primero lo primero: queremos confirmar las bajas que anunciamos en la charla anterior.' },
        { w: 'd', fx: { k: 'syn', ids: ['Tilt', 'Pueblo', 'NINI', 'Pelayos', 'Dúo Inseparable'], lab: 'Sinergias eliminadas' }, t: 'Ya no están en el juego: Tilt, Pueblo, NINI, Pelayos y Dúo Inseparable.' },
        { w: 'g', p: 'e', t: '¿Y las cartas? Dijisteis que algunas iban a cambiar por completo…' },
        { w: 'd', fx: { k: 'cards', lab: 'Cartas eliminadas', items: [['mertens-skin-prime', 'Mertens PRIME'], ['javihi-friki-prime', 'Javihi Prime'], ['chipy-correa-lloron', 'Chipy Llorón'], ['lihone-setter', 'Lihone Setter'], ['aitorlg-pokeaito', 'PokeAitoRLG']] }, t: 'Se han ido Mertens PRIME, Javihi Prime, Chipy Llorón, Lihone Setter y PokeAitoRLG. Eso sí: sus ilustraciones no se pierden, ahora son skins en vuestro inventario.' },
        { w: 'g', t: 'Menos mal. Y Javihi Dúo, Sech Dúo, PotAnGo… ¡esos sí han cambiado a lo grande!' },
        { w: 'p', fx: null, t: '¡EEEEH! ¡Un momento! ¡Aquí nadie ha dicho nada de los Goblins!' },
        { w: 'g', p: 'e', t: '¿Y tú quién eres? ¿Quién te ha dejado entrar?' },
        { w: 'p', t: '¡Petea Goblin! Épico, verde y con la bolsa siempre llena. Yo no entro: <i>aparezco</i>.' },
        { w: 'd', t: 'Es parte del equipo… más o menos. Ya conocéis a los Goblins de la 2.1, y tenemos una idea con ellos.' },
        { w: 'd', fx: { k: 'combo' }, t: 'Queremos juntar Goblins y Trabajo. Trabajo da ahora mucho más oro y los Goblins ganan oro al subir de nivel: una economía a lo grande.' },
        { w: 'p', fx: null, t: '¿Has dicho oro? Todo lo que brilla es mío. Y lo que no brilla, también: lo pulo y luego es mío.' },
        { w: 'g', t: 'Un momento… ¿dónde está mi cartera? ¡Mi cartera!' },
        { w: 'p', t: '(silba) No sé de qué me hablas. Solo estaba… <i>custodiándola</i>.' },
        { w: 'd', t: 'Petea, devuélvesela. Volvemos a lo serio.' },
        { w: 'd', fx: { k: 'modes' }, t: 'Queremos que el juego gire en torno a dos modos: Resurrección y Royal Rumble.' },
        { w: 'g', t: '¿Por qué esos dos?' },
        { w: 'd', t: 'Porque son donde mejor se ve el juego completo: más cartas, más sinergias y partidas distintas cada vez. Iremos ajustando cartas y sinergias pensando en ellos.' },
        { w: 'g', t: 'Perfecto. ¿Y qué viene después de la 2.1?' },
        { w: 'd', fx: { k: 'newsyn', names: [['Fantasía', 'f'], ['K-Pop', 'u']], lab: 'Versión 2.2' }, t: 'En la 2.2 anunciamos dos sinergias nuevas: Fantasía y K-Pop.' },
        { w: 'g', t: '¿K-Pop? ¡Cuéntame más!' },
        { w: 'd', fx: { k: 'logo' }, t: 'Poco más podemos decir… de momento. Solo una mini pista: fijaos bien en ese logo.' },
        { w: 'd', fx: { k: 'collab' }, t: 'Y eso nos lleva a otra cosa: habrá skins colaborativas con grupos musicales.' },
        { w: 'p', fx: null, t: '¿Habrá goblins con auriculares? ¿Con micrófono? ¿Con <i>bolsa de oro con altavoces</i>?' },
        { w: 'd', t: 'No prometemos nada, Petea.' },
        { w: 'd', fx: { k: 'rank' }, t: 'Algo más: la idea es que en la siguiente versión regalemos skins como recompensa por subir de rango.' },
        { w: 'g', t: 'O sea que jugar y ganar tendrá premio… ¡me encanta!' },
        { w: 'd', fx: { k: 'art', lab: 'Ilustraciones en acciones' }, t: 'Y un último añadido: algunas cartas de acción recibirán una ilustración.' },
        { w: 'p', fx: null, t: 'Que sea la de un goblin con una bolsa de oro. Solo es una sugerencia. Muy firme.' },
        { w: 'd', t: 'Recordad que son planes, no promesas: todo puede cambiar. Gracias por charlar con nosotros, ¡nos vemos en la partida!' },
        { w: 'g', t: '¡Hasta la próxima! Y si necesitas repasar lo básico, aquí sigo con el tutorial.' },
        { w: 'p', t: '¡Y que no os falte oro! (Y si os falta, ya sabéis dónde está.)' }] },
    { date: '2026-11-04', tag: 'Novedad', title: 'Versión 2.1: Goblins y Magic Botlane', art: ['petea-goblin', 'javihi-duo', 'sech-duo'],
      items: [
        'Sinergias nuevas: Goblins (una copia gratis cada ronda, oro al subir de nivel y el Rey Goblin) y Magic Botlane (Javihi Dúo y Sech Dúo, con Muro de Hielo, Armas Lunares y Mordisco del Invierno).',
        'Cambios: se eliminan Tilt, Pueblo, NINI, Pelayos y Dúo Inseparable y varias cartas (con skins de compensación); Javihi pasa a Computer Javihi; cambian Javihi vs All, PotAnGo, Palomitero y Lihone; Trabajo da mucho más oro.',
        'Tienda e inventario: sobre Set 2, efectos de oro, nuevo inventario con progreso de copias y las acciones repetidas dan oro.',
        'Sin límite diario de puntos de clasificación y correcciones de Goblins y Armas Lunares en Versus de 4.'
      ] },
    { date: '2026-11-03', tag: 'Avance', title: 'Charla con los Desarrolladores',
      items: ['Charla con los desarrolladores sobre lo que puede llegar en las próximas versiones: sinergias que se retiran, cartas que cambian por completo, nuevas sinergias y objetivos del juego.'],
      chat: [
        { w: 'g', t: '¡Hola! Soy el guía de siempre. Hoy no vengo a enseñarte a jugar: vengo acompañado de alguien del equipo de desarrollo.' },
        { w: 'd', t: '¡Buenas! Ahora que la 2.0 ya está aquí, queríamos contaros por dónde pensamos llevar el juego en las próximas versiones.' },
        { w: 'g', t: 'Un momento: ¿esto es oficial? ¿Va a pasar todo lo que nos cuentes?' },
        { w: 'd', t: 'Son planes, no promesas. Todo puede cambiar por el camino, pero nos gusta enseñaros lo que tenemos en la cabeza.' },
        { w: 'g', t: 'Pues empieza por lo que más duele… ¿qué se va?' },
        { w: 'd', fx: { k: 'syn', ids: ['Tilt', 'Pueblo', 'NINI', 'Pelayos', 'Dúo Inseparable'] }, t: 'Vamos a retirar cinco sinergias: Tilt, Pueblo, NINI, Pelayos y Dúo Inseparable.' },
        { w: 'g', p: 'e', t: '¡¿Cinco?! ¿Y por qué tantas a la vez?' },
        { w: 'd', t: 'Queremos hacer sitio. Preferimos rehacer el juego alrededor de sinergias que den de verdad mucho juego antes que arrastrar algunas que se han quedado atrás. Aún estamos decidiendo qué pasa con cada carta; os iremos contando.' },
        { w: 'g', t: 'Vale, vale… ¿Y las cartas que se quedan? ¿Siguen igual?' },
        { w: 'd', fx: { k: 'cards', ids: ['javihi-duo', 'sech-duo', 'potango', 'chipy-lloron', 'mertens', 'javihi-friki'] }, t: 'No todas. Hay cartas que van a cambiar por completo, no solo de números: Javihi Dúo, Sech Dúo, PotAnGo, Chipy Llorón, Mertens Prime y Javihi Prime.' },
        { w: 'g', t: '¿Cambian solo sus habilidades o también su aspecto?' },
        { w: 'd', fx: { k: 'art' }, t: 'Te cuento un spoiler: a algunas cartas les cambiaremos también la ilustración. Todavía no os enseñamos cuáles.' },
        { w: 'g', t: 'Eso da un poco de vértigo… ¿Y qué llega para compensar?' },
        { w: 'd', fx: { k: 'newsyn' }, t: '¡Sinergias nuevas! Las dos primeras serán Goblins y Fantasía.' },
        { w: 'g', t: '¡Goblins y Fantasía! ¿Y de qué van?' },
        { w: 'd', fx: { k: 'level' }, t: 'Otro spoiler: Goblins tendrá que ver con mejorar el nivel de tus cartas para ganar la partida.' },
        { w: 'g', t: '¿Subir el nivel de las cartas con una sinergia? ¡Suena a locura! ¿Y habrá más sinergias?' },
        { w: 'd', fx: { k: 'newsyn', more: 1 }, t: 'Estamos a la espera de más… De momento no podemos adelantar nada: aún no hay nada decidido.' },
        { w: 'g', fx: null, t: 'Y a largo plazo, ¿cuáles son vuestros objetivos?' },
        { w: 'd', t: 'Cuatro. El primero: que todas las cartas tengan 2 rarezas.' },
        { w: 'd', t: 'El segundo: más sobres y más cartas para coleccionar.' },
        { w: 'd', t: 'El tercero: más efectos disponibles para personalizar tus partidas.' },
        { w: 'd', t: 'Y el cuarto: mejoras visuales en los lobbys y en la partida.' },
        { w: 'g', t: 'Eso suena muy bien. ¡Me muero por verlo!' },
        { w: 'd', t: 'Gracias por charlar con nosotros. Os seguiremos informando versión a versión. ¡Nos vemos en la partida!' },
        { w: 'g', t: '¡Nos vemos! Y si necesitas repasar lo básico, aquí sigo con el tutorial.' }] },
    { date: '2026-11-03', tag: 'Novedad', title: 'Versión 2.0: Amigos, Pase de batalla y Royal Rumble', art: ['dashlight-kingambit'],
      items: [
        'Social: lista de amigos con chat e invitaciones, perfil con estadísticas, emoticonos y pantalla de Ajustes.',
        'Progreso: Pase de batalla con misiones de temporada y recompensas exclusivas (skins, funda, efectos y emoticonos); aviso de nueva versión y de cajas de rango.',
        'Juego: modo Royal Rumble (siempre contra la IA Normal), Sobre Anime, montaje automático de mazos, sin límite de rondas, huecos extra independientes y Soldado de Sombra permanente.'
      ] },
    { date: '2026-11-03', tag: 'Novedad', title: 'Versión 1.3: renovación de Anime',
      items: [
        'Anime: Genkidama y Kamehameha, nuevas pasivas y efectos propios de despliegue, funda y victoria/derrota.',
        'Versus de 4 con sala y bots, editor de mazos con sinergias, IA más fuerte en Difícil y Experto, Correa con novias caídas y Regalo, y nerfeo de Dúo Inseparable.'
      ] },
    { date: '2026-11-02', tag: 'Novedad', title: 'Versión 1.2: Gambling',
      items: [
        'Sinergia Gambling con nueva acción y cartas a la venta, Computer Dashlight (8 Medallas) y revisión de rarezas.',
        'Dificultades de la IA (Normal, Difícil y Experto), misiones, cajas e Inventario, sobre Set 1, fundas y nuevos efectos de despliegue, victoria y derrota, sonido y tienda por apartados.'
      ] },
    { date: '2026-11-01', tag: 'Novedad', title: 'Versión 1.1: TCG Arena',
      items: [
        'El juego pasa a llamarse TCG Arena, con nuevo menú de inicio, perfil, tienda, colección, tutorial guiado y clasificación con rangos.',
        'Correa (hueco 5 y las 4 novias), rework de KOI, Versus de 4 contra 3 IAs, efectos en la tienda, mazos guardados en tu cuenta y la skin Real PotAnGo.'
      ] },
    { date: '2026-10-30', tag: 'Novedad', title: 'Lanzamiento: versión 1.0',
      items: [
        'Modos Clásico, Resurrección y Versus de 4, clasificación (Ladder), niveles de carta, skins, constructor de mazos, venta de cartas y fusión de copias en partida.',
        'Pasivas de épicas y legendarias, rework de Informático, estadísticas y precios por rareza, Rendirse y moneda para decidir quién ataca primero.'
      ] },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = NEWS; else root.CARTAS_NEWS = NEWS;
})(typeof window !== 'undefined' ? window : globalThis);

