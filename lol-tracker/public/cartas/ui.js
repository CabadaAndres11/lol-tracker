(function () {
  'use strict';
  var E = window.CartasEngine, D = E.DATA, CARD = E.CARD, CFG = E.CFG;
  var app = document.getElementById('app');
  var ui = { screen: 'home', filters: [], fmode: 'any', group: false, deck: [], slots: [null, null, null], slotTo: 0, slotName: '', msg: '', s: null, sel: null, view: null, playing: false, shown: 0, frames: [], hl: null, hint: '' };

  try { var sv = JSON.parse(localStorage.getItem('cartas_deck') || 'null'); if (sv && sv.length) ui.deck = sv.filter(function (id) { return CARD[id]; }); } catch (e) {}
  try { var sl = JSON.parse(localStorage.getItem('cartas_slots') || 'null'); if (sl && sl.length === 3) ui.slots = sl.map(function (x) { return x && x.ids ? { name: String(x.name || 'Mazo'), ids: x.ids.filter(function (id) { return CARD[id]; }) } : null; }); } catch (e) {}
  if (!ui.deck.length) ui.deck = E.randomDeck(Math.random);
  function saveDeck() { try { localStorage.setItem('cartas_deck', JSON.stringify(ui.deck)); } catch (e) {} }
  function saveSlots() { try { localStorage.setItem('cartas_slots', JSON.stringify(ui.slots)); } catch (e) {} }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- Cartas ----------
  function hexMix(a, b, t) {
    function p(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
    var x = p(a), y = p(b);
    return '#' + x.map(function (v, i) { return ('0' + Math.round(v * (1 - t) + y[i] * t).toString(16)).slice(-2); }).join('');
  }
  function tagHtml(t) { return '<span class="tag" style="--tc:' + D.themes[t].color + '">' + esc(t) + '</span>'; }
  function pips(n) { var h = ''; for (var k = 0; k < 3; k++) h += '<i' + (k < n ? ' class="on"' : '') + '></i>'; return h; }
  var AICON = { refuerzo: '⚔️', escudo: '🛡️', zancadilla: '🦵', cafe: '☕' };
  function cardHtml(c, o) {
    o = o || {};
    var troop = c.type === 'tropa', c1, c2;
    if (troop) { c1 = D.themes[c.themes[0]].color; c2 = c.themes[1] ? D.themes[c.themes[1]].color : hexMix(c1, '#0b0716', .62); }
    else { c1 = '#2dd4bf'; c2 = '#0f3f3a'; }
    var tag = o.tag || 'div';
    var h = '<' + tag + ' class="card r-' + c.rarity + (troop ? '' : ' accion') + (o.cls ? ' ' + o.cls : '') + '" style="--c1:' + c1 + ';--c2:' + c2 + '"' + (o.attrs ? ' ' + o.attrs : '') + '>';
    h += '<span class="coin" title="Coste en oro para comprarla">' + c.cost + '</span>';
    if (o.size) h += '<span class="pips" title="Espacio que ocupa en el mazo: ' + c.size + '">' + pips(c.size) + '</span>';
    h += '<div class="nm">' + esc(c.name) + '</div>';
    if (troop) {
      var a = o.atk != null ? o.atk : c.atk, hp = o.hp != null ? o.hp : c.hp, mx = o.max != null ? o.max : hp;
      h += '<div class="mono">' + esc(c.person.charAt(0)) + '</div><div class="tags">' + c.themes.map(tagHtml).join('') + '</div>';
      h += '<span class="sc a' + (a > c.atk ? ' up' : '') + '" title="Ataque"><b>' + a + '</b></span><span class="sc h' + (mx > c.hp ? ' up' : '') + '" title="Vida"><b>' + hp + '</b>' + (mx !== hp ? '<s>/' + mx + '</s>' : '') + '</span>';
    } else {
      h += '<div class="mono ico">' + (AICON[c.id] || '✨') + '</div><div class="adesc">' + esc(c.text) + '</div>';
    }
    if (o.extra) h += o.extra;
    return h + '</' + tag + '>';
  }

  // ---------- Navegación ----------
  var NAV = [['home', '🏠 Inicio'], ['play', '⚔ Jugar'], ['deck', '🃏 Mazo'], ['themes', '✨ Temáticas'], ['rules', '📖 Normas']];
  function navHtml(cur) {
    return '<nav class="nav">' + NAV.map(function (n) { return '<button class="navb' + (n[0] === cur ? ' on' : '') + '" data-act="nav" data-to="' + n[0] + '">' + n[1] + '</button>'; }).join('') +
      '<span class="navsp"></span><a class="navb" href="/">← Hub</a><button class="navb" data-act="lock">🔒 Bloquear</button></nav>';
  }
  function head(cur, title) { return '<div class="wrap">' + navHtml(cur) + (title ? '<h1 class="ptitle">' + title + '</h1>' : ''); }
  function deckSize() { return E.deckSize(ui.deck); }
  function deckError() {
    var troops = ui.deck.filter(function (id) { return CARD[id].type === 'tropa'; });
    if (!troops.length) return 'El mazo necesita al menos una tropa.';
    if (!troops.some(function (id) { return CARD[id].rarity === 'Común'; })) return 'Necesitas al menos una tropa Común: la tienda inicial solo ofrece Comunes.';
    return '';
  }

  function renderHome() {
    var n = Object.keys(D.themes).length;
    var h = head('home') + '<div class="hero"><img src="/cartas/logo.svg" alt="" class="hero-logo"><h1>Juego de Cartas</h1><p class="mut">Mazos con temáticas combinables, combates por rondas y memes de la pandilla.</p></div>';
    h += '<div class="menu">' + [
      ['play', '⚔', 'Jugar', 'Duelo 1 contra 1 contra la IA con tu mazo.'],
      ['deck', '🃏', 'Mazo', 'Elige tus cartas (' + deckSize() + '/' + CFG.deckBudget + ') y guarda hasta 3 mazos.'],
      ['themes', '✨', 'Temáticas', n + ' temáticas con sus niveles y cartas.'],
      ['rules', '📖', 'Normas', 'Cómo funcionan las rondas, la tienda y el combate.'],
    ].map(function (m) { return '<button class="menu-i" data-act="nav" data-to="' + m[0] + '"><span class="mi">' + m[1] + '</span><b>' + m[2] + '</b><span class="mut">' + m[3] + '</span></button>'; }).join('') + '</div>';
    h += '<p class="mut" style="text-align:center">' + D.cards.length + ' tropas · ' + D.actions.length + ' acciones · versión prototipo (sobres y monedas, próximamente)</p></div>';
    app.innerHTML = h;
  }

  function renderRules() {
    var sec = function (t, items) { return '<div class="panel"><h2>' + t + '</h2><ul class="rules">' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div>'; };
    app.innerHTML = head('rules', '📖 Normas') +
      sec('Objetivo', ['Es un 1 contra 1. Empiezas con <b>12 de vida</b>; gana quien deje la vida del rival a 0.']) +
      sec('Tu mazo', ['El mazo tiene un <b>presupuesto de espacio de ' + CFG.deckBudget + '</b>: las tropas baratas ocupan 1, las medias 2 y las de coste 5 ocupan 3; las acciones ocupan 1. Lo ves en los cuadraditos de la esquina de cada carta.', 'No hay cartas duplicadas en el mazo, pero una misma carta puede salir varias veces en la tienda.', 'Necesitas al menos una tropa <b>Común</b>.']) +
      sec('Cartas', ['El <b>círculo dorado</b> es lo que cuesta comprarla en oro.', 'El <b>círculo naranja</b> es el ataque y el <b>verde</b> la vida.', 'El color de la carta mezcla los de sus temáticas y el borde indica la rareza (gris Común, azul Rara, morado Épica, dorado Legendaria).']) +
      sec('Primera ronda', ['La partida empieza con una <b>tienda</b>: ambos jugadores tienen <b>6 de oro</b> y solo salen tropas Comunes de tu mazo. Compra, coloca y pulsa «Terminar tienda».']) +
      sec('Una ronda de combate', ['Cada ronda ganas <b>2 de oro</b> (se reinicia cada partida y es distinto de las monedas de los sobres).', 'Tienes <b>4 huecos en mesa</b> y una <b>mano de 5</b>.', 'En la preparación colocas tropas, juegas acciones y <b>debes elegir objetivo para cada una de tus tropas</b>: no se puede combatir hasta que todas tengan uno. El rival no ve tus objetivos.']) +
      sec('Tienda', ['Hay tienda <b>cada 3 rondas</b> (rondas 1, 4, 7…). En una ronda de tienda <b>no hay combate</b>.', 'La tienda ofrece 4 cartas al azar de tu propio mazo. Renovar cuesta 1 de oro.', '<b>Solo en las rondas de tienda</b> puedes retirar tropas de la mesa; el resto del tiempo puedes colocar si hay hueco, pero no quitar.', 'Las tropas de coste 5 aparecen a partir de la segunda tienda.']) +
      sec('Combate', ['Los ataques se resuelven de uno en uno, alternando bandos de izquierda a derecha. Cada tropa ataca <b>una vez por ronda</b>. El bando que empieza se alterna cada ronda.', 'Si el objetivo ya murió, el ataque va a una tropa rival viva al azar.', 'No se puede atacar al jugador directamente: <b>recibes daño solo si todas tus tropas han muerto</b> y a tu rival le quedan tropas por atacar; el daño es igual a su ataque.', 'Al final de la ronda las tropas recuperan toda su vida máxima; las muertas liberan su hueco.', 'Si en una ronda sin tienda no tienes tropas ni en mesa ni en mano, <b>pierdes automáticamente</b>.']) +
      sec('Temáticas', ['Cada tropa tiene 1 o 2 temáticas. Cuentan las <b>cartas distintas</b> de cada temática entre mesa y mano (las copias no suman; las acciones no tienen temática).', 'Al llegar a ciertos números (niveles) la temática da su bonificación. En la partida ves a un lado cuántas llevas y cuántas necesitas.']) +
      sec('Todavía por llegar', ['Pasivas en las tropas de coste 5, más acciones, sobres y monedas, y partidas contra otros jugadores.']) + '</div>';
  }

  function themeCards(t) { return D.cards.filter(function (c) { return c.themes.indexOf(t) >= 0; }); }
  function renderThemes() {
    var h = head('themes', '✨ Temáticas') + '<p class="mut">Pulsa «Ver en el mazo» para filtrar las cartas de esa temática.</p>';
    Object.keys(D.themes).forEach(function (t) {
      var T = D.themes[t], cs = themeCards(t);
      h += '<div class="panel"><h2>' + tagHtml(t) + ' <span class="mut" style="letter-spacing:0;text-transform:none">· ' + cs.length + ' cartas</span></h2>' +
        T.tx.map(function (x, k) { return '<p class="lv"><b>Nivel ' + (k + 1) + ' · ' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') +
        '<div class="chips">' + cs.map(function (c) { return '<span class="chip r-' + c.rarity + '">' + esc(c.name) + '</span>'; }).join('') + '</div>' +
        '<button class="btn sec" data-act="filterset" data-t="' + esc(t) + '">Ver en el mazo →</button></div>';
    });
    app.innerHTML = h + '</div>';
  }

  // ---------- Mazo ----------
  function sameDeck(a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) >= 0; }); }
  function slotsHtml() {
    var h = '<div class="slots">';
    for (var i = 0; i < 3; i++) {
      var sl = ui.slots[i], cur = sl && sameDeck(sl.ids, ui.deck);
      h += '<div class="sl' + (sl ? '' : ' empty') + (cur ? ' cur' : '') + '">';
      if (sl) h += '<b>' + esc(sl.name) + (cur ? ' ✓' : '') + '</b><span class="mut">' + E.deckSize(sl.ids) + '/' + CFG.deckBudget + ' espacio · ' + sl.ids.length + ' cartas</span><div class="bar" style="margin:.3rem 0 0"><button class="btn sec sm" data-act="slot-load" data-i="' + i + '">Cargar</button><button class="btn sec sm" data-act="slot-del" data-i="' + i + '" title="Borrar">🗑</button></div>';
      else h += '<b>Hueco ' + (i + 1) + '</b><span class="mut">Vacío</span>';
      h += '</div>';
    }
    h += '</div><div class="bar"><input id="slot-name" maxlength="20" placeholder="Nombre del mazo" value="' + esc(ui.slotName) + '"><select id="slot-to">' +
      [0, 1, 2].map(function (i) { return '<option value="' + i + '"' + (ui.slotTo === i ? ' selected' : '') + '>Hueco ' + (i + 1) + (ui.slots[i] ? ' (' + esc(ui.slots[i].name) + ')' : ' (vacío)') + '</option>'; }).join('') +
      '</select><button class="btn sec" data-act="slot-save"' + (ui.deck.length ? '' : ' disabled') + '>💾 Guardar mazo actual</button></div>';
    if (ui.msg) h += '<div class="hint">' + esc(ui.msg) + '</div>';
    return h;
  }
  function themeSide() {
    var inDeck = {};
    ui.deck.forEach(function (id) { var c = CARD[id]; (c.themes || []).forEach(function (t) { inDeck[t] = (inDeck[t] || 0) + 1; }); });
    return '<aside class="side-themes panel"><h2>Temáticas</h2><p class="mut" style="margin:0 0 .4rem">Pasa el cursor para ver el detalle. Pulsa para añadirla o quitarla del filtro.</p>' +
      Object.keys(D.themes).map(function (t) {
        var T = D.themes[t], on = ui.filters.indexOf(t) >= 0;
        var tip = '<div class="tip"><b>' + esc(t) + '</b>' + T.tx.map(function (x, k) { return '<p><b>' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') + '</div>';
        var short = T.tx[0].split(/[.:]/)[0];
        return '<div class="thm' + (on ? ' on' : '') + '" tabindex="0" data-act="filter" data-t="' + esc(t) + '">' + tagHtml(t) + ' <span class="cnt">' + (inDeck[t] || 0) + ' en mazo · niveles ' + T.th.join('/') + '</span><div class="sm">' + esc(short.length > 70 ? short.slice(0, 68) + '…' : short) + '</div>' + tip + '</div>';
      }).join('') + '</aside>';
  }
  function deckCard(c) {
    var inn = ui.deck.indexOf(c.id) >= 0;
    return cardHtml(c, { size: true, cls: inn ? 'in' : '', attrs: 'data-act="toggle" data-id="' + c.id + '"', tag: 'button' });
  }
  function filtered() {
    var f = ui.filters, all = D.cards.concat(D.actions);
    if (!f.length) return all;
    var th = f.filter(function (x) { return x !== '__act'; }), act = f.indexOf('__act') >= 0;
    return all.filter(function (c) {
      if (c.type === 'accion') return act && (ui.fmode === 'any' || !th.length);
      if (ui.fmode === 'all') return th.every(function (t) { return c.themes.indexOf(t) >= 0; });
      return th.some(function (t) { return c.themes.indexOf(t) >= 0; });
    });
  }
  function renderDeck() {
    var used = deckSize(), troops = ui.deck.filter(function (id) { return CARD[id].type === 'tropa'; }).length, err = deckError();
    var segs = ''; for (var k = 0; k < CFG.deckBudget; k++) segs += '<i' + (k < used ? ' class="on"' : '') + '></i>';
    var h = head('deck', '🃏 Tu mazo') + '<div class="panel"><h2>Mazos guardados (máx. 3)</h2>' + slotsHtml() + '</div>';
    h += '<div class="panel"><div class="bar" style="margin:0"><span class="pill">Espacio <b>' + used + '/' + CFG.deckBudget + '</b></span><span class="pill">' + troops + ' tropas</span>' +
      '<button class="btn sec" data-act="randdeck">🎲 Aleatorio</button><button class="btn sec" data-act="cleardeck">Vaciar</button>' +
      '<button class="btn" data-act="nav" data-to="play"' + (err ? ' disabled' : '') + '>⚔ Jugar</button></div><div class="meter">' + segs + '</div>' +
      (err ? '<div class="hint" style="color:var(--bad)">' + esc(err) + '</div>' : '') +
      '<p class="legend"><span class="coin inl">3</span> coste en oro para comprarla · <span class="pips inl"><i class="on"></i><i class="on"></i><i></i></span> espacio que ocupa en el mazo · <span class="sc a inl"><b>4</b></span> ataque · <span class="sc h inl"><b>6</b></span> vida</p></div>';
    h += '<div class="deck-layout"><div class="deck-main">';
    var cnt = function (t) { return themeCards(t).length; };
    h += '<div class="chips filt"><button class="chip' + (!ui.filters.length ? ' on' : '') + '" data-act="filterset" data-t="">Todas</button>' +
      Object.keys(D.themes).map(function (t) { return '<button class="chip' + (ui.filters.indexOf(t) >= 0 ? ' on' : '') + '" style="--tc:' + D.themes[t].color + '" data-act="filter" data-t="' + esc(t) + '">' + esc(t) + ' ' + cnt(t) + '</button>'; }).join('') +
      '<button class="chip' + (ui.filters.indexOf('__act') >= 0 ? ' on' : '') + '" data-act="filter" data-t="__act">Acciones</button></div>';
    h += '<div class="bar" style="margin:.2rem 0 .6rem"><label class="grp"><input type="checkbox" data-act="group"' + (ui.group ? ' checked' : '') + '> Agrupar por temática</label>';
    if (ui.filters.length > 1) h += '<span class="seg"><button class="' + (ui.fmode === 'any' ? 'on' : '') + '" data-act="fmode" data-m="any">Cualquiera de las elegidas</button><button class="' + (ui.fmode === 'all' ? 'on' : '') + '" data-act="fmode" data-m="all">Todas a la vez</button></span>';
    h += '</div>';
    if (ui.group && !ui.filters.length) {
      Object.keys(D.themes).forEach(function (t) { h += '<h3 class="gh">' + tagHtml(t) + '</h3><div class="deckgrid">' + themeCards(t).map(deckCard).join('') + '</div>'; });
      h += '<h3 class="gh">Acciones</h3><div class="deckgrid">' + D.actions.map(deckCard).join('') + '</div>';
    } else {
      var list = filtered();
      h += list.length ? '<div class="deckgrid">' + list.map(deckCard).join('') + '</div>' : '<p class="mut">Ninguna carta cumple todas las temáticas elegidas.</p>';
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
  function orb(kind, val, max, label) {
    var p = max ? Math.max(0, Math.min(100, val / max * 100)) : 100;
    return '<div class="orb ' + kind + '" style="--p:' + p + '%" title="' + label + '"><b>' + Math.max(0, val) + '</b><span>' + label + '</span></div>';
  }
  function synergyHtml(P) {
    var c = E.themeCounts(P), keys = Object.keys(c).sort(function (a, b) { return E.tierOf(b, c[b]) - E.tierOf(a, c[a]) || c[b] - c[a]; });
    var h = '<aside class="synside panel"><h2>Sinergias</h2>';
    if (!keys.length) return h + '<p class="mut">Coloca tropas en mesa o mano.</p></aside>';
    h += '<div class="synlist">' + keys.map(function (t) {
      var T = D.themes[t], tier = E.tierOf(t, c[t]), nxt = T.th[tier];
      var tip = '<div class="tip"><b>' + esc(t) + '</b>' + T.tx.map(function (x, k) { return '<p' + (k + 1 === tier ? ' class="cur"' : '') + '><b>' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') + '</div>';
      return '<div class="syn-row t' + tier + '" style="--tc:' + T.color + '" tabindex="0"><div class="hexa"><b>' + c[t] + '</b></div><div class="si"><b>' + esc(t) + '</b><div class="th">' +
        T.th.map(function (n, k) { return '<i class="' + (k < tier ? 'on' : '') + '">' + n + '</i>'; }).join('') + '</div></div><span class="need">' + (nxt ? c[t] + '/' + nxt : '✓ máx') + '</span>' + tip + '</div>';
    }).join('') + '</div></aside>';
    return h;
  }
  function mesaRow(side, view, s, mine) {
    var P = s.p[side], prep = s.phase === 'prep' && !ui.playing && !s.shopOpen, shop = s.shopOpen && !ui.playing, sel = ui.sel;
    var aim = {}; Object.keys(s.p[0].target).forEach(function (k) { var t = s.p[0].target[k]; aim[t] = (aim[t] || 0) + 1; });
    var h = '<div class="row4">';
    view.mesa[side].forEach(function (v, k) {
      if (!v) {
        var free = mine && s.phase === 'prep' && !ui.playing && sel && sel.k === 'hand' && E.isTroop(P.hand[sel.i]);
        h += '<div class="cw"><div class="slot' + (free ? ' free' : '') + '"' + (free ? ' data-act="slot" data-i="' + k + '"' : '') + '>' + (free ? 'Colocar aquí' : 'Hueco') + '</div></div>';
        return;
      }
      var c = CARD[v.id], o = { atk: v.atk, hp: v.hp, max: v.max, cls: '' }, I = inst(P, v.uid), under = '';
      if (v.dead) o.cls += ' dead';
      if (ui.hl && ui.hl.att === v.uid) o.cls += ' atk';
      if (ui.hl && ui.hl.tgt === v.uid) o.cls += ' hit';
      o.attrs = 'data-cuid="' + v.uid + '" data-side="' + side + '"';
      if (mine) {
        var P0 = s.p[0], pending = prep && E.pendingTargets(s).some(function (x) { return x.uid === v.uid; });
        if (sel && sel.k === 'mine' && sel.uid === v.uid) o.cls += ' sel';
        if (pending) o.cls += ' notgt';
        o.attrs += ' data-act="mine"';
        if (sel && sel.k === 'act' && CARD[P0.hand[sel.i].id].target === 'ally') o.cls += ' tgtable';
        if (s.phase === 'prep' && !ui.playing && I && E.has(I, 'Voley') && !s.shopOpen) {
          var m = P0.voley[v.uid] || 'atk';
          under += '<div class="mini"><button data-act="voley" data-uid="' + v.uid + '" data-m="atk" class="' + (m === 'atk' ? 'on' : '') + '">⚔ Ataque</button><button data-act="voley" data-uid="' + v.uid + '" data-m="def" class="' + (m === 'def' ? 'on' : '') + '">🛡 Defensa</button></div>';
        }
        if (shop && I && !E.has(I, 'Lol')) under += '<div class="mini"><button data-act="retire" data-slot="' + k + '">↩ Retirar</button></div>';
      } else {
        o.attrs += ' data-act="foe"';
        if (prep && sel && (sel.k === 'mine' || (sel.k === 'act' && CARD[s.p[0].hand[sel.i].id].target === 'enemy'))) o.cls += ' tgtable';
        if (prep && aim[v.uid]) o.extra = '<span class="aim">🎯×' + aim[v.uid] + '</span>';
      }
      h += '<div class="cw">' + cardHtml(c, o) + under + '</div>';
    });
    return h + '</div>';
  }
  function renderGame() {
    var s = ui.s, view = ui.view || E.viewOf(s), P = s.p[0], R = s.p[1];
    var shop = s.shopOpen && !ui.playing && s.phase === 'prep', prep = s.phase === 'prep' && !ui.playing && !s.shopOpen;
    var pend = prep ? E.pendingTargets(s).length : 0;
    var h = '<div class="wrap"><div class="top"><div><h1>Ronda ' + s.round + ' · ' + (s.shopOpen ? '🛒 Tienda' + (s.round === 1 ? ' inicial' : '') : '⚔ Combate') + (!s.shopOpen ? ' <span class="mut">· ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') + '</span>' : '') + '</h1></div><div><button class="lnk" data-act="menu" data-to="deck">🃏 Mazo</button> · <button class="lnk" data-act="menu" data-to="home">🏠 Menú</button></div></div>';
    h += '<div class="game-grid"><div class="board" id="board">';
    if (!s.shopOpen) h += '<div class="hud top">' + orb('life', view.life[1], CFG.life, 'Rival') + '</div>' + mesaRow(1, view, s, false);
    else if (s.phase === 'prep') h += '<div class="shopbanner">🛒 Ronda de tienda: no hay combate. Compra cartas, colócalas en la mesa y pulsa «Terminar tienda».</div>';
    h += '<div class="gap"></div>' + mesaRow(0, view, s, true);
    h += '<div class="hud bottom">' + orb('life', view.life[0], CFG.life, 'Tu vida') + orb('gold', P.gold, 0, 'Tu oro') + '</div></div>' + synergyHtml(P) + '</div>';

    if (s.phase === 'over') {
      var win = s.winner === 0;
      h += '<div class="panel over"><h2>' + (win ? '🏆 ¡Has ganado!' : '💀 Has perdido') + '</h2><p class="mut">' + esc(s.reason) + ' · ronda ' + s.round + '</p><button class="btn big" data-act="play">Jugar otra vez</button> <button class="btn sec" data-act="menu" data-to="deck">Cambiar mazo</button> <button class="btn sec" data-act="menu" data-to="home">Menú</button></div>';
    } else if (ui.playing) {
      h += '<div class="bar"><button class="btn sec" data-act="skip">⏩ Saltar animación</button></div>';
    } else if (shop) {
      var any = P.mesa.some(Boolean) || P.hand.length;
      h += '<div class="hint">' + esc(ui.hint || (any ? '' : 'Compra al menos una tropa.')) + '</div><div class="bar"><button class="btn big" data-act="endshop"' + (any ? '' : ' disabled') + '>Terminar tienda ▶</button></div>';
    } else if (prep) {
      var msg = ui.hint || (!P.mesa.some(Boolean) ? 'Coloca tropas de tu mano en la mesa.' : pend ? 'Elige una tropa tuya y luego la rival a la que atacará.' : 'Todos los objetivos elegidos.');
      if (pend && P.mesa.some(Boolean)) msg = (ui.hint ? ui.hint + ' · ' : '') + 'Faltan ' + pend + ' tropa(s) por elegir objetivo (contorno rojo).';
      h += '<div class="hint">' + esc(msg) + '</div><div class="bar"><button class="btn big" data-act="fight"' + (pend || (!P.mesa.some(Boolean) && E.mesaTroops(R).length) ? ' disabled' : '') + '>⚔ ¡Combatir!</button></div>';
    } else if (s.phase === 'post') {
      if (P.anime > 0) {
        var an = P.mesa.filter(function (i) { return i && !i.dead && E.has(i, 'Anime'); });
        var opts = an.map(function (i) { return '<option value="' + i.uid + '">' + esc(CARD[i.id].name) + ' (' + E.atk(i) + '/' + E.maxHp(i) + ')</option>'; }).join('');
        h += '<div class="panel"><h2>Anime · puedes ceder estadísticas (' + P.anime + ' uso/s)</h2><div class="bar"><select id="an-from">' + opts + '</select> → <select id="an-to">' + opts + '</select>' +
          '<button class="btn sec" data-act="cede" data-stat="atk">Ceder todo el ataque</button><button class="btn sec" data-act="cede" data-stat="hp">Ceder vida (cae)</button></div></div>';
      }
      h += '<div class="bar"><button class="btn big" data-act="next">Siguiente ronda →</button></div>';
    }

    // Tienda (antes de la mano)
    if (shop) {
      var t = E.tiers(P), rc = E.refreshCost(s, 0);
      h += '<div class="panel"><h2>🛒 Tienda · cartas de tu mazo' + (s.round === 1 ? ' (solo Comunes)' : '') + '</h2><div class="shop">';
      P.offers.forEach(function (id, k) {
        var c = CARD[id];
        h += '<div class="offer">' + cardHtml(c, {}) + '<button class="btn sec" data-act="buy" data-i="' + k + '"' + (P.gold < c.cost || P.hand.length >= CFG.handMax ? ' disabled' : '') + '>Comprar · ' + c.cost + ' oro</button></div>';
      });
      h += '</div><div class="bar"><button class="btn sec" data-act="refresh"' + (P.gold < rc ? ' disabled' : '') + '>🔄 Renovar · ' + rc + ' oro</button>';
      if ((t['Informático'] || 0) >= 3 && !P.pickUsed) {
        h += '<select id="pick-sel">' + P.deck.map(function (id) { return '<option value="' + id + '">' + esc(CARD[id].name) + '</option>'; }).join('') + '</select><button class="btn sec" data-act="pick">Añadir a la tienda</button>';
      }
      h += '</div><p class="mut">Solo en las rondas de tienda puedes retirar tropas de la mesa (↩). Las de coste 5 aparecen desde la segunda tienda.</p></div>';
    }

    // Mano
    h += '<div class="panel"><h2>Tu mano (' + P.hand.length + '/' + CFG.handMax + ')</h2><div class="hand">';
    P.hand.forEach(function (i, k) {
      var c = CARD[i.id], sel = ui.sel && (ui.sel.k === 'hand' || ui.sel.k === 'act') && ui.sel.i === k;
      h += '<div class="cw">' + cardHtml(c, { cls: sel ? 'sel' : '', attrs: 'data-act="hand" data-i="' + k + '"', tag: 'button' }) + '</div>';
    });
    for (var f = P.hand.length; f < CFG.handMax; f++) h += '<div class="cw"><div class="slot">—</div></div>';
    h += '</div></div>';

    var shown = s.log.slice(-14);
    h += '<div class="panel"><h2>Registro</h2><div class="log" id="log">' + shown.map(function (l, n) { return '<div' + (n === shown.length - 1 ? ' class="cur"' : '') + '>' + esc(l.text) + '</div>'; }).join('') + '</div></div></div>';
    app.innerHTML = h;
    var lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight;
    drawArrows();
  }

  // Flechas de objetivo (plan en la preparación, golpe actual durante el combate)
  function drawArrows() {
    var b = document.getElementById('board'); if (!b || !ui.s) return;
    var s = ui.s, pairs = [];
    if (ui.playing && ui.hl && ui.hl.att && ui.hl.tgt) pairs.push([ui.hl.att, ui.hl.tgt, 'hit']);
    else if (s.phase === 'prep' && !s.shopOpen && !ui.playing) Object.keys(s.p[0].target).forEach(function (k) { pairs.push([+k, s.p[0].target[k], 'plan']); });
    if (!pairs.length) return;
    var br = b.getBoundingClientRect(), ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'arrows'); svg.setAttribute('width', br.width); svg.setAttribute('height', br.height);
    svg.innerHTML = '<defs><marker id="ah" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#ff5a5f"/></marker></defs>';
    pairs.forEach(function (p, n) {
      var a = b.querySelector('[data-cuid="' + p[0] + '"]'), t = b.querySelector('[data-cuid="' + p[1] + '"]'); if (!a || !t) return;
      var ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect(), mine = a.dataset.side === '0', off = (n % 3 - 1) * 5;
      var x1 = ra.left + ra.width / 2 - br.left + off, y1 = (mine ? ra.top : ra.bottom) - br.top, x2 = rt.left + rt.width / 2 - br.left + off, y2 = (mine ? rt.bottom : rt.top) - br.top + (mine ? 5 : -5);
      var l = document.createElementNS(ns, 'line');
      l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2);
      l.setAttribute('class', 'ln ' + p[2]); l.setAttribute('marker-end', 'url(#ah)'); svg.appendChild(l);
    });
    b.appendChild(svg);
  }
  window.addEventListener('resize', function () { var o = document.querySelector('#board svg.arrows'); if (o) o.remove(); drawArrows(); });

  function render() {
    var f = { home: renderHome, deck: renderDeck, rules: renderRules, themes: renderThemes }[ui.screen];
    if (f) f(); else renderGame();
  }

  // ---------- Animación del combate ----------
  var timer = null;
  function play() {
    ui.frames = ui.s.frames.slice(); ui.shown = 0; ui.playing = true; ui.sel = null;
    clearInterval(timer); step(); timer = setInterval(step, 750);
  }
  function step() {
    if (ui.shown >= ui.frames.length) { stopPlay(); return; }
    var f = ui.frames[ui.shown++];
    ui.view = f.view; ui.hl = f.hl; render();
    var lg = document.getElementById('log');
    if (lg) lg.innerHTML = '<div class="cur">' + esc(f.text) + '</div>' + ui.frames.slice(0, ui.shown - 1).reverse().slice(0, 7).map(function (x) { return '<div>' + esc(x.text) + '</div>'; }).join('');
  }
  function stopPlay() { clearInterval(timer); timer = null; ui.playing = false; ui.view = null; ui.hl = null; render(); }

  // ---------- Eventos ----------
  app.addEventListener('input', function (e) { if (e.target.id === 'slot-name') ui.slotName = e.target.value; });
  app.addEventListener('change', function (e) { if (e.target.id === 'slot-to') ui.slotTo = +e.target.value; });
  function nextPending(s) {
    var p = E.pendingTargets(s)[0];
    ui.sel = p ? { k: 'mine', uid: p.uid } : null;
  }
  app.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, s = ui.s, P = s && s.p[0];
    if (act === 'lock') return window.cartasLock();
    if (act === 'nav') {
      clearInterval(timer); ui.playing = false;
      if (el.dataset.to === 'play') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); return startGame(); }
      ui.screen = el.dataset.to; ui.msg = ''; window.scrollTo(0, 0); return render();
    }
    if (act === 'filter') { var t = el.dataset.t, k0 = ui.filters.indexOf(t); if (k0 >= 0) ui.filters.splice(k0, 1); else ui.filters.push(t); ui.screen = 'deck'; var y0 = window.scrollY; renderDeck(); window.scrollTo(0, y0); return; }
    if (act === 'filterset') { ui.filters = el.dataset.t ? [el.dataset.t] : []; ui.screen = 'deck'; window.scrollTo(0, 0); return render(); }
    if (act === 'fmode') { ui.fmode = el.dataset.m; return renderDeck(); }
    if (act === 'group') { ui.group = el.checked; return render(); }
    if (act === 'toggle') {
      var id = el.dataset.id, k = ui.deck.indexOf(id);
      if (k >= 0) ui.deck.splice(k, 1);
      else if (deckSize() + CARD[id].size <= CFG.deckBudget) ui.deck.push(id);
      else ui.msg = 'No cabe: el mazo ya está lleno de espacio.';
      saveDeck(); var y = window.scrollY; renderDeck(); window.scrollTo(0, y); return;
    }
    if (act === 'randdeck') { ui.deck = E.randomDeck(Math.random); saveDeck(); ui.msg = ''; return renderDeck(); }
    if (act === 'cleardeck') { ui.deck = []; saveDeck(); ui.msg = ''; return renderDeck(); }
    if (act === 'slot-save') {
      if (!ui.deck.length) return;
      var nm = (ui.slotName || '').trim() || 'Mazo ' + (ui.slotTo + 1);
      ui.slots[ui.slotTo] = { name: nm, ids: ui.deck.slice() }; saveSlots(); ui.msg = '«' + nm + '» guardado en el hueco ' + (ui.slotTo + 1) + '.'; ui.slotName = ''; return renderDeck();
    }
    if (act === 'slot-load') { var sl = ui.slots[+el.dataset.i]; if (sl) { ui.deck = sl.ids.slice(); saveDeck(); ui.slotTo = +el.dataset.i; ui.msg = 'Cargado «' + sl.name + '».'; } return renderDeck(); }
    if (act === 'slot-del') { var di = +el.dataset.i; if (ui.slots[di]) { ui.msg = 'Borrado «' + ui.slots[di].name + '».'; ui.slots[di] = null; saveSlots(); } return renderDeck(); }
    if (act === 'menu') { clearInterval(timer); ui.playing = false; ui.screen = el.dataset.to || 'home'; return render(); }
    if (act === 'play') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); return startGame(); }
    if (act === 'skip') { clearInterval(timer); ui.shown = ui.frames.length; return stopPlay(); }
    if (!s || ui.playing) return;

    if (act === 'fight') { if (E.fight(s) === false) return; ui.sel = null; ui.hint = ''; return play(); }
    if (act === 'endshop') { E.endShop(s); ui.sel = null; ui.hint = ''; render(); return nextPending(s), render(); }
    if (act === 'next') { E.nextRound(s); ui.sel = null; ui.hint = ''; if (!s.shopOpen && !s.over) nextPending(s); return render(); }
    if (act === 'cede') {
      var ok = E.cede(s, +document.getElementById('an-from').value, +document.getElementById('an-to').value, el.dataset.stat);
      ui.hint = ok ? '' : 'Elige dos tropas Anime distintas.'; return render();
    }
    if (act === 'buy') { if (!E.buy(s, 0, +el.dataset.i)) ui.hint = 'No puedes comprarla (oro o mano llena).'; else ui.hint = ''; return render(); }
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
      } else if (s.shopOpen) { ui.hint = 'Las acciones se juegan en las rondas de combate.'; ui.sel = null; }
      else if (c.target === 'none') { E.playAction(s, 0, i, null); ui.sel = null; ui.hint = ''; }
      else { ui.sel = { k: 'act', i: i }; ui.hint = c.target === 'ally' ? 'Elige una tropa tuya en la mesa.' : 'Elige una tropa rival.'; }
      return render();
    }
    if (act === 'slot') {
      if (ui.sel && ui.sel.k === 'hand') E.place(s, 0, ui.sel.i, +el.dataset.i);
      ui.sel = null; ui.hint = '';
      if (!s.shopOpen) nextPending(s);
      return render();
    }
    if (act === 'mine') {
      var uid = +el.dataset.cuid;
      if (ui.sel && ui.sel.k === 'act') { if (E.playAction(s, 0, ui.sel.i, uid)) { ui.sel = null; ui.hint = ''; } else ui.hint = 'Esa acción no va sobre una tropa tuya.'; return render(); }
      if (s.shopOpen) return;
      if (ui.sel && ui.sel.k === 'mine' && ui.sel.uid === uid) { ui.sel = null; ui.hint = ''; return render(); }
      ui.sel = { k: 'mine', uid: uid }; ui.hint = 'Ahora pulsa la tropa rival a la que atacará.'; return render();
    }
    if (act === 'foe') {
      var fu = +el.dataset.cuid;
      if (ui.sel && ui.sel.k === 'act') { if (E.playAction(s, 0, ui.sel.i, fu)) { ui.sel = null; ui.hint = ''; } else ui.hint = 'Esa acción no va sobre una tropa rival.'; return render(); }
      if (ui.sel && ui.sel.k === 'mine') { E.setTarget(s, 0, ui.sel.uid, fu); ui.hint = ''; nextPending(s); return render(); }
    }
  });

  render();
})();
