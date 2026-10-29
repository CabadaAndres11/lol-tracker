(function () {
  'use strict';
  var E = window.CartasEngine, D = E.DATA, CARD = E.CARD, CFG = E.CFG;
  var app = document.getElementById('app');
  var ui = { screen: 'home', filter: '', group: false, deck: [], s: null, sel: null, view: null, playing: false, shown: 0, frames: [], hl: null, hint: '' };

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

  // ---------- Navegación (cliente de acceso) ----------
  var NAV = [['home', '🏠 Inicio'], ['play', '⚔ Jugar'], ['deck', '🃏 Mazo'], ['themes', '✨ Temáticas'], ['rules', '📖 Normas']];
  function navHtml(cur) {
    return '<nav class="nav">' + NAV.map(function (n) { return '<button class="navb' + (n[0] === cur ? ' on' : '') + '" data-act="nav" data-to="' + n[0] + '">' + n[1] + '</button>'; }).join('') +
      '<span class="navsp"></span><a class="navb" href="/">← Hub</a><button class="navb" data-act="lock">🔒 Bloquear</button></nav>';
  }
  function head(cur, title) { return '<div class="wrap">' + navHtml(cur) + (title ? '<h1 class="ptitle">' + title + '</h1>' : ''); }

  function renderHome() {
    var troops = D.cards.length, n = Object.keys(D.themes).length;
    var h = head('home') + '<div class="hero"><img src="/cartas/logo.svg" alt="" class="hero-logo"><h1>Juego de Cartas</h1><p class="mut">Mazos con temáticas combinables, combates por rondas y memes de la pandilla.</p></div>';
    h += '<div class="menu">' + [
      ['play', '⚔', 'Jugar', 'Duelo 1 contra 1 contra la IA con tu mazo.'],
      ['deck', '🃏', 'Mazo', 'Elige tus cartas (' + deckSize() + '/' + CFG.deckBudget + ' usado) y explora por temática.'],
      ['themes', '✨', 'Temáticas', n + ' temáticas con sus niveles y cartas.'],
      ['rules', '📖', 'Normas', 'Cómo funcionan las rondas, la tienda y el combate.'],
    ].map(function (m) { return '<button class="menu-i" data-act="nav" data-to="' + m[0] + '"><span class="mi">' + m[1] + '</span><b>' + m[2] + '</b><span class="mut">' + m[3] + '</span></button>'; }).join('') + '</div>';
    h += '<p class="mut" style="text-align:center">' + troops + ' tropas · ' + D.actions.length + ' acciones · versión prototipo (sobres y monedas, próximamente)</p></div>';
    app.innerHTML = h;
  }

  function renderRules() {
    var sec = function (t, items) { return '<div class="panel"><h2>' + t + '</h2><ul class="rules">' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div>'; };
    app.innerHTML = head('rules', '📖 Normas') +
      sec('Objetivo', ['Es un 1 contra 1. Empiezas con <b>12 de vida</b>; gana quien deje la vida del rival a 0.']) +
      sec('Tu mazo', ['El mazo tiene un <b>presupuesto de tamaño de ' + CFG.deckBudget + '</b>: las tropas baratas ocupan 1, las medias 2 y las de coste 5 ocupan 3; las acciones ocupan 1.', 'No hay cartas duplicadas en el mazo, pero una misma carta puede salir varias veces en la tienda.']) +
      sec('Una ronda', ['Cada ronda ganas <b>2 de oro</b> (empiezas con 3). El oro se reinicia en cada partida y es distinto de las monedas de los sobres.', 'Tienes <b>4 huecos en mesa</b> y una <b>mano de 5</b>.', 'En la preparación colocas tropas, juegas acciones y eliges, <b>en secreto</b>, a qué tropa rival ataca cada una de las tuyas.', 'Si no eliges objetivo, esa tropa ataca a una rival al azar.']) +
      sec('Tienda', ['Cada <b>3 rondas</b> hay tienda: 4 cartas al azar de tu propio mazo (las raras salen menos). Renovar cuesta 1 de oro.', '<b>Solo en las rondas de tienda</b> puedes retirar tropas de la mesa; el resto del tiempo puedes colocar si hay hueco, pero no quitar.', 'Las tropas de coste 5 solo aparecen a partir de la segunda tienda.']) +
      sec('Combate', ['Los ataques se resuelven de uno en uno, alternando bandos de izquierda a derecha. Cada tropa ataca <b>una vez por ronda</b>. El bando que empieza se alterna cada ronda.', 'Si el objetivo ya murió, el ataque va a una tropa rival viva al azar.', 'No se puede atacar al jugador directamente: <b>recibes daño solo si todas tus tropas han muerto</b> y a tu rival le quedan tropas por atacar; el daño es igual a su ataque.', 'Al final de la ronda las tropas recuperan toda su vida máxima; las muertas liberan su hueco.', 'Si antes de una ronda de tienda no tienes tropas ni en mesa ni en mano, <b>pierdes automáticamente</b>.']) +
      sec('Temáticas', ['Cada tropa tiene 1 o 2 temáticas. Cuentan las <b>cartas distintas</b> de cada temática entre mesa y mano (las copias no suman; las acciones no tienen temática).', 'Al llegar a ciertos números (niveles) la temática da su bonificación a sus tropas en mesa. Mira la pestaña <b>Temáticas</b> para el detalle.', 'Las cartas de una sola temática llevan estadísticas extra de compensación.']) +
      sec('Rareza', ['Común, Rara, Épica y Legendaria. Depende de lo pequeña que sea la temática: cuanto menos gente comparte la temática, más rara la carta.']) +
      sec('Todavía por llegar', ['Pasivas en las tropas de coste 5, más acciones, sobres y monedas, y partidas contra otros jugadores.']) + '</div>';
  }

  function themeCards(t) { return D.cards.filter(function (c) { return c.themes.indexOf(t) >= 0; }); }
  function renderThemes() {
    var h = head('themes', '✨ Temáticas') + '<p class="mut">Pulsa una temática para ver sus cartas en el mazo.</p>';
    Object.keys(D.themes).forEach(function (t) {
      var T = D.themes[t], cs = themeCards(t);
      h += '<div class="panel"><h2>' + tagHtml(t) + ' <span class="mut" style="letter-spacing:0;text-transform:none">· ' + cs.length + ' cartas</span></h2>' +
        T.tx.map(function (x, k) { return '<p class="lv"><b>Nivel ' + (k + 1) + ' · ' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') +
        '<div class="chips">' + cs.map(function (c) { return '<span class="chip r-' + c.rarity + '">' + esc(c.name) + '</span>'; }).join('') + '</div>' +
        '<button class="btn sec" data-act="filter" data-t="' + esc(t) + '">Ver en el mazo →</button></div>';
    });
    app.innerHTML = h + '</div>';
  }

  // ---------- Pantalla de mazo ----------
  function deckSize() { return E.deckSize(ui.deck); }
  function themeSide() {
    var inDeck = {};
    ui.deck.forEach(function (id) { CARD[id].themes && CARD[id].themes.forEach(function (t) { inDeck[t] = (inDeck[t] || 0) + 1; }); });
    return '<aside class="side-themes panel"><h2>Temáticas</h2><p class="mut" style="margin:0 0 .4rem">Pasa el cursor para ver el detalle completo. Pulsa para filtrar.</p>' +
      Object.keys(D.themes).map(function (t) {
        var T = D.themes[t], on = ui.filter === t;
        var tip = '<div class="tip"><b>' + esc(t) + '</b>' + T.tx.map(function (x, k) { return '<p><b>' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') + '</div>';
        var short = T.tx[0].split(/[.:]/)[0];
        return '<div class="thm' + (on ? ' on' : '') + '" tabindex="0" data-act="filter" data-t="' + esc(t) + '">' + tagHtml(t) + ' <span class="cnt">' + (inDeck[t] || 0) + ' en mazo · niveles ' + T.th.join('/') + '</span><div class="sm">' + esc(short.length > 70 ? short.slice(0, 68) + '…' : short) + '</div>' + tip + '</div>';
      }).join('') + '</aside>';
  }
  function deckCard(c) {
    var inn = ui.deck.indexOf(c.id) >= 0;
    return cardHtml(c, { desc: true, cls: inn ? 'in' : '', attrs: 'data-act="toggle" data-id="' + c.id + '"', tag: 'button', atk: c.atk, hp: c.hp });
  }
  function renderDeck() {
    var used = deckSize(), troops = ui.deck.filter(function (id) { return CARD[id].type === 'tropa'; }).length;
    var f = ui.filter, all = D.cards.concat(D.actions);
    var h = head('deck', '🃏 Tu mazo') + '<div class="panel"><div class="bar" style="margin:0"><span class="pill">Tamaño <b>' + used + '/' + CFG.deckBudget + '</b></span><span class="pill">' + troops + ' tropas</span>' +
      '<button class="btn sec" data-act="randdeck">🎲 Aleatorio</button><button class="btn sec" data-act="cleardeck">Vaciar</button>' +
      '<button class="btn" data-act="nav" data-to="play"' + (troops ? '' : ' disabled') + '>⚔ Jugar</button></div>' +
      '<p class="mut" style="margin:.5rem 0 0">Pulsa las cartas para meterlas o sacarlas. Cada carta ocupa su tamaño.</p></div>';
    h += '<div class="deck-layout"><div class="deck-main">';
    h += '<div class="chips filt"><button class="chip' + (!f ? ' on' : '') + '" data-act="filter" data-t="">Todas</button>' +
      Object.keys(D.themes).map(function (t) { return '<button class="chip' + (f === t ? ' on' : '') + '" style="--tc:' + D.themes[t].color + '" data-act="filter" data-t="' + esc(t) + '">' + esc(t) + ' ' + themeCards(t).length + '</button>'; }).join('') +
      '<button class="chip' + (f === '__act' ? ' on' : '') + '" data-act="filter" data-t="__act">Acciones</button></div>';
    h += '<label class="grp"><input type="checkbox" data-act="group"' + (ui.group ? ' checked' : '') + '> Agrupar por temática</label>';
    if (ui.group && !f) {
      Object.keys(D.themes).forEach(function (t) {
        h += '<h3 class="gh" style="--tc:' + D.themes[t].color + '">' + tagHtml(t) + '</h3><div class="deckgrid">' + themeCards(t).map(deckCard).join('') + '</div>';
      });
      h += '<h3 class="gh">Acciones</h3><div class="deckgrid">' + D.actions.map(deckCard).join('') + '</div>';
    } else {
      var list = f === '__act' ? D.actions : (f ? themeCards(f) : all);
      h += '<div class="deckgrid">' + list.map(deckCard).join('') + '</div>';
    }
    h += '</div>' + themeSide() + '</div></div>';
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
    var h = '<div class="wrap"><div class="top"><div><h1>Ronda ' + s.round + (s.shopOpen ? ' · 🛒 Tienda' : '') + ' <span class="mut">· ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') + '</span></h1></div><div><button class="lnk" data-act="menu" data-to="deck">🃏 Mazo</button> · <button class="lnk" data-act="menu" data-to="home">🏠 Menú</button></div></div>';
    // Rival
    h += '<div class="side"><span>🤖 Rival</span><span><span class="pill life">❤ ' + view.life[1] + '</span> <span class="pill gold">🪙 ' + R.gold + '</span></span></div>';
    h += mesaRow(1, view, s, false);
    h += '<div class="side" style="margin-top:.8rem"><span>🧑 Tú</span><span><span class="pill life">❤ ' + view.life[0] + '</span> <span class="pill gold">🪙 ' + P.gold + '</span></span></div>';
    h += mesaRow(0, view, s, true);

    if (s.phase === 'over') {
      var win = s.winner === 0;
      h += '<div class="panel over"><h2>' + (win ? '🏆 ¡Has ganado!' : '💀 Has perdido') + '</h2><p class="mut">' + esc(s.reason) + ' · ronda ' + s.round + '</p><button class="btn big" data-act="play">Jugar otra vez</button> <button class="btn sec" data-act="menu" data-to="deck">Cambiar mazo</button> <button class="btn sec" data-act="menu" data-to="home">Menú</button></div>';
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
  function render() {
    var f = { home: renderHome, deck: renderDeck, rules: renderRules, themes: renderThemes }[ui.screen];
    if (f) f(); else renderGame();
  }

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
    if (act === 'nav') {
      clearInterval(timer); ui.playing = false;
      if (el.dataset.to === 'play') { if (!ui.deck.some(function (id) { return CARD[id].type === 'tropa'; })) { ui.screen = 'deck'; return render(); } saveDeck(); return startGame(); }
      ui.screen = el.dataset.to; window.scrollTo(0, 0); return render();
    }
    if (act === 'filter') { ui.filter = el.dataset.t === ui.filter ? '' : el.dataset.t; ui.screen = 'deck'; window.scrollTo(0, 0); return render(); }
    if (act === 'group') { ui.group = el.checked; return render(); }
    if (act === 'toggle') {
      var id = el.dataset.id, k = ui.deck.indexOf(id);
      if (k >= 0) ui.deck.splice(k, 1);
      else if (deckSize() + CARD[id].size <= CFG.deckBudget) ui.deck.push(id);
      saveDeck(); var y = window.scrollY; renderDeck(); window.scrollTo(0, y); return;
    }
    if (act === 'randdeck') { ui.deck = E.randomDeck(Math.random); saveDeck(); return renderDeck(); }
    if (act === 'cleardeck') { ui.deck = []; saveDeck(); return renderDeck(); }
    if (act === 'play') { if (!ui.deck.some(function (id) { return CARD[id].type === 'tropa'; })) return; saveDeck(); return startGame(); }
    if (act === 'menu') { clearInterval(timer); ui.playing = false; ui.screen = el.dataset.to || 'home'; return render(); }
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
