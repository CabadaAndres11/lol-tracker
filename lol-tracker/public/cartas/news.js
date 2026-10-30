/* Parches y noticias. Añade las nuevas AL PRINCIPIO (la más reciente primero). */
(function (root) {
  var NEWS = [
    { date: '2026-10-30', tag: 'Equilibrio', title: 'Rework de la sinergia Informático',
      items: ['Nivel 1 (2 cartas): la primera actualización de cada tienda es gratis.',
        'Nivel 2 (4 cartas): las 3 primeras actualizaciones de cada tienda son gratis.',
        'Nivel 3 (6 cartas): las Informático ganan +1/+1 permanente por cada actualización de tienda hecha en la partida.',
        'Se elimina el bonus de rareza en tienda y la oferta a dedo.',
        'Javihi y Computer Chipy pasan de Común a Rara.'] },
    { date: '2026-10-30', tag: 'Novedad', title: 'Skins de cartas',
      items: ['Nueva sección «Skins» en Sobres: compra con monedas ilustraciones alternativas para tus cartas.',
        'Primera skin: AitoRLG Koisito «Piel azul» (120 monedas). Necesitas tener la carta.',
        'Se equipan desde la tienda y las verán tus rivales en 1 vs 1 y Versus de 4.'] },
    { date: '2026-10-30', tag: 'Novedad', title: 'Niveles de carta',
      items: ['Las copias repetidas ya no dan monedas: ahora mejoran la carta.',
        '2 copias → ★2 y 4 copias → ★3.',
        'Tropas: +1 de ataque y +1 de vida por nivel. Acciones: +50 % de efecto por nivel.',
        'El nivel se ve en la insignia de la carta y cuenta también en partidas contra jugadores.'] },
    { date: '2026-10-30', tag: 'Equilibrio', title: 'Ajuste a la sinergia Pokémon',
      items: ['Pokeball: +0/+0 (antes más fuerte).', 'Superball: +1/+1.', 'Ultraball: +2/+2.'] },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = NEWS; else root.CARTAS_NEWS = NEWS;
})(typeof window !== 'undefined' ? window : globalThis);
