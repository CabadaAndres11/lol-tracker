/* Skins de cartas (solo cambian la ilustración). pass:true = exclusiva del pase de batalla (no se vende ni sale en sobres). La imagen es art/<id>.webp. */
(function (root) {
  var SKINS = [
    { id: 'aitorlg-koisito-azul', card: 'aitorlg-koisito', name: 'Piel azul', price: 200 },
    { id: 'lihone-viego-espectral', card: 'lihone-viego', name: 'Hoja espectral', price: 120 },
    { id: 'javihi-friki-volibear', card: 'javihi-friki', name: 'Javihi Volibear', price: 120 },
    { id: 'potango-real', card: 'potango', name: 'Real PotAnGo', price: 200 },
    { id: 'pampert-oikawa', card: 'pampert', name: 'Pampert Oikawa', pass: true },
    { id: 'dashlight-kingambit', card: 'computer-dashlight', name: 'Dashlight Kingambit', pass: true },
    { id: 'aitorlg-pokeaito', card: 'aitorlg-regla', name: 'PokeAitoRLG', pass: true, legacy: true }, // antigua carta PokeAitoRLG: regalo a quien la tenía
    { id: 'javihi-friki-prime', card: 'javihi-friki', name: 'Javihi Prime', pass: true, legacy: true }, // antigua carta Javihi Prime: regalo a quien la tenía
    { id: 'lihone-setter', card: 'lihone', name: 'Lihone Setter', pass: true, legacy: true }, // antigua carta Lihone Setter: regalo a quien la tenía
    { id: 'dashlight-correa-gambler', card: 'dashlight-correa', name: 'Dashlight Gambler', price: 120 },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = SKINS; else root.CARTAS_SKINS = SKINS;
})(typeof window !== 'undefined' ? window : globalThis);
