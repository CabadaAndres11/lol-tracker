/* Skins de cartas (solo cambian la ilustración). La imagen es art/<id>.webp. */
(function (root) {
  var SKINS = [
    { id: 'aitorlg-koisito-azul', card: 'aitorlg-koisito', name: 'Piel azul', price: 200 },
    { id: 'lihone-viego-espectral', card: 'lihone-viego', name: 'Hoja espectral', price: 120 },
    { id: 'javihi-friki-volibear', card: 'javihi-friki', name: 'Javihi Volibear', price: 120 },
    { id: 'dashlight-correa-gambler', card: 'dashlight-correa', name: 'Dashlight Gambler', price: 120 },
    { id: 'potango-real', card: 'potango', name: 'Real PotAnGo', price: 200 },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = SKINS; else root.CARTAS_SKINS = SKINS;
})(typeof window !== 'undefined' ? window : globalThis);
