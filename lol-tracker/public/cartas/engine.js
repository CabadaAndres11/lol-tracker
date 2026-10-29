/* Motor del juego de cartas (prototipo). Sin DOM: se usa igual en el navegador y en Node para simular partidas. */
(function (root) {
  'use strict';
  var DATA = root.CARTAS || (typeof require !== 'undefined' ? require('./cards.js') : null);

  // ---------- Ajustes de balance (todo en un sitio para tocarlo fácil) ----------
  var CFG = {
    slots: 4, handMax: 5, life: 12, gold: 4, income: 2, shopEvery: 3, shopOffers: 4,
    refreshCost: 1, deckBudget: 20, maxRounds: 40,
    hpMult: 1.1, hpGrow: 1.25, // vida base de las tropas: x hpMult x hpGrow^(coste-1)
    rarityWeight: { 'Común': 50, 'Rara': 30, 'Épica': 15, 'Legendaria': 5 },
  };
  var FX = {
    pokemon: { probs: [[70, 25, 5], [45, 40, 15], [25, 45, 30]], bonus: [1, 2, 3], names: ['Pokéball', 'Superball', 'Ultraball'] },
    comebacker: { atk: [1, 2, 2], others: [0, 0, 1] },
    lol: { atk: [1, 1, 2], hp: [0, 1, 2], cap: [4, 6, 8] },
    trabajo: { shop: [0, 0, 2] },
    anime: { cede: [1, 2, 3] },
    koi: { atk: [1, 2, 3] },
    voley: { atk: [1, 2, 3], red: [1, 1, 2] },
    novia: { p: [0.6, 0.75, 0.9], up: [1, 2, 3], down: 1 },
    tilt: { hit: [1, 1, 2], perm: [1, 2, 2], cap: 6 },
    pueblo: { per: [1, 2], cap: [4, 8] },
    duo: { stat: 3, death: 2 },
    nini: { per: 2, cap: 8 },
    pelayos: { cap: 10 },
  };
  var ACTION_FX = {
    refuerzo: function (t) { t.tmp.atk += 2; },
    escudo: function (t) { t.tmp.hp += 3; t.hp += 3; },
    zancadilla: function (t) { t.tmp.atk -= 2; },
  };

  if (!DATA.hpScaled) {
    DATA.cards.forEach(function (c) { c.hp = Math.max(1, Math.round(c.hp * CFG.hpMult * Math.pow(CFG.hpGrow, c.cost - 1))); });
    DATA.hpScaled = true;
  }
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

  // ---------- Instancias ----------
  function mk(s, id, owner) {
    var c = CARD[id];
    var i = { uid: s.uid++, id: id, owner: owner, perm: { atk: 0, hp: 0 }, tmp: { atk: 0, hp: 0, red: 0 }, dead: false, caps: { lol: 0, pueblo: 0, nini: 0, pel: 0, tilt: 0 } };
    i.hp = c.hp || 0;
    return i;
  }
  function card(i) { return CARD[i.id]; }
  function isTroop(i) { return card(i).type === 'tropa'; }
  function maxHp(i) { return Math.max(1, card(i).hp + i.perm.hp + i.tmp.hp); }
  function atk(i) { return Math.max(0, card(i).atk + i.perm.atk + i.tmp.atk); }
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
  function randomDeck(rng) {
    var pool = DATA.cards.concat(DATA.actions).map(function (c) { return c.id; });
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
    return { life: CFG.life, gold: CFG.gold, deck: deck.slice(), hand: [], mesa: [null, null, null, null], grave: [], target: {}, voley: {}, offers: [], refreshes: 0, pickUsed: false, anime: 0, lost: false };
  }

  function newGame(deckA, deckB, seed) {
    var s = { rng: mulberry32(seed == null ? (Date.now() & 0xffffff) : seed), uid: 1, round: 0, shops: 0, phase: 'prep', shopOpen: false, first: 0, over: false, winner: -1, reason: '', log: [], frames: [], p: [newPlayer(deckA), newPlayer(deckB)], lastBall: [null, null] };
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
    var P = s.p[p], t = tiers(P), g = CFG.income, extra = 0;
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
    s.first = (s.round - 1) % 2;
    s.frames = [];
    s.shopOpen = false;
    [0, 1].forEach(function (p) {
      var got = income(s, p);
      if (p === 0) say(s, 'Ronda ' + s.round + ': +' + got + ' de oro.');
      s.p[p].target = {}; s.p[p].anime = 0;
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
        say(s, (s.winner === 0 ? 'El rival' : 'Tú') + ' no tenías tropas: derrota automática.');
        return;
      }
    }
    s.phase = 'prep';
    aiShop(s, 1);
    aiPrep(s, 1);
  }

  // ---------- Tienda ----------
  function offerPool(s, p) {
    var P = s.p[p], t = tiers(P);
    var pool = P.deck.filter(function (id) { return CARD[id].type === 'tropa' || true; });
    var elig = pool.filter(function (id) { return !(CARD[id].cost === 5 && CARD[id].type === 'tropa' && s.shops < 2); });
    if (!elig.length) elig = pool;
    if (s.round === 1) { // tienda inicial: solo tropas comunes
      var cm = pool.filter(function (id) { return CARD[id].type === 'tropa' && CARD[id].rarity === 'Común'; });
      if (cm.length) elig = cm;
    }
    var boost = (t['Informático'] || 0) >= 1;
    return elig.map(function (id) {
      var w = CFG.rarityWeight[CARD[id].rarity] || 10;
      if (boost && CARD[id].rarity !== 'Común') w *= 2;
      return { id: id, w: w };
    });
  }
  function drawOffer(s, p) {
    var pool = offerPool(s, p), tot = pool.reduce(function (a, b) { return a + b.w; }, 0), r = s.rng() * tot;
    for (var k = 0; k < pool.length; k++) { r -= pool[k].w; if (r <= 0) return pool[k].id; }
    return pool[pool.length - 1].id;
  }
  function openShop(s, p) {
    var P = s.p[p], t = tiers(P);
    P.refreshes = 0; P.pickUsed = false; P.offers = [];
    for (var n = 0; n < CFG.shopOffers; n++) P.offers.push(drawOffer(s, p));
    if (mesaTroops(P).some(function (i) { return has(i, 'Trabajo'); }) && FX.trabajo.shop[(t['Trabajo'] || 0) - 1]) {
      var b = FX.trabajo.shop[(t['Trabajo'] || 0) - 1];
      P.gold += b;
      if (p === 0) say(s, 'Trabajo: +' + b + ' de oro al abrir la tienda.');
    }
  }
  function refreshCost(s, p) {
    var P = s.p[p], t = tiers(P);
    return ((t['Informático'] || 0) >= 2 && P.refreshes === 0) ? 0 : CFG.refreshCost;
  }
  function refresh(s, p) {
    var P = s.p[p];
    if (!s.shopOpen || s.phase !== 'prep') return false;
    var c = refreshCost(s, p);
    if (P.gold < c) return false;
    P.gold -= c; P.refreshes++;
    var keep = P.offers.filter(function (x) { return x && x.extra; });
    P.offers = [];
    for (var n = 0; n < CFG.shopOffers; n++) P.offers.push(drawOffer(s, p));
    return true;
  }
  function pickFromDeck(s, p, id) {
    var P = s.p[p], t = tiers(P);
    if (!s.shopOpen || (t['Informático'] || 0) < 3 || P.pickUsed || P.deck.indexOf(id) < 0) return false;
    P.pickUsed = true; P.offers.push(id);
    return true;
  }
  function buy(s, p, idx) {
    var P = s.p[p], id = P.offers[idx];
    if (!s.shopOpen || s.phase !== 'prep' || !id) return false;
    var c = CARD[id];
    if (P.gold < c.cost || P.hand.length >= CFG.handMax) return false;
    P.gold -= c.cost; P.offers.splice(idx, 1);
    P.hand.push(mk(s, id, p));
    return true;
  }
  function retire(s, p, slot) {
    var P = s.p[p], i = P.mesa[slot];
    if (!s.shopOpen || s.phase !== 'prep' || !i || i.dead) return false;
    if (has(i, 'Lol')) return false;
    if (P.hand.length >= CFG.handMax) return false;
    P.mesa[slot] = null; i.hp = maxHp(i); P.hand.push(i);
    delete P.target[i.uid];
    return true;
  }

  // ---------- Preparación ----------
  function place(s, p, handIdx, slot) {
    var P = s.p[p], i = P.hand[handIdx];
    if (s.phase !== 'prep' || !i || !isTroop(i) || P.mesa[slot]) return false;
    P.hand.splice(handIdx, 1); P.mesa[slot] = i;
    return true;
  }
  function playAction(s, p, handIdx, targetUid) {
    var P = s.p[p], i = P.hand[handIdx];
    if (s.phase !== 'prep' || !i || isTroop(i)) return false;
    var c = card(i), tgt = null;
    if (c.target === 'ally') tgt = P.mesa.filter(alive).filter(function (x) { return x.uid === targetUid; })[0];
    else if (c.target === 'enemy') tgt = s.p[1 - p].mesa.filter(alive).filter(function (x) { return x.uid === targetUid; })[0];
    if (c.target !== 'none' && !tgt) return false;
    if (c.id === 'cafe') P.gold += 2; else ACTION_FX[c.id](tgt);
    P.hand.splice(handIdx, 1); P.grave.push(i);
    say(s, (p === 0 ? 'Juegas ' : 'El rival juega ') + c.name + (tgt ? ' sobre ' + card(tgt).name : '') + '.');
    return true;
  }
  function setTarget(s, p, uid, targetUid) {
    var P = s.p[p];
    if (targetUid == null) delete P.target[uid]; else P.target[uid] = targetUid;
  }
  function clearTargets(s, p) { s.p[p].target = {}; }
  function setVoley(s, p, uid, mode) { s.p[p].voley[uid] = mode; }

  // ---------- IA ----------
  function aiShop(s, p) {
    var P = s.p[p];
    if (!s.shopOpen) return;
    var guard = 0;
    while (guard++ < 8) {
      var best = -1, bestScore = -1;
      P.offers.forEach(function (id, k) {
        var c = CARD[id];
        if (c.cost > P.gold || P.hand.length >= CFG.handMax) return;
        var score = (c.type === 'tropa' ? 10 : 2) + c.cost * 2 + (c.atk || 0) * 0.3 + s.rng();
        if (score > bestScore) { bestScore = score; best = k; }
      });
      if (best < 0) break;
      buy(s, p, best);
    }
  }
  function aiPrep(s, p) {
    var P = s.p[p], me = P;
    var guard = 0;
    while (guard++ < 6) {
      var slot = P.mesa.indexOf(null);
      if (slot < 0) break;
      var best = -1, bs = -1;
      P.hand.forEach(function (i, k) { if (isTroop(i)) { var sc = atk(i) + maxHp(i) * 0.6 + s.rng(); if (sc > bs) { bs = sc; best = k; } } });
      if (best < 0) break;
      place(s, p, best, slot);
    }
    for (var k = P.hand.length - 1; k >= 0; k--) {
      var i = P.hand[k];
      if (isTroop(i)) continue;
      var c = card(i), allies = mesaTroops(P), foes = mesaTroops(s.p[1 - p]);
      if (c.id === 'cafe') playAction(s, p, k, null);
      else if (c.target === 'ally' && allies.length) {
        allies.sort(function (a, b) { return atk(b) - atk(a); });
        playAction(s, p, k, allies[0].uid);
      } else if (c.target === 'enemy' && foes.length) {
        foes.sort(function (a, b) { return atk(b) - atk(a); });
        playAction(s, p, k, foes[0].uid);
      }
    }
    // Voley: ataca salvo que esté en desventaja numérica
    mesaTroops(P).forEach(function (i) { if (has(i, 'Voley')) P.voley[i.uid] = s.rng() < 0.7 ? 'atk' : 'def'; });
  }
  function aiTargets(s, p) {
    var P = s.p[p], foes = mesaTroops(s.p[1 - p]);
    mesaTroops(P).forEach(function (i) {
      if (!foes.length) return;
      var kill = foes.filter(function (f) { return atk(i) >= f.hp; }).sort(function (a, b) { return atk(b) - atk(a); });
      var tgt = kill.length ? kill[0] : foes.slice().sort(function (a, b) { return a.hp - b.hp; })[0];
      if (s.rng() < 0.2) tgt = foes[Math.floor(s.rng() * foes.length)];
      P.target[i.uid] = tgt.uid;
    });
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

  function grow(i, stat, n) {
    if (stat === 'atk') i.perm.atk += n;
    else { i.perm.hp += n; i.hp += n; }
  }

  function startEffects(s) {
    var T = [tiers(s.p[0]), tiers(s.p[1])];
    s.tiers = T;
    [0, 1].forEach(function (p) {
      var P = s.p[p], t = T[p], troops = mesaTroops(P), who = p === 0 ? 'Tus' : 'Las del rival';
      // Dúo
      if ((t['Dúo Inseparable'] || 0) >= 1) {
        var duos = troops.filter(function (i) { return has(i, 'Dúo Inseparable'); });
        duos.forEach(function (i) { i.tmp.atk += FX.duo.stat; i.tmp.hp += FX.duo.stat; i.hp += FX.duo.stat; });
        if (duos.length) say(s, 'Dúo Inseparable: +3/+3 a ' + duos.length + ' tropa(s).');
      }
      // Pokémon: bola
      if (t['Pokémon']) {
        var pk = troops.filter(function (i) { return has(i, 'Pokémon'); });
        var probs = FX.pokemon.probs[t['Pokémon'] - 1], r = s.rng() * 100, ball = 0;
        if (r < probs[0]) ball = 0; else if (r < probs[0] + probs[1]) ball = 1; else ball = 2;
        s.lastBall[p] = ball;
        var b = FX.pokemon.bonus[ball];
        pk.forEach(function (i) { i.tmp.atk += b; i.tmp.hp += b; i.hp += b; });
        if (pk.length) say(s, (p === 0 ? 'Tu ' : 'La ') + FX.pokemon.names[ball] + (p === 0 ? '' : ' rival') + ': +' + b + '/+' + b + ' a las Pokémon.');
      }
      // Novia
      if (t['Novia'] && troops.length) {
        var nt = t['Novia'] - 1, up = s.rng() < FX.novia.p[nt];
        troops.forEach(function (i) {
          if (up) { i.tmp.atk += FX.novia.up[nt]; i.tmp.hp += FX.novia.up[nt]; i.hp += FX.novia.up[nt]; }
          else {
            var da = Math.min(FX.novia.down, atk(i) - 1), dh = Math.min(FX.novia.down, maxHp(i) - 1);
            if (da > 0) i.tmp.atk -= da;
            if (dh > 0) { i.tmp.hp -= dh; i.hp = Math.min(i.hp, maxHp(i)); }
          }
        });
        say(s, up ? (p === 0 ? 'Tu novia te apoya' : 'La novia rival le apoya') + ': +' + FX.novia.up[nt] + '/+' + FX.novia.up[nt] + ' a todas.' : (p === 0 ? 'Tu novia te regaña' : 'La novia rival le regaña') + ': -1/-1 a todas.');
      }
      // Pueblo
      if (t['Pueblo']) {
        var pt = t['Pueblo'] - 1;
        troops.filter(function (i) { return has(i, 'Pueblo'); }).forEach(function (i) {
          var g = Math.min(FX.pueblo.per[pt], FX.pueblo.cap[pt] - i.caps.pueblo);
          if (g > 0) { i.caps.pueblo += g; grow(i, 'atk', g); grow(i, 'hp', g); }
        });
      }
      // NINI
      if (t['NINI'] && !hasWork(P)) {
        troops.filter(function (i) { return has(i, 'NINI'); }).forEach(function (i) {
          var g = Math.min(FX.nini.per, FX.nini.cap - i.caps.nini);
          if (g > 0) { i.caps.nini += g; grow(i, 'atk', g); grow(i, 'hp', g); }
        });
      }
      // Voley
      if (t['Voley']) {
        var vt = t['Voley'] - 1;
        troops.filter(function (i) { return has(i, 'Voley'); }).forEach(function (i) {
          var mode = P.voley[i.uid] || 'atk';
          if (mode === 'atk') i.tmp.atk += FX.voley.atk[vt]; else i.tmp.red += FX.voley.red[vt];
        });
      }
    });
    // Comebacker (con los números ya modificados)
    var sums = [0, 1].map(function (p) { return mesaTroops(s.p[p]).reduce(function (a, i) { return a + maxHp(i); }, 0); });
    [0, 1].forEach(function (p) {
      var t = T[p];
      if (!t['Comebacker']) return;
      if (sums[p] < sums[1 - p]) {
        var ct = t['Comebacker'] - 1;
        mesaTroops(s.p[p]).forEach(function (i) {
          if (has(i, 'Comebacker')) i.tmp.atk += FX.comebacker.atk[ct];
          else if (FX.comebacker.others[ct]) i.tmp.atk += FX.comebacker.others[ct];
        });
        say(s, (p === 0 ? 'Remontada' : 'Remontada del rival') + ': +' + FX.comebacker.atk[ct] + ' de ataque a las Comebacker.');
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

  function pendingTargets(s) {
    var foes = mesaTroops(s.p[1]);
    if (!foes.length) return [];
    var T = s.p[0].target;
    return mesaTroops(s.p[0]).filter(function (i) { return !(T[i.uid] && foes.some(function (f) { return f.uid === T[i.uid]; })); });
  }

  function fight(s) {
    if (s.phase !== 'prep' || s.over || s.shopOpen) return false;
    if (pendingTargets(s).length) return false;
    s.shopOpen = false;
    s.frames = [];
    aiTargets(s, 1);
    startEffects(s);
    frame(s, 'Empieza el combate. ' + (s.first === 0 ? 'Atacas primero.' : 'Ataca primero el rival.'), null);
    var seq = order(s);
    for (var n = 0; n < seq.length && !s.over; n++) {
      var a = seq[n];
      if (a.dead) continue;
      var P = s.p[a.owner], E = s.p[1 - a.owner], foes = mesaTroops(E);
      var tgt = null;
      if (P.target[a.uid]) tgt = foes.filter(function (f) { return f.uid === P.target[a.uid]; })[0] || null;
      if (!tgt && foes.length) tgt = foes[Math.floor(s.rng() * foes.length)];
      var dmg = atk(a);
      if (!tgt) {
        E.life -= dmg;
        frame(s, card(a).name + ' golpea directamente: ' + dmg + ' de daño a ' + (a.owner === 0 ? 'la vida del rival' : 'tu vida') + '.', { att: a.uid, life: 1 - a.owner, dmg: dmg });
        if (E.life <= 0) { s.over = true; s.phase = 'over'; s.winner = a.owner; s.reason = 'Vida a cero.'; break; }
        continue;
      }
      var real = Math.max(0, dmg - tgt.tmp.red);
      tgt.hp -= real;
      var line = card(a).name + ' ataca a ' + card(tgt).name + ': ' + real + ' de daño' + (tgt.tmp.red && real < dmg ? ' (reducido)' : '') + '.';
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
          var th = FX.tilt.hit[tt['Tilt'] - 1];
          tgt.tmp.atk += th;
        }
      }
      if (tgt.hp <= 0) {
        tgt.dead = true; tgt.hp = 0; line += ' ¡Cae!';
        var tt2 = s.tiers[tgt.owner];
        if (has(tgt, 'KOI') && tt2['KOI']) {
          var kb = FX.koi.atk[tt2['KOI'] - 1];
          mesaTroops(E).forEach(function (i) { i.tmp.atk += kb; });
          line += ' KOI anima al equipo: +' + kb + ' de ataque.';
        }
        if (has(tgt, 'Dúo Inseparable') && tt2['Dúo Inseparable']) {
          mesaTroops(E).filter(function (i) { return has(i, 'Dúo Inseparable'); }).forEach(function (i) { i.tmp.atk += FX.duo.death; });
        }
      }
      frame(s, line, { att: a.uid, tgt: tgt.uid, dmg: real });
    }
    if (!s.over) {
      // Tilt: si pierdes la ronda (menos tropas vivas), parte del ataque se queda
      var al = [mesaTroops(s.p[0]).length, mesaTroops(s.p[1]).length];
      [0, 1].forEach(function (p) {
        var t = s.tiers[p];
        if (t['Tilt'] && al[p] < al[1 - p]) {
          mesaTroops(s.p[p]).filter(function (i) { return has(i, 'Tilt'); }).forEach(function (i) {
            var g = Math.min(FX.tilt.perm[t['Tilt'] - 1], FX.tilt.cap - i.caps.tilt);
            if (g > 0) { i.caps.tilt += g; grow(i, 'atk', g); }
          });
          say(s, 'Tilt: las tropas enfadadas conservan ataque tras perder la ronda.');
        }
      });
      cleanup(s);
      frame(s, 'Fin de la ronda ' + s.round + '.', null);
      s.phase = 'post';
      var t0 = tiers(s.p[0]);
      var an = t0['Anime'] ? FX.anime.cede[t0['Anime'] - 1] : 0;
      s.p[0].anime = mesaTroops(s.p[0]).filter(function (i) { return has(i, 'Anime'); }).length >= 2 ? an : 0;
    } else {
      frame(s, s.winner === 0 ? '¡Has ganado!' : 'Has perdido.', null);
    }
  }

  function cleanup(s) {
    s.p.forEach(function (P) {
      P.mesa.forEach(function (i, k) {
        if (!i) return;
        if (i.dead) { P.grave.push(i); P.mesa[k] = null; delete P.target[i.uid]; return; }
        i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = Math.min(i.hp, maxHp(i)); // sin curación entre rondas
      });
      P.hand.forEach(function (i) { if (isTroop(i)) { i.tmp = { atk: 0, hp: 0, red: 0 }; i.hp = maxHp(i); } });
      P.target = {}; P.voley = {};
    });
  }

  // ---------- Anime: ceder estadísticas al final de la ronda ----------
  function cede(s, from, to, stat) {
    var P = s.p[0];
    if (s.phase !== 'post' || P.anime <= 0 || from === to) return false;
    var a = P.mesa.filter(function (i) { return i && i.uid === from && has(i, 'Anime'); })[0];
    var b = P.mesa.filter(function (i) { return i && i.uid === to && has(i, 'Anime'); })[0];
    if (!a || !b) return false;
    if (stat === 'atk') {
      var v = atk(a);
      if (v <= 0) return false;
      a.perm.atk -= v; b.perm.atk += v;
      say(s, card(a).name + ' cede ' + v + ' de ataque a ' + card(b).name + '.');
    } else {
      var m = maxHp(a), g = Math.floor(m / 2);
      b.perm.hp += g; b.hp += g;
      P.mesa[P.mesa.indexOf(a)] = null; P.grave.push(a);
      say(s, card(a).name + ' cede su vida y cae; ' + card(b).name + ' gana +' + g + ' de vida máxima.');
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

  // ---------- Utilidades para la interfaz ----------
  var API = {
    CFG: CFG, FX: FX, CARD: CARD, DATA: DATA,
    newGame: newGame, randomDeck: randomDeck, deckSize: deckSize, mulberry32: mulberry32,
    place: place, playAction: playAction, setTarget: setTarget, clearTargets: clearTargets, setVoley: setVoley,
    buy: buy, refresh: refresh, refreshCost: refreshCost, pickFromDeck: pickFromDeck, retire: retire,
    aiShop: aiShop, aiPrep: aiPrep, aiTargets: aiTargets, fight: fight, endShop: endShop, pendingTargets: pendingTargets, cede: cede, nextRound: nextRound,
    themeCounts: themeCounts, tiers: tiers, tierOf: tierOf, atk: atk, maxHp: maxHp, card: card, isTroop: isTroop, has: has, mesaTroops: mesaTroops, viewOf: viewOf,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.CartasEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
