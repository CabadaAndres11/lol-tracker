/* Motor del juego de cartas. Sin DOM: se usa igual en el navegador y en Node para simular partidas. */
(function (root) {
  'use strict';
  var DATA = root.CARTAS || (typeof require !== 'undefined' ? require('./cards.js') : null);

  // ---------- Ajustes de balance (todo en un sitio para tocarlo fácil) ----------
  var CFG = {
    slots: 4, handMax: 5, life: 12, gold: 8, income: 2, shopEvery: 3, shopOffers: 5,
    refreshCost: 1, deckBudget: 20, maxRounds: 40,
    reviveLife: 20, // modo Resurrección: vida inicial (la vida solo se pierde con golpes directos; la carta que ataca recibe el ataque de la atacada)
    merge: [1, 2, 4], // fusión de 3 copias iguales (estilo TFT): multiplicador de las estadísticas base por estrella
    rarityWeight: { 'Común': 50, 'Rara': 30, 'Épica': 15, 'Legendaria': 5 },
    rarityRamp: { 'Común': -8, 'Rara': 2, 'Épica': 5, 'Legendaria': 3 }, // cambio de peso por cada tienda tras la primera (mín. 10, máx. 40)
  };
  var FX = {
    pokemon: { cap: 1e9, probs: [[70, 25, 5], [45, 40, 15], [25, 45, 30]], bonus: [0, 1, 2], names: ['Pokéball', 'Superball', 'Ultraball'] },
    comebacker: { atk: [1, 2, 2], others: [0, 0, 1], cap: 8 },
    lol: { atk: [1, 1, 2], hp: [0, 1, 2], cap: [4, 6, 8] },
    trabajo: { shop: [0, 0, 2] },
    anime: { cede: [1, 2, 3] },
    koi: { atk: [1, 2, 3], cap: 8 },
    voley: { atk: [1, 2, 3], red: [1, 1, 2], cap: 8 },
    novia: { p: [0.6, 0.75, 0.9], up: [1, 2, 3], down: 1, cap: 10 },
    tilt: { hit: [1, 1, 2], perm: [1, 2, 2], cap: 8 },
    pueblo: { per: [1, 2], cap: [4, 8] },
    duo: { stat: 2, death: 2, cap: 12 },
    nini: { per: 2, cap: 8 },
    pelayos: { cap: 10 },
  };

  var CARD = {};
  DATA.cards.concat(DATA.actions).forEach(function (c) { CARD[c.id] = c; });

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  // RNG con estado guardado en la partida (s.rs): permite serializarla (modo 1 vs 1 en el servidor).
  function bindRng(s) {
    s.rng = function () {
      s.rs = s.rs + 0x6D2B79F5 | 0;
      var t = Math.imul(s.rs ^ s.rs >>> 15, 1 | s.rs);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    return s;
  }
  // Texto según quién lo lee. En 1 vs 1 se guarda un marcador que cada jugador resuelve en su copia.
  function pv(s, p, mine, theirs) { return s.pvp ? '\u0001' + p + '\u0002' + mine + '\u0002' + theirs + '\u0003' : (p === 0 ? mine : theirs); }

  // ---------- Instancias ----------
  function mk(s, id, owner) {
    var c = CARD[id];
    var i = { uid: (s.uidn[owner]++) * (s.uidm || 2) + (s.uidk ? s.uidk[owner] : owner), id: id, owner: owner, gl: 1, perm: { atk: 0, hp: 0 }, tmp: { atk: 0, hp: 0, red: 0 }, dead: false, caps: { lol: 0, pueblo: 0, nini: 0, pel: 0, tilt: 0, pk: 0, duo: 0, nov: 0, cb: 0, vol: 0, koi: 0 } };
    i.hp = c.hp || 0;
    var L = s.lv && s.lv[owner] && s.lv[owner][id];
    if (L > 1 && c.type === 'tropa') { i.perm.atk += L - 1; i.perm.hp += L - 1; i.hp += L - 1; } // nivel de carta: +1/+1 por nivel
    return i;
  }
  function card(i) { return CARD[i.id]; }
  function isTroop(i) { return card(i).type === 'tropa'; }
  function maxHp(i) { return Math.max(1, card(i).hp + i.perm.hp + i.tmp.hp); }
  function atk(i) { if (i.tmp.loan != null) return Math.max(0, i.tmp.loan); return Math.max(0, card(i).atk + i.perm.atk + i.tmp.atk); }
  function has(i, theme) { return card(i).themes.indexOf(theme) >= 0; }
  function alive(i) { return i && !i.dead; }

  // ---------- Temáticas ----------
  function tierOf(theme, n) {
    var th = DATA.themes[theme].th, t = 0;
    for (var k = 0; k < th.length; k++) if (n >= th[k]) t = k + 1;
    return t;
  }
  // Cartas distintas de cada temática entre mesa y mano (las copias no suman).
  function themeCounts(P) {
    var seen = {}, out = {};
    P.mesa.concat(P.hand).forEach(function (i) {
      if (!i || !isTroop(i) || i.dead || seen[i.id]) return;
      seen[i.id] = 1;
      card(i).themes.forEach(function (t) { out[t] = (out[t] || 0) + 1; });
    });
    return out;
  }
  function tiers(P) {
    var c = themeCounts(P), t = {};
    Object.keys(c).forEach(function (k) { t[k] = tierOf(k, c[k]); });
    return t;
  }
  function mesaTroops(P) { return P.mesa.filter(alive); }
  function hasWork(P) {
    return P.mesa.concat(P.hand).some(function (i) { return i && isTroop(i) && has(i, 'Trabajo'); });
  }
  function noTroops(P) {
    return !P.mesa.some(alive) && !P.hand.some(function (i) { return isTroop(i); });
  }

  // ---------- Partida ----------
  function deckSize(ids) { return ids.reduce(function (n, id) { return n + CARD[id].size; }, 0); }
  function randomDeck(rng, only) {
    var pool = only ? only.filter(function (id) { return CARD[id]; }) : DATA.cards.concat(DATA.actions).map(function (c) { return c.id; });
    for (var i = pool.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    var deck = [], used = 0, acts = 0, com = 0;
    var isCom = function (id) { return CARD[id].type === 'tropa' && CARD[id].rarity === 'Común'; };
    var front = pool.filter(isCom).slice(0, 2);
    pool = front.concat(pool.filter(function (id) { return front.indexOf(id) < 0; }));
    for (var k = 0; k < pool.length; k++) {
      var c = CARD[pool[k]];
      if (c.type === 'accion' && acts >= 2) continue;
      if (used + c.size > CFG.deckBudget) continue;
      deck.push(c.id); used += c.size; if (c.type === 'accion') acts++;
    }
    return deck;
  }

  function newPlayer(deck) {
    return { life: CFG.life, gold: CFG.gold, deck: deck.slice(), hand: [], mesa: [null, null, null, null], grave: [], target: {}, voley: {}, fl: {}, offers: [], refreshes: 0, pickUsed: false, anime: 0, lost: false };
  }

  function newGame(deckA, deckB, seed, opts) {
    var s = { rs: (seed == null ? (Date.now() & 0xffffff) : seed) | 0, uidn: [1, 1], fightN: 0, round: 0, shops: 0, phase: 'prep', shopOpen: false, first: 0, over: false, winner: -1, reason: '', log: [], frames: [], p: [newPlayer(deckA), newPlayer(deckB)], lastBall: [null, null], refreshN: [0, 0], err: '', acts: [] };
    bindRng(s);
    if (opts && opts.pvp) s.pvp = true;
    if (opts && opts.mode === 'revive') { s.mode = 'revive'; s.maxLife = CFG.reviveLife; s.p.forEach(function (P) { P.life = CFG.reviveLife; }); }
    if (opts && opts.lv) s.lv = opts.lv;
    if (opts && opts.sk) s.sk = opts.sk;
    s.first0 = s.rng() < .5 ? 0 : 1; s.cn = 0; // quién ataca primero en el primer combate es azar; después se alterna
    startRound(s);
    return s;
  }

  function say(s, text) { s.log.push({ r: s.round, text: text }); if (s.log.length > 80) s.log.shift(); }

  function drawStart(s, p) {
    var P = s.p[p], ids = P.deck.slice(), hand = [];
    for (var n = 0; n < 3 && ids.length; n++) {
      var k = Math.floor(s.rng() * ids.length);
      hand.push(ids.splice(k, 1)[0]);
    }
    if (!hand.some(function (id) { return CARD[id].type === 'tropa'; })) {
      var troops = P.deck.filter(function (id) { return CARD[id].type === 'tropa'; });
      if (troops.length) hand[0] = troops[Math.floor(s.rng() * troops.length)];
    }
    P.hand = hand.map(function (id) { return mk(s, id, p); });
  }

  function income(s, p) {
    var P = s.p[p], t = tiers(P), g = s.inc || CFG.income, extra = 0;
    if (mesaTroops(P).some(function (i) { return has(i, 'Trabajo'); })) {
      var tw = t['Trabajo'] || 0;
      if (tw === 1 && s.round % 2 === 0) extra = 1;
      else if (tw >= 2) extra = 1;
    }
    P.gold += g + extra;
    return g + extra;
  }

  function startRound(s) {
    s.round++;
    var shopRd = s.round % CFG.shopEvery === 1;
    if (!shopRd) s.cn = (s.cn || 0) + 1; // combates jugados hasta ahora (las rondas de tienda no cuentan)
    s.first = ((s.cn || 0) + (shopRd ? 1 : 0) + (s.first0 || 0)) % 2; // en tienda: quién abrirá el próximo combate
    s.frames = [];
    s.shopOpen = false;
    [0, 1].forEach(function (p) {
      var got = income(s, p);
      if (p === 0 || s.pvp) say(s, pv(s, p, 'Ronda ' + s.round + ': +' + got + ' de oro.', 'El rival cobra +' + got + ' de oro.'));
      s.p[p].target = {}; s.p[p].anime = 0; s.p[p].fl = {};
    });
    if (s.round % CFG.shopEvery === 1) {
      s.shops++;
      s.shopOpen = true;
      [0, 1].forEach(function (p) { openShop(s, p); });
      say(s, 'Se abre la tienda.');
    } else {
      [0, 1].forEach(function (p) {
        if (noTroops(s.p[p])) { s.p[p].lost = true; }
      });
      if (s.p[0].lost || s.p[1].lost) {
        s.over = true; s.phase = 'over';
        s.winner = s.p[0].lost && s.p[1].lost ? 1 : (s.p[0].lost ? 1 : 0);
        s.reason = 'Se quedó sin tropas antes de la tienda.';
        say(s, pv(s, s.winner, 'El rival se quedó sin tropas: derrota automática.', 'Te quedaste sin tropas: derrota automática.'));
        return;
      }
    }
    s.phase = 'prep';
    if (!s.pvp) { aiShop(s, 1); aiPrep(s, 1); }
    if (s.shopOpen) checkShop(s);
  }

  // ---------- Tienda ----------
  function offerPool(s, p) {
    var P = s.p[p], t = tiers(P);
    var pool = P.deck.filter(function (id) { return CARD[id].type === 'tropa' || true; });
    var elig = pool.filter(function (id) { return !(CARD[id].cost === 5 && CARD[id].type === 'tropa' && s.shops < 2); });
    if (!elig.length) elig = pool;
    if (s.round === 1) { // tienda inicial: solo tropas comunes
      var cm = pool.filter(function (id) { return CARD[id].type === 'accion' || (CARD[id].type === 'tropa' && CARD[id].rarity === 'Común'); });
      if (cm.some(function (id) { return CARD[id].type === 'tropa'; })) elig = cm;
    }
    return elig.map(function (id) {
      var rr = CARD[id].rarity, w = (CFG.rarityWeight[rr] || 10) + (CFG.rarityRamp[rr] || 0) * Math.max(0, s.shops - 1);
      w = Math.max(rr === 'Común' ? 10 : 1, Math.min(40, w));
      return { id: id, w: w };
    });
  }
  // Probabilidad (%) de cada rareza en la próxima oferta de la tienda de p
  function shopOdds(s, p) {
    var pool = offerPool(s, p), tot = 0, by = {};
    pool.forEach(function (x) { by[CARD[x.id].rarity] = (by[CARD[x.id].rarity] || 0) + x.w; tot += x.w; });
    var out = {}, sum = 0, last = null;
    ['Común', 'Rara', 'Épica', 'Legendaria'].forEach(function (r) { if (by[r]) { out[r] = Math.round(by[r] / tot * 100); sum += out[r]; last = r; } });
    if (last && sum !== 100) out[last] += 100 - sum;
    return out;
  }
  function drawOffer(s, p) {
    var pool = offerPool(s, p), tot = pool.reduce(function (a, b) { return a + b.w; }, 0), r = s.rng() * tot;
    for (var k = 0; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) return pool[k].id; }
    return pool[pool.length - 1].id;
  }
  // En la tienda inicial siempre hay al menos 3 tropas comprables (las acciones no se pueden jugar en tienda).
  function fixFirstShop(s, p) {
    if (s.round !== 1) return;
    var P = s.p[p], tr = function (id) { return CARD[id].type === 'tropa'; }, g = 0;
    while (P.offers.filter(tr).length < 3 && g++ < 30) {
      var k = P.offers.findIndex(function (id) { return !tr(id); }), id2 = drawOffer(s, p);
      if (k >= 0 && tr(id2)) P.offers[k] = id2;
    }
  }
  // Sin tropas, sin oro para comprar ninguna de la tienda y sin poder actualizarla: derrota automática.
  function shopStuck(s, p) {
    var P = s.p[p];
    if (!s.shopOpen || s.over) return false;
    if (P.mesa.some(alive) || P.hand.some(isTroop)) return false;
    if (P.gold >= refreshCost(s, p)) return false;
    return !P.offers.some(function (id) { return CARD[id].type === 'tropa' && CARD[id].cost <= P.gold; });
  }
  function checkShop(s) {
    s.p.forEach(function (_, p) {
      if (s.vs4) { if (shopStuck(s, p)) (s.stuck = s.stuck || {})[p] = 1; return; }
      if (shopStuck(s, p)) forfeit(s, p, pv(s, p, 'Te quedaste', 'El rival se quedó') + ' sin oro y sin tropas en la tienda.');
    });
  }
  function openShop(s, p) {
    var P = s.p[p], t = tiers(P);
    P.refreshes = 0; P.pickUsed = false; P.offers = [];
    for (var n = 0; n < CFG.shopOffers; n++) P.offers.push(drawOffer(s, p));
    fixFirstShop(s, p);
    if (mesaTroops(P).some(function (i) { return has(i, 'Trabajo'); }) && FX.trabajo.shop[(t['Trabajo'] || 0) - 1]) {
      var b = FX.trabajo.shop[(t['Trabajo'] || 0) - 1];
      P.gold += b;
      if (p === 0 || s.pvp) say(s, pv(s, p, 'Trabajo: +' + b + ' de oro al abrir la tienda.', 'El rival cobra Trabajo: +' + b + ' de oro.'));
    }
  }
  function refreshCost(s, p) {
    var P = s.p[p], t = tiers(P);
    var il = t['Informático'] || 0, free = il >= 2 ? 3 : il >= 1 ? 1 : 0;
    return P.refreshes < free ? 0 : CFG.refreshCost;
  }
  function refresh(s, p) {
    var P = s.p[p];
    if (!s.shopOpen || s.phase !== 'prep') return false;
    var c = refreshCost(s, p);
    if (P.gold < c) return false;
    P.gold -= c; P.refreshes++; s.refreshN[p]++;
    var keep = P.offers.filter(function (x) { return x && x.extra; });
    P.offers = [];
    for (var n = 0; n < CFG.shopOffers; n++) P.offers.push(drawOffer(s, p));
    fixFirstShop(s, p);
    checkShop(s);
    return true;
  }
  function pickFromDeck(s, p, id) {
    var P = s.p[p], t = tiers(P);
    return false; // retirado: ya no existe la oferta a dedo
  }
  // Resurrección: sin límite de mano; y no puede haber dos copias de la misma carta en la mesa
  function handCap(s) { return s.mode === 'revive' ? 999 : CFG.handMax; }
  function dupBlock(s, p, handIdx) {
    var P = s.p[p], i = P.hand[handIdx];
    return !!(s.mode === 'revive' && i && P.mesa.some(function (x) { return x && !x.dead && x.id === i.id; }));
  }
  // Vender (solo en la tienda): devuelve el coste de la carta (x3 por cada estrella de fusión)
  function sellValue(i) { return card(i).cost * Math.pow(3, (i.gl || 1) - 1); }
  function sell(s, p, where, idx) {
    var P = s.p[p];
    if (!s.shopOpen || s.phase !== 'prep' || s.over) return false;
    var i = where === 'mesa' ? P.mesa[idx] : P.hand[idx];
    if (!i || i.dead) return false;
    if (where === 'mesa') { P.mesa[idx] = null; delete P.target[i.uid]; } else P.hand.splice(idx, 1);
    P.gold += sellValue(i);
    checkShop(s);
    return true;
  }
  function buy(s, p, idx) {
    var P = s.p[p], id = P.offers[idx];
    if (!s.shopOpen || s.phase !== 'prep' || !id) return false;
    var c = CARD[id];
    if (P.gold < c.cost || (P.hand.length >= handCap(s) && !willMerge(P, id))) return false;
    P.gold -= c.cost; P.offers.splice(idx, 1);
    P.hand.push(mk(s, id, p));
    mergeCheck(s, p);
    checkShop(s);
    return true;
  }
  // ---------- Fusión de copias (estilo TFT) ----------
  // 3 copias iguales (misma carta y misma estrella) entre mesa y mano se fusionan en 1 con estadísticas mejoradas.
  function sameStar(P, id, gl) {
    return P.mesa.concat(P.hand).filter(function (i) { return i && !i.dead && i.id === id && (i.gl || 1) === gl; });
  }
  function willMerge(P, id) { return isTroop({ id: id }) && sameStar(P, id, 1).length >= 2; }
  function mergeCheck(s, p) {
    var P = s.p[p], again = true, guard = 0;
    while (again && guard++ < 6) {
      again = false;
      var all = P.mesa.concat(P.hand).filter(function (i) { return i && !i.dead && isTroop(i) && (i.gl || 1) < CFG.merge.length; });
      for (var k = 0; k < all.length; k++) {
        var g = sameStar(P, all[k].id, all[k].gl || 1);
        if (g.length < 3 || (all[k].gl || 1) >= CFG.merge.length) continue;
        var inMesa = g.filter(function (i) { return P.mesa.indexOf(i) >= 0; });
        var keep = inMesa.length ? inMesa[0] : g[0];
        var others = g.filter(function (i) { return i !== keep; }).sort(function (a, b) { return (P.mesa.indexOf(a) >= 0 ? 1 : 0) - (P.mesa.indexOf(b) >= 0 ? 1 : 0); }).slice(0, 2);
        others.forEach(function (o) {
          var mi = P.mesa.indexOf(o); if (mi >= 0) P.mesa[mi] = null;
          var hi = P.hand.indexOf(o); if (hi >= 0) P.hand.splice(hi, 1);
          delete P.target[o.uid];
        });
        var c = card(keep), from = keep.gl || 1, d = CFG.merge[from] - CFG.merge[from - 1];
        keep.gl = from + 1;
        keep.perm.atk += Math.round(c.atk * d); keep.perm.hp += Math.round(c.hp * d); keep.hp += Math.round(c.hp * d);
        say(s, pv(s, p, 'Fusión: 3 × ' + c.name + ' → ★' + keep.gl + ' (' + atk(keep) + '/' + maxHp(keep) + ').', 'El rival fusiona 3 × ' + c.name + ' → ★' + keep.gl + '.'));
        again = true; break;
      }
    }
  }
  function retire(s, p, slot) {
    var P = s.p[p], i = P.mesa[slot];
    if (!s.shopOpen || s.phase !== 'prep' || !i || i.dead) return false;
    if (has(i, 'Lol')) return false;
    if (P.hand.length >= handCap(s)) return false;
    P.mesa[slot] = null; i.hp = maxHp(i); P.hand.push(i);
    delete P.target[i.uid];
    return true;
  }

  // ---------- Preparación ----------
  function place(s, p, handIdx, slot) {
    var P = s.p[p], i = P.hand[handIdx];
    if (s.phase !== 'prep' || !i || !isTroop(i) || P.mesa[slot] || dupBlock(s, p, handIdx)) return false;
    P.hand.splice(handIdx, 1); P.mesa[slot] = i;
    return true;
  }
  // Muere una tropa fuera del combate (daño de acciones): sale de la mesa al momento.
  function dropDead(s, p, i) {
    var P = s.p[p], k = P.mesa.indexOf(i);
    if (s.mode === 'revive') { i.hp = Math.max(1, i.hp); return; } // Resurrección: las acciones no matan, la dejan a 1
    i.dead = true; i.hp = 0;
    if (k >= 0) P.mesa[k] = null;
    P.grave.push(i); delete P.target[i.uid];
  }
  function validTarget(c, i) { return !c.only || has(i, c.only); }
  // Cada acción: ok(s,p,tgt) devuelve '' si se puede jugar o el motivo; run(s,p,tgt) la aplica y devuelve el texto del registro.
  // Nivel de la acción (por repetidas): +50% por nivel sobre su cifra base
  function sc(s, n) { return n; } // las acciones no mejoran con el nivel de carta
  var ACT = {
    entrenamiento: { run: function (s, p, t) { var n = sc(s, 3); grow(t, 'atk', n); return '+' + n + ' ataque permanente'; } },
    armadura: { run: function (s, p, t) { var n = sc(s, 5); grow(t, 'hp', n); return '+' + n + ' vida máxima permanente'; } },
    arenga: { run: function (s, p) { var n = sc(s, 1); mesaTroops(s.p[p]).forEach(function (i) { grow(i, 'atk', n); }); return '+' + n + ' ataque permanente a todas'; } },
    banquete: { run: function (s, p) { var n = sc(s, 2); mesaTroops(s.p[p]).forEach(function (i) { grow(i, 'hp', n); }); return '+' + n + ' vida máxima permanente a todas'; } },
    intimidacion: { run: function (s, p, t) { var n = sc(s, 3); t.perm.atk -= n; return '-' + n + ' ataque permanente'; } },
    'mal-de-ojo': { ok: function (s, p) { return mesaTroops(s.p[1 - p]).length ? '' : 'El rival no tiene tropas.'; }, run: function (s, p) { var n = sc(s, 1); mesaTroops(s.p[1 - p]).forEach(function (i) { i.perm.atk -= n; }); return '-' + n + ' ataque permanente a todas las rivales'; } },
    'golpe-certero': { run: function (s, p, t) { var n = sc(s, 6); t.hp -= n; if (t.hp <= 0) dropDead(s, 1 - p, t); return n + ' de daño'; } },
    lluvia: { ok: function (s, p) { return mesaTroops(s.p[1 - p]).length ? '' : 'El rival no tiene tropas.'; }, run: function (s, p) { var n = sc(s, 2); mesaTroops(s.p[1 - p]).forEach(function (i) { i.hp -= n; if (i.hp <= 0) dropDead(s, 1 - p, i); }); return n + ' de daño a todas las rivales'; } },
    'bola-extra': { ok: function (s, p) { return (tiers(s.p[p])['Pokémon'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de Pokémon (2 cartas distintas).'; }, run: function (s, p) { s.p[p].fl.pk = (s.p[p].fl.pk || 0) + 1; return 'bola extra esta ronda'; } },
    'segundo-aliento': {
      ok: function (s, p) { return mesaTroops(s.p[p]).some(function (i) { return has(i, 'Comebacker') && i.hp < maxHp(i); }) ? '' : 'Ninguna Comebacker en mesa está herida.'; },
      run: function (s, p) { mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Comebacker'); }).forEach(function (i) { i.hp = maxHp(i); }); return 'las Comebacker recuperan su vida'; } },
    'pedir-refuerzos': {
      ok: function (s, p) {
        if (s.p[p].life >= s.p[1 - p].life) return 'Solo si tu vida es menor que la del rival.';
        return s.p[p].hand.length - 1 >= handCap(s) ? 'Tu mano está llena.' : '';
      },
      run: function (s, p) { var id = s.rng() < .5 ? 'lihone-viego' : 'aitorlg-renata'; s.p[p].hand.push(mk(s, id, p)); mergeCheck(s, p); return 'consigues a ' + CARD[id].name; } },
    'cambio-de-linea': { run: function (s, p, t) { var P = s.p[p]; P.mesa[P.mesa.indexOf(t)] = null; t.hp = maxHp(t); t.tmp = { atk: 0, hp: 0, red: 0 }; delete P.target[t.uid]; P.hand.push(t); return 'vuelve a la mano con la vida completa'; } },
    parche: {
      ok: function (s, p) { return s.refreshN[p] >= 5 ? '' : 'Necesitas al menos 5 actualizaciones de tienda en esta partida.'; },
      run: function (s, p) { var P = s.p[p], n = Math.floor(s.refreshN[p] / 5); P.mesa.concat(P.hand).filter(function (i) { return i && isTroop(i) && !i.dead && has(i, 'Informático'); }).forEach(function (i) { grow(i, 'atk', n); }); return '+' + n + ' ataque permanente a las Informático'; } },
    'horas-extra': { run: function (s, p) { var n = sc(s, 5); s.p[p].fl.work = n; return 'si ganas esta ronda: +' + n + ' de oro'; } },
    'capitulo-especial': { ok: function (s, p) { return (tiers(s.p[p])['Anime'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de Anime (2 cartas distintas).'; }, run: function (s, p) { s.p[p].fl.anime = true; return 'lo que cedan tus Anime se duplica'; } },
    'segunda-temporada': {
      ok: function (s, p) { return graveKoi(s.p[p]) ? '' : 'Todavía no ha caído ninguna tropa KOI.'; },
      run: function (s, p) { var P = s.p[p], i = graveKoi(P); P.grave.splice(P.grave.indexOf(i), 1); i.dead = false; i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = maxHp(i); P.hand.push(i); return card(i).name + ' vuelve a tu mano'; } },
    'remate-doble': { ok: function (s, p) { return (tiers(s.p[p])['Voley'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de Voley (2 cartas distintas).'; }, run: function (s, p) { s.p[p].fl.vol = true; return 'tus Voley: ataque doble o defensa total'; } },
    'cita-sorpresa': {
      ok: function (s, p) { return (tiers(s.p[p])['Novia'] || 0) >= 1 && mesaTroops(s.p[p]).length ? '' : 'Necesitas el nivel 1 de Novia (2 cartas distintas) y tropas en mesa.'; },
      run: function (s, p) { var P = s.p[p], t = tiers(P), r = noviaRoll(P, t, mesaTroops(P), s); return r.up ? '¡tu novia te apoya! +' + FX.novia.up[t['Novia'] - 1] + '/+' + FX.novia.up[t['Novia'] - 1] + ' permanente' : '¡tu novia te regaña! -1/-1 esta ronda'; } },
    'rabia-contenida': { run: function (s, p) { var n = sc(s, 1); s.p[p].fl.tilt = n; return 'si ganas esta ronda: +' + n + ' ataque a las Tilt'; } },
    'fiesta-del-pueblo': { ok: function (s, p) { return (tiers(s.p[p])['Pueblo'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de Pueblo (2 cartas distintas).'; }, run: function (s, p) { s.p[p].fl.pueblo = true; return 'el crecimiento del pueblo se duplica'; } },
    'hermano-del-alma': {
      ok: function (s, p) { return duoPartner(s.p[p]) ? '' : 'Necesitas un Dúo Inseparable en la mesa.'; },
      run: function (s, p) { var id = duoPartner(s.p[p]); s.p[p].hand.push(mk(s, id, p)); mergeCheck(s, p); return 'consigues una copia de ' + CARD[id].name; } },
    'sofa-compartido': {
      ok: function (s, p) { var P = s.p[p]; return mesaTroops(P).some(function (i) { return has(i, 'NINI'); }) && P.hand.some(function (i) { return isTroop(i) && has(i, 'NINI'); }) ? '' : 'Necesitas una NINI en la mesa y otra en la mano.'; },
      run: function (s, p) { var P = s.p[p], n = sc(s, 2); mesaTroops(P).concat(P.hand.filter(isTroop)).filter(function (i) { return has(i, 'NINI'); }).forEach(function (i) { grow(i, 'atk', n); grow(i, 'hp', n); }); return '+' + n + '/+' + n + ' permanente a las NINI'; } },
    madrugon: { ok: function (s, p) { return mesaTroops(s.p[p]).some(function (i) { return has(i, 'Pelayos'); }) ? '' : 'Necesitas una Pelayos en la mesa.'; }, run: function (s, p) { s.p[p].fl.pel = true; return 'tus Pelayos atacan primero'; } },
  };
  function graveKoi(P) {
    return P.grave.filter(function (i) { return isTroop(i) && has(i, 'KOI'); }).sort(function (a, b) { return atk(b) - atk(a); })[0] || null;
  }
  function duoPartner(P) {
    var on = mesaTroops(P).filter(function (i) { return has(i, 'Dúo Inseparable'); });
    for (var k = 0; k < on.length; k++) {
      var other = DATA.cards.filter(function (c) { return c.themes.indexOf('Dúo Inseparable') >= 0 && c.id !== on[k].id; })[0];
      if (other) return other.id;
    }
    return null;
  }
  // ¿Se puede jugar esta acción ahora? Devuelve '' o el motivo.
  function actionBlock(s, p, c, tgt) {
    if (s.phase !== 'prep' || s.over) return 'Ahora no se puede.';
    if (s.shopOpen) return 'Las acciones se juegan en las rondas de combate.';
    if (c.target !== 'none' && !tgt) return c.target === 'ally' ? 'Esa acción va sobre una tropa tuya.' : 'Esa acción va sobre una tropa rival.';
    if (tgt && !validTarget(c, tgt)) return 'Solo vale sobre tropas ' + c.only + '.';
    var a = ACT[c.id];
    return a && a.ok ? a.ok(s, p, tgt) : '';
  }
  function playAction(s, p, handIdx, targetUid) {
    var P = s.p[p], i = P.hand[handIdx];
    s.err = '';
    if (!i || isTroop(i)) return false;
    var c = card(i), tgt = null;
    if (c.target === 'ally') tgt = P.mesa.filter(alive).filter(function (x) { return x.uid === targetUid; })[0];
    else if (c.target === 'enemy') tgt = s.p[1 - p].mesa.filter(alive).filter(function (x) { return x.uid === targetUid; })[0];
    var why = actionBlock(s, p, c, tgt);
    if (why) { s.err = why; return false; }
    P.hand.splice(handIdx, 1); P.grave.push(i);
    s.lvl = (s.lv && s.lv[p] && s.lv[p][c.id]) || 1;
    var res = ACT[c.id].run(s, p, tgt);
    s.lvl = 1;
    say(s, pv(s, p, 'Juegas ', 'El rival juega ') + c.name + (tgt ? ' sobre ' + card(tgt).name : '') + ': ' + res + '.');
    s.acts.push({ n: (s.actN = (s.actN || 0) + 1), p: p, id: c.id, res: res, tgt: tgt ? tgt.uid : null });
    return true;
  }
  function setTarget(s, p, uid, targetUid) {
    var P = s.p[p];
    if (targetUid == null) delete P.target[uid]; else P.target[uid] = targetUid;
  }
  function forfeit(s, p, reason) {
    if (s.over) return;
    s.over = true; s.phase = 'over'; s.shopOpen = false; s.winner = 1 - p; s.reason = reason;
    say(s, reason);
  }
  function clearTargets(s, p) { s.p[p].target = {}; }
  function setVoley(s, p, uid, mode) { s.p[p].voley[uid] = mode; }

  // ---------- IA ----------
  function aiShop(s, p) {
    var P = s.p[p];
    if (!s.shopOpen) return;
    var guard = 0, refreshes = 0;
    while (guard++ < 14) {
      var best = -1, bestScore = -1, troopsHeld = P.hand.filter(isTroop).length + mesaTroops(P).length;
      P.offers.forEach(function (id, k) {
        var c = CARD[id];
        if (!c || c.cost > P.gold || P.hand.length >= handCap(s)) return;
        var score = c.type === 'tropa' ? (c.atk + c.hp * 0.45) / (1 + c.cost * 0.25) + (troopsHeld < 4 ? 6 : 0) : 1.5;
        score += s.rng() * 0.8;
        if (score > bestScore) { bestScore = score; best = k; }
      });
      if (best >= 0) { buy(s, p, best); continue; }
      if (troopsHeld < 4 && refreshes < 3 && P.gold >= refreshCost(s, p) + 1 && P.hand.length < handCap(s)) { if (refresh(s, p)) { refreshes++; continue; } }
      break;
    }
  }
  function aiPrep(s, p) {
    var P = s.p[p], me = P;
    var guard = 0;
    while (guard++ < 6) {
      var slot = P.mesa.indexOf(null);
      if (slot < 0) break;
      var best = -1, bs = -1;
      P.hand.forEach(function (i, k) { if (isTroop(i) && !dupBlock(s, p, k)) { var sc = atk(i) + maxHp(i) * 0.6 + s.rng(); if (sc > bs) { bs = sc; best = k; } } });
      if (best < 0) break;
      place(s, p, best, slot);
    }
    for (var k = P.hand.length - 1; k >= 0; k--) {
      var i = P.hand[k];
      if (isTroop(i)) continue;
      var c = card(i), allies = mesaTroops(P), foes = mesaTroops(s.p[1 - p]);
      if (c.id === 'cambio-de-linea' || c.id === 'capitulo-especial') continue; // la IA no las usa
      var tgt = null;
      if (c.target === 'ally') { allies.sort(function (a, b) { return atk(b) - atk(a); }); tgt = allies[0]; if (c.id === 'armadura') tgt = allies.slice().sort(function (a, b) { return maxHp(b) - maxHp(a); })[0]; }
      else if (c.target === 'enemy') {
        foes.sort(function (a, b) { return atk(b) - atk(a); }); tgt = foes[0];
        if (c.id === 'golpe-certero') tgt = foes.filter(function (f) { return f.hp <= 6; })[0] || foes[0];
      }
      if (c.target !== 'none' && !tgt) continue;
      playAction(s, p, k, tgt ? tgt.uid : null);
    }
    // Voley: ataca salvo que esté en desventaja numérica
    mesaTroops(P).forEach(function (i) { if (has(i, 'Voley')) P.voley[i.uid] = s.rng() < 0.7 ? 'atk' : 'def'; });
  }
  // Reparto coordinado: concentra el daño para rematar tropas (primero las más peligrosas).
  function aiTargets(s, p) {
    var P = s.p[p], foes = mesaTroops(s.p[1 - p]).map(function (f) { return { f: f, rem: f.hp }; });
    if (!foes.length) return;
    mesaTroops(P).sort(function (a, b) { return atk(b) - atk(a); }).forEach(function (i) {
      var a = atk(i);
      var kills = foes.filter(function (x) { return x.rem > 0 && a >= x.rem; }).sort(function (x, y) { return atk(y.f) - atk(x.f); });
      var alive = foes.filter(function (x) { return x.rem > 0; }).sort(function (x, y) { return x.rem - y.rem; });
      var pick = kills[0] || alive[0] || foes[0];
      pick.rem -= a; P.target[i.uid] = pick.f.uid;
    });
  }
  // Mazo de la IA: elige 3 temáticas y llena el mazo con las cartas que más encajan.
  function aiDeck(rng) {
    var themes = Object.keys(DATA.themes), pick = [];
    while (pick.length < 3) { var t = themes[Math.floor(rng() * themes.length)]; if (pick.indexOf(t) < 0) pick.push(t); }
    var sc = DATA.cards.map(function (c) { return { c: c, v: c.themes.filter(function (t) { return pick.indexOf(t) >= 0; }).length * 10 + rng() * 6 }; }).sort(function (a, b) { return b.v - a.v; });
    var com = sc.filter(function (x) { return x.c.rarity === 'Común'; }).slice(0, 2);
    var order = com.concat(sc.filter(function (x) { return com.indexOf(x) < 0; })), deck = [], used = 0;
    order.forEach(function (x) { if (used + x.c.size <= CFG.deckBudget - 2) { deck.push(x.c.id); used += x.c.size; } });
    DATA.actions.slice().sort(function () { return rng() - .5; }).forEach(function (a) { if (used + a.size <= CFG.deckBudget && deck.length < 20) { deck.push(a.id); used += a.size; } });
    return deck;
  }

  // ---------- Combate ----------
  function viewOf(s) {
    return {
      round: s.round,
      life: [s.p[0].life, s.p[1].life],
      mesa: s.p.map(function (P) {
        return P.mesa.map(function (i) {
          return i ? { uid: i.uid, id: i.id, atk: atk(i), hp: Math.max(0, i.hp), max: maxHp(i), dead: !!i.dead, red: i.tmp.red, baseAtk: card(i).atk, baseHp: card(i).hp } : null;
        });
      }),
    };
  }
  function frame(s, text, hl) { s.frames.push({ text: text, view: viewOf(s), hl: hl || null }); say(s, text); }

  function fxFrame(s, p, type, title, sub, uids, neg) {
    frame(s, pv(s, p, '', 'Rival · ') + title + (sub ? ' ' + sub : ''), { fx: { type: type, side: p, title: title, sub: sub || '', uids: uids || [], neg: !!neg } });
  }
  // Ganancia permanente con tope por tropa y temática. stat: 'atk' | 'hp' | 'both'. Devuelve lo realmente ganado.
  function gainCap(i, key, stat, n, cap) {
    var g = Math.min(n, cap - (i.caps[key] || 0));
    if (g <= 0) return 0;
    i.caps[key] = (i.caps[key] || 0) + g;
    if (stat !== 'hp') grow(i, 'atk', g);
    if (stat !== 'atk') grow(i, 'hp', g);
    return g;
  }
  function grow(i, stat, n) {
    if (stat === 'atk') i.perm.atk += n;
    else { i.perm.hp += n; i.hp += n; }
  }

  function noviaRoll(P, t, troops, s) {
    var nt = t['Novia'] - 1, up = s.rng() < FX.novia.p[nt];
    troops.forEach(function (i) {
      if (up) gainCap(i, 'nov', 'both', FX.novia.up[nt], FX.novia.cap);
      else {
        var da = Math.min(FX.novia.down, atk(i) - 1), dh = Math.min(FX.novia.down, maxHp(i) - 1);
        if (da > 0) i.tmp.atk -= da;
        if (dh > 0) { i.tmp.hp -= dh; i.hp = Math.min(i.hp, maxHp(i)); }
      }
    });
    return { up: up };
  }

  function startEffects(s) {
    var T = [tiers(s.p[0]), tiers(s.p[1])];
    s.tiers = T;
    [0, 1].forEach(function (p) {
      var P = s.p[p], t = T[p], troops = mesaTroops(P), who = p === 0 ? 'Tus' : 'Las del rival';
      // Dúo
      if ((t['Dúo Inseparable'] || 0) >= 1) {
        var duos = troops.filter(function (i) { return has(i, 'Dúo Inseparable'); });
        if (duos.length >= 2) {
          var du = duos.filter(function (i) { return gainCap(i, 'duo', 'both', FX.duo.stat, FX.duo.cap) > 0; });
          if (du.length) fxFrame(s, p, 'duo', 'Dúo Inseparable', '+' + FX.duo.stat + '/+' + FX.duo.stat + ' permanente', du.map(function (i) { return i.uid; }));
        }

      }
      // Informático nivel 3: +1/+1 permanente por cada actualización de tienda de la partida (se acredita lo que falta)
      if ((t['Informático'] || 0) >= 3) {
        var infN = Math.floor(s.refreshN[p] / 3);
        var inf = troops.filter(function (i) { return has(i, 'Informático') && (i.caps.inf || 0) < infN; });
        if (inf.length) {
          inf.forEach(function (i) { var d = infN - (i.caps.inf || 0); i.caps.inf = infN; grow(i, 'atk', d); grow(i, 'hp', d); });
          fxFrame(s, p, 'inf', 'Actualizaciones', '+1/+1 por cada 3 actualizaciones de tienda (' + s.refreshN[p] + ' en total)', inf.map(function (i) { return i.uid; }));
        }
      }
      // Mertens PRIME: Pereza contagiosa, -1/-1 permanente a las tropas rivales (tope -4/-4)
      if (troops.some(function (i) { return pas(i) === 'pereza'; })) {
        var pz = mesaTroops(s.p[1 - p]).filter(function (i) { var d = Math.min(1, 4 - (i.caps.mert || 0)); if (d <= 0) return false; i.caps.mert = (i.caps.mert || 0) + d; i.perm.atk -= d; i.perm.hp -= d; i.hp = Math.min(i.hp, maxHp(i)); return true; });
        if (pz.length) fxFrame(s, p, 'pereza', 'Pereza contagiosa', '-1/-1 permanente a las tropas rivales', pz.map(function (i) { return i.uid; }), true);
      }
      // Pokémon: bola (las acciones pueden añadir bolas extra esta ronda)
      if (t['Pokémon']) {
        for (var bn = 0; bn < 1 + (P.fl.pk || 0); bn++) {
          var pk = troops.filter(function (i) { return has(i, 'Pokémon'); });
          var probs = FX.pokemon.probs[t['Pokémon'] - 1], r = s.rng() * 100, ball = 0;
          if (r < probs[0]) ball = 0; else if (r < probs[0] + probs[1]) ball = 1; else ball = 2;
          s.lastBall[p] = ball;
          var b = FX.pokemon.bonus[ball];
          if (b > 0) pk = pk.filter(function (i) { return gainCap(i, 'pk', 'both', b, FX.pokemon.cap) > 0; });
          troops.filter(function (i) { return pas(i) === 'captura'; }).forEach(function (i) { if (gainCap(i, 'cap', 'both', 1, 6) > 0) fxFrame(s, p, 'captura', 'Captura', '+1/+1 permanente a ' + card(i).name, [i.uid]); });
          if (pk.length) { fxFrame(s, p, 'pokemon', FX.pokemon.names[ball] + (bn ? ' (extra)' : ''), '+' + b + '/+' + b + ' permanente a las Pokémon', pk.map(function (i) { return i.uid; })); s.frames[s.frames.length - 1].hl.fx.ball = ball; }
        }
      }
      // Novia
      if (t['Novia'] && troops.length) {
        var nr = noviaRoll(P, t, troops, s);
        fxFrame(s, p, 'novia', nr.up ? '¡Tu novia te apoya!' : '¡Tu novia te regaña!', nr.up ? '+' + FX.novia.up[t['Novia'] - 1] + '/+' + FX.novia.up[t['Novia'] - 1] + ' permanente a todas' : '-1/-1 esta ronda a todas', troops.map(function (i) { return i.uid; }), !nr.up);
      }
      // Pueblo
      if (t['Pueblo']) {
        var pt = t['Pueblo'] - 1;
        var pu = [];
        troops.filter(function (i) { return has(i, 'Pueblo'); }).forEach(function (i) {
          var g = Math.min(FX.pueblo.per[pt], FX.pueblo.cap[pt] - i.caps.pueblo);
          if (g > 0) { i.caps.pueblo += g; var gg = P.fl.pueblo ? g * 2 : g; grow(i, 'atk', gg); grow(i, 'hp', gg); pu.push(i.uid); }
        });
        if (pu.length) fxFrame(s, p, 'pueblo', 'El pueblo crece', '+' + FX.pueblo.per[pt] * (P.fl.pueblo ? 2 : 1) + '/+' + FX.pueblo.per[pt] * (P.fl.pueblo ? 2 : 1) + ' permanente' + (P.fl.pueblo ? ' (¡fiesta!)' : ''), pu);
      }
      // NINI
      if (t['NINI'] && !hasWork(P)) {
        var ni = [];
        troops.filter(function (i) { return has(i, 'NINI'); }).forEach(function (i) {
          var g = Math.min(FX.nini.per, FX.nini.cap - i.caps.nini);
          if (g > 0) { i.caps.nini += g; grow(i, 'atk', g); grow(i, 'hp', g); ni.push(i.uid); }
        });
        if (ni.length) fxFrame(s, p, 'nini', 'Sin trabajo, sin problemas', '+' + FX.nini.per + '/+' + FX.nini.per + ' permanente', ni);
      }
      // Voley
      if (t['Voley']) {
        var vt = t['Voley'] - 1;
        var vo = [], vd = 0, va = 0;
        troops.filter(function (i) { return has(i, 'Voley'); }).forEach(function (i) {
          var mode = P.voley[i.uid] || 'atk';
          if (mode === 'atk') { i.tmp.atk += FX.voley.atk[vt]; va++; } else { i.tmp.red += FX.voley.red[vt]; vd++; }
          vo.push(i.uid);
        });
        if (vo.length) fxFrame(s, p, 'voley', 'Voley', (va ? '+' + FX.voley.atk[vt] + ' ataque esta ronda en ' + va : '') + (va && vd ? ' · ' : '') + (vd ? '-' + FX.voley.red[vt] + ' daño recibido esta ronda en ' + vd : ''), vo);
      }
    });
    // Comebacker (con los números ya modificados)
    var sums = [0, 1].map(function (p) { return mesaTroops(s.p[p]).reduce(function (a, i) { return a + Math.max(0, i.hp); }, 0); });
    [0, 1].forEach(function (p) {
      var t = T[p];
      if (!t['Comebacker']) return;
      if (sums[p] < sums[1 - p]) {
        var ct = t['Comebacker'] - 1;
        mesaTroops(s.p[p]).forEach(function (i) {
          if (has(i, 'Comebacker')) gainCap(i, 'cb', 'atk', FX.comebacker.atk[ct], FX.comebacker.cap);
          else if (FX.comebacker.others[ct]) gainCap(i, 'cb', 'atk', FX.comebacker.others[ct], FX.comebacker.cap);
        });
        fxFrame(s, p, 'comeback', '¡Remontada!', '+' + FX.comebacker.atk[ct] + ' ataque permanente a las Comebacker', mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Comebacker'); }).map(function (i) { return i.uid; }));
      }
    });
  }

  function order(s) {
    // Ataques de uno en uno, alternando bandos; las Pelayos van siempre al final.
    var f = s.first, seq = [];
    function queues(pel) {
      return [0, 1].map(function (p) { return mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Pelayos') === pel; }); });
    }
    [false, true].forEach(function (pel) {
      var q = queues(pel), a = [q[f], q[1 - f]], k = [0, 0], turn = 0;
      while (k[0] < a[0].length || k[1] < a[1].length) {
        var side = turn % 2;
        if (k[side] >= a[side].length) side = 1 - side;
        seq.push(a[side][k[side]++]);
        turn++;
      }
    });
    return seq;
  }

  function pendingTargets(s, p) {
    p = p || 0;
    var foes = mesaTroops(s.p[1 - p]);
    if (!foes.length) return [];
    var T = s.p[p].target;
    return mesaTroops(s.p[p]).filter(function (i) { return !(T[i.uid] && foes.some(function (f) { return f.uid === T[i.uid]; })); });
  }

  // Efectos al caer una tropa (KOI, Dúo Inseparable). Devuelve texto de registro y animación.
  // ---------- Pasivas de legendarias ----------
  var PAS = { 'javihi-duo': 'duo', 'sech-duo': 'duo', 'javihi-prime': 'remate', 'sech': 'embargo', 'potango': 'aliento', 'mertens-prime': 'pereza', 'chipy-lloron': 'llanto', 'lihone-viego': 'racha', 'aitorlg-renata': 'prorroga', 'haikyuu-lihone': 'saque', 'lihone': 'captura', 'chipy-correa': 'consuelo' };
  function pas(i) { return PAS[i.id] || ''; }
  function duoLinked(s, i) { var o = i.id === 'javihi-duo' ? 'sech-duo' : 'javihi-duo'; return mesaTroops(s.p[i.owner]).some(function (x) { return x.id === o; }); }
  // Prórroga (AitoRLG Renata): la tropa a su derecha no cae a 0 de vida hasta que haya atacado
  function wardSave(s, v) {
    if (v.dead || v.tmp.acted || v.tmp.noAtk) return false;
    if (v.tmp.ward) { v.hp = 0; return true; }
    var P = s.p[v.owner], k = P.mesa.indexOf(v), r = k > 0 ? P.mesa[k - 1] : null;
    if (!r || r.dead || pas(r) !== 'prorroga') return false;
    v.tmp.ward = true; v.hp = 0; return true;
  }
  // Daño de pasiva a una tropa (sin contraataque). Devuelve texto de registro.
  function passiveHit(s, v, n, depth) {
    if (!v || v.dead || n <= 0) return '';
    v.hp -= n;
    var tv = s.tiers[v.owner];
    if (has(v, 'Tilt') && tv && tv['Tilt']) gainCap(v, 'tilt', 'atk', FX.tilt.hit[tv['Tilt'] - 1], FX.tilt.cap);
    var out = ' ' + card(v).name + ' -' + n + '.';
    if (v.hp <= 0 && wardSave(s, v)) out += ' ¡Aguanta a 0 de vida hasta atacar!';
    else if (v.hp <= 0) { v.dead = true; v.hp = 0; out += ' ¡Cae!'; out += deathFx(s, v, depth + 1).line; }
    return out;
  }
  // Efectos al caer una tropa (KOI, Dúo Inseparable). Devuelve texto de registro y animación.
  function deathFx(s, d, depth) {
    var line = '', fxk = null; depth = depth || 0;
        var tt2 = s.tiers[d.owner];
        if (has(d, 'KOI') && tt2['KOI']) {
          var kb = FX.koi.atk[tt2['KOI'] - 1];
          mesaTroops(s.p[d.owner]).forEach(function (i) { gainCap(i, 'koi', 'atk', kb, FX.koi.cap); });
          line += ' KOI anima al equipo: +' + kb + ' de ataque.';
          fxk = { type: 'koi', side: d.owner, title: '¡KOI anima al equipo!', sub: '+' + kb + ' ataque permanente', uids: mesaTroops(s.p[d.owner]).map(function (i) { return i.uid; }), neg: false };
        }
        if (has(d, 'Dúo Inseparable') && tt2['Dúo Inseparable']) {
          var dd = mesaTroops(s.p[d.owner]).filter(function (i) { return has(i, 'Dúo Inseparable'); });
          dd.forEach(function (i) { gainCap(i, 'duo', 'atk', FX.duo.death, FX.duo.cap); });
          if (dd.length && !fxk) fxk = { type: 'duo', side: d.owner, title: 'Su dúo se ha roto', sub: '+' + FX.duo.death + ' ataque', uids: dd.map(function (i) { return i.uid; }), neg: false };
        }
    if (pas(d) === 'llanto' && depth < 4) { // Chipy Llorón: la mitad de su ataque a todas las tropas rivales
      var ln = Math.ceil(atk(d) / 2), lf = mesaTroops(s.p[1 - d.owner]);
      if (lf.length && ln > 0) { line += ' Llanto final: ' + ln + ' de daño a todas las tropas rivales.'; lf.forEach(function (f) { line += passiveHit(s, f, ln, depth); }); }
    }
    return { line: line, fx: fxk };
  }
  function fight(s) {
    if (s.phase !== 'prep' || s.over || s.shopOpen) return false;
    if (pendingTargets(s, 0).length || (s.pvp && pendingTargets(s, 1).length)) return false;
    s.shopOpen = false;
    s.frames = [];
    s.fightN = (s.fightN || 0) + 1;
    if (!s.pvp) aiTargets(s, 1);
    frame(s, 'Empieza el combate. ' + pv(s, s.first, 'Atacas primero.', 'Ataca primero el rival.'), null);
    startEffects(s);
    var seq = order(s);
    // Madrugón: las Pelayos de quien lo jugó atacan las primeras
    var firstPel = [];
    [s.first, 1 - s.first].forEach(function (p) { if (s.p[p].fl.pel) firstPel = firstPel.concat(seq.filter(function (i) { return i.owner === p && has(i, 'Pelayos'); })); });
    if (firstPel.length) seq = firstPel.concat(seq.filter(function (i) { return firstPel.indexOf(i) < 0; }));
    // Remate doble: los Voley en ataque golpean dos veces; en defensa no atacan y reciben como mucho 1
    var dbl = {};
    [0, 1].forEach(function (p) {
      var P = s.p[p]; if (!P.fl.vol) return;
      mesaTroops(P).filter(function (i) { return has(i, 'Voley'); }).forEach(function (i) {
        if ((P.voley[i.uid] || 'atk') === 'def') { i.tmp.noAtk = true; i.tmp.cap1 = true; } else dbl[i.uid] = true;
      });
    });
    if (Object.keys(dbl).length) { var sq2 = []; seq.forEach(function (i) { sq2.push(i); if (dbl[i.uid]) sq2.push(i); }); seq = sq2; }
    // Aliento final (PotAnGo): tras su ataque de última hora, cae
    function finishDying(u) {
      if (!u.tmp.dying) return;
      u.tmp.dying = false;
      if (u.dead) return;
      u.dead = true; u.hp = 0;
      var dd = deathFx(s, u, 0);
      frame(s, card(u).name + ' cae.' + dd.line, { fx: dd.fx });
    }
    for (var n = 0; n < seq.length && !s.over; n++) {
      var a = seq[n];
      if ((a.dead && !a.tmp.dying) || a.tmp.noAtk) continue;
      a.tmp.acted = true;
      var P = s.p[a.owner], E = s.p[1 - a.owner], foes = mesaTroops(E);
      var tgt = null, retarget = false;
      if (P.target[a.uid]) tgt = foes.filter(function (f) { return f.uid === P.target[a.uid]; })[0] || null;
      if (!tgt && foes.length) { tgt = foes[Math.floor(s.rng() * foes.length)]; retarget = !!P.target[a.uid]; }
      if (!tgt && a.tmp.loan != null) delete a.tmp.loan;
      var dmg = atk(a);
      if (!tgt) {
        E.life -= dmg;
        frame(s, card(a).name + ' golpea directamente: ' + dmg + ' de daño a ' + pv(s, a.owner, 'la vida del rival', 'tu vida') + '.', { att: a.uid, life: 1 - a.owner, dmg: dmg });
        if (E.life <= 0) { s.over = true; s.phase = 'over'; s.winner = a.owner; s.reason = 'Vida a cero.'; break; }
        if (a.tmp.ward) { a.tmp.ward = false; a.dead = true; a.hp = 0; frame(s, card(a).name + ' no derriba a nadie y cae.' + deathFx(s, a, 0).line, null); }
        finishDying(a);
        continue;
      }
      var fxk = null, real = Math.max(0, dmg - tgt.tmp.red);
      if (tgt.tmp.cap1) real = Math.min(real, 1);
      tgt.hp -= real;
      var line = card(a).name + (retarget ? ' (su objetivo ya cayó) ataca a ' : ' ataca a ') + card(tgt).name + ': ' + real + ' de daño' + (tgt.tmp.red && real < dmg ? ' (reducido)' : '') + '.';
      if (real > 0) {
        var ta = s.tiers[a.owner], tt = s.tiers[tgt.owner];
        if (has(a, 'Lol') && ta['Lol']) {
          var li = ta['Lol'] - 1, ga = Math.min(FX.lol.atk[li], FX.lol.cap[li] - a.caps.lol);
          if (ga > 0) { a.caps.lol += ga; grow(a, 'atk', ga); if (FX.lol.hp[li]) grow(a, 'hp', Math.min(FX.lol.hp[li], ga)); }
        }
        if (has(a, 'Pelayos') && ta['Pelayos']) {
          var gp = Math.min(Math.ceil(real / 2), FX.pelayos.cap - a.caps.pel);
          if (gp > 0) { a.caps.pel += gp; grow(a, 'atk', gp); grow(a, 'hp', gp); line += ' +' + gp + '/+' + gp + ' (Pelayos)'; }
        }
        if (has(tgt, 'Tilt') && tt['Tilt']) {
          gainCap(tgt, 'tilt', 'atk', FX.tilt.hit[tt['Tilt'] - 1], FX.tilt.cap);
        }
      }
      if (tgt.hp <= 0 && wardSave(s, tgt)) {
        line += ' ¡Prórroga! ' + card(tgt).name + ' aguanta a 0 de vida hasta que ataque.';
      } else if (tgt.hp <= 0 && pas(tgt) === 'aliento' && !tgt.tmp.acted && !tgt.tmp.noAtk && !tgt.tmp.dying && !tgt.dead) {
        tgt.tmp.dying = true; line += ' ¡Aliento final! ' + card(tgt).name + ' ataca antes de caer.'; seq.splice(n + 1, 0, tgt);
      } else if (tgt.hp <= 0) {
        tgt.dead = true; tgt.hp = 0; line += ' ¡Cae!';
        var df = deathFx(s, tgt); line += df.line; fxk = df.fx;
      }
      // Pasivas al golpear (Dúo en sintonía, Embargo)
      var plife = null, pdmg = 0;
      if (real > 0 && pas(tgt) === 'duo' && duoLinked(s, tgt)) {
        var dn = Math.ceil(real / 2);
        line += ' Dúo en sintonía: ' + dn + ' de daño a todas las tropas rivales.';
        mesaTroops(s.p[a.owner]).forEach(function (v) { line += passiveHit(s, v, dn, 0); });
      }
      if (tgt.dead && pas(a) === 'embargo' && !a.dead) {
        E.life -= 2; P.gold += 1; plife = tgt.owner; pdmg = 2;
        line += ' Embargo: ' + pv(s, a.owner, 'el rival pierde 2 de vida y ganas 1 de oro.', 'pierdes 2 de vida y el rival gana 1 de oro.');
      }
      // Prórroga: la tropa protegida debe derribar a una rival con su ataque o cae
      if (a.tmp.ward) {
        a.tmp.ward = false;
        if (tgt.dead && !a.dead) { var wh = Math.max(1, Math.floor(maxHp(a) / 2)); a.hp = wh; line += ' Prórroga: ' + card(a).name + ' recupera ' + wh + ' de vida.'; }
        else if (!a.dead) { a.dead = true; a.hp = 0; line += ' ' + card(a).name + ' no derriba a nadie y cae.'; var dw = deathFx(s, a); line += dw.line; if (!fxk) fxk = dw.fx; }
      }
      // Racha de bajas (Lihone Viego): al derrotar a una tropa toma su ataque y vuelve a atacar
      if (pas(a) === 'racha') {
        if (tgt.dead && !a.dead && mesaTroops(E).length) { a.tmp.loan = atk(tgt); line += ' Racha de bajas: toma ' + a.tmp.loan + ' de ataque y vuelve a atacar.'; seq.splice(n + 1, 0, a); }
        else if (tgt.dead && !a.dead) { // mató a la última tropa rival: su ataque golpea al jugador rival
          var rd = atk(tgt);
          if (rd > 0) { E.life -= rd; plife = tgt.owner; pdmg = rd; line += ' Racha de bajas: toma ' + rd + ' de ataque y golpea ' + pv(s, a.owner, 'la vida del rival', 'tu vida') + '.'; }
          if (a.tmp.loan != null) delete a.tmp.loan;
        }
        else if (a.tmp.loan != null) { delete a.tmp.loan; line += ' Recupera su ataque.'; }
      }
      // Resurrección: la carta que ataca también recibe el ataque de la carta atacada (contraataque)
      var rec = 0;
      if (s.mode === 'revive') {
        rec = Math.max(0, atk(tgt) - a.tmp.red);
        if (a.tmp.cap1) rec = Math.min(rec, 1);
        if (rec > 0) {
          if (!a.dead) a.hp -= rec; line += ' Contraataque: ' + card(a).name + ' recibe ' + rec + '.';
          var ta2 = s.tiers[a.owner];
          if (has(a, 'Tilt') && ta2['Tilt']) gainCap(a, 'tilt', 'atk', FX.tilt.hit[ta2['Tilt'] - 1], FX.tilt.cap);
          if (a.hp <= 0 && !a.dead && wardSave(s, a)) { line += ' (aguanta a 0 de vida)'; }
          else if (a.hp <= 0 && !a.dead) { a.dead = true; a.hp = 0; line += ' ¡Cae!'; var df2 = deathFx(s, a); line += df2.line; if (!fxk) fxk = df2.fx; }
        }
      }
      if (pas(a) === 'saque' && (P.voley[a.uid] || 'atk') !== 'def') { // Haikyuu Lihone: el saque golpea a las tropas contiguas al objetivo
        var sk = E.mesa.indexOf(tgt);
        [sk - 1, sk + 1].forEach(function (q) { var v = q >= 0 ? E.mesa[q] : null; if (v && !v.dead) { line += ' Saque:'; line += passiveHit(s, v, 1, 0); } });
      }
      if (pas(a) === 'remate') { // Javihi Prime: el balón rebota a otra tropa rival
        var rb = mesaTroops(E).filter(function (x) { return x !== tgt; });
        if (rb.length) { var rv = rb[Math.floor(s.rng() * rb.length)], rn = Math.ceil(atk(a) / 2); line += ' Remate: rebota ' + rn + ' en ' + card(rv).name + '.'; line += passiveHit(s, rv, rn, 0); }
      }
      frame(s, line, { att: a.uid, tgt: tgt.uid, dmg: real, rec: rec, retarget: retarget, fx: fxk, plife: plife, pdmg: pdmg });
      if (E.life <= 0 && !s.over) { s.over = true; s.phase = 'over'; s.winner = a.owner; s.reason = 'Vida a cero.'; break; }
      finishDying(a);
    }
    if (!s.over) {
      // Tilt: si pierdes la ronda (menos tropas vivas), parte del ataque se queda
      var al = [mesaTroops(s.p[0]).length, mesaTroops(s.p[1]).length];
      [0, 1].forEach(function (p) {
        var t = s.tiers[p];
        if (t['Tilt'] && al[p] < al[1 - p]) {
          mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Tilt'); }).forEach(function (i) {
            gainCap(i, 'tilt', 'atk', FX.tilt.perm[t['Tilt'] - 1], FX.tilt.cap);
          });
          fxFrame(s, p, 'tilt', 'Tilt', 'conservan ataque tras perder la ronda', mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Tilt'); }).map(function (i) { return i.uid; }));
        }
      });
      [0, 1].forEach(function (p) {
        var P = s.p[p], won = al[p] > al[1 - p];
        if (P.fl.work && won) { var wg = P.fl.work === true ? 5 : P.fl.work; P.gold += wg; fxFrame(s, p, 'trabajo', 'Horas extra', '+' + wg + ' de oro por ganar la ronda', []); }
        if (P.fl.tilt && won) {
          var tl = mesaTroops(P).filter(function (i) { return has(i, 'Tilt'); });
          var tg = P.fl.tilt === true ? 1 : P.fl.tilt;
          tl.forEach(function (i) { grow(i, 'atk', tg); });
          if (tl.length) fxFrame(s, p, 'tilt', 'Rabia contenida', '+' + tg + ' ataque permanente a las Tilt', tl.map(function (i) { return i.uid; }));
        }
      });
      // Dúo en sintonía: si acaban las dos vivas, el jugador se cura 1
      [0, 1].forEach(function (p) {
        var m = mesaTroops(s.p[p]);
        if (m.some(function (i) { return i.id === 'javihi-duo'; }) && m.some(function (i) { return i.id === 'sech-duo'; })) {
          var ML = s.maxLife || CFG.life;
          if (s.p[p].life < ML) { s.p[p].life += 1; fxFrame(s, p, 'duo', 'Dúo en sintonía', '+1 de vida', m.filter(function (i) { return pas(i) === 'duo'; }).map(function (i) { return i.uid; })); }
        }
      });
      cleanup(s);
      frame(s, 'Fin de la ronda ' + s.round + '.', null);
      s.phase = 'post';
      [0, 1].forEach(function (p) {
        if (p === 1 && !s.pvp) return;
        var t0 = tiers(s.p[p]);
        var an = t0['Anime'] ? FX.anime.cede[t0['Anime'] - 1] : 0;
        s.p[p].anime = mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Anime'); }).length >= 2 ? an : 0;
      });
    } else {
      frame(s, pv(s, s.winner, '¡Has ganado!', 'Has perdido.'), null);
    }
  }

  function cleanup(s) {
    s.p.forEach(function (P) {
      P.mesa.forEach(function (i, k) {
        if (!i) return;
        if (s.mode === 'revive') { i.dead = false; i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = maxHp(i); return; } // Resurrección: todas vuelven con la vida completa
        if (i.dead || i.hp <= 0) { P.grave.push(i); P.mesa[k] = null; delete P.target[i.uid]; return; }
        i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = Math.min(i.hp, maxHp(i)); // sin curación entre rondas
      });
      P.hand.forEach(function (i) { if (isTroop(i)) { i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = maxHp(i); } });
      P.target = {}; P.voley = {};
    });
  }

  // ---------- Anime: ceder estadísticas al final de la ronda ----------
  function cede(s, from, to, stat, seat) {
    var P = s.p[seat || 0];
    if (s.phase !== 'post' || P.anime <= 0 || from === to) return false;
    var a = P.mesa.filter(function (i) { return i && i.uid === from && has(i, 'Anime'); })[0];
    var b = P.mesa.filter(function (i) { return i && i.uid === to && has(i, 'Anime'); })[0];
    if (!a || !b) return false;
    var keep = P.hand.some(function (i) { return i && i.id === 'chipy-correa'; }) ? 1 : 0; // Chipy Correa en la mano: nadie se queda a 0
    if (stat === 'atk') {
      var v = atk(a) - keep;
      if (v <= 0) return false;
      var mul = P.fl.anime ? 2 : 1;
      a.perm.atk -= v; b.perm.atk += v * mul;
      say(s, card(a).name + ' cede ' + v * mul + ' de ataque a ' + card(b).name + '.');
    } else {
      var mul2 = P.fl.anime ? 2 : 1, m = maxHp(a), g = Math.floor(m / 2) * mul2;
      if (keep && m <= 1) return false;
      b.perm.hp += g; b.hp += g;
      if (keep) { a.perm.hp -= m - 1; a.hp = 1; say(s, card(a).name + ' cede su vida y se queda con 1; ' + card(b).name + ' gana +' + g + ' de vida máxima.'); }
      else {
        P.mesa[P.mesa.indexOf(a)] = null; P.grave.push(a);
        say(s, card(a).name + ' cede su vida y cae; ' + card(b).name + ' gana +' + g + ' de vida máxima.');
      }
    }
    P.anime--;
    return true;
  }

  function endShop(s) {
    if (!s.shopOpen || s.phase !== 'prep' || s.over) return false;
    s.shopOpen = false;
    advance(s);
    return true;
  }
  function nextRound(s) {
    if (s.phase !== 'post' || s.over) return;
    advance(s);
  }
  function advance(s) {
    if (s.round >= CFG.maxRounds) {
      s.over = true; s.phase = 'over'; s.reason = 'Límite de rondas.';
      s.winner = s.p[0].life === s.p[1].life ? 1 : (s.p[0].life > s.p[1].life ? 0 : 1);
      return;
    }
    startRound(s);
  }

  // ---------- 1 vs 1 online: copia de la partida vista desde un asiento ----------
  // La partida canónica vive en el servidor. mirror(s, seat) devuelve una copia en la que "tú" siempre eres p[0]
  // (para asiento 1 se intercambian bandos y se invierte el bit bajo de los uid, que codifica el dueño).
  function revive(s) { return bindRng(s); }
  function mirror(s, seat) {
    var c = JSON.parse(JSON.stringify(s, function (k, v) { return k === 'rng' ? undefined : v; }));
    var sw = seat === 1;
    function txt(x) { return typeof x !== 'string' ? x : x.replace(/\u0001(\d)\u0002([^\u0002]*)\u0002([^\u0003]*)\u0003/g, function (m, p, a, b) { return +p === seat ? a : b; }); }
    function fu(u) { return sw && !s.uidm && typeof u === 'number' ? u ^ 1 : u; }
    function fobj(o) { if (!sw) return o; var r = {}; Object.keys(o).forEach(function (k) { r[fu(+k)] = o[k]; }); return r; }
    c.log.forEach(function (l) { l.text = txt(l.text); });
    c.reason = txt(c.reason);
    c.frames.forEach(function (f) { f.text = txt(f.text); });
    if (sw) {
      c.p.reverse();
      ['lastBall', 'refreshN', 'tiers', 'uidn', 'lv', 'sk'].forEach(function (k) { if (c[k]) c[k].reverse(); });
      c.first = 1 - c.first;
      if (c.winner >= 0) c.winner = 1 - c.winner;
      c.p.forEach(function (P) {
        ['mesa', 'hand', 'grave'].forEach(function (z) { P[z].forEach(function (i) { if (i) { i.uid = fu(i.uid); i.owner = 1 - i.owner; } }); });
        var tg = {}; Object.keys(P.target).forEach(function (k) { tg[fu(+k)] = fu(P.target[k]); }); P.target = tg;
        P.voley = fobj(P.voley);
      });
      c.frames.forEach(function (f) {
        f.view.life.reverse(); f.view.mesa.reverse();
        f.view.mesa.forEach(function (row) { row.forEach(function (i) { if (i) i.uid = fu(i.uid); }); });
        var h = f.hl; if (!h) return;
        if (h.att != null) h.att = fu(h.att);
        if (h.tgt != null) h.tgt = fu(h.tgt);
        if (h.life != null) h.life = 1 - h.life;
        if (h.plife != null) h.plife = 1 - h.plife;
        if (h.fx) { h.fx.side = 1 - h.fx.side; h.fx.uids = (h.fx.uids || []).map(fu); }
      });
      (c.acts || []).forEach(function (a) { a.p = 1 - a.p; if (a.tgt != null) a.tgt = fu(a.tgt); });
    }
    // lo que el rival no debe ver
    c.p[1].deck = []; c.p[1].offers = []; c.p[1].target = {}; c.p[1].voley = {};
    c.me = seat;
    return bindRng(c);
  }

  // ---------- Utilidades para la interfaz ----------
  var API = {
    _mk: mk, _startEffects: startEffects, _tiers: tiers,
    bindRng: bindRng, revive: revive, income: income, openShop: openShop, noTroops: noTroops, shopStuck: shopStuck, cleanup: cleanup, newPlayer: newPlayer, resolveText: function (x, seat) { return x.replace(/\u0001(\d)\u0002([^\u0002]*)\u0002([^\u0003]*)\u0003/g, function (m, p, a, b) { return +p === seat ? a : b; }); }, mirror: mirror, pv: pv, CFG: CFG, FX: FX, CARD: CARD, DATA: DATA,
    newGame: newGame, randomDeck: randomDeck, deckSize: deckSize, mulberry32: mulberry32,
    place: place, playAction: playAction, setTarget: setTarget, clearTargets: clearTargets, forfeit: forfeit, setVoley: setVoley, actionBlock: actionBlock, validTarget: validTarget,
    sell: sell, sellValue: sellValue, handCap: handCap, dupBlock: dupBlock, buy: buy, mergeCheck: mergeCheck, willMerge: willMerge, shopOdds: shopOdds, refresh: refresh, refreshCost: refreshCost, pickFromDeck: pickFromDeck, retire: retire,
    aiDeck: aiDeck, aiShop: aiShop, aiPrep: aiPrep, aiTargets: aiTargets, fight: fight, endShop: endShop, pendingTargets: pendingTargets, cede: cede, nextRound: nextRound,
    themeCounts: themeCounts, tiers: tiers, tierOf: tierOf, atk: atk, maxHp: maxHp, card: card, isTroop: isTroop, has: has, mesaTroops: mesaTroops, viewOf: viewOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CartasEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
