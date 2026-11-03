/* Sets de emoticonos. Compartido por el servidor (validación y propiedad) y el navegador (imágenes y nombres).
 * Un emoticono se identifica como «<set>-<n>» (n empieza en 1) y su imagen es /cartas/emo/<set>-<n>.webp.
 * Los sets se consiguen como recompensa (p. ej. en el pase de batalla); cualquiera puede ver los de los demás. */
(function (root) {
  var SETS = [
    { id: 'camo', name: 'Set Camuflaje', ratio: 1.5, emotes: ['Serio', 'Enfadado', 'Flipado', 'Vergüenza', 'Guiño', 'Alegría', 'Llorando', 'Zzz', 'Enamorado', 'Mareado', 'Dudando', 'Deprimido', 'Aura verde', 'Gafas', 'Furia', 'Rabieta'] },
    { id: 'gorra', name: 'Set Gorra', ratio: 1.2, emotes: ['Sonrisa', 'Enfadado', 'Flipado', 'Vergüenza', 'Guiño', 'Gafas', 'Risa', 'Llorando', 'Dudando', 'Zzz', 'Enamorado', 'Mareado', 'Cabreado', 'Satisfecho', 'Cansado', 'Aura morada', 'Ánimo', 'Furia roja', 'Pánico', 'Idea'] }
  ];
  function setOf(id) { for (var i = 0; i < SETS.length; i++) if (SETS[i].id === id) return SETS[i]; return null; }
  // «camo-3» -> { set, n, name } o null si no es válido
  function parse(eid) {
    var m = /^([a-z0-9]+)-(\d{1,2})$/.exec(String(eid || '')), s = m && setOf(m[1]), n = m && +m[2];
    return s && n >= 1 && n <= s.emotes.length ? { set: s, n: n, name: s.emotes[n - 1] } : null;
  }
  var API = { SETS: SETS, setOf: setOf, parse: parse, src: function (eid) { return '/cartas/emo/' + eid + '.webp'; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CARTAS_EMOTES = API;
})(typeof window !== 'undefined' ? window : globalThis);
