/* Sonidos de TCG Arena: todo sintetizado con Web Audio (sin archivos). Ajustes en el perfil. */
(function (root) {
  var KEY = 'cartas_sfx_v1';
  var CATS = [['ui', 'Interfaz', 'Clics, navegación y tienda'], ['combat', 'Combate', 'Golpes, bajas, curas y habilidades'], ['pack', 'Sobres y cajas', 'Apertura, revelado de cartas y recompensas'], ['event', 'Eventos y efectos', 'Despliegues, inicio de ronda, victoria y derrota']];
  var def = { master: 60, mute: false, bg: true, vol: { ui: 70, combat: 80, pack: 90, event: 90 } };
  var cfg = load(), ctx = null, bus = null, cbus = {}, noiseBuf = null, last = {};
  function load() {
    var c = JSON.parse(JSON.stringify(def));
    try { var r = JSON.parse(root.localStorage.getItem(KEY) || 'null'); if (r) { if (typeof r.master === 'number') c.master = r.master; if (typeof r.mute === 'boolean') c.mute = r.mute; if (typeof r.bg === 'boolean') c.bg = r.bg; if (r.vol) Object.keys(c.vol).forEach(function (k) { if (typeof r.vol[k] === 'number') c.vol[k] = r.vol[k]; }); } } catch (e) {}
    return c;
  }
  function save() { try { root.localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }
  function init() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    bus = ctx.createGain(); bus.connect(comp); comp.connect(ctx.destination);
    CATS.forEach(function (c) { var g = ctx.createGain(); g.connect(bus); cbus[c[0]] = g; });
    applyVol();
    var n = ctx.sampleRate * 1.5, b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0); for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; noiseBuf = b;
    return ctx;
  }
  function applyVol() {
    if (!ctx) return;
    bus.gain.value = cfg.mute ? 0 : Math.pow(cfg.master / 100, 1.6);
    CATS.forEach(function (c) { cbus[c[0]].gain.value = Math.pow(cfg.vol[c[0]] / 100, 1.6); });
  }
  function wake() { if (init() && ctx.state === 'suspended') ctx.resume(); }
  // --- bloques de síntesis ---
  function env(g, t, a, d, v) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  function tone(cat, f, dur, o) {
    o = o || {}; var t = ctx.currentTime + (o.at || 0), os = ctx.createOscillator(), g = ctx.createGain();
    os.type = o.type || 'sine'; os.frequency.setValueAtTime(f, t); if (o.to) os.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    env(g, t, o.a || 0.006, dur, o.v || 0.3); os.connect(g); g.connect(cbus[cat]); os.start(t); os.stop(t + dur + (o.a || 0.006) + 0.05);
  }
  function noise(cat, dur, o) {
    o = o || {}; var t = ctx.currentTime + (o.at || 0), s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1000, t); if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur); f.Q.value = o.q || 1;
    env(g, t, o.a || 0.005, dur, o.v || 0.3); s.connect(f); f.connect(g); g.connect(cbus[cat]); s.start(t, Math.random() * 0.5); s.stop(t + dur + (o.a || 0.005) + 0.05);
  }
  function arp(cat, notes, step, o) { o = o || {}; notes.forEach(function (f, i) { tone(cat, f, o.d || 0.3, { at: (o.at || 0) + i * step, type: o.type || 'triangle', v: o.v || 0.22 }); }); }
  var N = { C4: 262, D4: 294, E4: 330, G4: 392, A4: 440, B3: 247, C5: 523, D5: 587, E5: 659, G5: 784, A5: 880, C6: 1047, E6: 1319, G6: 1568 };
  var S = {
    click: ['ui', function () { tone('ui', 1500, 0.04, { type: 'triangle', v: 0.22 }); noise('ui', 0.02, { f: 4000, v: 0.08 }); }],
    nav: ['ui', function () { tone('ui', 480, 0.1, { to: 760, v: 0.25 }); tone('ui', 960, 0.07, { at: 0.04, v: 0.1 }); }],
    back: ['ui', function () { tone('ui', 700, 0.1, { to: 420, v: 0.22 }); }],
    confirm: ['ui', function () { tone('ui', 660, 0.09, { type: 'triangle', v: 0.25 }); tone('ui', 990, 0.16, { at: 0.07, type: 'triangle', v: 0.25 }); }],
    error: ['ui', function () { tone('ui', 170, 0.2, { type: 'sawtooth', to: 110, v: 0.18 }); }],
    buy: ['ui', function () { tone('ui', 1318, 0.07, { type: 'square', v: 0.12 }); tone('ui', 1760, 0.2, { at: 0.07, type: 'square', v: 0.12 }); }],
    sell: ['ui', function () { tone('ui', 1760, 0.07, { type: 'square', v: 0.1 }); tone('ui', 1175, 0.18, { at: 0.07, type: 'square', v: 0.1 }); }],
    place: ['ui', function () { tone('ui', 150, 0.14, { to: 70, v: 0.5 }); noise('ui', 0.07, { f: 500, ft: 'lowpass', v: 0.3 }); }],
    pick: ['ui', function () { tone('ui', 900, 0.05, { type: 'triangle', v: 0.2 }); noise('ui', 0.05, { f: 3000, v: 0.08 }); }],
    refresh: ['ui', function () { noise('ui', 0.22, { f: 600, to: 3500, q: 2, v: 0.2 }); }],
    freeze: ['ui', function () { arp('ui', [N.C6, N.E6, N.G6], 0.05, { type: 'sine', d: 0.3, v: 0.18 }); noise('ui', 0.2, { f: 6000, ft: 'highpass', v: 0.08 }); }],
    claim: ['event', function () { arp('event', [N.C5, N.E5, N.G5, N.C6, N.E6], 0.07, { d: 0.35, v: 0.2 }); }],
    coin: ['ui', function () { tone('ui', 1568, 0.06, { type: 'square', v: 0.1 }); tone('ui', 2093, 0.18, { at: 0.06, type: 'square', v: 0.1 }); }],
    hit: ['combat', function () { tone('combat', 180, 0.12, { to: 60, v: 0.55 }); noise('combat', 0.08, { f: 1200, q: 0.8, v: 0.35 }); }],
    heavy: ['combat', function () { tone('combat', 120, 0.22, { to: 40, v: 0.7 }); noise('combat', 0.16, { f: 700, q: 0.6, v: 0.5 }); tone('combat', 70, 0.3, { at: 0.02, v: 0.4 }); }],
    miss: ['combat', function () { noise('combat', 0.14, { f: 1800, to: 700, q: 3, v: 0.15 }); }],
    death: ['combat', function () { tone('combat', 320, 0.4, { type: 'sawtooth', to: 55, v: 0.25 }); noise('combat', 0.3, { f: 900, to: 150, v: 0.3 }); }],
    heal: ['combat', function () { arp('combat', [N.G4, N.C5, N.E5], 0.06, { type: 'sine', d: 0.28, v: 0.22 }); }],
    buff: ['combat', function () { tone('combat', 520, 0.2, { to: 880, type: 'triangle', v: 0.2 }); }],
    magic: ['combat', function () { arp('combat', [N.E5, N.A5, N.C6, N.E6], 0.05, { type: 'sine', d: 0.3, v: 0.16 }); noise('combat', 0.3, { f: 3000, to: 8000, q: 1.5, v: 0.1 }); }],
    round: ['event', function () { tone('event', 220, 0.5, { type: 'sawtooth', v: 0.12 }); tone('event', 330, 0.5, { type: 'sawtooth', v: 0.1 }); tone('event', 440, 0.45, { at: 0.12, type: 'triangle', v: 0.14 }); }],
    end: ['event', function () { tone('event', 110, 0.9, { v: 0.4 }); tone('event', 165, 0.8, { v: 0.2 }); noise('event', 0.4, { f: 400, ft: 'lowpass', v: 0.15 }); }],
    win: ['event', function () { arp('event', [N.C5, N.E5, N.G5, N.C6], 0.13, { d: 0.45, v: 0.26 }); [N.C5, N.E5, N.G5].forEach(function (f) { tone('event', f, 1, { at: 0.55, type: 'triangle', v: 0.16 }); }); arp('event', [N.E6, N.G6], 0.1, { at: 0.7, type: 'sine', d: 0.5, v: 0.12 }); }],
    lose: ['event', function () { arp('event', [N.E4, N.D4, N.C4, N.B3], 0.3, { type: 'triangle', d: 0.6, v: 0.25 }); tone('event', 110, 1.4, { at: 0.6, type: 'sawtooth', v: 0.07 }); }],
    deploy: ['event', function () { noise('event', 0.4, { f: 400, to: 2500, q: 1.2, v: 0.22 }); }],
    land: ['event', function () { tone('event', 110, 0.3, { to: 45, v: 0.6 }); noise('event', 0.15, { f: 800, ft: 'lowpass', v: 0.3 }); tone('event', 1568, 0.5, { at: 0.03, v: 0.08 }); }],
    shake: ['pack', function () { for (var i = 0; i < 8; i++) { tone('pack', 90 + (i % 2) * 20, 0.12, { at: i * 0.19, type: 'triangle', v: 0.35 }); noise('pack', 0.1, { at: i * 0.19, f: 300, ft: 'lowpass', v: 0.25 }); } }],
    rip: ['pack', function () { noise('pack', 0.45, { f: 2500, to: 9000, ft: 'highpass', v: 0.3 }); tone('pack', 220, 0.4, { to: 880, type: 'triangle', v: 0.15 }); }],
    lid: ['pack', function () { tone('pack', 120, 0.25, { to: 50, v: 0.6 }); noise('pack', 0.35, { f: 1500, to: 6000, ft: 'highpass', v: 0.28 }); arp('pack', [N.G5, N.C6, N.E6], 0.06, { at: 0.08, type: 'sine', d: 0.4, v: 0.14 }); }],
    flip: ['pack', function () { noise('pack', 0.1, { f: 1500, to: 4000, q: 2, v: 0.2 }); tone('pack', 700, 0.06, { type: 'triangle', v: 0.1 }); }],
    'rev-Común': ['pack', function () { tone('pack', 880, 0.3, { type: 'triangle', v: 0.22 }); }],
    'rev-Rara': ['pack', function () { arp('pack', [N.E5, N.A5], 0.09, { type: 'sine', d: 0.5, v: 0.24 }); }],
    'rev-Épica': ['pack', function () { [N.C5, N.E5, N.G5, N.C6].forEach(function (f) { tone('pack', f, 0.9, { type: 'triangle', v: 0.15 }); }); noise('pack', 0.5, { f: 5000, to: 9000, q: 2, v: 0.08 }); }],
    'rev-Legendaria': ['pack', function () { arp('pack', [N.C5, N.E5, N.G5, N.C6, N.E6, N.G6], 0.08, { type: 'sine', d: 0.8, v: 0.2 }); [N.C5, N.G5, N.C6].forEach(function (f) { tone('pack', f, 1.6, { at: 0.5, type: 'triangle', v: 0.14 }); }); noise('pack', 0.9, { at: 0.3, f: 4000, to: 10000, q: 2, v: 0.1 }); }]
  };
  function play(name, delayMs) {
    var s = S[name]; if (!s || cfg.mute) return;
    if (delayMs > 0) { setTimeout(function () { play(name); }, delayMs); return; }
    if (cfg.bg && root.document && root.document.hidden) return;
    if (!init()) return; if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} if (ctx.state === 'suspended') return; }
    if (cfg.vol[s[0]] <= 0 || cfg.master <= 0) return;
    var now = Date.now(); if (last[name] && now - last[name] < 35) return; last[name] = now; // evita acumulaciones
    try { s[1](); } catch (e) {}
  }
  function set(k, v, cat) {
    if (k === 'vol') cfg.vol[cat] = Math.max(0, Math.min(100, +v)); else if (k === 'master') cfg.master = Math.max(0, Math.min(100, +v)); else cfg[k] = !!v;
    save(); applyVol();
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { root.addEventListener(ev, wake, { passive: true }); });
  root.CartasSfx = { play: play, get: function () { return cfg; }, set: set, CATS: CATS, reset: function () { cfg = JSON.parse(JSON.stringify(def)); save(); applyVol(); }, toggleMute: function () { set('mute', !cfg.mute); return cfg.mute; } };
})(window);
