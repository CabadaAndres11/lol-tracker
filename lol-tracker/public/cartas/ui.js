(function () {
  'use strict';
  var E = window.CartasEngine, D = E.DATA, CARD = E.CARD, CFG = E.CFG;
  var app = document.getElementById('app');
  var ui = { screen: 'boot', acct: null, ownedSet: null, pack: null, onlyOwned: false, filters: [], rar: [], groupRar: false, sortLv: false, fmode: 'any', group: false, deck: [], slots: [null, null, null], slotTo: 0, slotName: '', msg: '', s: null, sel: null, view: null, playing: false, shown: 0, frames: [], hl: null, hint: '' };

  // El mazo y los huecos guardados son por cuenta (en este navegador); la colección vive en el servidor.
  function lk(n) { return 'cartas_' + n + ':' + (ui.acct ? ui.acct.name.toLowerCase() : ''); }
  var syncT = null;
  function syncDecks() { clearTimeout(syncT); syncT = setTimeout(function () { if (getTok()) api('deckSave', { deck: ui.deck, slots: ui.slots }); }, 400); }
  function saveDeck() { try { localStorage.setItem(lk('deck'), JSON.stringify(ui.deck)); } catch (e) {} syncDecks(); }
  function saveSlots() { try { localStorage.setItem(lk('slots'), JSON.stringify(ui.slots)); } catch (e) {} syncDecks(); }
  function owns(id) { return !!(ui.ownedSet && ui.ownedSet[id]); }
  function setAcct(user) {
    ui.acct = user; ui.ownedSet = {}; user.owned.forEach(function (id) { ui.ownedSet[id] = 1; });
  }
  function loadLocal() {
    var sd = ui.acct && ui.acct.decks;
    if (sd) { // mazos guardados en la cuenta: se usan en cualquier dispositivo
      ui.deck = (sd.deck || []).filter(function (id) { return CARD[id] && owns(id); });
      ui.slots = [0, 1, 2].map(function (i) { var x = sd.slots && sd.slots[i]; return x && x.ids ? { name: String(x.name || 'Mazo'), ids: x.ids.filter(function (id) { return CARD[id] && owns(id); }) } : null; });
      try { localStorage.setItem(lk('deck'), JSON.stringify(ui.deck)); localStorage.setItem(lk('slots'), JSON.stringify(ui.slots)); } catch (e) {}
      return;
    }
    try { var sv = JSON.parse(localStorage.getItem(lk('deck')) || 'null'); ui.deck = sv && sv.length ? sv.filter(function (id) { return CARD[id] && owns(id); }) : []; } catch (e) { ui.deck = []; }
    ui.slots = [null, null, null];
    try { var sl = JSON.parse(localStorage.getItem(lk('slots')) || 'null'); if (sl && sl.length === 3) ui.slots = sl.map(function (x) { return x && x.ids ? { name: String(x.name || 'Mazo'), ids: x.ids.filter(function (id) { return CARD[id] && owns(id); }) } : null; }); } catch (e) {}
    // sin mazo guardado: empieza vacío (el jugador monta el suyo con las cartas que tiene)
    if (ui.deck.length || ui.slots.some(Boolean)) syncDecks(); // migra a la cuenta los mazos que solo estaban en este dispositivo
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
    'bola-extra': 'beisbol', 'segundo-aliento': 'viento', 'cambio-de-linea': 'cambio', parche: 'disquete', 'horas-extra': 'maletin', 'capitulo-especial': 'tele', 'segunda-temporada': 'trofeo', 'campeones-de-europa': 'trofeo', 'remate-doble': 'voley', 'cita-sorpresa': 'corazon', 'rabia-contenida': 'enfado', 'fiesta-del-pueblo': 'fiesta', 'hermano-del-alma': 'duo', 'sofa-compartido': 'sofa', madrugon: 'reloj' };
  var ARTS = {"eriko":1,"helena":1,"lucia":1,"ari":1,"aitorlg-friki":1,"aitorlg-koisito":1,"aitorlg-regla":1,"aitorlg-renata":1,"chipy-correa":1,"chipy-lloron":1,"computer-chipy":1,"computer-dashlight":1,"computer-hellbramn":1,"computer-lihone":1,"computer-petea":1,"dashlight-akali":1,"dashlight-correa":1,"haikyuu-lihone":1,"hellbramn":1,"javihi":1,"javihi-duo":1,"javihi-friki":1,"javihi-koisito":1,"javihi-prime":1,"lihone":1,"lihone-correa":1,"lihone-viego":1,"mertens":1,"mertens-prime":1,"pampert":1,"pampert-friki":1,"pampert-koisito":1,"petea-koisito":1,"petea-pokemaniaco":1,"potango":1,"sech":1,"sech-duo":1,"sech-koisito":1,"sech-thresh":1};
  // Nivel de carta por repetidas: 2 copias = ★2, 4 copias = ★3
  function lvOf(id) { var n = 1 + ((ui.acct && ui.acct.dups && ui.acct.dups[id]) || 0); return n >= 4 ? 3 : n >= 2 ? 2 : 1; }
  function skG(side, id) { var s = ui.s; return (s && s.sk && s.sk[side] && s.sk[side][id]) || ''; }
  function lvG(side, id) { var s = ui.s; return (s && s.lv && s.lv[side] && s.lv[side][id]) || 1; }
  function cardHtml(c, o) {
    o = o || {};
    var troop = c.type === 'tropa', c1, c2;
    if (c.novia) { c1 = D.themes.Correa.color; c2 = hexMix(c1, '#0b0716', .55); }
    else if (troop) { c1 = D.themes[c.themes[0]].color; c2 = c.themes[1] ? D.themes[c.themes[1]].color : hexMix(c1, '#0b0716', .62); }
    else if (c.theme) { c1 = D.themes[c.theme].color; c2 = hexMix(c1, '#0b0716', .62); } else { c1 = '#2dd4bf'; c2 = '#0f3f3a'; }
    var tag = o.tag || 'div';
    var art = troop && ARTS[c.id];
    if (o.skin === undefined) o.skin = ui.screen === 'game' ? '' : (ui.acct && ui.acct.skinSel && ui.acct.skinSel[c.id] && ui.acct.skins.indexOf(ui.acct.skinSel[c.id]) >= 0 ? ui.acct.skinSel[c.id] : '');
    var h = '<' + tag + ' class="card r-' + c.rarity + (troop ? '' : ' accion') + (art ? ' art' : '') + (o.cls ? ' ' + o.cls : '') + '" style="--c1:' + c1 + ';--c2:' + c2 + (art ? ';--art:url(/cartas/art/' + (o.skin || c.id) + '.webp)' : '') + '"' + (o.attrs ? ' ' + o.attrs : '') + '>';
    if (o.skin && c.rarity === 'Legendaria') h += '<span class="holo"></span>'; // skin de una legendaria: efecto holográfico
    if (!c.novia) h += '<span class="coin" title="Coste en oro para comprarla">' + c.cost + '</span>';
    if (o.gl > 1) h += '<span class="glb" title="Fusionada en partida: ★' + o.gl + '">' + '★'.repeat(o.gl) + '</span>';
    if (o.lv > 1 && troop) h += '<span class="lvb" title="Nivel ' + o.lv + ' por cartas repetidas">★' + o.lv + '</span>';
    if (o.size && !c.novia) h += '<span class="pips" title="Espacio que ocupa en el mazo: ' + c.size + '">' + pips(c.size) + '</span>';
    h += '<div class="nm">' + esc(c.name) + '</div>';
    if (troop) {
      var lb = o.lv > 1 && o.atk == null ? o.lv - 1 : 0; // nivel de carta: +1/+1 por nivel (en tienda, mazo y colección)
      var a = o.atk != null ? o.atk : c.atk + lb, hp = o.hp != null ? o.hp : c.hp + lb, mx = o.max != null ? o.max : hp;
      if (c.pas) h += '<span class="pasn"><span class="pasl">✦ ' + esc(c.pas.n) + '</span><span class="pastip"><b>' + esc(c.pas.n) + '</b>' + esc(c.pas.t) + '</span></span>';
      h += '<div class="mono">' + esc(c.person.charAt(0)) + '</div><div class="tags">' + c.themes.map(tagHtml).join('') + '</div>';
      var dA = a - c.atk, dH = mx - c.hp;
      if (dA) h += '<i class="dl a ' + (dA > 0 ? 'pos' : 'neg') + '">' + (dA > 0 ? '+' : '') + dA + '</i>';
      if (dH) h += '<i class="dl h ' + (dH > 0 ? 'pos' : 'neg') + '">' + (dH > 0 ? '+' : '') + dH + '</i>';
      h += '<span class="sc a' + (a > c.atk ? ' up' : '') + '" title="Ataque"><b>' + a + '</b></span><span class="sc h' + (mx > c.hp ? ' up' : '') + (hp < mx ? ' low' : '') + '" title="Vida' + (hp < mx ? ' (' + hp + '/' + mx + ')' : '') + '"><b>' + hp + '</b></span>';
    } else {
      h += (c.theme ? '<div class="mono ico tl">' + (TIMG[c.theme] ? '<img class="tlogo" src="/cartas/img/' + TIMG[c.theme] + '.png" alt="">' : ic('t-' + c.theme, 'tlogo')) + '</div>' : '<div class="mono ico">' + ic(AICON[c.id] || 'brillo') + '</div>') + '<div class="adesc">' + esc(c.text) + '</div>' + (c.theme ? '<div class="tags">' + tagHtml(c.theme) + '</div>' : '');
    }
    if (o.extra) h += o.extra;
    return h + '</' + tag + '>';
  }

  // ---------- Introducción animada de la sinergia Correa ----------
  var introEl = null, introT = [];
  function introOff() { try { return localStorage.getItem(lk('intro-correa')) === '1'; } catch (e) { return false; } }
  function closeIntro() {
    introT.forEach(clearTimeout); introT = [];
    if (introEl) { introEl.remove(); introEl = null; }
    document.removeEventListener('keydown', introKey);
  }
  function introKey(e) { if (e.key === 'Escape') closeIntro(); }
  function maybeIntro() {
    if (ui.introSeen || !ui.acct || introOff() || introEl) return;
    ui.introSeen = true;
    setTimeout(function () { if (ui.screen === 'home') openIntro(); }, 700);
  }
  function openIntro() {
    closeIntro();
    var boys = ['lihone-correa', 'dashlight-correa', 'potango', 'chipy-correa'], girls = ['eriko', 'helena', 'lucia', 'ari'];
    var h = '<div class="intropanel"><div class="introst" data-sc="0"><div class="ibg"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>' +
      '<div class="ititle"><small>¡Ya está aquí la versión 1.1!</small><b>CORREA</b></div><span class="iver">v1.1</span>' +
      '<div class="islot p1"></div><div class="islot p2"></div><div class="islot p3"></div><div class="islot p4"></div><div class="islot p5"><span>' + ic('corazon') + ' Hueco 5</span></div>' +
      boys.map(function (id, k) { return '<div class="iq nb' + (k + 1) + '">' + cardHtml(CARD[id], { lv: 1 }) + '</div>'; }).join('') +
      girls.map(function (id, k) { return '<div class="iq ng' + (k + 1) + '">' + cardHtml(CARD[id], { lv: 1 }) + '</div>'; }).join('') +
      '<div class="iq rival">' + cardHtml(CARD['sech-thresh'], { lv: 1 }) + '</div>' +
      '<span class="ifx fe">+2/+2</span><span class="ifx d1">-6</span><span class="ifx d2">-3</span><span class="ifx d3">-5</span><span class="ifx d5">-4</span><span class="ifx d6">-2</span><span class="ifx d4">¡Cae!</span>' +
      '<div class="icap"><span></span></div></div>' +
      '<label class="ibtns inever"><input type="checkbox" data-i="never"' + (introOff() ? ' checked' : '') + '> No mostrar más</label><p class="zhint">Pulsa fuera de la animación para cerrarla</p></div>';
    introEl = document.createElement('div'); introEl.className = 'introov'; introEl.innerHTML = h;
    document.body.appendChild(introEl);
    var st = introEl.querySelector('.introst'), cap = st.querySelector('.icap span');
    var CAPS = ['', '', 'Con la sinergia recibes a las 4 novias', 'Una por ronda en el hueco 5: Eriko mima a toda la mesa', 'Lucía, Helena y Ari cambian el combate', '¡Elige a tu novia y arrasa!'];
    function go(n) { st.dataset.sc = n; cap.textContent = CAPS[n] || ''; cap.parentNode.classList.toggle('on', !!CAPS[n]); }
    function run() {
      introT.forEach(clearTimeout); introT = [];
      st.classList.add('reset'); go(0);
      introT.push(setTimeout(function () { st.classList.remove('reset'); go(1); }, 80));
      [[3300, 2], [6300, 3], [9000, 4], [13200, 5]].forEach(function (x) { introT.push(setTimeout(function () { go(x[1]); }, x[0])); });
      introT.push(setTimeout(run, 16700));
    }
    run();
    introEl.addEventListener('change', function (e) {
      if (e.target.dataset.i !== 'never') return;
      try { if (e.target.checked) localStorage.setItem(lk('intro-correa'), '1'); else localStorage.removeItem(lk('intro-correa')); } catch (er) {}
    });
    introEl.addEventListener('click', function (e) { if (e.target === introEl || e.target.classList.contains('intropanel')) closeIntro(); });
    document.addEventListener('keydown', introKey);
  }

  // ---------- Carta ampliada en 3D (pantalla Mazo) ----------
  var zoomEl = null;
  function closeZoom() { if (zoomEl) { zoomEl.remove(); zoomEl = null; } document.removeEventListener('keydown', zoomKey); }
  function zoomKey(e) { if (e.key === 'Escape') closeZoom(); }
  function openZoom(id, skin) {
    var c = CARD[id]; if (!c) return;
    closeZoom();
    var own = owns(c.id) || !!c.novia, st = { rx: 0, ry: 0, tx: 0, ty: 0, drag: null, auto: true, t0: performance.now() };
    var face = cardHtml(c, { lv: own && !c.novia ? lvOf(c.id) : 1, cls: 'zface', skin: skin || undefined });
    zoomEl = document.createElement('div'); zoomEl.className = 'zoomov';
    zoomEl.innerHTML = '<div class="zbox"><div class="zstage"><div class="zcard"><div class="zfront">' + face + '<span class="zglare"></span></div><div class="zback"><div class="zbk"><b>' + ic('cartas') + '</b><span>' + esc(c.name) + '</span></div></div></div></div>' +
      '<div class="zbtns"><button class="btn sec sm" data-z="flip">' + ic('cambio') + ' Voltear</button><button class="btn sec sm" data-z="reset">Restablecer</button><button class="btn sm" data-z="close">Cerrar</button></div>' +
      '<p class="zhint">Arrastra para girarla · pasa el ratón para inclinarla · Esc para cerrar</p></div>';
    document.body.appendChild(zoomEl);
    var card = zoomEl.querySelector('.zcard'), glare = zoomEl.querySelector('.zglare'), stage = zoomEl.querySelector('.zstage');
    function paint() { card.style.transform = 'rotateX(' + st.rx.toFixed(1) + 'deg) rotateY(' + st.ry.toFixed(1) + 'deg)'; }
    function glarePos(x, y) { glare.style.background = 'radial-gradient(circle at ' + x + '% ' + y + '%, rgba(255,255,255,.38), rgba(255,255,255,0) 55%)'; }
    // balanceo suave mientras no la tocas
    function idle(now) {
      if (!zoomEl) return;
      if (st.auto && !st.drag) { var t = (now - st.t0) / 1000; st.ry = Math.sin(t * .9) * 14; st.rx = Math.cos(t * .7) * 5; glarePos(50 + Math.sin(t * .9) * 30, 40 + Math.cos(t * .7) * 20); paint(); }
      requestAnimationFrame(idle);
    }
    requestAnimationFrame(idle);
    function norm(a) { return ((a % 360) + 540) % 360 - 180; }
    stage.addEventListener('pointerdown', function (e) { st.drag = { x: e.clientX, y: e.clientY, rx: st.rx, ry: st.ry }; st.auto = false; card.style.transition = 'none'; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', function (e) {
      var r = stage.getBoundingClientRect();
      glarePos(Math.max(0, Math.min(100, (e.clientX - r.left) / r.width * 100)), Math.max(0, Math.min(100, (e.clientY - r.top) / r.height * 100)));
      if (st.drag) { st.ry = st.drag.ry + (e.clientX - st.drag.x) * .6; st.rx = Math.max(-70, Math.min(70, st.drag.rx - (e.clientY - st.drag.y) * .5)); paint(); }
      else if (e.pointerType === 'mouse') { st.auto = false; card.style.transition = 'transform .12s ease-out'; st.ry = norm(st.ry) > 90 || norm(st.ry) < -90 ? st.ry : ((e.clientX - r.left) / r.width - .5) * 40; st.rx = -((e.clientY - r.top) / r.height - .5) * 30; paint(); }
    });
    function end() { if (!st.drag) return; st.drag = null; card.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)'; var n = norm(st.ry); st.ry = Math.abs(n) > 90 ? 180 * (n > 0 ? 1 : -1) : 0; st.rx = 0; paint(); } // se asienta de frente o de espaldas
    stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
    zoomEl.addEventListener('click', function (e) {
      var z = e.target.closest('[data-z]');
      if (z) {
        card.style.transition = 'transform .6s cubic-bezier(.2,.8,.2,1)'; st.auto = false;
        if (z.dataset.z === 'flip') { st.ry = Math.abs(norm(st.ry)) > 90 ? 0 : 180; st.rx = 0; paint(); }
        else if (z.dataset.z === 'reset') { st.ry = 0; st.rx = 0; paint(); }
        else closeZoom();
        return;
      }
      if (e.target === zoomEl) closeZoom();
    });
    document.addEventListener('keydown', zoomKey);
  }

  // ---------- Navegación ----------
  var NAV = [['home', 'casa', 'Inicio'], ['play', 'espadas', 'Jugar'], ['deck', 'cartas', 'Mazo'], ['packs', 'tienda', 'Tienda'], ['ladder', 'trofeo', 'Clasificación']];
  function artOk(id) { return !!id && (!!ARTS[id] || (window.CARTAS_SKINS || []).some(function (k) { return k.id === id; })); }
  function avatarHtml(cls) {
    var id = ui.acct && ui.acct.avatar, ok = artOk(id);
    return '<span class="avt ' + (cls || '') + (ok ? ' has' : '') + '"' + (ok ? ' style="background-image:url(/cartas/art/' + id + '.webp)"' : '') + '>' + (ok ? '' : ic('usuario')) + '</span>';
  }
  function navHtml(cur) {
    var home = cur === 'home';
    var acct = ui.acct ? '<button class="navb coinpill" data-act="nav" data-to="packs" title="Tus monedas">' + ic('moneda') + ' ' + ui.acct.coins + '</button><button class="navb avtb' + (cur === 'profile' ? ' on' : '') + '" data-act="nav" data-to="profile" title="Tu perfil">' + avatarHtml('sm') + '</button><span class="acctw"><button class="navb who" data-act="acctmenu" title="Tu cuenta">' + esc(ui.acct.name) + ' ▾</button><div class="acctmenu"><div class="am-name">Sesión de <b>' + esc(ui.acct.name) + '</b></div><button class="am-prof" data-act="nav" data-to="profile">' + ic('usuario') + ' Mi perfil</button><button data-act="logout">' + ic('puerta') + ' Cerrar sesión</button></div></span>' : '';
    return '<nav class="nav' + (home ? ' navhome' : '') + '">' + (home ? '<span class="navlogo"><img src="/cartas/logo-icon.png" alt="">TCG Arena</span>' : NAV.map(function (n) { return '<button class="navb' + (n[0] === cur ? ' on' : '') + '" data-act="nav" data-to="' + n[0] + '">' + ic(n[1]) + ' ' + n[2] + '</button>'; }).join('')) +
      '<span class="navsp"></span>' + acct + '</nav><a class="hubback" href="/" title="Volver al inicio">← Juegos</a>';
  }
  function oddsHtml(s) {
    var o = E.shopOdds(s, 0), keys = Object.keys(o);
    if (!keys.length) return '';
    return '<div class="odds" title="Probabilidad de cada rareza en las cartas de esta tienda (según tu mazo)"><span class="olbl">Probabilidades</span>' + keys.map(function (r) { return '<span class="od r-' + r + '"><i>' + GEM[r] + '</i> ' + r + ' <b>' + o[r] + '%</b></span>'; }).join('') + '</div>';
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
    var pick = ['Rara', 'Legendaria', 'Épica'].map(function (r) { return D.cards.filter(function (c) { return r === 'Legendaria' ? c.id === 'chipy-lloron' : c.rarity === r && (r !== 'Rara' || c.person === 'AitoRLG'); })[0] || D.cards.filter(function (c) { return c.rarity === r; })[0]; }).filter(Boolean);
    return '<div class="fan">' + pick.map(function (c, k) { return '<div class="fc f' + k + '">' + cardHtml(c, { atk: c.atk, hp: c.hp, max: c.hp, cls: '' }) + '</div>'; }).join('') + '</div>';
  }
  function ensureLadder() {
    if (!ui.ladder || Date.now() - (ui.ladderAt || 0) > 20000) {
      if (!ui.ladderBusy) {
        ui.ladderBusy = true;
        api('ladder').then(function (r) { ui.ladderBusy = false; ui.ladderAt = Date.now(); if (r.ok) { ui.ladder = r.data; if (ui.screen === 'ladder') render(); } });
      }
    }
  }
  // Rangos por puntos
  var RANKS = [
    { n: 'Hierro', min: 0, c: '#8b8f98' }, { n: 'Bronce', min: 60, c: '#c4813f' }, { n: 'Plata', min: 140, c: '#cfd8e3' },
    { n: 'Oro', min: 240, c: '#e8b93c' }, { n: 'Platino', min: 360, c: '#4fd1c5' }, { n: 'Esmeralda', min: 500, c: '#34d399' },
    { n: 'Diamante', min: 680, c: '#60a5fa' }, { n: 'Maestro', min: 900, c: '#c084fc' }, { n: 'Aspirante', min: 1200, c: '#f0c35a' }
  ];
  function rankOf(pts) { var k = 0; RANKS.forEach(function (r, i) { if (pts >= r.min) k = i; }); return k; }
  function rkEmblem(k, big) {
    var r = RANKS[k], c = r.c, wings = k >= 3 ? '<path d="M50 38 C34 30 18 34 6 18 C14 44 28 52 50 60 Z" fill="' + c + '" opacity=".75"/><path d="M50 38 C66 30 82 34 94 18 C86 44 72 52 50 60 Z" fill="' + c + '" opacity=".75"/>' : '',
      crown = k >= 7 ? '<path d="M38 12 L44 22 L50 8 L56 22 L62 12 L60 28 L40 28 Z" fill="' + c + '"/>' : '';
    return '<svg class="rkem' + (big ? ' big' : '') + '" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="rkg' + k + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '"/><stop offset="1" stop-color="#1b1430"/></linearGradient></defs>' + wings + crown +
      '<path d="M50 24 L74 34 L74 58 C74 74 62 84 50 92 C38 84 26 74 26 58 L26 34 Z" fill="url(#rkg' + k + ')" stroke="' + c + '" stroke-width="3"/><path d="M50 36 L62 54 L50 74 L38 54 Z" fill="' + c + '" opacity=".9"/><path d="M50 36 L62 54 L50 54 Z" fill="#fff" opacity=".35"/></svg>';
  }
  function rkAv(id) {
    var ok = artOk(id);
    return '<span class="avt rkav' + (ok ? ' has' : '') + '"' + (ok ? ' style="background-image:url(/cartas/art/' + id + '.webp)"' : '') + '>' + (ok ? '' : ic('usuario')) + '</span>';
  }
  function renderLadder() {
    ensureLadder();
    var L = ui.ladder, me = ui.acct ? ui.acct.name.toLowerCase() : '';
    var myPts = L ? L.me : (ui.acct ? ui.acct.pts : 0), mk = rankOf(myPts), mr = RANKS[mk], nx = RANKS[mk + 1];
    var rows = L && L.top && L.top.length ? L.top.map(function (r, k) {
      var rk = rankOf(r.pts);
      return '<li class="rkrow' + (r.name.toLowerCase() === me ? ' me' : '') + (k < 3 ? ' top' + (k + 1) : '') + '" style="--rc:' + RANKS[rk].c + '"><span class="rkpos">' + (k + 1) + '</span>' + rkAv(r.avatar) + '<b class="rkname">' + esc(r.name) + '</b><span class="rkrank">' + rkEmblem(rk) + '<i>' + RANKS[rk].n + '</i></span><span class="rkpts">' + r.pts + '</span></li>';
    }).join('') : '<li class="mut rkempty">' + (L ? 'Aún no hay jugadores.' : 'Cargando…') + '</li>';
    var tiers = RANKS.slice().reverse().map(function (r) { var i = RANKS.indexOf(r); return '<li class="' + (i === mk ? 'cur' : '') + '" style="--rc:' + r.c + '">' + rkEmblem(i) + '<b>' + r.n + '</b><span>' + r.min + (RANKS[i + 1] ? '–' + (RANKS[i + 1].min - 1) : '+') + '</span></li>'; }).join('');
    app.innerHTML = head('ladder', '' + ic('trofeo') + ' Clasificación') +
      '<div class="rkwrap"><div class="rkmain"><div class="rkhead"><div><span class="rkk">Temporada de lanzamiento</span><h2>Mejores jugadores</h2></div><span class="rkcol">Top 10</span></div>' +
      '<div class="rkcolh"><span>#</span><span>Jugador</span><span>Rango</span><span>Puntos</span></div><ol class="rklist">' + rows + '</ol>' +
      '<p class="mut rknote">Puntúan las partidas contra otros jugadores: 1 contra 1 (+20 / -20) y Versus de 4 (+40 / +20 / -20 / -40 según tu puesto). Aparecen todas las cuentas, hayan jugado o no.</p></div>' +
      '<aside class="rkside" style="--rc:' + mr.c + '"><div class="rkbanner">' + rkEmblem(mk, true) + '<span class="rkpl">' + (L && L.pos ? 'Clasificación: ' + L.pos + (L.total ? ' de ' + L.total : '') : 'Sin clasificar') + '</span><b class="rkrn">' + mr.n + '</b><span class="rkpp">' + myPts + ' PL</span>' +
      (nx ? '<div class="meter rkm"><i class="on" style="width:' + Math.round((myPts - mr.min) / (nx.min - mr.min) * 100) + '%"></i></div><span class="rknx">' + (nx.min - myPts) + ' puntos para ' + nx.n + '</span>' : '<span class="rknx">Rango máximo</span>') + '</div>' +
      '<ul class="rktiers">' + tiers + '</ul></aside></div></div>';
  }
  // Ilustraciones de una noticia: las indicadas (art) o las cartas que se nombran en el texto; si no hay, el logo.
  function newsArts(n) {
    if (n.art && n.art.length) return n.art.slice(0, 3);
    if (n._arts) return n._arts;
    var txt = (n.title + ' ' + n.items.join(' ')).toLowerCase(), found = [];
    D.cards.filter(function (c) { return ARTS[c.id]; }).sort(function (a, b) { return b.name.length - a.name.length; }).forEach(function (c) {
      var k = txt.indexOf(c.name.toLowerCase());
      if (k >= 0) { found.push({ k: k, id: c.id }); txt = txt.split(c.name.toLowerCase()).join(new Array(c.name.length + 1).join(' ')); }
    });
    return (n._arts = found.sort(function (a, b) { return a.k - b.k; }).slice(0, 3).map(function (f) { return f.id; }));
  }
  function newsNeedsFull(n) {
    return n.items.length > 2 || n.items.some(function (t) { return t.indexOf('{{intro}}') >= 0 || t.length > 230; });
  }
  function newsSummary(n) {
    return n.items.slice(0, 2).map(function (t) { t = t.replace('{{intro}}', '').trim(); return t.length > 230 ? t.slice(0, 227).replace(/\s+\S*$/, '') + '…' : t; });
  }
  function homeNews() {
    var N = window.CARTAS_NEWS || [];
    if (!N.length) return '';
    var sel = Math.min(ui.newsSel || 0, N.length - 1), n = N[sel], arts = newsArts(n);
    return '<div class="rnews"><ul class="rnl">' + N.map(function (x, k) {
      return '<li><button class="' + (k === sel ? 'on' : '') + '" data-act="newssel" data-i="' + k + '"><span class="ntag nt-' + esc(x.tag) + '">' + esc(x.tag) + '</span><b>' + esc(x.title) + '</b><i>' + esc(x.date.split('-').reverse().join('/')) + '</i></button></li>';
    }).join('') + '</ul><div class="rnmain' + (arts.length ? '' : ' nologo') + (ui.newsFull && newsNeedsFull(n) ? ' full' : '') + '" style="' + (arts.length ? '--rart:url(/cartas/art/' + arts[0] + '.webp)' : '') + '">' +
      (arts.length ? '' : '<img class="rnlogo" src="/cartas/logo.webp" alt="">') +
      '<div class="rnbody"><span class="ntag nt-' + esc(n.tag) + '">' + esc(n.tag) + '</span><h2>' + esc(n.title) + '</h2><ul>' + (ui.newsFull && newsNeedsFull(n) ? n.items.map(function (t) { return '<li>' + (t.indexOf('{{intro}}') >= 0 ? esc(t.replace('{{intro}}', '')) + '<a href="#" class="newslink" data-act="introplay">▶ Ver la animación</a>' : esc(t)) + '</li>'; }) : newsSummary(n).map(function (t) { return '<li>' + esc(t) + '</li>'; })).join('') + '</ul>' +
      (newsNeedsFull(n) ? '<button class="btn sec sm" data-act="newsmore">' + (ui.newsFull ? 'Mostrar menos ▴' : 'Leer la noticia completa ▾') + '</button>' : '') +
      (arts.length > 1 ? '<div class="rnthumbs">' + arts.map(function (id) { return '<span style="background-image:url(/cartas/art/' + id + '.webp)" title="' + esc(CARD[id].name) + '"></span>'; }).join('') + '</div>' : '') + '</div></div></div>';
  }
  // Cambia solo el panel de noticias (así la lista conserva su scroll)
  function refreshNews() {
    var old = document.querySelector('.rnews'); if (!old) return renderHome();
    var l = old.querySelector('.rnl'), st = l ? l.scrollTop : 0, tmp = document.createElement('div');
    tmp.innerHTML = homeNews(); old.replaceWith(tmp.firstChild);
    var nl = document.querySelector('.rnews .rnl'); if (nl) nl.scrollTop = st;
  }
  function renderHome() {
    var h = head('home') + '<div class="rhome"><div class="rplay"><button class="rplaybtn" data-act="nav" data-to="play"><span class="rpl">' + ic('espadas') + '</span><span class="rpt">Jugar</span></button></div>' +
      '<div class="ricons">' + [
        ['deck', ic('cartas'), 'Mazo', deckSize() + '/' + CFG.deckBudget],
        ['packs', ic('tienda'), 'Tienda', (ui.acct ? ui.acct.coins : 0) + ' monedas'],
        ['ladder', ic('trofeo'), 'Clasificación', ui.acct.pts + ' puntos'],
        ['profile', ic('usuario'), 'Perfil', 'Foto y cuenta'],
      ].map(function (m) { return '<button class="ricon" data-act="nav" data-to="' + m[0] + '"><span class="rii">' + m[1] + '</span><b>' + m[2] + '</b><span class="mut">' + m[3] + '</span></button>'; }).join('') + '</div>' + homeNews() + '</div>';
    h += '<p class="mut" style="text-align:center">' + D.cards.length + ' tropas · ' + D.actions.length + ' acciones</p></div>';
    app.innerHTML = h;
    maybeIntro();
  }
  function renderProfile() {
    var a = ui.acct, mySkins = (window.CARTAS_SKINS || []).filter(function (k) { return (a.skins || []).indexOf(k.id) >= 0; }), cur = a.avatar || '', own = D.cards.filter(function (c) { return ARTS[c.id] && ui.ownedSet && ui.ownedSet[c.id]; }).sort(function (x, y) { return RARS.indexOf(y.rarity) - RARS.indexOf(x.rarity) || x.name.localeCompare(y.name); });
    app.innerHTML = head('profile', '' + ic('usuario') + ' Mi perfil') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') +
      '<div class="panel profhead">' + avatarHtml('xl') + '<div><h2>' + esc(a.name) + '</h2><p class="mut">' + a.pts + ' puntos de clasificación · ' + a.coins + ' ' + ic('moneda') + ' · ' + a.owned.length + ' cartas desbloqueadas</p><div class="btnrow"><button class="btn sec" data-act="logout">' + ic('puerta') + ' Cerrar sesión</button></div></div></div>' +
      '<div class="panel"><h2>Foto de perfil</h2><p class="mut">Elige la ilustración de una de tus cartas desbloqueadas o de una de tus skins. Cuantas más consigas, más opciones tendrás.</p>' +
      '<div class="avgrid"><button class="avopt none' + (cur ? '' : ' on') + '" data-act="setavatar" data-card="" title="Sin foto"><span class="avt">' + ic('usuario') + '</span><b>Ninguna</b></button>' + own.map(function (c) {
        return '<button class="avopt' + (cur === c.id ? ' on' : '') + '" data-act="setavatar" data-card="' + c.id + '" title="' + esc(c.name) + '"><span class="avt has" style="background-image:url(/cartas/art/' + c.id + '.webp)"></span><b>' + esc(c.name) + '</b></button>';
      }).join('') + '</div>' + (mySkins.length ? '<h3 class="avsub">Skins</h3><div class="avgrid">' + mySkins.map(function (k) {
        return '<button class="avopt skin' + (cur === k.id ? ' on' : '') + '" data-act="setavatar" data-card="' + k.id + '" title="' + esc(CARD[k.card].name + ' · ' + k.name) + '"><span class="avt has" style="background-image:url(/cartas/art/' + k.id + '.webp)"></span><b>' + esc(k.name) + '</b></button>';
      }).join('') + '</div>' : '') + '</div></div>';
  }

  function renderBoot() { app.innerHTML = '<div class="wrap"><p class="mut" style="text-align:center;margin-top:30vh">Cargando…</p></div>'; }
  function renderLogin() {
    var reg = ui.lgTab === 'reg';
    var pt = ui.showPin ? 'text' : 'password', eye = '<button type="button" class="pineye' + (ui.showPin ? ' on' : '') + '" data-act="pinshow" title="' + (ui.showPin ? 'Ocultar PIN' : 'Ver PIN') + '" aria-label="Ver u ocultar el PIN">' + ic('ojo') + '</button>';
    app.innerHTML = '<div class="wrap"><div class="loginbox panel"><img class="lg-logo" src="/cartas/logo.webp" alt="TCG Arena"><h1>TCG Arena</h1>' +
      '<div class="lgtabs"><button class="' + (reg ? '' : 'on') + '" data-act="lgtab" data-t="login">Iniciar sesión</button><button class="' + (reg ? 'on' : '') + '" data-act="lgtab" data-t="reg">Registrarse</button></div>' +
      '<p class="mut">' + (reg ? 'Elige un nombre y un PIN de 4 dígitos para guardar tus monedas y tu colección. Apunta el PIN: no se puede recuperar.' : 'Entra con tu nombre y tu PIN para recuperar tus monedas, tu colección y tus mazos.') + '</p>' +
      '<label>Nombre<input id="lg-name" maxlength="16" autocomplete="username" placeholder="Tu nombre" value="' + esc(ui.lgName || '') + '"></label>' +
      '<label>PIN<span class="pinw"><input id="lg-pin" type="' + pt + '" inputmode="numeric" maxlength="4" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" placeholder="0000">' + eye + '</span></label>' +
      (reg ? '<label>Repite el PIN<span class="pinw"><input id="lg-pin2" type="' + pt + '" inputmode="numeric" maxlength="4" autocomplete="new-password" placeholder="0000">' + eye + '</span></label>' : '') +
      (ui.msg ? '<div class="hint" style="color:var(--bad)">' + esc(ui.msg) + '</div>' : '') +
      '<div class="btnrow">' + (reg ? '<button class="btn" data-act="register">Crear cuenta</button>' : '<button class="btn" data-act="login">Entrar</button>') + '</div>' +
      (reg ? '<p class="mut" style="margin:.6rem 0 0">Al crear la cuenta recibes ' + 150 + ' monedas y un mazo inicial a tu elección.</p>' : '<p class="mut" style="margin:.6rem 0 0">¿Primera vez? Pulsa «Registrarse» para crear tu cuenta.</p>') + '</div></div>';
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
      return '<div class="skitem"><div class="skcard">' + cardHtml(c, { skin: s.id, lv: 1, extra: '<span class="eyeb" data-act="zoom" data-id="' + s.card + '" data-skin="' + s.id + '" title="Ver ampliada en 3D">' + ic('ojo') + '</span>' }) + '</div><b>' + esc(c.name) + '</b><span class="mut">' + esc(s.name) + '</span>' + btn + '</div>';
    }).join('') + '</div></div>';
  }
  function newCards(a) {
    var L = D.shop || [];
    if (!L.length) return '';
    return '<div class="panel skinshop"><h2>' + ic('estrella') + ' Cartas nuevas</h2><p class="mut">Cartas recién añadidas que puedes comprar directamente con monedas.</p><div class="skgrid">' + L.map(function (it) {
      var c = CARD[it.id], own = a.owned.indexOf(it.id) >= 0;
      var btn = own ? '<button class="btn sec sm" disabled>' + ic('check') + ' Ya la tienes</button>'
        : '<button class="btn sm" data-act="cardbuy" data-card="' + it.id + '"' + (a.coins < (a.admin ? 0 : it.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : it.price + ' ' + ic('moneda')) + '</button>';
      return '<div class="skitem"><div class="skcard">' + cardHtml(c, { lv: 1, extra: '<span class="eyeb" data-act="zoom" data-id="' + it.id + '" title="Ver ampliada en 3D">' + ic('ojo') + '</span>' }) + '</div><b>' + esc(c.name) + '</b>' + btn + '</div>';
    }).join('') + '</div></div>';
  }
  // ---------- Tienda ----------
  function skinBtn(a, s) {
    var hasCard = a.owned.indexOf(s.card) >= 0, own = (a.skins || []).indexOf(s.id) >= 0, eq = a.skinSel && a.skinSel[s.card] === s.id;
    return own ? (eq ? '<button class="btn sec sm" data-act="skinequip" data-skin="" data-card="' + s.card + '">' + ic('check') + ' Equipada · usar clásica</button>' : '<button class="btn sm" data-act="skinequip" data-skin="' + s.id + '" data-card="' + s.card + '">Equipar</button>')
      : !hasCard ? '<button class="btn sm" disabled>Necesitas la carta</button>'
      : '<button class="btn sm" data-act="skinbuy" data-skin="' + s.id + '"' + (a.coins < (a.admin ? 0 : s.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : s.price + ' ' + ic('moneda')) + '</button>';
  }
  function cardBtn(a, it) {
    return a.owned.indexOf(it.id) >= 0 ? '<button class="btn sec sm" disabled>' + ic('check') + ' Ya la tienes</button>'
      : '<button class="btn sm" data-act="cardbuy" data-card="' + it.id + '"' + (a.coins < (a.admin ? 0 : it.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : it.price + ' ' + ic('moneda')) + '</button>';
  }
  // Destacados: la última skin y las últimas cartas (lo más nuevo primero)
  function shopFeatured() {
    var SK = (window.CARTAS_SKINS || []).slice().reverse(), CL = (D.shop || []).slice().reverse(), out = [];
    if (SK[0]) out.push({ kind: 'skin', s: SK[0] });
    CL.slice(0, 3).forEach(function (it) { out.push({ kind: 'card', it: it }); });
    SK.slice(1, 3).forEach(function (s) { out.push({ kind: 'skin', s: s }); });
    CL.slice(3, 5).forEach(function (it) { out.push({ kind: 'card', it: it }); });
    return out.slice(0, 6);
  }
  function thc(c) { var t = c.theme || (c.themes && c.themes[0]); return t && D.themes[t] ? D.themes[t].color : '#a78bfa'; }
  function featInfo(f, a) {
    if (f.kind === 'skin') {
      var c = CARD[f.s.card];
      return { kicker: 'Nueva skin', title: c.name + ' · ' + f.s.name, sub: 'Cambia solo la ilustración de ' + c.name + '. Necesitas tener la carta.', price: f.s.price, btn: skinBtn(a, f.s), art: f.s.id, zoom: 'data-id="' + f.s.card + '" data-skin="' + f.s.id + '"', card: c, skin: f.s.id };
    }
    var cd = CARD[f.it.id];
    return { kicker: 'Carta nueva', title: cd.name, sub: cd.rarity + ' · ' + (cd.type === 'tropa' ? 'tropa' : 'acción') + (cd.text ? ' — ' + cd.text : '') + (cd.pas ? ' · ' + cd.pas.n : ''), price: f.it.price, btn: cardBtn(a, f.it), art: ARTS[cd.id] ? cd.id : '', zoom: 'data-id="' + cd.id + '"', card: cd, skin: '' };
  }
  function shopFeaturedHtml(a) {
    var F = shopFeatured(), h = '';
    if (!F.length) return '<p class="mut">Aún no hay novedades.</p>';
    var sel = Math.min(ui.shopSel || 0, F.length - 1), cur = featInfo(F[sel], a), tint = cur.card.themes && cur.card.themes[0] && D.themes[cur.card.themes[0]] ? D.themes[cur.card.themes[0]].color : (cur.card.theme && D.themes[cur.card.theme] ? D.themes[cur.card.theme].color : '#a78bfa');
    var banner = '<div class="shban' + (cur.art ? ' hasart' : ' nocard') + '" style="--tint:' + tint + ';' + (cur.art ? '--shart:url(/cartas/art/' + cur.art + '.webp)' : '') + '" key="' + sel + '">' +
      (cur.art ? '' : '<div class="shcard">' + cardHtml(cur.card, { lv: 1 }) + '</div>') +
      '<div class="shtxt"><span class="shk">' + cur.kicker + '</span><h2>' + esc(cur.title) + '</h2><p>' + esc(cur.sub) + '</p><div class="shact">' + cur.btn + (a.admin ? '' : '') + '<span class="shpr">' + (cur.price ? ic('moneda') + ' ' + cur.price : '') + '</span><button class="btn sec sm" data-act="zoom" ' + cur.zoom + ' title="Ver ampliada en 3D">' + ic('ojo') + ' Ver en 3D</button></div></div>' +
      '<div class="shdots">' + F.map(function (x, k) { return '<button class="' + (k === sel ? 'on' : '') + '" data-act="shopsel" data-i="' + k + '">' + (k + 1) + '</button>'; }).join('') + '</div></div>';
    var tiles = [{ pack: true }].concat(F.map(function (x, k) { return { f: x, k: k }; }).filter(function (t) { return t.k !== sel; }).slice(0, 3));
    var side = '<div class="shtiles">' + tiles.map(function (t) {
      if (t.pack) return '<button class="shtile pack" data-act="shoptab" data-t="packs"><span class="shtv">' + bpkHtml('mini') + '</span><b>Sobre estándar</b><span class="shtp">' + (a.packCost ? ic('moneda') + ' ' + a.packCost : 'Gratis') + '</span></button>';
      var inf = featInfo(t.f, a);
      return '<button class="shtile" data-act="shopsel" data-i="' + t.k + '"><span class="shtv"' + (inf.art ? ' style="background-image:url(/cartas/art/' + inf.art + '.webp)"' : ' style="background-image:radial-gradient(circle at 50% 45%,' + hexMix(thc(inf.card), '#0b0716', .15) + ',' + hexMix(thc(inf.card), '#0b0716', .7) + ')"') + '>' + (inf.art ? '' : '<i class="shmini">' + (inf.card.theme && D.themes[inf.card.theme] ? tic(inf.card.theme) : ic('brillo')) + '</i>') + '</span><em>' + inf.kicker + '</em><b>' + esc(inf.title) + '</b><span class="shtp">' + ic('moneda') + ' ' + inf.price + '</span></button>';
    }).join('') + '</div>';
    var daily = '<div class="shstrip"><div class="shsl">' + ic('regalo') + '<div><b>Recompensa diaria</b><span>' + (a.dailyAvailable ? 'Cobra hoy +' + a.dailyCoins + ' monedas.' : 'Ya la cobraste hoy. Vuelve mañana.') + '</span></div></div>' + (a.dailyAvailable ? '<button class="btn" data-act="daily">' + ic('regalo') + ' Cobrar +' + a.dailyCoins + ' ' + ic('moneda') + '</button>' : '<span class="mut">' + ic('check') + ' Cobrada</span>') + '</div>';
    return '<div class="shfeat">' + banner + side + '</div>' + daily + shopInfoPanels(a);
  }
  function shopInfoPanels(a) {
    var total = D.cards.length + D.actions.length;
    return '<div class="shinfo">' + (a.admin ? adminStarters() : '') +
      '<div class="panel"><h2>Cómo conseguir monedas</h2><ul class="rules"><li><b>Recompensa diaria:</b> +' + a.dailyCoins + ' ' + ic('moneda') + ' cada día.</li><li><b>Partidas contra la IA:</b> +10 ' + ic('moneda') + ' por partida y +20 ' + ic('moneda') + ' más si ganas (hoy llevas ' + a.gamesToday + '/' + a.maxGamesToday + ' partidas con premio). Las partidas muy cortas no dan monedas.</li><li><b>Cartas repetidas:</b> no dan monedas, pero suben la carta de nivel.</li></ul></div>' +
      '<div class="panel"><h2>Tu colección</h2><div class="coinbig">' + a.owned.length + ' / ' + total + '</div><div class="meter colm"><i class="on" style="width:' + Math.round(a.owned.length / total * 100) + '%"></i></div><p class="mut">Solo puedes usar en tu mazo las cartas que tienes.</p><button class="btn sec" data-act="nav" data-to="deck">' + ic('cartas') + ' Ir al mazo</button></div></div>';
  }
  function packsTab(a) {
    var can = a.coins >= a.packCost && !ui.pack;
    return '<div class="packs-grid one"><div class="panel packbox">' + bpkHtml('') + '<h2>Sobre estándar</h2><p class="mut">' + a.packSize + ' cartas al azar de todo el juego (tropas y acciones). La última siempre es Rara o mejor. Las cartas que ya tengas se cambian por monedas.</p>' +
      '<button class="btn cta big" data-act="openpack"' + (can ? '' : ' disabled') + '>' + (a.packCost ? 'Abrir sobre · ' + a.packCost + ' ' + ic('moneda') + '' : 'Abrir sobre · gratis') + '</button>' + (a.coins < a.packCost ? '<p class="mut">Te faltan ' + (a.packCost - a.coins) + ' monedas.</p>' : '') + (ui.msg ? '<div class="hint" style="color:var(--bad)">' + esc(ui.msg) + '</div>' : '') + '</div></div>';
  }
  var SHTABS = [['feat', 'Destacados'], ['packs', 'Sobres'], ['skins', 'Skins'], ['cards', 'Cartas']];
  function renderPacks() {
    var a = ui.acct, tab = ui.shopTab || 'feat';
    var body = tab === 'packs' ? packsTab(a) : tab === 'skins' ? (skinShop(a) || '<p class="mut">Aún no hay skins a la venta.</p>') : tab === 'cards' ? (newCards(a) || '<p class="mut">Aún no hay cartas nuevas a la venta.</p>') : shopFeaturedHtml(a);
    var h = head('packs', ic('tienda') + ' Tienda') + '<div class="shtabs">' + SHTABS.map(function (t) { return '<button class="' + (t[0] === tab ? 'on' : '') + '" data-act="shoptab" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '<span class="navsp"></span><span class="shcoin">' + ic('moneda') + ' ' + a.coins + '</span></div>' +
      (ui.msg && tab !== 'packs' ? '<p class="err">' + esc(ui.msg) + '</p>' : '') + '<div class="shbody">' + body + '</div>';
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
  var QMODES = [
    { id: 'classic', name: 'Clásico', icon: 'escudo', sub: 'Las tropas que caen se pierden', desc: 'Las tropas que caen se pierden. Gana quien se queda con tropas en pie y deja sin vida al rival.' },
    { id: 'revive', name: 'Resurrección', icon: 'cambio', sub: 'Las tropas reviven cada ronda', desc: 'Las tropas reviven cada ronda y al atacar también recibes el ataque de la carta atacada.' },
  ];
  var QART = {
    ia: { classic: { '1v1': 'dashlight-akali', vs4: 'aitorlg-koisito' }, revive: { '1v1': 'chipy-lloron', vs4: 'potango' } },
    pl: { classic: { '1v1': 'hellbramn', vs4: 'pampert-friki' }, revive: { '1v1': 'haikyuu-lihone', vs4: 'mertens-prime' } },
  };
  var QOPTS = {
    ia: [
      { id: '1v1', icon: 'espadas', name: '1 contra 1', sub: 'Duelo contra una IA con tu mazo.', act: { classic: 'startai', revive: 'startrev' } },
      { id: 'vs4', icon: 'grupo', name: 'Versus de 4', sub: 'Tú contra 3 IAs, cada una con un mazo distinto. Duelos rotando hasta que quede uno.', act: { classic: 'startvs4b', revive: 'startrevvs4b' } },
    ],
    pl: [
      { id: '1v1', icon: 'espadas', name: '1 contra 1', sub: 'Reta a otro jugador. Sala con código o búsqueda automática.', act: { classic: 'openpvp', revive: 'openrevpvp' } },
      { id: 'vs4', icon: 'grupo', name: 'Versus de 4', sub: 'Cuatro jugadores, duelos rotando hasta que quede uno. Sala con código o búsqueda.', act: { classic: 'openvs4', revive: 'openrevvs4' } },
    ],
  };
  function tutDone() { try { return localStorage.getItem('tcg_tut') === '1'; } catch (e) { return false; } }
  function tutStrip() {
    return '<div class="qtut"><img src="/cartas/tutor/guia.webp" alt=""><div class="qtt"><span class="qtk">Aprende a jugar</span><b>Tutorial</b><span>Una partida guiada y siempre igual: la tienda, las sinergias, la mejora de estadísticas, tu vida y las rondas.' + (tutDone() ? ' ' + ic('check') + ' Completado' : '') + '</span></div><button class="btn big" data-act="tutstart">' + ic('libro') + ' ' + (tutDone() ? 'Repetir tutorial' : 'Empezar tutorial') + '</button></div>';
  }
  function renderModes() {
    var qt = ui.qt === 'pl' ? 'pl' : 'ia', qm = QMODES.filter(function (m) { return m.id === ui.qm; })[0] || QMODES[0], qo = ui.qo === 'vs4' ? 'vs4' : '1v1';
    var opts = QOPTS[qt], cur = opts.filter(function (o) { return o.id === qo; })[0];
    var fx = ui.qfx || ''; ui.qfx = '';
    app.innerHTML = head('play', '' + ic('espadas') + ' Elige modo de juego') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') +
      tutStrip() + '<div class="qsel' + (fx ? ' fx-' + fx : '') + '">' +
      '<div class="qtypes"><button class="' + (qt === 'ia' ? 'on' : '') + '" data-act="qtype" data-v="ia">' + ic('robot') + ' Contra IA</button><button class="' + (qt === 'pl' ? 'on' : '') + '" data-act="qtype" data-v="pl">' + ic('grupo') + ' Contra jugadores</button></div>' +
      '<div class="qmodes">' + QMODES.map(function (m) { return '<button class="qmode' + (m === qm ? ' on' : '') + '" data-act="qmode" data-v="' + m.id + '"><span class="qframe">' + ic(m.icon) + '</span><b>' + m.name + '</b><span class="qsub">' + m.sub + '</span></button>'; }).join('') + '</div>' +
      '<div class="qbody" style="--qart:url(/cartas/art/' + QART[qt][qm.id][qo] + '.webp)"><div class="qleft"><p class="qdesc">' + qm.desc + '</p><p class="qdeck">Tu mazo actual (' + deckSize() + '/' + CFG.deckBudget + ') se usará en cualquier modo.</p>' +
      '<div class="qopts">' + opts.map(function (o) { return '<button class="qopt' + (o === cur ? ' on' : '') + '" data-act="qopt" data-v="' + o.id + '"><i class="qdia"></i><span class="qot"><b>' + ic(o.icon) + ' ' + o.name + '</b><span>' + o.sub + '</span></span></button>'; }).join('') + '</div>' +
      '<p class="qnote ' + (qt === 'ia' ? 'ia' : 'pl') + '">' + (qt === 'ia' ? 'Contra IA: menos monedas y sin puntos de clasificación.' : 'Contra jugadores: puntúan en la clasificación.') + '</p></div><div class="qart" aria-hidden="true"></div></div>' +
      '<div class="qconfirm"><button class="qgo" data-act="' + cur.act[qm.id] + '"><span class="qx">' + ic('avance') + '</span><span class="qgot">Confirmar</span></button></div></div>';
  }
  function themeCards(t) { return D.cards.filter(function (c) { return c.themes.indexOf(t) >= 0; }).concat(D.actions.filter(function (a) { return a.theme === t; })); }
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
  // Cada Correa tiene su novia: una miniatura en la carta permite alternar entre los dos
  var GIRL = { 'lihone-correa': 'eriko', 'dashlight-correa': 'helena', 'potango': 'lucia', 'chipy-correa': 'ari' };
  function deckCard(c) {
    var inn = ui.deck.indexOf(c.id) >= 0, own = owns(c.id), gid = GIRL[c.id], show = c, thumb = '';
    if (gid) {
      var girlView = !!(ui.novView && ui.novView[c.id]);
      thumb = '<span class="novt" data-act="novtog" data-id="' + c.id + '" title="' + (girlView ? 'Ver a ' + esc(c.name) : 'Ver a ' + esc(CARD[gid].name) + ', su novia') + '"><img src="/cartas/art/' + (girlView ? c.id : gid) + '.webp" alt=""></span>';
      if (girlView) show = CARD[gid];
    }
    return cardHtml(show, { lv: own ? lvOf(c.id) : 1, size: true, cls: (inn ? 'in' : '') + (own ? '' : ' locked'), extra: '<span class="eyeb" data-act="zoom" data-id="' + show.id + '" title="Ver ampliada en 3D">' + ic('ojo') + '</span>' + thumb + (own ? '' : '<span class="lockb">' + ic('candado') + '</span>'), attrs: 'data-act="toggle" data-id="' + c.id + '"', tag: 'button' });
  }
  function byLv(arr) { if (!ui.sortLv) return arr; return arr.map(function (c, i) { return [c, i]; }).sort(function (a, b) { return (owns(b[0].id) ? lvOf(b[0].id) : 1) - (owns(a[0].id) ? lvOf(a[0].id) : 1) || a[1] - b[1]; }).map(function (x) { return x[0]; }); }
  function filtered() {
    var f = ui.filters, all = byLv(D.cards.concat(D.actions)).filter(function (c) { return (!ui.onlyOwned || owns(c.id)) && (!ui.onlyDeck || ui.deck.indexOf(c.id) >= 0) && (!ui.rar.length || ui.rar.indexOf(c.rarity) >= 0); });
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
    h += '<div class="bar" style="margin:.2rem 0 .6rem"><label class="grp"><input type="checkbox" data-act="groupr"' + (ui.groupRar ? ' checked' : '') + '> Agrupar por rareza</label><label class="grp"><input type="checkbox" data-act="group"' + (ui.group ? ' checked' : '') + '> Agrupar por sinergia</label><label class="grp"><input type="checkbox" data-act="onlyowned"' + (ui.onlyOwned ? ' checked' : '') + '> Solo mis cartas (' + ui.acct.owned.length + '/' + (D.cards.length + D.actions.length) + ')</label>' + '<label class="grp"><input type="checkbox" data-act="onlydeck"' + (ui.onlyDeck ? ' checked' : '') + '> Solo cartas del mazo (' + ui.deck.length + ')</label>' + '<label class="grp"><input type="checkbox" data-act="sortlv"' + (ui.sortLv ? ' checked' : '') + '> Ordenar por nivel de carta</label>';
    if (ui.filters.length > 1) h += '<span class="seg"><button class="' + (ui.fmode === 'any' ? 'on' : '') + '" data-act="fmode" data-m="any">Cualquiera de las elegidas</button><button class="' + (ui.fmode === 'all' ? 'on' : '') + '" data-act="fmode" data-m="all">Todas a la vez</button></span>';
    h += '</div>';
    var rf = function (c) { return !ui.rar.length || ui.rar.indexOf(c.rarity) >= 0; };
    if (ui.groupRar) {
      var lst = filtered();
      RARS.forEach(function (r) { var g = lst.filter(function (c) { return c.rarity === r; }); if (g.length) h += '<h3 class="gh"><span class="rtag" style="--tc:' + RCOL[r] + '">' + r + '</span> <span class="mut">' + g.length + '</span></h3><div class="deckgrid">' + g.map(deckCard).join('') + '</div>'; });
      if (!lst.length) h += '<p class="mut">Ninguna carta cumple los filtros.</p>';
    } else if (ui.group && !ui.filters.length) {
      Object.keys(D.themes).forEach(function (t) { var g = byLv(themeCards(t).filter(rf)); if (g.length) h += '<h3 class="gh">' + tagHtml(t) + '</h3><div class="deckgrid">' + g.map(deckCard).join('') + '</div>'; });
      var ga = byLv(D.actions.filter(function (a) { return !a.theme; }).filter(rf)); if (ga.length) h += '<h3 class="gh">Acciones</h3><div class="deckgrid">' + ga.map(deckCard).join('') + '</div>';
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
      PV.wait = null; ui.msg = d.error || 'Sin conexión con el servidor.'; if (ui.screen === 'pvp' || ui.screen === 'modes') render(); return;
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
    var keepOne = P.hand.some(function (i) { return i && i.id === 'chipy-correa'; });
    var dbl = P.fl && P.fl.anime ? ' <b>(duplicado por Capítulo especial)</b>' : '', ready = A.from != null && A.to != null;
    return '<div class="overlay animeov"><div class="panel animed"><h2>' + ic('tele') + ' Anime · ceder estadísticas</h2><p class="mut">Te quedan <b>' + P.anime + '</b> cesiones esta ronda' + dbl + '. Elige quién cede y quién recibe.</p>' +
      '<div class="anrow"><div><h3>Cede</h3>' + row('from') + '</div><span class="anarrow">→</span><div><h3>Recibe</h3>' + row('to') + '</div></div>' +
      '<div class="btnrow"><button class="btn big" data-act="cede" data-stat="atk"' + (ready ? '' : ' disabled') + '>Ceder todo el ataque</button><button class="btn big" data-act="cede" data-stat="hp"' + (ready ? '' : ' disabled') + '>Ceder la vida (' + (keepOne ? 'se queda con 1' : 'cae') + ')</button></div>' +
      '<p class="mut sm">' + (ready ? (keepOne ? 'Chipy Correa en tu mano: el que cede se queda con 1 de ataque o 1 de vida.' : 'Ataque: el que cede se queda a 0 de ataque. Vida: el que cede cae y el otro gana la mitad de su vida máxima.') : 'Pulsa una carta en cada columna.') + '</p>' +
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
    var w = PV.wait, v4 = ui.lobby === 'vs4', h = head('play', v4 ? '' + ic('grupo') + (PV.mode === 'revive' ? ' Resurrección · Versus de 4' : ' Versus de 4') : '' + ic('espadas') + (PV.mode === 'revive' ? ' Resurrección · 1 vs 1' : ' Jugador contra jugador'));
    if (w) {
      h += '<div class="panel pvpwait">' + (w.kind === 'code'
        ? '<h2>' + (v4 ? 'Sala de 4' : 'Sala creada') + '</h2><p class="mut">' + (v4 ? 'Pasa este código a 3 jugadores más. Cuando estéis los 4, empieza sola.' : 'Pásale este código a tu rival. Cuando lo escriba, la partida empieza sola.') + '</p><div class="pvpcode">' + esc(w.code || '·····') + '</div>'
        : '<h2>' + (v4 ? 'Buscando jugadores…' : 'Buscando rival…') + '</h2><p class="mut">' + (v4 ? 'Empieza al juntarse 4 jugadores buscando partida.' : 'Te emparejaremos con el primero que busque partida.') + '</p>') +
        (v4 && w.players ? '<div class="v4list"><b>' + w.players.length + '/4</b> ' + w.players.map(function (n) { return '<span>' + esc(n) + '</span>'; }).join('') + '</div>' : '') +
        '<div class="waitdots"><i></i><i></i><i></i></div><button class="btn sec" data-act="pvpcancel">Cancelar</button></div></div>';
      app.innerHTML = h; return;
    }
    h += '<p class="mut">Usarás tu mazo actual (' + deckSize() + '/' + CFG.deckBudget + '). ' + (v4 ? 'Empiezas con <b>' + (PV.mode === 'revive' ? 40 : 30) + ' de vida</b> y <b>14 de oro</b> (+3 por ronda). Ganas <b>+15</b> monedas por jugar y hasta <b>+45</b> más según tu puesto (1º +45, 2º +20, 3º +5). ' : 'Ganas <b>+15</b> monedas por partida y <b>+40</b> más si ganas. ') + 'Si abandonas o pierdes la conexión más de 60 s, quedas eliminado.</p>' +
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
  function startTutorial() {
    var T = window.CARTAS_TUT;
    ui.s = E.newGame(T.deck, T.opp, T.seed, { lv: [{}, {}], sk: [{}, {}] });
    ui.s.p[1].life = 40; // el rival aguanta más para que la práctica llegue hasta la segunda tienda
    ui.s.rep = 1; ui.reward = null; ui.tut = { i: 0 }; ui.botGame = false;
    ui.screen = 'game'; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = ''; ui.landed = null; ui.busy = false;
    window.scrollTo(0, 0); announce(); render();
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
    var has5 = (E.tiers(P).Correa || 0) >= 1 || !!view.mesa[side][4];
    var h = '<div class="row4 side' + side + (has5 ? ' has5' : '') + '">';
    view.mesa[side].forEach(function (v, k) {
      if (k === 4 && !has5) return;
      if (!v) {
        if (k === 4) { h += '<div class="cw"><div class="slot nov">' + ic('corazon') + ' Hueco 5<br><small>' + (mine ? 'Elige una novia abajo' : 'Novia') + '</small></div></div>'; return; }
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
        if (shop && I && E.isNov(I)) under += '<div class="mini"><button data-act="retire" data-slot="' + k + '">' + ic('deshacer') + ' Retirar</button></div>';
        else if (shop && I && E.has(I, 'Lol')) under += '<div class="mini"><button data-act="sell" data-from="mesa" data-i="' + k + '" title="Vender y recuperar su valor">' + ic('moneda') + ' Vender ' + E.sellValue(I) + '</button></div>';
        else if (shop && I && !E.has(I, 'Lol')) under += '<div class="mini"><button data-act="retire" data-slot="' + k + '">' + ic('deshacer') + ' Retirar</button><button data-act="sell" data-from="mesa" data-i="' + k + '" title="Vender y recuperar su valor">' + ic('moneda') + ' Vender ' + E.sellValue(I) + '</button></div>';
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
    var h = '<div class="gwrap' + (shopMode ? ' shopmode' : '') + '"><div class="top"><div><h1>Ronda ' + s.round + ' · ' + (s.shopOpen ? '' + ic('carrito') + ' Tienda' + (s.round === 1 ? ' inicial' : '') : '' + ic('espadas') + ' Combate') + (!s.shopOpen ? ' <span class="mut">· ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') + '</span>' : '') + '</h1></div><div><button class="lnk" data-act="menu" data-to="deck">' + ic('cartas') + ' Mazo</button> · <button class="lnk" data-act="menu" data-to="home">' + ic('casa') + ' Menú</button>' + (s.over ? '' : ui.tut ? ' · <button class="lnk surr" data-act="tutexit">' + ic('puerta') + ' Salir del tutorial</button>' : ' · <button class="lnk surr" data-act="surrender">' + ic('puerta') + ' Rendirse</button>') + '</div></div>' + timerHtml(prep || shop) + '';
    h += '<div class="gmain"><aside class="gl">' + boardHtml(s) + synergyHtml(P) + '</aside><section class="gc"><div class="board" id="board">';
    var ML = s.maxLife || CFG.life;
    if (s.vs4 && s.spec && ui.playing) h += '<div class="v4spec">' + ic('ojo') + ' Descansas: estás viendo el duelo <b>' + esc(s.spec[0]) + '</b> contra <b>' + esc(s.spec[1]) + '</b></div>';
    else if (s.vs4 && !shopMode && !s.rest) h += '<div class="v4vs"><span>Duelo contra</span><b>' + esc(PV.names[1]) + '</b></div>';
    if (!shopMode && (!s.rest || (s.spec && ui.playing))) h += '<div class="hud top">' + orb('life', view.life[1], ui.tut ? 40 : ML, s.spec && ui.playing ? esc(s.spec[1]) : PV.on ? esc(PV.names[1]) : 'Rival', 1) + '</div>' + mesaRow(1, view, s, false) + '<div class="gap"></div>';
    h += mesaRow(0, view, s, true);
    // HUD inferior: vida, oro y acciones
    var acts = '';
    if (ui.playing) acts = '<button class="btn sec" data-act="skip">' + ic('avance') + ' Saltar animación</button>';
    else if (s.phase === 'over') acts = '';
    else if (PV.on && PV.rdy[0]) acts = '<div class="hint">' + ic('reloj') + ' ' + (s.vs4 ? 'Esperando a los demás…' : 'Esperando al rival…') + '</div><div class="waitdots"><i></i><i></i><i></i></div>' + (s.phase === 'post' ? '' : '<button class="btn sec sm" data-act="unready" title="Volver a preparar tu turno">Cancelar</button>');
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

    // Novias (sinergia Correa): una sola en el hueco 5
    if (!ui.playing && s.phase === 'prep' && (E.tiers(P).Correa || 0) >= 1 && ((P.nvs && P.nvs.length) || P.mesa[4])) {
      h += '<div class="novwrap"><div class="hl">' + ic('corazon') + ' Tus novias · pulsa una para ponerla en el hueco 5 (solo una a la vez)</div><div class="novs">' + P.nvs.map(function (n, k) {
        return '<div class="cw">' + cardHtml(CARD[n.id], { atk: E.atk(n), hp: n.hp, max: E.maxHp(n), cls: 'hcard', attrs: 'data-act="novia" data-i="' + k + '" title="Pulsa para ponerla en el hueco 5"', tag: 'button' }) + '</div>';
      }).join('') + (P.mesa[4] ? '<div class="novon">En el hueco 5: <b>' + esc(CARD[P.mesa[4].id].name) + '</b></div>' : '') + '</div></div>';
    }
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
      h += '<div class="shopwrap"><div class="hl">' + ic('carrito') + ' Tienda' + (s.round === 1 ? ' (solo Comunes)' : '') + ' · pulsa una carta para comprarla' + (s.round === 1 && !s.vs4 ? ' · primer combate: ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') : '') + '</div>' + oddsHtml(s) + '<div class="shoprow">';
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
      h += '<div class="overlay ' + (win ? 'owin' : 'olose') + '">' + (win ? '<div class="confetti">' + conf + '</div>' : '') + '<div class="panel over"><div class="obig">' + (win ? '' + ic('trofeo') + '' : '' + ic('corazonroto') + '') + '</div><h2>' + (win ? '¡Victoria!' : (s.vs4 ? 'Eliminado · puesto ' + s.place + 'º de 4' : 'Derrota')) + '</h2><p class="mut">' + esc(s.reason) + ' · ronda ' + s.round + '</p>' + rw + '<button class="btn big" data-act="' + (PV.on ? (PV.px === 'vs4' ? (ui.botGame ? (PV.mode === 'revive' ? 'startrevvs4b' : 'startvs4b') : 'openvs4') : 'openpvp') : 'play') + '">' + (PV.on ? 'Otra partida' : 'Jugar otra vez') + '</button> <button class="btn sec" data-act="menu" data-to="deck">Cambiar mazo</button> <button class="btn sec" data-act="menu" data-to="home">Menú</button></div></div>';
    }
    if (ui.confirmSurr && !s.over) h += '<div class="overlay surro"><div class="panel surrp"><h2>' + ic('aviso') + ' ¿Seguro que quieres rendirte?</h2><p class="mut">Darás la partida por perdida' + (s.vs4 ? ' y quedarás eliminado.' : '.') + ' Esta acción no se puede deshacer.</p><div class="btnrow"><button class="btn" data-act="surrender-yes">Sí, rendirme</button><button class="btn sec" data-act="surrender-no">Cancelar</button></div></div></div>';
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
  var FXICON = { pereza: 'sofa', duo: 'duo', novia: 'corazon', eriko: 'corazon', lucia: 'ojo', pueblo: 'pueblo', nini: 'sofa', voley: 'voley', comeback: 'fuego', tilt: 'enfado', koi: 'trofeo', trabajo: 'maletin' };
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
    if (prev) { // daño de pasivas y de área: cualquier tropa que pierde vida sin ser el objetivo ni el atacante con contraataque
      var pa = map(prev), pb = map(f.view);
      Object.keys(pb).forEach(function (u) {
        var x = pa[u], y = pb[u]; if (!x || y.max < x.max) return;
        var dh = x.hp - y.hp; if (dh <= 0) return;
        if (hl && hl.tgt === +u && hl.dmg > 0) return;
        if (hl && hl.att === +u && hl.rec > 0) return;
        out.push({ uid: +u, text: '-' + dh, cls: 'dmg', delay: .7 });
      });
    }
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
  var ROUTES = { home: 'inicio', modes: 'jugar', pvp: 'jugar', game: 'jugar', deck: 'mazo', packs: 'tienda', profile: 'perfil', ladder: 'clasificacion' };
  var ROUTE_SCREEN = { inicio: 'home', jugar: 'modes', mazo: 'deck', tienda: 'packs', perfil: 'profile', clasificacion: 'ladder' };
  var ROUTE_TITLE = { home: 'Inicio', modes: 'Jugar', pvp: 'Jugar', game: 'Partida', deck: 'Mazo', packs: 'Tienda', profile: 'Perfil', ladder: 'Clasificación' };
  function hashScreen() { var m = /^#\/([a-z]+)/.exec(location.hash || ''); return m && ROUTE_SCREEN[m[1]] || null; }
  function landing() { var sc = hashScreen() || 'home'; if (sc === 'modes' && deckError()) sc = 'deck'; return sc; }
  function syncHash() {
    if (!ui.acct || !ROUTES[ui.screen]) { if (!ui.acct) document.title = 'TCG Arena'; return; }
    document.title = ROUTE_TITLE[ui.screen] + ' · TCG Arena';
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
    var f = { home: renderHome, deck: renderDeck, modes: renderModes, pvp: renderPvp, login: renderLogin, starter: renderStarter, packs: renderPacks, profile: renderProfile, ladder: renderLadder, boot: renderBoot }[ui.screen];
    if (f) f(); else renderGame();
    if (ui.tut && ui.screen !== 'game') ui.tut = null;
    if (ui.tut) tutCheck(); else tutClear();
    syncHash();
  }

  // ---------- Tutorial: bocadillos del guía ----------
  function tutStage(s) { return s.round * 2 + (s.shopOpen ? 0 : 1); }
  function tutClear() {
    tutHide();
    document.body.classList.remove('tutmode');
    if (ui.tutTm) { clearTimeout(ui.tutTm); ui.tutTm = null; }
  }
  function tutExit(done) {
    if (done) { try { localStorage.setItem('tcg_tut', '1'); } catch (e) {} }
    clearTimeout(timer); timer = null; ui.playing = false; ui.tut = null; ui.s = null; ui.screen = 'modes'; tutClear(); window.scrollTo(0, 0); render();
  }
  function tutHide() { var o = document.getElementById('tut'); if (o) o.remove(); if (ui.tutAnim) { clearInterval(ui.tutAnim); ui.tutAnim = null; } }
  function tutCheck() {
    var T = ui.tut, CT = window.CARTAS_TUT, s = ui.s;
    if (!T || !s || ui.screen !== 'game') return tutClear();
    document.body.classList.add('tutmode');
    if (ui.tutTm) { clearTimeout(ui.tutTm); ui.tutTm = null; }
    if (ui.playing || ui.busy || Date.now() < Math.max(ui.splashUntil || 0, ui.actNext || 0) + 250) { tutHide(); ui.tutTm = setTimeout(tutCheck, 350); return; }
    var S = CT.steps, last = S.length - 1;
    if (s.over) T.i = last;
    while (T.i < last && S[T.i].st < tutStage(s)) T.i++;
    var st = S[T.i];
    if (st.kind === 'task' && st.done(s, ui)) { T.i++; return tutCheck(); }
    if (st.st > tutStage(s) && !s.over) return tutHide();
    tutShow(st, T.i, S.length, s.over);
  }
  function tutShow(st, i, n, over) {
    var o = document.getElementById('tut'), say = st.kind === 'say', pose = st.pose === 'b' ? 'guia-enfadado' : 'guia';
    var txt = over && st.fin ? window.CARTAS_TUT.over : st.text;
    var html = '<div class="tut-spot"></div><div class="tut-char"><img class="tc0' + (pose === 'guia' ? ' on' : '') + '" src="/cartas/tutor/guia.webp" alt=""><img class="tc1' + (pose === 'guia' ? '' : ' on') + '" src="/cartas/tutor/guia-enfadado.webp" alt=""></div><div class="tut-bub"><span class="tut-prog">' + (i + 1) + ' / ' + n + '</span><p>' + txt + '</p>' +
      (say ? '<button class="btn tut-next" data-tut="next">' + (st.btn || 'Siguiente') + ' ▶</button>' : '<span class="tut-wait">' + ic('diana') + ' Haz lo que te pido para continuar</span>') + '</div><button class="tut-exit" data-tut="exit">' + ic('puerta') + ' Salir del tutorial</button>';
    if (!o) { o = document.createElement('div'); o.id = 'tut'; document.body.appendChild(o); }
    var key = i + (over ? 'o' : '');
    if (o.dataset.key !== key) { o.dataset.key = key; o.innerHTML = html; o.classList.remove('pop'); void o.offsetWidth; o.classList.add('pop'); }
    o.className = 'tut ' + (say ? 'k-say' : 'k-task') + ' side-' + (st.side === 'l' ? 'l' : 'r') + ' pop';
    o.onclick = function (e) {
      var b = e.target.closest('[data-tut]'); if (!b) return;
      if (b.dataset.tut === 'exit') return tutExit();
      if (b.dataset.tut === 'next') { if (st.fin) return tutExit(true); ui.tut.i++; tutCheck(); }
    };
    if (!ui.tutAnim) ui.tutAnim = setInterval(function () { var c = document.querySelectorAll('#tut .tut-char img'); if (c.length === 2) { c[0].classList.toggle('on'); c[1].classList.toggle('on'); } }, 900);
    tutSpot(st.hl);
    if (st.hl && !o._rs) { o._rs = 1; window.addEventListener('resize', function () { if (ui.tut) tutSpot(ui.tutHl); }); }
  }
  function tutSpot(sel) {
    ui.tutHl = sel;
    var o = document.getElementById('tut'); if (!o) return;
    var sp = o.querySelector('.tut-spot'), el = sel ? document.querySelector(sel) : null;
    if (!el) { sp.style.display = 'none'; o.classList.add('nohl'); return; }
    o.classList.remove('nohl');
    var r = el.getBoundingClientRect();
    if (r.top < 60 || r.bottom > window.innerHeight - 20) { el.scrollIntoView({ block: 'center' }); r = el.getBoundingClientRect(); }
    var pad = 8; sp.style.display = 'block';
    sp.style.left = (r.left - pad) + 'px'; sp.style.top = (r.top - pad) + 'px'; sp.style.width = (r.width + pad * 2) + 'px'; sp.style.height = (r.height + pad * 2) + 'px';
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
    if (s.shopOpen && s.round === 1 && !s.vs4 && !ui.tut) { // tienda inicial: la moneda decide quién ataca primero en el primer combate (para saber dónde colocar)
      var rs = s;
      setTimeout(function () { if (ui.s === rs && ui.screen === 'game' && rs.round === 1 && rs.shopOpen) coinFlip(rs.first); }, 1600);
    }
    if (s.shopOpen) showSplash({ kind: 'shop', title: '' + ic('carrito') + ' ¡RONDA DE TIENDA!', sub: s.round === 1 ? 'Compra tus primeras tropas · no hay combate' : 'Compra, coloca y retira tropas · no hay combate' });
    else showSplash({ kind: 'combat', title: '' + ic('espadas') + ' RONDA ' + s.round, sub: s.first === 0 ? 'Atacas primero' : 'Ataca primero el rival' });
    if (ui.tut) ui.deadline = null;
  }
  // Moneda al inicio del combate: gira y cae del lado de quien ataca primero
  function coinFlip(first) {
    var old = document.getElementById('coinov'); if (old) old.remove();
    var el = document.createElement('div'); el.id = 'coinov'; el.className = 'coinov';
    el.innerHTML = '<div class="coinhop"><div class="coin3d ' + (first === 0 ? 'me' : 'foe') + '"><div class="cf cfm">TÚ</div><div class="cf cfr">RIVAL</div></div></div><div class="coinlbl ' + (first === 0 ? 'me' : 'foe') + '">' + (first === 0 ? 'Primer combate: ¡atacas primero!' : 'Primer combate: ¡ataca primero el rival!') + '</div>';
    document.body.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.remove(); }, 2300);
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
    var cv = document.getElementById('coinov'); if (cv) cv.remove();
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
    if (act === 'pinshow') { ui.showPin = !ui.showPin; app.querySelectorAll('#lg-pin,#lg-pin2').forEach(function (i) { i.type = ui.showPin ? 'text' : 'password'; }); app.querySelectorAll('.pineye').forEach(function (b) { b.classList.toggle('on', ui.showPin); b.title = ui.showPin ? 'Ocultar PIN' : 'Ver PIN'; }); return; }
    if (act === 'lgtab') { var ln = document.getElementById('lg-name'); if (ln) ui.lgName = ln.value; ui.lgTab = el.dataset.t; ui.msg = ''; return render(); }
    if (act === 'register') {
      var rn = document.getElementById('lg-name').value.trim(), rp = document.getElementById('lg-pin').value, rp2 = document.getElementById('lg-pin2').value; ui.lgName = rn;
      if (rn.length < 3 || rn.length > 16) { ui.msg = 'El nombre debe tener entre 3 y 16 caracteres.'; return render(); }
      if (!/^\d{4}$/.test(rp)) { ui.msg = 'El PIN son 4 dígitos.'; return render(); }
      if (rp !== rp2) { ui.msg = 'Los dos PIN no coinciden.'; return render(); }
      ui.lgPin = rp; ui.msg = ''; ui.screen = 'starter'; return render();
    }
    if (act === 'adminstarter' || act === 'adminall') {
      return api(act, { starter: el.dataset.t }).then(function (r) {
        if (!r.ok) { ui.msg = (r.data && r.data.error) || 'Error.'; return render(); }
        setAcct(r.data.user); ui.deck = []; ui.slots = [null, null, null]; saveDeck(); try { localStorage.removeItem(lk('slots')); } catch (e) {}
        ui.msg = act === 'adminall' ? 'Colección completa restaurada.' : 'Colección reiniciada como jugador nuevo con el mazo «' + el.dataset.t + '» (' + r.data.user.owned.length + ' cartas).'; render();
      });
    }
    if (act === 'backlogin') { ui.screen = 'login'; ui.lgTab = 'reg'; ui.lgPin = ''; ui.msg = ''; return render(); }
    if (act === 'login' || act === 'pickstarter') {
      var nm = act === 'login' ? document.getElementById('lg-name').value : ui.lgName, pn = act === 'login' ? document.getElementById('lg-pin').value : ui.lgPin; ui.lgName = nm;
      return api(act === 'login' ? 'login' : 'register', { name: nm, pin: pn, starter: el.dataset.t }).then(function (r) {
        if (!r.ok) { ui.msg = (r.data && r.data.error) || 'No se pudo entrar.'; ui.screen = 'login'; ui.lgTab = act === 'login' ? 'login' : 'reg'; return render(); }
        try { localStorage.setItem('cartas_tok', r.data.token); } catch (e) {}
        ui.msg = ''; ui.lgPin = ''; setAcct(r.data.user); loadLocal(); ui.screen = landing(); render();
      });
    }
    if (act === 'qtype') { if (ui.qt === el.dataset.v) return; ui.qt = el.dataset.v; ui.qfx = 'opt'; return renderModes(); }
    if (act === 'qmode') { if (ui.qm === el.dataset.v) return; ui.qm = el.dataset.v; ui.qfx = 'mode'; return renderModes(); }
    if (act === 'qopt') { if (ui.qo === el.dataset.v) return; ui.qo = el.dataset.v; ui.qfx = 'opt'; return renderModes(); }
    if (act === 'cardbuy') return api('cardBuy', { id: el.dataset.card }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); ui.msg = r.ok ? '' : (r.data.error || ''); render(); });
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
    if (act === 'shoptab') { ui.shopTab = el.dataset.t; ui.msg = ''; return render(); }
    if (act === 'shopsel') { ui.shopSel = +el.dataset.i; ui.shopTab = 'feat'; return render(); }
    if (act === 'newssel') { ui.newsSel = +el.dataset.i; ui.newsFull = false; return refreshNews(); }
    if (act === 'newsmore') { ui.newsFull = !ui.newsFull; return refreshNews(); }
    if (act === 'setavatar') { return api('avatarSet', { card: el.dataset.card }).then(function (r) { if (r.ok) { setAcct(r.data.user); ui.msg = ''; } else ui.msg = (r.data && r.data.error) || 'No se pudo cambiar la foto.'; render(); }); }
    if (act === 'tutstart') return startTutorial();
    if (act === 'tutexit') { tutExit(); return; }
    if (ui.tut && act === 'refresh') return;
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
    if (act === 'sortlv') { ui.sortLv = el.checked; return render(); }
    if (act === 'introplay') { e.preventDefault(); openIntro(); return; }
    if (act === 'zoom') { e.stopPropagation(); openZoom(el.dataset.id, el.dataset.skin || ''); return; }
    if (act === 'novtog') { e.stopPropagation(); ui.novView = ui.novView || {}; ui.novView[el.dataset.id] = !ui.novView[el.dataset.id]; var y0 = window.scrollY; renderDeck(); window.scrollTo(0, y0); return; }
    if (act === 'onlydeck') { ui.onlyDeck = el.checked; return render(); }
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
      ui.botGame = false;
      if (deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'pvp'; ui.lobby = 'pvp'; PV.mode = act === 'openrevpvp' ? 'revive' : '';
      return api('pvpPoll', {}).then(function (r) { if (r.ok && r.data.s && !r.data.s.over) return pvpBegin(r.data); ui.screen = 'pvp'; window.scrollTo(0, 0); render(); });
    }
    if (act === 'openvs4' || act === 'openrevvs4') {
      ui.botGame = false; PV.mode = act === 'openrevvs4' ? 'revive' : '';
      if (deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'vs4'; ui.lobby = 'vs4';
      return api('vs4Poll', {}).then(function (r) {
        if (r.ok && r.data.s && !r.data.s.over) return pvpBegin(r.data);
        if (r.ok && r.data.wait) { PV.wait = { kind: 'code', code: r.data.code, players: r.data.players }; ui.screen = 'pvp'; render(); return pvpSchedule(1500); }
        ui.screen = 'pvp'; window.scrollTo(0, 0); render();
      });
    }
    if (act === 'startvs4b' || act === 'startrevvs4b') {
      if (deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'vs4'; ui.lobby = 'vs4'; PV.mode = act === 'startrevvs4b' ? 'revive' : ''; ui.botGame = true;
      return api('vs4Bots', { deck: ui.deck, mode: PV.mode }).then(pvpGot);
    }
    if (act === 'pvpsearch') { PV.wait = { kind: 'search' }; ui.msg = ''; render(); return api(PV.px + 'Search', { deck: ui.deck, mode: PV.mode }).then(pvpGot); }
    if (act === 'pvpcreate') { PV.wait = { kind: 'code', code: '' }; ui.msg = ''; render(); return api(PV.px + 'Create', { deck: ui.deck, mode: PV.mode }).then(pvpGot); }
    if (act === 'pvpjoin') { var jc = (document.getElementById('pvp-code').value || '').trim(); if (jc.length !== 5) { ui.msg = 'El código tiene 5 letras.'; return render(); } ui.msg = ''; return api(PV.px + 'Join', { deck: ui.deck, code: jc }).then(pvpGot); }
    if (act === 'pvpcancel') { pvpCancelWait(); return render(); }
    if (act === 'startai' || act === 'startrev') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); ui.mode = act === 'startrev' ? 'revive' : ''; return startGame(); }
    if (act === 'play') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); return startGame(); }
    if (act === 'skip') { clearTimeout(timer); ui.shown = ui.frames.length; return stopPlay(); }
    if (act === 'surrender') { if (s && !s.over) { ui.confirmSurr = true; render(); } return; }
    if (act === 'surrender-no') { ui.confirmSurr = false; return render(); }
    if (act === 'surrender-yes') {
      ui.confirmSurr = false;
      if (!s || s.over) return render();
      if (PV.on) { PV.rdy[0] = false; api(PV.px + 'Leave', { id: PV.id }).then(function (r) { pvpGot(r); }); return render(); }
      clearTimeout(timer); timer = null; ui.playing = false; ui.view = null; ui.hl = null; ui.floats = []; ui.deadline = null; ui.busy = false; ui.sel = null; ui.hint = '';
      var cv = document.getElementById('coinov'); if (cv) cv.remove();
      E.forfeit(s, 0, 'Te has rendido: derrota.'); return render();
    }
    if (!s || ui.playing) return;
    if (act === 'unready') { if (PV.on && PV.rdy[0]) { PV.rdy[0] = false; ui.hint = ''; pvpSend('unready'); render(); } return; }
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
        if (!P.mesa.slice(0, 4).some(function (x) { return !x; })) { ui.hint = 'La mesa está llena: solo puedes retirar tropas en la tienda.'; ui.sel = null; }
        else { ui.sel = { k: 'hand', i: i }; ui.hint = 'Pulsa un hueco libre para colocarla.'; }
      } else if (s.shopOpen) { ui.hint = 'Las acciones se juegan en las rondas de combate.'; ui.sel = null; }
      else if (c.target === 'none') { ui.hint = E.playAction(s, 0, i, null) ? (pvs('action', [i, null]), '') : s.err; ui.sel = null; }
      else { ui.sel = { k: 'act', i: i }; ui.hint = c.target === 'ally' ? 'Elige una tropa tuya en la mesa.' : 'Elige una tropa rival.'; }
      return render();
    }
    if (act === 'novia') {
      var nk = +el.dataset.i;
      if (E.place(s, 0, -1 - nk, 4)) { ui.landed = s.p[0].mesa[4].uid; pvs('place', [-1 - nk, 4]); ui.hint = ''; } else ui.hint = 'No se puede colocar ahora.';
      ui.sel = null; if (!s.shopOpen) nextPending(s);
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
    if (c.type === 'tropa') { if (!P.mesa.slice(0, 4).some(function (x) { return !x; })) return false; ui.sel = { k: 'hand', i: drag.i }; ui.hint = 'Suéltala sobre un hueco libre.'; }
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
        var slotEl = t.closest('.slot.free'), onBoard = t.closest('#board'), idx = slotEl ? +slotEl.dataset.i : (onBoard ? P.mesa.slice(0, 4).indexOf(null) : -1);
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
  app.addEventListener('keydown', function (e) { if (e.key === 'Enter' && ui.screen === 'login' && e.target.id && e.target.id.indexOf('lg-') === 0) { var b = app.querySelector('[data-act=login],[data-act=register]'); if (b) b.click(); } });
  render();
  if (!getTok()) { ui.screen = 'login'; render(); }
  else api('me').then(function (r) {
    if (r.ok) { setAcct(r.data.user); loadLocal(); ui.screen = landing(); } else if (ui.screen === 'boot') ui.screen = 'login';
    render();
  });
})();
