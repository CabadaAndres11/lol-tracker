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
    { id: 'chipy-correa-lloron', card: 'chipy-correa', name: 'Chipy Llorón', pass: true, legacy: true }, // antigua carta Chipy Llorón: regalo a quien la tenía
    { id: 'javihi-clasico', card: 'javihi', name: 'Javihi clásico', pass: true, legacy: true }, // antigua ilustración de Javihi (ahora Computer Javihi): regalo a todas las cuentas
    { id: 'mertens-skin-prime', card: 'mertens', name: 'Mertens PRIME', pass: true, legacy: true }, // antigua carta Mertens PRIME: regalo a todas las cuentas
    { id: 'lihone-goblin-hierro', card: 'lihone-goblin', name: 'Goblin de Hierro', pass: true, rank: 'hierro' }, // recompensa de rango (Clasificación)
    { id: 'dashlight-sun-jin-woo-bronce', card: 'dashlight-sun-jin-woo', name: 'Jin Woo de Bronce', pass: true, rank: 'bronce' },
    { id: 'aitorlg-renata-plata', card: 'aitorlg-renata', name: 'Renata de Plata', pass: true, rank: 'plata' },
    { id: 'javihi-koisito-oro', card: 'javihi-koisito', name: 'Koisito de Oro', pass: true, rank: 'oro' },
    { id: 'computer-petea-platino', card: 'computer-petea', name: 'Petea de Platino', pass: true, rank: 'platino' },
    { id: 'dashlight-correa-gambler', card: 'dashlight-correa', name: 'Dashlight Gambler', price: 120 },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = SKINS; else root.CARTAS_SKINS = SKINS;
})(typeof window !== 'undefined' ? window : globalThis);
