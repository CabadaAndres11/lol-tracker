/* Motor del juego de cartas. Sin DOM: se usa igual en el navegador y en Node para simular partidas. */
(function (root) {
  'use strict';
  var DATA = root.CARTAS || (typeof require !== 'undefined' ? require('./cards.js') : null);

  // ---------- Ajustes de balance (todo en un sitio para tocarlo fácil) ----------
  var CFG = {
    slots: 4, handMax: 5, life: 12, gold: 8, income: 2, shopEvery: 3, shopOffers: 5,
    refreshCost: 1, deckBudget: 20, deckMin: 15,
    interest: { per: 5, max: 3 }, // interés (estilo TFT): +1 de oro por cada 'per' de oro que conserves al terminar la ronda, hasta 'max'
    reviveLife: 20, // modo Resurrección: vida inicial (la vida solo se pierde con golpes directos; la carta que ataca recibe el ataque de la atacada)
    merge: [1, 2, 4], // fusión de 3 copias iguales (estilo TFT): multiplicador de las estadísticas base por estrella
    rumble: { act: .18, copy: 2.5, theme: 1.5 }, // Royal Rumble: multiplicadores de la tienda (acciones, copia que ya tienes, temática que ya llevas)
    rarityWeight: { 'Común': 50, 'Rara': 30, 'Épica': 15, 'Legendaria': 5 },
    rarityRamp: { 'Común': -8, 'Rara': 2, 'Épica': 5, 'Legendaria': 3 }, // cambio de peso por cada tienda tras la primera (mín. 10, máx. 40)
  };
  var FX = {
    pokemon: { cap: 1e9, probs: [[70, 25, 5], [45, 40, 15], [25, 45, 30]], bonus: [0, 1, 2], names: ['Pokéball', 'Superball', 'Ultraball'] },
    comebacker: { atk: [1, 2, 2], others: [0, 0, 1], cap: 8 },
    lol: { atk: [1, 1, 2], hp: [0, 1, 2], cap: [4, 6, 8] },
    trabajo: { shop: [0, 0, 2] },
    anime: { store: [0.5, 0.75, 1] }, // Genkidama: fracción del daño recibido que almacenan las Anime, por nivel
    koi: { atk: [1, 1, 2], cap: 5, heir: [0.5, 0.75, 1] }, // mejora al caer (tope por tropa) + herencia: % del ataque de la KOI caída pasa, solo esa ronda, a una KOI viva al azar
    voley: { atk: [1, 2, 3], red: [1, 1, 2], cap: 8 },
    novias: { eriko: [2, 3, 4], eCap: [10, 15, 20], helena: [0, 2, 4], lucia: [3, 4, 5], ari: [0.5, 0.6, 0.7] }, // por nivel de Correa // novias del hueco 5 (sinergia Correa)
    gambling: { orbs: [1, 2, 3], probs: [[60, 30, 10], [40, 40, 20], [20, 40, 40]] }, // orbes por ronda sin daño directo; probabilidad (%) de que cada orbe dé +1/+1, +2/+2 o +3/+3
  };

  var CARD = {};
  DATA.cards.concat(DATA.actions, DATA.novias || [], DATA.tokens || []).forEach(function (c) { CARD[c.id] = c; });

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
  // Nivel de carta (copias fuera de la partida). La IA Difícil juega con todo a nivel 2 y la Experto a nivel 3, como mínimo.
  function cardLv(s, owner, id) {
    var L = (s.lv && s.lv[owner] && s.lv[owner][id]) || 1, a = (s.aiLv && s.aiLv[owner]) | 0;
    return a > 0 ? Math.max(L, a + 1) : L;
  }
  function mk(s, id, owner) {
    var c = CARD[id];
    var i = { uid: (s.uidn[owner]++) * (s.uidm || 2) + (s.uidk ? s.uidk[owner] : owner), id: id, owner: owner, gl: 1, perm: { atk: 0, hp: 0 }, tmp: { atk: 0, hp: 0, red: 0 }, dead: false, caps: { lol: 0, pueblo: 0, nini: 0, pel: 0, tilt: 0, pk: 0, duo: 0, nov: 0, cb: 0, vol: 0, koi: 0 } };
    i.hp = c.hp || 0;
    var L = cardLv(s, owner, id);
    if (L > 1 && c.type === 'tropa') { i.perm.atk += L - 1; i.perm.hp += L - 1; i.hp += L - 1; } // nivel de carta: +1/+1 por nivel
    return i;
  }
  function card(i) { return CARD[i.id]; }
  function isTroop(i) { return card(i).type === 'tropa'; }
  function maxHp(i) { return Math.max(1, card(i).hp + i.perm.hp + i.tmp.hp); }
  function atk(i) { if (i.tmp.loan != null) return Math.max(0, i.tmp.loan); return Math.max(0, card(i).atk + i.perm.atk + i.tmp.atk); }
  function has(i, theme) { return card(i).themes.indexOf(theme) >= 0; }
  function alive(i) { return i && !i.dead; }
  // Novias (sinergia Correa): viven en una reserva (P.nvs) y solo una ocupa el hueco 5 (mesa[4]). Helena no puede ser atacada.
  function isNov(i) { return !!(i && CARD[i.id] && CARD[i.id].novia); }
  function immune(i) { return !!(i && i.id === 'helena'); }
  function targetable(P) { return P.mesa.filter(function (i) { return i && !i.dead && !immune(i); }); }
  function novSync(s, p) {
    var P = s.p[p], c = tiers(P)['Correa'] || 0;
    if (!P.nvs) P.nvs = [];
    if (c >= 1 && !P.novGiven) {
      P.novGiven = true;
      (DATA.novias || []).forEach(function (n) { if (!P.nvs.some(function (x) { return x.id === n.id; }) && !(P.mesa[4] && P.mesa[4].id === n.id)) P.nvs.push(mk(s, n.id, p)); });
      say(s, pv(s, p, '¡Sinergia Correa! Se crea un hueco extra y recibes a las 4 novias.', 'El rival crea un hueco extra y sus novias.'));
    }
    if (c < 1 && P.mesa[4]) { s5out(P, P.mesa[4]); P.nvs.push(P.mesa[4]); delete P.target[P.mesa[4].uid]; P.mesa[4] = null; } // sin la sinergia, la novia vuelve a la reserva
    lunarSync(s, p);
    loveSync(s, p);
  }
  // Amor Verdadero (PotAnGo): con Lucía como novia seleccionada duplica sus estadísticas (lo que tenía al activarse); al cambiar de novia vuelve a las originales.
  function loveSync(s, p) {
    var P = s.p[p], nv = P.mesa[4], lucia = !!(nv && !nv.dead && nv.id === 'lucia');
    P.mesa.concat(P.hand).forEach(function (i) {
      if (!i || !isTroop(i)) return;
      var on = lucia && pas(i) === 'amor' && !i.dead && P.mesa.indexOf(i) >= 0;
      if (on && !i.love) {
        i.love = { atk: card(i).atk + i.perm.atk, hp: card(i).hp + i.perm.hp };
        i.perm.atk += i.love.atk; i.perm.hp += i.love.hp; i.hp += i.love.hp;
      } else if (!on && i.love) {
        i.perm.atk -= i.love.atk; i.perm.hp -= i.love.hp; i.hp = Math.max(1, i.hp - i.love.hp); i.love = null;
      }
    });
  }
  // Crescendum (Sech Dúo): con esa arma y Sech Dúo en la mesa hay una torreta 7/7 en el hueco extra 7 (mesa[6]) desde la preparación, para poder elegirle objetivo; se retira al acabar la ronda.
  function lunarSync(s, p) {
    var P = s.p[p], t = P.mesa[6];
    var on = P.arma === 'crescendum' && P.mesa.some(function (i) { return i && !i.dead && PAS[i.id] === 'armas'; });
    if (on && !t) { var tu = mk(s, 'torreta-lunar', p); tu.turret = true; P.mesa[6] = tu; }
    else if (!on && t && t.turret) { delete P.target[t.uid]; P.mesa[6] = null; }
  }
  // Mejora del hueco 5 (acción Regalo): la tiene el hueco, no la novia. Se aplica a la novia que lo ocupe y se retira al salir.
  function s5in(P, i) { var b = P.s5; if (!b || !i) return; i.perm.atk += b.atk; i.perm.hp += b.hp; i.hp += b.hp; }
  function s5out(P, i) { var b = P.s5; if (!b || !i) return; i.perm.atk -= b.atk; i.perm.hp -= b.hp; i.hp = Math.max(1, i.hp - b.hp); }
  // Novia que cae: en clásico queda eliminada para el resto de la partida (ya no se puede elegir); la mejora del hueco 5 se queda en el hueco.
  function novLose(P, i) { i.dead = true; i.hp = 0; delete P.target[i.uid]; P.novDead = (P.novDead || []).concat([i.id]); }

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
      if (!i || !isTroop(i) || i.dead || i.shadow || seen[i.id]) return;
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

  // Royal Rumble: el "mazo" es todo el juego (tropas y acciones)
  function rumbleDeck() { return DATA.cards.concat(DATA.actions).map(function (c) { return c.id; }); }

  function newPlayer(deck) {
    return { life: CFG.life, gold: CFG.gold, deck: deck.slice(), hand: [], mesa: [null, null, null, null, null, null, null], nvs: [], novGiven: false, grave: [], target: {}, voley: {}, fl: {}, offers: [], refreshes: 0, pickUsed: false, anime: 0, gen: 0, lost: false };
  }

  function newGame(deckA, deckB, seed, opts) {
    var s = { rs: (seed == null ? (Date.now() & 0xffffff) : seed) | 0, uidn: [1, 1], fightN: 0, round: 0, shops: 0, phase: 'prep', shopOpen: false, first: 0, over: false, winner: -1, reason: '', log: [], frames: [], p: [newPlayer(deckA), newPlayer(deckB)], lastBall: [null, null], refreshN: [0, 0], err: '', acts: [] };
    bindRng(s);
    if (opts && opts.pvp) s.pvp = true;
    if (opts && opts.ai) s.aiLv = [(opts.aiA | 0), opts.ai | 0]; // dificultad de la IA por jugador: 0 Normal, 1 Difícil, 2 Experto
    if (opts && opts.mode === 'rumble') { // Royal Rumble: Resurrección sin mazo (sale todo el juego, más tropas y menos acciones)
      s.rumble = true; opts = Object.assign({}, opts, { mode: 'revive' });
      s.p.forEach(function (P) { P.deck = rumbleDeck(); });
    }
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

  // Interés por oro ahorrado: se cobra al empezar la ronda sobre el oro que te sobró de la anterior (no en la primera)
  function interest(P) { return Math.min(CFG.interest.max, Math.floor(Math.max(0, P.gold) / CFG.interest.per)); }
  function income(s, p) {
    var P = s.p[p], t = tiers(P), g = s.inc || CFG.income, extra = 0, ik = s.round > 1 ? interest(P) : 0;
    P.lastInt = ik; extra += ik;
    if (mesaTroops(P).some(function (i) { return has(i, 'Trabajo'); })) {
      var tw = t['Trabajo'] || 0;
      if (tw === 1 && s.round % 2 === 0) extra = 1;
      else if (tw >= 2) extra = 1;
    }
    P.gold += g + extra;
    return g + extra;
  }

  // Rondas entre tiendas: normalmente una tienda cada 3 rondas (2 combates); en Royal Rumble, una tienda entre cada combate
  function shopEvery(s) { return s.rumble ? 2 : CFG.shopEvery; }
  function startRound(s) {
    s.round++;
    var shopRd = s.round % shopEvery(s) === 1;
    if (!shopRd) s.cn = (s.cn || 0) + 1; // combates jugados hasta ahora (las rondas de tienda no cuentan)
    s.p.forEach(function (P) { pickArma(s, P); });
    s.first = ((s.cn || 0) + (shopRd ? 1 : 0) + (s.first0 || 0)) % 2; // en tienda: quién abrirá el próximo combate
    s.frames = [];
    s.shopOpen = false;
    [0, 1].forEach(function (p) {
      var got = income(s, p);
      if (!s.pvp && s.aiLv) aiBonus(s, p);
      if (p === 0 || s.pvp) say(s, pv(s, p, 'Ronda ' + s.round + ': +' + got + ' de oro' + (s.p[p].lastInt ? ' (incluye +' + s.p[p].lastInt + ' de interés por ahorrar)' : '') + '.', 'El rival cobra +' + got + ' de oro.'));
      s.p[p].target = {}; s.p[p].anime = 0; s.p[p].fl = {};
      genGive(s, p);
    });
    if (shopRd) {
      s.shops++;
      s.shopOpen = true;
      [0, 1].forEach(function (p) { var m = shopStart(s, p); if (m && (p === 0 || s.pvp)) say(s, pv(s, p, m, 'Rival: ' + m)); openShop(s, p); });
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
    lunarSync(s, 0); lunarSync(s, 1);
    if (!s.pvp) { aiShop(s, 1); aiPrep(s, 1); }
    if (s.shopOpen) checkShop(s);
  }

  // ---------- Tienda ----------
  function shopsEff(s) { return s.rumble ? Math.ceil(s.shops * 2 / 3) : s.shops; } // en Rumble hay más tiendas por combate: la progresión de rarezas se ajusta
  function maxedIds(P) {
    var o = {}; P.mesa.concat(P.hand).forEach(function (i) { if (i && isTroop(i) && (i.gl || 1) >= CFG.merge.length) o[i.id] = 1; });
    return o;
  }
  function offerPool(s, p) {
    var P = s.p[p], t = tiers(P);
    var pool = P.deck.filter(function (id) { return CARD[id].type === 'tropa' || true; });
    var elig = pool.filter(function (id) { return !(CARD[id].cost === 5 && CARD[id].type === 'tropa' && shopsEff(s) < 2); });
    if (!elig.length) elig = pool;
    if (s.round === 1) { // tienda inicial: solo tropas comunes
      var cm = pool.filter(function (id) { return CARD[id].type === 'accion' || (CARD[id].type === 'tropa' && CARD[id].rarity === 'Común'); });
      if (cm.some(function (id) { return CARD[id].type === 'tropa'; })) elig = cm;
    }
    var top = maxedIds(P); // las cartas que ya están al máximo (★3 por copias) dejan de salir en la tienda
    var noTop = elig.filter(function (id) { return !top[id]; });
    if (noTop.length) elig = noTop;
    var owned = {}, hc = {};
    if (s.rumble) P.mesa.concat(P.hand).forEach(function (i) { if (i && isTroop(i) && !i.dead) { owned[i.id] = 1; card(i).themes.forEach(function (th) { hc[th] = 1; }); } });
    return elig.map(function (id) {
      var rr = CARD[id].rarity, w = (CFG.rarityWeight[rr] || 10) + (CFG.rarityRamp[rr] || 0) * Math.max(0, shopsEff(s) - 1);
      w = Math.max(rr === 'Común' ? 10 : 1, Math.min(40, w));
      if (s.rumble) { // Royal Rumble: pocas acciones; más probabilidad de repetidas (subir de nivel) y de cartas de tus temáticas
        if (CARD[id].type === 'accion') w *= CFG.rumble.act;
        else {
          if (owned[id]) w *= CFG.rumble.copy;
          else if (CARD[id].themes.some(function (th) { return hc[th]; })) w *= CFG.rumble.theme;
        }
      }
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
    var mx = maxedIds(P), kept = P.frozen ? P.offers.filter(function (id) { return id && !mx[id]; }).slice(0, CFG.shopOffers) : []; // ofertas fijadas: se conservan las que no compraste
    P.frozen = false; P.refreshes = 0; P.pickUsed = false; P.offers = kept;
    while (P.offers.length < CFG.shopOffers) P.offers.push(drawOffer(s, p));
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
  // Fijar las ofertas de la tienda: en la próxima tienda saldrán las que dejes sin comprar (los huecos vendidos se rellenan)
  function freeze(s, p) {
    var P = s.p[p];
    if (!s.shopOpen || s.phase !== 'prep' || s.over) return false;
    P.frozen = !P.frozen;
    return true;
  }
  function refresh(s, p) {
    var P = s.p[p];
    if (!s.shopOpen || s.phase !== 'prep') return false;
    var c = refreshCost(s, p);
    if (P.gold < c) return false;
    P.gold -= c; P.refreshes++; s.refreshN[p]++; P.frozen = false;
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
    if (!i || i.dead || isNov(i) || i.shadow || i.turret) return false;
    if (where === 'mesa') { P.mesa[idx] = null; delete P.target[i.uid]; } else P.hand.splice(idx, 1);
    shadowOrphan(s, p);
    P.gold += sellValue(i);
    novSync(s, p);
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
    novSync(s, p);
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
        if (keep.gl >= CFG.merge.length && s.shopOpen) { // alcanzó el máximo: se retiran sus copias de la tienda actual
          var kid = keep.id;
          for (var oi = 0; oi < P.offers.length; oi++) if (P.offers[oi] === kid) { var nid = drawOffer(s, p), gg = 0; while (nid === kid && gg++ < 20) nid = drawOffer(s, p); P.offers[oi] = nid; }
        }
        again = true; break;
      }
    }
  }
  function retire(s, p, slot) {
    var P = s.p[p], i = P.mesa[slot];
    if (slot === 4 && i && s.phase === 'prep') { s5out(P, i); P.mesa[4] = null; P.nvs.push(i); delete P.target[i.uid]; loveSync(s, p); return true; } // la novia vuelve a la reserva
    if (!s.shopOpen || s.phase !== 'prep' || !i || i.dead || i.shadow || i.turret) return false;
    if (has(i, 'Lol')) return false;
    if (P.hand.length >= handCap(s)) return false;
    P.mesa[slot] = null; P.hand.push(i); // conserva la vida actual
    delete P.target[i.uid]; shadowOrphan(s, p);
    novSync(s, p);
    return true;
  }

  // ---------- Preparación ----------
  function place(s, p, handIdx, slot) {
    var P = s.p[p];
    if (handIdx < 0 || slot === 4) { // novias: handIdx negativo = posición -1-k en la reserva; solo van al hueco 5
      var k = -1 - handIdx, n = (P.nvs || [])[k];
      if (s.phase !== 'prep' || slot !== 4 || !n || (tiers(P)['Correa'] || 0) < 1) return false;
      P.nvs.splice(k, 1);
      if (P.mesa[4]) { s5out(P, P.mesa[4]); P.nvs.push(P.mesa[4]); delete P.target[P.mesa[4].uid]; }
      s5in(P, n); P.mesa[4] = n;
      loveSync(s, p);
      return true;
    }
    var i = P.hand[handIdx];
    if (slot < 0 || slot > 3) return false; // los huecos extra (4: novia, 5: soldado de sombra) no se ocupan a mano con tropas
    if (s.phase !== 'prep' || !i || !isTroop(i) || P.mesa[slot] || dupBlock(s, p, handIdx)) return false;
    P.hand.splice(handIdx, 1); P.mesa[slot] = i;
    if (!i.counted) { i.counted = 1; P.used = (P.used || 0) + 1; } // cartas usadas (para las misiones): cada tropa cuenta una vez
    novSync(s, p);
    return true;
  }
  // Muere una tropa fuera del combate (daño de acciones): sale de la mesa al momento.
  function dropDead(s, p, i) {
    var P = s.p[p], k = P.mesa.indexOf(i);
    if (s.mode === 'revive') { i.hp = Math.max(1, i.hp); return; } // Resurrección: las acciones no matan, la dejan a 1
    if (isNov(i)) { if (k >= 0) P.mesa[k] = null; novLose(P, i); return; } // en clásico, la novia caída queda eliminada
    i.dead = true; i.hp = 0;
    if (k >= 0) P.mesa[k] = null;
    if (!i.shadow && !i.turret) P.grave.push(i);
    delete P.target[i.uid];
  }
  function validTarget(c, i) { if (immune(i) && c.target === 'enemy') return false; return !c.only || has(i, c.only); }
  // Cada acción: ok(s,p,tgt) devuelve '' si se puede jugar o el motivo; run(s,p,tgt) la aplica y devuelve el texto del registro.
  // Nivel de la acción (por repetidas): +50% por nivel sobre su cifra base
  function sc(s, n) { return n; } // las acciones no mejoran con el nivel de carta
  var ACT = {
    entrenamiento: { run: function (s, p, t) { var n = sc(s, 3); grow(t, 'atk', n); return '+' + n + ' ataque permanente'; } },
    armadura: { run: function (s, p, t) { var n = sc(s, 5); grow(t, 'hp', n); return '+' + n + ' vida máxima permanente'; } },
    arenga: { run: function (s, p) { var n = sc(s, 1); mesaTroops(s.p[p]).forEach(function (i) { grow(i, 'atk', n); }); return '+' + n + ' ataque permanente a todas'; } },
    banquete: { run: function (s, p) { var n = sc(s, 2); mesaTroops(s.p[p]).forEach(function (i) { grow(i, 'hp', n); }); return '+' + n + ' vida máxima permanente a todas'; } },
    intimidacion: { run: function (s, p, t) { var n = sc(s, 3); t.perm.atk -= n; return '-' + n + ' ataque permanente'; } },
    'mal-de-ojo': { ok: function (s, p) { return targetable(s.p[1 - p]).length ? '' : 'El rival no tiene tropas.'; }, run: function (s, p) { var n = sc(s, 1); targetable(s.p[1 - p]).forEach(function (i) { i.perm.atk -= n; }); return '-' + n + ' ataque permanente a todas las rivales'; } },
    remedio: { ok: function (s, p) { return s.p[p].life < (s.maxLife || CFG.life) ? '' : 'Tu vida ya está al máximo.'; }, run: function (s, p) { var P = s.p[p], ML = s.maxLife || CFG.life, h = Math.min(5, ML - P.life); P.life += h; return '+' + h + ' de vida'; } },
    genkidama: { ok: function (s, p) { return genStored(s.p[p]) > 0 ? '' : 'La Genkidama está vacía: tus Anime aún no han recibido daño.'; }, run: function (s, p, t) { var P = s.p[p], n = genStored(P); P.gen = 0; t.hp -= n; if (t.hp <= 0) dropDead(s, 1 - p, t); return n + ' de daño de Genkidama'; } },
    kamehameha: { ok: function (s, p) { if ((tiers(s.p[p])['Anime'] || 0) < 1) return 'Necesitas el nivel 1 de Anime (2 cartas distintas).'; if (genStored(s.p[p]) <= 0) return 'La Genkidama está vacía: tus Anime aún no han recibido daño.'; return targetable(s.p[1 - p]).length ? '' : 'El rival no tiene tropas.'; },
      run: function (s, p) { var P = s.p[p], tot = genStored(P), foes = targetable(s.p[1 - p]), n = Math.floor(tot / foes.length); P.gen = 0; foes.forEach(function (i) { genCharge(s, i, Math.min(n, Math.max(0, i.hp))); i.hp -= n; if (i.hp <= 0) dropDead(s, 1 - p, i); }); return n + ' de daño a cada tropa rival (Genkidama repartida: ' + tot + ')'; } },
    'golpe-certero': { run: function (s, p, t) { var n = sc(s, 6); genCharge(s, t, Math.min(n, Math.max(0, t.hp))); t.hp -= n; if (t.hp <= 0) dropDead(s, 1 - p, t); return n + ' de daño'; } },
    'mordisco-del-invierno': {
      ok: function (s, p, t) { if ((tiers(s.p[p])['Magic Botlane'] || 0) < 1) return 'Necesitas el nivel 1 de Magic Botlane (Javihi Dúo + Sech Dúo).'; return t && t.tmp.noAtk ? 'Esa tropa ya no puede actuar este turno.' : ''; },
      run: function (s, p, t) { t.tmp.noAtk = true; t.tmp.stun = true; return card(t).name + ' no podrá actuar en este combate'; } },
    lluvia: { ok: function (s, p) { return targetable(s.p[1 - p]).length ? '' : 'El rival no tiene tropas.'; }, run: function (s, p) { var n = sc(s, 2); targetable(s.p[1 - p]).forEach(function (i) { genCharge(s, i, Math.min(n, Math.max(0, i.hp))); i.hp -= n; if (i.hp <= 0) dropDead(s, 1 - p, i); }); return n + ' de daño a todas las rivales'; } },
    'bola-extra': { ok: function (s, p) { return (tiers(s.p[p])['Pokémon'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de Pokémon (2 cartas distintas).'; }, run: function (s, p) { s.p[p].fl.pk = (s.p[p].fl.pk || 0) + 1; return 'bola extra esta ronda'; } },
    'segundo-aliento': {
      ok: function (s, p) { return mesaTroops(s.p[p]).some(function (i) { return has(i, 'Comebacker') && i.hp < maxHp(i); }) ? '' : 'Ninguna Comebacker en mesa está herida.'; },
      run: function (s, p) { mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Comebacker'); }).forEach(function (i) { i.hp = maxHp(i); }); return 'las Comebacker recuperan su vida'; } },
    'pedir-refuerzos': {
      ok: function (s, p) {
        if (s.p[p].life >= s.p[1 - p].life) return 'Solo si tu vida es menor que la del rival.';
        return s.p[p].hand.length - 1 >= handCap(s) ? 'Tu mano está llena.' : '';
      },
      run: function (s, p) { var id = (typeof s.rng === 'function' ? s.rng() : Math.random()) < .5 ? 'lihone-viego' : 'aitorlg-renata'; s.p[p].hand.push(mk(s, id, p)); mergeCheck(s, p); return 'consigues a ' + CARD[id].name; } },
    'cambio-de-linea': { run: function (s, p, t) { var P = s.p[p]; P.mesa[P.mesa.indexOf(t)] = null; t.hp = maxHp(t); t.tmp = { atk: 0, hp: 0, red: 0 }; delete P.target[t.uid]; P.hand.push(t); return 'vuelve a la mano con la vida completa'; } },
    parche: {
      ok: function (s, p) { return s.refreshN[p] >= 5 ? '' : 'Necesitas al menos 5 actualizaciones de tienda en esta partida.'; },
      run: function (s, p) { var P = s.p[p], n = Math.floor(s.refreshN[p] / 5); P.mesa.concat(P.hand).filter(function (i) { return i && isTroop(i) && !i.dead && has(i, 'Informático'); }).forEach(function (i) { grow(i, 'atk', n); }); return '+' + n + ' ataque permanente a las Informático'; } },
    'horas-extra': { run: function (s, p) { var n = sc(s, 5); s.p[p].fl.work = n; return 'si ganas esta ronda: +' + n + ' de oro'; } },
    'segunda-temporada': {
      ok: function (s, p) { return graveKoi(s.p[p]) ? '' : 'Todavía no ha caído ninguna tropa KOI.'; },
      run: function (s, p) { var P = s.p[p], i = graveKoi(P); P.grave.splice(P.grave.indexOf(i), 1); i.dead = false; i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = maxHp(i); P.hand.push(i); return card(i).name + ' vuelve a tu mano'; } },
    'campeones-de-europa': { ok: function (s, p) { return (tiers(s.p[p])['KOI'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de KOI (2 cartas distintas).'; }, run: function (s, p) { s.p[p].fl.koi = true; return 'las KOI que caigan esta ronda ceden todo su ataque'; } },
    'remate-doble': { ok: function (s, p) { return (tiers(s.p[p])['Voley'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de Voley (2 cartas distintas).'; }, run: function (s, p) { s.p[p].fl.vol = true; return 'tus Voley: ataque doble o defensa total'; } },
    'cita-sorpresa': {
      ok: function (s, p) { var n = s.p[p].mesa[4]; return (tiers(s.p[p])['Correa'] || 0) >= 1 && n && !n.dead ? '' : 'Necesitas el nivel 1 de Correa y una novia en el hueco extra.'; },
      run: function (s, p) { var n = s.p[p].mesa[4], g = sc(s, 3); var P5 = s.p[p].s5 || (s.p[p].s5 = { atk: 0, hp: 0 }); P5.atk += g; P5.hp += g; grow(n, 'atk', g); grow(n, 'hp', g); return 'el hueco 5 mejora +' + g + '/+' + g + ' permanente (' + card(n).name + ' lo recibe ahora y la siguiente novia también)'; } },
    'golpe-de-suerte': {
      ok: function (s, p) { var g = gamState(s.p[p]); return g.done ? 'Tus orbes ya se han canjeado: no se ganan más.' : (tiers(s.p[p])['Gambling'] || 0) >= 1 ? '' : 'Necesitas el nivel 1 de Gambling (2 cartas distintas).'; },
      run: function (s, p) { var g = gamState(s.p[p]), win = (typeof s.rng === 'function' ? s.rng() : Math.random()) < .5; if (win) { g.orbs += 2; return '¡Suerte! Ganas 2 orbes (' + g.orbs + (g.orbs === 1 ? ' acumulada)' : ' acumuladas)'); } var lost = Math.min(2, g.orbs); g.orbs -= lost; return 'Mala suerte: pierdes ' + lost + (lost === 1 ? ' orbe' : ' orbes') + ' (' + g.orbs + (g.orbs === 1 ? ' acumulada)' : ' acumuladas)'); } },
  };
  function graveKoi(P) {
    return P.grave.filter(function (i) { return isTroop(i) && has(i, 'KOI'); }).sort(function (a, b) { return atk(b) - atk(a); })[0] || null;
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
    else if (c.target === 'enemy') tgt = targetable(s.p[1 - p]).filter(function (x) { return x.uid === targetUid; })[0];
    var why = actionBlock(s, p, c, tgt);
    if (why) { s.err = why; return false; }
    P.hand.splice(handIdx, 1); P.grave.push(i); P.used = (P.used || 0) + 1;
    s.lvl = cardLv(s, p, c.id);
    var res = ACT[c.id].run(s, p, tgt);
    s.lvl = 1;
    say(s, pv(s, p, 'Juegas ', 'El rival juega ') + c.name + (tgt ? ' sobre ' + card(tgt).name : '') + ': ' + res + '.');
    s.acts.push({ n: (s.actN = (s.actN || 0) + 1), p: p, id: c.id, res: res, tgt: tgt ? tgt.uid : null });
    novSync(s, p);
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
  // ---------- IA: dificultades (0 Normal, 1 Difícil, 2 Experto) ----------
  function aiLv(s, p) { return (s.aiLv && s.aiLv[p]) || 0; }
  // Ventajas de la IA: Difícil +1 de oro en las rondas de tienda y cartas a nivel 2; Experto cartas a nivel 3; Experto +2 de oro en las rondas de tienda y se cura 2 de vida si no la tiene completa
  function aiBonus(s, p) {
    var lv = aiLv(s, p), P = s.p[p];
    if (!lv || s.round < 2) return;
    if (s.round % shopEvery(s) === 1) P.gold += (lv >= 2 ? 2 : 1);
    var ML = s.maxLife || CFG.life;
    if (lv >= 2 && P.life > 0 && P.life < ML) { var h = Math.min(2, ML - P.life); P.life += h; if (!s.pvp) say(s, 'El rival (Experto) se cura ' + h + ' de vida.'); }
  }
  function heldThemes(P) {
    var m = {};
    P.hand.concat(mesaTroops(P)).forEach(function (i) { if (i && isTroop(i)) card(i).themes.forEach(function (t) { m[t] = (m[t] || 0) + 1; }); });
    return m;
  }
  function aiCardScore(s, P, c, lv, held) {
    var sc = c.type === 'tropa' ? (c.atk + c.hp * 0.45) / (1 + c.cost * 0.25) : 1.5;
    if (lv >= 1) {
      if (c.type === 'tropa') {
        c.themes.forEach(function (t) { if (held[t] > 0) sc += 2.2; });
        var copies = P.hand.concat(mesaTroops(P)).filter(function (i) { return i && i.id === c.id; }).length;
        if (copies >= 2) sc += lv >= 2 ? 7 : 4; else if (copies === 1) sc += 2.5;
        if (lv >= 2 && c.rarity === 'Legendaria') sc += 2;
      } else if (c.theme && held[c.theme] >= 2) sc += 2;
    }
    return sc;
  }
  function aiShop(s, p) {
    var P = s.p[p];
    if (!s.shopOpen) return;
    var lv = aiLv(s, p), maxRef = lv >= 1 ? 5 : 3, guard = 0, refreshes = 0;
    while (guard++ < 14) {
      var best = -1, bestScore = -1, troopsHeld = P.hand.filter(isTroop).length + mesaTroops(P).length, held = lv >= 1 ? heldThemes(P) : {};
      var keep = lv >= 1 && troopsHeld >= 4 ? Math.floor(P.gold / CFG.interest.per) * CFG.interest.per : 0; // oro que conserva para cobrar interés
      var full = P.hand.length >= handCap(s), bestFull = -1, bestFullScore = -1;
      P.offers.forEach(function (id, k) {
        var c = CARD[id];
        if (!c || c.cost > P.gold) return;
        var score = aiCardScore(s, P, c, lv, held) + (c.type === 'tropa' && troopsHeld < 4 ? 6 : 0) + s.rng() * 0.8;
        if (full) { if (score > bestFullScore) { bestFullScore = score; bestFull = k; } return; }
        if (keep && P.gold - c.cost < keep && score < 8) return;
        if (score > bestScore) { bestScore = score; best = k; }
      });
      if (best >= 0) { buy(s, p, best); continue; }
      if (full && lv >= 2 && bestFull >= 0) { // Experto: vende la tropa que peor encaja para comprar una mejor
        var worst = -1, ws = 1e9;
        P.hand.forEach(function (i, k) { if (!i || !isTroop(i)) return; var v = aiCardScore(s, P, card(i), 1, held); if (v < ws) { ws = v; worst = k; } });
        if (worst >= 0 && bestFullScore >= ws + 3 && sell(s, p, 'hand', worst)) continue;
      }
      if (troopsHeld < 4 && refreshes < maxRef && P.gold >= refreshCost(s, p) + 1 && P.hand.length < handCap(s)) { if (refresh(s, p)) { refreshes++; continue; } }
      break;
    }
  }
  function aiPrep(s, p) {
    var P = s.p[p], me = P, lv = aiLv(s, p);
    var guard = 0;
    while (guard++ < 6) {
      var slot = P.mesa.slice(0, 4).indexOf(null);
      if (slot < 0) break;
      var best = -1, bs = -1, held = lv >= 1 ? heldThemes(P) : {};
      P.hand.forEach(function (i, k) {
        if (isTroop(i) && !dupBlock(s, p, k)) {
          var sc = atk(i) + maxHp(i) * 0.6 + s.rng();
          if (lv >= 1) card(i).themes.forEach(function (t) { if (held[t] >= 2) sc += 1.5; });
          if (sc > bs) { bs = sc; best = k; }
        }
      });
      if (best < 0) break;
      place(s, p, best, slot);
    }
    for (var k = P.hand.length - 1; k >= 0; k--) {
      var i = P.hand[k];
      if (!i || isTroop(i)) continue; // (una acción anterior pudo fusionar cartas y acortar la mano)
      var c = card(i), allies = mesaTroops(P), foes = targetable(s.p[1 - p]);
      if (c.id === 'cambio-de-linea' || (c.id === 'genkidama' && genStored(P) < 3) || (c.id === 'kamehameha' && genStored(P) < 2 * Math.max(1, foes.length))) continue; // la IA no la usa
      var tgt = null;
      if (c.target === 'ally') { allies.sort(function (a, b) { return atk(b) - atk(a); }); tgt = allies[0]; if (c.id === 'armadura') tgt = allies.slice().sort(function (a, b) { return maxHp(b) - maxHp(a); })[0]; }
      else if (c.target === 'enemy') {
        foes.sort(function (a, b) { return atk(b) - atk(a); }); tgt = foes[0];
        if (c.id === 'golpe-certero') tgt = foes.filter(function (f) { return f.hp <= 6; })[0] || foes[0];
      }
      if (c.target !== 'none' && !tgt) continue;
      playAction(s, p, k, tgt ? tgt.uid : null);
    }
    // Novias: si tiene la sinergia, la IA elige una al azar para el hueco 5
    if (!P.mesa[4] && P.nvs && P.nvs.length && (tiers(P)['Correa'] || 0) >= 1) place(s, p, -1 - Math.floor(s.rng() * P.nvs.length), 4);
    // Voley: ataca salvo que esté en desventaja numérica (Experto decide según el recuento real)
    var outn = mesaTroops(P).length < mesaTroops(s.p[1 - p]).length;
    mesaTroops(P).forEach(function (i) { if (has(i, 'Voley')) P.voley[i.uid] = lv >= 2 ? (outn ? 'def' : 'atk') : (s.rng() < 0.7 ? 'atk' : 'def'); });
  }
  // Reparto coordinado: concentra el daño para rematar tropas (primero las más peligrosas).
  function aiTargets(s, p) {
    var P = s.p[p], foes = targetable(s.p[1 - p]).map(function (f) { return { f: f, rem: f.hp }; });
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
  function aiDeck(rng, forced, lvl) {
    lvl = lvl | 0;
    var themes = Object.keys(DATA.themes), pick = forced ? forced.slice() : [], want = lvl >= 1 ? 2 : 3;
    if (lvl >= 1) { // solo temáticas con cartas suficientes para llegar al nivel 2
      var viable = themes.filter(function (t) { return DATA.cards.filter(function (c) { return c.themes.indexOf(t) >= 0; }).length >= Math.max(3, DATA.themes[t].th[1] || 0); });
      if (viable.length >= 3) { themes = viable; pick = pick.map(function (t) { return viable.indexOf(t) >= 0 ? t : null; }).filter(Boolean); }
      want = Math.max(want, Math.min(3, pick.length));
    }
    while (pick.length < want) { var t = themes[Math.floor(rng() * themes.length)]; if (pick.indexOf(t) < 0) pick.push(t); }
    var sc = DATA.cards.map(function (c) { return { c: c, v: c.themes.filter(function (t) { return pick.indexOf(t) >= 0; }).length * 10 + rng() * 6 }; }).sort(function (a, b) { return b.v - a.v; });
    var com = sc.filter(function (x) { return x.c.rarity === 'Común'; }).slice(0, 2);
    var leg = lvl >= 2 ? sc.filter(function (x) { return x.c.rarity === 'Legendaria' && x.v >= 10; }).slice(0, 1) : [];
    var order = com.concat(leg).concat(sc.filter(function (x) { return com.indexOf(x) < 0 && leg.indexOf(x) < 0; })), deck = [], used = 0;
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
          return i ? { uid: i.uid, id: i.id, atk: atk(i), hp: Math.max(0, i.hp), max: maxHp(i), dead: !!i.dead, red: i.tmp.red, stun: !!i.tmp.stun, baseAtk: card(i).atk, baseHp: card(i).hp } : null;
        });
      }),
    };
  }
  function frame(s, text, hl) { s.frames.push({ text: text, view: viewOf(s), hl: hl || null }); say(s, text); }

  function fxFrame(s, p, type, title, sub, uids, neg) {
    frame(s, pv(s, p, '', 'Rival · ') + title + (sub ? ' ' + sub : ''), { fx: { type: type, side: p, title: title, sub: sub || '', uids: uids || [], neg: !!neg } });
  }
  // Gambling: una orbe por ronda sin daño directo a tu vida; el primer daño directo abre todas las orbes (ruleta) y cierra la sinergia.
  function gamState(P) { return P.gmb || (P.gmb = { orbs: 0, done: false, hit: false }); }
  function gamHit(s, q) {
    var P = s.p[q], g = gamState(P); g.hit = true;
    var t = (s.tiers && s.tiers[q] && s.tiers[q]['Gambling']) || tiers(P)['Gambling']; if (!t || g.done || P.life <= 0) return; // nivel con el que empezó el combate: quien recibe daño directo suele haberse quedado sin tropas en mesa
    gamOpen(s, q, g.orbs, t, 'Rival · ');
  }
  // Abre n orbes: tira cada una, mejora a las Gambling (mesa y mano; en Resurrección también las caídas) y emite la ruleta.
  // all = true cierra la sinergia (ya no se ganan más orbes); si no, el resto sigue acumulándose.
  function gamOpen(s, q, n, t, pre, keep) {
    var P = s.p[q], g = gamState(P), pr = FX.gambling.probs[(t || 1) - 1], res = [], total = 0, k;
    for (k = 0; k < n; k++) { var r = s.rng() * 100, v = r < pr[0] ? 1 : (r < pr[0] + pr[1] ? 2 : 3); res.push(v); total += v; }
    var gm = P.mesa.concat(P.hand).filter(function (i) { return i && isTroop(i) && !isNov(i) && has(i, 'Gambling') && (!i.dead || s.mode === 'revive'); });
    if (total > 0) gm.forEach(function (i) { grow(i, 'atk', total); grow(i, 'hp', total); });
    g.orbs -= n; if (!keep) { g.done = true; g.orbs = 0; } g.res = res;
    frame(s, pv(s, q, '', pre) + 'Gambling: ' + (res.length ? 'se abren ' + res.length + (res.length === 1 ? ' orbe' : ' orbes') + ' (' + res.map(function (v) { return '+' + v; }).join(' ') + '): +' + total + '/+' + total + ' permanente a las Gambling.' : 'no había orbes que abrir.'),
      { fx: { type: 'gambling', side: q, title: 'Gambling', sub: res.length ? '+' + total + '/+' + total + ' permanente' : 'sin orbes', uids: gm.map(function (i) { return i.uid; }), orbs: res, total: total } });
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

  function startEffects(s) {
    var T = [tiers(s.p[0]), tiers(s.p[1])];
    s.tiers = T;
    [0, 1].forEach(function (p) {
      var P = s.p[p], t = T[p], troops = mesaTroops(P), who = p === 0 ? 'Tus' : 'Las del rival';
      // Informático nivel 3: +1/+1 permanente por cada actualización de tienda de la partida (se acredita lo que falta)
      if ((t['Informático'] || 0) >= 3) {
        var infN = Math.floor(s.refreshN[p] / 3);
        var inf = troops.filter(function (i) { return has(i, 'Informático') && (i.caps.inf || 0) < infN; });
        if (inf.length) {
          inf.forEach(function (i) { var d = infN - (i.caps.inf || 0); i.caps.inf = infN; grow(i, 'atk', d); grow(i, 'hp', d); });
          fxFrame(s, p, 'inf', 'Actualizaciones', '+1/+1 por cada 3 actualizaciones de tienda (' + s.refreshN[p] + ' en total)', inf.map(function (i) { return i.uid; }));
        }
      }
      // Pokémon: bola (las acciones pueden añadir bolas extra esta ronda)
      if (t['Pokémon']) {
        for (var bn = 0; bn < 1 + (P.fl.pk || 0); bn++) {
          var pk = troops.filter(function (i) { return has(i, 'Pokémon'); });
          var probs = FX.pokemon.probs[t['Pokémon'] - 1], r = s.rng() * 100, ball = 0;
          if (r < probs[0]) ball = 0; else if (r < probs[0] + probs[1]) ball = 1; else ball = 2;
          var med = ball === 0 && troops.some(function (i) { return pas(i) === 'medallas'; }); if (med) ball = 1; // 8 Medallas: la Pokéball se convierte en Superball
          s.lastBall[p] = ball;
          var b = FX.pokemon.bonus[ball];
          if (b > 0) pk = pk.filter(function (i) { return gainCap(i, 'pk', 'both', b, FX.pokemon.cap) > 0; });
          troops.filter(function (i) { return pas(i) === 'captura'; }).forEach(function (i) { if (gainCap(i, 'cap', 'both', 1, 6) > 0) fxFrame(s, p, 'captura', 'Captura', '+1/+1 permanente a ' + card(i).name, [i.uid]); });
          if (pk.length) { fxFrame(s, p, 'pokemon', FX.pokemon.names[ball] + (bn ? ' (extra)' : '') + (med ? ' · 8 Medallas' : ''), '+' + b + '/+' + b + ' permanente a las Pokémon', pk.map(function (i) { return i.uid; })); s.frames[s.frames.length - 1].hl.fx.ball = ball; }
        }
      }
      // Novias del hueco 5 (sinergia Correa)
      var nv = P.mesa[4];
      if (nv && !nv.dead && (t['Correa'] || 0) >= 1) {
        var cl = t['Correa'] - 1;
        if (nv.id === 'eriko') {
          var eg = FX.novias.eriko[cl], er = troops.filter(function (i) { return gainCap(i, 'eri', 'both', eg, FX.novias.eCap[cl]) > 0; });
          if (er.length) fxFrame(s, p, 'eriko', 'Eriko te mima', '+' + eg + '/+' + eg + ' permanente a toda la mesa', er.map(function (i) { return i.uid; }));
        } else if (nv.id === 'helena') {
          nv.tmp.atk += FX.novias.helena[cl];
        } else if (nv.id === 'lucia') {
          var lf2 = targetable(s.p[1 - p]), ld = FX.novias.lucia[cl];
          if (lf2.length) {
            var lt = ' Lucía:'; lf2.forEach(function (f) { lt += passiveHit(s, f, ld, 0); });
            frame(s, lt.trim(), { fx: { type: 'lucia', side: p, title: 'Mirada de Lucía', sub: ld + ' de daño a las tropas rivales', uids: lf2.map(function (f) { return f.uid; }), neg: false } });
          }
        }
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
    // Ataques de uno en uno, alternando bandos.
    var f = s.first, seq = [];
    var q = [0, 1].map(function (p) { return mesaTroops(s.p[p]); }), a = [q[f], q[1 - f]], k = [0, 0], turn = 0;
    while (k[0] < a[0].length || k[1] < a[1].length) {
      var side = turn % 2;
      if (k[side] >= a[side].length) side = 1 - side;
      seq.push(a[side][k[side]++]);
      turn++;
    }
    return seq;
  }

  function pendingTargets(s, p) {
    p = p || 0;
    var foes = targetable(s.p[1 - p]);
    if (!foes.length) return [];
    var T = s.p[p].target;
    return mesaTroops(s.p[p]).filter(function (i) { return !(T[i.uid] && foes.some(function (f) { return f.uid === T[i.uid]; })); });
  }

  // Efectos al caer una tropa (KOI). Devuelve texto de registro y animación.
  // ---------- Pasivas de legendarias ----------
  var PAS = { 'dashlight-sun-jin-woo': 'sombra', 'aitorlg-maomao': 'boticaria', 'javihi-duo': 'muro', 'sech-duo': 'armas', 'javihi-friki': 'remate', 'sech': 'embargo', 'potango': 'amor', 'lihone-viego': 'racha', 'aitorlg-renata': 'prorroga', 'lihone': 'captura', 'pampert-koisito': 'cabezon', 'aitorlg-koisito': 'heredero', 'mertens-gambler': 'malaracha', 'computer-dashlight': 'medallas', 'pampert-gambler': 'colega' };
  function pas(i) { return PAS[i.id] || ''; }
  // ---------- Magic Botlane: Armas Lunares (Sech Dúo) y Muro de Hielo (Javihi Dúo) ----------
  var ARMAS = ['calibrum', 'severum', 'gravitum', 'infernum', 'crescendum'];
  var ARMA_TX = { calibrum: '+5 de ataque esta ronda', severum: 'cura la mitad del daño que inflige', gravitum: 'retrasa al enemigo golpeado al último puesto', infernum: 'reparte su daño entre todos los enemigos', crescendum: 'hueco extra y torreta 7/7 esta ronda' };
  var ARMA_NM = { calibrum: 'Calibrum', severum: 'Severum', gravitum: 'Gravitum', infernum: 'Infernum', crescendum: 'Crescendum' };
  // Arma de la ronda de cada jugador: al azar, nunca la misma dos veces seguidas
  function pickArma(s, P) {
    var opts = ARMAS.filter(function (a) { return a !== P.arma; });
    P.arma = opts[Math.floor(s.rng() * opts.length)];
  }
  // Magic Botlane activa y ambas vivas en la mesa: devuelve a Javihi Dúo para redirigir los ataques a Sech Dúo
  function botlaneGuard(s, owner) {
    if (!s.tiers || !s.tiers[owner] || !s.tiers[owner]['Magic Botlane']) return null;
    var m = mesaTroops(s.p[owner]), j = m.filter(function (i) { return i.id === 'javihi-duo'; })[0];
    return j && m.some(function (i) { return i.id === 'sech-duo'; }) && !immune(j) ? j : null;
  }
  function muroDmg(tgt, n) { return tgt.id === 'javihi-duo' && n > 0 ? Math.ceil(n / 2) : n; }
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
    if (!v || v.dead || n <= 0 || immune(v)) return '';
    genCharge(s, v, Math.min(n, Math.max(0, v.hp)));
    v.hp -= n;
    var tv = s.tiers[v.owner];
    var out = ' ' + card(v).name + ' -' + n + '.';
    if (v.hp <= 0 && wardSave(s, v)) out += ' ¡Aguanta a 0 de vida hasta atacar!';
    else if (v.hp <= 0) { v.dead = true; v.hp = 0; out += ' ¡Cae!'; out += deathFx(s, v, depth + 1).line; }
    return out;
  }
  // Efectos al caer una tropa (KOI). Devuelve texto de registro y animación.
  function deathFx(s, d, depth) {
    var line = '', fxk = null; depth = depth || 0;
        var tt2 = s.tiers[d.owner];
        if (has(d, 'KOI') && tt2['KOI']) {
          var kb = FX.koi.atk[tt2['KOI'] - 1];
          mesaTroops(s.p[d.owner]).forEach(function (i) { gainCap(i, 'koi', 'atk', kb, FX.koi.cap); });
          line += ' KOI anima al equipo: +' + kb + ' de ataque permanente (tope +' + FX.koi.cap + ' por tropa).';
          fxk = { type: 'koi', side: d.owner, title: '¡KOI anima al equipo!', sub: '+' + kb + ' ataque permanente', uids: mesaTroops(s.p[d.owner]).map(function (i) { return i.uid; }), neg: false };
          // Herencia: parte del ataque de la KOI caída pasa, solo durante esta ronda, a una KOI viva al azar
          var heirs = mesaTroops(s.p[d.owner]).filter(function (i) { return has(i, 'KOI') && i !== d; });
          if (heirs.length && atk(d) > 0) {
            var hm = Math.max(1, Math.floor(atk(d) * FX.koi.heir[s.p[d.owner].fl.koi ? 2 : tt2['KOI'] - 1])), hv = heirs.filter(function (i) { return pas(i) === 'heredero'; })[0] || heirs[Math.floor(s.rng() * heirs.length)];
            hv.tmp.atk += hm; // temporal: se pierde al acabar la ronda
            line += ' Herencia: ' + card(hv).name + ' recibe +' + hm + ' de ataque esta ronda.';
            fxk.sub += ' · herencia +' + hm + ' (solo esta ronda) a ' + card(hv).name; fxk.uids = fxk.uids.concat(heirs.indexOf(hv) >= 0 ? [] : [hv.uid]);
          }
        }
    return { line: line, fx: fxk };
  }
  function fight(s) {
    if (s.phase !== 'prep' || s.over || s.shopOpen) return false;
    lunarSync(s, 0); lunarSync(s, 1);
    if (pendingTargets(s, 0).length || (s.pvp && pendingTargets(s, 1).length)) return false;
    s.shopOpen = false;
    s.frames = [];
    s.fightN = (s.fightN || 0) + 1;
    if (!s.pvp) aiTargets(s, 1);
    frame(s, 'Empieza el combate. ' + pv(s, s.first, 'Atacas primero.', 'Ataca primero el rival.'), null);
    novSync(s, 0); novSync(s, 1);
    startEffects(s);
    // Cabezón (Pampert Koisito): recibe 2 de daño menos por golpe
    [0, 1].forEach(function (p) { mesaTroops(s.p[p]).forEach(function (i) { if (pas(i) === 'cabezon') i.tmp.red += 2; }); });
    // Armas Lunares (Sech Dúo): el arma de la ronda actúa al empezar el combate
    [0, 1].forEach(function (p) {
      var P = s.p[p], sd = mesaTroops(P).filter(function (i) { return pas(i) === 'armas'; })[0];
      P.armaOn = sd ? P.arma : null;
      if (!sd) return;
      var an = ARMA_NM[P.arma];
      if (P.arma === 'calibrum') { sd.tmp.atk += 5; fxFrame(s, p, 'armas', 'Armas Lunares · ' + an, '+5 de ataque esta ronda', [sd.uid]); }
      else if (P.arma === 'crescendum') {
        var tu = P.mesa[6] || { uid: -1 };
        fxFrame(s, p, 'armas', 'Armas Lunares · ' + an, 'hueco extra y torreta 7/7 hasta el final de la ronda', [sd.uid, tu.uid].filter(function (u) { return u >= 0; }));
      } else fxFrame(s, p, 'armas', 'Armas Lunares · ' + an, ARMA_TX[P.arma], [sd.uid]);
    });
    var seq = order(s);
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
      var P = s.p[a.owner], E = s.p[1 - a.owner], foes = targetable(E);
      var tgt = null, retarget = false;
      if (P.target[a.uid]) tgt = foes.filter(function (f) { return f.uid === P.target[a.uid]; })[0] || null;
      if (!tgt && foes.length) { tgt = foes[Math.floor(s.rng() * foes.length)]; retarget = !!P.target[a.uid]; }
      if (!tgt && a.tmp.loan != null) delete a.tmp.loan;
      var redir = false;
      if (tgt && tgt.id === 'sech-duo') { var bg = botlaneGuard(s, tgt.owner); if (bg && bg !== tgt) { tgt = bg; redir = true; } } // Magic Botlane: los ataques a Sech Dúo van a Javihi Dúo
      var dmg = atk(a), splash = [], share = 0;
      if (tgt && pas(a) === 'armas' && P.armaOn === 'infernum' && dmg > 0) { // Infernum: reparte el daño entre todos los enemigos
        splash = foes.filter(function (f) { return f !== tgt; });
        if (splash.length) { share = Math.max(1, Math.floor(dmg / (splash.length + 1))); dmg = Math.max(share, dmg - share * splash.length); }
      }
      if (!tgt) {
        E.life -= dmg;
        frame(s, card(a).name + ' golpea directamente: ' + dmg + ' de daño a ' + pv(s, a.owner, 'la vida del rival', 'tu vida') + '.', { att: a.uid, life: 1 - a.owner, dmg: dmg });
        if (E.life <= 0) { s.over = true; s.phase = 'over'; s.winner = a.owner; s.reason = 'Vida a cero.'; break; }
        gamHit(s, 1 - a.owner);
        if (a.tmp.ward) { a.tmp.ward = false; a.dead = true; a.hp = 0; frame(s, card(a).name + ' no derriba a nadie y cae.' + deathFx(s, a, 0).line, null); }
        finishDying(a);
        continue;
      }
      var fxk = null, real = Math.max(0, dmg - tgt.tmp.red);
      if (tgt.tmp.cap1) real = Math.min(real, 1);
      real = muroDmg(tgt, real); // Muro de Hielo (Javihi Dúo)
      var ariSave = false;
      if (real > 0 && mesaTroops(s.p[tgt.owner]).some(function (x) { return x.id === 'ari'; }) && s.rng() < FX.novias.ari[Math.max(0, (s.tiers[tgt.owner]['Correa'] || 1) - 1)]) { real = 0; ariSave = true; }
      genCharge(s, tgt, Math.min(real, Math.max(0, tgt.hp)));
      tgt.hp -= real;
      var line = card(a).name + (redir ? ' (redirigido por Magic Botlane) ataca a ' : retarget ? ' (su objetivo ya cayó) ataca a ' : ' ataca a ') + card(tgt).name + ': ' + real + ' de daño' + (tgt.tmp.red && real < dmg ? ' (reducido)' : '') + (ariSave ? ' (¡Ari lo evita!)' : '') + (tgt.id === 'javihi-duo' && real < dmg ? ' (Muro de Hielo)' : '') + '.';
      if (real > 0) {
        var ta = s.tiers[a.owner], tt = s.tiers[tgt.owner];
        if (has(a, 'Lol') && ta['Lol']) {
          var li = ta['Lol'] - 1, ga = Math.min(FX.lol.atk[li], FX.lol.cap[li] - a.caps.lol);
          if (ga > 0) { a.caps.lol += ga; grow(a, 'atk', ga); if (FX.lol.hp[li]) grow(a, 'hp', Math.min(FX.lol.hp[li], ga)); }
        }
      }
      if (tgt.hp <= 0 && wardSave(s, tgt)) {
        line += ' ¡Prórroga! ' + card(tgt).name + ' aguanta a 0 de vida hasta que ataque.';
      } else if (tgt.hp <= 0) {
        tgt.dead = true; tgt.hp = 0; line += ' ¡Cae!';
        var df = deathFx(s, tgt); line += df.line; fxk = df.fx;
      }
      // Pasivas al golpear (Embargo)
      var plife = null, pdmg = 0;
      if (tgt.dead && pas(a) === 'sombra' && !isNov(tgt)) line += shadowRaise(s, a, tgt); // el soldado tiene su propio hueco extra: si ya había uno, el nuevo lo sustituye
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
        if (tgt.dead && !a.dead && targetable(E).length) { a.tmp.loan = atk(tgt); line += ' Racha de bajas: toma ' + a.tmp.loan + ' de ataque y vuelve a atacar.'; seq.splice(n + 1, 0, a); }
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
        var ca = a, cg = a.id === 'sech-duo' ? botlaneGuard(s, a.owner) : null; // Magic Botlane: el contraataque a Sech Dúo va a Javihi Dúo
        if (cg && cg !== a) ca = cg;
        rec = Math.max(0, atk(tgt) - ca.tmp.red);
        if (ca.tmp.cap1) rec = Math.min(rec, 1);
        rec = muroDmg(ca, rec);
        if (rec > 0) {
          if (!ca.dead) { genCharge(s, ca, Math.min(rec, Math.max(0, ca.hp))); ca.hp -= rec; } line += ' Contraataque: ' + card(ca).name + ' recibe ' + rec + (ca !== a ? ' (redirigido por Magic Botlane)' : '') + '.';
          if (ca.hp <= 0 && !ca.dead && wardSave(s, ca)) { line += ' (aguanta a 0 de vida)'; }
          else if (ca.hp <= 0 && !ca.dead) { ca.dead = true; ca.hp = 0; line += ' ¡Cae!'; var df2 = deathFx(s, ca); line += df2.line; if (!fxk) fxk = df2.fx; }
        }
      }
      if (pas(a) === 'armas' && !a.dead) {
        if (P.armaOn === 'severum' && real > 0) { // Severum: se cura la mitad del daño realizado
          var hl = Math.min(Math.ceil(real / 2), maxHp(a) - a.hp);
          if (hl > 0) { a.hp += hl; line += ' Severum: ' + card(a).name + ' se cura ' + hl + '.'; }
        }
        if (P.armaOn === 'gravitum' && !tgt.dead && !tgt.tmp.acted && !tgt.tmp.noAtk) { // Gravitum: el enemigo golpeado pasa a actuar el último
          var gc = 0; for (var gq = seq.length - 1; gq > n; gq--) if (seq[gq] === tgt) { seq.splice(gq, 1); gc++; }
          if (gc) { for (var gk = 0; gk < gc; gk++) seq.push(tgt); line += ' Gravitum: ' + card(tgt).name + ' pasa a actuar el último.'; }
        }
        splash.forEach(function (v0) { // Infernum: el resto del daño se reparte
          var v = v0; if (v.dead) return;
          if (v.id === 'sech-duo') { var bg2 = botlaneGuard(s, v.owner); if (bg2) v = bg2; }
          if (v.dead) return;
          var sn = muroDmg(v, Math.max(0, share - v.tmp.red));
          if (sn > 0) line += ' Infernum:' + passiveHit(s, v, sn, 0);
        });
      }
      if (pas(a) === 'remate') { // Javihi Prime: el balón rebota a otra tropa rival
        var rb = targetable(E).filter(function (x) { return x !== tgt; });
        if (rb.length) { var rv = rb[Math.floor(s.rng() * rb.length)], rn = Math.ceil(atk(a) / 2); line += ' Remate: rebota ' + rn + ' en ' + card(rv).name + '.'; line += passiveHit(s, rv, rn, 0); }
      }
      frame(s, line, { att: a.uid, tgt: tgt.uid, dmg: real, rec: rec, retarget: retarget, fx: fxk, plife: plife, pdmg: pdmg });
      if (E.life <= 0 && !s.over) { s.over = true; s.phase = 'over'; s.winner = a.owner; s.reason = 'Vida a cero.'; break; }
      if (plife != null && pdmg > 0) gamHit(s, plife);
      finishDying(a);
    }
    if (!s.over) {
      var al = [mesaTroops(s.p[0]).filter(function (i) { return !i.turret; }).length, mesaTroops(s.p[1]).filter(function (i) { return !i.turret; }).length];
      [0, 1].forEach(function (p) {
        var P = s.p[p], won = al[p] > al[1 - p];
        if (P.fl.work && won) { var wg = P.fl.work === true ? 5 : P.fl.work; P.gold += wg; fxFrame(s, p, 'trabajo', 'Horas extra', '+' + wg + ' de oro por ganar la ronda', []); }
      });
      [0, 1].forEach(function (p) { // Gambling: ronda sin daño directo a tu vida = orbes
        var P = s.p[p], g = gamState(P), hit = g.hit, t = (s.tiers && s.tiers[p] && s.tiers[p]['Gambling']) || tiers(P)['Gambling']; g.hit = false; // nivel con el que empezó el combate (aunque las Gambling hayan caído)
        if (!t || g.done || hit) return;
        var n = FX.gambling.orbs[t - 1]; g.orbs += n;
        fxFrame(s, p, 'gorb', 'Gambling', '+' + n + (n === 1 ? ' orbe' : ' orbes') + ' (' + g.orbs + ' acumuladas)', mesaTroops(P).filter(function (i) { return has(i, 'Gambling'); }).map(function (i) { return i.uid; }));
      });
      [0, 1].forEach(function (p) { // Gambling legendaria/épica: pasivas de Dashlight y Mertens Gambler (si terminan la ronda vivas)
        if (s.over) return;
        var P = s.p[p], g = gamState(P);
        if (g.done) return;
        var t = (s.tiers && s.tiers[p] && s.tiers[p]['Gambling']) || tiers(P)['Gambling'] || 1;
        var alive = function (id) { return mesaTroops(P).filter(function (i) { return pas(i) === id; }); };
        var dl = alive('colega');
        if (dl.length && g.orbs >= 20) {
          var dm = Math.floor(g.orbs / 2), E = s.p[1 - p];
          E.life -= dm;
          frame(s, pv(s, p, '', 'Rival · ') + 'Jackpot: ' + dm + ' de daño directo a ' + pv(s, p, 'la vida del rival', 'tu vida') + '.', { life: 1 - p, dmg: dm, fx: { type: 'colega', side: p, title: 'Jackpot', sub: dm + ' de daño directo', uids: dl.map(function (i) { return i.uid; }), neg: false } });
          if (E.life <= 0) { s.over = true; s.phase = 'over'; s.winner = p; s.reason = 'Vida a cero.'; return; }
          gamOpen(s, p, g.orbs, t, 'Rival · ');
          gamHit(s, 1 - p); gamState(s.p[1 - p]).hit = false; // este golpe llega tras repartir las orbes de la ronda: no debe castigar la siguiente
          return;
        }
        var mr = alive('malaracha');
        if (mr.length && g.orbs > 10) {
          fxFrame(s, p, 'malaracha', 'Mala Racha', 'se abre la mitad de las orbes', mr.map(function (i) { return i.uid; }));
          gamOpen(s, p, Math.floor(g.orbs / 2), t, 'Rival · ', true);
        }
      });
      if (s.over) { frame(s, pv(s, s.winner, '¡Has ganado!', 'Has perdido.'), null); return; }
      cleanup(s);
      frame(s, 'Fin de la ronda ' + s.round + '.', null);
      s.phase = 'post';
    } else {
      frame(s, pv(s, s.winner, '¡Has ganado!', 'Has perdido.'), null);
    }
  }

  function cleanup(s) {
    s.p.forEach(function (P, pi) {
      P.mesa.forEach(function (i, k) {
        if (!i) return;
        if (i.turret) { P.mesa[k] = null; delete P.target[i.uid]; return; } // la torreta de Crescendum dura solo una ronda
        if (i.shadow && (i.dead || i.hp <= 0)) { P.mesa[k] = null; delete P.target[i.uid]; return; } // el soldado de sombra caído desaparece (tampoco revive)
        if (isNov(i) && s.mode !== 'revive' && (i.dead || i.hp <= 0)) { P.mesa[k] = null; novLose(P, i); return; } // en clásico, la novia caída queda eliminada
        if (s.mode === 'revive') { i.dead = false; i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = maxHp(i); return; } // Resurrección: todas vuelven con la vida completa
        if (i.dead || i.hp <= 0) { P.grave.push(i); P.mesa[k] = null; delete P.target[i.uid]; return; }
        i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = Math.min(i.hp, maxHp(i)); // sin curación entre rondas
      });
      P.hand.forEach(function (i) { if (isTroop(i)) { i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = s.mode === 'revive' ? maxHp(i) : Math.min(i.hp, maxHp(i)); } }); // en clásico las heridas se conservan en la mano
      P.target = {}; P.voley = {};
      shadowOrphan(s, pi);
    });
  }

  // ---------- Dashlight Sun Jin-Woo: Soldado de Sombra ----------
  // Al derrotar a una tropa (con el hueco 5 libre o con otro soldado), aparece una versión suya al 50% de estadísticas. Dura hasta que la derroten o Dashlight derrote a otra tropa.
  function shadowRaise(s, a, tgt) {
    var P = s.p[a.owner], n = mk(s, tgt.id, a.owner), c = card(tgt), old = P.mesa[5] && P.mesa[5].shadow ? P.mesa[5] : null;
    if (old) delete P.target[old.uid];
    var na = Math.max(1, Math.round(atk(tgt) / 2)), nh = Math.max(1, Math.round(maxHp(tgt) / 2));
    n.shadow = true; n.perm = { atk: na - c.atk, hp: nh - c.hp }; n.hp = nh; n.tmp = { atk: 0, hp: 0, red: 0 };
    P.mesa[5] = n;
    return ' Soldado de Sombra: ' + c.name + ' (' + na + '/' + nh + ') ocupa su hueco extra' + (old ? ' y sustituye al soldado anterior.' : ' hasta que lo derroten o Dashlight derrote a otra tropa.');
  }
  // El soldado de sombra dura hasta que lo derroten o Dashlight derrote a otra tropa; si Dashlight deja la mesa, se desvanece.
  function shadowOrphan(s, p) {
    var P = s.p[p], sh = P.mesa[5];
    if (!sh || !sh.shadow || mesaTroops(P).some(function (i) { return pas(i) === 'sombra' && !i.dead; })) return false;
    delete P.target[sh.uid]; P.mesa[5] = null; return true;
  }
  // ---------- AitoRLG MaoMao: Boticaria ----------
  // Al abrirse cada tienda: retira el soldado de sombra y, con MaoMao en la mesa, cada 2 tiendas cura o entrega un Remedio. Devuelve texto de registro.
  function shopStart(s, p) {
    var P = s.p[p], out = [];
    if (shadowOrphan(s, p)) out.push('El soldado de sombra desaparece: Dashlight ya no está en la mesa.');
    if (mesaTroops(P).some(function (i) { return pas(i) === 'boticaria'; })) {
      P.bot = (P.bot || 0) + 1;
      if (P.bot >= (s.rumble ? 4 : 2)) { // en Rumble hay una tienda por combate: mismo ritmo (cada 4 combates)
        P.bot = 0;
        var ML = s.maxLife || CFG.life;
        if (P.life < ML) { P.life = ML; out.push('Boticaria: tu vida se rellena al máximo.'); }
        else if (P.hand.length < handCap(s)) { P.hand.push(mk(s, 'remedio', p)); out.push('Boticaria: tu vida está al máximo, recibes un Remedio.'); }
        else out.push('Boticaria: tu mano está llena, no recibes el Remedio.');
      }
    }
    return out.join(' ');
  }
  // ---------- Anime: Genkidama ----------
  // Las Anime almacenan la mitad del daño que reciben (sin contar el sobrante al caer) mientras la sinergia está activa.
  function genCharge(s, v, n) {
    if (!v || n <= 0 || !has(v, 'Anime')) return;
    var t = s.tiers && s.tiers[v.owner];
    if (!t || !t['Anime']) return;
    var P = s.p[v.owner]; P.gen = (P.gen || 0) + n * FX.anime.store[Math.min(2, t['Anime'] - 1)];
  }
  function genStored(P) { return Math.floor((P.gen || 0) + 1e-9); }
  // Cada ronda con la sinergia activa se entrega una carta Genkidama (si no tienes ya una y hay hueco en la mano)
  function genGive(s, p) {
    var P = s.p[p];
    if ((tiers(P)['Anime'] || 0) < 1 || P.hand.length >= handCap(s) || P.hand.some(function (i) { return i && i.id === 'genkidama'; })) return;
    P.hand.push(mk(s, 'genkidama', p));
    if (p === 0 || s.pvp) say(s, pv(s, p, 'Sinergia Anime: recibes una Genkidama.', 'El rival recibe una Genkidama.'));
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
        ['mesa', 'hand', 'grave', 'nvs'].forEach(function (z) { (P[z] || []).forEach(function (i) { if (i) { i.uid = fu(i.uid); i.owner = 1 - i.owner; } }); });
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
    c.p[1].deck = []; c.p[1].offers = []; /* las novias del rival no se ocultan */ c.p[1].target = {}; c.p[1].voley = {};
    c.me = seat;
    return bindRng(c);
  }

  // ---------- Utilidades para la interfaz ----------
  var API = {
    ARMA_NM: ARMA_NM, ARMA_TX: ARMA_TX, ARMAS: ARMAS,
    _mk: mk, _startEffects: startEffects, _tiers: tiers,
    bindRng: bindRng, revive: revive, income: income, openShop: openShop, noTroops: noTroops, shopStuck: shopStuck, cleanup: cleanup, newPlayer: newPlayer, resolveText: function (x, seat) { return x.replace(/\u0001(\d)\u0002([^\u0002]*)\u0002([^\u0003]*)\u0003/g, function (m, p, a, b) { return +p === seat ? a : b; }); }, mirror: mirror, pv: pv, CFG: CFG, FX: FX, CARD: CARD, DATA: DATA,
    newGame: newGame, randomDeck: randomDeck, deckSize: deckSize, mulberry32: mulberry32,
    place: place, playAction: playAction, setTarget: setTarget, clearTargets: clearTargets, forfeit: forfeit, setVoley: setVoley, actionBlock: actionBlock, validTarget: validTarget,
    sell: sell, sellValue: sellValue, handCap: handCap, dupBlock: dupBlock, buy: buy, mergeCheck: mergeCheck, willMerge: willMerge, shopOdds: shopOdds, refresh: refresh, refreshCost: refreshCost, pickFromDeck: pickFromDeck, retire: retire,
    aiDeck: aiDeck, rumbleDeck: rumbleDeck, shopEvery: shopEvery, genGive: genGive, shopStart: shopStart, genStored: genStored, aiBonus: aiBonus, aiLv: aiLv, aiShop: aiShop, aiPrep: aiPrep, aiTargets: aiTargets, fight: fight, endShop: endShop, pendingTargets: pendingTargets, freeze: freeze, nextRound: nextRound,
    interest: interest, isNov: isNov, immune: immune, targetable: targetable, novSync: novSync, themeCounts: themeCounts, tiers: tiers, tierOf: tierOf, atk: atk, maxHp: maxHp, card: card, isTroop: isTroop, has: has, mesaTroops: mesaTroops, viewOf: viewOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CartasEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
