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
      var dA = a - c.atk, dH = mx - c.hp;
      if (dA) h += '<i class="dl a ' + (dA > 0 ? 'pos' : 'neg') + '">' + (dA > 0 ? '+' : '') + dA + '</i>';
      if (dH) h += '<i class="dl h ' + (dH > 0 ? 'pos' : 'neg') + '">' + (dH > 0 ? '+' : '') + dH + '</i>';
      h += '<span class="sc a' + (a > c.atk ? ' up' : '') + '" title="Ataque"><b>' + a + '</b></span><span class="sc h' + (mx > c.hp ? ' up' : '') + (hp < mx ? ' low' : '') + '" title="Vida' + (hp < mx ? ' (' + hp + '/' + mx + ')' : '') + '"><b>' + hp + '</b></span>';
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
      sec('Primera ronda', ['La partida empieza con una <b>tienda</b>: ambos jugadores tienen <b>6 de oro</b> y solo salen tropas Comunes de tu mazo. Pulsa una carta para comprarla, colócala (pulsando o arrastrándola) y termina la tienda.']) +
      sec('Una ronda de combate', ['Cada ronda ganas <b>2 de oro</b> (se reinicia cada partida y es distinto de las monedas de los sobres).', 'Tienes <b>4 huecos en mesa</b> y una <b>mano de 5</b>.', 'En la preparación colocas tropas (pulsando o arrastrando desde la mano), juegas acciones y <b>debes elegir objetivo para cada una de tus tropas</b>: no se puede combatir hasta que todas tengan uno. Puedes deshacerlos todos con el botón «Deshacer objetivos». El rival no ve tus objetivos.']) +
      sec('Tienda', ['Hay tienda <b>cada 3 rondas</b> (rondas 1, 4, 7…). En una ronda de tienda <b>no hay combate</b>.', 'La tienda ofrece 4 cartas al azar de tu propio mazo; pulsa una para comprarla. El botón redondo ↻ la actualiza por 1 de oro.', '<b>Solo en las rondas de tienda</b> puedes retirar tropas de la mesa; el resto del tiempo puedes colocar si hay hueco, pero no quitar.', 'Las tropas de coste 5 aparecen a partir de la segunda tienda.']) +
      sec('Combate', ['Los ataques se resuelven de uno en uno, alternando bandos de izquierda a derecha. Cada tropa ataca <b>una vez por ronda</b>. El bando que empieza se alterna cada ronda.', 'Si el objetivo ya murió, el ataque va a una tropa rival viva al azar.', 'No se puede atacar al jugador directamente: <b>recibes daño solo si todas tus tropas han muerto</b> y a tu rival le quedan tropas por atacar; el daño es igual a su ataque.', '<b>Las tropas no se curan entre rondas</b>: el daño se acumula. Solo se curan del todo al volver a tu mano (retirándolas en la tienda). Las muertas liberan su hueco y los bonus de «esta ronda» desaparecen.', 'Si en una ronda sin tienda no tienes tropas ni en mesa ni en mano, <b>pierdes automáticamente</b>.']) +
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
    ui.screen = 'game'; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = ''; ui.landed = null; ui.busy = false;
    announce(); render();
  }
  function orb(kind, val, max, label, idx) {
    var p = max ? Math.max(0, Math.min(100, val / max * 100)) : 100;
    return '<div class="orb ' + kind + '" data-orb="' + (idx == null ? '' : idx) + '" style="--p:' + p + '%" title="' + label + '"><b>' + Math.max(0, val) + '</b><span>' + label + '</span></div>';
  }
  function synergyHtml(P) {
    var c = E.themeCounts(P), keys = Object.keys(c).sort(function (a, b) { return E.tierOf(b, c[b]) - E.tierOf(a, c[a]) || c[b] - c[a]; });
    var h = '<div class="synside panel"><h2>Sinergias</h2>';
    if (!keys.length) return h + '<p class="mut">Coloca tropas en mesa o mano.</p></div>';
    h += '<div class="synlist">' + keys.map(function (t) {
      var T = D.themes[t], tier = E.tierOf(t, c[t]), nxt = T.th[tier];
      var tip = '<div class="tip"><b>' + esc(t) + '</b>' + T.tx.map(function (x, k) { return '<p' + (k + 1 === tier ? ' class="cur"' : '') + '><b>' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') + '</div>';
      return '<div class="syn-row t' + tier + '" style="--tc:' + T.color + '" tabindex="0"><div class="hexa"><b>' + c[t] + '</b></div><div class="si"><b>' + esc(t) + '</b><div class="th">' +
        T.th.map(function (n, k) { return '<i class="' + (k < tier ? 'on' : '') + '">' + n + '</i>'; }).join('') + '</div></div><span class="need">' + (nxt ? c[t] + '/' + nxt : '✓ máx') + '</span>' + tip + '</div>';
    }).join('') + '</div></div>';
    return h;
  }
  function mesaRow(side, view, s, mine) {
    var P = s.p[side], prep = s.phase === 'prep' && !ui.playing && !s.shopOpen, shop = s.shopOpen && !ui.playing, sel = ui.sel;
    var aim = {}; Object.keys(s.p[0].target).forEach(function (k) { var t = s.p[0].target[k]; aim[t] = (aim[t] || 0) + 1; });
    var h = '<div class="row4 side' + side + '">';
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
      if (ui.landed === v.uid) o.cls += ' landed';
      if (ui.hl && ui.hl.fx && ui.hl.fx.uids.indexOf(v.uid) >= 0) o.cls += ui.hl.fx.neg ? ' debuffed' : ' buffed';
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
  var REFRESH_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  function renderGame() {
    var s = ui.s, view = ui.view || E.viewOf(s), P = s.p[0], R = s.p[1];
    var shopMode = s.shopOpen && !ui.playing, shop = shopMode && s.phase === 'prep', prep = s.phase === 'prep' && !ui.playing && !s.shopOpen;
    var pend = prep ? E.pendingTargets(s).length : 0, hasT = Object.keys(P.target).length > 0;
    var h = '<div class="gwrap' + (shopMode ? ' shopmode' : '') + '"><div class="top"><div><h1>Ronda ' + s.round + ' · ' + (s.shopOpen ? '🛒 Tienda' + (s.round === 1 ? ' inicial' : '') : '⚔ Combate') + (!s.shopOpen ? ' <span class="mut">· ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') + '</span>' : '') + '</h1></div><div><button class="lnk" data-act="menu" data-to="deck">🃏 Mazo</button> · <button class="lnk" data-act="menu" data-to="home">🏠 Menú</button></div></div>';
    h += '<div class="gmain"><aside class="gl">' + synergyHtml(P) + '</aside><section class="gc"><div class="board" id="board">';
    if (!shopMode) h += '<div class="hud top">' + orb('life', view.life[1], CFG.life, 'Rival', 1) + '</div>' + mesaRow(1, view, s, false) + '<div class="gap"></div>';
    h += mesaRow(0, view, s, true);
    // HUD inferior: vida, oro y acciones
    var acts = '';
    if (s.phase === 'over') acts = '';
    else if (ui.playing) acts = '<button class="btn sec" data-act="skip">⏩ Saltar animación</button>';
    else if (shop) {
      var any = P.mesa.some(Boolean) || P.hand.length;
      acts = '<div class="hint">' + esc(ui.hint || (any ? 'Pulsa una carta para comprarla. Arrastra una tropa de la mesa a tu mano para retirarla.' : 'Compra al menos una tropa.')) + '</div><button class="btn big" data-act="endshop"' + (any ? '' : ' disabled') + '>Terminar tienda ▶</button>';
    } else if (prep) {
      var msg = ui.hint || (!P.mesa.some(Boolean) ? 'Coloca tropas de tu mano en la mesa.' : pend ? 'Pulsa una tropa tuya y después la rival a la que atacará.' : 'Todos los objetivos elegidos.');
      if (pend && P.mesa.some(Boolean)) msg = (ui.hint ? ui.hint + ' · ' : '') + 'Faltan ' + pend + ' por elegir objetivo.';
      acts = '<div class="hint">' + esc(msg) + '</div><div class="btnrow"><button class="btn big" data-act="fight"' + (pend || (!P.mesa.some(Boolean) && E.mesaTroops(R).length) ? ' disabled' : '') + '>⚔ ¡Combatir!</button><button class="btn sec" data-act="undo"' + (hasT ? '' : ' disabled') + ' title="Quitar todos los objetivos elegidos">↩ Deshacer objetivos</button></div>';
    } else if (s.phase === 'post') acts = ui.busy ? '' : '<div class="hint">Puedes ceder estadísticas Anime antes de seguir.</div><button class="btn big" data-act="next">Continuar ▶</button>';
    h += '<div class="hud bottom">' + orb('life', view.life[0], CFG.life, 'Tu vida', 0) + orb('gold', P.gold, 0, 'Tu oro') + '<div class="acts">' + acts + '</div></div></div>';

    // Mano
    h += '<div class="handwrap' + (ui.dragMesa ? ' dropzone' : '') + '"><div class="hl">Tu mano ' + P.hand.length + '/' + CFG.handMax + '</div><div class="hand">';
    P.hand.forEach(function (i, k) {
      var c = CARD[i.id], sel = ui.sel && (ui.sel.k === 'hand' || ui.sel.k === 'act') && ui.sel.i === k;
      h += '<div class="cw">' + cardHtml(c, { atk: E.atk(i), hp: i.hp, max: E.maxHp(i), cls: 'hcard' + (sel ? ' sel' : ''), attrs: 'data-act="hand" data-i="' + k + '" title="Pulsa o arrastra a la mesa"', tag: 'button' }) + '</div>';
    });
    for (var f = P.hand.length; f < CFG.handMax; f++) h += '<div class="cw"><div class="slot">—</div></div>';
    h += '</div></div>';

    // Tienda (bajo la mano): pulsar una carta para comprarla
    if (shop) {
      var t = E.tiers(P), rc = E.refreshCost(s, 0);
      h += '<div class="shopwrap"><div class="hl">🛒 Tienda' + (s.round === 1 ? ' (solo Comunes)' : '') + ' · pulsa una carta para comprarla</div><div class="shoprow">';
      for (var k = 0; k < CFG.shopOffers; k++) {
        var id = P.offers[k];
        if (!id) { h += '<div class="cw"><div class="slot">Vendida</div></div>'; continue; }
        var c2 = CARD[id], cant = P.gold < c2.cost || P.hand.length >= CFG.handMax;
        h += '<div class="cw">' + cardHtml(c2, { tag: 'button', cls: 'offer' + (cant ? ' cant' : ''), attrs: 'data-act="buy" data-i="' + k + '" title="Comprar por ' + c2.cost + ' de oro"' }) + '</div>';
      }
      h += '<div class="refwrap"><button class="refresh" data-act="refresh" title="Actualizar tienda (' + rc + ' oro)"' + (P.gold < rc ? ' disabled' : '') + '>' + REFRESH_SVG + '</button><span class="rlabel">Actualizar · ' + rc + ' oro</span></div></div>';
      if ((t['Informático'] || 0) >= 3 && !P.pickUsed) {
        h += '<div class="bar"><select id="pick-sel">' + P.deck.map(function (id) { return '<option value="' + id + '">' + esc(CARD[id].name) + '</option>'; }).join('') + '</select><button class="btn sec sm" data-act="pick">Añadir a la tienda</button></div>';
      }
      h += '</div>';
    }
    h += '</section><aside class="gr">';
    if (s.phase === 'post' && !ui.playing && P.anime > 0) {
      var an = P.mesa.filter(function (i) { return i && !i.dead && E.has(i, 'Anime'); });
      var opts = an.map(function (i) { return '<option value="' + i.uid + '">' + esc(CARD[i.id].name) + ' (' + E.atk(i) + '/' + E.maxHp(i) + ')</option>'; }).join('');
      h += '<div class="panel"><h2>Anime · ceder (' + P.anime + ')</h2><div class="bar"><select id="an-from">' + opts + '</select><span>→</span><select id="an-to">' + opts + '</select></div><div class="bar"><button class="btn sec sm" data-act="cede" data-stat="atk">Ceder ataque</button><button class="btn sec sm" data-act="cede" data-stat="hp">Ceder vida</button></div></div>';
    } else h += '<div></div>';
    var shown = s.log.slice(-14);
    h += '<div class="panel logp"><h2>Registro</h2><div class="log" id="log">' + shown.map(function (l, n) { return '<div' + (n === shown.length - 1 ? ' class="cur"' : '') + '>' + esc(l.text) + '</div>'; }).join('') + '</div></div></aside></div>';
    if (s.phase === 'over') {
      var win = s.winner === 0;
      h += '<div class="overlay"><div class="panel over"><h2>' + (win ? '🏆 ¡Has ganado!' : '💀 Has perdido') + '</h2><p class="mut">' + esc(s.reason) + ' · ronda ' + s.round + '</p><button class="btn big" data-act="play">Jugar otra vez</button> <button class="btn sec" data-act="menu" data-to="deck">Cambiar mazo</button> <button class="btn sec" data-act="menu" data-to="home">Menú</button></div></div>';
    }
    h += '</div>';
    app.innerHTML = h;
    document.body.classList.toggle('shopbg', !!shopMode);
    ui.landed = null;
    var lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight;
    strikeVars(); drawArrows(); fxBanner(); applyFloats();
  }

  // Dirección del golpe durante el combate (la carta se levanta y se lanza contra su objetivo)
  function strikeVars() {
    if (!ui.playing || !ui.hl || !ui.hl.att) return;
    var a = document.querySelector('.card.atk'), t = ui.hl.tgt && document.querySelector('[data-cuid="' + ui.hl.tgt + '"]');
    if (!a) return;
    var ra = a.getBoundingClientRect(), rt = t ? t.getBoundingClientRect() : null;
    var dx = rt ? (rt.left + rt.width / 2) - (ra.left + ra.width / 2) : 0;
    var dy = rt ? (rt.top + rt.height / 2) - (ra.top + ra.height / 2) : (a.dataset.side === '0' ? -ra.height : ra.height);
    a.style.setProperty('--dx', (dx * .72) + 'px'); a.style.setProperty('--dy', (dy * .72) + 'px');
  }

    // ---------- Efectos de temática: cartel, bola, números flotantes ----------
  var FXICON = { duo: '👯', novia: '💕', pueblo: '🏘️', nini: '🛋️', voley: '🏐', comeback: '🔥', tilt: '😡', koi: '🏆' };
  function fxBanner() {
    var fx = ui.playing && ui.hl && ui.hl.fx; if (!fx) return;
    var b = document.getElementById('board'), row = b && b.querySelector('.row4.side' + fx.side); if (!row) return;
    var br = b.getBoundingClientRect(), rr = row.getBoundingClientRect(), el = document.createElement('div');
    el.className = 'fxb t-' + fx.type + (fx.neg ? ' neg' : '');
    el.style.top = (rr.top - br.top + rr.height / 2) + 'px'; el.style.left = (rr.left - br.left + rr.width / 2) + 'px';
    var icon = fx.type === 'pokemon' ? '<div class="pball k' + fx.ball + '"></div><div class="pring"></div>' : '<div class="fxi">' + (fx.type === 'novia' && fx.neg ? '😤' : (FXICON[fx.type] || '✨')) + '</div>';
    el.innerHTML = icon + '<div class="fxt">' + esc(fx.title) + '</div><div class="fxs">' + esc(fx.sub) + '</div>';
    b.appendChild(el);
  }
  function diffFloats(prev, f) {
    var out = [];
    function map(v) { var m = {}; v.mesa.forEach(function (row) { row.forEach(function (c) { if (c) m[c.uid] = c; }); }); return m; }
    if (prev) {
      var a = map(prev), b = map(f.view);
      Object.keys(b).forEach(function (u) {
        var x = a[u], y = b[u]; if (!x) return;
        var da = y.atk - x.atk, dm = y.max - x.max, parts = [];
        if (da) parts.push((da > 0 ? '+' : '') + da + '⚔'); if (dm) parts.push((dm > 0 ? '+' : '') + dm + '❤');
        if (parts.length) out.push({ uid: +u, text: parts.join(' '), cls: (da < 0 || dm < 0) && !(da > 0 || dm > 0) ? 'neg' : 'pos' });
      });
    }
    var hl = f.hl;
    if (hl && hl.tgt && hl.dmg > 0) out.push({ uid: hl.tgt, text: '-' + hl.dmg, cls: 'dmg', delay: .34 });
    if (hl && hl.life != null && hl.dmg > 0) out.push({ orb: hl.life, text: '-' + hl.dmg, cls: 'dmg', delay: .3 });
    if (hl && hl.retarget) out.push({ uid: hl.att, text: '¡Su objetivo había caído!', cls: 'info' });
    return out;
  }
  function applyFloats() {
    (ui.floats || []).forEach(function (fl) {
      var el = fl.orb != null ? document.querySelector('[data-orb="' + fl.orb + '"]') : document.querySelector('[data-cuid="' + fl.uid + '"]');
      if (!el) return;
      var sp = document.createElement('span'); sp.className = 'flt ' + fl.cls; sp.textContent = fl.text; if (fl.delay) sp.style.animationDelay = fl.delay + 's';
      el.appendChild(sp);
    });
  }

  // Flechas en parábola (plan en la preparación, golpe actual durante el combate)
  function drawArrows() {
    var b = document.getElementById('board'); if (!b || !ui.s) return;
    var s = ui.s, pairs = [];
    if (s.phase === 'prep' && !s.shopOpen && !ui.playing) Object.keys(s.p[0].target).forEach(function (k) { pairs.push([+k, s.p[0].target[k], 'plan']); });
    if (!pairs.length) return;
    var br = b.getBoundingClientRect(), ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'arrows'); svg.setAttribute('width', br.width); svg.setAttribute('height', br.height);
    svg.innerHTML = '<defs><marker id="ah" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L7,3.5 L0,7 z" fill="#ff5a5f"/></marker></defs>';
    pairs.forEach(function (p, n) {
      var a = b.querySelector('[data-cuid="' + p[0] + '"]'), t = b.querySelector('[data-cuid="' + p[1] + '"]'); if (!a || !t) return;
      var ra = a.getBoundingClientRect(), rt = t.getBoundingClientRect(), mine = a.dataset.side === '0', off = (n % 3 - 1) * 8;
      var x1 = ra.left + ra.width / 2 - br.left + off, y1 = (mine ? ra.top : ra.bottom) - br.top;
      var x2 = rt.left + rt.width / 2 - br.left + off, y2 = rt.top + rt.height * .42 - br.top;
      var d = Math.hypot(x2 - x1, y2 - y1), bulge = 55 + d * .28 + (n % 3) * 10;
      var lat = Math.abs(x2 - x1) < ra.width * .6 ? (x1 < br.width / 2 ? 1 : -1) * ra.width * (.75 + (n % 3) * .12) : 0;
      var cx = (x1 + x2) / 2 + lat, cy = (mine ? Math.min(y1, y2) : Math.max(y1, y2)) + (mine ? -bulge : bulge);
      var l = document.createElementNS(ns, 'path');
      l.setAttribute('d', 'M' + x1 + ',' + y1 + ' Q' + cx + ',' + cy + ' ' + x2 + ',' + y2);
      l.setAttribute('class', 'ln ' + p[2]); l.setAttribute('fill', 'none'); l.setAttribute('marker-end', 'url(#ah)'); svg.appendChild(l);
    });
    b.appendChild(svg);
  }
  window.addEventListener('resize', function () { var o = document.querySelector('#board svg.arrows'); if (o) o.remove(); drawArrows(); });

  function render() {
    document.body.classList.remove('shopbg');
    var f = { home: renderHome, deck: renderDeck, rules: renderRules, themes: renderThemes }[ui.screen];
    if (f) f(); else renderGame();
  }

  // ---------- Animación del combate ----------
  var timer = null;
  function showSplash(o) {
    var el = document.getElementById('splash');
    if (!el) { el = document.createElement('div'); el.id = 'splash'; document.body.appendChild(el); }
    el.className = 'splash k-' + o.kind; el.innerHTML = '<div class="band"><div class="st">' + o.title + '</div><div class="ss">' + (o.sub || '') + '</div></div>';
    void el.offsetWidth; el.classList.add('show');
  }
  function announce() {
    var s = ui.s; if (!s || s.over) return;
    if (s.shopOpen) showSplash({ kind: 'shop', title: '🛒 ¡RONDA DE TIENDA!', sub: s.round === 1 ? 'Compra tus primeras tropas · no hay combate' : 'Compra, coloca y retira tropas · no hay combate' });
    else showSplash({ kind: 'combat', title: '⚔ RONDA ' + s.round, sub: s.first === 0 ? 'Atacas primero' : 'Ataca primero el rival' });
  }
  function play() {
    ui.frames = ui.s.frames.slice(); ui.shown = 0; ui.playing = true; ui.sel = null;
    clearTimeout(timer); ui.floats = []; step();
  }
  function step() {
    if (ui.shown >= ui.frames.length) { stopPlay(); return; }
    var f = ui.frames[ui.shown++], prev = ui.view || (ui.frames[0] && ui.frames[0].view);
    ui.floats = diffFloats(prev, f);
    ui.view = f.view; ui.hl = f.hl; render();
    var fxk = f.hl && f.hl.fx; timer = setTimeout(step, fxk ? (fxk.type === 'pokemon' ? 1700 : 1250) : 780);
    var lg = document.getElementById('log');
    if (lg) lg.innerHTML = '<div class="cur">' + esc(f.text) + '</div>' + ui.frames.slice(0, ui.shown - 1).reverse().slice(0, 7).map(function (x) { return '<div>' + esc(x.text) + '</div>'; }).join('');
  }
  function stopPlay() {
    clearTimeout(timer); timer = null; ui.playing = false; ui.view = null; ui.hl = null; ui.floats = [];
    var s = ui.s;
    if (s.phase === 'post' && !s.over && s.p[0].anime <= 0) {
      ui.busy = true;
      var a = E.mesaTroops(s.p[0]).length, b = E.mesaTroops(s.p[1]).length;
      showSplash({ kind: 'end', title: 'FIN DE LA RONDA ' + s.round, sub: 'Tropas en pie: tú ' + a + ' · rival ' + b });
      render();
      setTimeout(function () {
        ui.busy = false;
        if (ui.s !== s || ui.screen !== 'game') return;
        E.nextRound(s); ui.sel = null; ui.hint = ''; announce(); render();
      }, 1500);
      return;
    }
    render();
  }

  // ---------- Eventos ----------
  app.addEventListener('input', function (e) { if (e.target.id === 'slot-name') ui.slotName = e.target.value; });
  app.addEventListener('change', function (e) { if (e.target.id === 'slot-to') ui.slotTo = +e.target.value; });
  var noClick = 0;
  function nextPending() { ui.sel = null; } // el objetivo siempre se elige a mano
  app.addEventListener('click', function (e) {
    if (Date.now() - noClick < 350 || ui.busy) return;
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, s = ui.s, P = s && s.p[0];
    if (act === 'lock') return window.cartasLock();
    if (act === 'nav') {
      clearTimeout(timer); ui.playing = false;
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
    if (act === 'menu') { clearTimeout(timer); ui.playing = false; ui.screen = el.dataset.to || 'home'; return render(); }
    if (act === 'play') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); return startGame(); }
    if (act === 'skip') { clearTimeout(timer); ui.shown = ui.frames.length; return stopPlay(); }
    if (!s || ui.playing) return;

    if (act === 'fight') { if (E.fight(s) === false) return; ui.sel = null; ui.hint = ''; return play(); }
    if (act === 'endshop') { E.endShop(s); ui.sel = null; ui.hint = ''; announce(); return render(); }
    if (act === 'next') { E.nextRound(s); ui.sel = null; ui.hint = ''; announce(); return render(); }
    if (act === 'cede') {
      var ok = E.cede(s, +document.getElementById('an-from').value, +document.getElementById('an-to').value, el.dataset.stat);
      ui.hint = ok ? '' : 'Elige dos tropas Anime distintas.'; return render();
    }
    if (act === 'buy') { var bi = +el.dataset.i, bc = CARD[P.offers[bi]]; if (!E.buy(s, 0, bi)) ui.hint = bc && P.gold < bc.cost ? 'No tienes oro suficiente.' : 'Tu mano está llena.'; else ui.hint = ''; return render(); }
    if (act === 'undo') { E.clearTargets(s, 0); ui.hint = ''; nextPending(s); return render(); }
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
      if (ui.sel && ui.sel.k === 'hand') { var sl2 = +el.dataset.i; if (E.place(s, 0, ui.sel.i, sl2)) ui.landed = s.p[0].mesa[sl2].uid; }
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


  // ---------- Arrastrar cartas de la mano ----------
  var drag = null;
  app.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.hand [data-act="hand"]'), mel = null;
    if (!el && ui.s && ui.s.shopOpen) mel = e.target.closest('.row4.side0 [data-act="mine"]');
    if ((!el && !mel) || !ui.s || ui.playing || ui.busy || ui.s.phase !== 'prep' || (e.button && e.button > 0)) return;
    drag = { kind: mel ? 'mesa' : 'hand', uid: mel ? +mel.dataset.cuid : 0, i: el ? +el.dataset.i : 0, x: e.clientX, y: e.clientY, active: false, ghost: null, w: 0, h: 0 };
  });
  document.addEventListener('pointermove', function (e) {
    if (!drag) return;
    if (!drag.active) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      if (!startDrag()) { drag = null; return; }
    }
    e.preventDefault(); moveGhost(e.clientX, e.clientY);
  }, { passive: false });
  document.addEventListener('pointerup', function (e) { if (drag && drag.active) finishDrag(e.clientX, e.clientY); drag = null; });
  document.addEventListener('pointercancel', function () { if (drag && drag.active) cancelDrag(); drag = null; });
  function startDrag() {
    var s = ui.s, P = s.p[0];
    if (drag.kind === 'mesa') {
      var mi = inst(P, drag.uid);
      if (!mi || E.has(mi, 'Lol')) { ui.hint = mi ? 'Las tropas Lol no se pueden retirar.' : ''; render(); return false; }
      if (P.hand.length >= CFG.handMax) { ui.hint = 'Tu mano está llena.'; render(); return false; }
      ui.dragMesa = true; ui.sel = null; ui.hint = 'Suéltala sobre tu mano para retirarla.'; render();
      var src0 = app.querySelector('.row4.side0 [data-cuid="' + drag.uid + '"]'); if (!src0) return false;
      var r0 = src0.getBoundingClientRect(); drag.w = r0.width; drag.h = r0.height;
      var g0 = src0.cloneNode(true); g0.classList.add('ghostcard'); g0.style.width = r0.width + 'px'; g0.style.height = r0.height + 'px';
      document.body.appendChild(g0); drag.ghost = g0; drag.active = true; src0.classList.add('lifted-src');
      return true;
    }
    var inst0 = P.hand[drag.i]; if (!inst0) return false;
    var c = CARD[inst0.id];
    if (c.type === 'tropa') { if (!P.mesa.some(function (x) { return !x; })) return false; ui.sel = { k: 'hand', i: drag.i }; ui.hint = 'Suéltala sobre un hueco libre.'; }
    else { if (s.shopOpen) return false; ui.sel = { k: c.target === 'none' ? 'hand0' : 'act', i: drag.i }; ui.hint = c.target === 'none' ? 'Suéltala sobre el tablero.' : (c.target === 'ally' ? 'Suéltala sobre una tropa tuya.' : 'Suéltala sobre una tropa rival.'); }
    render();
    var src = app.querySelector('.hand [data-i="' + drag.i + '"]'); if (!src) return false;
    var r = src.getBoundingClientRect(); drag.w = r.width; drag.h = r.height;
    var g = src.cloneNode(true); g.classList.add('ghostcard'); g.classList.remove('sel'); g.style.width = r.width + 'px'; g.style.height = r.height + 'px';
    document.body.appendChild(g); drag.ghost = g; drag.active = true; src.classList.add('lifted-src');
    return true;
  }
  function moveGhost(x, y) { drag.ghost.style.transform = 'translate(' + (x - drag.w / 2) + 'px,' + (y - drag.h * .6) + 'px) scale(1.14) rotate(-3deg)'; }
  function cancelDrag() { if (drag.ghost) drag.ghost.remove(); ui.sel = null; ui.dragMesa = false; ui.hint = ''; render(); }
  function finishDrag(x, y) {
    var s = ui.s, P = s.p[0]; drag.ghost.style.display = 'none';
    var t = document.elementFromPoint(x, y); drag.ghost.remove(); noClick = Date.now();
    var inst0 = P.hand[drag.i], ok = false;
    if (drag.kind === 'mesa') {
      ui.dragMesa = false;
      if (t && t.closest('.handwrap')) { var sl = P.mesa.findIndex(function (x) { return x && x.uid === drag.uid; }); ok = sl >= 0 && E.retire(s, 0, sl); }
      ui.sel = null; ui.hint = ok ? '' : 'No se pudo retirar.'; render(); return;
    }
    if (t && inst0) {
      var c = CARD[inst0.id];
      if (c.type === 'tropa') {
        var slotEl = t.closest('.slot.free'), onBoard = t.closest('#board'), idx = slotEl ? +slotEl.dataset.i : (onBoard ? P.mesa.indexOf(null) : -1);
        if (idx >= 0 && E.place(s, 0, drag.i, idx)) { ok = true; ui.landed = P.mesa[idx].uid; }
      } else if (c.target === 'none') { if (t.closest('#board')) ok = E.playAction(s, 0, drag.i, null); }
      else { var cd = t.closest('[data-cuid]'); if (cd && cd.dataset.side === (c.target === 'ally' ? '0' : '1')) ok = E.playAction(s, 0, drag.i, +cd.dataset.cuid); }
    }
    ui.sel = null; ui.hint = ok ? '' : 'No se pudo soltar ahí.';
    if (ok && !s.shopOpen) nextPending(s);
    render();
  }

  window.CartasUI = ui; window.CartasRender = render; // depuración
  render();
})();
