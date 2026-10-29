(function () {
  'use strict';
  var E = window.CartasEngine, D = E.DATA, CARD = E.CARD, CFG = E.CFG;
  var app = document.getElementById('app');
  var ui = { screen: 'deck', deck: [], s: null, sel: null, view: null, playing: false, shown: 0, frames: [], hl: null, hint: '' };

  try { var sv = JSON.parse(localStorage.getItem('cartas_deck') || 'null'); if (sv && sv.length) ui.deck = sv.filter(function (id) { return CARD[id]; }); } catch (e) {}
  if (!ui.deck.length) ui.deck = E.randomDeck(Math.random);
  function saveDeck() { try { localStorage.setItem('cartas_deck', JSON.stringify(ui.deck)); } catch (e) {} }

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- Cartas ----------
  function tagHtml(t) { return '<span class="tag" style="--tc:' + D.themes[t].color + '">' + esc(t) + '</span>'; }
  function cardHtml(c, o) {
    o = o || {};
    var cls = 'card r-' + c.rarity + (c.type === 'accion' ? ' accion' : '') + (o.cls ? ' ' + o.cls : '');
    var h = '<' + (o.tag || 'div') + ' class="' + cls + '"' + (o.attrs ? ' ' + o.attrs : '') + '>';
    h += '<span class="cost">' + c.cost + '</span><div class="nm">' + esc(c.name) + '</div>';
    if (c.type === 'tropa') {
      h += '<div class="tags">' + c.themes.map(tagHtml).join('') + '</div>';
      if (o.desc) h += '<div class="desc">' + esc(c.person) + ' · ' + c.rarity + ' · tam. ' + c.size + '</div>';
      var a = o.atk != null ? o.atk : c.atk, hp = o.hp != null ? o.hp : c.hp;
      h += '<div class="stats"><span class="a' + (a > c.atk ? ' up' : '') + '">⚔ ' + a + '</span><span class="h' + (o.max != null && o.max > c.hp ? ' up' : '') + '">❤ ' + hp + (o.max != null && o.max !== hp ? '/' + o.max : '') + '</span></div>';
    } else {
      h += '<div class="desc" style="display:block">' + esc(c.text) + '</div><div class="stats"><span class="mut">Acción · tam. ' + c.size + '</span></div>';
    }
    if (o.mark) h += '<div class="mark">' + o.mark + '</div>';
    if (o.extra) h += o.extra;
    return h + '</' + (o.tag || 'div') + '>';
  }

  // ---------- Pantalla de mazo ----------
  function deckSize() { return E.deckSize(ui.deck); }
  function renderDeck() {
    var used = deckSize(), troops = ui.deck.filter(function (id) { return CARD[id].type === 'tropa'; }).length;
    var all = D.cards.concat(D.actions);
    var h = '<div class="wrap"><div class="top"><div><h1>🃏 Juego de Cartas <span class="mut">· prototipo</span></h1></div><div><a href="/">← Hub</a> · <button class="lnk" data-act="lock">Bloquear</button></div></div>';
    h += '<div class="panel"><h2>Tu mazo</h2><div class="bar"><span class="pill">Tamaño <b>' + used + '/' + CFG.deckBudget + '</b></span><span class="pill">' + troops + ' tropas</span>' +
      '<button class="btn sec" data-act="randdeck">🎲 Mazo aleatorio</button><button class="btn sec" data-act="cleardeck">Vaciar</button>' +
      '<button class="btn big" data-act="play"' + (troops ? '' : ' disabled') + '>⚔ Jugar contra la IA</button></div>' +
      '<p class="mut">Pulsa las cartas para meterlas o sacarlas. Cada carta ocupa su tamaño (tropas baratas 1, medias 2, de coste 5 → 3; acciones 1). El oponente usa un mazo aleatorio. Las temáticas se cuentan con cartas distintas en mesa + mano.</p></div>';
    h += '<div class="deckgrid">' + all.map(function (c) {
      var inn = ui.deck.indexOf(c.id) >= 0;
      return cardHtml(c, { desc: true, cls: inn ? 'in' : '', attrs: 'data-act="toggle" data-id="' + c.id + '"', tag: 'button', atk: c.atk, hp: c.hp });
    }).join('') + '</div>';
    h += '<div class="panel" style="margin-top:1rem"><h2>Temáticas</h2>' + Object.keys(D.themes).map(function (t) {
      var T = D.themes[t];
      return '<p style="margin:.3rem 0">' + tagHtml(t) + ' <span class="mut">con ' + T.th.join(' / ') + ' cartas distintas:</span> ' + esc(T.tx[0]) + '</p>';
    }).join('') + '</div></div>';
    app.innerHTML = h;
  }

  // ---------- Partida ----------
  function inst(P, uid) { return P.mesa.filter(function (i) { return i && i.uid === uid; })[0]; }
  function startGame() {
    var seed = Math.floor(Math.random() * 1e9), r = E.mulberry32(seed + 7);
    ui.s = E.newGame(ui.deck, E.randomDeck(r), seed);
    ui.screen = 'game'; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = '';
    render();
  }
  function synergyHtml(P) {
    var c = E.themeCounts(P), keys = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; });
    if (!keys.length) return '<span class="mut">Sin tropas en mesa o mano.</span>';
    return keys.map(function (t) {
      var T = D.themes[t], tier = E.tierOf(t, c[t]), nxt = T.th[tier];
      return '<div class="synchip' + (tier ? '' : ' off') + '" style="--tc:' + T.color + '"><b>' + esc(t) + '</b> ' + c[t] + ' carta(s) · ' + (tier ? 'nivel ' + tier + ': ' + esc(T.tx[tier - 1]) : 'necesitas ' + T.th[0]) + (nxt ? ' <span class="mut">(siguiente nivel con ' + nxt + ')</span>' : '') + '</div>';
    }).join('');
  }
  function mesaRow(side, view, s, mine) {
    var P = s.p[side], prep = s.phase === 'prep' && !ui.playing, sel = ui.sel, h = '<div class="row4">';
    view.mesa[side].forEach(function (v, k) {
      if (!v) {
        var free = mine && prep && sel && sel.k === 'hand' && E.isTroop(P.hand[sel.i]);
        h += '<div class="slot' + (free ? ' free' : '') + '"' + (free ? ' data-act="slot" data-i="' + k + '"' : '') + '>' + (free ? 'Colocar aquí' : 'Hueco') + '</div>';
        return;
      }
      var c = CARD[v.id], o = { atk: v.atk, hp: v.hp, max: v.max, cls: '', desc: false }, I = inst(P, v.uid);
      if (v.dead) o.cls += ' dead';
      if (ui.hl && ui.hl.att === v.uid) o.cls += ' atk';
      if (ui.hl && ui.hl.tgt === v.uid) o.cls += ' hit';
      if (mine) {
        if (sel && sel.k === 'mine' && sel.uid === v.uid) o.cls += ' sel';
        var tg = P.target[v.uid];
        if (tg && prep) { var T = inst(s.p[1], tg); o.mark = '🎯 ' + (T ? CARD[T.id].name : '?'); }
        if (prep && I && E.has(I, 'Voley')) {
          var m = P.voley[v.uid] || 'atk';
          o.extra = '<div class="mini"><button data-act="voley" data-uid="' + v.uid + '" data-m="atk" class="' + (m === 'atk' ? 'on' : '') + '">Ataque</button><button data-act="voley" data-uid="' + v.uid + '" data-m="def" class="' + (m === 'def' ? 'on' : '') + '">Defensa</button></div>';
        }
        if (prep && s.shopOpen && I && !E.has(I, 'Lol')) o.extra = (o.extra || '') + '<div class="mini"><button data-act="retire" data-slot="' + k + '">↩ Retirar</button></div>';
        o.attrs = 'data-act="mine" data-uid="' + v.uid + '"';
        if (sel && sel.k === 'act' && CARD[P.hand[sel.i].id].target === 'ally') o.cls += ' tgtable';
      } else {
        o.attrs = 'data-act="foe" data-uid="' + v.uid + '"';
        if (prep && sel && ((sel.k === 'mine') || (sel.k === 'act' && CARD[s.p[0].hand[sel.i].id].target === 'enemy'))) o.cls += ' tgtable';
      }
      h += cardHtml(c, o);
    });
    return h + '</div>';
  }
  function renderGame() {
    var s = ui.s, view = ui.view || E.viewOf(s), P = s.p[0], R = s.p[1], prep = s.phase === 'prep' && !ui.playing;
    var h = '<div class="wrap"><div class="top"><div><h1>Ronda ' + s.round + (s.shopOpen ? ' · 🛒 Tienda' : '') + ' <span class="mut">· ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') + '</span></h1></div><div><button class="lnk" data-act="menu">← Mazo</button></div></div>';
    // Rival
    h += '<div class="side"><span>🤖 Rival</span><span><span class="pill life">❤ ' + view.life[1] + '</span> <span class="pill gold">🪙 ' + R.gold + '</span></span></div>';
    h += mesaRow(1, view, s, false);
    h += '<div class="side" style="margin-top:.8rem"><span>🧑 Tú</span><span><span class="pill life">❤ ' + view.life[0] + '</span> <span class="pill gold">🪙 ' + P.gold + '</span></span></div>';
    h += mesaRow(0, view, s, true);

    if (s.phase === 'over') {
      var win = s.winner === 0;
      h += '<div class="panel over"><h2>' + (win ? '🏆 ¡Has ganado!' : '💀 Has perdido') + '</h2><p class="mut">' + esc(s.reason) + ' · ronda ' + s.round + '</p><button class="btn big" data-act="play">Jugar otra vez</button> <button class="btn sec" data-act="menu">Cambiar mazo</button></div>';
    } else if (ui.playing) {
      h += '<div class="bar"><button class="btn sec" data-act="skip">⏩ Saltar animación</button></div>';
    } else if (s.phase === 'prep') {
      h += '<div class="hint">' + esc(ui.hint || (P.mesa.some(Boolean) ? 'Elige una tropa tuya y luego la rival a la que atacará (si no eliges, ataca a una al azar).' : 'Coloca tropas de tu mano en la mesa.')) + '</div>';
      h += '<div class="bar"><button class="btn big" data-act="fight">⚔ ¡Combatir!</button></div>';
    } else if (s.phase === 'post') {
      if (P.anime > 0) {
        var an = P.mesa.filter(function (i) { return i && !i.dead && E.has(i, 'Anime'); });
        var opts = an.map(function (i) { return '<option value="' + i.uid + '">' + esc(CARD[i.id].name) + ' (' + E.atk(i) + '/' + E.maxHp(i) + ')</option>'; }).join('');
        h += '<div class="panel"><h2>Anime · puedes ceder estadísticas (' + P.anime + ' uso/s)</h2><div class="bar"><select id="an-from">' + opts + '</select> → <select id="an-to">' + opts + '</select>' +
          '<button class="btn sec" data-act="cede" data-stat="atk">Ceder todo el ataque</button><button class="btn sec" data-act="cede" data-stat="hp">Ceder vida (cae)</button></div></div>';
      }
      h += '<div class="bar"><button class="btn big" data-act="next">Siguiente ronda →</button></div>';
    }

    // Mano
    h += '<div class="panel"><h2>Tu mano (' + P.hand.length + '/' + CFG.handMax + ')</h2><div class="hand">';
    P.hand.forEach(function (i, k) {
      var c = CARD[i.id], sel = ui.sel && (ui.sel.k === 'hand' || ui.sel.k === 'act') && ui.sel.i === k;
      h += cardHtml(c, { cls: sel ? 'sel' : '', attrs: 'data-act="hand" data-i="' + k + '"', tag: 'button', atk: c.atk, hp: c.hp });
    });
    for (var f = P.hand.length; f < CFG.handMax; f++) h += '<div class="slot">—</div>';
    h += '</div></div>';

    // Tienda
    if (s.shopOpen && prep) {
      var t = E.tiers(P), rc = E.refreshCost(s, 0);
      h += '<div class="panel"><h2>🛒 Tienda · cartas de tu mazo</h2><div class="shop">';
      P.offers.forEach(function (id, k) {
        var c = CARD[id];
        h += '<div class="offer">' + cardHtml(c, { atk: c.atk, hp: c.hp }) + '<button class="btn sec" data-act="buy" data-i="' + k + '"' + (P.gold < c.cost || P.hand.length >= CFG.handMax ? ' disabled' : '') + '>Comprar · ' + c.cost + '🪙</button></div>';
      });
      h += '</div><div class="bar"><button class="btn sec" data-act="refresh"' + (P.gold < rc ? ' disabled' : '') + '>🔄 Renovar · ' + rc + '🪙</button>';
      if ((t['Informático'] || 0) >= 3 && !P.pickUsed) {
        h += '<select id="pick-sel">' + P.deck.map(function (id) { return '<option value="' + id + '">' + esc(CARD[id].name) + '</option>'; }).join('') + '</select><button class="btn sec" data-act="pick">Añadir a la tienda</button>';
      }
      h += '</div><p class="mut">Solo en la tienda puedes retirar tropas de la mesa (↩). Las tropas de coste 5 aparecen a partir de la segunda tienda.</p></div>';
    }

    h += '<div class="panel"><h2>Sinergias de tu mazo (mesa + mano)</h2><div class="syn">' + synergyHtml(P) + '</div></div>';
    var shown = ui.playing ? s.log.slice(-Math.max(8, 0)) : s.log.slice(-14);
    h += '<div class="panel"><h2>Registro</h2><div class="log" id="log">' + shown.map(function (l, n) { return '<div' + (n === shown.length - 1 ? ' class="cur"' : '') + '>' + esc(l.text) + '</div>'; }).join('') + '</div></div></div>';
    app.innerHTML = h;
    var lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight;
  }
  function render() { if (ui.screen === 'deck') renderDeck(); else renderGame(); }

  // ---------- Animación del combate ----------
  var timer = null;
  function play() {
    var s = ui.s;
    ui.frames = s.frames.slice(); ui.shown = 0; ui.playing = true; ui.sel = null;
    clearInterval(timer);
    step();
    timer = setInterval(step, 750);
  }
  function step() {
    if (ui.shown >= ui.frames.length) { stopPlay(); return; }
    var f = ui.frames[ui.shown++];
    ui.view = f.view; ui.hl = f.hl;
    var s = ui.s; var real = s.log; // el registro ya está completo; mostramos el progreso hasta aquí
    render();
    var lg = document.getElementById('log');
    if (lg) { lg.innerHTML = '<div class="cur">' + esc(f.text) + '</div>' + ui.frames.slice(0, ui.shown - 1).reverse().slice(0, 7).map(function (x) { return '<div>' + esc(x.text) + '</div>'; }).join(''); }
  }
  function stopPlay() { clearInterval(timer); timer = null; ui.playing = false; ui.view = null; ui.hl = null; render(); }

  // ---------- Eventos ----------
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, s = ui.s, P = s && s.p[0];
    if (act === 'lock') return window.cartasLock();
    if (act === 'toggle') {
      var id = el.dataset.id, k = ui.deck.indexOf(id);
      if (k >= 0) ui.deck.splice(k, 1);
      else if (deckSize() + CARD[id].size <= CFG.deckBudget) ui.deck.push(id);
      saveDeck(); var y = window.scrollY; renderDeck(); window.scrollTo(0, y); return;
    }
    if (act === 'randdeck') { ui.deck = E.randomDeck(Math.random); saveDeck(); return renderDeck(); }
    if (act === 'cleardeck') { ui.deck = []; saveDeck(); return renderDeck(); }
    if (act === 'play') { if (!ui.deck.some(function (id) { return CARD[id].type === 'tropa'; })) return; saveDeck(); return startGame(); }
    if (act === 'menu') { clearInterval(timer); ui.playing = false; ui.screen = 'deck'; return render(); }
    if (act === 'skip') { clearInterval(timer); ui.shown = ui.frames.length; return stopPlay(); }
    if (!s || ui.playing) return;

    if (act === 'fight') { E.fight(s); ui.sel = null; ui.hint = ''; return play(); }
    if (act === 'next') { E.nextRound(s); ui.sel = null; ui.hint = ''; return render(); }
    if (act === 'cede') {
      var ok = E.cede(s, +document.getElementById('an-from').value, +document.getElementById('an-to').value, el.dataset.stat);
      ui.hint = ok ? '' : 'Elige dos tropas Anime distintas.'; return render();
    }
    if (act === 'buy') { E.buy(s, 0, +el.dataset.i); return render(); }
    if (act === 'refresh') { E.refresh(s, 0); return render(); }
    if (act === 'pick') { E.pickFromDeck(s, 0, document.getElementById('pick-sel').value); return render(); }
    if (act === 'voley') { E.setVoley(s, 0, +el.dataset.uid, el.dataset.m); return render(); }
    if (act === 'retire') { e.stopPropagation(); E.retire(s, 0, +el.dataset.slot); ui.sel = null; return render(); }
    if (s.phase !== 'prep') return;

    if (act === 'hand') {
      var i = +el.dataset.i, c = CARD[P.hand[i].id];
      if (ui.sel && ui.sel.i === i && (ui.sel.k === 'hand' || ui.sel.k === 'act')) { ui.sel = null; ui.hint = ''; return render(); }
      if (c.type === 'tropa') {
        if (!P.mesa.some(function (x) { return !x; })) { ui.hint = 'La mesa está llena: solo puedes retirar tropas en la tienda.'; ui.sel = null; }
        else { ui.sel = { k: 'hand', i: i }; ui.hint = 'Pulsa un hueco libre para colocarla.'; }
      } else if (c.target === 'none') { E.playAction(s, 0, i, null); ui.sel = null; ui.hint = ''; }
      else {
        ui.sel = { k: 'act', i: i };
        ui.hint = c.target === 'ally' ? 'Elige una tropa tuya en la mesa.' : 'Elige una tropa rival.';
      }
      return render();
    }
    if (act === 'slot') { if (ui.sel && ui.sel.k === 'hand') E.place(s, 0, ui.sel.i, +el.dataset.i); ui.sel = null; ui.hint = ''; return render(); }
    if (act === 'mine') {
      var uid = +el.dataset.uid;
      if (ui.sel && ui.sel.k === 'act') { if (E.playAction(s, 0, ui.sel.i, uid)) { ui.sel = null; ui.hint = ''; } else ui.hint = 'Esa acción no va sobre una tropa tuya.'; return render(); }
      if (ui.sel && ui.sel.k === 'mine' && ui.sel.uid === uid) { ui.sel = null; ui.hint = ''; return render(); }
      ui.sel = { k: 'mine', uid: uid }; ui.hint = 'Ahora pulsa la tropa rival a la que atacará.'; return render();
    }
    if (act === 'foe') {
      var fu = +el.dataset.uid;
      if (ui.sel && ui.sel.k === 'act') { if (E.playAction(s, 0, ui.sel.i, fu)) { ui.sel = null; ui.hint = ''; } else ui.hint = 'Esa acción no va sobre una tropa rival.'; return render(); }
      if (ui.sel && ui.sel.k === 'mine') { E.setTarget(s, 0, ui.sel.uid, fu); ui.sel = null; ui.hint = 'Objetivo asignado.'; return render(); }
    }
  });

  render();
})();
