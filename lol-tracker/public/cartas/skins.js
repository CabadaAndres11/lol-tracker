/* Skins de cartas (solo cambian la ilustración). La imagen es art/<id>.webp. */
(function (root) {
  var SKINS = [
    { id: 'aitorlg-koisito-azul', card: 'aitorlg-koisito', name: 'Piel azul', price: 120 },
    { id: 'lihone-viego-espectral', card: 'lihone-viego', name: 'Hoja espectral', price: 120 },
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = SKINS; else root.CARTAS_SKINS = SKINS;
})(typeof window !== 'undefined' ? window : globalThis);
