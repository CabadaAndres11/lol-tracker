(function () {
  'use strict';
  var E = window.CartasEngine, D = E.DATA, CARD = E.CARD, CFG = E.CFG;
  var app = document.getElementById('app');
  var ui = { screen: 'boot', acct: null, ownedSet: null, pack: null, onlyOwned: false, filters: [], rar: [], groupRar: false, fmode: 'any', group: false, deck: [], slots: [null, null, null], slotTo: 0, slotName: '', msg: '', s: null, sel: null, view: null, playing: false, shown: 0, frames: [], hl: null, hint: '' };

  // El mazo y los huecos guardados son por cuenta (en este navegador); la colección vive en el servidor.
  function lk(n) { return 'cartas_' + n + ':' + (ui.acct ? ui.acct.name.toLowerCase() : ''); }
  function saveDeck() { try { localStorage.setItem(lk('deck'), JSON.stringify(ui.deck)); } catch (e) {} }
  function saveSlots() { try { localStorage.setItem(lk('slots'), JSON.stringify(ui.slots)); } catch (e) {} }
  function owns(id) { return !!(ui.ownedSet && ui.ownedSet[id]); }
  function setAcct(user) {
    ui.acct = user; ui.ownedSet = {}; user.owned.forEach(function (id) { ui.ownedSet[id] = 1; });
  }
  function loadLocal() {
    try { var sv = JSON.parse(localStorage.getItem(lk('deck')) || 'null'); ui.deck = sv && sv.length ? sv.filter(function (id) { return CARD[id] && owns(id); }) : []; } catch (e) { ui.deck = []; }
    ui.slots = [null, null, null];
    try { var sl = JSON.parse(localStorage.getItem(lk('slots')) || 'null'); if (sl && sl.length === 3) ui.slots = sl.map(function (x) { return x && x.ids ? { name: String(x.name || 'Mazo'), ids: x.ids.filter(function (id) { return CARD[id] && owns(id); }) } : null; }); } catch (e) {}
    // sin mazo guardado: empieza vacío (el jugador monta el suyo con las cartas que tiene)
  }
  // ---------- Servidor (cuenta, monedas, sobres) ----------
  function getTok() { try { return localStorage.getItem('cartas_tok') || ''; } catch (e) { return ''; } }
  function api(action, body) {
    var h = { 'Content-Type': 'application/json' }, t = getTok(); if (t) h['x-token'] = t;
    return fetch('/api/cartas', { method: 'POST', headers: h, body: JSON.stringify(Object.assign({ action: action }, body || {})) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; }); })
      .catch(function () { return { ok: false, status: 0, data: { error: 'Sin conexión con el servidor.' } }; })
      .then(function (r) { if (r.data && r.data.login) logout(); return r; });
  }
  function logout() {
    try { localStorage.removeItem('cartas_tok'); } catch (e) {}
    ui.acct = null; ui.ownedSet = null; ui.s = null; ui.pack = null; clearTimeout(timer); ui.playing = false; ui.deadline = null;
    ui.screen = 'login'; render();
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // ---------- Cartas ----------
  function hexMix(a, b, t) {
    function p(h) { return [1, 3, 5].map(function (i) { return parseInt(h.substr(i, 2), 16); }); }
    var x = p(a), y = p(b);
    return '#' + x.map(function (v, i) { return ('0' + Math.round(v * (1 - t) + y[i] * t).toString(16)).slice(-2); }).join('');
  }
  var TIMG = { 'Pokémon': 'pokemon', 'Lol': 'lol', 'KOI': 'koi', 'Anime': 'anime', 'Comebacker': 'comebacker', 'Voley': 'voley' };
  function tic(t) { return TIMG[t] ? '<img class="ic tic timg" src="/cartas/img/' + TIMG[t] + '.png" alt="">' : ic('t-' + t, 'tic'); }
  function tagHtml(t) { return '<span class="tag" style="--tc:' + D.themes[t].color + '">' + tic(t) + esc(t) + '</span>'; }
  function pips(n) { var h = ''; for (var k = 0; k < 3; k++) h += '<i' + (k < n ? ' class="on"' : '') + '></i>'; return h; }
  var AICON = { entrenamiento: 'espadas', arenga: 'megafono', armadura: 'escudo', banquete: 'carne', intimidacion: 'enfado', 'mal-de-ojo': 'ojo', 'golpe-certero': 'diana', lluvia: 'arco',
    'bola-extra': 'beisbol', 'segundo-aliento': 'viento', 'cambio-de-linea': 'cambio', parche: 'disquete', 'horas-extra': 'maletin', 'capitulo-especial': 'tele', 'segunda-temporada': 'trofeo', 'remate-doble': 'voley', 'cita-sorpresa': 'corazon', 'rabia-contenida': 'enfado', 'fiesta-del-pueblo': 'fiesta', 'hermano-del-alma': 'duo', 'sofa-compartido': 'sofa', madrugon: 'reloj' };
  var ARTS = {"aitorlg-friki":1,"aitorlg-koisito":1,"aitorlg-regla":1,"aitorlg-renata":1,"chipy-correa":1,"chipy-lloron":1,"computer-chipy":1,"computer-dashlight":1,"computer-hellbramn":1,"computer-lihone":1,"computer-petea":1,"dashlight-akali":1,"dashlight-correa":1,"haikyuu-lihone":1,"hellbramn":1,"javihi":1,"javihi-duo":1,"javihi-friki":1,"javihi-koisito":1,"javihi-prime":1,"lihone":1,"lihone-correa":1,"lihone-viego":1,"mertens":1,"mertens-prime":1,"pampert":1,"pampert-friki":1,"pampert-koisito":1,"petea-koisito":1,"petea-pokemaniaco":1,"potango":1,"sech":1,"sech-duo":1,"sech-koisito":1,"sech-thresh":1};
  // Nivel de carta por repetidas: 2 copias = ★2, 4 copias = ★3
  function lvOf(id) { var n = 1 + ((ui.acct && ui.acct.dups && ui.acct.dups[id]) || 0); return n >= 4 ? 3 : n >= 2 ? 2 : 1; }
  function skG(side, id) { var s = ui.s; return (s && s.sk && s.sk[side] && s.sk[side][id]) || ''; }
  function lvG(side, id) { var s = ui.s; return (s && s.lv && s.lv[side] && s.lv[side][id]) || 1; }
  function cardHtml(c, o) {
    o = o || {};
    var troop = c.type === 'tropa', c1, c2;
    if (troop) { c1 = D.themes[c.themes[0]].color; c2 = c.themes[1] ? D.themes[c.themes[1]].color : hexMix(c1, '#0b0716', .62); }
    else if (c.theme) { c1 = D.themes[c.theme].color; c2 = hexMix(c1, '#0b0716', .62); } else { c1 = '#2dd4bf'; c2 = '#0f3f3a'; }
    var tag = o.tag || 'div';
    var art = troop && ARTS[c.id];
    if (o.skin === undefined) o.skin = ui.screen === 'game' ? '' : (ui.acct && ui.acct.skinSel && ui.acct.skinSel[c.id] && ui.acct.skins.indexOf(ui.acct.skinSel[c.id]) >= 0 ? ui.acct.skinSel[c.id] : '');
    var h = '<' + tag + ' class="card r-' + c.rarity + (troop ? '' : ' accion') + (art ? ' art' : '') + (o.cls ? ' ' + o.cls : '') + '" style="--c1:' + c1 + ';--c2:' + c2 + (art ? ';--art:url(/cartas/art/' + (o.skin || c.id) + '.webp)' : '') + '"' + (o.attrs ? ' ' + o.attrs : '') + '>';
    h += '<span class="coin" title="Coste en oro para comprarla">' + c.cost + '</span>';
    if (c.pas) h += '<span class="pasb" title="' + esc(c.pas.n + ': ' + c.pas.t) + '">✦</span>';
    if (o.gl > 1) h += '<span class="glb" title="Fusionada en partida: ★' + o.gl + '">' + '★'.repeat(o.gl) + '</span>';
    if (o.lv > 1) h += '<span class="lvb" title="Nivel ' + o.lv + ' por cartas repetidas">★' + o.lv + '</span>';
    if (o.size) h += '<span class="pips" title="Espacio que ocupa en el mazo: ' + c.size + '">' + pips(c.size) + '</span>';
    h += '<div class="nm">' + esc(c.name) + '</div>';
    if (troop) {
      var lb = o.lv > 1 && o.atk == null ? o.lv - 1 : 0; // nivel de carta: +1/+1 por nivel (en tienda, mazo y colección)
      var a = o.atk != null ? o.atk : c.atk + lb, hp = o.hp != null ? o.hp : c.hp + lb, mx = o.max != null ? o.max : hp;
      h += '<div class="mono">' + esc(c.person.charAt(0)) + '</div><div class="tags">' + c.themes.map(tagHtml).join('') + '</div>';
      var dA = a - c.atk, dH = mx - c.hp;
      if (dA) h += '<i class="dl a ' + (dA > 0 ? 'pos' : 'neg') + '">' + (dA > 0 ? '+' : '') + dA + '</i>';
      if (dH) h += '<i class="dl h ' + (dH > 0 ? 'pos' : 'neg') + '">' + (dH > 0 ? '+' : '') + dH + '</i>';
      h += '<span class="sc a' + (a > c.atk ? ' up' : '') + '" title="Ataque"><b>' + a + '</b></span><span class="sc h' + (mx > c.hp ? ' up' : '') + (hp < mx ? ' low' : '') + '" title="Vida' + (hp < mx ? ' (' + hp + '/' + mx + ')' : '') + '"><b>' + hp + '</b></span>';
    } else {
      h += '<div class="mono ico">' + ic(AICON[c.id] || 'brillo') + '</div><div class="adesc">' + esc(c.text) + '</div>' + (c.theme ? '<div class="tags">' + tagHtml(c.theme) + '</div>' : '');
    }
    if (o.extra) h += o.extra;
    return h + '</' + tag + '>';
  }

  // ---------- Navegación ----------
  var NAV = [['home', 'casa', 'Inicio'], ['play', 'espadas', 'Jugar'], ['deck', 'cartas', 'Mazo'], ['packs', 'tienda', 'Tienda'], ['themes', 'brillo', 'Sinergias'], ['rules', 'libro', 'Normas']];
  function navHtml(cur) {
    return '<nav class="nav">' + NAV.map(function (n) { return '<button class="navb' + (n[0] === cur ? ' on' : '') + '" data-act="nav" data-to="' + n[0] + '">' + ic(n[1]) + ' ' + n[2] + '</button>'; }).join('') +
      '<span class="navsp"></span>' + (ui.acct ? '<button class="navb coinpill" data-act="nav" data-to="packs" title="Tus monedas">' + ic('moneda') + ' ' + ui.acct.coins + '</button><span class="acctw"><button class="navb who" data-act="acctmenu" title="Tu cuenta">' + ic('usuario') + ' ' + esc(ui.acct.name) + ' ▾</button><div class="acctmenu"><div class="am-name">Sesión de <b>' + esc(ui.acct.name) + '</b></div><button data-act="logout">' + ic('puerta') + ' Cerrar sesión</button></div></span>' : '') + '<a class="navb" href="/">← Hub</a></nav>';
  }
  function head(cur, title) { return '<div class="wrap">' + navHtml(cur) + (title ? '<h1 class="ptitle">' + title + '</h1>' : ''); }
  function deckSize() { return E.deckSize(ui.deck); }
  function deckError() {
    var troops = ui.deck.filter(function (id) { return CARD[id].type === 'tropa'; });
    if (!troops.length) return 'El mazo necesita al menos una tropa.';
    if (!troops.some(function (id) { return CARD[id].rarity === 'Común'; })) return 'Necesitas al menos una tropa Común: la tienda inicial solo ofrece Comunes.';
    return '';
  }

  function heroCards() {
    var pick = ['Rara', 'Legendaria', 'Épica'].map(function (r) { return D.cards.filter(function (c) { return c.rarity === r && (r !== 'Rara' || c.person === 'AitoRLG'); })[0] || D.cards.filter(function (c) { return c.rarity === r; })[0]; }).filter(Boolean);
    return '<div class="fan">' + pick.map(function (c, k) { return '<div class="fc f' + k + '">' + cardHtml(c, { atk: c.atk, hp: c.hp, max: c.hp, cls: '' }) + '</div>'; }).join('') + '</div>';
  }
  function ladderHtml() {
    if (!ui.ladder || Date.now() - (ui.ladderAt || 0) > 20000) {
      if (!ui.ladderBusy) {
        ui.ladderBusy = true;
        api('ladder').then(function (r) { ui.ladderBusy = false; ui.ladderAt = Date.now(); if (r.ok) { ui.ladder = r.data; if (ui.screen === 'home') render(); } });
      }
    }
    var L = ui.ladder;
    var rows = L && L.top && L.top.length ? L.top.map(function (r, k) {
      return '<li class="lrow' + (ui.acct && r.name === ui.acct.name ? ' me' : '') + '"><span class="lpos">' + (k + 1) + '</span><b>' + esc(r.name) + '</b><span class="lpts">' + r.pts + ' pts</span></li>';
    }).join('') : '<li class="mut">' + (L ? 'Aún no hay partidas puntuadas. ¡Juega un 1 vs 1 o un Versus de 4!' : 'Cargando…') + '</li>';
    return '<div class="panel ladderbox"><h2>' + ic('trofeo') + ' Clasificación</h2><ol class="ladder">' + rows + '</ol><p class="mut lme">' + (L ? 'Tus puntos: <b>' + L.me + '</b>' : '') + '</p></div>';
  }
  function newsHtml() {
    var N = window.CARTAS_NEWS || [];
    if (!N.length) return '';
    return '<div class="panel newsbox' + (ui.newsOpen ? ' open' : '') + '"><h2>' + ic('libro') + ' Parches y noticias</h2><div class="newsbody">' + N.slice(0, 30).map(function (n) {
      return '<div class="newsi"><div class="newsh"><span class="ntag nt-' + esc(n.tag) + '">' + esc(n.tag) + '</span><b>' + esc(n.title) + '</b><span class="mut">' + esc(n.date.split('-').reverse().join('/')) + '</span></div><ul>' + n.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ul></div>';
    }).join('') + '</div><button class="btn sec sm newstog" data-act="newstog">' + (ui.newsOpen ? 'Ocultar ▴' : 'Ver todas las noticias ▾') + '</button></div>';
  }
  function renderHome() {
    var n = Object.keys(D.themes).length;
    var h = head('home') + '<div class="hero">' + heroCards() + '<img src="/cartas/logo.svg" alt="" class="hero-logo"><h1>Juego de Cartas</h1><p class="mut">Mazos con sinergias combinables, combates por rondas y memes de la pandilla.</p><button class="btn big cta" data-act="nav" data-to="play">' + ic('espadas') + ' ¡Jugar ahora!</button></div>';
    h += '<div class="menu">' + [
      ['play', ic('espadas'), 'Jugar', 'Elige modo: contra la IA, jugador contra jugador o versus de 4.'],
      ['deck', ic('cartas'), 'Mazo', 'Elige tus cartas (' + deckSize() + '/' + CFG.deckBudget + ') y guarda hasta 3 mazos.'],
      ['packs', ic('tienda'), 'Tienda', 'Gasta tus monedas (' + (ui.acct ? ui.acct.coins : 0) + ' ' + ic('moneda') + ') en sobres y skins.'],
      ['themes', ic('brillo'), 'Sinergias', n + ' sinergias con sus niveles y cartas.'],
      ['rules', ic('libro'), 'Normas', 'Cómo funcionan las rondas, la tienda y el combate.'],
    ].map(function (m) { return '<button class="menu-i m-' + m[0] + '" data-act="nav" data-to="' + m[0] + '"><span class="mi">' + m[1] + '</span><b>' + m[2] + '</b><span class="mut">' + m[3] + '</span></button>'; }).join('') + '</div>';
    h += newsHtml();
    h += ladderHtml();
    h += '<p class="mut" style="text-align:center">' + D.cards.length + ' tropas · ' + D.actions.length + ' acciones</p></div>';
    app.innerHTML = h;
  }

  function renderBoot() { app.innerHTML = '<div class="wrap"><p class="mut" style="text-align:center;margin-top:30vh">Cargando…</p></div>'; }
  function renderLogin() {
    app.innerHTML = '<div class="wrap"><div class="loginbox panel"><div class="lg-ico">' + ic('cartas') + '</div><h1>Juego de Cartas</h1><p class="mut">Crea tu cuenta con un nombre y un PIN de 4 dígitos para guardar tus monedas y tu colección. Apunta el PIN: no se puede recuperar.</p>' +
      '<label>Nombre<input id="lg-name" maxlength="16" autocomplete="username" placeholder="Tu nombre" value="' + esc(ui.lgName || '') + '"></label>' +
      '<label>PIN<input id="lg-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="current-password" placeholder="0000"></label>' +
      (ui.msg ? '<div class="hint" style="color:var(--bad)">' + esc(ui.msg) + '</div>' : '') +
      '<div class="btnrow"><button class="btn" data-act="login">Entrar</button><button class="btn sec" data-act="register">Crear cuenta nueva</button></div>' +
      '<p class="mut" style="margin:.6rem 0 0">Al crear la cuenta recibes ' + 150 + ' monedas y un mazo inicial a tu elección.</p></div></div>';
  }
  var STARTERS = ['Pokémon', 'Informático', 'Trabajo', 'Lol', 'Comebacker', 'KOI'];
  function starterCards(act) {
    return STARTERS.map(function (t) {
      var th = D.themes[t], n = D.cards.filter(function (c) { return c.themes.indexOf(t) >= 0; }).length;
      return '<button class="starter" style="--tc:' + th.color + '" data-act="' + act + '" data-t="' + t + '"><span class="si">' + tic(t) + '</span><b>' + t + '</b><span class="mut">' + n + ' tropas · ' + esc(th.tx[0]) + '</span></button>';
    }).join('');
  }
  function adminStarters() {
    return '<div class="panel adminst"><h2>Mazo inicial (vista de jugador nuevo)</h2><p class="mut">Así lo eligen las cuentas nuevas al registrarse. Al pulsar uno, tu colección pasa a ser solo las cartas de ese mazo (como un jugador nuevo, con 150 monedas y sin mazo montado).</p><div class="starters">' + starterCards('adminstarter') + '</div><button class="btn sec" data-act="adminall">Restaurar todas las cartas</button>' + (ui.msg ? '<div class="hint">' + esc(ui.msg) + '</div>' : '') + '</div>';
  }
  function renderStarter() {
    app.innerHTML = '<div class="wrap"><div class="loginbox starterbox panel"><h1>Elige tu mazo inicial</h1><p class="mut">Cada mazo gira en torno a una sinergia. Es tu regalo de bienvenida: podrás ampliar tu colección abriendo sobres.</p><div class="starters">' + starterCards('pickstarter') + '</div>' + (ui.msg ? '<div class="hint" style="color:var(--bad)">' + esc(ui.msg) + '</div>' : '') +
      '<button class="btn sec" data-act="backlogin">← Volver</button></div></div>';
  }
  function bpkHtml(cls) {
    return '<div class="bpk ' + (cls || '') + '"><div class="bpk-glow"></div><div class="bpk-rays"></div><div class="bpk-main"><span>' + ic('cartas') + '</span><b>SOBRE</b><i>' + (ui.acct ? ui.acct.packSize : 5) + ' cartas</i></div><div class="bpk-lid"></div></div>';
  }
  var GEM = { 'Común': '●', 'Rara': '◆', 'Épica': '✦', 'Legendaria': '★' };
  var RANK = ['Común', 'Rara', 'Épica', 'Legendaria'];
  function skinShop(a) {
    var SK = window.CARTAS_SKINS || [];
    if (!SK.length) return '';
    return '<div class="panel skinshop"><h2>' + ic('estrella') + ' Skins</h2><p class="mut">Cambian solo la ilustración de una carta. Necesitas tener la carta. Se ven en tus partidas.</p><div class="skgrid">' + SK.map(function (s) {
      var c = CARD[s.card], hasCard = a.owned.indexOf(s.card) >= 0, own = (a.skins || []).indexOf(s.id) >= 0, eq = a.skinSel && a.skinSel[s.card] === s.id;
      var btn = own ? (eq ? '<button class="btn sec sm" data-act="skinequip" data-skin="" data-card="' + s.card + '">' + ic('check') + ' Equipada · usar clásica</button>' : '<button class="btn sm" data-act="skinequip" data-skin="' + s.id + '" data-card="' + s.card + '">Equipar</button>')
        : !hasCard ? '<button class="btn sm" disabled>Necesitas la carta</button>'
        : '<button class="btn sm" data-act="skinbuy" data-skin="' + s.id + '"' + (a.coins < (a.admin ? 0 : s.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : s.price + ' ' + ic('moneda')) + '</button>';
      return '<div class="skitem"><div class="skcard">' + cardHtml(c, { skin: s.id, lv: 1 }) + '</div><b>' + esc(c.name) + '</b><span class="mut">' + esc(s.name) + '</span>' + btn + '</div>';
    }).join('') + '</div></div>';
  }
  function renderPacks() {
    var a = ui.acct, total = D.cards.length + D.actions.length, can = a.coins >= a.packCost && !ui.pack;
    var h = head('packs', '' + ic('tienda') + ' Tienda') + '<div class="packs-grid">' +
      '<div class="panel packbox">' + bpkHtml('') + '<h2>Sobre estándar</h2><p class="mut">' + a.packSize + ' cartas al azar de todo el juego (tropas y acciones). La última siempre es Rara o mejor. Las cartas que ya tengas se cambian por monedas.</p>' +
      '<button class="btn cta big" data-act="openpack"' + (can ? '' : ' disabled') + '>' + (a.packCost ? 'Abrir sobre · ' + a.packCost + ' ' + ic('moneda') + '' : 'Abrir sobre · gratis') + '</button>' + (a.coins < a.packCost ? '<p class="mut">Te faltan ' + (a.packCost - a.coins) + ' monedas.</p>' : '') + (ui.msg ? '<div class="hint" style="color:var(--bad)">' + esc(ui.msg) + '</div>' : '') + '</div>' +
      (a.admin ? adminStarters() : '') + skinShop(a) + '<div class="panel"><h2>Tus monedas</h2><div class="coinbig">' + ic('moneda') + ' ' + a.coins + '</div>' +
      '<div class="dailybox">' + (a.dailyAvailable ? '<button class="btn" data-act="daily">' + ic('regalo') + ' Recompensa diaria · +' + a.dailyCoins + ' ' + ic('moneda') + '</button>' : '<p class="mut">' + ic('check') + ' Ya cobraste la recompensa de hoy. Vuelve mañana.</p>') + '</div>' +
      '<h2 style="margin-top:1rem">Cómo conseguir monedas</h2><ul class="rules"><li><b>Recompensa diaria:</b> +' + a.dailyCoins + ' ' + ic('moneda') + ' cada día.</li><li><b>Partidas contra la IA:</b> +10 ' + ic('moneda') + ' por partida y +20 ' + ic('moneda') + ' más si ganas (hoy llevas ' + a.gamesToday + '/' + a.maxGamesToday + ' partidas con premio). Las partidas muy cortas no dan monedas.</li><li><b>Cartas repetidas:</b> no dan monedas, pero suben la carta de nivel (ver Normas).</li></ul></div>' +
      '<div class="panel"><h2>Tu colección</h2><div class="coinbig">' + a.owned.length + ' / ' + total + '</div><div class="meter colm"><i class="on" style="width:' + Math.round(a.owned.length / total * 100) + '%"></i></div><p class="mut">Solo puedes usar en tu mazo las cartas que tienes. Mira cuáles te faltan en la pestaña Mazo.</p>' +
      '<button class="btn sec" data-act="nav" data-to="deck">' + ic('cartas') + ' Ir al mazo</button></div></div>';
    app.innerHTML = h + packOverlay() + '</div>';
  }
  function packHint() {
    var m = app.querySelector('.pmsg'); if (!m || !ui.pack || !ui.pack.rev.every(Boolean)) return;
    m.textContent = 'Haz clic en un espacio vacío para continuar'; m.classList.add('pulse');
    var fb = app.querySelector('[data-act=flipall]'); if (fb) fb.style.visibility = 'hidden';
  }
  function RIP_MS(pk) { return pk.cards.some(function (c) { return CARD[c.id].rarity === 'Legendaria'; }) ? 2300 : 1750; }
  function packOverlay() {
    var pk = ui.pack; if (!pk) return '';
    if (!pk.cards) return '<div class="packov">' + bpkHtml('shake best-Común') + '</div>';
    var best = pk.cards.reduce(function (b, c) { var r = CARD[c.id].rarity; return RANK.indexOf(r) > RANK.indexOf(b) ? r : b; }, 'Común');
    if (pk.stage === 'rip') return '<div class="packov' + (best === 'Legendaria' ? ' rainbow' : '') + '">' + bpkHtml('rip best-' + best) + '</div>';
    var gain = pk.cards.reduce(function (n, c) { return n + c.dupCoins; }, 0);
    var allRev = pk.rev.every(Boolean);
    return '<div class="packov' + (best === 'Legendaria' ? ' rainbowpost' : '') + '" data-act="packbg"><div class="pcards">' + pk.cards.map(function (c, i) {
      var cd = CARD[c.id];
      return '<div class="pcard r-' + cd.rarity + (pk.rev[i] ? ' flipped' : '') + '" data-act="flipcard" data-i="' + i + '" style="--d:' + i * 0.12 + 's"><div class="pin"><div class="pback"><span>' + GEM[cd.rarity] + '</span></div><div class="pfront">' + cardHtml(cd, {}) +
        (c.isNew ? '<span class="pnew">¡NUEVA!</span>' : '<span class="pdup">' + (c.lvUp ? '¡Sube a ★' + c.lvl + '!' : 'Repetida · ' + c.copies + ' copias') + '</span>') + '</div></div></div>';
    }).join('') + '</div><div class="pactions"><button class="btn sec" data-act="flipall"' + (allRev ? ' style="visibility:hidden"' : '') + '>Girar todas</button></div>' + (gain ? '<p class="pgain">+' + gain + ' ' + ic('moneda') + ' por cartas repetidas</p>' : '') + '<p class="pmsg' + (allRev ? ' pulse' : '') + '">' + (allRev ? 'Haz clic en un espacio vacío para continuar' : 'Pulsa cada carta para girarla · el color del reverso te dice su rareza') + '</p></div>';
  }
  function renderModes() {
    var modes = [
      ['ai', ic('robot'), 'Contra la IA', 'Duelo 1 contra 1 con tu mazo contra la IA.', true],
      ['pvp', ic('espadas'), 'Jugador contra jugador', 'Reta a otro jugador en un duelo 1 contra 1. Sala con código o búsqueda automática.', true],
      ['rev', ic('robot'), 'Contra la IA', 'Las tropas reviven y la carta que ataca también recibe el ataque de la carta atacada.', true],
      ['revpvp', ic('espadas'), 'Jugador contra jugador', 'Duelo 1 contra 1 en modo Resurrección. Sala con código o búsqueda automática.', true],
      ['vs4', ic('grupo'), 'Versus de 4', 'Cuatro jugadores, duelos rotando hasta que quede uno. Sala con código o búsqueda.', true],
    ];
    var tile = function (m) {
      return '<button class="mode m-' + m[0] + (m[4] ? '' : ' off') + '"' + (m[4] ? ' data-act="' + (m[0] === 'pvp' ? 'openpvp' : m[0] === 'revpvp' ? 'openrevpvp' : m[0] === 'rev' ? 'startrev' : m[0] === 'vs4' ? 'openvs4' : 'startai') + '"' : ' disabled aria-disabled="true"') + '><span class="mi">' + m[1] + '</span><b>' + m[2] + '</b><span class="mut">' + m[3] + '</span>' +
        (m[4] ? '<span class="go">¡Jugar!</span>' : '<span class="soon">' + ic('candado') + ' Próximamente</span>') + '</button>';
    };
    var group = function (title, sub, ids) {
      return '<h2 class="mgtitle">' + title + '</h2><p class="mut mgsub">' + sub + '</p><div class="modes">' + modes.filter(function (m) { return ids.indexOf(m[0]) >= 0; }).map(tile).join('') + '</div>';
    };
    app.innerHTML = head('play', '' + ic('espadas') + ' Elige modo de juego') + '<p class="mut">Tu mazo actual (' + deckSize() + '/' + CFG.deckBudget + ') se usará en cualquier modo.</p>' +
      group('Modo clásico', 'Las tropas que caen se pierden. Gana quien se queda con tropas en pie y deja sin vida al rival.', ['ai', 'pvp', 'vs4']) +
      group('Modo Resurrección <span class="betatag">En fase de prueba</span>', 'Las tropas reviven cada ronda y al atacar también recibes el ataque de la carta atacada.', ['rev', 'revpvp']) + '</div>';
  }
  function renderRules() {
    var sec = function (t, items) { return '<div class="panel"><h2>' + t + '</h2><ul class="rules">' + items.map(function (i) { return '<li>' + i + '</li>'; }).join('') + '</ul></div>'; };
    app.innerHTML = head('rules', '' + ic('libro') + ' Normas') +
      sec('Objetivo', ['Es un 1 contra 1. Empiezas con <b>12 de vida</b>; gana quien deje la vida del rival a 0.']) +
      sec('Tu mazo', ['El mazo tiene un <b>presupuesto de espacio de ' + CFG.deckBudget + '</b>: las tropas baratas ocupan 1, las medias 2 y las de coste 5 ocupan 3; las acciones ocupan 1. Lo ves en los cuadraditos de la esquina de cada carta.', 'No hay cartas duplicadas en el mazo, pero una misma carta puede salir varias veces en la tienda.', 'Necesitas al menos una tropa <b>Común</b>.']) +
      sec('Cartas', ['El <b>círculo dorado</b> es lo que cuesta comprarla en oro.', 'El <b>círculo naranja</b> es el ataque y el <b>verde</b> la vida.', 'El color de la carta mezcla los de sus sinergias y el borde indica la rareza (gris Común, azul Rara, morado Épica, dorado Legendaria).']) +
      sec('Primera ronda', ['La partida empieza con una <b>tienda</b>: ambos jugadores tienen <b>' + (CFG.gold + CFG.income) + ' de oro</b> y solo salen tropas Comunes y cualquier acción de tu mazo (siempre con al menos 3 tropas; las acciones se guardan para jugarlas en combate). Si te quedas <b>sin tropas y sin oro</b> para comprar ninguna (ni para actualizar), pierdes automáticamente. Pulsa una carta para comprarla, colócala (pulsando o arrastrándola) y termina la tienda.']) +
      sec('Una ronda de combate', ['Cada ronda ganas <b>2 de oro</b> (se reinicia cada partida y es distinto de las monedas de la tienda).', 'Tienes <b>4 huecos en mesa</b> y una <b>mano de 5</b>.', 'En la preparación colocas tropas (pulsando o arrastrando desde la mano), juegas acciones y <b>debes elegir objetivo para cada una de tus tropas</b>: no se puede combatir hasta que todas tengan uno. Puedes deshacerlos todos con el botón «Deshacer objetivos». El rival no ve tus objetivos.', '<b>La tienda dura 1 minuto</b>: al acabarse se cierra sola y pasas al combate. <b>Tienes 45 segundos</b> por ronda de combate (el reloj se ve arriba). Si se acaban y faltan objetivos por elegir, <b>pierdes la partida</b>; si ya estaban todos elegidos, el combate empieza solo.']) +
      sec('Tienda', ['Hay tienda <b>cada 3 rondas</b> (rondas 1, 4, 7…). En una ronda de tienda <b>no hay combate</b>.', 'La tienda ofrece 5 cartas al azar de tu propio mazo; pulsa una para comprarla. El botón redondo ' + ic('cambio') + ' la actualiza por 1 de oro.', '<b>Solo en las rondas de tienda</b> puedes retirar tropas de la mesa; el resto del tiempo puedes colocar si hay hueco, pero no quitar.', 'Las tropas de coste 5 aparecen a partir de la segunda tienda.']) +
      sec('Combate', ['Los ataques se resuelven de uno en uno, alternando bandos de izquierda a derecha. Cada tropa ataca <b>una vez por ronda</b>. El bando que empieza se alterna cada ronda.', 'Si el objetivo ya murió, el ataque va a una tropa rival viva al azar.', 'No se puede atacar al jugador directamente: <b>recibes daño solo si todas tus tropas han muerto</b> y a tu rival le quedan tropas por atacar; el daño es igual a su ataque.', '<b>Las tropas no se curan entre rondas</b>: el daño se acumula. Solo se curan del todo al volver a tu mano (retirándolas en la tienda). Las muertas liberan su hueco y los bonus de «esta ronda» desaparecen.', 'Si en una ronda sin tienda no tienes tropas ni en mesa ni en mano, <b>pierdes automáticamente</b>.']) +
      sec('Jugador contra jugador', ['Crea una sala y pasa el <b>código de 5 letras</b> a un amigo, o usa <b>Buscar rival</b> para emparejarte con cualquiera.', 'Las dos tiendas y los combates son simultáneos: cada ronda la partida avanza cuando <b>los dos pulsáis listo</b> o se acaba el tiempo (45 s en combate, 60 s en tienda).', 'Ganas <b>15 monedas</b> por partida y <b>40 más</b> si ganas (con el mismo límite diario que contra la IA). Si abandonas o pasas <b>más de 60 s desconectado</b>, pierdes y no cobras.']) +
      sec('Modo Resurrección', ['Mismas reglas que el 1 contra 1, pero las tropas <b>no mueren</b>: las que caen en combate <b>reviven con la vida completa</b> al acabar la ronda y las acciones nunca las matan (las dejan a 1).', '<b>Contraataque:</b> cada vez que una carta ataca a otra, <b>la que ataca también recibe el ataque de la carta atacada</b> en su vida. Una tropa puede caer por el contraataque (y entonces ya no ataca esa ronda).', 'La vida de los jugadores solo baja con <b>golpes directos</b>: cuando al rival no le queda ninguna tropa en pie y a una de las tuyas aún le queda un ataque por hacer. Se empieza con <b>20 de vida</b>; pierde quien llegue a 0.', 'Se puede jugar contra la IA o contra otro jugador (sala o búsqueda), y también puntúa en la clasificación y da monedas.']) +
      sec('Modo Resurrección: mesa y mano', ['En este modo <b>no puedes tener la misma carta dos veces en la mesa</b>: los duplicados solo pueden estar en la mano (sirven para fusionar).', 'Además <b>no hay límite de cartas en la mano</b>.']) +
      sec('Vender cartas', ['Durante la <b>tienda</b> puedes vender cualquier carta de tu mano o tu mesa con el botón <b>Vender</b> y recuperas su <b>valor en oro</b> (su coste). Una carta fusionada ★2 vale <b>×3</b> y una ★3 vale <b>×9</b>.']) +
      sec('Pasivas de las legendarias', D.cards.filter(function (c) { return c.pas; }).reduce(function (a, c) { if (!a.some(function (x) { return x.indexOf(c.pas.n) >= 0 && c.pas.n === 'Dúo en sintonía'; })) a.push('<b>' + esc(c.name) + (c.pas.n === 'Dúo en sintonía' ? ' / ' + (c.id === 'javihi-duo' ? 'Sech Dúo' : 'Javihi Dúo') : '') + ' · ' + esc(c.pas.n) + ':</b> ' + esc(c.pas.t)); return a; }, []).concat(['Las cartas con pasiva llevan una <b>✦</b>: pasa el cursor por encima para leerla.'])) +
      sec('Fusión de copias', ['Si juntas <b>3 copias iguales</b> de una tropa (entre la mesa y la mano) se fusionan solas en <b>una</b> con más estadísticas: <b>★2</b> = estadísticas base ×2 y, con 3 cartas ★2 iguales, <b>★3</b> = ×4.', 'La carta fusionada se queda en la mesa si alguna copia estaba en ella. Puedes comprar la 3ª copia aunque tengas la mano llena. En la tienda, las cartas que completan una fusión se marcan con un brillo.']) +
      sec('Niveles de carta', ['Cada vez que te sale una carta que ya tienes, cuenta como una <b>copia</b>. Con <b>2 copias</b> la carta pasa a <b>★2</b> y con <b>4 copias</b> a <b>★3</b>.', 'Las <b>tropas</b> ganan <b>+1/+1 por nivel</b> al entrar en juego. Las <b>acciones con cifras</b> (daño, ataque, vida, oro…) mejoran un <b>50% por nivel</b>; las que no tienen cifras no cambian.', 'El nivel lo ves como ★ en la carta, tanto en el mazo como en la partida.']) +
      sec('Versus de 4', ['Cuatro jugadores en la misma partida: <b>30 de vida</b>, <b>14 de oro</b> al empezar y <b>+3 de oro</b> por ronda.', 'Cada ronda de combate se juegan <b>2 duelos a la vez</b> y los emparejamientos rotan para que todos se crucen. Las rondas de tienda (1, 4, 7…) son para los cuatro y no hay combate.', 'Quien llega a 0 de vida o se queda sin tropas queda <b>eliminado</b>. Con 3 vivos, uno <b>descansa</b> cada ronda (cobra oro y prepara su mesa). Gana el último en pie.', 'Monedas: <b>15</b> por jugar + <b>45</b> (1º), <b>20</b> (2º) o <b>5</b> (3º). Si abandonas o pasas más de 60 s desconectado, quedas eliminado y no cobras.']) +
      sec('Sinergias', ['Cada tropa tiene 1 o 2 sinergias. Cuentan las <b>cartas distintas</b> de cada sinergia entre mesa y mano (las copias no suman; las acciones no cuentan para la sinergia, aunque las de color pertenecen a una).', 'Al llegar a ciertos números (niveles) la sinergia da su bonificación. <b>Las mejoras de estadísticas son permanentes</b> (con un tope por tropa), salvo las de Voley, que solo duran la ronda, así que tus tropas se hacen más fuertes con la partida. En la partida ves a un lado cuántas llevas y cuántas necesitas.', 'Voley solo funciona con 2 o más cartas distintas de Voley entre mesa y mano; hasta entonces no puedes elegir ataque o defensa.']) +
      sec('Acciones', ['Se juegan en las <b>rondas de combate</b> (no en la tienda) y ocupan 1 de espacio. Las mejoras de estadísticas de las acciones son <b>permanentes</b>.', 'Generales: dar ataque o vida a una tropa o a todas las tuyas, y quitar ataque o hacer daño a una tropa rival o a todas.', 'Las de color son de una sinergia concreta y algunas piden condiciones (p. ej. tener el nivel 1 de esa sinergia); si no se cumplen, la carta te dice qué falta y no se gasta.', 'Comebacker compara la <b>vida actual</b> de las tropas en mesa, no la máxima.']) +
      sec('Todavía por llegar', ['Pasivas para las cartas épicas, raras y comunes.']) + '</div>';
  }

  function themeCards(t) { return D.cards.filter(function (c) { return c.themes.indexOf(t) >= 0; }).concat(D.actions.filter(function (a) { return a.theme === t; })); }
  function renderThemes() {
    var h = head('themes', '' + ic('brillo') + ' Sinergias') + '<p class="mut">Pulsa «Ver en el mazo» para filtrar las cartas de esa sinergia.</p>';
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
      if (sl) h += '<b>' + esc(sl.name) + (cur ? ' ' + ic('check') : '') + '</b><span class="mut">' + E.deckSize(sl.ids) + '/' + CFG.deckBudget + ' espacio · ' + sl.ids.length + ' cartas</span><div class="bar" style="margin:.3rem 0 0"><button class="btn sec sm" data-act="slot-load" data-i="' + i + '">Cargar</button><button class="btn sec sm" data-act="slot-del" data-i="' + i + '" title="Borrar">' + ic('papelera') + '</button></div>';
      else h += '<b>Hueco ' + (i + 1) + '</b><span class="mut">Vacío</span>';
      h += '</div>';
    }
    h += '</div><div class="bar"><input id="slot-name" maxlength="20" placeholder="Nombre del mazo" value="' + esc(ui.slotName) + '"><select id="slot-to">' +
      [0, 1, 2].map(function (i) { return '<option value="' + i + '"' + (ui.slotTo === i ? ' selected' : '') + '>Hueco ' + (i + 1) + (ui.slots[i] ? ' (' + esc(ui.slots[i].name) + ')' : ' (vacío)') + '</option>'; }).join('') +
      '</select><button class="btn sec" data-act="slot-save"' + (ui.deck.length ? '' : ' disabled') + '>' + ic('disquete') + ' Guardar mazo actual</button></div>';
    if (ui.msg) h += '<div class="hint">' + esc(ui.msg) + '</div>';
    return h;
  }
  var RARS = ['Común', 'Rara', 'Épica', 'Legendaria'], RCOL = { 'Común': '#9ca3af', 'Rara': '#60a5fa', 'Épica': '#c084fc', 'Legendaria': '#fbbf24' };
  // Panel izquierdo: cuántas cartas de cada sinergia llevas en el mazo (solo iconos y números)
  function deckLeft() {
    var inDeck = {};
    ui.deck.forEach(function (id) { (CARD[id].themes || []).forEach(function (t) { inDeck[t] = (inDeck[t] || 0) + 1; }); });
    var rows = Object.keys(D.themes).filter(function (t) { return inDeck[t]; }).sort(function (a, b) { return inDeck[b] - inDeck[a]; }).map(function (t) {
      var T = D.themes[t], n = inDeck[t], lvl = 0; T.th.forEach(function (x, k) { if (n >= x) lvl = k + 1; });
      var dots = T.th.map(function (x, k) { return '<i' + (k < lvl ? ' class="on"' : '') + ' title="Nivel ' + (k + 1) + ': ' + x + ' cartas"></i>'; }).join('');
      return '<div class="dl-row' + (ui.filters.indexOf(t) >= 0 ? ' on' : '') + '" style="--tc:' + T.color + '" data-act="filter" data-t="' + esc(t) + '" title="' + esc(t) + ' · ' + n + ' en el mazo"><span class="dl-ic">' + tic(t) + '</span><span class="dl-n">' + n + '</span><span class="dl-dots">' + dots + '</span></div>';
    }).join('');
    return '<aside class="deck-left panel"><h2>En tu mazo</h2>' + (rows || '<p class="mut">Sin sinergias todavía.</p>') + '</aside>';
  }
  function themeSide() {
    var inDeck = {};
    ui.deck.forEach(function (id) { var c = CARD[id]; (c.themes || []).forEach(function (t) { inDeck[t] = (inDeck[t] || 0) + 1; }); });
    return '<aside class="side-themes panel"><h2>Sinergias</h2><p class="mut" style="margin:0 0 .4rem">Pasa el cursor para ver el detalle. Pulsa para añadirla o quitarla del filtro.</p>' +
      Object.keys(D.themes).map(function (t) {
        var T = D.themes[t], on = ui.filters.indexOf(t) >= 0;
        var tip = '<div class="tip"><b>' + esc(t) + '</b>' + T.tx.map(function (x, k) { return '<p><b>' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') + '</div>';
        var short = T.tx[0].split(/[.:]/)[0];
        return '<div class="thm' + (on ? ' on' : '') + '" tabindex="0" data-act="filter" data-t="' + esc(t) + '">' + tagHtml(t) + ' <span class="cnt">niveles ' + T.th.join('/') + '</span><div class="sm">' + esc(short.length > 70 ? short.slice(0, 68) + '…' : short) + '</div>' + tip + '</div>';
      }).join('') + '</aside>';
  }
  function deckCard(c) {
    var inn = ui.deck.indexOf(c.id) >= 0, own = owns(c.id);
    return cardHtml(c, { lv: own ? lvOf(c.id) : 1, size: true, cls: (inn ? 'in' : '') + (own ? '' : ' locked'), extra: own ? '' : '<span class="lockb">' + ic('candado') + '</span>', attrs: 'data-act="toggle" data-id="' + c.id + '"', tag: 'button' });
  }
  function filtered() {
    var f = ui.filters, all = D.cards.concat(D.actions).filter(function (c) { return (!ui.onlyOwned || owns(c.id)) && (!ui.rar.length || ui.rar.indexOf(c.rarity) >= 0); });
    if (!f.length) return all;
    var th = f.filter(function (x) { return x !== '__act'; }), act = f.indexOf('__act') >= 0;
    return all.filter(function (c) {
      if (c.type === 'accion') return (act && (ui.fmode === 'any' || !th.length)) || (c.theme && ui.fmode === 'any' && th.indexOf(c.theme) >= 0) || (c.theme && ui.fmode === 'all' && th.length === 1 && th[0] === c.theme);
      if (ui.fmode === 'all') return th.every(function (t) { return c.themes.indexOf(t) >= 0; });
      return th.some(function (t) { return c.themes.indexOf(t) >= 0; });
    });
  }
  function renderDeck() {
    var used = deckSize(), troops = ui.deck.filter(function (id) { return CARD[id].type === 'tropa'; }).length, err = deckError();
    var segs = ''; for (var k = 0; k < CFG.deckBudget; k++) segs += '<i' + (k < used ? ' class="on"' : '') + '></i>';
    var h = head('deck', '' + ic('cartas') + ' Tu mazo') + '<div class="panel"><h2>Mazos guardados (máx. 3)</h2>' + slotsHtml() + '</div>';
    h += '<div class="panel"><div class="bar" style="margin:0"><span class="pill">Espacio <b>' + used + '/' + CFG.deckBudget + '</b></span><span class="pill">' + troops + ' tropas</span>' +
      '<button class="btn sec" data-act="randdeck">' + ic('dado') + ' Aleatorio</button><button class="btn sec" data-act="cleardeck">Vaciar</button>' +
      '<button class="btn" data-act="nav" data-to="play"' + (err ? ' disabled' : '') + '>' + ic('espadas') + ' Jugar</button></div><div class="meter">' + segs + '</div>' +
      (err ? '<div class="hint" style="color:var(--bad)">' + esc(err) + '</div>' : '') +
      '<p class="legend"><span class="coin inl">3</span> coste en oro para comprarla · <span class="pips inl"><i class="on"></i><i class="on"></i><i></i></span> espacio que ocupa en el mazo · <span class="sc a inl"><b>4</b></span> ataque · <span class="sc h inl"><b>6</b></span> vida</p></div>';
    h += '<div class="deck-layout">' + deckLeft() + '<div class="deck-main">';
    var cnt = function (t) { return themeCards(t).length; };
    h += '<div class="chips filt"><button class="chip' + (!ui.filters.length ? ' on' : '') + '" data-act="filterset" data-t="">Todas</button>' +
      Object.keys(D.themes).map(function (t) { return '<button class="chip' + (ui.filters.indexOf(t) >= 0 ? ' on' : '') + '" style="--tc:' + D.themes[t].color + '" data-act="filter" data-t="' + esc(t) + '">' + tic(t) + esc(t) + ' ' + cnt(t) + '</button>'; }).join('') +
      '<button class="chip' + (ui.filters.indexOf('__act') >= 0 ? ' on' : '') + '" data-act="filter" data-t="__act">Acciones</button></div>';
    h += '<div class="chips filt rarf">' + RARS.map(function (r) { var n = D.cards.concat(D.actions).filter(function (c) { return c.rarity === r; }).length; return '<button class="chip' + (ui.rar.indexOf(r) >= 0 ? ' on' : '') + '" style="--tc:' + RCOL[r] + '" data-act="rarfilter" data-r="' + r + '"><i class="rdot"></i>' + r + ' ' + n + '</button>'; }).join('') + '</div>';
    h += '<div class="bar" style="margin:.2rem 0 .6rem"><label class="grp"><input type="checkbox" data-act="groupr"' + (ui.groupRar ? ' checked' : '') + '> Agrupar por rareza</label><label class="grp"><input type="checkbox" data-act="group"' + (ui.group ? ' checked' : '') + '> Agrupar por sinergia</label><label class="grp"><input type="checkbox" data-act="onlyowned"' + (ui.onlyOwned ? ' checked' : '') + '> Solo mis cartas (' + ui.acct.owned.length + '/' + (D.cards.length + D.actions.length) + ')</label>';
    if (ui.filters.length > 1) h += '<span class="seg"><button class="' + (ui.fmode === 'any' ? 'on' : '') + '" data-act="fmode" data-m="any">Cualquiera de las elegidas</button><button class="' + (ui.fmode === 'all' ? 'on' : '') + '" data-act="fmode" data-m="all">Todas a la vez</button></span>';
    h += '</div>';
    var rf = function (c) { return !ui.rar.length || ui.rar.indexOf(c.rarity) >= 0; };
    if (ui.groupRar) {
      var lst = filtered();
      RARS.forEach(function (r) { var g = lst.filter(function (c) { return c.rarity === r; }); if (g.length) h += '<h3 class="gh"><span class="rtag" style="--tc:' + RCOL[r] + '">' + r + '</span> <span class="mut">' + g.length + '</span></h3><div class="deckgrid">' + g.map(deckCard).join('') + '</div>'; });
      if (!lst.length) h += '<p class="mut">Ninguna carta cumple los filtros.</p>';
    } else if (ui.group && !ui.filters.length) {
      Object.keys(D.themes).forEach(function (t) { var g = themeCards(t).filter(rf); if (g.length) h += '<h3 class="gh">' + tagHtml(t) + '</h3><div class="deckgrid">' + g.map(deckCard).join('') + '</div>'; });
      var ga = D.actions.filter(function (a) { return !a.theme; }).filter(rf); if (ga.length) h += '<h3 class="gh">Acciones</h3><div class="deckgrid">' + ga.map(deckCard).join('') + '</div>';
    } else {
      var list = filtered();
      h += list.length ? '<div class="deckgrid">' + list.map(deckCard).join('') + '</div>' : '<p class="mut">Ninguna carta cumple todas las sinergias elegidas.</p>';
    }
    h += '</div>' + themeSide() + '</div></div>';
    app.innerHTML = h;
  }

  // ---------- 1 vs 1 online ----------
  // El servidor guarda la partida; aquí se aplican tus acciones al momento y se envían en cola. Cada respuesta del servidor
  // trae tu vista (tú siempre eres p[0]) y sustituye a la copia local.
  var PV = { px: 'pvp', on: false, id: null, seat: 0, v: 0, rdy: [false, false], q: [], busy: false, tm: null, wait: null, seenFight: 0, seenAct: 0, names: ['Tú', 'Rival'], pend: null };
  function pvpReset() { clearTimeout(PV.tm); PV.on = false; PV.id = null; PV.q = []; PV.busy = false; PV.wait = null; PV.pend = null; PV.v = 0; PV.rdy = [false, false]; }
  function pvpSchedule(ms) { clearTimeout(PV.tm); PV.tm = setTimeout(pvpTick, ms); }
  function pvpTick() {
    var call;
    if (PV.on && ui.screen === 'game') {
      if (PV.busy || PV.q.length) return pvpSchedule(600);
      call = api(PV.px + 'Poll', { id: PV.id, v: PV.v });
    } else if (ui.screen === 'pvp' && PV.wait) {
      call = PV.wait.kind === 'search' ? api(PV.px + 'Search', { deck: ui.deck, mode: PV.mode }) : api(PV.px + 'Poll', {});
    } else return;
    call.then(pvpGot);
  }
  function pvpCancelWait() { PV.wait = null; clearTimeout(PV.tm); api(PV.px + 'Cancel'); }
  function pvpLeaveGame() { var s = ui.s; if (PV.id && s && !s.over) api(PV.px + 'Leave', { id: PV.id }); pvpReset(); }
  function pvs(op, a) { if (PV.on) pvpSend(op, a); }
  function pvpSend(op, a) { PV.q.push({ op: op, a: a || [] }); pvpPump(); }
  function pvpPump() {
    if (PV.busy || !PV.q.length) return;
    PV.busy = true;
    var m = PV.q.shift();
    api(PV.px + 'Op', { id: PV.id, op: m.op, a: m.a }).then(function (r) {
      PV.busy = false;
      if (PV.q.length) return pvpPump();
      pvpGot(r);
    });
  }
  function pvpGot(r) {
    var d = r.data || {};
    if (!r.ok) {
      if (PV.on) { if (d.error) ui.hint = d.error; return pvpSchedule(2500); }
      PV.wait = null; ui.msg = d.error || 'Sin conexión con el servidor.'; if (ui.screen === 'pvp') render(); return;
    }
    if (d.none) {
      if (PV.on) { pvpReset(); ui.hint = ''; ui.screen = 'home'; return render(); }
      return pvpSchedule(PV.wait && PV.wait.kind === 'search' ? 2000 : 1500);
    }
    if (d.gone) { PV.wait = null; ui.msg = 'La sala se ha cerrado.'; if (ui.screen === 'pvp') render(); return; }
    if (d.wait) {
      if (!PV.wait) PV.wait = { kind: d.code ? 'code' : 'search' };
      if (d.players && JSON.stringify(d.players) !== JSON.stringify(PV.wait.players)) { PV.wait.players = d.players; if (ui.screen === 'pvp') render(); }
      if (d.code && PV.wait.code !== d.code) { PV.wait.code = d.code; if (ui.screen === 'pvp') render(); }
      return pvpSchedule(PV.wait.kind === 'search' ? 2000 : 1500);
    }
    if (d.same) {
      var ch = PV.rdy[0] !== d.rdy[0] || PV.rdy[1] !== d.rdy[1];
      PV.rdy = d.rdy; if (d.dl && !ui.playing) ui.deadline = Date.now() + d.dl;
      if (ch && !ui.playing && !ui.busy) render();
      return pvpSchedule(1200);
    }
    if (d.s) { if (!PV.on) pvpBegin(d); else pvpAdopt(d); pvpSchedule(1200); }
  }
  function pvpBegin(d) {
    pvpReset(); PV.on = true; PV.id = d.id; PV.seat = d.seat; PV.names = d.names; PV.rdy = d.rdy; PV.v = d.v;
    PV.seenFight = d.s.fightN || 0; PV.seenAct = 0;
    d.s.acts.forEach(function (a) { PV.seenAct = Math.max(PV.seenAct, a.n); }); d.s.acts = [];
    ui.s = d.s; ui.screen = 'game'; ui.reward = d.reward || null; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = ''; ui.landed = null; ui.busy = false;
    announce(); ui.deadline = d.dl && !d.s.over ? Date.now() + d.dl : null; render(); pvpSchedule(1200);
  }
  function pvpAdopt(d) {
    if (d.v < PV.v) return; // respuesta de un poll antiguo: no pisar tus acciones
    if (PV.busy || PV.q.length) return;
    if (ui.playing || ui.busy) { PV.pend = d; return; }
    pvpApply(d);
  }
  function pvpApply(d) {
    var old = ui.s, ns = d.s; PV.pend = null; PV.v = d.v; PV.rdy = d.rdy; PV.names = d.names;
    ns.acts = ns.acts.filter(function (a) { return a.n > PV.seenAct; });
    ns.acts.forEach(function (a) { PV.seenAct = Math.max(PV.seenAct, a.n); });
    if (d.hint) ui.hint = d.hint;
    var newFight = (ns.fightN || 0) > PV.seenFight;
    var newRound = !old || ns.round !== old.round || ns.shopOpen !== old.shopOpen || (old.phase === 'post' && ns.phase === 'prep');
    ui.s = ns; if (d.reward) ui.reward = d.reward;
    ui.deadline = d.dl && !ns.over ? Date.now() + d.dl : null;
    if (ns.over && old && !old.over) api('me').then(function (r) { if (r.ok) setAcct(r.data.user); });
    if (newFight && ns.frames.length) { PV.seenFight = ns.fightN; ui.sel = null; ui.hint = ''; ui.deadline = null; return play(); }
    PV.seenFight = Math.max(PV.seenFight, ns.fightN || 0);
    if (newRound && !ns.over) { ui.sel = null; ui.hint = d.hint || ''; announce(); ui.deadline = d.dl ? Date.now() + d.dl : null; }
    render();
  }
  // Ventana central de Anime: elegir quién cede, quién recibe y qué cede
  function animeModal(P) {
    var an = P.mesa.filter(function (i) { return i && !i.dead && E.has(i, 'Anime'); }), A = ui.anm = ui.anm || { from: null, to: null };
    if (!an.some(function (i) { return i.uid === A.from; })) A.from = null;
    if (!an.some(function (i) { return i.uid === A.to; })) A.to = null;
    function row(role) {
      return '<div class="anc">' + an.map(function (i) {
        return '<div class="amc' + (A[role] === i.uid ? ' sel' : '') + (A[role === 'from' ? 'to' : 'from'] === i.uid ? ' dim' : '') + '" data-act="anpick" data-role="' + role + '" data-uid="' + i.uid + '">' + cardHtml(CARD[i.id], { lv: lvG(0, i.id), skin: skG(0, i.id), atk: E.atk(i), hp: i.hp, max: E.maxHp(i) }) + '</div>';
      }).join('') + '</div>';
    }
    var dbl = P.fl && P.fl.anime ? ' <b>(duplicado por Capítulo especial)</b>' : '', ready = A.from != null && A.to != null;
    return '<div class="overlay animeov"><div class="panel animed"><h2>' + ic('tele') + ' Anime · ceder estadísticas</h2><p class="mut">Te quedan <b>' + P.anime + '</b> cesiones esta ronda' + dbl + '. Elige quién cede y quién recibe.</p>' +
      '<div class="anrow"><div><h3>Cede</h3>' + row('from') + '</div><span class="anarrow">→</span><div><h3>Recibe</h3>' + row('to') + '</div></div>' +
      '<div class="btnrow"><button class="btn big" data-act="cede" data-stat="atk"' + (ready ? '' : ' disabled') + '>Ceder todo el ataque</button><button class="btn big" data-act="cede" data-stat="hp"' + (ready ? '' : ' disabled') + '>Ceder la vida (cae)</button></div>' +
      '<p class="mut sm">' + (ready ? 'Ataque: el que cede se queda a 0 de ataque. Vida: el que cede cae y el otro gana la mitad de su vida máxima.' : 'Pulsa una carta en cada columna.') + '</p>' +
      '<button class="btn sec" data-act="next">Continuar sin ceder ▶</button></div></div>';
  }
  function boardHtml(s) {
    if (!s.board) return '';
    return '<div class="synside panel vs4b"><h2>' + ic('grupo') + ' La mesa</h2>' + s.board.map(function (b) {
      return '<div class="b4' + (b.me ? ' me' : '') + (b.out ? ' out' : '') + (b.opp ? ' opp' : '') + '"><span class="n">' + esc(b.name) + '</span><span class="l">' + (b.out ? b.place + 'º' : b.life) + '</span><span class="t">' +
        (b.out ? 'eliminado' : b.me ? 'tú' : b.opp ? 'tu rival' : b.rest ? 'descansa' : '') + (!b.out && b.rdy ? ' ' + ic('check') : '') + '</span></div>';
    }).join('') + '</div>';
  }
  function renderPvp() {
    var w = PV.wait, v4 = ui.lobby === 'vs4', h = head('play', v4 ? '' + ic('grupo') + ' Versus de 4' : '' + ic('espadas') + (PV.mode === 'revive' ? ' Resurrección · 1 vs 1' : ' Jugador contra jugador'));
    if (w) {
      h += '<div class="panel pvpwait">' + (w.kind === 'code'
        ? '<h2>' + (v4 ? 'Sala de 4' : 'Sala creada') + '</h2><p class="mut">' + (v4 ? 'Pasa este código a 3 jugadores más. Cuando estéis los 4, empieza sola.' : 'Pásale este código a tu rival. Cuando lo escriba, la partida empieza sola.') + '</p><div class="pvpcode">' + esc(w.code || '·····') + '</div>'
        : '<h2>' + (v4 ? 'Buscando jugadores…' : 'Buscando rival…') + '</h2><p class="mut">' + (v4 ? 'Empieza al juntarse 4 jugadores buscando partida.' : 'Te emparejaremos con el primero que busque partida.') + '</p>') +
        (v4 && w.players ? '<div class="v4list"><b>' + w.players.length + '/4</b> ' + w.players.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="waitdots"><i></i><i></i><i></i></div><button class="btn sec" data-act="pvpcancel">Cancelar</button></div></div>';
      app.innerHTML = h; return;
    }
    h += '<p class="mut">Usarás tu mazo actual (' + deckSize() + '/' + CFG.deckBudget + '). ' + (v4 ? 'Empiezas con <b>30 de vida</b> y <b>14 de oro</b> (+3 por ronda). Ganas <b>+15</b> monedas por jugar y hasta <b>+45</b> más según tu puesto (1º +45, 2º +20, 3º +5). ' : 'Ganas <b>+15</b> monedas por partida y <b>+40</b> más si ganas. ') + 'Si abandonas o pierdes la conexión más de 60 s, quedas eliminado.</p>' +
      (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') + '<div class="pvpgrid">' +
      '<div class="panel"><h2>' + ic('dado') + ' Buscar rival</h2><p class="mut">' + (v4 ? 'Emparejamiento automático: empieza al juntarse 4 jugadores.' : 'Emparejamiento automático con cualquier jugador que esté buscando.') + '</p><button class="btn big" data-act="pvpsearch">Buscar partida</button></div>' +
      '<div class="panel"><h2>' + ic('espadas') + ' Crear sala</h2><p class="mut">' + (v4 ? 'Te damos un código para que se unan otros 3 jugadores.' : 'Te damos un código para que tu amigo se una.') + '</p><button class="btn big" data-act="pvpcreate">Crear sala</button></div>' +
      '<div class="panel"><h2>' + ic('puerta') + ' Unirme con código</h2><p class="mut">Escribe el código de 5 letras que te han pasado.</p><input id="pvp-code" class="pvpin" maxlength="5" autocomplete="off" placeholder="ABCDE"><button class="btn big" data-act="pvpjoin">Unirme</button></div>' +
      '</div></div>';
    app.innerHTML = h;
  }

  // ---------- Partida ----------
  function inst(P, uid) { return P.mesa.filter(function (i) { return i && i.uid === uid; })[0]; }
  function startGame() {
    var seed = Math.floor(Math.random() * 1e9), r = E.mulberry32(seed + 7);
    var mylv = {}; ui.deck.forEach(function (id) { var l = lvOf(id); if (l > 1) mylv[id] = l; });
    var mysk = {}; ui.deck.forEach(function (id) { var k = ui.acct && ui.acct.skinSel && ui.acct.skinSel[id]; if (k && ui.acct.skins.indexOf(k) >= 0) mysk[id] = k; });
    ui.s = E.newGame(ui.deck, E.aiDeck(r), seed, { lv: [mylv, {}], sk: [mysk, {}], mode: ui.mode });
    ui.reward = null; api('gameStart');
    ui.screen = 'game'; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = ''; ui.landed = null; ui.busy = false;
    announce(); render();
  }
  function orb(kind, val, max, label, idx) {
    var p = max ? Math.max(0, Math.min(100, val / max * 100)) : 100;
    return '<div class="orb ' + kind + '" data-orb="' + (idx == null ? '' : idx) + '" style="--p:' + p + '%" title="' + label + '"><b>' + Math.max(0, val) + '</b><span>' + label + '</span></div>';
  }
  function synergyHtml(P, foe) {
    var c = E.themeCounts(P), keys = Object.keys(c).filter(function (t) { return !foe || E.tierOf(t, c[t]) > 0; }).sort(function (a, b) { return E.tierOf(b, c[b]) - E.tierOf(a, c[a]) || c[b] - c[a]; });
    var h = '<div class="synside panel' + (foe ? ' foe' : '') + '"><h2>' + (foe ? '' + ic('aviso') + ' Sinergias del RIVAL' : 'Sinergias') + '</h2>';
    if (!keys.length) return h + '<p class="mut">' + (foe ? 'El rival no tiene sinergias activas.' : 'Coloca tropas en mesa o mano.') + '</p></div>';
    h += '<div class="synlist">' + keys.map(function (t) {
      var T = D.themes[t], tier = E.tierOf(t, c[t]), nxt = T.th[tier];
      var tip = '<div class="tip"><b>' + esc(t) + '</b>' + T.tx.map(function (x, k) { return '<p' + (k + 1 === tier ? ' class="cur"' : '') + '><b>' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') + '</div>';
      return '<div class="syn-row t' + tier + '" style="--tc:' + T.color + '" tabindex="0"><div class="hexa"><b>' + c[t] + '</b></div><div class="si"><b>' + esc(t) + '</b><div class="th">' +
        T.th.map(function (n, k) { return '<i class="' + (k < tier ? 'on' : '') + '">' + n + '</i>'; }).join('') + '</div></div><span class="need">' + (nxt ? c[t] + '/' + nxt : ic('check') + ' máx') + '</span>' + tip + '</div>';
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
        if (sel && sel.k === 'act' && CARD[P0.hand[sel.i].id].target === 'ally' && E.validTarget(CARD[P0.hand[sel.i].id], I || v)) o.cls += ' tgtable';
        if (s.phase === 'prep' && !ui.playing && I && E.has(I, 'Voley') && !s.shopOpen && (E.tiers(P0).Voley || 0) >= 1) {
          var m = P0.voley[v.uid] || 'atk';
          under += '<div class="mini"><button data-act="voley" data-uid="' + v.uid + '" data-m="atk" class="' + (m === 'atk' ? 'on' : '') + '">' + ic('espadas') + ' Ataque</button><button data-act="voley" data-uid="' + v.uid + '" data-m="def" class="' + (m === 'def' ? 'on' : '') + '">' + ic('escudo') + ' Defensa</button></div>';
        }
        if (shop && I && E.has(I, 'Lol')) under += '<div class="mini"><button data-act="sell" data-from="mesa" data-i="' + k + '" title="Vender y recuperar su valor">' + ic('moneda') + ' Vender ' + E.sellValue(I) + '</button></div>';
        if (shop && I && !E.has(I, 'Lol')) under += '<div class="mini"><button data-act="retire" data-slot="' + k + '">' + ic('deshacer') + ' Retirar</button><button data-act="sell" data-from="mesa" data-i="' + k + '" title="Vender y recuperar su valor">' + ic('moneda') + ' Vender ' + E.sellValue(I) + '</button></div>';
      } else {
        o.attrs += ' data-act="foe"';
        if (prep && sel && (sel.k === 'mine' || (sel.k === 'act' && CARD[s.p[0].hand[sel.i].id].target === 'enemy'))) o.cls += ' tgtable';
        if (prep && aim[v.uid]) o.extra = '<span class="aim">' + ic('diana') + '×' + aim[v.uid] + '</span>';
      }
      o.gl = I ? I.gl : 1; o.lv = lvG(side, v.id); o.skin = skG(side, v.id); h += '<div class="cw">' + cardHtml(c, o) + under + '</div>';
    });
    return h + '</div>';
  }
  var REFRESH_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  function renderGame() {
    var s = ui.s, view = ui.view || E.viewOf(s), P = s.p[0], R = s.p[1];
    var shopMode = s.shopOpen && !ui.playing, shop = shopMode && s.phase === 'prep', prep = s.phase === 'prep' && !ui.playing && !s.shopOpen;
    var pend = prep ? E.pendingTargets(s).length : 0, hasT = Object.keys(P.target).length > 0;
    var h = '<div class="gwrap' + (shopMode ? ' shopmode' : '') + '"><div class="top"><div><h1>Ronda ' + s.round + ' · ' + (s.shopOpen ? '' + ic('carrito') + ' Tienda' + (s.round === 1 ? ' inicial' : '') : '' + ic('espadas') + ' Combate') + (!s.shopOpen ? ' <span class="mut">· ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') + '</span>' : '') + '</h1></div><div><button class="lnk" data-act="menu" data-to="deck">' + ic('cartas') + ' Mazo</button> · <button class="lnk" data-act="menu" data-to="home">' + ic('casa') + ' Menú</button></div></div>' + timerHtml(prep || shop) + '';
    h += '<div class="gmain"><aside class="gl">' + boardHtml(s) + synergyHtml(P) + '</aside><section class="gc"><div class="board" id="board">';
    var ML = s.maxLife || CFG.life;
    if (s.vs4 && s.spec && ui.playing) h += '<div class="v4spec">' + ic('ojo') + ' Descansas: estás viendo el duelo <b>' + esc(s.spec[0]) + '</b> contra <b>' + esc(s.spec[1]) + '</b></div>';
    else if (s.vs4 && !shopMode && !s.rest) h += '<div class="v4vs"><span>Duelo contra</span><b>' + esc(PV.names[1]) + '</b></div>';
    if (!shopMode && (!s.rest || (s.spec && ui.playing))) h += '<div class="hud top">' + orb('life', view.life[1], ML, s.spec && ui.playing ? esc(s.spec[1]) : PV.on ? esc(PV.names[1]) : 'Rival', 1) + '</div>' + mesaRow(1, view, s, false) + '<div class="gap"></div>';
    h += mesaRow(0, view, s, true);
    // HUD inferior: vida, oro y acciones
    var acts = '';
    if (ui.playing) acts = '<button class="btn sec" data-act="skip">' + ic('avance') + ' Saltar animación</button>';
    else if (s.phase === 'over') acts = '';
    else if (PV.on && PV.rdy[0]) acts = '<div class="hint">' + ic('reloj') + ' ' + (s.vs4 ? 'Esperando a los demás…' : 'Esperando al rival…') + '</div><div class="waitdots"><i></i><i></i><i></i></div>';
    else if (shop) {
      var any = P.mesa.some(Boolean) || P.hand.length;
      acts = '<div class="hint">' + esc(ui.hint || (any ? 'Pulsa una carta para comprarla. Arrastra una tropa de la mesa a tu mano para retirarla.' : 'Compra al menos una tropa.')) + '</div><button class="btn big" data-act="endshop"' + (any ? '' : ' disabled') + '>Finalizar fase de compra ▶</button>';
    } else if (prep) {
      var msg = ui.hint || (s.rest ? 'Descansas esta ronda: prepara tu mesa.' : !P.mesa.some(Boolean) ? 'Coloca tropas de tu mano en la mesa.' : pend ? 'Pulsa una tropa tuya y después la rival a la que atacará.' : 'Todos los objetivos elegidos.');
      if (pend && P.mesa.some(Boolean)) msg = (ui.hint ? ui.hint + ' · ' : '') + 'Faltan ' + pend + ' por elegir objetivo.';
      acts = '<div class="hint">' + esc(msg) + '</div><div class="btnrow"><button class="btn big" data-act="fight"' + (pend || (!P.mesa.some(Boolean) && E.mesaTroops(R).length) ? ' disabled' : '') + '>' + ic('espadas') + (s.rest ? ' ¡Listo!' : ' ¡Combatir!') + '</button><button class="btn sec sm" data-act="undo"' + (hasT ? '' : ' disabled') + ' title="Quitar todos los objetivos elegidos">' + ic('deshacer') + ' Deshacer</button></div>';
    } else if (s.phase === 'post') acts = ui.busy ? '' : '<div class="hint">Puedes ceder estadísticas Anime antes de seguir.</div><button class="btn big" data-act="next">Continuar ▶</button>';
    if (PV.on && PV.rdy[1] && !PV.rdy[0] && (shop || prep || s.phase === 'post')) acts = '<div class="hint rivrdy">' + ic('aviso') + ' El rival ya está listo.</div>' + acts;
    h += '<div class="hud bottom">' + orb('life', view.life[0], ML, s.spec && ui.playing ? esc(s.spec[0]) : 'Tu vida', 0) + orb('gold', P.gold, 0, 'Tu oro') + '<div class="acts">' + acts + '</div></div></div>';

    // Mano
    h += '<div class="handwrap' + (ui.dragMesa ? ' dropzone' : '') + '"><div class="hl">Tu mano ' + P.hand.length + (s.mode === 'revive' ? '' : '/' + CFG.handMax) + '</div><div class="hand">';
    P.hand.forEach(function (i, k) {
      var c = CARD[i.id], sel = ui.sel && (ui.sel.k === 'hand' || ui.sel.k === 'act') && ui.sel.i === k;
      h += '<div class="cw">' + cardHtml(c, { gl: i.gl, lv: lvG(0, i.id), skin: skG(0, i.id), atk: E.atk(i), hp: i.hp, max: E.maxHp(i), cls: 'hcard' + (sel ? ' sel' : ''), attrs: 'data-act="hand" data-i="' + k + '" title="Pulsa o arrastra a la mesa"', tag: 'button' }) + (shop ? '<div class="mini"><button data-act="sell" data-from="hand" data-i="' + k + '" title="Vender y recuperar su valor">' + ic('moneda') + ' Vender ' + E.sellValue(i) + '</button></div>' : '') + '</div>';
    });
    for (var f = P.hand.length; f < CFG.handMax; f++) h += '<div class="cw"><div class="slot">—</div></div>';
    h += '</div></div>';

    // Tienda (bajo la mano): pulsar una carta para comprarla
    if (shop) {
      var t = E.tiers(P), rc = E.refreshCost(s, 0);
      h += '<div class="shopwrap"><div class="hl">' + ic('carrito') + ' Tienda' + (s.round === 1 ? ' (solo Comunes)' : '') + ' · pulsa una carta para comprarla</div><div class="shoprow">';
      for (var k = 0; k < CFG.shopOffers; k++) {
        var id = P.offers[k];
        if (!id) { h += '<div class="cw"><div class="slot">Vendida</div></div>'; continue; }
        var c2 = CARD[id], mg = c2.type === 'tropa' && E.willMerge(P, c2.id), cant = P.gold < c2.cost || (P.hand.length >= E.handCap(s) && !mg);
        h += '<div class="cw">' + cardHtml(c2, { lv: lvG(0, c2.id), tag: 'button', cls: 'offer' + (cant ? ' cant' : '') + (mg ? ' mergeable' : ''), attrs: 'data-act="buy" data-i="' + k + '" title="Comprar por ' + c2.cost + ' de oro"' }) + '</div>';
      }
      h += '<div class="refwrap"><button class="refresh" data-act="refresh" title="Actualizar tienda (' + rc + ' oro)"' + (P.gold < rc ? ' disabled' : '') + '>' + REFRESH_SVG + '</button><span class="rlabel">Actualizar · ' + rc + ' oro</span></div></div>';
      h += '</div>';
    }
    h += '</section><aside class="gr">';
    h += '<div></div>';
    h += '<div class="foesyn">' + (s.shopOpen ? '<div class="synside panel foe locked"><h2>' + ic('aviso') + ' Sinergias del RIVAL</h2><p class="mut">' + ic('candado') + ' Ocultas durante la tienda. Se revelan cuando empieza el combate.</p></div>' : synergyHtml(R, true)) + '</div>';
    var shown = s.log.slice(-14);
    h += '<div class="panel logp"><h2>Registro</h2><div class="log" id="log">' + shown.map(function (l, n) { return '<div' + (n === shown.length - 1 ? ' class="cur"' : '') + '>' + esc(l.text) + '</div>'; }).join('') + '</div></div></aside></div>';
    if (s.phase === 'over' && !ui.playing) {
      var win = s.winner === 0;
      if (!s.rep && PV.on) s.rep = 1;
      if (!s.rep) {
        s.rep = 1; ui.reward = null;
        api('gameFinish', { won: win, rounds: s.round }).then(function (r) {
          ui.reward = r.ok ? r.data : { gained: 0, err: 1 };
          if (r.ok) setAcct(r.data.user);
          if (ui.s === s && ui.screen === 'game' && s.phase === 'over' && !ui.playing) render();
        });
      }
      var pt = ui.reward && ui.reward.pts ? '<p class="' + (ui.reward.pts > 0 ? 'reward' : 'mut') + '">' + (ui.reward.pts > 0 ? '+' : '') + ui.reward.pts + ' puntos de clasificación</p>' : '';
      var rw = pt + (ui.reward ? (ui.reward.gained > 0 ? '<p class="reward">+' + ui.reward.gained + ' ' + ic('moneda') + ' monedas</p>' : '<p class="mut">Sin monedas esta vez (partida muy corta o límite diario alcanzado).</p>') : '<p class="mut">Calculando recompensa…</p>');
      var conf = ''; if (win) for (var q = 0; q < 36; q++) conf += '<i style="left:' + (q * 2.8 + (q % 3)) + '%;--d:' + ((q * 37) % 100) / 100 * 1.2 + 's;--c:' + ['#ffc533', '#ff6b8b', '#4f9dff', '#38d39f', '#a78bfa'][q % 5] + '"></i>';
      h += '<div class="overlay ' + (win ? 'owin' : 'olose') + '">' + (win ? '<div class="confetti">' + conf + '</div>' : '') + '<div class="panel over"><div class="obig">' + (win ? '' + ic('trofeo') + '' : '' + ic('corazonroto') + '') + '</div><h2>' + (win ? '¡Victoria!' : (s.vs4 ? 'Eliminado · puesto ' + s.place + 'º de 4' : 'Derrota')) + '</h2><p class="mut">' + esc(s.reason) + ' · ronda ' + s.round + '</p>' + rw + '<button class="btn big" data-act="' + (PV.on ? (PV.px === 'vs4' ? 'openvs4' : 'openpvp') : 'play') + '">' + (PV.on ? 'Otra partida' : 'Jugar otra vez') + '</button> <button class="btn sec" data-act="menu" data-to="deck">Cambiar mazo</button> <button class="btn sec" data-act="menu" data-to="home">Menú</button></div></div>';
    }
    if (s.phase === 'post' && !s.over && !ui.playing && !ui.busy && P.anime > 0 && !(PV.on && PV.rdy[0])) h += animeModal(P);
    h += '</div>';
    app.innerHTML = h;
    document.body.classList.toggle('shopbg', !!shopMode);
    ui.landed = null;
    var lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight;
    strikeVars(); drawArrows(); fxBanner(); applyFloats(); flushActs();
  }

  // ---------- Anuncio de acciones jugadas (tuyas y del rival) ----------
  function flushActs() {
    var s = ui.s; if (!s || !s.acts || !s.acts.length) return;
    var q = s.acts.splice(0), now = Date.now();
    q.forEach(function (a) {
      // cola única: cada anuncio espera a que termine el anterior (y el cartel de ronda), sea tuyo o del rival
      var at = Math.max(now, ui.splashUntil || 0, ui.actNext || 0);
      ui.actNext = at + 1500;
      setTimeout(function () { if (ui.s === s && ui.screen === 'game') showActFx(a); }, at - now);
    });
  }
  function showActFx(a) {
    var c = CARD[a.id], el = document.createElement('div');
    el.className = 'actfx ' + (c.foe ? 'foe' : 'ally') + (a.p === 0 ? ' mine' : ' theirs');
    el.innerHTML = '<div class="afburst"></div><div class="afw">' + cardHtml(c, {}) + '</div><div class="aft">' + (a.p === 0 ? 'Juegas ' : 'El rival juega ') + esc(c.name) + '</div><div class="afs">' + esc(a.res) + '</div>';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 1500);
  }

  // ---------- Temporizador de objetivos ----------
  var TIME_LIMIT = 45, SHOP_LIMIT = 60;
  function limit() { return ui.s && ui.s.shopOpen ? SHOP_LIMIT : TIME_LIMIT; }
  function remaining() { return ui.deadline ? Math.max(0, ui.deadline - Date.now()) : 0; }
  function timerHtml(prep) {
    if (!prep || !ui.deadline) return '';
    var L = limit(), sec = Math.min(L, Math.ceil(remaining() / 1000));
    return '<div class="timer' + (sec <= 10 ? ' low' : '') + '" id="timer"><span class="tl">' + ic('reloj') + ' ' + (ui.s.shopOpen ? 'Tienda' : 'Elige objetivos') + '</span><b id="tsec">' + sec + '</b><span>s</span><div class="tbar"><i id="tfill" style="width:' + Math.min(100, remaining() / (L * 10)) + '%"></i></div></div>';
  }
  function timeUp() {
    var s = ui.s; ui.deadline = null;
    if (PV.on) { pvpSchedule(50); return; }
    if (!s || s.over || s.phase !== 'prep') return;
    if (s.shopOpen) { E.endShop(s); ui.sel = null; ui.hint = ''; showSplash({ kind: 'end', title: ic('reloj') + ' ¡TIEMPO!', sub: 'Se cierra la tienda' }); announce(); return render(); }
    if (E.pendingTargets(s).length) { E.forfeit(s, 0, 'Se acabó el tiempo para elegir objetivos.'); ui.sel = null; showSplash({ kind: 'combat', title: ic('reloj') + ' ¡TIEMPO AGOTADO!', sub: 'No elegiste objetivos a tiempo' }); render(); return; }
    E.fight(s); ui.sel = null; ui.hint = ''; play();
  }
  setInterval(function () {
    var s = ui.s;
    if (!s || ui.screen !== 'game' || !ui.deadline || ui.playing || ui.busy || s.over || s.phase !== 'prep') return;
    var rem = remaining(), sec = Math.min(limit(), Math.ceil(rem / 1000)), t = document.getElementById('tsec');
    if (t) { t.textContent = sec; document.getElementById('timer').classList.toggle('low', sec <= 10); document.getElementById('tfill').style.width = Math.min(100, rem / (limit() * 10)) + '%'; }
    if (rem <= 0) timeUp();
  }, 200);

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

    // ---------- Efectos de sinergia: cartel, bola, números flotantes ----------
  var FXICON = { pereza: 'sofa', duo: 'duo', novia: 'corazon', pueblo: 'pueblo', nini: 'sofa', voley: 'voley', comeback: 'fuego', tilt: 'enfado', koi: 'trofeo', trabajo: 'maletin' };
  function fxBanner() {
    var fx = ui.playing && ui.hl && ui.hl.fx; if (!fx) return;
    var b = document.getElementById('board'), row = b && b.querySelector('.row4.side' + fx.side); if (!row) return;
    var br = b.getBoundingClientRect(), rr = row.getBoundingClientRect(), el = document.createElement('div');
    el.className = 'fxb t-' + fx.type + (fx.neg ? ' neg' : '');
    el.style.top = (rr.top - br.top + rr.height / 2) + 'px'; el.style.left = (rr.left - br.left + rr.width / 2) + 'px';
    var icon = fx.type === 'pokemon' ? '<div class="pball k' + fx.ball + '"></div><div class="pring"></div>' : '<div class="fxi">' + ic(fx.type === 'novia' && fx.neg ? 'humo' : (FXICON[fx.type] || 'brillo')) + '</div>';
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
        if (da) parts.push((da > 0 ? '+' : '') + da + '' + ic('espadas') + ''); if (dm) parts.push((dm > 0 ? '+' : '') + dm + '' + ic('corazon') + '');
        if (parts.length) out.push({ uid: +u, text: parts.join(' '), cls: (da < 0 || dm < 0) && !(da > 0 || dm > 0) ? 'neg' : 'pos' });
      });
    }
    var hl = f.hl;
    if (hl && hl.tgt && hl.dmg > 0) out.push({ uid: hl.tgt, text: '-' + hl.dmg, cls: 'dmg', delay: .34 });
    if (hl && hl.life != null && hl.dmg > 0) out.push({ orb: hl.life, text: '-' + hl.dmg, cls: 'dmg', delay: .3 });
    if (hl && hl.plife != null && hl.pdmg > 0) out.push({ orb: hl.plife, text: '-' + hl.pdmg, cls: 'dmg', delay: .6 });
    if (hl && hl.rec > 0) out.push({ uid: hl.att, text: '-' + hl.rec, cls: 'dmg', delay: .5 });
    if (hl && hl.retarget) out.push({ uid: hl.att, text: '¡Su objetivo había caído!', cls: 'info' });
    return out;
  }
  function applyFloats() {
    (ui.floats || []).forEach(function (fl) {
      var el = fl.orb != null ? document.querySelector('[data-orb="' + fl.orb + '"]') : document.querySelector('[data-cuid="' + fl.uid + '"]');
      if (!el) return;
      var sp = document.createElement('span'); sp.className = 'flt ' + fl.cls; sp.innerHTML = fl.text; if (fl.delay) sp.style.animationDelay = fl.delay + 's';
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

  // ---------- Navegación por URL (#/mazo, #/tienda…): al recargar se vuelve a la misma sección ----------
  var ROUTES = { home: 'inicio', modes: 'jugar', pvp: 'jugar', game: 'jugar', deck: 'mazo', packs: 'tienda', themes: 'sinergias', rules: 'normas' };
  var ROUTE_SCREEN = { inicio: 'home', jugar: 'modes', mazo: 'deck', tienda: 'packs', sinergias: 'themes', normas: 'rules' };
  var ROUTE_TITLE = { home: 'Inicio', modes: 'Jugar', pvp: 'Jugar', game: 'Partida', deck: 'Mazo', packs: 'Tienda', themes: 'Sinergias', rules: 'Normas' };
  function hashScreen() { var m = /^#\/([a-z]+)/.exec(location.hash || ''); return m && ROUTE_SCREEN[m[1]] || null; }
  function landing() { var sc = hashScreen() || 'home'; if (sc === 'modes' && deckError()) sc = 'deck'; return sc; }
  function syncHash() {
    if (!ui.acct || !ROUTES[ui.screen]) { if (!ui.acct) document.title = 'Juego de Cartas'; return; }
    document.title = ROUTE_TITLE[ui.screen] + ' · Juego de Cartas';
    var want = '#/' + ROUTES[ui.screen];
    if (location.hash !== want) { try { history.pushState(null, '', want); } catch (e) { location.hash = want; } }
  }
  window.addEventListener('hashchange', function () { onRoute(); });
  window.addEventListener('popstate', function () { onRoute(); });
  function onRoute() {
    if (!ui.acct) return;
    var sc = hashScreen();
    if (!sc || ROUTES[ui.screen] === ROUTES[sc]) return;
    if (ui.screen === 'game' && ui.s && !ui.s.over) { syncHash(); return; } // en plena partida no se sale con el botón atrás
    clearTimeout(timer); ui.playing = false;
    if (sc === 'modes' && deckError()) sc = 'deck';
    ui.screen = sc; ui.msg = ''; window.scrollTo(0, 0); render();
  }
  function render() {
    document.body.classList.remove('shopbg');
    if (PV.wait && ui.screen !== 'pvp') pvpCancelWait();
    var f = { home: renderHome, deck: renderDeck, rules: renderRules, themes: renderThemes, modes: renderModes, pvp: renderPvp, login: renderLogin, starter: renderStarter, packs: renderPacks, boot: renderBoot }[ui.screen];
    if (f) f(); else renderGame();
    syncHash();
  }

  // ---------- Animación del combate ----------
  var timer = null;
  function showSplash(o) {
    var el = document.getElementById('splash');
    if (!el) { el = document.createElement('div'); el.id = 'splash'; document.body.appendChild(el); }
    el.className = 'splash k-' + o.kind; el.innerHTML = '<div class="band"><div class="st">' + o.title + '</div><div class="ss">' + (o.sub || '') + '</div></div>';
    void el.offsetWidth; el.classList.add('show'); ui.splashUntil = Date.now() + 1500;
  }
  function announce() {
    var s = ui.s; ui.anm = null; if (!s || s.over) { ui.deadline = null; return; }
    ui.deadline = Date.now() + (s.shopOpen ? SHOP_LIMIT : TIME_LIMIT) * 1000 + 1400; // 1,4 s de cartel de ronda
    if (s.shopOpen) showSplash({ kind: 'shop', title: '' + ic('carrito') + ' ¡RONDA DE TIENDA!', sub: s.round === 1 ? 'Compra tus primeras tropas · no hay combate' : 'Compra, coloca y retira tropas · no hay combate' });
    else showSplash({ kind: 'combat', title: '' + ic('espadas') + ' RONDA ' + s.round, sub: s.first === 0 ? 'Atacas primero' : 'Ataca primero el rival' });
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
      showSplash({ kind: 'end', title: 'FIN DE LA RONDA ' + s.round, sub: s.spec ? '' : 'Tropas en pie: tú ' + a + ' · rival ' + b });
      render();
      setTimeout(function () {
        ui.busy = false;
        if (ui.s !== s || ui.screen !== 'game') return;
        if (PV.on) { PV.rdy[0] = true; ui.sel = null; pvpSend('ready'); if (PV.pend) { PV.pend.rdy = [true, PV.pend.rdy[1]]; return pvpApply(PV.pend); } return render(); }
        E.nextRound(s); ui.sel = null; ui.hint = ''; announce(); render();
      }, 1500);
      return;
    }
    render();
    if (PV.on && PV.pend) pvpApply(PV.pend);
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
    if (act === 'acctmenu') { var w = el.closest('.acctw'); if (w) w.classList.toggle('open'); return; }
    if (act === 'logout') return logout();
    if (act === 'register') {
      var rn = document.getElementById('lg-name').value.trim(), rp = document.getElementById('lg-pin').value; ui.lgName = rn;
      if (rn.length < 3 || rn.length > 16) { ui.msg = 'El nombre debe tener entre 3 y 16 caracteres.'; return render(); }
      if (!/^\d{4}$/.test(rp)) { ui.msg = 'El PIN son 4 dígitos.'; return render(); }
      ui.lgPin = rp; ui.msg = ''; ui.screen = 'starter'; return render();
    }
    if (act === 'adminstarter' || act === 'adminall') {
      return api(act, { starter: el.dataset.t }).then(function (r) {
        if (!r.ok) { ui.msg = (r.data && r.data.error) || 'Error.'; return render(); }
        setAcct(r.data.user); ui.deck = []; ui.slots = [null, null, null]; saveDeck(); try { localStorage.removeItem(lk('slots')); } catch (e) {}
        ui.msg = act === 'adminall' ? 'Colección completa restaurada.' : 'Colección reiniciada como jugador nuevo con el mazo «' + el.dataset.t + '» (' + r.data.user.owned.length + ' cartas).'; render();
      });
    }
    if (act === 'backlogin') { ui.screen = 'login'; ui.lgPin = ''; ui.msg = ''; return render(); }
    if (act === 'login' || act === 'pickstarter') {
      var nm = act === 'login' ? document.getElementById('lg-name').value : ui.lgName, pn = act === 'login' ? document.getElementById('lg-pin').value : ui.lgPin; ui.lgName = nm;
      return api(act === 'login' ? 'login' : 'register', { name: nm, pin: pn, starter: el.dataset.t }).then(function (r) {
        if (!r.ok) { ui.msg = (r.data && r.data.error) || 'No se pudo entrar.'; ui.screen = 'login'; return render(); }
        try { localStorage.setItem('cartas_tok', r.data.token); } catch (e) {}
        ui.msg = ''; ui.lgPin = ''; setAcct(r.data.user); loadLocal(); ui.screen = landing(); render();
      });
    }
    if (act === 'newstog') { ui.newsOpen = !ui.newsOpen; return render(); }
    if (act === 'skinbuy') return api('skinBuy', { id: el.dataset.skin }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); ui.msg = r.ok ? '' : (r.data.error || ''); render(); });
    if (act === 'skinequip') return api('skinEquip', { id: el.dataset.skin, card: el.dataset.card }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); render(); });
    if (act === 'daily') { return api('daily').then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); ui.msg = r.ok ? '' : (r.data.error || ''); render(); }); }
    if (act === 'openpack') {
      if (ui.pack) return; ui.msg = ''; ui.pack = { cards: null, rev: [] }; render();
      var t0 = Date.now(), pk0 = ui.pack;
      return api('open').then(function (r) {
        var wait = Math.max(0, 1300 - (Date.now() - t0));
        setTimeout(function () {
          if (ui.pack !== pk0) return;
          if (!r.ok) { ui.pack = null; ui.msg = (r.data && r.data.error) || 'No se pudo abrir.'; if (r.data && r.data.user) setAcct(r.data.user); return render(); }
          pk0.cards = r.data.cards; pk0.rev = r.data.cards.map(function () { return false; }); pk0.stage = 'rip'; setAcct(r.data.user); render();
          setTimeout(function () { if (ui.pack === pk0) { pk0.stage = 'reveal'; render(); } }, RIP_MS(pk0));
        }, wait);
      });
    }
    if (act === 'flipcard') { var fi = +el.dataset.i; if (ui.pack && ui.pack.cards) { ui.pack.rev[fi] = true; el.classList.add('flipped'); packHint(); } return; }
    if (act === 'flipall') { if (ui.pack && ui.pack.cards) { ui.pack.rev = ui.pack.rev.map(function () { return true; }); app.querySelectorAll('.pcard').forEach(function (n, k) { setTimeout(function () { n.classList.add('flipped'); }, k * 140); }); packHint(); } return; }
    if (act === 'packbg') { if (ui.pack && ui.pack.cards && ui.pack.stage === 'reveal' && ui.pack.rev.every(Boolean)) { ui.pack = null; render(); } return; }
    if (act === 'nav') {
      clearTimeout(timer); ui.playing = false;
      if (el.dataset.to === 'play') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); ui.screen = 'modes'; window.scrollTo(0, 0); return render(); }
      ui.screen = el.dataset.to; ui.msg = ''; window.scrollTo(0, 0); return render();
    }
    if (act === 'filter') { var t = el.dataset.t, k0 = ui.filters.indexOf(t); if (k0 >= 0) ui.filters.splice(k0, 1); else ui.filters.push(t); ui.screen = 'deck'; var y0 = window.scrollY; renderDeck(); window.scrollTo(0, y0); return; }
    if (act === 'filterset') { ui.filters = el.dataset.t ? [el.dataset.t] : []; ui.screen = 'deck'; window.scrollTo(0, 0); return render(); }
    if (act === 'fmode') { ui.fmode = el.dataset.m; return renderDeck(); }
    if (act === 'group') { ui.group = el.checked; if (ui.group) ui.groupRar = false; return render(); }
    if (act === 'groupr') { ui.groupRar = el.checked; if (ui.groupRar) ui.group = false; return render(); }
    if (act === 'rarfilter') { var rr = el.dataset.r, ri = ui.rar.indexOf(rr); if (ri >= 0) ui.rar.splice(ri, 1); else ui.rar.push(rr); var y1 = window.scrollY; renderDeck(); window.scrollTo(0, y1); return; }
    if (act === 'onlyowned') { ui.onlyOwned = el.checked; return render(); }
    if (act === 'toggle') {
      var id = el.dataset.id, k = ui.deck.indexOf(id);
      if (!owns(id)) ui.msg = 'Aún no tienes esta carta: consíguela en la tienda.';
      else if (k >= 0) ui.deck.splice(k, 1);
      else if (deckSize() + CARD[id].size <= CFG.deckBudget) ui.deck.push(id);
      else ui.msg = 'No cabe: el mazo ya está lleno de espacio.';
      saveDeck(); var y = window.scrollY; renderDeck(); window.scrollTo(0, y); return;
    }
    if (act === 'randdeck') { ui.deck = E.randomDeck(Math.random, ui.acct.owned); saveDeck(); ui.msg = ''; return renderDeck(); }
    if (act === 'cleardeck') { ui.deck = []; saveDeck(); ui.msg = ''; return renderDeck(); }
    if (act === 'slot-save') {
      if (!ui.deck.length) return;
      var nm = (ui.slotName || '').trim() || 'Mazo ' + (ui.slotTo + 1);
      ui.slots[ui.slotTo] = { name: nm, ids: ui.deck.slice() }; saveSlots(); ui.msg = '«' + nm + '» guardado en el hueco ' + (ui.slotTo + 1) + '.'; ui.slotName = ''; return renderDeck();
    }
    if (act === 'slot-load') { var sl = ui.slots[+el.dataset.i]; if (sl) { ui.deck = sl.ids.filter(owns); saveDeck(); ui.slotTo = +el.dataset.i; ui.msg = 'Cargado «' + sl.name + '».'; } return renderDeck(); }
    if (act === 'slot-del') { var di = +el.dataset.i; if (ui.slots[di]) { ui.msg = 'Borrado «' + ui.slots[di].name + '».'; ui.slots[di] = null; saveSlots(); } return renderDeck(); }
    if (act === 'menu') { if (PV.on) { if (s && !s.over && !window.confirm('Si sales ahora pierdes la partida. ¿Salir?')) return; pvpLeaveGame(); } clearTimeout(timer); ui.playing = false; ui.screen = el.dataset.to || 'home'; return render(); }
    if (act === 'openpvp' || act === 'openrevpvp') {
      if (deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'pvp'; ui.lobby = 'pvp'; PV.mode = act === 'openrevpvp' ? 'revive' : '';
      return api('pvpPoll', {}).then(function (r) { if (r.ok && r.data.s && !r.data.s.over) return pvpBegin(r.data); ui.screen = 'pvp'; window.scrollTo(0, 0); render(); });
    }
    if (act === 'openvs4') {
      PV.mode = '';
      if (deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'vs4'; ui.lobby = 'vs4';
      return api('vs4Poll', {}).then(function (r) {
        if (r.ok && r.data.s && !r.data.s.over) return pvpBegin(r.data);
        if (r.ok && r.data.wait) { PV.wait = { kind: 'code', code: r.data.code, players: r.data.players }; ui.screen = 'pvp'; render(); return pvpSchedule(1500); }
        ui.screen = 'pvp'; window.scrollTo(0, 0); render();
      });
    }
    if (act === 'pvpsearch') { PV.wait = { kind: 'search' }; ui.msg = ''; render(); return api(PV.px + 'Search', { deck: ui.deck, mode: PV.mode }).then(pvpGot); }
    if (act === 'pvpcreate') { PV.wait = { kind: 'code', code: '' }; ui.msg = ''; render(); return api(PV.px + 'Create', { deck: ui.deck, mode: PV.mode }).then(pvpGot); }
    if (act === 'pvpjoin') { var jc = (document.getElementById('pvp-code').value || '').trim(); if (jc.length !== 5) { ui.msg = 'El código tiene 5 letras.'; return render(); } ui.msg = ''; return api(PV.px + 'Join', { deck: ui.deck, code: jc }).then(pvpGot); }
    if (act === 'pvpcancel') { pvpCancelWait(); return render(); }
    if (act === 'startai' || act === 'startrev') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); ui.mode = act === 'startrev' ? 'revive' : ''; return startGame(); }
    if (act === 'play') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); return startGame(); }
    if (act === 'skip') { clearTimeout(timer); ui.shown = ui.frames.length; return stopPlay(); }
    if (!s || ui.playing) return;
    if (PV.on && PV.rdy[0]) return;
    if (PV.on && (PV.busy || PV.q.length) && (act === 'buy' || act === 'refresh' || act === 'pick')) return;
    if (PV.on && (act === 'fight' || act === 'endshop' || act === 'next')) {
      if (act === 'fight' && (E.pendingTargets(s).length || (!P.mesa.some(Boolean) && E.mesaTroops(s.p[1]).length))) return;
      PV.rdy[0] = true; ui.sel = null; ui.hint = ''; pvpSend('ready'); return render();
    }
    if (act === 'fight') { if (E.fight(s) === false) return; ui.deadline = null; ui.sel = null; ui.hint = ''; return play(); }
    if (act === 'endshop') { E.endShop(s); ui.sel = null; ui.hint = ''; announce(); return render(); }
    if (act === 'next') { E.nextRound(s); ui.sel = null; ui.hint = ''; announce(); return render(); }
    if (act === 'anpick') { var A1 = ui.anm = ui.anm || { from: null, to: null }, ro = el.dataset.role, uu = +el.dataset.uid, other = ro === 'from' ? 'to' : 'from'; A1[ro] = A1[ro] === uu ? null : uu; if (A1[other] === uu) A1[other] = null; return render(); }
    if (act === 'cede') {
      var A0 = ui.anm || {}, cf = A0.from, ct = A0.to; if (cf == null || ct == null) return;
      var ok = E.cede(s, cf, ct, el.dataset.stat);
      if (ok) pvs('cede', [cf, ct, el.dataset.stat]);
      if (ok) ui.anm = null;
      ui.hint = ok ? '' : 'Elige dos tropas Anime distintas.'; return render();
    }
    if (act === 'buy') { var bi = +el.dataset.i, bc = CARD[P.offers[bi]]; if (!E.buy(s, 0, bi)) ui.hint = bc && P.gold < bc.cost ? 'No tienes oro suficiente.' : 'Tu mano está llena.'; else { ui.hint = ''; pvs('buy', [bi]); } return render(); }
    if (act === 'undo') { E.clearTargets(s, 0); pvs('clear'); ui.hint = ''; nextPending(s); return render(); }
    if (act === 'refresh') { if (PV.on) { pvpSend('refresh'); ui.hint = 'Actualizando tienda…'; return render(); } E.refresh(s, 0); return render(); }
    if (act === 'pick') { var pk = document.getElementById('pick-sel').value; if (E.pickFromDeck(s, 0, pk)) pvs('pick', [pk]); return render(); }
    if (act === 'voley') { E.setVoley(s, 0, +el.dataset.uid, el.dataset.m); pvs('voley', [+el.dataset.uid, el.dataset.m]); return render(); }
    if (act === 'sell') { e.stopPropagation(); var sf = el.dataset.from === 'mesa' ? 'mesa' : 'hand', si = +el.dataset.i; if (E.sell(s, 0, sf, si)) pvs('sell', [sf, si]); ui.sel = null; return render(); }
    if (act === 'retire') { e.stopPropagation(); if (E.retire(s, 0, +el.dataset.slot)) pvs('retire', [+el.dataset.slot]); ui.sel = null; return render(); }
    if (s.phase !== 'prep') return;

    if (act === 'hand') {
      var i = +el.dataset.i, c = CARD[P.hand[i].id];
      if (ui.sel && ui.sel.i === i && (ui.sel.k === 'hand' || ui.sel.k === 'act')) { ui.sel = null; ui.hint = ''; return render(); }
      if (c.type === 'tropa') {
        if (!P.mesa.some(function (x) { return !x; })) { ui.hint = 'La mesa está llena: solo puedes retirar tropas en la tienda.'; ui.sel = null; }
        else { ui.sel = { k: 'hand', i: i }; ui.hint = 'Pulsa un hueco libre para colocarla.'; }
      } else if (s.shopOpen) { ui.hint = 'Las acciones se juegan en las rondas de combate.'; ui.sel = null; }
      else if (c.target === 'none') { ui.hint = E.playAction(s, 0, i, null) ? (pvs('action', [i, null]), '') : s.err; ui.sel = null; }
      else { ui.sel = { k: 'act', i: i }; ui.hint = c.target === 'ally' ? 'Elige una tropa tuya en la mesa.' : 'Elige una tropa rival.'; }
      return render();
    }
    if (act === 'slot') {
      ui.hint = '';
      if (ui.sel && ui.sel.k === 'hand') { var sl2 = +el.dataset.i; if (E.place(s, 0, ui.sel.i, sl2)) { ui.landed = s.p[0].mesa[sl2].uid; pvs('place', [ui.sel.i, sl2]); } else if (E.dupBlock(s, 0, ui.sel.i)) ui.hint = 'Ya tienes esa carta en la mesa: los duplicados solo van en la mano.'; }
      ui.sel = null;
      if (!s.shopOpen) nextPending(s);
      return render();
    }
    if (act === 'mine') {
      var uid = +el.dataset.cuid;
      if (ui.sel && ui.sel.k === 'act') { if (E.playAction(s, 0, ui.sel.i, uid)) { pvs('action', [ui.sel.i, uid]); ui.sel = null; ui.hint = ''; } else ui.hint = s.err || 'Esa acción no va sobre una tropa tuya.'; return render(); }
      if (s.shopOpen) return;
      if (ui.sel && ui.sel.k === 'mine' && ui.sel.uid === uid) { ui.sel = null; ui.hint = ''; return render(); }
      ui.sel = { k: 'mine', uid: uid }; ui.hint = 'Ahora pulsa la tropa rival a la que atacará.'; return render();
    }
    if (act === 'foe') {
      var fu = +el.dataset.cuid;
      if (ui.sel && ui.sel.k === 'act') { if (E.playAction(s, 0, ui.sel.i, fu)) { pvs('action', [ui.sel.i, fu]); ui.sel = null; ui.hint = ''; } else ui.hint = s.err || 'Esa acción no va sobre una tropa rival.'; return render(); }
      if (ui.sel && ui.sel.k === 'mine') { E.setTarget(s, 0, ui.sel.uid, fu); pvs('target', [ui.sel.uid, fu]); ui.hint = ''; nextPending(s); return render(); }
    }
  });


  // ---------- Arrastrar cartas de la mano ----------
  var drag = null;
  app.addEventListener('pointerdown', function (e) {
    var el = e.target.closest('.hand [data-act="hand"]'), mel = null;
    if (!el && ui.s && ui.s.shopOpen) mel = e.target.closest('.row4.side0 [data-act="mine"]');
    if ((!el && !mel) || !ui.s || ui.playing || ui.busy || ui.s.phase !== 'prep' || (PV.on && PV.rdy[0]) || (e.button && e.button > 0)) return;
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
      if (P.hand.length >= E.handCap(s)) { ui.hint = 'Tu mano está llena.'; render(); return false; }
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
    var inst0 = P.hand[drag.i], ok = false, c = inst0 ? CARD[inst0.id] : null;
    if (drag.kind === 'mesa') {
      ui.dragMesa = false;
      if (t && t.closest('.handwrap')) { var sl = P.mesa.findIndex(function (x) { return x && x.uid === drag.uid; }); ok = sl >= 0 && E.retire(s, 0, sl); if (ok) pvs('retire', [sl]); }
      ui.sel = null; ui.hint = ok ? '' : 'No se pudo retirar.'; render(); return;
    }
    if (t && inst0) {
      if (c.type === 'tropa') {
        var slotEl = t.closest('.slot.free'), onBoard = t.closest('#board'), idx = slotEl ? +slotEl.dataset.i : (onBoard ? P.mesa.indexOf(null) : -1);
        if (idx >= 0 && E.place(s, 0, drag.i, idx)) { ok = true; ui.landed = P.mesa[idx].uid; pvs('place', [drag.i, idx]); }
      } else if (c.target === 'none') { if (t.closest('#board')) { ok = E.playAction(s, 0, drag.i, null); if (ok) pvs('action', [drag.i, null]); } }
      else { var cd = t.closest('[data-cuid]'); if (cd && cd.dataset.side === (c.target === 'ally' ? '0' : '1')) { ok = E.playAction(s, 0, drag.i, +cd.dataset.cuid); if (ok) pvs('action', [drag.i, +cd.dataset.cuid]); } }
    }
    ui.sel = null; ui.hint = ok ? '' : (s.err && c && c.type !== 'tropa' ? s.err : 'No se pudo soltar ahí.');
    if (ok && !s.shopOpen) nextPending(s);
    render();
  }

  window.CartasUI = ui; window.CartasRender = render; // depuración
  document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.acctw')) { var o = document.querySelector('.acctw.open'); if (o) o.classList.remove('open'); } });
  app.addEventListener('keydown', function (e) { if (e.key === 'Enter' && ui.screen === 'login' && e.target.id && e.target.id.indexOf('lg-') === 0) { var b = app.querySelector('[data-act=login]'); if (b) b.click(); } });
  render();
  if (!getTok()) { ui.screen = 'login'; render(); }
  else api('me').then(function (r) {
    if (r.ok) { setAcct(r.data.user); loadLocal(); ui.screen = landing(); } else if (ui.screen === 'boot') ui.screen = 'login';
    render();
  });
})();
