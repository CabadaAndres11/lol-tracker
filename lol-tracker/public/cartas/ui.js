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
  function loadLocal() { loadLocal0(); if (!ui.slots.some(Boolean) && ui.deck.length >= 3) { ui.slots[0] = { name: 'Mi mazo', ids: ui.deck.slice(), cover: '' }; saveSlots(); } }
  function loadLocal0() {
    var sd = ui.acct && ui.acct.decks;
    if (sd) { // mazos guardados en la cuenta: se usan en cualquier dispositivo
      ui.deck = (sd.deck || []).filter(function (id) { return CARD[id] && owns(id); });
      ui.slots = [0, 1, 2].map(function (i) { var x = sd.slots && sd.slots[i]; return x && x.ids ? { name: String(x.name || 'Mazo'), ids: x.ids.filter(function (id) { return CARD[id] && owns(id); }), cover: String(x.cover || '') } : null; });
      try { localStorage.setItem(lk('deck'), JSON.stringify(ui.deck)); localStorage.setItem(lk('slots'), JSON.stringify(ui.slots)); } catch (e) {}
      return;
    }
    try { var sv = JSON.parse(localStorage.getItem(lk('deck')) || 'null'); ui.deck = sv && sv.length ? sv.filter(function (id) { return CARD[id] && owns(id); }) : []; } catch (e) { ui.deck = []; }
    ui.slots = [null, null, null];
    try { var sl = JSON.parse(localStorage.getItem(lk('slots')) || 'null'); if (sl && sl.length === 3) ui.slots = sl.map(function (x) { return x && x.ids ? { name: String(x.name || 'Mazo'), ids: x.ids.filter(function (id) { return CARD[id] && owns(id); }), cover: String(x.cover || '') } : null; }); } catch (e) {}
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
    'bola-extra': 'beisbol', 'segundo-aliento': 'viento', 'cambio-de-linea': 'cambio', parche: 'disquete', 'horas-extra': 'maletin', 'segunda-temporada': 'trofeo', 'campeones-de-europa': 'trofeo', 'remate-doble': 'voley', 'cita-sorpresa': 'corazon', 'rabia-contenida': 'enfado', 'fiesta-del-pueblo': 'fiesta', 'hermano-del-alma': 'duo', 'sofa-compartido': 'sofa', 'golpe-de-suerte': 'dado', genkidama: 'fuego', remedio: 'corazon', kamehameha: 'estrella', madrugon: 'reloj' };
  var ARTS = {"aitorlg-maomao":1,"chipy-goku":1,"dashlight-sun-jin-woo":1,"javihi-smiley":1,"lihone-rudeus":1,"mertens-meliodas":1,"pampert-asta":1,"eriko":1,"helena":1,"lucia":1,"ari":1,"aitorlg-friki":1,"aitorlg-koisito":1,"aitorlg-regla":1,"aitorlg-renata":1,"chipy-correa":1,"chipy-lloron":1,"computer-chipy":1,"computer-dashlight":1,"computer-hellbramn":1,"computer-lihone":1,"computer-petea":1,"dashlight-akali":1,"dashlight-correa":1,"haikyuu-lihone":1,"hellbramn":1,"javihi":1,"javihi-duo":1,"javihi-friki":1,"javihi-koisito":1,"javihi-prime":1,"lihone":1,"lihone-correa":1,"lihone-viego":1,"mertens":1,"mertens-gambler":1,"pampert-gambler":1,"mertens-prime":1,"pampert":1,"pampert-friki":1,"pampert-koisito":1,"petea-koisito":1,"petea-pokemaniaco":1,"potango":1,"sech":1,"sech-duo":1,"sech-koisito":1,"sech-thresh":1};
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
    var h = '<' + tag + ' class="card r-' + c.rarity + (troop ? '' : ' accion') + (art ? ' art' : '') + (o.slv && o.slv !== 'sin' ? ' slv-' + o.slv : '') + (o.cls ? ' ' + o.cls : '') + '" style="--c1:' + c1 + ';--c2:' + c2 + (art ? ';--art:url(/cartas/art/' + (o.skin || c.id) + '.webp)' : '') + '"' + (o.attrs ? ' ' + o.attrs : '') + '>';
    h += '<span class="rgem" title="Rareza: ' + c.rarity + '"><svg viewBox="0 0 20 24" aria-hidden="true"><path d="M10 0L20 8L10 24L0 8Z" fill="var(--gm)"/><path d="M10 0L20 8H0Z" fill="#fff" opacity=".38"/><path d="M10 0L14.5 8L10 24L5.5 8Z" fill="#fff" opacity=".2"/><path d="M0 8H20L10 24Z" fill="#000" opacity=".25"/><path d="M10 0L20 8L10 24L0 8Z" fill="none" stroke="rgba(255,255,255,.8)" stroke-width="1" stroke-linejoin="round"/></svg></span>';
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
      '<p class="zhint">Pulsa fuera de la animación para cerrarla</p></div>';
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


  // ---------- Pop-up de bienvenida de la versión 1.2 (Gambling) ----------
  function intro12Off() { try { return localStorage.getItem(lk('intro-v12')) === '1'; } catch (e) { return false; } }
  function maybeIntro12() {
    if (ui.intro12Seen || !ui.acct || intro12Off() || introEl) return;
    ui.intro12Seen = true;
    setTimeout(function () { if (ui.screen === 'home' && !introEl) openIntro12(); }, 700);
  }
  function openIntro12() {
    closeIntro();
    var chipsBg = '', q;
    for (q = 0; q < 10; q++) chipsBg += '<i class="i12chip" style="left:' + (4 + q * 10) + '%;--d:' + ((q * 7) % 10) * .55 + 's;--cc:' + ['#dc2626', '#111827', '#2563eb', '#16a34a', '#7c3aed'][q % 5] + '"></i>';
    var orbsHud = '', k;
    for (k = 0; k < 5; k++) orbsHud += '<span class="i12o" style="--i:' + k + '"><em>R' + (k + 1) + '</em></span>';
    var pile = ''; for (k = 0; k < 7; k++) pile += '<i class="i12chip f" style="left:' + (8 + k * 13) + '%;--d:' + (k * .45) + 's;--cc:' + ['#dc2626', '#2563eb', '#16a34a', '#7c3aed', '#111827'][k % 5] + '"></i>';
    var h = '<div class="intropanel"><div class="introst i12" data-sc="0"><div class="ibg i12bg">' + chipsBg + '</div>' +
      '<div class="ititle"><small>¡Ya está aquí la versión 1.2!</small><b>GAMBLING</b></div><span class="iver">v1.2</span>' +
      '<div class="c12 m">' + cardHtml(CARD['mertens-gambler'], { lv: 1 }) + '</div><div class="c12 p">' + cardHtml(CARD['pampert-gambler'], { lv: 1 }) + '</div>' +
      '<div class="i12s s1"><div class="i12hud"><span class="gl">' + ic('dado') + ' Orbes Gambling</span><div class="i12orbs">' + orbsHud + '</div><span class="i12n">una orbe por ronda sin daño directo</span></div></div>' +
      '<div class="i12s s2"><div class="i12w"><div class="rscene"><div class="rtilt"><div class="rrim"></div><div class="rwheel"></div><div class="rball"><i></i></div><div class="rpin"></div></div></div></div>' +
      '<div class="i12res"><b>+6</b><span>/+6</span></div><div class="i12cs"><span class="c2">+2</span><span class="c1">+1</span><span class="c3">+3</span></div></div>' +
      '<div class="i12b b1"><b>' + ic('dado') + ' Mala Racha <small>Épica</small></b><span>Si termina la ronda viva y tienes más de 10 orbes, se abre la mitad y sigues acumulando.</span></div>' +
      '<div class="i12b b2"><b>' + ic('dado') + ' Jackpot <small>Legendaria</small></b><span>Con 20 orbes o más y viva al final de la ronda: daño directo al rival y abre todas.</span></div>' +
      '<div class="i12s s4"><div class="i12int"><div class="i12gold">' + orb('gold', 10, 0, 'Tu oro') + '<i class="gint i12badge">+2 interés</i></div><div class="i12rows"><div><b>5</b> de oro <em>→ +1</em></div><div><b>10</b> de oro <em>→ +2</em></div><div><b>15+</b> de oro <em>→ +3</em></div><span>cobrado al empezar la siguiente ronda</span></div></div></div>' +
      '<div class="i12s s5"><div class="i12t t1"><div class="i12tv"><div class="i12cc">' + cardHtml(CARD['lihone-viego'], { lv: 1 }) + '</div>' + pile + '</div><b>Reparto de casino</b><span>Despliegue</span></div>' +
      '<div class="i12t t2"><div class="i12tv"><div class="i12cc">' + cardHtml(CARD['lihone-viego'], { lv: 1, slv: 'casino' }) + '</div></div><b>Casino</b><span>Funda</span></div>' +
      '<div class="i12t t3"><div class="i12tv"><div class="i12ban"><span>VICTORIA</span></div>' + pile + '</div><b>Mano ganadora</b><span>Victoria y derrota</span></div></div>' +
      '<div class="icap"><span></span></div></div>' +
      '<label class="ibtns inever"><input type="checkbox" data-i="never12"' + (intro12Off() ? ' checked' : '') + '> No mostrar más</label><p class="zhint">Pulsa fuera de la animación para cerrarla</p></div>';
    introEl = document.createElement('div'); introEl.className = 'introov'; introEl.innerHTML = h;
    document.body.appendChild(introEl);
    var st = introEl.querySelector('.introst'), cap = st.querySelector('.icap span');
    var CAPS = ['', 'Nueva sinergia Gambling: ganas una orbe por cada ronda sin recibir daño directo', 'Al recibir daño directo se abren todas las orbes en la ruleta y mejoran a tus Gambling', 'Dos nuevas Gambling con pasiva propia: Mertens Gambler y Pampert Gambler', 'Nuevo sistema de interés: ahorra oro y cobra un extra cada ronda', 'Nuevos efectos de casino en la tienda'];
    function spin() { // ruleta de la escena 2: misma animación que en partida, más corta
      var N = 24, win = 5 + Math.floor(Math.random() * 14), step = 360 / N, D = REDUCED ? 0 : 3600, w = st.querySelector('.rwheel'), b = st.querySelector('.rball'), bi = b.querySelector('i');
      w.innerHTML = gamWheelSvg(win, 6); st.style.setProperty('--k', (st.clientWidth / 780 * .78).toFixed(3));
      var wf = 360 * 3 - win * step;
      if (!D || !w.animate) { w.style.transform = 'rotate(' + wf + 'deg)'; st.classList.add('rdone'); return; }
      w.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + wf + 'deg)' }], { duration: D, fill: 'forwards', easing: 'cubic-bezier(.2,.55,.25,1)' });
      b.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(-2160deg)' }], { duration: D - 250, fill: 'forwards', easing: 'cubic-bezier(.25,.5,.3,1)' });
      bi.animate([{ transform: 'translateY(-178px)', offset: 0 }, { transform: 'translateY(-178px)', offset: .55 }, { transform: 'translateY(-158px)', offset: .8 }, { transform: 'translateY(-149px)', offset: .9 }, { transform: 'translateY(-156px)', offset: .95 }, { transform: 'translateY(-154px)', offset: 1 }], { duration: D - 250, fill: 'forwards' });
      introT.push(setTimeout(function () { st.classList.add('rdone'); var pk = st.querySelector('path[data-k="' + win + '"]'); if (pk) pk.setAttribute('class', 'rwin'); }, D));
    }
    function go(n) { st.dataset.sc = n; cap.textContent = CAPS[n] || ''; cap.parentNode.classList.toggle('on', !!CAPS[n]); if (n === 2) spin(); }
    function run() {
      introT.forEach(clearTimeout); introT = [];
      st.classList.add('reset'); st.classList.remove('rdone'); go(0);
      introT.push(setTimeout(function () { st.classList.remove('reset'); }, 80));
      [[1500, 1], [8000, 2], [14500, 3], [20000, 4], [25500, 5]].forEach(function (x) { introT.push(setTimeout(function () { go(x[1]); }, x[0])); });
      introT.push(setTimeout(run, 33000));
    }
    run();
    introEl.addEventListener('change', function (e) {
      if (e.target.dataset.i !== 'never12') return;
      try { if (e.target.checked) localStorage.setItem(lk('intro-v12'), '1'); else localStorage.removeItem(lk('intro-v12')); } catch (er) {}
    });
    introEl.addEventListener('click', function (e) { if (e.target === introEl || e.target.classList.contains('intropanel')) closeIntro(); });
    document.addEventListener('keydown', introKey);
  }

  // ---------- Pop-up de bienvenida de la versión 2.0 ----------
  function intro20Off() { try { return localStorage.getItem(lk('intro-v20')) === '1'; } catch (e) { return false; } }
  function maybeIntro20() {
    if (ui.intro20Seen || !ui.acct || intro20Off() || introEl) return;
    ui.intro20Seen = true;
    setTimeout(function () { if (ui.screen === 'home' && !introEl) openIntro20(); }, 700);
  }
  function openIntro20() {
    closeIntro();
    var k, bg = '<i class="bgimg"></i><i class="aur a1"></i><i class="aur a2"></i><i class="aur a3"></i><i class="gr"></i><i class="sw"></i>';
    for (k = 0; k < 22; k++) bg += '<i class="pt" style="left:' + (2 + k * 4.5) + '%;--d:' + ((k * 7) % 13) * .5 + 's;--c:' + ['#22d3ee', '#e879f9', '#a3e635', '#fb7185'][k % 4] + '"></i>';
    var tk = 'AMIGOS ✦ PASE DE BATALLA ✦ ROYAL RUMBLE ✦ SOBRE ANIME ✦ MONTAJE AUTOMÁTICO ✦ EMOTICONOS ✦ PERFIL ✦ ';
    var title = '<div class="i20s st" data-s="0,6"><i class="i20flash"></i><i class="i20ring"></i><i class="i20ring r2"></i><div class="i20ti"><small>¡Ya está aquí la versión!</small><b data-t="2.0">2.0</b></div><div class="i20tk"><span>' + tk + tk + '</span></div></div>';
    var FR = [['dashlight-akali', 'Dashlight', 'on', 'En línea'], ['lihone', 'Lihone', 'play', 'En partida'], ['pampert', 'Pampert', 'on', 'En línea'], ['mertens', 'Mertens', 'off', 'Desconectado']];
    var s1 = '<div class="i20s" data-s="1"><div class="i20h" style="--hc:#22d3ee">Amigos</div>' +
      '<div class="i20chat glass"><div class="i20ch"><span class="av" style="background-image:url(art/lihone.webp)"></span><b>Lihone</b><em>En línea</em></div><div class="i20bs">' +
      '<div class="b b1">¿Una partida de Versus de 4?</div><div class="b b2 me">¡Vamos! Te invito a mi sala</div><div class="b b3">Invitación aceptada ✔</div></div></div>' +
      '<div class="i20inv glass"><span class="ii">' + ic('espadas') + '</span><div><small>Invitación de partida</small><b>Lihone te invita a un Versus de 4</b></div><em>Aceptar</em></div>' +
      '<div class="i20fl glass"><h5>Amigos <small>2 en línea</small></h5>' + FR.map(function (f, i) {
        return '<div class="r" style="--i:' + i + '"><span class="av" style="background-image:url(art/' + f[0] + '.webp)"><i class="sd ' + f[2] + '"></i></span><b>' + f[1] + '</b><em class="' + f[2] + '">' + f[3] + '</em></div>';
      }).join('') + '</div></div>';
    var s2 = '<div class="i20s" data-s="2"><div class="i20h" style="--hc:#e879f9">Perfil y emoticonos</div>' +
      '<div class="i20pf glass"><div class="top"><span class="av" style="background-image:url(art/dashlight-akali.webp)"></span><div><b>Tu perfil</b><small>Rango y progreso al siguiente</small></div></div>' +
      '<div class="rk"><i></i></div><div class="gs"><div><b>128</b><span>Partidas</span></div><div><b>64%</b><span>Victorias</span></div><div><b>9</b><span>Mejor racha</span></div><div><b>14</b><span>Cartas ★3</span></div></div></div>' +
      '<div class="i20em">' + ['camo-3', 'gorra-3', 'camo-9', 'gorra-12'].map(function (e, i) { return '<span class="e" style="--i:' + i + '"><img src="emo/' + e + '.webp" alt=""></span>'; }).join('') + '<div class="tags"><i>Set Dashlight Akali</i><i>Set Lihone</i></div></div></div>';
    var RW = ['img/coins-pile.webp', 'img/pack-set1.webp', 'img/box.webp', 'art/pampert-oikawa.webp', 'emo/camo-3.webp', 'img/pack-anime.webp', 'art/dashlight-kingambit.webp'], LV = [1, 4, 9, 10, 8, 12, 20];
    var s3 = '<div class="i20s" data-s="3"><div class="i20h" style="--hc:#fbbf24">Pase de batalla</div><div class="i20trk">' + RW.map(function (u, i) {
      return '<div class="n' + (i === 6 ? ' fin' : '') + '" style="--i:' + i + '"><small>Nivel ' + LV[i] + '</small><span class="rw' + (u.indexOf('art/') === 0 ? ' art' : '') + '" style="background-image:url(' + u + ')"></span><i class="ck">✔</i></div>';
    }).join('') + '</div><div class="i20xp"><span>XP de temporada</span><div><i></i></div></div>' +
      '<div class="i20ms"><span style="--i:0">Gana 3 partidas <b>+40 XP</b></span><span style="--i:1">Abre 3 sobres <b>+40 XP</b></span><span style="--i:2">Juega Royal Rumble <b>+50 XP</b></span></div></div>';
    var ids = ['mertens-gambler', 'chipy-goku', 'lihone-viego', 'dashlight-sun-jin-woo', 'aitorlg-maomao'], fl = [['-90cqw', '-30cqw', '-40deg'], ['-40cqw', '50cqw', '35deg'], ['0', '-60cqw', '-15deg'], ['50cqw', '50cqw', '-30deg'], ['90cqw', '-30cqw', '40deg']];
    var orb = ['pampert', 'lihone', 'mertens', 'javihi', 'chipy-goku', 'sech', 'hellbramn', 'petea-pokemaniaco', 'eriko', 'lucia'].map(function (a, i) { return '<i style="--a:' + (i * 36) + 'deg;background-image:url(art/' + a + '.webp)"></i>'; }).join('');
    var s4 = '<div class="i20s" data-s="4"><div class="i20orb"><div>' + orb + '</div></div><div class="i20h" style="--hc:#fb7185">Royal Rumble</div>' +
      '<div class="i20chips"><span>Sin mazo</span><span>Cualquier carta en la tienda</span><span>1 contra 1 · Versus de 4</span></div><div class="i20row">' +
      ids.map(function (id, i) { return '<div class="c" style="--i:' + i + ';--fx:' + fl[i][0] + ';--fy:' + fl[i][1] + ';--fr:' + fl[i][2] + '">' + cardHtml(CARD[id], { lv: 1 }) + '</div>'; }).join('') + '</div></div>';
    var s5 = '<div class="i20s" data-s="5"><div class="i20h" style="--hc:#a3e635">Y mucho más</div><div class="i20tg">' +
      '<div class="t" style="--i:0"><div class="v"><img src="img/pack-anime.webp" alt=""><i class="shn"></i></div><div><b>Sobre Anime</b><span>Solo cartas de Anime. En la tienda y en el pase</span></div></div>' +
      '<div class="t" style="--i:1"><div class="v am"><span style="background-image:url(art/pampert.webp)"></span><span style="background-image:url(art/lihone.webp)"></span><span style="background-image:url(art/mertens.webp)"></span><i>✦</i></div><div><b>Montaje automático</b><span>Elige hasta 3 sinergias y monta tu mazo</span></div></div>' +
      '<div class="t" style="--i:2"><div class="v"><div class="i20mk"><i class="e1"></i><i class="e2"></i><i class="m"></i></div></div><div><b>Efectos exclusivos</b><span>Grieta, funda Pokéball y Máscara de neón</span></div></div>' +
      '<div class="t" style="--i:3"><div class="v"><div class="i20gk"><b>-36</b></div></div><div><b>Nueva Genkidama</b><span>El daño acumulado, con número parpadeando</span></div></div></div></div>';
    var h = '<div class="intropanel"><div class="introst i20" data-sc="0"><div class="i20bg">' + bg + '</div>' + title + s1 + s2 + s3 + s4 + s5 +
      '<div class="icap"><span></span></div></div>' +
      '<label class="ibtns inever"><input type="checkbox" data-i="never20"' + (intro20Off() ? ' checked' : '') + '> No mostrar más</label><p class="zhint">Pulsa fuera de la animación para cerrarla</p></div>';
    introEl = document.createElement('div'); introEl.className = 'introov'; introEl.innerHTML = h;
    document.body.appendChild(introEl);
    var st = introEl.querySelector('.introst'), cap = st.querySelector('.icap span'), scs = st.querySelectorAll('.i20s');
    var CAPS = ['', 'Amigos: estado en línea, chat e invitaciones directas a tus partidas', 'Perfil con rango y estadísticas, y emoticonos para chat y partidas', 'Pase de batalla: misiones de temporada y recompensas exclusivas', 'Royal Rumble: sin mazo y con cualquier carta en la tienda', 'Sobre Anime, montaje automático, efectos exclusivos y nueva Genkidama', ''];
    function go(n) {
      st.dataset.sc = n; cap.textContent = CAPS[n] || ''; cap.parentNode.classList.toggle('on', !!CAPS[n]);
      Array.prototype.forEach.call(scs, function (el) { el.classList.toggle('on', el.dataset.s.split(',').indexOf(String(n)) >= 0); });
    }
    function run() {
      introT.forEach(clearTimeout); introT = [];
      st.classList.add('reset'); go(0);
      introT.push(setTimeout(function () { st.classList.remove('reset'); go(0); }, 80));
      [[3800, 1], [11200, 2], [17400, 3], [25800, 4], [33000, 5], [41000, 6]].forEach(function (x) { introT.push(setTimeout(function () { go(x[1]); }, x[0])); });
      introT.push(setTimeout(run, 46000));
    }
    run();
    introEl.addEventListener('change', function (e) {
      if (e.target.dataset.i !== 'never20') return;
      try { if (e.target.checked) localStorage.setItem(lk('intro-v20'), '1'); else localStorage.removeItem(lk('intro-v20')); } catch (er) {}
    });
    introEl.addEventListener('click', function (e) { if (e.target === introEl || e.target.classList.contains('intropanel')) closeIntro(); });
    document.addEventListener('keydown', introKey);
  }

  // ---------- Pop-up de bienvenida de la versión 1.3 (Anime) ----------
  function intro13Off() { try { return localStorage.getItem(lk('intro-v13')) === '1'; } catch (e) { return false; } }
  function maybeIntro13() {
    if (ui.intro13Seen || !ui.acct || intro13Off() || introEl) return;
    ui.intro13Seen = true;
    setTimeout(function () { if (ui.screen === 'home' && !introEl) openIntro13(); }, 700);
  }
  function openIntro13() {
    closeIntro();
    var k, bg = '';
    ['dashlight-sun-jin-woo', 'aitorlg-maomao', 'chipy-goku'].forEach(function (id, i) { bg += '<i class="i13art a' + i + '" style="background-image:url(art/' + id + '.webp)"></i>'; });
    bg += '<i class="i13rays"></i>';
    for (k = 0; k < 16; k++) bg += '<i class="i13p" style="left:' + (3 + k * 6) + '%;--d:' + ((k * 7) % 11) * .6 + 's;--c:' + ['#f9a8d4', '#86efac', '#c4b5fd', '#fde68a'][k % 4] + '"></i>';
    var NEW = ['javihi-smiley', 'mertens-meliodas', 'lihone-rudeus', 'chipy-goku', 'pampert-asta', 'dashlight-sun-jin-woo', 'aitorlg-maomao'], cards = '';
    NEW.forEach(function (id, i) { cards += '<div class="i13c" style="--i:' + i + '">' + cardHtml(CARD[id], { lv: 1 }) + '</div>'; });
    var troops = '', orbs = '', tx = [7, 21, 35];
    ['javihi-smiley', 'lihone-rudeus', 'pampert-asta'].forEach(function (id, i) {
      troops += '<div class="i13t" style="left:' + tx[i] + '%">' + cardHtml(CARD[id], { lv: 1 }) + '</div>';
      for (var j = 0; j < 3; j++) orbs += '<i class="i13o" style="left:' + (tx[i] + 4 + j * 1.5) + 'cqw;top:' + (30 + (j % 2) * 3) + 'cqw;--dx:' + (52 - tx[i] - 4 - j * 1.5) + 'cqw;--dy:' + (-6 - (j % 2) * 3) + 'cqw;--dl:' + (.5 + i * .5 + j * .22) + 's"></i>';
    });
    var gk = '<div class="i13s s2"><div class="i13rv">' + cardHtml(CARD['lihone-viego'], { lv: 1 }) + '<em class="i13dmg">-36</em><i class="i13boom"></i></div>' + troops + orbs + '<i class="i13sph"></i>' +
      '<div class="i13pc"><span>Nivel 1 · 50%</span><span>Nivel 2 · 75%</span><span>Nivel 3 · 100%</span></div></div>';
    var sh = '<div class="i13s s3"><div class="i13jin">' + cardHtml(CARD['dashlight-sun-jin-woo'], { lv: 1 }) + '</div><div class="i13foe">' + cardHtml(CARD['mertens-prime'], { lv: 1 }) + '<i class="i13wisp"></i></div>' +
      '<div class="i13slot"><span>Hueco 5</span></div><div class="i13ghost">' + cardHtml(CARD['mertens-prime'], { lv: 1 }) + '<b>50%</b></div><div class="i13lab">Soldado de Sombra</div></div>';
    var fx = '<div class="i13s s4"><div class="i13col"><h4>Despliegue</h4><div class="i13row">' +
      '<div class="i13d d1"><i></i><i></i><i></i></div><div class="i13d d2"><i></i></div><div class="i13d d3">' + FIN_ICO.trebol + '</div></div><small>Sombras · Kamehameha · Grimorio</small></div>' +
      '<div class="i13col"><h4>Fundas</h4><div class="i13row">' + ['dragonball', 'trebol', 'petalos'].map(function (s) { return '<div class="i13sv">' + cardHtml(CARD['lihone-rudeus'], { lv: 1, slv: s }) + '</div>'; }).join('') + '</div><small>Dragon Ball · Trébol · Boticaria</small></div>' +
      '<div class="i13col"><h4>Victoria y derrota</h4><div class="i13row">' + ['dball', 'trebol', 'petalos'].map(function (f) { return '<div class="i13f f-' + f + '">' + FIN_ICO[f] + '</div>'; }).join('') + '</div><small>Kamehameha · Trébol · Pétalos</small></div></div>';
    var h = '<div class="intropanel"><div class="introst i13" data-sc="0"><div class="i13bg">' + bg + '</div>' +
      '<div class="ititle"><small>¡Ya está aquí la versión 1.3!</small><b>ANIME</b></div><span class="iver">v1.3</span>' +
      '<div class="i13s s1"><div class="i13fan">' + cards + '</div></div>' + gk + sh + fx +
      '<div class="icap"><span></span></div></div>' +
      '<label class="ibtns inever"><input type="checkbox" data-i="never13"' + (intro13Off() ? ' checked' : '') + '> No mostrar más</label><p class="zhint">Pulsa fuera de la animación para cerrarla</p></div>';
    introEl = document.createElement('div'); introEl.className = 'introov'; introEl.innerHTML = h;
    document.body.appendChild(introEl);
    var st = introEl.querySelector('.introst'), cap = st.querySelector('.icap span');
    var CAPS = ['', 'Siete cartas de Anime nuevas, con rarezas y estadísticas renovadas', 'Genkidama: las tropas Anime guardan el 50, 75 o 100% del daño que reciben y lo sueltan sobre un enemigo (o repartido con Kamehameha)', 'Soldado de Sombra: Sun Jin-Woo levanta al último enemigo que derrota, con el 50% de sus estadísticas, en el hueco 5', 'Nueve efectos nuevos: despliegues, fundas y victoria/derrota'];
    function go(n) { st.dataset.sc = n; cap.textContent = CAPS[n] || ''; cap.parentNode.classList.toggle('on', !!CAPS[n]); }
    function run() {
      introT.forEach(clearTimeout); introT = [];
      st.classList.add('reset'); go(0);
      introT.push(setTimeout(function () { st.classList.remove('reset'); }, 80));
      [[1800, 1], [8500, 2], [17000, 3], [25000, 4]].forEach(function (x) { introT.push(setTimeout(function () { go(x[1]); }, x[0])); });
      introT.push(setTimeout(run, 33000));
    }
    run();
    introEl.addEventListener('change', function (e) {
      if (e.target.dataset.i !== 'never13') return;
      try { if (e.target.checked) localStorage.setItem(lk('intro-v13'), '1'); else localStorage.removeItem(lk('intro-v13')); } catch (er) {}
    });
    introEl.addEventListener('click', function (e) { if (e.target === introEl || e.target.classList.contains('intropanel')) closeIntro(); });
    document.addEventListener('keydown', introKey);
  }

  // ---------- Carta ampliada en 3D (pantalla Mazo) ----------
  var zoomEl = null;
  function closeZoom() { if (zoomEl) { zoomEl.remove(); zoomEl = null; } document.removeEventListener('keydown', zoomKey); }
  function zoomKey(e) { if (e.key === 'Escape') closeZoom(); }
  function skinStrip(c, cur) {
    var SK = (window.CARTAS_SKINS || []).filter(function (k) { return k.card === c.id; });
    if (!SK.length) return '';
    var own = function (k) { return ui.acct && (ui.acct.skins || []).indexOf(k.id) >= 0; };
    return '<div class="zskins"><span class="zsl">Aspectos</span><button class="zs' + (!cur ? ' on' : '') + '" data-zs="" title="Aspecto clásico"><i style="background-image:url(/cartas/art/' + (ARTS[c.id] ? c.id : '') + '.webp)"></i><em>Clásico</em></button>' +
      SK.map(function (k) { return '<button class="zs' + (cur === k.id ? ' on' : '') + (own(k) ? '' : ' locked') + '" data-zs="' + k.id + '" title="' + esc(k.name) + (own(k) ? '' : ' (no la tienes)') + '"><i style="background-image:url(/cartas/art/' + k.id + '.webp)"></i><em>' + esc(k.name) + '</em></button>'; }).join('') + '</div>';
  }
  function openZoom(id, skin) {
    var c = CARD[id]; if (!c) return;
    closeZoom();
    var own = owns(c.id) || !!c.novia, st = { rx: 0, ry: 0, tx: 0, ty: 0, drag: null, auto: true, t0: performance.now() };
    var face = cardHtml(c, { lv: own && !c.novia ? lvOf(c.id) : 1, cls: 'zface', skin: skin });
    zoomEl = document.createElement('div'); zoomEl.className = 'zoomov';
    zoomEl.innerHTML = '<div class="zbox"><div class="zstage"><div class="zcard"><div class="zfront">' + face + '<span class="zglare"></span></div><div class="zback"><div class="zbk"><b>' + ic('cartas') + '</b><span>' + esc(c.name) + '</span></div></div></div></div>' +
      '<div class="zbtns"><button class="btn sec sm" data-z="flip">' + ic('cambio') + ' Voltear</button><button class="btn sec sm" data-z="reset">Restablecer</button><button class="btn sm" data-z="close">Cerrar</button></div>' +
      skinStrip(c, skin) + '<p class="zhint">Arrastra para girarla · pasa el ratón para inclinarla · Esc para cerrar</p></div>';
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
      var zs = e.target.closest('[data-zs]'); if (zs) { openZoom(id, zs.dataset.zs); return; }
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
  var NAV = [['home', 'casa', 'Inicio'], ['play', 'espadas', 'Jugar'], ['deck', 'cartas', 'Colección'], ['packs', 'tienda', 'Tienda'], ['missions', 'mision', 'Misiones'], ['pass', 'estrella', 'Pase'], ['ladder', 'trofeo', 'Clasificación']];
  function artOk(id) { return !!id && (!!ARTS[id] || (window.CARTAS_SKINS || []).some(function (k) { return k.id === id; })); }
  function avatarHtml(cls) {
    var id = ui.acct && ui.acct.avatar, ok = artOk(id);
    return '<span class="avt ' + (cls || '') + (ok ? ' has' : '') + '"' + (ok ? ' style="background-image:url(/cartas/art/' + id + '.webp)"' : '') + '>' + (ok ? '' : ic('usuario')) + '</span>';
  }
  function snd(n, d) { try { if (window.CartasSfx) window.CartasSfx.play(n, d); } catch (e) {} }
  var SND_ACT = { nav: 'nav', menu: 'back', finclose: 'back', boxclose: '', packbg: '', refresh: 'refresh', freeze: 'freeze', endshop: 'confirm', fight: 'confirm', next: 'confirm', hand: 'pick', slot: '', buy: '', sell: '', msclaim: '', rkclaim: '', boxopen: '', openpack: '', flipcard: '', flipall: '', sfxtest: '', surrender: 'click' };
  function sfxPanel() {
    var S = window.CartasSfx; if (!S) return '';
    var c = S.get();
    return '<div class="panel sfxpanel"><h2>' + ic('altavoz') + ' Sonido</h2><p class="mut">Los sonidos se generan en tu navegador. Los ajustes se guardan en este dispositivo.</p>' +
      '<div class="sfxrow main"><button class="btn sec" data-act="sfxmute">' + (c.mute ? 'Activar sonido' : 'Silenciar todo') + '</button><label class="sfxsl"><span>Volumen general</span><input type="range" min="0" max="100" value="' + c.master + '" data-sfx="master"><b>' + c.master + '%</b></label></div>' +
      S.CATS.map(function (k) { return '<div class="sfxrow"><div class="sfxlb"><b>' + k[1] + '</b><span class="mut">' + k[2] + '</span></div><label class="sfxsl"><input type="range" min="0" max="100" value="' + c.vol[k[0]] + '" data-sfx="vol" data-cat="' + k[0] + '"><b>' + c.vol[k[0]] + '%</b></label><button class="btn sec" data-act="sfxtest" data-cat="' + k[0] + '">Probar</button></div>'; }).join('') +
      '<label class="sfxchk"><input type="checkbox" data-act="sfxbg"' + (c.bg ? ' checked' : '') + '> Silenciar cuando la pestaña está en segundo plano</label>' +
      '<div class="sfxrow"><button class="btn sec" data-act="sfxreset">Restablecer ajustes de sonido</button></div></div>';
  }
  function navHtml(cur) {
    var home = cur === 'home';
    var acct = ui.acct ? '<button class="navb coinpill" data-act="nav" data-to="packs" title="Tus monedas">' + ic('moneda') + ' ' + ui.acct.coins + '</button><button class="navb avtb' + (cur === 'profile' ? ' on' : '') + '" data-act="nav" data-to="profile" title="Tu perfil">' + avatarHtml('sm') + '</button><span class="acctw"><button class="navb who" data-act="acctmenu" title="Tu cuenta">' + esc(ui.acct.name) + ' ▾</button><div class="acctmenu"><div class="am-name">Sesión de <b>' + esc(ui.acct.name) + '</b></div><button class="am-prof" data-act="nav" data-to="profile">' + ic('usuario') + ' Mi perfil</button><button data-act="nav" data-to="settings">' + ic('ajustes') + ' Ajustes</button><button data-act="sfxmute">' + ic('altavoz') + ' Sonido: ' + (window.CartasSfx && window.CartasSfx.get().mute ? 'desactivado' : 'activado') + '</button><button data-act="logout">' + ic('puerta') + ' Cerrar sesión</button></div></span>' : '';
    return '<nav class="nav' + (home ? ' navhome' : '') + '">' + (home ? '<span class="navlogo"><img src="/cartas/logo-icon.png" alt="">TCG Arena</span>' : NAV.map(function (n) { var bd = n[0] === 'pass' && seasonReady('pass') ? '<i class="nbadge">' + seasonReady('pass') + '</i>' : n[0] === 'missions' && claimableCount() ? '<i class="nbadge">' + claimableCount() + '</i>' : ''; return '<button class="navb' + (n[0] === cur ? ' on' : '') + '" data-act="nav" data-to="' + n[0] + '">' + ic(n[1]) + ' ' + n[2] + bd + '</button>'; }).join('')) +
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
  // ---------- Misiones, cajas e inventario ----------
  var MSN = window.CARTAS_MISSIONS || { MISSIONS: [], RANK_BOXES: [] };
  var SS = window.CARTAS_SEASON || { SEASON: { id: '', name: '', xpPerLevel: 1, levels: [], missions: [] }, levelOf: function () { return 0; } };
  function msProg(m) { var st = (ui.acct && ui.acct.ms && ui.acct.ms.stats) || {}; return st['hit_' + m.id] ? m.goal : Math.min(m.goal, st[m.stat] || 0); }
  function msDone(m) { return msProg(m) >= m.goal; }
  function msClaimed(m) { return ((ui.acct && ui.acct.ms && ui.acct.ms.claimed) || []).indexOf(m.id) >= 0; }
  function rkReached(rb) { return ui.acct && (ui.acct.ptsMax || ui.acct.pts || 0) >= rb.min; }
  function rkClaimed(rb) { return ((ui.acct && ui.acct.rkClaimed) || []).indexOf(rb.id) >= 0; }
  function claimableCount() {
    if (!ui.acct) return 0;
    return MSN.MISSIONS.filter(function (m) { return msDone(m) && !msClaimed(m); }).length + MSN.RANK_BOXES.filter(function (r) { return rkReached(r) && !rkClaimed(r); }).length + seasonReady('season');
  }
  function boxImg(cls) { return '<img class="bximg ' + (cls || '') + '" src="/cartas/img/box.webp" alt="Caja">'; }
  function rankBoxBtn(r) {
    var rb = MSN.RANK_BOXES.filter(function (x) { return x.min === r.min; })[0]; if (!rb) return '<span></span>';
    if (rkClaimed(rb)) return '<span class="rkboxd" title="Caja recogida">' + ic('check') + ' Caja</span>';
    if (rkReached(rb)) return '<button class="rkbox" data-act="rkclaim" data-id="' + rb.id + '">' + ic('caja') + ' Recoger</button>';
    return '<span class="rkboxl" title="Alcanza este rango para ganar una caja">' + ic('caja') + '</span>';
  }
  function refreshAcct(then) { api('me').then(function (r) { if (r.ok) { setAcct(r.data.user); if (then) then(); } }); }
  // ---------- Temporada y pase de batalla ----------
  function seData() { var s = (ui.acct && ui.acct.season) || {}; return { xp: s.xp || 0, st: s.st || {}, mc: s.mc || [], lc: s.lc || [], active: s.active !== false }; }
  function seLevel() { return SS.levelOf(seData().xp); }
  // avisos de la pestaña: misiones listas para recoger / niveles con recompensa por recoger
  function seasonReady(tab) {
    var d = seData(), n = 0;
    if (tab === 'season') SS.SEASON.missions.forEach(function (m) { if (d.mc.indexOf(m.id) < 0 && seProg(d, m) >= m.goal) n++; });
    else SS.SEASON.levels.forEach(function (L) { if (d.lc.indexOf(L.lv) < 0 && seLevel() >= L.lv) n++; });
    return n;
  }
  var FXKIND = { deploy: ['Despliegue', 'brillo', function () { return DEPLOY_LIST; }], sleeve: ['Funda', 'cartas', function () { return SLEEVE_LIST; }], finish: ['Victoria y derrota', 'trofeo', function () { return FIN_LIST; }] };
  // Descripción de una recompensa del pase: tipo, nombre y imagen (big = vista grande del centro)
  function seasonRewardInfo(r, big) {
    var n = r.n || 1, x = n > 1 ? '<span class="rwn">×' + n + '</span>' : '';
    if (r.kind === 'coins') return { k: 'Monedas', t: r.n + ' monedas', v: '<div class="rwv coins"><img src="/cartas/img/coins-pile.webp" alt=""><span class="rwn">' + r.n + '</span></div>' };
    if (r.kind === 'box') return { k: 'Botín', t: n > 1 ? n + ' cajas' : 'Una caja', v: '<div class="rwv"><img src="/cartas/img/box.webp" alt="">' + x + '</div>' };
    if (r.kind === 'pack') { var an = r.set === 'anime'; return { k: an ? 'Sobre Anime' : 'Sobre', t: n > 1 ? n + ' sobres' + (an ? ' Anime' : '') : an ? 'Un sobre Anime' : 'Un sobre', v: '<div class="rwv"><img src="/cartas/img/pack-' + (an ? 'anime' : 'set1') + '.webp" alt="">' + x + '</div>' }; }
    if (r.kind === 'card') { var c = CARD[r.id]; return { k: 'Carta', t: c ? c.name : r.id, v: '<div class="rwv art"><span style="background-image:url(/cartas/art/' + r.id + '.webp)"></span></div>' }; }
    if (r.kind === 'emotes') { var es = EMO.setOf(r.id); return { k: 'Emoticonos', t: es ? es.name : r.id, sub: es ? es.emotes.length + ' emoticonos para chat y partidas' : '', v: '<div class="rwv emo">' + emoImg(r.id + '-1') + '</div>' }; }
    if (r.kind === 'skin') { var sk = (window.CARTAS_SKINS || []).filter(function (k) { return k.id === r.id; })[0]; return { k: 'Skin', t: sk ? sk.name : r.id, v: '<div class="rwv art"><span style="background-image:url(/cartas/art/' + r.id + '.webp)"></span></div>', play: sk && CARD[sk.card] ? '<button class="rwplay d3" data-act="zoom" data-id="' + sk.card + '" data-skin="' + r.id + '" title="Ver la carta en 3D">' + ic('ojo') + ' Ver en 3D</button>' : '' }; }
    var fk = FXKIND[r.fx] || FXKIND.deploy, e = fk[2]().filter(function (z) { return z.id === r.id; })[0] || { name: r.id };
    if (r.fx === 'sleeve') return { k: 'Efecto · ' + fk[0], t: e.name, v: '<div class="rwv slvp slv-' + r.id + '"><div class="slvback"><span></span></div></div>' };
    return { k: 'Efecto · ' + fk[0], t: e.name, v: '<div class="rwv fx">' + ic(fk[1]) + '</div>', play: r.fx === 'deploy' || r.fx === 'finish' ? '<button class="rwplay" data-act="' + (r.fx === 'finish' ? 'passfin' : 'passplay') + '" data-id="' + r.id + '" title="Ver el efecto"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>' : '' };
  }
  function seasonHead() {
    var d = seData(), S = SS.SEASON, lv = seLevel(), max = S.levels.length, into = lv >= max ? S.xpPerLevel : d.xp - lv * S.xpPerLevel;
    var left = S.end ? Math.max(0, Math.ceil((Date.parse(S.end) - Date.now()) / 86400000)) : null;
    return '<div class="panel sehead"><div class="selv"><b>' + lv + '</b><span>Nivel</span></div><div class="sebar"><h2>' + esc(S.name) + '</h2><div class="sexp"><i style="width:' + Math.round(into / S.xpPerLevel * 100) + '%"></i></div><p class="mut">' + (lv >= max ? '¡Has completado el pase!' : into + ' / ' + S.xpPerLevel + ' XP para el nivel ' + (lv + 1)) + ' · XP total: ' + d.xp + (left == null ? '' : ' · ' + (d.active ? 'quedan ' + left + (left === 1 ? ' día' : ' días') : 'temporada terminada')) + '</p></div></div>';
  }
  function seProg(d, m) { return d.st['hit_' + m.id] ? m.goal : Math.min(m.goal, d.st[m.stat] || 0); }
  function seasonMissions() {
    var d = seData(), list = SS.SEASON.missions.slice().sort(function (x, y) {
      var f = function (m) { return d.mc.indexOf(m.id) >= 0 ? 2 : seProg(d, m) >= m.goal ? 0 : 1; }; return f(x) - f(y);
    });
    if (!list.length) return '<div class="panel"><p class="mut">Todavía no hay misiones de temporada.</p></div>';
    return '<ul class="mslist">' + list.map(function (m) {
      var p = seProg(d, m), cl = d.mc.indexOf(m.id) >= 0, ok = p >= m.goal;
      var btn = cl ? '<span class="msd">' + ic('check') + ' Recogida</span>' : ok && d.active ? '<button class="btn sm cta" data-act="smclaim" data-id="' + m.id + '">Recoger +' + m.xp + ' XP</button>' : '<span class="msxp">+' + m.xp + ' XP</span>';
      return '<li class="msn' + (cl ? ' done' : ok ? ' ready' : '') + '"><div class="msi">' + ic('mision') + '</div><div class="msb"><b>' + esc(m.t) + '</b><span class="mut">' + esc(m.d) + '</span><div class="meter msm"><i class="on" style="width:' + Math.round(p / m.goal * 100) + '%"></i></div></div><span class="msp">' + p + ' / ' + m.goal + '</span>' + btn + '</li>';
    }).join('') + '</ul>';
  }
  function passDefaultSel() {
    var d = seData(), lv = seLevel(), L = SS.SEASON.levels, k;
    for (k = 0; k < L.length; k++) if (L[k].lv <= lv && d.lc.indexOf(L[k].lv) < 0) return L[k].lv;
    return Math.min(L.length, lv + 1);
  }
  function renderPass() {
    var S = SS.SEASON, d = seData(), lv = seLevel(), max = S.levels.length;
    if (!ui.passSel || ui.passSel > max) ui.passSel = passDefaultSel();
    var sel = S.levels[ui.passSel - 1], ready = S.levels.filter(function (L) { return L.lv <= lv && d.lc.indexOf(L.lv) < 0; });
    var selCl = d.lc.indexOf(sel.lv) >= 0, selOk = sel.lv <= lv, info = seasonRewardInfo(sel.reward, true);
    var into = lv >= max ? S.xpPerLevel : d.xp - lv * S.xpPerLevel;
    var left = S.end ? Math.max(0, Math.ceil((Date.parse(S.end) - Date.now()) / 86400000)) : null;
    var state = selCl ? '<span class="pst ok">' + ic('check') + ' Recogida</span>' : selOk ? '<span class="pst rdy">Desbloqueada</span>' : '<span class="pst lock">' + ic('candado') + ' Llega al nivel ' + sel.lv + '</span>';
    var track = S.levels.map(function (L) {
      var cl = d.lc.indexOf(L.lv) >= 0, ok = L.lv <= lv, r = seasonRewardInfo(L.reward);
      return '<button class="pnode' + (L.lv === ui.passSel ? ' sel' : '') + (cl ? ' done' : ok ? ' ready' : '') + '" data-act="passsel" data-lv="' + L.lv + '"><span class="pthumb">' + r.v + (cl ? '<i class="pchk">' + ic('check') + '</i>' : ok ? '' : '<i class="plk">' + ic('candado') + '</i>') + '</span><span class="pline"></span><span class="phex' + (ok ? ' on' : '') + '">' + L.lv + '</span></button>';
    }).join('');
    app.innerHTML = head('pass', ic('estrella') + ' Pase de batalla') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') +
      '<div class="pass"><div class="phd"><b>' + esc(S.name) + '</b>' + (left == null ? '' : '<span class="pchip">' + ic('reloj') + ' ' + (d.active ? left + ' d' : 'Terminada') + '</span>') + '</div>' +
      '<div class="phero"><div class="pring"></div><div class="pvis">' + info.v + (info.play || '') + '</div><div class="pinfo"><span class="pk">' + esc(info.k) + '</span><h2>' + esc(info.t) + '</h2>' + (info.sub ? '<span class="psub">' + esc(info.sub) + '</span>' : '') + state + (ui.passNote ? '<span class="pnote">' + esc(ui.passNote) + '</span>' : '') + '</div></div>' +
      '<div class="ptrackw"><button class="parrow l" data-act="passscroll" data-d="-1" aria-label="Anterior">‹</button><div class="ptrack" id="ptrack">' + track + '</div><button class="parrow r" data-act="passscroll" data-d="1" aria-label="Siguiente">›</button></div>' +
      '<div class="pbot"><div class="plv"><b>' + lv + '</b></div><div class="pxp"><div class="sexp"><i style="width:' + Math.round(into / S.xpPerLevel * 100) + '%"></i></div><span>' + (lv >= max ? '¡Pase completado!' : into + ' / ' + S.xpPerLevel + ' XP para el nivel ' + (lv + 1)) + ' · XP total ' + d.xp + '</span></div>' +
      '<div class="pact">' + (ready.length > 1 ? '<button class="btn sec" data-act="slclaimall">Reclamar todo (' + ready.length + ')</button>' : '') + '<button class="btn cta" data-act="slclaim" data-lv="' + sel.lv + '"' + (selOk && !selCl && d.active ? '' : ' disabled') + '>Reclamar</button></div></div></div></div>' + finPrevHtml();
    var tr = document.getElementById('ptrack'), nd = tr && tr.querySelector('.pnode.sel');
    if (tr && nd) { tr.style.scrollBehavior = 'auto'; tr.scrollLeft = ui.passScroll != null ? ui.passScroll : Math.max(0, nd.offsetLeft - tr.clientWidth / 2 + nd.clientWidth / 2); ui.passScroll = null; requestAnimationFrame(function () { tr.style.scrollBehavior = ''; }); }
  }
  function renderMissions() {
    var a = ui.acct, all = MSN.MISSIONS.slice().sort(function (x, y) {
      var kx = msClaimed(x) ? 2 : msDone(x) ? 0 : 1, ky = msClaimed(y) ? 2 : msDone(y) ? 0 : 1; return kx - ky;
    });
    var done = MSN.MISSIONS.filter(msClaimed).length;
    var items = all.map(function (m) {
      var p = msProg(m), cl = msClaimed(m), ok = msDone(m), btn = cl ? '<span class="msd">' + ic('check') + ' Recogida</span>' : ok ? '<button class="btn sm cta" data-act="msclaim" data-id="' + m.id + '">' + ic('caja') + ' Recoger caja</button>' : '<span class="msbox" title="Recompensa: una caja">' + ic('caja') + '</span>';
      return '<li class="msn' + (cl ? ' done' : ok ? ' ready' : '') + '"><div class="msi">' + ic('mision') + '</div><div class="msb"><b>' + esc(m.t) + '</b><span class="mut">' + esc(m.d) + '</span><div class="meter msm"><i class="on" style="width:' + Math.round(p / m.goal * 100) + '%"></i></div></div><span class="msp">' + p + ' / ' + m.goal + '</span>' + btn + '</li>';
    }).join('');
    var tab = ui.msTab === 'season' ? 'season' : 'ms';
    var tabs = '<div class="mstabs">' + [['ms', 'Misiones'], ['season', 'Misiones de temporada']].map(function (x) { return '<button class="' + (tab === x[0] ? 'on' : '') + '" data-act="mstab" data-v="' + x[0] + '">' + x[1] + (x[0] !== 'ms' && seasonReady(x[0]) ? ' <i class="nbadge">' + seasonReady(x[0]) + '</i>' : '') + '</button>'; }).join('') + '</div>';
    if (tab !== 'ms') { app.innerHTML = head('missions', ic('mision') + ' Misiones') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') + tabs + seasonHead() + seasonMissions() + '</div>'; return; }
    app.innerHTML = head('missions', ic('mision') + ' Misiones') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') + tabs +
      '<div class="panel msbar">' + boxImg('sm') + '<div><h2>' + (a.boxes || 0) + ' ' + ((a.boxes || 0) === 1 ? 'caja' : 'cajas') + ' en tu inventario</h2><p class="mut">Cada misión te da una caja con una carta, una skin o un efecto que aún no tengas. Las cajas no se abren al recogerlas: las guardas en tu inventario. Misiones completadas: ' + done + ' / ' + MSN.MISSIONS.length + '.</p></div><button class="btn sec" data-act="goinv">' + ic('cartas') + ' Ir al inventario</button></div>' +
      '<ul class="mslist">' + items + '</ul></div>';
  }
  function invPacks() {
    var PK = [['set1', 'Sobres Set 1', 'packs', 'Cada sobre trae ' + ui.acct.packSize + ' cartas al azar de todo el juego (sin la sinergia Anime); la última es Rara o mejor.'], ['anime', 'Sobres Anime', 'packsAnime', 'Cada sobre trae ' + ui.acct.packSize + ' cartas al azar de la sinergia Anime y su acción; la última es Rara o mejor.']];
    return PK.map(function (p) {
      var n = (ui.acct && ui.acct[p[2]]) || 0;
      return '<div class="invwrap"><div class="invbox invpk' + (n ? '' : ' empty') + '"><img class="bximg" src="/cartas/img/pack-' + (p[0] === 'anime' ? 'anime' : 'set1') + '.webp" alt="Sobre">' + (n ? '<span class="invn">×' + n + '</span>' : '') + '</div><div class="invinfo"><h2 class="dedh">' + p[1] + '</h2><p class="mut colhint">' + p[3] + '</p>' + (n ? '<button class="btn cta big" data-act="openpack" data-inv="1" data-pack="' + p[0] + '"' + (ui.pack ? ' disabled' : '') + '>' + ic('sobre') + ' Abrir sobre</button><p class="mut">Tienes ' + n + (n === 1 ? ' sobre' : ' sobres') + ' sin abrir.</p>' : '<p class="mut">No tienes sobres de este tipo ahora mismo. Consíguelos en el pase de batalla o cómpralos en la tienda.</p><div class="btnrow"><button class="btn sec" data-act="nav" data-to="pass">' + ic('estrella') + ' Pase de batalla</button></div>') + '</div></div>';
    }).join('');
  }
  function invTab() {
    var n = (ui.acct && ui.acct.boxes) || 0;
    return (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') + invPacks() + '<div class="invwrap"><div class="invbox' + (n ? '' : ' empty') + '">' + boxImg() + (n ? '<span class="invn">×' + n + '</span>' : '') + '<button class="bxinfo" data-act="boxinfo" aria-label="Probabilidades de la caja" title="Probabilidades">i</button></div><div class="invinfo"><h2 class="dedh">Cajas</h2>' +
      (ui.boxInfo ? boxOddsHtml() : '') + '<p class="mut colhint">Dentro de cada caja hay una carta que no tengas, una skin o un efecto. Nunca te tocará algo repetido hasta que lo tengas todo.</p>' +
      (n ? '<button class="btn cta big" data-act="boxopen">' + ic('caja') + ' Abrir caja</button><p class="mut">Tienes ' + n + (n === 1 ? ' caja' : ' cajas') + ' sin abrir.</p>' :
        '<p class="mut">No tienes cajas ahora mismo. Consíguelas completando misiones y subiendo de rango.</p><div class="btnrow"><button class="btn sec" data-act="nav" data-to="missions">' + ic('mision') + ' Misiones</button><button class="btn sec" data-act="nav" data-to="ladder">' + ic('trofeo') + ' Clasificación</button></div>') + '</div></div>';
  }
  function boxOddsHtml() {
    var a = ui.acct || {}, W = { 'Común': 50, 'Rara': 30, 'Épica': 15, 'Legendaria': 5 };
    var cards = D.cards.filter(function (c) { return !ui.ownedSet[c.id]; });
    var skins = (window.CARTAS_SKINS || []).filter(function (k) { return !k.pass && (a.skins || []).indexOf(k.id) < 0; });
    var fxs = DEPLOY_LIST.concat(SLEEVE_LIST, FIN_LIST).filter(function (e) { return e.price > 0 && !e.pass && fxHas && !fxHas(e.id); });
    var pools = [['Carta nueva', cards.length, 5], ['Skin nueva', skins.length, 3], ['Efecto nuevo', fxs.length, 2]], tot = 0;
    pools.forEach(function (p) { if (p[1]) tot += p[2]; });
    var rows = pools.map(function (p) { return '<li><span>' + p[0] + '</span><b>' + (p[1] ? Math.round(p[2] / tot * 1000) / 10 + '%' : '—') + '</b><em>' + (p[1] ? p[1] + ' sin conseguir' : 'ya las tienes todas') + '</em></li>'; }).join('');
    var wt = 0; cards.forEach(function (c) { wt += W[c.rarity]; });
    var rr = wt ? '<p class="mut">Rareza de la carta (entre las que te faltan): ' + RANK.map(function (r) { var w = 0; cards.forEach(function (c) { if (c.rarity === r) w += W[c.rarity]; }); return r + ' ' + Math.round(w / wt * 1000) / 10 + '%'; }).join(' · ') + '</p>' : '';
    return '<div class="bxodds"><button class="bxclose" data-act="boxinfo" aria-label="Ocultar">×</button><h3>Probabilidades</h3><p class="mut">Se calculan con lo que aún no tienes: base 50% carta, 30% skin y 20% efecto. Si una categoría ya está completa, su parte se reparte entre las demás. Nunca sale algo repetido hasta que lo tengas todo.</p><ul>' + rows + '</ul>' + rr + '</div>';
  }
  function rewardInfo(r) {
    if (r.kind === 'card') { var c = CARD[r.id]; return { best: c.rarity, label: r.dup ? '¡Carta repetida!' : '¡Nueva carta!', name: c.name, sub: r.dup ? (r.lvUp ? 'Sube a nivel ' + r.lvl : 'Ya lo tenías todo: +1 copia') : c.rarity, visual: cardHtml(c, { lv: r.dup ? r.lvl : 1, skin: '' }) }; }
    if (r.kind === 'skin') {
      var sk = (window.CARTAS_SKINS || []).filter(function (k) { return k.id === r.id; })[0] || {}, bc = CARD[sk.card];
      return { best: 'Épica', label: '¡Nueva skin!', name: sk.name || r.id, sub: bc ? 'Para ' + bc.name + (ui.ownedSet && ui.ownedSet[sk.card] ? '' : ' (aún no tienes la carta)') : '', visual: bc ? cardHtml(bc, { lv: 1, skin: sk.id }) : '' };
    }
    var lst = r.fxKind === 'sleeve' ? SLEEVE_LIST : r.fxKind === 'finish' ? FIN_LIST : DEPLOY_LIST, e = lst.filter(function (x) { return x.id === r.id; })[0] || { name: r.id, desc: '' };
    var kl = r.fxKind === 'sleeve' ? 'Funda' : r.fxKind === 'finish' ? 'Victoria y derrota' : 'Despliegue', icn = r.fxKind === 'sleeve' ? 'cartas' : r.fxKind === 'finish' ? 'trofeo' : 'brillo';
    return { best: 'Rara', label: '¡Nuevo efecto!', name: e.name, sub: kl + ' · equípalo en Colección → Efectos', visual: '<div class="bxfx">' + ic(icn) + '<b>' + esc(e.name) + '</b><span>' + esc(kl) + '</span></div>' };
  }
  function boxHtml(cls) { return '<div class="bxb ' + cls + '"><div class="bxglow"></div><div class="bxrays"></div><div class="bxbody"></div><div class="bxlid"></div></div>'; }
  function boxOverlay() {
    var b = ui.box; if (!b) return '';
    if (b.stage === 'shake') return '<div class="packov boxov best-Común">' + boxHtml('shake') + '</div>';
    var info = rewardInfo(b.reward);
    if (b.stage === 'burst') return '<div class="packov boxov best-' + info.best + (info.best === 'Legendaria' ? ' rainbow' : '') + '">' + boxHtml('open') + pkFx(info.best) + '</div>';
    return '<div class="packov boxov best-' + info.best + '" data-act="boxclose"><div class="bxrev"><p class="bxt">' + info.label + '</p><div class="bxvis">' + info.visual + '</div><p class="bxn">' + esc(info.name) + '</p><p class="mut bxs">' + esc(info.sub) + '</p><p class="pmsg pulse">Haz clic para continuar</p></div></div>';
  }
  function renderLadder() {
    ensureLadder();
    var L = ui.ladder, me = ui.acct ? ui.acct.name.toLowerCase() : '';
    var myPts = L ? L.me : (ui.acct ? ui.acct.pts : 0), mk = rankOf(myPts), mr = RANKS[mk], nx = RANKS[mk + 1];
    var rows = L && L.top && L.top.length ? L.top.map(function (r, k) {
      var rk = rankOf(r.pts);
      return '<li class="rkrow' + (r.name.toLowerCase() === me ? ' me' : '') + (k < 3 ? ' top' + (k + 1) : '') + '" style="--rc:' + RANKS[rk].c + '"><span class="rkpos">' + (k + 1) + '</span>' + rkAv(r.avatar) + '<b class="rkname">' + esc(r.name) + '</b><span class="rkrank">' + rkEmblem(rk) + '<i>' + RANKS[rk].n + '</i></span><span class="rkpts">' + r.pts + '</span></li>';
    }).join('') : '<li class="mut rkempty">' + (L ? 'Aún no hay jugadores.' : 'Cargando…') + '</li>';
    var tiers = RANKS.slice().reverse().map(function (r) { var i = RANKS.indexOf(r); return '<li class="' + (i === mk ? 'cur' : '') + '" style="--rc:' + r.c + '">' + rkEmblem(i) + '<b>' + r.n + '</b><span>' + r.min + (RANKS[i + 1] ? '–' + (RANKS[i + 1].min - 1) : '+') + '</span>' + rankBoxBtn(r) + '</li>'; }).join('');
    app.innerHTML = head('ladder', '' + ic('trofeo') + ' Clasificación') +
      '<div class="rkwrap"><div class="rkmain"><div class="rkhead"><div><span class="rkk">Temporada de lanzamiento</span><h2>Mejores jugadores</h2></div><span class="rkcol">Top 10</span></div>' +
      '<div class="rkcolh"><span>#</span><span>Jugador</span><span>Rango</span><span>Puntos</span></div><ol class="rklist">' + rows + '</ol>' +
      '<p class="mut rknote">Puntúan las partidas contra otros jugadores: 1 contra 1 (+20 / -20) y Versus de 4 (+40 / +20 / -20 / -40 según tu puesto). Aparecen todas las cuentas, hayan jugado o no.</p></div>' +
      '<aside class="rkside" style="--rc:' + mr.c + '"><div class="rkbanner">' + rkEmblem(mk, true) + '<span class="rkpl">' + (L && L.pos ? 'Clasificación: ' + L.pos + (L.total ? ' de ' + L.total : '') : 'Sin clasificar') + '</span><b class="rkrn">' + mr.n + '</b><span class="rkpp">' + myPts + ' PL</span>' +
      (nx ? '<div class="meter rkm"><i class="on" style="width:' + Math.round((myPts - mr.min) / (nx.min - mr.min) * 100) + '%"></i></div><span class="rknx">' + (nx.min - myPts) + ' puntos para ' + nx.n + '</span>' : '<span class="rknx">Rango máximo</span>') + '</div>' +
      '<p class="mut rkboxnote">' + ic('caja') + ' Cada rango, desde Bronce, te da una caja. Recógela aquí y ábrela en Colección → Inventario.</p><ul class="rktiers">' + tiers + '</ul></aside></div></div>';
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
  // ---------- Noticia «Charla con los Desarrolladores»: conversación que avanza con cada clic ----------
  function chatNewsMain(n) {
    return '<div class="rnmain chatnews"><img class="cnc c1" src="/cartas/tutor/guia.webp" alt=""><img class="cnc c2" src="/cartas/tutor/dev.webp" alt="">' +
      '<div class="rnbody"><span class="ntag nt-' + esc(n.tag) + '">' + esc(n.tag) + '</span><h2>' + esc(n.title) + '</h2>' +
      '<button class="btn cnplay" data-act="devchat">▶ Reproducir charla</button></div></div>';
  }
  function chatFx(f) {
    if (!f) return '';
    var h = '', i;
    if (f.k === 'syn') {
      h = '<div class="fxrow">' + f.ids.map(function (t, i) { return '<div class="sy" style="--i:' + i + '"><span class="sic">' + tic(t) + '<i class="slash"></i></span><b>' + esc(t) + '</b></div>'; }).join('') + '</div><div class="fxlab bad">Sinergias que se retiran</div>';
    } else if (f.k === 'cards') {
      h = '<div class="fxgrid">' + f.ids.map(function (id, i) { var c = CARD[id]; return '<div class="ct" style="--i:' + i + '"><span class="ctp" style="background-image:url(/cartas/art/' + id + '.webp)"></span><i class="cts">↻</i><b>' + esc(c ? c.name : id) + '</b></div>'; }).join('') + '</div><div class="fxlab warn">Cartas que cambian por completo</div>';
    } else if (f.k === 'art') {
      h = '<span class="fxspoil">Spoiler</span><div class="fxrow art">' + [0, 1, 2].map(function (i) { return '<div class="ct q" style="--i:' + i + '"><span class="ctq">?</span><i class="brush"></i></div>'; }).join('') + '</div><div class="fxlab new">Nuevas ilustraciones</div>';
    } else if (f.k === 'newsyn') {
      var NS = [['Goblins', 'g'], ['Fantasía', 'f']].concat(f.more ? [['¿?', 'n']] : []);
      h = '<div class="fxrow">' + NS.map(function (x, i) { return '<div class="nsy ' + x[1] + '" style="--i:' + i + '"><span>?</span><b>' + esc(x[0]) + '</b></div>'; }).join('') + '</div><div class="fxlab new">' + (f.more ? 'A la espera de más' : 'Sinergias nuevas') + '</div>';
    } else if (f.k === 'level') {
      var R = [['★ Nivel 1', '#9ca3af'], ['★★ Nivel 2', '#3b82f6'], ['★★★ Nivel 3', '#f59e0b']];
      h = '<span class="fxspoil">Spoiler</span><div class="fxrar">' + R.map(function (r, i) { return '<div class="rr" style="--i:' + i + ';--c:' + r[1] + '"><i></i><b>' + r[0] + '</b></div>'; }).join('') + '<em class="rup">▲</em></div><div class="fxlab new">Goblins · mejora el nivel</div>';
    }
    return h;
  }
  var chatEl = null, chatS = null;
  function closeChat() { if (chatS && chatS.t) clearInterval(chatS.t); chatS = null; if (chatEl) { chatEl.remove(); chatEl = null; } document.removeEventListener('keydown', chatKey); }
  function chatKey(e) { if (e.key === 'Escape') closeChat(); else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); chatNext(); } }
  function openChat() {
    var n = (window.CARTAS_NEWS || []).filter(function (x) { return x.chat; })[0]; if (!n) return;
    closeChat(); chatS = { l: n.chat, i: -1, t: null, full: '', pos: 0 };
    chatEl = document.createElement('div'); chatEl.className = 'devchat';
    chatEl.innerHTML = '<div class="dcbox"><button class="dcx" data-dc="close" title="Cerrar">✕</button><img class="dcc l" src="/cartas/tutor/guia.webp" alt=""><img class="dcc r" src="/cartas/tutor/dev.webp" alt=""><div class="dcfx"></div>' +
      '<div class="dcbub"><span class="dcname"></span><p class="dctx"></p><span class="dcgo">Pulsa para continuar ▸</span><span class="dcn"></span></div></div>';
    document.body.appendChild(chatEl);
    chatEl.addEventListener('click', function (e) { if (e.target.closest('[data-dc="close"]') || e.target === chatEl) return closeChat(); chatNext(); });
    document.addEventListener('keydown', chatKey);
    chatNext();
  }
  function chatNext() {
    var s = chatS; if (!s) return;
    var tx = chatEl.querySelector('.dctx');
    if (s.pos < s.full.length) { clearInterval(s.t); s.pos = s.full.length; tx.innerHTML = s.full; chatEl.classList.add('done'); return; } // primer clic: completa el texto
    if (s.i >= s.l.length - 1) return closeChat();
    s.i++; var L = s.l[s.i]; s.full = L.t; s.pos = 0; chatEl.classList.remove('done');
    chatEl.dataset.w = L.w; chatEl.dataset.p = L.p || '';
    if ('fx' in L) { var fe = chatEl.querySelector('.dcfx'); fe.innerHTML = chatFx(L.fx); fe.className = 'dcfx' + (L.fx ? ' on k-' + L.fx.k : ''); }
    chatEl.querySelector('.dcname').textContent = L.w === 'd' ? 'Dev' : 'Guía';
    chatEl.querySelector('.dcn').textContent = (s.i + 1) + ' / ' + s.l.length;
    chatEl.querySelector('.dcgo').textContent = s.i === s.l.length - 1 ? 'Pulsa para cerrar ✕' : 'Pulsa para continuar ▸';
    var g = chatEl.querySelector('.dcc.l'); g.src = '/cartas/tutor/' + (L.p === 'e' ? 'guia-enfadado' : 'guia') + '.webp';
    var bub = chatEl.querySelector('.dcbub'); bub.classList.remove('pop'); void bub.offsetWidth; bub.classList.add('pop');
    if (REDUCED) { s.pos = s.full.length; tx.innerHTML = s.full; chatEl.classList.add('done'); return; }
    tx.innerHTML = '';
    var plain = s.full.replace(/<[^>]+>/g, ''), k = 0;
    s.t = setInterval(function () { k += 2; if (k >= plain.length) { clearInterval(s.t); s.pos = s.full.length; tx.innerHTML = s.full; chatEl.classList.add('done'); } else tx.textContent = plain.slice(0, k); }, 24);
  }
  function homeNews() {
    var N = window.CARTAS_NEWS || [];
    if (!N.length) return '';
    var sel = Math.min(ui.newsSel || 0, N.length - 1), n = N[sel], arts = newsArts(n);
    var isChat = !!n.chat;
    return '<div class="rnews"><ul class="rnl">' + N.map(function (x, k) {
      return '<li><button class="' + (k === sel ? 'on' : '') + '" data-act="newssel" data-i="' + k + '"><span class="ntag nt-' + esc(x.tag) + '">' + esc(x.tag) + '</span><b>' + esc(x.title) + '</b><i>' + esc(x.date.split('-').reverse().join('/')) + '</i></button></li>';
    }).join('') + '</ul>' + (isChat ? chatNewsMain(n) : '<div class="rnmain' + (arts.length ? '' : ' nologo') + (ui.newsFull && newsNeedsFull(n) ? ' full' : '') + '" style="' + (arts.length ? '--rart:url(/cartas/art/' + arts[0] + '.webp)' : '') + '">' +
      (arts.length ? '' : '<img class="rnlogo" src="/cartas/logo.webp" alt="">') +
      '<div class="rnbody"><span class="ntag nt-' + esc(n.tag) + '">' + esc(n.tag) + '</span><h2>' + esc(n.title) + '</h2><ul>' + (ui.newsFull && newsNeedsFull(n) ? n.items.map(function (t) { return '<li>' + (t.indexOf('{{intro}}') >= 0 ? esc(t.replace('{{intro}}', '')) + '<a href="#" class="newslink" data-act="introplay">▶ Ver la animación</a>' : esc(t)) + '</li>'; }) : newsSummary(n).map(function (t) { return '<li>' + esc(t) + '</li>'; })).join('') + '</ul>' +
      (newsNeedsFull(n) ? '<button class="btn sec sm" data-act="newsmore">' + (ui.newsFull ? 'Mostrar menos ▴' : 'Leer la noticia completa ▾') + '</button>' : '') +
      (arts.length > 1 ? '<div class="rnthumbs">' + arts.map(function (id) { return '<span style="background-image:url(/cartas/art/' + id + '.webp)" title="' + esc(CARD[id] ? CARD[id].name : id.replace(/-/g, ' ')) + '"></span>'; }).join('') + '</div>' : '') + '</div></div>') + '</div>';
  }
  // Cambia solo el panel de noticias (así la lista conserva su scroll)
  function refreshNews() {
    var old = document.querySelector('.rnews'); if (!old) return renderHome();
    var l = old.querySelector('.rnl'), st = l ? l.scrollTop : 0, tmp = document.createElement('div');
    tmp.innerHTML = homeNews(); old.replaceWith(tmp.firstChild);
    var nl = document.querySelector('.rnews .rnl'); if (nl) nl.scrollTop = st;
  }
  function renderHome() {
    var h = head('home') + '<div class="rhome"><div class="rplay"><button class="rplaybtn" data-act="nav" data-to="play"><span class="rpl"><img src="/cartas/logo-icon.png" alt=""></span><span class="rpt">Jugar</span></button></div>' +
      '<div class="ricons">' + [
        ['deck', ic('cartas'), 'Colección', ui.acct.owned.length + ' cartas'],
        ['packs', ic('tienda'), 'Tienda', (ui.acct ? ui.acct.coins : 0) + ' monedas'],
        ['missions', ic('mision'), 'Misiones', claimableCount() ? claimableCount() + ' por recoger' : 'Gana cajas'],
        ['pass', ic('estrella'), 'Pase de batalla', 'Nivel ' + seLevel()],
        ['ladder', ic('trofeo'), 'Clasificación', ui.acct.pts + ' puntos'],
        ['profile', ic('usuario'), 'Perfil', 'Estadísticas y ajustes'],
      ].map(function (m) { return '<button class="ricon" data-act="nav" data-to="' + m[0] + '"><span class="rii">' + m[1] + '</span><b>' + m[2] + '</b><span class="mut">' + m[3] + '</span></button>'; }).join('') + '</div>' + homeNews() + '</div>';
    h += '<p class="mut" style="text-align:center">' + D.cards.length + ' tropas · ' + D.actions.length + ' acciones</p></div>';
    app.innerHTML = h;
    maybeIntro20();
  }
  // Animaciones de versiones anteriores: se pueden volver a ver desde el perfil
  var ANIM_LIST = [
    { id: 'v20', ver: 'v2.0', name: 'Bienvenida a la 2.0: Amigos y Pase de batalla', desc: 'Pop-up de la versión 2.0: amigos y chat, perfil y emoticonos, pase de batalla, Royal Rumble, Sobre Anime, montaje automático y nuevos efectos.' },
    { id: 'v13', ver: 'v1.3', name: 'Bienvenida a la 1.3: Anime', desc: 'Pop-up de la versión 1.3: cartas nuevas de Anime, la Genkidama, el Soldado de Sombra y los nuevos efectos de despliegue, funda y victoria/derrota.' },
    { id: 'v12', ver: 'v1.2', name: 'Bienvenida a la 1.2: Gambling', desc: 'Pop-up de la versión 1.2: sinergia Gambling, nuevas cartas, ruleta de orbes, interés por ahorrar y nuevos efectos de casino.' },
    { id: 'correa', ver: 'v1.1', name: 'Sinergia Correa', desc: 'Pop-up de la versión 1.1: las cartas entran en juego, recibes a las 4 novias y una ocupa el hueco 5.' }
  ];
  function animPanel() {
    return '<div class="panel animpanel"><h2>' + ic('brillo') + ' Animaciones</h2><p class="mut">Aquí se guardan las animaciones de presentación de versiones anteriores para que puedas volver a verlas.</p><div class="animlist">' + ANIM_LIST.map(function (x) {
      return '<div class="animrow"><span class="animver">' + x.ver + '</span><div class="animtx"><b>' + esc(x.name) + '</b><span class="mut">' + esc(x.desc) + '</span></div><button class="btn sm" data-act="playanim" data-id="' + x.id + '">' + ic('play') + ' Reproducir</button></div>';
    }).join('') + '</div></div>';
  }
  function statTile(ico, val, lab, sub) {
    return '<div class="pstat"><span class="psi">' + ic(ico) + '</span><b>' + val + '</b><span class="psl">' + lab + '</span>' + (sub ? '<span class="pss">' + sub + '</span>' : '') + '</div>';
  }
  function statsPanel(a) {
    var st = a.stats || {}, g = st.games || 0, w = st.wins || 0, pct = g ? Math.round(w / g * 100) : 0;
    var totalCards = D.cards.length + D.actions.length, ownedN = a.ownedN, rk = rankOf(a.ptsMax || a.pts || 0), cur = rankOf(a.pts || 0), nx = RANKS[cur + 1];
    var bar = nx ? '<div class="pbar"><i style="width:' + Math.max(0, Math.min(100, ((a.pts - RANKS[cur].min) / (nx.min - RANKS[cur].min)) * 100)) + '%;background:' + RANKS[cur].c + '"></i></div><span class="mut">' + (nx.min - a.pts) + ' puntos para ' + nx.n + '</span>' : '<span class="mut">¡Rango máximo!</span>';
    return '<div class="panel pstats"><h2>' + ic('trofeo') + ' Estadísticas</h2>' +
      '<div class="prank"><span class="pemb">' + rkEmblem(cur, true) + '</span><div><b class="prn" style="color:' + RANKS[cur].c + '">' + RANKS[cur].n + '</b><span class="mut">' + a.pts + ' puntos de clasificación' + (rk > cur ? ' · mejor rango: ' + RANKS[rk].n : '') + '</span>' + bar + '</div></div>' +
      '<h3 class="avsub">Partidas</h3><div class="pgrid">' +
      statTile('espadas', g, 'Partidas jugadas') + statTile('trofeo', w, 'Victorias', pct + '% de victorias') + statTile('fuego', st.bestStreak || 0, 'Mejor racha', 'victorias seguidas') + statTile('cartas', st.cards || 0, 'Cartas jugadas', 'en tus partidas') + '</div>' +
      '<h3 class="avsub">Por modo</h3><div class="pgrid">' +
      statTile('grupo', st.mp || 0, '1 vs 1 online') + statTile('grupo', st.v4 || 0, 'Versus de 4') + statTile('cambio', (st.revive || 0) - (st.rumble || 0), 'Resurrección') + statTile('fuego', st.rumble || 0, 'Royal Rumble') + '</div>' +
      '<h3 class="avsub">Colección</h3><div class="pgrid">' +
      statTile('cartas', ownedN + '/' + totalCards, 'Cartas desbloqueadas', Math.round(ownedN / totalCards * 100) + '%') + statTile('estrella', st.lv3 || 0, 'Cartas a nivel 3') + statTile('sobre', st.packs || 0, 'Sobres abiertos') + statTile('brillo', (st.skins || 0) + ' · ' + (st.fx || 0), 'Skins · efectos') + '</div></div>';
  }
  function renderProfile() {
    var a = ui.acct, mySkins = (window.CARTAS_SKINS || []).filter(function (k) { return (a.skins || []).indexOf(k.id) >= 0; }), cur = a.avatar || '', own = D.cards.filter(function (c) { return ARTS[c.id] && ui.ownedSet && ui.ownedSet[c.id]; }).sort(function (x, y) { return RARS.indexOf(y.rarity) - RARS.indexOf(x.rarity) || x.name.localeCompare(y.name); });
    app.innerHTML = head('profile', '' + ic('usuario') + ' Mi perfil') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') +
      '<div class="panel profhead"><button class="avedit' + (ui.avEdit ? ' on' : '') + '" data-act="avedit" title="Cambiar foto de perfil" aria-label="Cambiar foto de perfil">' + avatarHtml('xl') + '<span class="avpen">' + ic('lapiz') + '</span></button><div><h2>' + esc(a.name) + '</h2><p class="mut">' + a.pts + ' puntos de clasificación · ' + a.coins + ' ' + ic('moneda') + ' · ' + a.owned.length + ' cartas desbloqueadas</p><div class="btnrow"><button class="btn sec" data-act="nav" data-to="settings">' + ic('ajustes') + ' Ajustes</button><button class="btn sec" data-act="logout">' + ic('puerta') + ' Cerrar sesión</button></div></div></div>' +
      (!ui.avEdit ? '' : '<div class="panel"><h2>Foto de perfil</h2><p class="mut">Elige la ilustración de una de tus cartas desbloqueadas o de una de tus skins. Cuantas más consigas, más opciones tendrás.</p>' +
      '<div class="avgrid"><button class="avopt none' + (cur ? '' : ' on') + '" data-act="setavatar" data-card="" title="Sin foto"><span class="avt">' + ic('usuario') + '</span><b>Ninguna</b></button>' + own.map(function (c) {
        return '<button class="avopt' + (cur === c.id ? ' on' : '') + '" data-act="setavatar" data-card="' + c.id + '" title="' + esc(c.name) + '"><span class="avt has" style="background-image:url(/cartas/art/' + c.id + '.webp)"></span><b>' + esc(c.name) + '</b></button>';
      }).join('') + '</div>' + (mySkins.length ? '<h3 class="avsub">Skins</h3><div class="avgrid">' + mySkins.map(function (k) {
        return '<button class="avopt skin' + (cur === k.id ? ' on' : '') + '" data-act="setavatar" data-card="' + k.id + '" title="' + esc(CARD[k.card].name + ' · ' + k.name) + '"><span class="avt has" style="background-image:url(/cartas/art/' + k.id + '.webp)"></span><b>' + esc(k.name) + '</b></button>';
      }).join('') + '</div>' : '') + '<div class="btnrow"><button class="btn sec" data-act="avedit">Cerrar</button></div></div>') + statsPanel({ pts: a.pts, ptsMax: a.ptsMax, ownedN: a.owned.length, stats: (a.ms && a.ms.stats) || {} }) + '</div>';
  }
  // Perfil de un amigo (ventana emergente): foto, rango y estadísticas
  var STTXT = { on: 'En línea', play: 'En partida', off: 'Desconectado' };
  function closeFriendProfile() { var o = document.getElementById('friendprof'); if (o) o.remove(); document.removeEventListener('keydown', fpKey); }
  function fpKey(e) { if (e.key === 'Escape') closeFriendProfile(); }
  ui.showProfile = function (name) {
    closeFriendProfile();
    var o = document.createElement('div'); o.id = 'friendprof'; o.className = 'overlay fpov';
    o.innerHTML = '<div class="panel fpp"><p class="mut" style="text-align:center">Cargando…</p></div>';
    o.addEventListener('click', function (e) { if (e.target === o || e.target.closest('[data-fp=close]')) closeFriendProfile(); });
    document.body.appendChild(o); document.addEventListener('keydown', fpKey);
    api('socProfile', { name: name }).then(function (r) {
      if (!document.getElementById('friendprof')) return;
      var p = r.ok && r.data.profile;
      if (!p) { o.firstChild.innerHTML = '<p class="err">' + esc((r.data && r.data.error) || 'No se pudo cargar el perfil.') + '</p><div class="btnrow"><button class="btn sec" data-fp="close">Cerrar</button></div>'; return; }
      var ok = p.avatar && artOk(p.avatar);
      o.firstChild.innerHTML = '<button class="fpx" data-fp="close" aria-label="Cerrar">×</button><div class="profhead"><span class="avt xl' + (ok ? ' has' : '') + '"' + (ok ? ' style="background-image:url(/cartas/art/' + esc(p.avatar) + '.webp)"' : '') + '>' + (ok ? '' : ic('usuario')) + '</span><div><h2>' + esc(p.name) + '</h2><p class="mut"><span class="fst ' + p.st + '">' + STTXT[p.st] + '</span> · ' + p.pts + ' puntos de clasificación</p></div></div>' + statsPanel({ pts: p.pts, ptsMax: p.ptsMax, ownedN: p.owned, stats: p.stats });
    });
  };
  function renderSettings() {
    app.innerHTML = head('profile', '' + ic('ajustes') + ' Ajustes') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') +
      '<div class="btnrow" style="margin-bottom:.8rem"><button class="btn sec" data-act="nav" data-to="profile">← Volver al perfil</button></div>' + sfxPanel() + animPanel() +
      '<div class="panel"><h2>' + ic('usuario') + ' Cuenta</h2><p class="mut">Sesión iniciada como <b>' + esc(ui.acct.name) + '</b>.</p><div class="btnrow"><button class="btn sec" data-act="logout">' + ic('puerta') + ' Cerrar sesión</button></div></div></div>';
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
  function bpkHtml(cls, pack) {
    return '<div class="bpk ' + (pack === 'anime' ? 'anime ' : '') + (cls || '') + '"><div class="bpk-glow"></div><div class="bpk-rays"></div><div class="bpk-main"></div><div class="bpk-lid"></div></div>';
  }
  var GEM = { 'Común': '●', 'Rara': '◆', 'Épica': '✦', 'Legendaria': '★' };
  var RANK = ['Común', 'Rara', 'Épica', 'Legendaria'];
  function skinShop(a) {
    var SK = (window.CARTAS_SKINS || []).filter(function (k) { return !k.pass; });
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
    var sub = ui.cardSub === 'acc' ? 'acc' : 'tro', list = L.filter(function (it) { return (CARD[it.id].type === 'accion') === (sub === 'acc'); });
    var tabs = '<div class="subtabs"><button class="' + (sub === 'tro' ? 'on' : '') + '" data-act="cardsub" data-t="tro">Tropas</button><button class="' + (sub === 'acc' ? 'on' : '') + '" data-act="cardsub" data-t="acc">Acciones</button></div>';
    return '<div class="panel skinshop"><h2>' + ic('estrella') + ' Cartas nuevas</h2><p class="mut">Cartas recién añadidas que puedes comprar directamente con monedas.</p>' + tabs + (list.length ? '<div class="skgrid">' + list.map(function (it) {
      var c = CARD[it.id], own = a.owned.indexOf(it.id) >= 0;
      var btn = own ? '<button class="btn sec sm" disabled>' + ic('check') + ' Ya la tienes</button>'
        : '<button class="btn sm" data-act="cardbuy" data-card="' + it.id + '"' + (a.coins < (a.admin ? 0 : it.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : it.price + ' ' + ic('moneda')) + '</button>';
      return '<div class="skitem"><div class="skcard">' + cardHtml(c, { lv: 1, extra: '<span class="eyeb" data-act="zoom" data-id="' + it.id + '" title="Ver ampliada en 3D">' + ic('ojo') + '</span>' }) + '</div><b>' + esc(c.name) + '</b>' + btn + '</div>';
    }).join('') + '</div>' : '<p class="mut">No hay cartas de este tipo a la venta.</p>') + '</div>';
  }
  // ---------- Tienda ----------
  function skinBtn(a, s) {
    var hasCard = a.owned.indexOf(s.card) >= 0, own = (a.skins || []).indexOf(s.id) >= 0, eq = a.skinSel && a.skinSel[s.card] === s.id;
    return own ? (eq ? '<button class="btn sec sm" data-act="skinequip" data-skin="" data-card="' + s.card + '">' + ic('check') + ' Equipada · usar clásica</button>' : '<button class="btn sm" data-act="skinequip" data-skin="' + s.id + '" data-card="' + s.card + '">Equipar</button>')
      : s.pass ? '<button class="btn sm" disabled>Exclusiva del pase</button>'
      : !hasCard ? '<button class="btn sm" disabled>Necesitas la carta</button>'
      : '<button class="btn sm" data-act="skinbuy" data-skin="' + s.id + '"' + (a.coins < (a.admin ? 0 : s.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : s.price + ' ' + ic('moneda')) + '</button>';
  }
  function cardBtn(a, it) {
    return a.owned.indexOf(it.id) >= 0 ? '<button class="btn sec sm" disabled>' + ic('check') + ' Ya la tienes</button>'
      : '<button class="btn sm" data-act="cardbuy" data-card="' + it.id + '"' + (a.coins < (a.admin ? 0 : it.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : it.price + ' ' + ic('moneda')) + '</button>';
  }
  // Destacados: la última skin y las últimas cartas (lo más nuevo primero)
  function shopFeatured() {
    var SK = (window.CARTAS_SKINS || []).filter(function (k) { return !k.pass; }).reverse(), CL = (D.shop || []).slice().reverse(), out = [];
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
    var tiles = [{ pack: 'set1' }, { pack: 'anime' }].concat(F.map(function (x, k) { return { f: x, k: k }; }).filter(function (t) { return t.k !== sel; }).slice(0, 2));
    var side = '<div class="shtiles">' + tiles.map(function (t) {
      if (t.pack) return '<button class="shtile pack" data-act="shoptab" data-t="packs"><span class="shtv">' + bpkHtml('mini', t.pack) + '</span><b>' + (t.pack === 'anime' ? 'Sobre Anime' : 'Set 1') + '</b><span class="shtp">' + (a.packCost ? ic('moneda') + ' ' + a.packCost : 'Gratis') + '</span></button>';
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
      '<div class="panel"><h2>Tu colección</h2><div class="coinbig">' + a.owned.length + ' / ' + total + '</div><div class="meter colm"><i class="on" style="width:' + Math.round(a.owned.length / total * 100) + '%"></i></div><p class="mut">Solo puedes usar en tus mazos las cartas que tienes.</p><button class="btn sec" data-act="nav" data-to="deck">' + ic('cartas') + ' Ir a la colección</button></div></div>';
  }
  function shopFx() {
    var sec = ui.shopFxSec === 'sleeve' || ui.shopFxSec === 'finish' ? ui.shopFxSec : 'deploy';
    var T = [['deploy', 'Despliegues'], ['sleeve', 'Fundas'], ['finish', 'Victoria y derrota']];
    var nav = '<nav class="fxnav">' + T.map(function (t) { return '<button class="' + (t[0] === sec ? 'on' : '') + '" data-act="shopfxsec" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</nav>', body;
    if (sec === 'sleeve') body = '<h2 class="dedh">Fundas</h2><p class="mut colhint">Cambian el borde de tus cartas en la partida y el reverso al abrir sobres. Pruébalas antes de comprar; una vez tuyas, las equipas en Colección → Efectos.</p>' + slvDemo() + '<div class="fxlist">' + fxItems('shop', 'sleeve') + '</div>';
    else if (sec === 'finish') body = '<h2 class="dedh">Victoria y derrota</h2><p class="mut colhint">Cada pack trae la animación de victoria y la de derrota, con banner y efectos propios. Pruébalo antes de comprar; una vez tuyo, lo equipas en Colección → Efectos.</p><div class="fxlist">' + fxItems('shop', 'finish') + '</div>' + finPrevHtml();
    else body = '<h2 class="dedh">Despliegues</h2><p class="mut colhint">Cambian cómo aparecen tus cartas en la mesa. Pruébalos antes de comprar; una vez tuyos, los equipas en Colección → Efectos.</p>' + fxDemo() + '<div class="fxlist">' + fxItems('shop', 'deploy') + '</div>';
    return '<div class="fxlayout">' + nav + '<div class="fxmain">' + body + '</div></div>';
  }
  function packPanel(a, pk) {
    var an = pk === 'anime', can = a.coins >= a.packCost && !ui.pack;
    return '<div class="panel packbox">' + bpkHtml('', pk) + '<h2>' + (an ? 'Sobre Anime' : 'Set 1') + '</h2><p class="mut">' + a.packSize + (an ? ' cartas al azar de la sinergia Anime (sus tropas y su acción). ' : ' cartas al azar de todo el juego (tropas y acciones, sin la sinergia Anime). ') + 'La última siempre es Rara o mejor. Las cartas que ya tengas suben su nivel.</p>' +
      '<button class="btn cta big" data-act="openpack" data-pack="' + pk + '"' + (can ? '' : ' disabled') + '>' + (a.packCost ? 'Abrir sobre · ' + a.packCost + ' ' + ic('moneda') + '' : 'Abrir sobre · gratis') + '</button>' + (a.coins < a.packCost ? '<p class="mut">Te faltan ' + (a.packCost - a.coins) + ' monedas.</p>' : '') + '</div>';
  }
  function packsTab(a) {
    return '<div class="packs-grid two">' + packPanel(a, 'set1') + packPanel(a, 'anime') + '</div>' + (ui.msg ? '<div class="hint" style="color:var(--bad)">' + esc(ui.msg) + '</div>' : '');
  }
  var SHTABS = [['feat', 'Destacados'], ['packs', 'Sobres'], ['skins', 'Skins'], ['cards', 'Cartas'], ['fx', 'Efectos']];
  function renderPacks() {
    var a = ui.acct, tab = ui.shopTab || 'feat';
    var body = tab === 'packs' ? packsTab(a) : tab === 'skins' ? (skinShop(a) || '<p class="mut">Aún no hay skins a la venta.</p>') : tab === 'cards' ? (newCards(a) || '<p class="mut">Aún no hay cartas nuevas a la venta.</p>') : tab === 'fx' ? shopFx() : shopFeaturedHtml(a);
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
  // Anillo de luz y motas que salen del sobre al rasgarse (color según la mejor rareza)
  function pkFx(best) {
    var n = best === 'Legendaria' ? 34 : best === 'Épica' ? 26 : 18, h = '<div class="pkfx"><span class="ring"></span><span class="ring r2"></span>';
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 190;
      h += '<i style="--x:' + Math.round(Math.cos(a) * d) + 'px;--y:' + Math.round(Math.sin(a) * d - 40) + 'px;--s:' + (3 + Math.random() * 5).toFixed(1) + 'px;--d:' + (0.35 + Math.random() * 0.5).toFixed(2) + 's"></i>';
    }
    return h + '</div>';
  }
  function packOverlay() {
    var pk = ui.pack; if (!pk) return '';
    if (!pk.cards) return '<div class="packov best-Común">' + bpkHtml('shake best-Común', pk.pack) + '</div>';
    var best = pk.cards.reduce(function (b, c) { var r = CARD[c.id].rarity; return RANK.indexOf(r) > RANK.indexOf(b) ? r : b; }, 'Común');
    if (pk.stage === 'rip') return '<div class="packov best-' + best + (best === 'Legendaria' ? ' rainbow' : '') + '">' + bpkHtml('rip best-' + best, pk.pack) + pkFx(best) + '</div>';
    var gain = pk.cards.reduce(function (n, c) { return n + c.dupCoins; }, 0);
    var allRev = pk.rev.every(Boolean);
    return '<div class="packov best-' + best + (best === 'Legendaria' ? ' rainbowpost' : '') + '" data-act="packbg"><div class="pcards' + (sleeveId() !== 'sin' ? ' slv-' + sleeveId() : '') + '">' + pk.cards.map(function (c, i) {
      var cd = CARD[c.id];
      return '<div class="pcard r-' + cd.rarity + (pk.rev[i] ? ' flipped' : '') + '" data-act="flipcard" data-i="' + i + '" style="--d:' + i * 0.12 + 's"><div class="pin"><div class="pback"><span>' + GEM[cd.rarity] + '</span></div><div class="pfront">' + cardHtml(cd, {}) +
        (c.isNew ? '<span class="pnew">¡NUEVA!</span>' : '<span class="pdup">' + (c.lvUp ? '¡Sube a ★' + c.lvl + '!' : 'Repetida · ' + c.copies + ' copias') + '</span>') + '</div></div></div>';
    }).join('') + '</div><div class="pactions"><button class="btn sec" data-act="flipall"' + (allRev ? ' style="visibility:hidden"' : '') + '>Girar todas</button></div>' + (gain ? '<p class="pgain">+' + gain + ' ' + ic('moneda') + ' por cartas repetidas</p>' : '') + '<p class="pmsg' + (allRev ? ' pulse' : '') + '">' + (allRev ? 'Haz clic en un espacio vacío para continuar' : 'Pulsa cada carta para girarla · el color del reverso te dice su rareza') + '</p></div>';
  }
  var QMODES = [
    { id: 'classic', name: 'Clásico', icon: 'escudo', sub: 'Las tropas que caen se pierden', desc: 'Las tropas que caen se pierden. Gana quien se queda con tropas en pie y deja sin vida al rival.' },
    { id: 'revive', name: 'Resurrección', icon: 'cambio', sub: 'Las tropas reviven cada ronda', desc: 'Las tropas reviven cada ronda y al atacar también recibes el ataque de la carta atacada.' },
    { id: 'rumble', name: 'Royal Rumble', icon: 'fuego', sub: 'Sin mazo: sale todo el juego', desc: 'Reglas de Resurrección, pero sin mazo: en la tienda puede salir cualquier carta del juego. Salen muchas más tropas y muy pocas acciones, y es más fácil encontrar copias para subir de nivel y cartas de tus temáticas. Construye tu composición sobre la marcha.', nodeck: 1 },
  ];
  var QART = {
    ia: { classic: { '1v1': 'dashlight-akali', vs4: 'aitorlg-koisito' }, revive: { '1v1': 'chipy-lloron', vs4: 'potango' }, rumble: { '1v1': 'javihi-prime', vs4: 'mertens-meliodas' } },
    pl: { classic: { '1v1': 'hellbramn', vs4: 'pampert-friki' }, revive: { '1v1': 'haikyuu-lihone', vs4: 'mertens-prime' }, rumble: { '1v1': 'lihone-rudeus', vs4: 'javihi-friki-volibear' } },
  };
  var QOPTS = {
    ia: [
      { id: '1v1', icon: 'espadas', name: '1 contra 1', sub: 'Duelo contra una IA con tu mazo.', act: { classic: 'startai', revive: 'startrev', rumble: 'startrr' } },
      { id: 'vs4', icon: 'grupo', name: 'Versus de 4', sub: 'Tú contra 3 IAs, cada una con un mazo distinto. Duelos rotando hasta que quede uno.', act: { classic: 'startvs4b', revive: 'startrevvs4b', rumble: 'startrrvs4b' } },
    ],
    pl: [
      { id: '1v1', icon: 'espadas', name: '1 contra 1', sub: 'Reta a otro jugador. Sala con código o búsqueda automática.', act: { classic: 'openpvp', revive: 'openrevpvp', rumble: 'openrrpvp' } },
      { id: 'vs4', icon: 'grupo', name: 'Versus de 4', sub: 'Cuatro jugadores, duelos rotando hasta que quede uno. Sala con código o búsqueda.', act: { classic: 'openvs4', revive: 'openrevvs4', rumble: 'openrrvs4' } },
    ],
  };
  function tutDone() { try { return localStorage.getItem('tcg_tut') === '1'; } catch (e) { return false; } }
  function tutStrip() {
    return '<div class="qtut"><img src="/cartas/tutor/guia.webp" alt=""><div class="qtt"><span class="qtk">Aprende a jugar</span><b>Tutorial</b><span>Una partida guiada y siempre igual: la tienda, las sinergias, la mejora de estadísticas, tu vida y las rondas.' + (tutDone() ? ' ' + ic('check') + ' Completado' : '') + '</span></div><button class="btn big" data-act="tutstart">' + ic('libro') + ' ' + (tutDone() ? 'Repetir tutorial' : 'Empezar tutorial') + '</button></div>';
  }
  var DIFFS = [{ n: 'Normal', d: 'La IA de siempre.', r: 'Monedas ×1' }, { n: 'Difícil', d: 'Mazos coherentes, mejor tienda, +1 de oro en rondas de tienda y cartas a nivel 2.', r: 'Monedas ×1,5' }, { n: 'Experto', d: 'Lo anterior, cartas a nivel 3, +2 de oro en tienda, se cura 2 de vida y fusiona copias.', r: 'Monedas ×2 y +10 puntos si ganas' }];
  function curDiff() { if (ui.diff == null) { try { ui.diff = Math.max(0, Math.min(2, +localStorage.getItem('tcg_diff') || 0)); } catch (e) { ui.diff = 0; } } return ui.diff; }
  function diffHtml() {
    var d = curDiff();
    return '<div class="qdiff"><span class="qdl">Dificultad de la IA</span><div class="qdbtns">' + DIFFS.map(function (x, i) { return '<button class="' + (i === d ? 'on' : '') + '" data-act="qdiff" data-v="' + i + '">' + x.n + '</button>'; }).join('') + '</div><span class="qdd">' + DIFFS[d].d + ' <b>' + DIFFS[d].r + '</b></span></div>';
  }
  function renderModes() {
    var qt = ui.qt === 'pl' ? 'pl' : 'ia', qm = QMODES.filter(function (m) { return m.id === ui.qm; })[0] || QMODES[0], qo = ui.qo === 'vs4' ? 'vs4' : '1v1';
    var opts = QOPTS[qt], cur = opts.filter(function (o) { return o.id === qo; })[0];
    var fx = ui.qfx || ''; ui.qfx = '';
    app.innerHTML = head('play', '' + ic('espadas') + ' Elige modo de juego') + (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') +
      tutStrip() + '<div class="qsel' + (fx ? ' fx-' + fx : '') + '">' +
      '<div class="qtypes"><button class="' + (qt === 'ia' ? 'on' : '') + '" data-act="qtype" data-v="ia">' + ic('robot') + ' Contra IA</button><button class="' + (qt === 'pl' ? 'on' : '') + '" data-act="qtype" data-v="pl">' + ic('grupo') + ' Contra jugadores</button></div>' +
      '<div class="qmodes">' + QMODES.map(function (m) { return '<button class="qmode' + (m === qm ? ' on' : '') + '" data-act="qmode" data-v="' + m.id + '"><span class="qframe">' + ic(m.icon) + '</span><b>' + m.name + '</b><span class="qsub">' + m.sub + '</span></button>'; }).join('') + '</div>' +
      '<div class="qbody" style="--qart:url(/cartas/art/' + QART[qt][qm.id][qo] + '.webp)"><div class="qleft"><p class="qdesc">' + qm.desc + '</p><p class="qdeck">' + (qm.nodeck ? 'No necesitas mazo: empiezas con la tienda y construyes tu composición sobre la marcha.' : 'Antes de jugar elegirás uno de tus mazos guardados.') + '</p>' +
      '<div class="qopts">' + opts.map(function (o) { return '<button class="qopt' + (o === cur ? ' on' : '') + '" data-act="qopt" data-v="' + o.id + '"><i class="qdia"></i><span class="qot"><b>' + ic(o.icon) + ' ' + o.name + '</b><span>' + (qm.nodeck ? o.sub.replace(' con tu mazo', '').replace(', cada una con un mazo distinto', '') : o.sub) + '</span></span></button>'; }).join('') + '</div>' +
      (qt === 'ia' ? diffHtml() : '') + '<p class="qnote ' + (qt === 'ia' ? 'ia' : 'pl') + '">' + (qt === 'ia' ? 'Contra IA: menos monedas y sin puntos de clasificación (salvo al vencer al Experto).' : 'Contra jugadores: puntúan en la clasificación.') + '</p></div><div class="qart" aria-hidden="true"></div></div>' +
      '<div class="qconfirm"><button class="qgo" data-act="' + cur.act[qm.id] + '"><span class="qx">' + ic('avance') + '</span><span class="qgot">Confirmar</span></button></div></div>' + (ui.pick ? pickHtml() : '');
  }
  function themeCards(t) { return D.cards.filter(function (c) { return c.themes.indexOf(t) >= 0; }).concat(D.actions.filter(function (a) { return a.theme === t; })); }
  var RARS = ['Común', 'Rara', 'Épica', 'Legendaria'], RCOL = { 'Común': '#9ca3af', 'Rara': '#60a5fa', 'Épica': '#c084fc', 'Legendaria': '#fbbf24' };
  // Cada Correa tiene su novia: una miniatura en la carta permite alternar entre los dos
  var GIRL = { 'lihone-correa': 'eriko', 'dashlight-correa': 'helena', 'potango': 'lucia', 'chipy-correa': 'ari' };
  function colCard(c) {
    var own = owns(c.id), gid = GIRL[c.id], show = c, thumb = '';
    if (gid) {
      var girlView = !!(ui.novView && ui.novView[c.id]);
      thumb = '<span class="novt" data-act="novtog" data-id="' + c.id + '" title="' + (girlView ? 'Ver a ' + esc(c.name) : 'Ver a ' + esc(CARD[gid].name) + ', su novia') + '"><img src="/cartas/art/' + (girlView ? c.id : gid) + '.webp" alt=""></span>';
      if (girlView) show = CARD[gid];
    }
    return cardHtml(show, { skin: '', lv: own ? lvOf(c.id) : 1, size: true, cls: own ? '' : 'locked', extra: thumb + (own ? '' : '<span class="lockb">' + ic('candado') + '</span>'), attrs: 'data-act="zoom" data-id="' + show.id + '" data-skin="" title="Ver en 3D"', tag: 'button' });
  }
  function byLv(arr) { if (!ui.sortLv) return arr; return arr.map(function (c, i) { return [c, i]; }).sort(function (a, b) { return (owns(b[0].id) ? lvOf(b[0].id) : 1) - (owns(a[0].id) ? lvOf(a[0].id) : 1) || a[1] - b[1]; }).map(function (x) { return x[0]; }); }
  function filtered() {
    var f = ui.filters, all = byLv(D.cards.concat(D.actions)).filter(function (c) { return (!ui.onlyOwned || owns(c.id)) && (!ui.rar.length || ui.rar.indexOf(c.rarity) >= 0); });
    if (!f.length) return all;
    var th = f.filter(function (x) { return x !== '__act'; }), act = f.indexOf('__act') >= 0;
    return all.filter(function (c) {
      if (c.type === 'accion') return (act && (ui.fmode === 'any' || !th.length)) || (c.theme && ui.fmode === 'any' && th.indexOf(c.theme) >= 0) || (c.theme && ui.fmode === 'all' && th.length === 1 && th[0] === c.theme);
      if (ui.fmode === 'all') return th.every(function (t) { return c.themes.indexOf(t) >= 0; });
      return th.some(function (t) { return c.themes.indexOf(t) >= 0; });
    });
  }

  // ---------- Colección: Cartas · Mazos · Skins ----------
  function deckErrFor(ids) {
    ids = ids || [];
    if (ids.length < 3) return 'Un mazo necesita al menos 3 cartas.';
    if (E.deckSize(ids) > CFG.deckBudget) return 'El mazo se pasa del presupuesto de espacio.';
    var troops = ids.filter(function (id) { return CARD[id].type === 'tropa'; });
    if (!troops.length) return 'El mazo necesita al menos una tropa.';
    if (!troops.some(function (id) { return CARD[id].rarity === 'Común'; })) return 'Necesitas al menos una tropa Común: la tienda inicial solo ofrece Comunes.';
    return '';
  }
  var RORD = { 'Legendaria': 0, 'Épica': 1, 'Rara': 2, 'Común': 3 };
  function deckCoverId(sl) {
    if (sl.cover && artOk(sl.cover)) return sl.cover;
    var t = sl.ids.filter(function (id) { return ARTS[id] && CARD[id].type === 'tropa'; }).sort(function (a, b) { return RORD[CARD[a].rarity] - RORD[CARD[b].rarity]; })[0];
    return t || '';
  }
  function coverStyle(sl) { var id = deckCoverId(sl); return id ? ' style="background-image:url(/cartas/art/' + id + '.webp)"' : ''; }
  function deckTile(sl, i, attrs, cls) {
    return '<button class="dkt' + (cls || '') + '" ' + attrs + '><span class="dkc"' + coverStyle(sl) + '>' + (deckCoverId(sl) ? '' : ic('cartas')) + '</span><b>' + esc(sl.name) + '</b><span class="dks">' + sl.ids.length + ' cartas · ' + E.deckSize(sl.ids) + '/' + CFG.deckBudget + ' espacio</span></button>';
  }
  var COLTABS = [['cards', 'Cartas'], ['decks', 'Mazos'], ['skins', 'Skins'], ['fx', 'Efectos'], ['inv', 'Inventario']];
  function colSummary(n, total, label) {
    return '<div class="colsum"><div class="colring"><b>' + n + '</b><span>/ ' + total + '</span></div><span class="mut">' + label + '</span></div>';
  }
  function cardsTab() {
    var all = D.cards.concat(D.actions), h = colSummary(ui.acct.owned.length, all.length, 'cartas en propiedad');
    var cnt = function (t) { return themeCards(t).length; };
    h += '<div class="chips filt"><button class="chip' + (!ui.filters.length ? ' on' : '') + '" data-act="filterset" data-t="">Todas</button>' +
      Object.keys(D.themes).map(function (t) { return '<button class="chip' + (ui.filters.indexOf(t) >= 0 ? ' on' : '') + '" style="--tc:' + D.themes[t].color + '" data-act="filter" data-t="' + esc(t) + '">' + tic(t) + esc(t) + ' ' + cnt(t) + '</button>'; }).join('') +
      '<button class="chip' + (ui.filters.indexOf('__act') >= 0 ? ' on' : '') + '" data-act="filter" data-t="__act">Acciones</button></div>';
    h += '<div class="chips filt rarf">' + RARS.map(function (r) { var n = all.filter(function (c) { return c.rarity === r; }).length; return '<button class="chip' + (ui.rar.indexOf(r) >= 0 ? ' on' : '') + '" style="--tc:' + RCOL[r] + '" data-act="rarfilter" data-r="' + r + '"><i class="rdot"></i>' + r + ' ' + n + '</button>'; }).join('') + '</div>';
    h += '<div class="bar" style="margin:.2rem 0 .6rem"><label class="grp"><input type="checkbox" data-act="groupr"' + (ui.groupRar ? ' checked' : '') + '> Agrupar por rareza</label><label class="grp"><input type="checkbox" data-act="group"' + (ui.group ? ' checked' : '') + '> Agrupar por sinergia</label><label class="grp"><input type="checkbox" data-act="onlyowned"' + (ui.onlyOwned ? ' checked' : '') + '> Solo las que tengo</label><label class="grp"><input type="checkbox" data-act="sortlv"' + (ui.sortLv ? ' checked' : '') + '> Ordenar por nivel de carta</label>';
    if (ui.filters.length > 1) h += '<span class="seg"><button class="' + (ui.fmode === 'any' ? 'on' : '') + '" data-act="fmode" data-m="any">Cualquiera de las elegidas</button><button class="' + (ui.fmode === 'all' ? 'on' : '') + '" data-act="fmode" data-m="all">Todas a la vez</button></span>';
    h += '</div><p class="mut colhint">Pulsa una carta para verla en 3D y ver sus skins. Las que aún no tienes aparecen apagadas.</p>';
    var rf = function (c) { return !ui.rar.length || ui.rar.indexOf(c.rarity) >= 0; };
    if (ui.groupRar) {
      var lst = filtered();
      RARS.forEach(function (r) { var g = lst.filter(function (c) { return c.rarity === r; }); if (g.length) h += '<h3 class="gh"><span class="rtag" style="--tc:' + RCOL[r] + '">' + r + '</span> <span class="mut">' + g.length + '</span></h3><div class="deckgrid">' + g.map(colCard).join('') + '</div>'; });
      if (!lst.length) h += '<p class="mut">Ninguna carta cumple los filtros.</p>';
    } else if (ui.group && !ui.filters.length) {
      Object.keys(D.themes).forEach(function (t) { var g = byLv(themeCards(t).filter(rf).filter(function (c) { return !ui.onlyOwned || owns(c.id); })); if (g.length) h += '<h3 class="gh">' + tagHtml(t) + '</h3><div class="deckgrid">' + g.map(colCard).join('') + '</div>'; });
      var ga = byLv(D.actions.filter(function (a) { return !a.theme; }).filter(rf).filter(function (c) { return !ui.onlyOwned || owns(c.id); })); if (ga.length) h += '<h3 class="gh">Acciones</h3><div class="deckgrid">' + ga.map(colCard).join('') + '</div>';
    } else {
      var list = filtered();
      h += list.length ? '<div class="deckgrid">' + list.map(colCard).join('') + '</div>' : '<p class="mut">Ninguna carta cumple todas las sinergias elegidas.</p>';
    }
    return h;
  }
  function skinsTab() {
    var a = ui.acct, SK = window.CARTAS_SKINS || [], have = SK.filter(function (s) { return (a.skins || []).indexOf(s.id) >= 0; }).length;
    var h = colSummary(have, SK.length, 'skins en propiedad') + '<p class="mut colhint">Pulsa una skin para verla en 3D. Se compran en la Tienda (o se ganan en el pase); las que aún no tienes aparecen apagadas.</p>';
    if (!SK.length) return h + '<p class="mut">Aún no hay skins.</p>';
    return h + '<div class="skgrid">' + SK.slice().reverse().map(function (s) {
      var c = CARD[s.card], own = (a.skins || []).indexOf(s.id) >= 0;
      return '<div class="skitem"><div class="skcard">' + cardHtml(c, { skin: s.id, lv: 1, cls: own ? '' : 'locked', extra: own ? '' : '<span class="lockb">' + ic('candado') + '</span>', attrs: 'data-act="zoom" data-id="' + s.card + '" data-skin="' + s.id + '" title="Ver en 3D"', tag: 'button' }) + '</div><b>' + esc(c.name) + '</b><span class="mut">' + esc(s.name) + (own ? ' · ' + ic('check') + ' tuya' : s.pass ? ' · Pase de batalla' : ' · ' + s.price + ' monedas') + '</span>' + skinBtn(a, s) + '</div>';
    }).join('') + '</div>';
  }
  function decksTab() {
    var h = '<p class="mut colhint">Tienes hasta 3 mazos. Para jugar tendrás que elegir uno de ellos.</p>' + (ui.msg ? '<div class="hint">' + esc(ui.msg) + '</div>' : '') + '<div class="dktiles">';
    [0, 1, 2].forEach(function (i) {
      var sl = ui.slots[i];
      h += sl ? deckTile(sl, i, 'data-act="dkopen" data-i="' + i + '"', ui.deckOpen === i ? ' open' : '') : '<button class="dkt empty" data-act="dkedit" data-i="' + i + '"><span class="dkc">+</span><b>Crear mazo</b><span class="dks">Hueco ' + (i + 1) + ' libre</span></button>';
    });
    h += '</div>';
    var o = ui.deckOpen, sl = o != null ? ui.slots[o] : null;
    if (sl) {
      var err = deckErrFor(sl.ids);
      h += '<div class="panel dkopen"><div class="dkhead"><h2>' + esc(sl.name) + '</h2><span class="pill">' + sl.ids.length + ' cartas</span><span class="pill">Espacio <b>' + E.deckSize(sl.ids) + '/' + CFG.deckBudget + '</b></span></div>' +
        (err ? '<div class="hint" style="color:var(--bad)">' + esc(err) + '</div>' : '') +
        '<div class="deckgrid dkcards">' + sl.ids.filter(function (id) { return CARD[id]; }).sort(function (a, b) { return RORD[CARD[a].rarity] - RORD[CARD[b].rarity]; }).map(function (id) {
          var c = CARD[id]; return cardHtml(c, { lv: lvOf(id), size: true, attrs: 'data-act="zoom" data-id="' + id + '" title="Ver en 3D"', tag: 'button' });
        }).join('') + '</div><div class="bar">' +
        (ui.delAsk === o ? '<span class="hint">¿Eliminar «' + esc(sl.name) + '»?</span><button class="btn sm" data-act="dkdelyes" data-i="' + o + '">Sí, eliminar</button><button class="btn sec sm" data-act="dkdelno">No</button>'
          : '<button class="btn" data-act="dkedit" data-i="' + o + '">' + ic('libro') + ' Editar</button><button class="btn sec" data-act="dkdel" data-i="' + o + '">' + ic('papelera') + ' Eliminar</button>') + '</div></div>';
    }
    return h;
  }
  function synInfo(t) {
    var T = D.themes[t]; if (!T) return '';
    return '<div class="synguide" style="--tc:' + T.color + '"><h3>' + tic(t) + esc(t) + '</h3><ul>' + T.tx.map(function (x, k) { return '<li><span class="gn">' + T.th[k] + '</span><p><b>' + T.th[k] + ' cartas distintas</b> ' + esc(x) + '</p></li>'; }).join('') + '</ul></div>';
  }
  function synGuide() {
    return '<div class="synall">' + Object.keys(D.themes).map(synInfo).join('') + '</div>';
  }
  // Sinergias que suman las tropas del mazo en edición (cartas distintas por temática); al pulsar una se filtran sus cartas
  function deckSynHtml(ids) {
    var c = {};
    ids.forEach(function (id) { var cd = CARD[id]; if (cd && cd.type === 'tropa') cd.themes.forEach(function (t) { c[t] = (c[t] || 0) + 1; }); });
    var keys = Object.keys(c).sort(function (a, b) { return E.tierOf(b, c[b]) - E.tierOf(a, c[a]) || c[b] - c[a]; });
    if (!keys.length) return '<div class="dlbl">Sinergias incluidas</div><p class="mut">Aún no hay tropas en el mazo.</p>';
    return '<div class="dlbl">Sinergias incluidas</div><div class="synlist dsyn">' + keys.map(function (t) {
      var T = D.themes[t], tier = E.tierOf(t, c[t]), nxt = T.th[tier];
      return '<div class="syn-row t' + tier + '" style="--tc:' + T.color + '" tabindex="0" data-act="dethm" data-t="' + esc(t) + '" title="Ver las cartas de ' + esc(t) + '"><div class="hexa"><b>' + c[t] + '</b></div><div class="si"><b>' + esc(t) + '</b><div class="th">' +
        T.th.map(function (n, k) { return '<i class="' + (k < tier ? 'on' : '') + '">' + n + '</i>'; }).join('') + '</div></div><span class="need">' + (nxt ? c[t] + '/' + nxt : ic('check') + ' máx') + '</span></div>';
    }).join('') + '</div>';
  }
  // ---------- Montaje automático de mazos ----------
  var AUTO_ACT = ['entrenamiento', 'armadura', 'golpe-certero', 'arenga', 'intimidacion', 'banquete', 'lluvia', 'mal-de-ojo']; // acciones generales por orden de preferencia
  var RBON = { 'Común': 0, 'Rara': 2, 'Épica': 4, 'Legendaria': 6 };
  function autoBuild(sel) {
    var B = CFG.deckBudget, deck = [], used = 0, has = function (id) { return deck.indexOf(id) >= 0; };
    var matches = function (c) { return c.themes.filter(function (t) { return sel.indexOf(t) >= 0; }).length; };
    var base = function (c) { return matches(c) * 10 + (c.atk * 1.5 + c.hp * .6) * .35 + RBON[c.rarity] + (lvOf(c.id) - 1) + (2 - c.size) * 1.5; };
    var cand = D.cards.filter(function (c) { return owns(c.id) && matches(c) > 0; });
    // acciones: las de las sinergias elegidas (hasta 2) y generales (hasta 3)
    var tAct = D.actions.filter(function (a) { return a.theme && sel.indexOf(a.theme) >= 0 && owns(a.id); }).slice(0, 2).map(function (a) { return a.id; });
    var gAct = AUTO_ACT.filter(function (id) { return owns(id); }).slice(0, 3);
    var acts = tAct.concat(gAct), reserve = acts.length;
    var add = function (c) { deck.push(c.id); used += c.size; };
    var tb = B - reserve, big = 0, hi = 0;
    var fits = function (c) { return !has(c.id) && used + c.size <= tb && !(c.size >= 3 && big >= 2) && !(c.cost >= 4 && hi >= 4); };
    var take = function (c) { add(c); if (c.size >= 3) big++; if (c.cost >= 4) hi++; };
    // 1) una tropa Común (la tienda inicial solo ofrece Comunes): la mejor de las sinergias o, si no hay, la más barata que tengas
    var com = cand.filter(function (c) { return c.rarity === 'Común'; }).sort(function (a, b) { return base(b) - base(a); })[0] || D.cards.filter(function (c) { return owns(c.id) && c.rarity === 'Común'; }).sort(function (a, b) { return a.cost - b.cost; })[0];
    if (com) take(com);
    // 2) cobertura: cada sinergia debe alcanzar su segundo nivel (o el máximo que permitan tus cartas)
    var target = function (t) { var th = D.themes[t].th; return th[Math.min(1, th.length - 1)]; };
    var count = function (t) { return deck.filter(function (id) { return CARD[id].type === 'tropa' && CARD[id].themes.indexOf(t) >= 0; }).length; };
    for (var g = 0; g < 40; g++) {
      var need = sel.filter(function (t) { return count(t) < target(t) && cand.some(function (c) { return fits(c) && c.themes.indexOf(t) >= 0; }); });
      if (!need.length) break;
      var best = null, bv = -1;
      cand.forEach(function (c) { if (!fits(c)) return; var v = base(c) + c.themes.filter(function (t) { return need.indexOf(t) >= 0; }).length * 8; if (v > bv) { bv = v; best = c; } });
      if (!best) break; take(best);
    }
    // 3) el resto de tropas de las sinergias, de mejor a peor
    cand.slice().sort(function (a, b) { return base(b) - base(a); }).forEach(function (c) { if (fits(c)) take(c); });
    // 4) relleno con tus mejores tropas baratas de otras sinergias si sobra sitio
    D.cards.filter(function (c) { return owns(c.id) && !has(c.id) && c.cost <= 3; }).sort(function (a, b) { return (b.atk * 1.5 + b.hp * .6) / b.size - (a.atk * 1.5 + a.hp * .6) / a.size; }).forEach(function (c) { if (fits(c)) take(c); });
    // 5) acciones
    acts.forEach(function (id) { if (used + CARD[id].size <= B) { deck.push(id); used += CARD[id].size; } });
    // 6) si aún sobra espacio: más tropas o acciones que tengas
    D.cards.filter(function (c) { return owns(c.id) && !has(c.id); }).sort(function (a, b) { return base(b) - base(a); }).forEach(function (c) { if (!has(c.id) && used + c.size <= B) { deck.push(c.id); used += c.size; } });
    D.actions.filter(function (a) { return owns(a.id) && !has(a.id) && (!a.theme || sel.indexOf(a.theme) >= 0); }).forEach(function (a) { if (!has(a.id) && used + a.size <= B) { deck.push(a.id); used += a.size; } });
    return deck;
  }
  function autoModal() {
    var a = ui.auto, sel = a.sel;
    var chips = Object.keys(D.themes).map(function (t) {
      var n = D.cards.filter(function (c) { return c.themes.indexOf(t) >= 0 && owns(c.id); }).length;
      return '<button class="chip' + (sel.indexOf(t) >= 0 ? ' on' : '') + '" style="--tc:' + D.themes[t].color + '" data-act="autotog" data-t="' + esc(t) + '">' + tic(t) + esc(t) + ' <small>' + n + '</small></button>';
    }).join('');
    return '<div class="overlay autoov"><div class="panel autop"><h2>' + ic('dado') + ' Montaje automático</h2><p class="mut">Elige de 1 a 3 sinergias. Montaré un mazo con tus cartas de esas sinergias y acciones generales. El número de cada sinergia son las cartas que tienes de ella.</p><div class="chips filt">' + chips + '</div>' +
      '<p class="mut">' + sel.length + '/3 elegidas' + (a.msg ? ' · <span style="color:var(--bad)">' + esc(a.msg) + '</span>' : '') + '</p>' +
      '<div class="bar" style="justify-content:center"><button class="btn cta" data-act="autogo"' + (sel.length ? '' : ' disabled') + '>' + ic('check') + ' Montar mazo</button><button class="btn sec" data-act="autoclose">Cancelar</button></div></div></div>';
  }
  function deckEditor() {
    var d = ui.dedit, used = E.deckSize(d.ids), err = deckErrFor(d.ids), troops = d.ids.filter(function (id) { return CARD[id].type === 'tropa'; }).length;
    var segs = ''; for (var k = 0; k < CFG.deckBudget; k++) segs += '<i' + (k < used ? ' class="on"' : '') + '></i>';
    var covers = D.cards.filter(function (c) { return owns(c.id) && ARTS[c.id]; }).map(function (c) { return c.id; }).concat((ui.acct.skins || []).filter(artOk)), cur = d.cover || deckCoverId({ cover: '', ids: d.ids });
    var left = '<div class="panel dedleft"><label class="dlbl">Nombre del mazo<input id="de-name" maxlength="20" value="' + esc(d.name) + '" placeholder="Nombre"></label>' +
      '<div class="dlbl">Portada del mazo</div><div class="decovers">' + (covers.length ? covers.map(function (id) { return '<button class="' + (id === cur ? 'on' : '') + '" data-act="decover" data-id="' + id + '" title="' + esc((CARD[id] || {}).name || id) + '" style="background-image:url(/cartas/art/' + id + '.webp)"></button>'; }).join('') : '<span class="mut">Aún no tienes ilustraciones.</span>') + '</div>' +
      '<div class="bar" style="margin:.6rem 0 0"><span class="pill">Espacio <b>' + used + '/' + CFG.deckBudget + '</b></span><span class="pill">' + troops + ' tropas</span><span class="pill">' + d.ids.length + ' cartas</span></div><div class="meter">' + segs + '</div>' +
      (ui.autoNote && !ui.msg ? '<div class="hint">' + esc(ui.autoNote) + '</div>' : '') + (ui.msg ? '<div class="hint" style="color:var(--bad)">' + esc(ui.msg) + '</div>' : (err && d.ids.length ? '<div class="hint" style="color:var(--bad)">' + esc(err) + '</div>' : '')) +
      deckSynHtml(d.ids) +
      '<div class="dlbl">En el mazo</div><ul class="delist">' + (d.ids.length ? d.ids.map(function (id) { var c = CARD[id]; return '<li><span>' + esc(c.name) + '</span><i class="pips">' + new Array(c.size + 1).join('●') + '</i><button data-act="detoggle" data-id="' + id + '" title="Quitar">✕</button></li>'; }).join('') : '<li class="mut">Vacío: elige una sinergia y añade cartas.</li>') + '</ul>' +
      '<div class="bar"><button class="btn sec sm" data-act="deauto">' + ic('estrella') + ' Montaje automático</button><button class="btn sec sm" data-act="derand">' + ic('dado') + ' Aleatorio</button><button class="btn sec sm" data-act="declear">Vaciar</button></div>' +
      '<div class="bar"><button class="btn cta" data-act="desave"' + (err ? ' disabled' : '') + '>' + ic('disquete') + ' Guardar mazo</button><button class="btn sec" data-act="decancel">Cancelar</button></div></div>';
    var th = d.theme, chips = '<div class="chips filt">' + Object.keys(D.themes).map(function (t) { var n = themeCards(t).filter(function (c) { return owns(c.id); }).length; return '<button class="chip' + (th === t ? ' on' : '') + '" style="--tc:' + D.themes[t].color + '" data-act="dethm" data-t="' + esc(t) + '">' + tic(t) + esc(t) + ' ' + n + '</button>'; }).join('') +
      '<button class="chip' + (th === '__gen' ? ' on' : '') + '" data-act="dethm" data-t="__gen">Acciones generales</button></div>';
    var list = !th ? null : (th === '__gen' ? D.actions.filter(function (a) { return !a.theme; }) : themeCards(th)).filter(function (c) { return owns(c.id); });
    var guide = '<div class="bar synbar"><button class="btn sec sm' + (ui.synAll ? ' on' : '') + '" data-act="synall">' + ic('libro') + ' ' + (ui.synAll ? 'Ocultar guía de sinergias' : 'Guía de todas las sinergias') + '</button></div>' + (ui.synAll ? synGuide() : (th && th !== '__gen' ? synInfo(th) : ''));
    var grid = ui.synAll ? '' : !th ? '<p class="mut">Elige una sinergia para ver qué hace y tus cartas de esa sinergia, y añadirlas al mazo.</p>' : !list.length ? '<p class="mut">No tienes ninguna carta de esta sinergia todavía.</p>' :
      '<div class="deckgrid">' + byLv(list).map(function (c) { return cardHtml(c, { lv: lvOf(c.id), size: true, cls: d.ids.indexOf(c.id) >= 0 ? 'in' : '', attrs: 'data-act="detoggle" data-id="' + c.id + '"', tag: 'button', extra: '<span class="eyeb" data-act="zoom" data-id="' + c.id + '" title="Ver ampliada en 3D">' + ic('ojo') + '</span>' }); }).join('') + '</div>';
    return (ui.auto ? autoModal() : '') + '<div class="dedlayout">' + left + '<div class="dedright"><h2 class="dedh">' + (ui.slots[d.i] ? 'Editando' : 'Nuevo mazo') + ' · hueco ' + (d.i + 1) + '</h2>' + chips + guide + grid + '</div></div>';
  }
  function renderDeck() {
    var tab = ui.dedit ? 'decks' : (ui.colTab || 'cards');
    var h = head('deck', '' + ic('cartas') + ' Colección') + '<div class="shtabs">' + COLTABS.map(function (t) { return '<button class="' + (t[0] === tab ? 'on' : '') + '" data-act="coltab" data-t="' + t[0] + '">' + t[1] + '</button>'; }).join('') + '</div>';
    h += '<div class="shbody">' + (tab === 'decks' ? (ui.dedit ? deckEditor() : decksTab()) : tab === 'skins' ? skinsTab() : tab === 'fx' ? effectsTab() : tab === 'inv' ? invTab() : cardsTab()) + '</div></div>';
    app.innerHTML = h + (tab === 'inv' ? boxOverlay() + packOverlay() : '');
  }
  function pickHtml() {
    var tiles = [0, 1, 2].map(function (i) {
      var sl = ui.slots[i]; if (!sl) return '';
      var err = deckErrFor(sl.ids);
      return deckTile(sl, i, err ? 'disabled title="' + esc(err) + '"' : 'data-act="pickdeck" data-i="' + i + '"', err ? ' off' : '');
    }).join('');
    return '<div class="overlay pickov"><div class="panel pickp"><h2>' + ic('cartas') + ' ¿Con qué mazo quieres jugar?</h2><div class="dktiles">' + tiles + '</div><div class="bar" style="justify-content:center"><button class="btn sec" data-act="pickcancel">Cancelar</button></div></div></div>';
  }
  var PLAYACTS = { startai: 1, startrev: 1, startvs4b: 1, startrevvs4b: 1, openpvp: 1, openrevpvp: 1, openvs4: 1, openrevvs4: 1 };
  function askDeck(act) {
    var ok = ui.slots.some(function (sl) { return sl && !deckErrFor(sl.ids); });
    if (!ok) { ui.colTab = 'decks'; ui.screen = 'deck'; ui.msg = 'Aún no tienes ningún mazo guardado válido: crea uno para poder jugar.'; window.scrollTo(0, 0); return render(); }
    ui.pick = { act: act }; render();
  }

  // ---------- Emoticonos ----------
  var EMO = window.CARTAS_EMOTES || { SETS: [], parse: function () { return null; }, setOf: function () { return null; } };
  function emoSrc(eid) { return '/cartas/emo/' + eid + '.webp'; }
  function emoImg(eid, cls) { var p = EMO.parse(eid); return p ? '<img class="emo' + (cls ? ' ' + cls : '') + '" src="' + emoSrc(eid) + '" alt="' + esc(p.name) + '" title="' + esc(p.name) + '">' : ''; }
  function mySets() { return ((ui.acct && ui.acct.emoteSets) || []).map(function (id) { return EMO.setOf(id); }).filter(Boolean); }
  ui.emoImg = emoImg; ui.emoSets = mySets;
  function emoPickClose() { var o = document.getElementById('emopick'); if (o) o.remove(); document.removeEventListener('mousedown', emoPickOut, true); document.removeEventListener('keydown', emoPickKey); }
  function emoPickOut(e) { var o = document.getElementById('emopick'); if (o && !o.contains(e.target) && !(e.target.closest && e.target.closest('[data-emo-open]'))) emoPickClose(); }
  function emoPickKey(e) { if (e.key === 'Escape') emoPickClose(); }
  // Selector de emoticonos flotante junto a un botón; cb(eid) al elegir uno
  ui.emoPick = function (anchor, cb) {
    var was = document.getElementById('emopick'); emoPickClose(); if (was && was.dataset.for === (anchor.id || anchor.className)) return;
    var sets = mySets(), cur = sets[0] ? sets[0].id : '', o = document.createElement('div');
    o.id = 'emopick'; o.dataset.for = anchor.id || anchor.className;
    function draw() {
      if (!sets.length) { o.innerHTML = '<p class="emoempty">Aún no tienes emoticonos. Consigue sets de emoticonos en el pase de batalla.</p>'; return; }
      var s = EMO.setOf(cur);
      o.innerHTML = '<div class="emotabs">' + sets.map(function (x) { return '<button class="' + (x.id === cur ? 'on' : '') + '" data-set="' + x.id + '" title="' + esc(x.name) + '">' + emoImg(x.id + '-1') + '</button>'; }).join('') + '</div><div class="emogrid">' + s.emotes.map(function (n, i) { return '<button data-e="' + s.id + '-' + (i + 1) + '" title="' + esc(n) + '">' + emoImg(s.id + '-' + (i + 1)) + '</button>'; }).join('') + '</div>';
    }
    o.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-set]'), b = e.target.closest('[data-e]');
      if (tb) { cur = tb.dataset.set; draw(); } else if (b) { var eid = b.dataset.e; emoPickClose(); cb(eid); }
    });
    draw(); document.body.appendChild(o);
    var r = anchor.getBoundingClientRect();
    o.style.left = Math.max(8, Math.min(window.innerWidth - o.offsetWidth - 8, r.left)) + 'px';
    o.style.bottom = (window.innerHeight - r.top + 8) + 'px';
    setTimeout(function () { document.addEventListener('mousedown', emoPickOut, true); document.addEventListener('keydown', emoPickKey); }, 0);
  };
  // Burbujas de emoticono en partida (fuera de #app para que no se borren al repintar)
  function emoShow(name, eid, mine) {
    if (!EMO.parse(eid)) return;
    var host = document.getElementById(mine ? 'emome' : 'emoz');
    if (!host) { host = document.createElement('div'); host.id = mine ? 'emome' : 'emoz'; document.body.appendChild(host); }
    var b = document.createElement('div'); b.className = 'emobub' + (mine ? ' mine' : '');
    b.innerHTML = emoImg(eid) + '<span>' + esc(mine ? 'Tú' : name) + '</span>';
    host.appendChild(b); snd('pick');
    setTimeout(function () { b.classList.add('out'); setTimeout(function () { b.remove(); }, 400); }, 3400);
  }
  // Emoticonos que trae una vista de partida online: se muestra el que sea nuevo y reciente
  function emoApply(d) {
    if (!d || !d.em) return;
    PV.emN = PV.emN && PV.emId === PV.id ? PV.emN : {}; PV.emId = PV.id;
    d.em.forEach(function (x, i) {
      if (!x) return;
      var seen = PV.emN[i];
      if (seen != null && x.n <= seen) return;
      PV.emN[i] = x.n;
      if (seen == null && x.ago > 4000) return; // ya estaba al unirte
      var mine = d.vs4 ? i === d.seat : i === 0, name = d.vs4 ? (d.emn || [])[i] : (d.names || [])[i];
      emoShow(name || 'Rival', x.e, mine);
    });
  }
  function emoSend(eid) {
    if (PV.on) return api(PV.px + 'Emote', { id: PV.id, e: eid }).then(function (r) { if (r.ok) { if (r.data.em) emoApply(r.data); pvpGot(r); } });
    emoShow('Tú', eid, true); // contra la IA solo lo ves tú
  }
  function emoSync() {
    var on = ui.screen === 'game' && !ui.tut && ui.acct && mySets().length, b = document.getElementById('emobtn');
    if (!on) { if (b) b.remove(); var z = document.getElementById('emoz'), m = document.getElementById('emome'); if (z) z.remove(); if (m) m.remove(); return; }
    if (b) return;
    b = document.createElement('button'); b.id = 'emobtn'; b.setAttribute('data-emo-open', '1'); b.title = 'Emoticonos'; b.setAttribute('aria-label', 'Emoticonos');
    b.innerHTML = ic('emoji');
    b.addEventListener('click', function () { ui.emoPick(b, emoSend); });
    document.body.appendChild(b);
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
      call = PV.wait.kind === 'search' ? api(PV.px + 'Search', { deck: ui.deck, mode: PV.mode, cover: curCover() }) : api(PV.px + 'Poll', {});
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
      if (d.host && PV.wait.host !== d.host) { PV.wait.host = d.host; if (ui.screen === 'pvp') render(); }
      if (d.code && PV.wait.code !== d.code) { PV.wait.code = d.code; if (ui.screen === 'pvp') render(); }
      return pvpSchedule(PV.wait.kind === 'search' ? 2000 : 1500);
    }
    if (d.same) {
      var ch = PV.rdy[0] !== d.rdy[0] || PV.rdy[1] !== d.rdy[1];
      PV.rdy = d.rdy; if (d.dl && !ui.playing) ui.deadline = Date.now() + d.dl;
      if (ch && !ui.playing && !ui.busy) render();
      return pvpSchedule(1200);
    }
    if (d.s) { if (!PV.on) pvpBegin(d); else pvpAdopt(d); emoApply(d); pvpSchedule(1200); }
  }
  function pvpBegin(d) {
    pvpReset(); PV.on = true; PV.id = d.id; PV.seat = d.seat; PV.names = d.names; PV.rdy = d.rdy; PV.v = d.v;
    PV.seenFight = d.s.fightN || 0; PV.seenAct = 0;
    d.s.acts.forEach(function (a) { PV.seenAct = Math.max(PV.seenAct, a.n); }); d.s.acts = [];
    ui.s = d.s; ui.screen = 'game'; ui.reward = d.reward || null; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = ''; ui.landed = null; ui.busy = false; ui.seenKey = null;
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
  function boardHtml(s) {
    if (!s.board) return '';
    return '<div class="synside panel vs4b"><h2>' + ic('grupo') + ' La mesa</h2>' + s.board.map(function (b) {
      return '<div class="b4' + (b.me ? ' me' : '') + (b.out ? ' out' : '') + (b.opp ? ' opp' : '') + '"><span class="n">' + esc(b.name) + '</span><span class="l">' + (b.out ? b.place + 'º' : b.life) + '</span><span class="t">' +
        (b.out ? 'eliminado' : b.me ? 'tú' : b.opp ? 'tu rival' : b.rest ? 'descansa' : '') + (!b.out && b.rdy ? ' ' + ic('check') : '') + '</span></div>';
    }).join('') + '</div>';
  }
  // Portada del mazo que vas a jugar (la del hueco de mazo que coincide con el actual, o la mejor tropa)
  function curCover() {
    var key = ui.deck.join(','), sl = ui.slots.filter(function (x) { return x && x.ids && x.ids.join(',') === key; })[0];
    return deckCoverId(sl || { ids: ui.deck, cover: '' });
  }
  function v4Slots(w) {
    var me = ui.acct ? ui.acct.name.toLowerCase() : '', host = w.kind === 'code' && w.host && w.host === me, pl = (w.players && w.players.length ? w.players : (ui.acct ? [{ name: ui.acct.name, avatar: ui.acct.avatar, cover: curCover() }] : [])), h = '<div class="v4slots">';
    for (var k = 0; k < 4; k++) {
      var x = pl[k];
      if (!x) { h += '<div class="v4s empty"><span class="v4plus">+</span>' + (host ? '<button class="btn sm" data-act="v4addbot">' + ic('robot') + ' Añadir bot</button>' : '<small>Esperando jugador…</small>') + '</div>'; continue; }
      var av = x.bot ? '<span class="avt v4av">' + ic('robot') + '</span>' : '<span class="avt v4av' + (artOk(x.avatar) ? ' has' : '') + '"' + (artOk(x.avatar) ? ' style="background-image:url(/cartas/art/' + x.avatar + '.webp)"' : '') + '>' + (artOk(x.avatar) ? '' : ic('usuario')) + '</span>';
      var cv = x.cover && CARD[x.cover] && ARTS[x.cover] ? ' style="background-image:url(/cartas/art/' + x.cover + '.webp)"' : '';
      h += '<div class="v4s' + (x.bot ? ' bot' : '') + (x.name.toLowerCase() === me ? ' me' : '') + '">' + (x.bot && host ? '<button class="v4rm" data-act="v4rmbot" data-name="' + esc(x.name) + '" title="Quitar bot" aria-label="Quitar bot">×</button>' : '') + av + '<b class="v4n">' + esc(x.name) + '</b><span class="v4sel">Mazo</span><span class="v4dk"' + cv + '>' + (cv ? '' : ic('cartas')) + '</span>' + (x.bot ? '<small>IA · Normal</small>' : '') + '</div>';
    }
    return h + '</div>';
  }
  function renderPvp() {
    var w = PV.wait, v4 = ui.lobby === 'vs4', h = head('play', v4 ? '' + ic('grupo') + (PV.mode === 'rumble' ? ' Royal Rumble · Versus de 4' : PV.mode === 'revive' ? ' Resurrección · Versus de 4' : ' Versus de 4') : '' + ic('espadas') + (PV.mode === 'rumble' ? ' Royal Rumble · 1 vs 1' : PV.mode === 'revive' ? ' Resurrección · 1 vs 1' : ' Jugador contra jugador'));
    if (w) {
      h += '<div class="panel pvpwait' + (v4 ? ' v4w' : '') + '">' + (w.kind === 'code'
        ? '<h2>' + (v4 ? 'Sala de 4' : 'Sala creada') + '</h2><p class="mut">' + (v4 ? 'Pasa este código a 3 jugadores más o añade bots en los huecos vacíos. Cuando estéis los 4, empieza sola.' : 'Pásale este código a tu rival. Cuando lo escriba, la partida empieza sola.') + '</p><div class="pvpcode">' + esc(w.code || '·····') + '</div>'
        : '<h2>' + (v4 ? 'Buscando jugadores…' : 'Buscando rival…') + '</h2><p class="mut">' + (v4 ? 'Empieza al juntarse 4 jugadores buscando partida.' : 'Te emparejaremos con el primero que busque partida.') + '</p>') +
        (v4 ? v4Slots(w) : '') +
        '<div class="waitdots"><i></i><i></i><i></i></div><button class="btn sec" data-act="pvpcancel">Cancelar</button></div></div>';
      app.innerHTML = h; return;
    }
    h += '<p class="mut">' + (PV.mode === 'rumble' ? 'Royal Rumble: no usas mazo, puede salir cualquier carta. ' : 'Usarás tu mazo actual (' + deckSize() + '/' + CFG.deckBudget + '). ') + (v4 ? 'Empiezas con <b>' + (PV.mode === 'revive' || PV.mode === 'rumble' ? 40 : 30) + ' de vida</b> y <b>14 de oro</b> (+3 por ronda). Ganas <b>+15</b> monedas por jugar y hasta <b>+45</b> más según tu puesto (1º +45, 2º +20, 3º +5). ' : 'Ganas <b>+15</b> monedas por partida y <b>+40</b> más si ganas. ') + 'Si abandonas o pierdes la conexión más de 60 s, quedas eliminado.</p>' +
      (ui.msg ? '<p class="err">' + esc(ui.msg) + '</p>' : '') + '<div class="pvpgrid">' +
      '<div class="panel"><h2>' + ic('dado') + ' Buscar rival</h2><p class="mut">' + (v4 ? 'Emparejamiento automático: empieza al juntarse 4 jugadores.' : 'Emparejamiento automático con cualquier jugador que esté buscando.') + '</p><button class="btn big" data-act="pvpsearch">Buscar partida</button></div>' +
      '<div class="panel"><h2>' + ic('espadas') + ' Crear sala</h2><p class="mut">' + (v4 ? 'Te damos un código para que se unan otros 3 jugadores.' : 'Te damos un código para que tu amigo se una.') + '</p><button class="btn big" data-act="pvpcreate">Crear sala</button></div>' +
      '<div class="panel"><h2>' + ic('puerta') + ' Unirme con código</h2><p class="mut">Escribe el código de 5 letras que te han pasado.</p><input id="pvp-code" class="pvpin" maxlength="5" autocomplete="off" placeholder="ABCDE"><button class="btn big" data-act="pvpjoin">Unirme</button></div>' +
      '</div></div>';
    app.innerHTML = h;
  }

  // ---------- Animación de la Genkidama / Kamehameha ----------
  // La energía sale de las tropas Anime, se forma la esfera en el centro de la mesa y se lanza contra el rival.
  function ctr(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }
  function genCapture(c, uid) {
    var s = ui.s, srcs = [], tg = [];
    document.querySelectorAll('[data-cuid][data-side="0"]').forEach(function (el) { var I = inst(s.p[0], +el.dataset.cuid); if (I && E.has(I, 'Anime') && !I.dead) srcs.push(ctr(el)); });
    document.querySelectorAll('[data-cuid][data-side="1"]').forEach(function (el) { if (c.id === 'kamehameha' || +el.dataset.cuid === uid) tg.push(ctr(el)); });
    var b = document.getElementById('board'), bc = b ? ctr(b) : { x: innerWidth / 2, y: innerHeight / 2 };
    var tot = E.genStored(s.p[0]);
    return { id: c.id, srcs: srcs, tg: tg, mid: { x: bc.x, y: bc.y }, pow: Math.min(1, tot / 30) };
  }
  function genPlay(fx) {
    var ov = document.createElement('div'); ov.className = 'gkov'; document.body.appendChild(ov);
    var T0 = 0, anims = [];
    function el(cls, x, y, size) { var e = document.createElement('i'); e.className = cls; e.style.left = x - size / 2 + 'px'; e.style.top = y - size / 2 + 'px'; e.style.width = e.style.height = size + 'px'; ov.appendChild(e); return e; }
    function go(e, kf, o) { var a = e.animate(kf, Object.assign({ fill: 'both', easing: 'ease-in-out' }, o)); anims.push(a); return a; }
    var mid = fx.mid, S = 90 + fx.pow * 90;
    snd('magic');
    // 1) la energía sale de cada tropa Anime y viaja hasta el centro
    fx.srcs.forEach(function (sc, k) {
      for (var j = 0; j < 9; j++) {
        var sz = 7 + Math.random() * 8, e = el('gkp', sc.x + (Math.random() - .5) * sc.w * .6, sc.y + (Math.random() - .5) * sc.h * .6, sz);
        var dx = mid.x - parseFloat(e.style.left) - sz / 2, dy = mid.y - parseFloat(e.style.top) - sz / 2, bend = (Math.random() - .5) * 140;
        go(e, [{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { transform: 'translate(' + dx * .45 + 'px,' + (dy * .45 + bend) + 'px) scale(1.2)', opacity: 1, offset: .45 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity: 0 }], { duration: 850 + Math.random() * 250, delay: k * 110 + j * 70 });
      }
      var ring = el('gkr', sc.x, sc.y, Math.max(sc.w, sc.h) * .9);
      go(ring, [{ transform: 'scale(.6)', opacity: 0 }, { transform: 'scale(1.1)', opacity: .9, offset: .4 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 700, delay: k * 110 });
    });
    var formAt = 700 + fx.srcs.length * 110 + 300;
    // 2) se forma la esfera
    var sph = el('gks', mid.x, mid.y, S), halo = el('gkh', mid.x, mid.y, S * 2.2);
    go(sph, [{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: .6 }, { transform: 'scale(1.12)', opacity: 1 }], { duration: 700, delay: formAt - 600 });
    go(halo, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: .8 }], { duration: 700, delay: formAt - 600 });
    var pulse = sph.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(.98)' }, { transform: 'scale(1.12)' }], { duration: 380, delay: formAt + 100, iterations: 2, fill: 'both' }); anims.push(pulse);
    var launch = formAt + 800;
    // 3) se lanza contra el rival (o se abre en rayos hacia cada tropa en la Kamehameha)
    var tgs = fx.tg.length ? fx.tg : [{ x: mid.x, y: mid.y - 160, w: 100, h: 140 }];
    tgs.forEach(function (t, k) {
      var b = k === 0 ? sph : el('gks', mid.x, mid.y, S * .6), hl = k === 0 ? halo : el('gkh', mid.x, mid.y, S * 1.3);
      var dx = t.x - mid.x, dy = t.y - mid.y;
      if (k) { go(b, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: launch }); go(hl, [{ opacity: 0 }, { opacity: .8 }], { duration: 1, delay: launch }); }
      var sc0 = k ? 1 : 1.12;
      go(b, [{ transform: 'translate(0,0) scale(' + sc0 + ')', opacity: 1 }, { transform: 'translate(' + dx * .96 + 'px,' + dy * .96 + 'px) scale(' + (sc0 * .8) + ')', opacity: 1, offset: .92 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2)', opacity: 0 }], { duration: 420, delay: launch, easing: 'cubic-bezier(.6,0,.9,.5)' });
      go(hl, [{ transform: 'translate(0,0) scale(1)', opacity: .8 }, { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.5)', opacity: 0 }], { duration: 420, delay: launch, easing: 'cubic-bezier(.6,0,.9,.5)' });
      var hit = el('gkx', t.x, t.y, Math.max(t.w, t.h) * 1.6), fl = el('gkf', t.x, t.y, Math.max(t.w, t.h) * 1.1);
      go(hit, [{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(.7)', opacity: 1, offset: .25 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 650, delay: launch + 400 });
      go(fl, [{ transform: 'scale(.5)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: .2 }, { transform: 'scale(1.2)', opacity: 0 }], { duration: 450, delay: launch + 400 });
    });
    var shake = document.querySelector('#app'); if (shake && !REDUCED) go(shake, [{ transform: 'translate(0,0)' }, { transform: 'translate(-5px,3px)' }, { transform: 'translate(5px,-3px)' }, { transform: 'translate(-3px,-2px)' }, { transform: 'translate(0,0)' }], { duration: 380, delay: launch + 420, easing: 'linear', fill: 'none' });
    setTimeout(function () { snd('hit'); }, launch + 400);
    var end = launch + 400 + 700;
    setTimeout(function () { anims.forEach(function (a) { try { a.cancel(); } catch (e) {} }); ov.remove(); ui.genfx = null; render(); }, end);
  }
  // Juega una acción propia; si es Genkidama/Kamehameha, anima antes de mostrar el resultado
  function playA(i, uid) {
    var s = ui.s, h = s.p[0].hand[i], c = h && CARD[h.id], fx = c && (c.id === 'genkidama' || c.id === 'kamehameha') && !REDUCED && !PV.on ? genCapture(c, uid) : null;
    var ok = E.playAction(s, 0, i, uid);
    if (ok && fx && fx.srcs.length) { ui.genfx = fx; genPlay(fx); }
    return ok;
  }
  // ---------- Partida ----------
  function inst(P, uid) { return P.mesa.filter(function (i) { return i && i.uid === uid; })[0]; }
  function startGame() {
    var seed = Math.floor(Math.random() * 1e9), r = E.mulberry32(seed + 7);
    var rr = ui.mode === 'rumble', ids = rr ? E.rumbleDeck() : ui.deck;
    var mylv = {}; if (!rr) ui.deck.forEach(function (id) { var l = lvOf(id); if (l > 1) mylv[id] = l; });
    var mysk = {}; ids.forEach(function (id) { var k = ui.acct && ui.acct.skinSel && ui.acct.skinSel[id]; if (k && ui.acct.skins.indexOf(k) >= 0) mysk[id] = k; });
    ui.s = E.newGame(ui.deck, E.aiDeck(r, null, curDiff()), seed, { lv: [mylv, {}], sk: [mysk, {}], mode: ui.mode, ai: curDiff() });
    ui.reward = null; api('gameStart', { diff: curDiff() });
    ui.screen = 'game'; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = ''; ui.landed = null; ui.busy = false; ui.seenKey = null;
    announce(); render();
  }
  function startTutorial() {
    var T = window.CARTAS_TUT;
    ui.s = E.newGame(T.deck, T.opp, T.seed, { lv: [{}, {}], sk: [{}, {}] });
    ui.s.p[1].life = 40; // el rival aguanta más para que la práctica llegue hasta la segunda tienda
    ui.s.rep = 1; ui.reward = null; ui.tut = { i: 0 }; ui.botGame = false;
    ui.screen = 'game'; ui.sel = null; ui.view = null; ui.playing = false; ui.hint = ''; ui.landed = null; ui.busy = false; ui.seenKey = null;
    window.scrollTo(0, 0); announce(); render();
  }
  function orb(kind, val, max, label, idx) {
    var p = max ? Math.max(0, Math.min(100, val / max * 100)) : 100;
    return '<div class="orb ' + kind + '" data-orb="' + (idx == null ? '' : idx) + '" style="--p:' + p + '%" title="' + label + '"><b>' + Math.max(0, val) + '</b><span>' + label + '</span></div>';
  }
  // Gambling: orbes acumuladas junto a la vida (la última que llega entra con un pequeño rebote)
  function gamOrbs(P, side) {
    var g = P.gmb || {}, n = g.orbs || 0, t = (E.tiers(P).Gambling || 0);
    if (!t && !n && !g.done) return '';
    ui.gprev = ui.gprev || [0, 0]; var fresh = n > ui.gprev[side]; ui.gprev[side] = n;
    var sp = '', k, show = Math.min(n, 8);
    for (k = 0; k < show; k++) sp += '<i class="gsp' + (fresh && k === show - 1 ? ' new' : '') + '" style="--k:' + (k % 3) + '"></i>';
    return '<div class="gorbbox' + (g.done ? ' done' : '') + (side ? ' foe' : '') + '" title="' + (g.done ? 'Orbes canjeadas: ya no se ganan más' : 'Una orbe por ronda sin daño directo; se abren al recibir el primer golpe') + '"><span class="gl">' + ic('dado') + ' Orbes Gambling</span><div class="gsph">' + (g.done ? '<em>canjeadas</em>' : n ? sp + (n > 8 ? '<b>+' + (n - 8) + '</b>' : '') : '<em>' + (t ? 'sin orbes aún' : '') + '</em>') + '</div>' + (!g.done && n ? '<span class="gn">×' + n + '</span>' : '') + '</div>';
  }
  function synergyHtml(P, foe) {
    var c = E.themeCounts(P), keys = Object.keys(c).filter(function (t) { return !foe || E.tierOf(t, c[t]) > 0; }).sort(function (a, b) { return E.tierOf(b, c[b]) - E.tierOf(a, c[a]) || c[b] - c[a]; });
    var h = '<div class="synside panel' + (foe ? ' foe' : '') + '"><h2>' + (foe ? '' + ic('aviso') + ' Sinergias del RIVAL' : 'Sinergias') + '</h2>';
    if (!keys.length) return h + '<p class="mut">' + (foe ? 'El rival no tiene sinergias activas.' : 'Coloca tropas en mesa o mano.') + '</p></div>';
    h += '<div class="synlist">' + keys.map(function (t) {
      var T = D.themes[t], tier = E.tierOf(t, c[t]), nxt = T.th[tier];
      var tip = '<div class="tip"><b>' + esc(t) + '</b>' + T.tx.map(function (x, k) { return '<p' + (k + 1 === tier ? ' class="cur"' : '') + '><b>' + T.th[k] + ' cartas:</b> ' + esc(x) + '</p>'; }).join('') + '</div>';
      return '<div class="syn-row t' + tier + '" style="--tc:' + T.color + '" tabindex="0"><div class="hexa"><b>' + c[t] + '</b></div><div class="si"><b>' + esc(t) + '</b><div class="th">' +
        T.th.map(function (n, k) { return '<i class="' + (k < tier ? 'on' : '') + '">' + n + '</i>'; }).join('') + '</div></div><span class="need">' + (nxt ? c[t] + '/' + nxt : ic('check') + ' máx') + '</span>' + '' + tip + '</div>';
    }).join('') + '</div></div>';
    return h;
  }
  // Sinergia Correa: las novias comparten la carta del hueco 5; un icono por novia para cambiar de una a otra
  function novSwitch(s) {
    var P = s.p[0];
    if (ui.playing || s.phase !== 'prep' || (E.tiers(P).Correa || 0) < 1) return '';
    var cur = P.mesa[4] && P.mesa[4].id, have = {};
    (P.nvs || []).forEach(function (n) { have[n.id] = 1; }); if (cur) have[cur] = 1;
    var all = (D.novias || []).filter(function (n) { return have[n.id]; });
    if (!all.length) return '';
    return '<div class="novsw" title="Elige qué novia ocupa el hueco 5">' + all.map(function (n) {
      return '<button class="nsw' + (n.id === cur ? ' on' : '') + '" data-act="novia" data-id="' + n.id + '" title="' + (n.id === cur ? esc(n.name) + ' está en el hueco 5' : 'Poner a ' + esc(n.name) + ' en el hueco 5') + '" style="background-image:url(/cartas/art/' + n.id + '.webp)"><i>' + esc(n.name.charAt(0)) + '</i></button>';
    }).join('') + '</div>';
  }
  function mesaRow(side, view, s, mine) {
    var P = s.p[side], prep = s.phase === 'prep' && !ui.playing && !s.shopOpen, shop = s.shopOpen && !ui.playing, sel = ui.sel;
    var aim = {}; Object.keys(s.p[0].target).forEach(function (k) { var t = s.p[0].target[k]; aim[t] = (aim[t] || 0) + 1; });
    var jin = P.mesa.some(function (x) { return x && !x.dead && x.id === 'dashlight-sun-jin-woo'; }), has5 = (E.tiers(P).Correa || 0) >= 1 || !!view.mesa[side][4] || jin;
    var h = '<div class="row4 side' + side + (has5 ? ' has5' : '') + '">';
    view.mesa[side].forEach(function (v, k) {
      if (k === 4 && !has5) return;
      if (!v) {
        if (k === 4 && jin && (E.tiers(P).Correa || 0) < 1) { h += '<div class="cw"><div class="slot nov">' + ic('humo') + ' Hueco 5<br><small>Soldado de Sombra</small></div></div>'; return; }
        if (k === 4) { h += '<div class="cw"><div class="slot nov">' + ic('corazon') + ' Hueco 5<br><small>' + (mine ? ((P.nvs || []).length ? 'Elige una novia' : 'Sin novias') : 'Novia') + '</small></div>' + (mine ? novSwitch(s) : '') + '</div>'; return; }
        var free = mine && s.phase === 'prep' && !ui.playing && sel && sel.k === 'hand' && E.isTroop(P.hand[sel.i]);
        h += '<div class="cw"><div class="slot' + (free ? ' free' : '') + '"' + (free ? ' data-act="slot" data-i="' + k + '"' : '') + '>' + (free ? 'Colocar aquí' : 'Hueco') + '</div></div>';
        return;
      }
      var c = CARD[v.id], o = { atk: v.atk, hp: v.hp, max: v.max, cls: '' }, I = inst(P, v.uid), under = '';
      if (v.dead) o.cls += ' dead';
      if (I && I.shadow) o.cls += ' shadowc';
      if (ui.hl && ui.hl.att === v.uid) o.cls += ' atk';
      if (ui.hl && ui.hl.tgt === v.uid) o.cls += ' hit';
      var skey = side + ':' + v.uid;
      if (!ui.seen[skey]) { ui.seen[skey] = 1; if (!ui.seedSeen && !REDUCED) { var dl = ui.fl.length * deployMeta().gap; ui.fl.push({ side: side, uid: v.uid, delay: dl }); ui.hideUntil[skey] = Date.now() + dl + deployMeta().ms; } }
      var dealing = (ui.hideUntil[skey] || 0) > Date.now();
      if (dealing) o.cls += ' dealwait'; else if (ui.landed === v.uid) o.cls += ' landed';
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
      var wl = k > 0 ? P.mesa[k - 1] : null; // Prórroga (AitoRLG Renata): marca la casilla que protege
      if (wl && !wl.dead && wl.id === 'aitorlg-renata' && !v.dead && !(I && I.shadow)) { o.cls += ' warded' + (I && I.tmp && I.tmp.ward ? ' wardhold' : ''); o.extra = (o.extra || '') + '<span class="wardfx" title="Prórroga: no cae a 0 de vida hasta que ataque">' + ic('escudo') + '</span>'; }
      o.gl = I ? I.gl : 1; o.lv = lvG(side, v.id); o.skin = skG(side, v.id); if (mine) o.slv = sleeveId(); if (mine && k === 4 && !(I && I.shadow)) under += novSwitch(s); h += '<div class="cw">' + cardHtml(c, o) + under + '</div>';
    });
    return h + '</div>';
  }
  var REFRESH_SVG = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  function renderGame() {
    var gk0 = (PV.on ? PV.id : '') + ':' + ui.s.rs; ui.seedSeen = ui.seenKey !== gk0; if (ui.seedSeen) { ui.seenKey = gk0; ui.seen = {}; ui.hideUntil = {}; }
    ui.fl = [];
    var s = ui.s, view = ui.view || E.viewOf(s), P = s.p[0], R = s.p[1];
    var shopMode = s.shopOpen && !ui.playing, shop = shopMode && s.phase === 'prep', prep = s.phase === 'prep' && !ui.playing && !s.shopOpen;
    var pend = prep ? E.pendingTargets(s).length : 0, hasT = Object.keys(P.target).length > 0;
    var h = '<div class="gwrap' + (shopMode ? ' shopmode' : '') + '"><div class="top"><div><h1>Ronda ' + s.round + ' · ' + (s.shopOpen ? '' + ic('carrito') + ' Tienda' + (s.round === 1 ? ' inicial' : '') : '' + ic('espadas') + ' Combate') + (!s.shopOpen ? ' <span class="mut">· ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') + '</span>' : '') + '</h1></div><div class="tright"><span class="tlinks"><button class="lnk" data-act="menu" data-to="deck">' + ic('cartas') + ' Colección</button> · <button class="lnk" data-act="menu" data-to="home">' + ic('casa') + ' Menú</button></span>' + (s.over ? '' : ui.tut ? '<button class="surrbtn" data-act="tutexit">' + ic('puerta') + ' Salir del tutorial</button>' : '<button class="surrbtn" data-act="surrender" title="Abandonar la partida y darla por perdida">' + ic('bandera') + ' Rendirse</button>') + '</div></div>' + timerHtml(prep || shop) + '';
    h += '<div class="gmain"><aside class="gl">' + boardHtml(s) + synergyHtml(P) + '</aside><section class="gc"><div class="board" id="board">';
    var ML = s.maxLife || CFG.life;
    if (s.vs4 && s.spec && ui.playing) h += '<div class="v4spec">' + ic('ojo') + ' Descansas: estás viendo el duelo <b>' + esc(s.spec[0]) + '</b> contra <b>' + esc(s.spec[1]) + '</b></div>';
    else if (s.vs4 && !shopMode && !s.rest) h += '<div class="v4vs"><span>Duelo contra</span><b>' + esc(PV.names[1]) + '</b></div>';
    if (!shopMode && (!s.rest || (s.spec && ui.playing))) h += '<div class="hud top">' + orb('life', view.life[1], ui.tut ? 40 : ML, s.spec && ui.playing ? esc(s.spec[1]) : PV.on ? esc(PV.names[1]) : 'Rival', 1) + gamOrbs(s.p[1], 1) + '</div>' + mesaRow(1, view, s, false) + '<div class="gap"></div>';
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
    } else if (s.phase === 'post') acts = ui.busy ? '' : '<button class="btn big" data-act="next">Continuar ▶</button>';
    if (PV.on && PV.rdy[1] && !PV.rdy[0] && (shop || prep || s.phase === 'post')) acts = '<div class="hint rivrdy">' + ic('aviso') + ' El rival ya está listo.</div>' + acts;
    h += '<div class="hud bottom">' + orb('life', view.life[0], ML, s.spec && ui.playing ? esc(s.spec[0]) : 'Tu vida', 0) + (E.genStored(P) > 0 ? '<div class="genw" data-tip="Daño Acumulado"><i class="gk-aura"></i><i class="gk-orb"></i><b>' + E.genStored(P) + '</b></div>' : '') + '<div class="goldw">' + orb('gold', P.gold, 0, 'Tu oro') + (E.interest(P) ? '<i class="gint" title="Interés: ganas +' + E.interest(P) + ' de oro extra al empezar la próxima ronda si conservas este oro">+' + E.interest(P) + ' interés</i>' : '') + '</div>' + gamOrbs(P, 0) + '<div class="acts">' + acts + '</div></div></div>';

    // Mano
    h += '<div class="handwrap' + (ui.dragMesa ? ' dropzone' : '') + '"><div class="hl">Tu mano ' + P.hand.length + (s.mode === 'revive' ? '' : '/' + CFG.handMax) + '</div><div class="hand">';
    P.hand.forEach(function (i, k) {
      var c = CARD[i.id], sel = ui.sel && (ui.sel.k === 'hand' || ui.sel.k === 'act') && ui.sel.i === k;
      h += '<div class="cw">' + cardHtml(c, { slv: sleeveId(), gl: i.gl, lv: lvG(0, i.id), skin: skG(0, i.id), atk: E.atk(i), hp: i.hp, max: E.maxHp(i), cls: 'hcard' + (sel ? ' sel' : ''), attrs: 'data-act="hand" data-i="' + k + '" title="Pulsa o arrastra a la mesa"', tag: 'button' }) + (shop ? '<div class="mini"><button data-act="sell" data-from="hand" data-i="' + k + '" title="Vender y recuperar su valor">' + ic('moneda') + ' Vender ' + E.sellValue(i) + '</button></div>' : '') + '</div>';
    });
    for (var f = P.hand.length; f < CFG.handMax; f++) h += '<div class="cw"><div class="slot">—</div></div>';
    h += '</div></div>';

    // Tienda (bajo la mano): pulsar una carta para comprarla
    if (shop) {
      var t = E.tiers(P), rc = E.refreshCost(s, 0);
      h += '<div class="shopwrap' + (P.frozen ? ' frozen' : '') + '"><div class="hl">' + ic('carrito') + ' Tienda' + (s.round === 1 ? ' (solo Comunes)' : '') + ' · pulsa una carta para comprarla' + (s.round === 1 && !s.vs4 ? ' · primer combate: ' + (s.first === 0 ? 'atacas primero' : 'ataca primero el rival') : '') + '</div>' + oddsHtml(s) + '<div class="shoprow">';
      for (var k = 0; k < CFG.shopOffers; k++) {
        var id = P.offers[k];
        if (!id) { h += '<div class="cw"><div class="slot">Vendida</div></div>'; continue; }
        var c2 = CARD[id], mg = c2.type === 'tropa' && E.willMerge(P, c2.id), cant = P.gold < c2.cost || (P.hand.length >= E.handCap(s) && !mg);
        h += '<div class="cw">' + cardHtml(c2, { lv: lvG(0, c2.id), skin: skG(0, c2.id), tag: 'button', cls: 'offer' + (cant ? ' cant' : '') + (mg ? ' mergeable' : ''), attrs: 'data-act="buy" data-i="' + k + '" title="Comprar por ' + c2.cost + ' de oro"' }) + '</div>';
      }
      h += '<div class="refwrap"><button class="refresh" data-act="refresh" title="Actualizar tienda (' + rc + ' oro)"' + (P.gold < rc ? ' disabled' : '') + '>' + REFRESH_SVG + '</button><span class="rlabel">Actualizar · ' + rc + ' oro</span><button class="freezebtn' + (P.frozen ? ' on' : '') + '" data-act="freeze" title="' + (P.frozen ? 'Ofertas fijadas: en la próxima tienda saldrán las que no compres. Pulsa para soltarlas' : 'Fijar las ofertas: en la próxima tienda saldrán las que dejes sin comprar') + '">' + ic('candado') + ' ' + (P.frozen ? 'Fijadas' : 'Fijar') + '</button></div></div>';
      h += '</div>';
    }
    h += '</section><aside class="gr">';
    h += '<div></div>';
    h += '<div class="foesyn">' + (s.shopOpen ? '<div class="synside panel foe locked"><h2>' + ic('aviso') + ' Sinergias del RIVAL</h2><p class="mut">' + ic('candado') + ' Ocultas durante la tienda. Se revelan cuando empieza el combate.</p></div>' : synergyHtml(R, true)) + '</div>';
    var shown = s.log.slice(-14);
    h += '<div class="panel logp"><h2>Registro</h2><div class="log" id="log">' + shown.map(function (l, n) { return '<div' + (n === shown.length - 1 ? ' class="cur"' : '') + '>' + esc(l.text) + '</div>'; }).join('') + '</div></div></aside></div>';
    if (s.phase !== 'over') ui.endSnd = 0;
    if (s.phase === 'over' && !ui.playing) {
      var win = s.winner === 0;
      if (!ui.endSnd) { ui.endSnd = 1; snd(win ? 'win' : 'lose', 350); }
      if (!s.rep && PV.on) s.rep = 1;
      if (!s.rep) {
        s.rep = 1; ui.reward = null;
        api('gameFinish', { won: win, rounds: s.round, cards: s.p[0].used || 0, mode: s.rumble ? 'rumble' : s.mode || '' }).then(function (r) {
          ui.reward = r.ok ? r.data : { gained: 0, err: 1 };
          if (r.ok) setAcct(r.data.user);
          if (ui.s === s && ui.screen === 'game' && s.phase === 'over' && !ui.playing) render();
        });
      }
      var pt = ui.reward && ui.reward.pts ? '<p class="' + (ui.reward.pts > 0 ? 'reward' : 'mut') + '">' + (ui.reward.pts > 0 ? '+' : '') + ui.reward.pts + ' puntos de clasificación</p>' : '';
      var rw = pt + (ui.reward ? (ui.reward.gained > 0 ? '<p class="reward">+' + ui.reward.gained + ' ' + ic('moneda') + ' monedas</p>' : '<p class="mut">Sin monedas esta vez (partida muy corta o límite diario alcanzado).</p>') : '<p class="mut">Calculando recompensa…</p>');
      var btns = '<button class="btn big" data-act="' + (PV.on ? (PV.px === 'vs4' ? (ui.botGame ? (PV.mode === 'rumble' ? 'startrrvs4b' : PV.mode === 'revive' ? 'startrevvs4b' : 'startvs4b') : 'openvs4') : 'openpvp') : 'play') + '">' + (PV.on ? 'Otra partida' : 'Jugar otra vez') + '</button> <button class="btn sec" data-act="menu" data-to="deck">Cambiar mazo</button> <button class="btn sec" data-act="menu" data-to="home">Menú</button>';
      h += finOverlay(finId(), win, win ? '¡Victoria!' : (s.vs4 ? 'Eliminado · puesto ' + s.place + 'º de 4' : 'Derrota'), esc(s.reason) + ' · ronda ' + s.round, rw, btns, '');
    }
    if (ui.confirmSurr && !s.over) h += '<div class="overlay surro"><div class="panel surrp"><h2>' + ic('aviso') + ' ¿Seguro que quieres rendirte?</h2><p class="mut">Darás la partida por perdida' + (s.vs4 ? ' y quedarás eliminado.' : '.') + ' Esta acción no se puede deshacer.</p><div class="btnrow"><button class="btn" data-act="surrender-yes">Sí, rendirme</button><button class="btn sec" data-act="surrender-no">Cancelar</button></div></div></div>';
    h += '</div>';
    app.innerHTML = h;
    document.body.classList.toggle('shopbg', !!shopMode);
    ui.landed = null;
    var lg = document.getElementById('log'); if (lg) lg.scrollTop = lg.scrollHeight;
    strikeVars(); drawArrows(); fxBanner(); applyFloats(); flushActs(); runFlights();
  }

  // ---------- Despliegue: la carta aparece grande en mitad de la pantalla, da vueltas y aterriza en su hueco ----------
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Efectos de despliegue (cada uno devuelve la animación del contenedor .flyc). Se equipan en Colección → Efectos.
  var DEPLOY_LIST = [
    { id: 'default', name: 'Por defecto', desc: 'La carta aparece grande en mitad de la pantalla, da un par de vueltas y vuela hasta su hueco.', price: 0, ms: 2000, gap: 450 },
    { id: 'meteoro', name: 'Meteoro dorado', desc: 'La carta cae como un meteoro envuelta en luz dorada, gira en el aire y se estrella en su hueco con una onda de choque y chispas.', price: 30, ms: 2900, gap: 600 },
    { id: 'arcano', name: 'Aparición arcana', desc: 'Un círculo mágico se enciende en el aire y la carta se materializa entre destellos violetas antes de posarse en su hueco.', price: 30, ms: 2800, gap: 550 },
    { id: 'perro', name: 'Perro mensajero', desc: 'Un perro cruza la pantalla corriendo y arrastra la carta con una cuerda hasta su hueco; ahí la suelta y la carta se levanta de un salto.', price: 30, ms: 3300, gap: 700 },
    { id: 'fichas', name: 'Reparto de casino', desc: 'Una carta sale lanzada girando como en un reparto de póker, cae sobre una lluvia de fichas, se da la vuelta y vuela a su hueco levantando fichas al aterrizar.', price: 30, ms: 3000, gap: 600 },
    { id: 'sombras', name: 'Soldados de sombra', desc: 'Un charco de sombras moradas se abre en el suelo, la carta se va formando como una silueta de humo con ojos brillantes y, al completarse, vuela a su hueco.', price: 30, ms: 3200, gap: 650 },
    { id: 'kame', name: 'Kamehameha', desc: 'Un guerrero carga su energía, dispara un Kamehameha que cruza la pantalla y el rayo deja la carta en su hueco.', price: 30, ms: 3300, gap: 700 },
    { id: 'grimorio', name: 'Grimorio de cinco hojas', desc: 'Un grimorio negro con un trébol de cinco hojas flota entre humo, se abre con un destello y de sus páginas sale la carta, que vuela a su hueco.', price: 30, ms: 3400, gap: 700 },
    { pass: true, id: 'grieta', name: 'Grieta dimensional', desc: 'La pantalla se resquebraja desde el centro, la grieta se abre en un resplandor y la carta surge de ella antes de volar a su hueco.', price: 30, ms: 3300, gap: 700 }
  ];
  try { new Image().src = 'img/dog.webp'; } catch (e) {}
  var SLEEVE_LIST = [
    { id: 'sin', name: 'Sin funda', desc: 'Tus cartas se ven tal cual, con el borde de su rareza y el reverso de cristal.', price: 0 },
    { id: 'oro', name: 'Oro real', desc: 'Borde de pan de oro bruñido y reverso azul noche con celosía dorada. Elegante y sobrio.', price: 40 },
    { id: 'neon', name: 'Neón', desc: 'Borde de luz degradado de cian a magenta y reverso oscuro con rejilla luminosa.', price: 30 },
    { id: 'casino', name: 'Casino', desc: 'Borde de ficha de póker a rayas rojas, blancas y negras, y reverso de fieltro verde con palos de la baraja y una ficha en el centro.', price: 40 },
    { id: 'dragonball', name: 'Dragon Ball', desc: 'Borde naranja y azul de kimono de combate y reverso naranja con el emblema de la escuela de la Tortuga en el centro.', price: 40 },
    { id: 'trebol', name: 'Trébol de cinco hojas', desc: 'Borde de cobre oscuro y reverso de grimorio gastado con un trébol negro de cinco hojas en el centro.', price: 40 },
    { id: 'petalos', name: 'Pétalos de la boticaria', desc: 'Borde que va del rosa al verde y reverso de jardín de hierbas con pétalos rosas y hojas verdes cayendo alrededor de una flor.', price: 40 },
    { pass: true, id: 'pokeball', name: 'Pokéball', desc: 'Borde negro y blanco de Pokéball y reverso rojo con una Pokéball en el centro.', price: 40 }
  ];
  // ---------- Efectos de victoria y derrota (cada pack trae los dos) ----------
  var FIN_LIST = [
    { id: 'default', name: 'Por defecto', desc: 'Victoria: trofeo y lluvia de confeti. Derrota: corazón roto y aviso sobrio.', price: 0 },
    { id: 'eclipse', name: 'Eclipse', desc: 'Victoria: banner de oro con rayos de sol, ondas de luz y lluvia dorada. Derrota: banner carmesí que se agrieta, con ceniza y brasas flotando.', price: 50 },
    { id: 'hechizo', name: 'Hechizo arcano', desc: 'Victoria: un círculo mágico se enciende tras un banner violeta y las letras se materializan entre destellos que suben. Derrota: el círculo se apaga entre parpadeos y el banner se agrieta mientras caen motas de energía.', price: 50 },
    { id: 'poker', name: 'Mano ganadora', desc: 'Victoria: lluvia de fichas de casino sobre un banner de fieltro verde y oro. Derrota: las fichas se deslizan apagadas y el banner se agrieta: la banca gana.', price: 50 },
    { id: 'dball', name: 'Kamehameha final', desc: 'Victoria: banner naranja y azul con rayos de energía, chispas de ki que suben y el emblema de la Tortuga. Derrota: el banner se agrieta en gris azulado y cae ceniza de combate.', price: 50 },
    { id: 'trebol', name: 'Grimorio del trébol', desc: 'Victoria: banner de cuero y cobre con tréboles de cinco hojas dorados que caen como polvo de magia. Derrota: el grimorio se oscurece y tréboles negros se desmoronan en ceniza.', price: 50 },
    { id: 'petalos', name: 'Jardín de la boticaria', desc: 'Victoria: banner rosa y verde bajo una lluvia de pétalos y hojas. Derrota: los pétalos se marchitan y el banner se agrieta entre hojas secas.', price: 50 },
    { pass: true, id: 'mascara', name: 'Máscara de neón', desc: 'Sin banner: una explosión de neón da paso a una máscara de tubos luminosos. Victoria: sonrisa cosida en azul eléctrico. Derrota: ceño y lágrimas en rojo parpadeante.', price: 50 }
  ];
  var FIN_THEME = { eclipse: 'eclipse', hechizo: 'arcano', poker: 'poker', dball: 'dball', trebol: 'trebol', petalos: 'petalos' };
  var FIN_ICO = { dball: '<img class="finimg" src="img/sleeve-goku.webp" alt="">', trebol: '<svg class="finsvg" viewBox="-50 -50 100 100">' + [0, 72, 144, 216, 288].map(function (a) { return '<path transform="rotate(' + a + ')" d="M0 -3 C-19 -10 -24 -34 -10 -39 C-4 -41 0 -35 0 -31 C0 -35 4 -41 10 -39 C24 -34 19 -10 0 -3Z" fill="currentColor"/>'; }).join('') + '</svg>', petalos: '<svg class="finsvg" viewBox="-50 -50 100 100">' + [0, 72, 144, 216, 288].map(function (a, k) { return '<ellipse cx="0" cy="-24" rx="13" ry="22" transform="rotate(' + a + ')" fill="' + (k % 2 ? '#f472b6' : '#f9a8d4') + '"/>'; }).join('') + '<circle r="9" fill="#fde68a"/></svg>' };
  function finId() { var id = ui.acct && ui.acct.fx && ui.acct.fx.finish; return id && FIN_LIST.some(function (e) { return e.id === id; }) && fxHas(id) ? id : 'default'; }
  // Máscara de neón: sin banner; explosión de neón y una cara de tubos luminosos que cambia de expresión
  function neonFin(win, title, sub, rw, btns, extra) {
    var bz = function (a, c, b, t) { var u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; };
    var P = [], add = function (d) { P.push(d); };
    add('M66 112 Q54 190 68 268'); add('M334 112 Q346 190 332 268');
    add('M82 62 Q200 46 318 62');
    [128, 272].forEach(function (x) { add('M' + (x - 30) + ' 172 L' + (x + 30) + ' 238'); add('M' + (x + 30) + ' 172 L' + (x - 30) + ' 238'); add('M' + (x - 22) + ' 168 L' + (x + 38) + ' 234'); add('M' + (x + 22) + ' 168 L' + (x - 38) + ' 234'); });
    add('M180 298 Q200 314 220 298');
    var U0, UC, U1, L0, LC, L1;
    if (win) { U0 = [76, 338]; UC = [200, 408]; U1 = [324, 338]; L0 = [96, 366]; LC = [200, 450]; L1 = [304, 366]; }
    else { U0 = [118, 408]; UC = [200, 352]; U1 = [282, 408]; L0 = [134, 428]; LC = [200, 388]; L1 = [266, 428]; add('M90 148 L166 180'); add('M310 148 L234 180'); add('M122 252 Q116 276 122 296'); add('M278 252 Q284 276 278 296'); }
    add('M' + U0 + ' Q' + UC + ' ' + U1); add('M' + L0 + ' Q' + LC + ' ' + L1);
    for (var s = 1; s <= 7; s++) { var t = s / 8, a = bz(U0, UC, U1, t), b = bz(L0, LC, L1, t), sl = (s % 2 ? 1 : -1) * 3; add('M' + (a[0] + sl).toFixed(1) + ' ' + (a[1] + (win ? -12 : 12)).toFixed(1) + ' L' + (b[0] - sl).toFixed(1) + ' ' + (b[1] + (win ? 12 : -12)).toFixed(1)); }
    var gl = '', co = '';
    var CA = win ? '--c:#28e8ff;--g:#1d6bff' : '--c:#ff4a68;--g:#ff0a3c', CB = win ? '--c:#ff5ad8;--g:#ff1fa5' : '--c:#ffffff;--g:#dfe6ff';
    P.forEach(function (d, i) { var st = '--i:' + i + ';' + (i % 2 ? CB : CA); gl += '<path class="nxs" style="' + st + '" pathLength="1" d="' + d + '"/>'; co += '<path class="nxc" style="--i:' + i + '" pathLength="1" d="' + d + '"/>'; });
    var fx = '<div class="nxburst"><i class="nxflash"></i><i class="nxring"></i><i class="nxring r2"></i><i class="nxring r3"></i>', q;
    for (q = 0; q < 16; q++) fx += '<i class="nxray" style="--a:' + (q * 22.5 + (q % 3) * 4) + 'deg;--l:' + (40 + (q * 37) % 50) + 'vmin"></i>';
    for (q = 0; q < 26; q++) fx += '<i class="nxsp" style="--a:' + (q * 13.8 + (q % 4) * 5) + 'deg;--d:' + (22 + (q * 29) % 46) + 'vmin;--w:' + (14 + (q % 4) * 8) + 'px;--t:' + (.04 + (q % 5) * .02).toFixed(2) + 's"></i>';
    fx += '</div>';
    var face = '<svg class="nxface" viewBox="0 0 400 480">' + gl + co + '</svg>';
    return '<div class="overlay fin fin-neon ' + (win ? 'owin' : 'olose') + (extra ? ' finprev' : '') + '">' + fx + face + '<div class="nxtitle">' + esc(title.replace(/[¡!]/g, '').toUpperCase()) + '</div><p class="finsub">' + sub + '</p><div class="finpanel">' + rw + '<div class="finbtns">' + btns + '</div></div></div>';
  }
  function finOverlay(id, win, title, sub, rw, btns, extra) {
    if (id === 'mascara') return neonFin(win, title, sub, rw, btns, extra);
    if (FIN_THEME[id]) {
      var arc = id === 'hechizo', pok = id === 'poker', nw = id === 'dball' || id === 'trebol' || id === 'petalos', fx = '<div class="finfx">' + (nw && id === 'dball' ? '<div class="finrays"></div><i class="ring"></i><i class="ring r2"></i>' : nw ? '<i class="ring"></i><i class="ring r2"></i>' : pok ? '<i class="ring"></i><i class="ring r2"></i>' : arc ? '<div class="arcw"><i class="arc a"></i><i class="arc b"></i></div><i class="ring"></i><i class="ring r2"></i>' : '<div class="finrays"></div><i class="ring"></i><i class="ring r2"></i>'), n = win ? 34 : 30;
      for (var q = 0; q < n; q++) fx += '<i class="fp" style="--x:' + ((q * 29 + (q % 4) * 7) % 100) + '%;--d:' + (((q * 37) % 100) / 100 * 3).toFixed(2) + 's;--t:' + (3.6 + ((q * 13) % 10) / 4).toFixed(2) + 's;--s:' + (5 + (q % 5) * 2) + 'px;--w:' + ((q % 2 ? 1 : -1) * (14 + (q % 4) * 9)) + 'px"></i>';
      fx += '</div>';
      var letters = title.replace(/[¡!]/g, '').toUpperCase().split('').map(function (ch, k) { return '<span style="--i:' + k + '">' + (ch === ' ' ? '&nbsp;' : esc(ch)) + '</span>'; }).join('');
      var crack = win ? '' : '<svg class="fincrack" viewBox="0 0 1000 120" preserveAspectRatio="none"><path d="M0 60 L120 40 L210 78 L330 30 L430 70 L520 22 L610 80 L720 36 L820 74 L920 44 L1000 62" /><path d="M520 22 L540 -10 M430 70 L410 130 M720 36 L750 -10"/></svg>';
      return '<div class="overlay fin fin-' + FIN_THEME[id] + ' ' + (win ? 'owin' : 'olose') + (extra ? ' finprev' : '') + '">' + fx + '<div class="finband"><div class="finbandin"><span class="finico">' + (win && FIN_ICO[id] ? FIN_ICO[id] : ic(win ? (pok ? 'dado' : 'trofeo') : 'corazonroto')) + '</span><div class="fintxt">' + letters + '</div><span class="finico">' + (win && FIN_ICO[id] ? FIN_ICO[id] : ic(win ? (pok ? 'dado' : 'trofeo') : 'corazonroto')) + '</span></div>' + crack + '</div><p class="finsub">' + sub + '</p><div class="finpanel">' + rw + '<div class="finbtns">' + btns + '</div></div></div>';
    }
    var conf = ''; if (win) for (var q2 = 0; q2 < 36; q2++) conf += '<i style="left:' + (q2 * 2.8 + (q2 % 3)) + '%;--d:' + ((q2 * 37) % 100) / 100 * 1.2 + 's;--c:' + ['#ffc533', '#ff6b8b', '#4f9dff', '#38d39f', '#a78bfa'][q2 % 5] + '"></i>';
    return '<div class="overlay ' + (win ? 'owin' : 'olose') + (extra ? ' finprev' : '') + '">' + (win ? '<div class="confetti">' + conf + '</div>' : '') + '<div class="panel over"><div class="obig">' + ic(win ? 'trofeo' : 'corazonroto') + '</div><h2>' + title + '</h2><p class="mut">' + sub + '</p>' + rw + btns + '</div></div>';
  }
  // Vista previa desde Colección y Tienda: alterna victoria y derrota
  function finPrevHtml() {
    var fp = ui.finPrev; if (!fp) return '';
    return finOverlay(fp.id, fp.win, fp.win ? '¡Victoria!' : 'Derrota', fp.win ? 'Has derrotado al rival · ronda 7' : 'Tu rival te ha vencido · ronda 7', '<p class="reward">+30 ' + ic('moneda') + ' monedas</p>',
      '<button class="btn big" data-act="finclose">Cerrar</button> <button class="btn sec" data-act="finflip">Ver ' + (fp.win ? 'derrota' : 'victoria') + '</button>', 'prev');
  }
  function sleeveId() { var id = ui.acct && ui.acct.fx && ui.acct.fx.sleeve; return id && id !== 'sin' && fxHas(id) && SLEEVE_LIST.some(function (e) { return e.id === id; }) ? id : 'sin'; }
  function fxHas(id) { return !!(ui.acct && ((ui.acct.fxOwned || ['default']).indexOf(id) >= 0 || ui.acct.admin)); }
  // destello al aterrizar: onda de choque y chispas
  function impact(x, y, at) {
    snd('land', at);
    var ring = document.createElement('div'); ring.className = 'fxring'; ring.style.cssText = 'left:' + x + 'px;top:' + y + 'px'; document.body.appendChild(ring);
    ring.animate([{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(.4)', opacity: .95, offset: .12 }, { transform: 'translate(-50%,-50%) scale(3.4)', opacity: 0, offset: 1 }], { duration: 850, delay: at, fill: 'both', easing: 'ease-out' }).onfinish = function () { ring.remove(); };
    for (var i = 0; i < 16; i++) {
      var d = document.createElement('i'), a = (i / 16) * Math.PI * 2 + Math.random() * .3, dist = 70 + Math.random() * 90;
      d.className = 'fxspark'; d.style.cssText = 'left:' + x + 'px;top:' + y + 'px'; document.body.appendChild(d);
      d.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .08 }, { transform: 'translate(' + (Math.cos(a) * dist - 3) + 'px,' + (Math.sin(a) * dist - 3) + 'px) scale(.1)', opacity: 0, offset: 1 }], { duration: 650 + Math.random() * 300, delay: at, fill: 'both', easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = (function (n) { return function () { n.remove(); }; })(d);
    }
  }
  function deployMeta(id) { id = id || deployId(); return DEPLOY_LIST.filter(function (e) { return e.id === id; })[0] || DEPLOY_LIST[0]; }
  var DEPLOY_FX = {
    'meteoro': function (wrap, r, delay, dur) {
      var W = window.innerWidth, H = window.innerHeight, cx = W / 2 - (r.left + r.width / 2), cy = H / 2 - (r.top + r.height / 2) - 10;
      var sc = Math.max(1.4, Math.min(3, Math.min(300, W * .62, H * .5 * 5 / 7) / r.width)) * 1.08;
      var T = function (x, y, z, ry, rz) { return 'perspective(1100px) translate(' + x + 'px,' + y + 'px) scale(' + z + ') rotateY(' + ry + 'deg) rotateZ(' + (rz || 0) + 'deg)'; };
      var G = function (a) { return 'drop-shadow(0 0 ' + Math.round(8 + a * 34) + 'px rgba(255,200,80,' + (.25 + a * .75).toFixed(2) + ')) drop-shadow(0 20px 26px rgba(0,0,0,.55))'; };
      var halo = document.createElement('div'); halo.className = 'fxhalo'; halo.style.cssText = 'left:' + (r.left + r.width / 2 + cx) + 'px;top:' + (r.top + r.height / 2 + cy) + 'px'; document.body.appendChild(halo);
      halo.animate([{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: .9, offset: .32 }, { transform: 'translate(-50%,-50%) scale(1.25)', opacity: .8, offset: .72 }, { transform: 'translate(-50%,-50%) scale(.4)', opacity: 0, offset: 1 }], { duration: dur, delay: delay, fill: 'both' }).onfinish = function () { halo.remove(); };
      impact(r.left + r.width / 2, r.top + r.height / 2, delay + dur * .9);
      return wrap.animate([
        { transform: T(cx - W * .75, cy - H * .95, 3, 0, -40), filter: G(1), opacity: 0, offset: 0 },
        { transform: T(cx - W * .38, cy - H * .45, 2.5, 360, -22), filter: G(1), opacity: 1, offset: .08, easing: 'cubic-bezier(.15,.8,.25,1)' },
        { transform: T(cx, cy, sc, 720, 0), filter: G(1), opacity: 1, offset: .30, easing: 'cubic-bezier(.4,0,.6,1)' },
        { transform: T(cx, cy - 12, sc * 1.03, 1440, 0), filter: G(.55), opacity: 1, offset: .66 },
        { transform: T(cx, cy - 34, sc * 1.14, 1500, 0), filter: G(1), opacity: 1, offset: .78, easing: 'cubic-bezier(.6,0,.9,.4)' },
        { transform: T(0, 6, .9, 1800, 0), filter: G(.9), opacity: 1, offset: .9, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: T(0, 0, 1, 1800, 0), filter: G(0), opacity: 1, offset: 1 }
      ], { duration: dur, delay: delay, fill: 'both' });
    },
    'arcano': function (wrap, r, delay, dur) {
      var W = window.innerWidth, H = window.innerHeight, cx = W / 2 - (r.left + r.width / 2), cy = H / 2 - (r.top + r.height / 2) - 10;
      var sc = Math.max(1.4, Math.min(3, Math.min(300, W * .62, H * .5 * 5 / 7) / r.width)) * 1.05, mx = r.left + r.width / 2 + cx, my = r.top + r.height / 2 + cy;
      var T = function (x, y, z, ry) { return 'perspective(1100px) translate(' + x + 'px,' + y + 'px) scale(' + z + ') rotateY(' + (ry || 0) + 'deg)'; };
      var G = function (a) { return 'drop-shadow(0 0 ' + Math.round(6 + a * 30) + 'px rgba(170,110,255,' + (.2 + a * .8).toFixed(2) + ')) drop-shadow(0 18px 24px rgba(0,0,0,.5))'; };
      var mk = function (cls, size, kf, o) { var e = document.createElement('div'); e.className = cls; e.style.cssText = 'left:' + mx + 'px;top:' + (my + (o || 0)) + 'px;width:' + size + 'px;height:' + size + 'px'; document.body.appendChild(e); var a = e.animate(kf, { duration: dur * .86, delay: delay, fill: 'both' }); a.onfinish = function () { e.remove(); }; return e; };
      var R = Math.round(sc * r.width * 1.5);
      // círculo mágico: dos anillos que giran en sentidos opuestos, aplastados en perspectiva
      mk('fxarc a', R, [{ transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(0) scale(.2)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(120deg) scale(1)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(320deg) scale(1.05)', opacity: 1, offset: .7 }, { transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(420deg) scale(.5)', opacity: 0, offset: 1 }], R * .42);
      mk('fxarc b', Math.round(R * .68), [{ transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(0) scale(.2)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(-140deg) scale(1)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(-340deg) scale(1.05)', opacity: 1, offset: .7 }, { transform: 'translate(-50%,-50%) rotateX(68deg) rotateZ(-440deg) scale(.5)', opacity: 0, offset: 1 }], R * .42);
      // pilar de luz y destellos que suben
      mk('fxpillar', Math.round(sc * r.width * .9), [{ transform: 'translate(-50%,-50%) scaleY(.1)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scaleY(1)', opacity: .85, offset: .3 }, { transform: 'translate(-50%,-50%) scaleY(1.1)', opacity: .5, offset: .6 }, { transform: 'translate(-50%,-50%) scaleY(1.2)', opacity: 0, offset: 1 }]);
      for (var i = 0; i < 14; i++) {
        var sp = document.createElement('i'), x = (Math.random() - .5) * sc * r.width * 1.1, y0 = sc * r.height * (.3 + Math.random() * .2), rise = sc * r.height * (.7 + Math.random() * .6), d0 = delay + dur * (.1 + Math.random() * .4);
        sp.className = 'fxspark vio'; sp.style.cssText = 'left:' + (mx + x) + 'px;top:' + (my + y0) + 'px'; document.body.appendChild(sp);
        sp.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .25 }, { transform: 'translate(-50%,' + (-rise - 50) + 'px) scale(.2)', opacity: 0, offset: 1 }], { duration: 900 + Math.random() * 600, delay: d0, fill: 'both', easing: 'ease-out' }).onfinish = function () { this.effect.target.remove(); };
      }
      impact(r.left + r.width / 2, r.top + r.height / 2, delay + dur * .9);
      return wrap.animate([
        { transform: T(cx, cy + 40, sc * .7), filter: G(1) + ' brightness(3)', opacity: 0, offset: 0 },
        { transform: T(cx, cy + 20, sc * .85), filter: G(1) + ' brightness(2.2)', opacity: .35, offset: .22, easing: 'ease-out' },
        { transform: T(cx, cy - 6, sc), filter: G(1) + ' brightness(1.35)', opacity: 1, offset: .46, easing: 'ease-in-out' },
        { transform: T(cx, cy - 22, sc * 1.03), filter: G(.6) + ' brightness(1)', opacity: 1, offset: .72, easing: 'cubic-bezier(.5,0,.8,.4)' },
        { transform: T(0, 4, .94), filter: G(.8), opacity: 1, offset: .9, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: T(0, 0, 1), filter: G(0), opacity: 1, offset: 1 }
      ], { duration: dur, delay: delay, fill: 'both' });
    },
    'fichas': function (wrap, r, delay, dur) {
      var W = window.innerWidth, H = window.innerHeight, cx = W / 2 - (r.left + r.width / 2), cy = H / 2 - (r.top + r.height / 2) - 10;
      var sc = Math.max(1.4, Math.min(3, Math.min(300, W * .62, H * .5 * 5 / 7) / r.width)) * 1.05, mx = r.left + r.width / 2 + cx, my = r.top + r.height / 2 + cy;
      var T = function (x, y, z, ry, rz) { return 'perspective(1100px) translate(' + x + 'px,' + y + 'px) scale(' + z + ') rotateY(' + (ry || 0) + 'deg) rotateZ(' + (rz || 0) + 'deg)'; };
      var G = function (a) { return 'drop-shadow(0 0 ' + Math.round(6 + a * 22) + 'px rgba(250,204,21,' + (.15 + a * .6).toFixed(2) + ')) drop-shadow(0 18px 24px rgba(0,0,0,.5))'; };
      var COL = [['#dc2626', '#f8fafc'], ['#111827', '#f8fafc'], ['#2563eb', '#f8fafc'], ['#16a34a', '#f8fafc'], ['#e5e7eb', '#1f2937'], ['#7c3aed', '#f8fafc']];
      var chip = function (x, y, size, k) { var e = document.createElement('i'); e.className = 'fxchip'; e.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px;--cc:' + COL[k % 6][0] + ';--st:' + COL[k % 6][1]; document.body.appendChild(e); return e; };
      var i, k;
      for (i = 0; i < 22; i++) { // lluvia de fichas que se apilan alrededor de la carta y se desvanecen antes de que salga volando
        var x = mx + (Math.random() - .5) * sc * r.width * 1.6, y = my + (Math.random() - .5) * sc * r.height * .95, sz = 26 + Math.random() * 14, st = dur * (.05 + Math.random() * .36), life = dur * .78 - st, ro = (Math.random() - .5) * 720;
        var c = chip(x, y, sz, i);
        c.animate([
          { transform: 'translate(-50%,' + (-(y + 90)) + 'px) rotate(' + ro + 'deg)', opacity: 0, offset: 0 },
          { transform: 'translate(-50%,-50%) rotate(' + (ro * .1) + 'deg)', opacity: 1, offset: .22, easing: 'cubic-bezier(.5,0,.9,.5)' },
          { transform: 'translate(-50%,-90%) rotate(' + (ro * .08) + 'deg)', opacity: 1, offset: .3, easing: 'ease-in' },
          { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1, offset: .38 },
          { transform: 'translate(-50%,-50%) rotate(0deg)', opacity: 1, offset: .82 },
          { transform: 'translate(-50%,-50%) rotate(0deg) scale(.6)', opacity: 0, offset: 1 }
        ], { duration: life, delay: delay + st, fill: 'both' }).onfinish = (function (n) { return function () { n.remove(); }; })(c);
      }
      // al aterrizar en el hueco, las fichas salen disparadas
      var sx = r.left + r.width / 2, sy = r.top + r.height / 2, tl = delay + dur * .9;
      for (k = 0; k < 12; k++) {
        var a = (k / 12) * Math.PI * 2 + Math.random() * .4, dist = 80 + Math.random() * 90, b = chip(sx, sy, 22 + Math.random() * 8, k + 2);
        b.animate([{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .1 }, { transform: 'translate(' + (Math.cos(a) * dist - 12) + 'px,' + (Math.sin(a) * dist - 40) + 'px) rotate(' + (360 + Math.random() * 360) + 'deg) scale(.7)', opacity: 0, offset: 1 }], { duration: 750 + Math.random() * 300, delay: tl, fill: 'both', easing: 'cubic-bezier(.1,.7,.3,1)' }).onfinish = (function (n) { return function () { n.remove(); }; })(b);
      }
      snd('chips', delay + dur * .14); snd('chips', delay + dur * .5);
      impact(sx, sy, tl);
      return wrap.animate([
        { transform: T(cx - W * .6, cy - H * .5, sc * .5, 0, -540), filter: G(.3), opacity: 0, offset: 0 },
        { transform: T(cx, cy, sc, 0, 0), filter: G(.6), opacity: 1, offset: .17, easing: 'cubic-bezier(.2,.8,.3,1)' },
        { transform: T(cx, cy + 6, sc * .98, 0, 0), filter: G(.6), opacity: 1, offset: .24 },
        { transform: T(cx, cy, sc, 360, 0), filter: G(1), opacity: 1, offset: .52, easing: 'ease-in-out' },
        { transform: T(cx, cy - 12, sc * 1.03, 360, 0), filter: G(.8), opacity: 1, offset: .72, easing: 'cubic-bezier(.5,0,.8,.4)' },
        { transform: T(0, 6, .92, 360, 0), filter: G(.6), opacity: 1, offset: .9, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: T(0, 0, 1, 360, 0), filter: G(0), opacity: 1, offset: 1 }
      ], { duration: dur, delay: delay, fill: 'both' });
    },
    'sombras': function (wrap, r, delay, dur) {
      var W = window.innerWidth, H = window.innerHeight, cx = W / 2 - (r.left + r.width / 2), cy = H / 2 - (r.top + r.height / 2) - 10;
      var sc = Math.max(1.4, Math.min(3, Math.min(300, W * .62, H * .5 * 5 / 7) / r.width)) * 1.05, mx = r.left + r.width / 2 + cx, my = r.top + r.height / 2 + cy;
      var T = function (x, y, z) { return 'perspective(1100px) translate(' + x + 'px,' + y + 'px) scale(' + z + ')'; };
      var SIL = 'brightness(0) drop-shadow(0 0 16px rgba(139,92,246,.95)) drop-shadow(0 0 40px rgba(76,29,149,.9))';
      var G = function (a) { return 'drop-shadow(0 0 ' + Math.round(6 + a * 26) + 'px rgba(139,92,246,' + (.2 + a * .8).toFixed(2) + ')) drop-shadow(0 18px 24px rgba(0,0,0,.5))'; };
      var E = function (cls, x, y, w, h, kf, d0, du) { var e = document.createElement('i'); e.className = cls; e.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px'; document.body.appendChild(e); var a = e.animate(kf, { duration: du, delay: delay + d0, fill: 'both' }); a.onfinish = function () { e.remove(); }; return e; };
      var cw = sc * r.width, ch = sc * r.height, i;
      // charco de sombras bajo la carta
      E('fxshp', mx, my + ch * .46, cw * 1.9, ch * .5, [{ transform: 'translate(-50%,-50%) scale(.1)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: .95, offset: .2 }, { transform: 'translate(-50%,-50%) scale(1.08)', opacity: .9, offset: .62 }, { transform: 'translate(-50%,-50%) scale(1.25)', opacity: 0, offset: 1 }], 0, dur * .78);
      // humo morado que sube y se enrosca alrededor de la silueta
      for (i = 0; i < 22; i++) {
        var ax = (Math.random() - .5) * cw * 1.5, sz = cw * (.35 + Math.random() * .45), st = dur * (.04 + Math.random() * .42), rise = ch * (.5 + Math.random() * .9), dr = (Math.random() - .5) * 200;
        E('fxsm', mx + ax, my + ch * (.1 + Math.random() * .4), sz, sz, [{ transform: 'translate(-50%,-50%) scale(.3) rotate(0deg)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-' + (rise * .5 + 50) + 'px) scale(.9) rotate(' + dr * .5 + 'deg)', opacity: .75, offset: .4 }, { transform: 'translate(-50%,-' + (rise + 50) + 'px) scale(1.3) rotate(' + dr + 'deg)', opacity: 0, offset: 1 }], st, dur * .45);
      }
      // zarcillos de sombra que suben
      for (i = 0; i < 9; i++) {
        var tx = mx + (Math.random() - .5) * cw * 1.3, th = ch * (.7 + Math.random() * .5), st2 = dur * (.05 + Math.random() * .35);
        E('fxten', tx, my + ch * .45, 10 + Math.random() * 12, th, [{ transform: 'translate(-50%,-100%) scaleY(.05)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: .85, offset: .45 }, { transform: 'translate(-50%,-100%) scaleY(1.1)', opacity: 0, offset: 1 }], st2, dur * .4);
      }
      // ojos brillantes de la sombra
      [-1, 1].forEach(function (sd) { E('fxeye', mx + sd * cw * .17, my - ch * .27, 15 * (sc / 2), 6 * (sc / 2), [{ transform: 'translate(-50%,-50%) scaleY(.1)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scaleY(1)', opacity: 1, offset: .12 }, { transform: 'translate(-50%,-50%) scaleY(.1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%,-50%) scaleY(1)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-50%) scaleY(1)', opacity: 1, offset: .86 }, { transform: 'translate(-50%,-50%) scaleY(1)', opacity: 0, offset: 1 }], dur * .16, dur * .46); });
      // destello morado y chispas al aterrizar
      var sx = r.left + r.width / 2, sy = r.top + r.height / 2;
      for (i = 0; i < 14; i++) {
        var a = (i / 14) * Math.PI * 2 + Math.random() * .3, dist = 60 + Math.random() * 90, sp = document.createElement('i');
        sp.className = 'fxspark vio'; sp.style.cssText = 'left:' + sx + 'px;top:' + sy + 'px'; document.body.appendChild(sp);
        sp.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .08 }, { transform: 'translate(' + (Math.cos(a) * dist) + 'px,' + (Math.sin(a) * dist) + 'px) scale(.1)', opacity: 0, offset: 1 }], { duration: 700 + Math.random() * 300, delay: delay + dur * .9, fill: 'both', easing: 'ease-out' }).onfinish = (function (n) { return function () { n.remove(); }; })(sp);
      }
      snd('magic', delay + dur * .1); snd('magic', delay + dur * .55);
      impact(sx, sy, delay + dur * .9);
      return wrap.animate([
        { transform: T(cx, cy + 70, sc * .85), filter: SIL, opacity: 0, offset: 0 },
        { transform: T(cx, cy + 40, sc * .92), filter: SIL, opacity: .55, offset: .22, easing: 'ease-out' },
        { transform: T(cx, cy + 10, sc), filter: SIL, opacity: .92, offset: .5, easing: 'ease-in' },
        { transform: T(cx, cy, sc), filter: 'brightness(2.4) saturate(.6) ' + G(1), opacity: 1, offset: .6, easing: 'ease-out' },
        { transform: T(cx, cy - 8, sc * 1.02), filter: G(.8), opacity: 1, offset: .72, easing: 'cubic-bezier(.5,0,.8,.4)' },
        { transform: T(0, 5, .94), filter: G(.8), opacity: 1, offset: .9, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: T(0, 0, 1), filter: G(0), opacity: 1, offset: 1 }
      ], { duration: dur, delay: delay, fill: 'both' });
    },
    'kame': function (wrap, r, delay, dur) {
      var k = Math.max(1.5, r.height / 110), sx = r.left + r.width / 2, sy = r.top + r.height / 2;
      var SH = 'img/kame.png';
      var FR = [[13, 50], [67, 99], [123, 154], [163, 226], [245, 278], [300, 338], [362, 400]]; // fotogramas de Goku en la hoja (x0, x1)
      var Y0 = 40, Y1 = 110, FEET = 105, BC = 78; // fila de pies y centro del rayo en la hoja
      var feetY = sy + (FEET - BC) * k, top = feetY - (FEET - Y0) * k, gx = Math.max(6, sx - r.width * .5 - 520 * k / 3.2), hands = gx + 52 * k;
      var piece = function (x0, x1, y0, y1) { var e = document.createElement('div'); e.className = 'fxk'; e.style.width = (x1 - x0 + 1) * k + 'px'; e.style.height = (y1 - y0 + 1) * k + 'px'; e.style.backgroundImage = 'url(' + SH + ')'; e.style.backgroundSize = 820 * k + 'px ' + 158 * k + 'px'; e.style.backgroundPosition = -x0 * k + 'px ' + -y0 * k + 'px'; document.body.appendChild(e); return e; };
      var all = [], A = function (e, kf, o) { all.push(e); var a = e.animate(kf, Object.assign({ fill: 'both', delay: delay }, o)); a.onfinish = function () { e.remove(); }; return a; };
      var fu = [0, .09, .17, .25, .43, .51, .57], fe = [.09, .17, .25, .43, .51, .57, .93]; // cuándo se ve cada fotograma
      FR.forEach(function (f, n) {
        var e = piece(f[0], f[1], Y0, Y1), w = (f[1] - f[0] + 1) * k, left = n === 6 ? hands - w : gx + 18 * k - w / 2 + (n === 3 ? 0 : 0);
        e.style.left = left + 'px'; e.style.top = top + 'px';
        var a0 = fu[n], a1 = fe[n], kf = [{ opacity: 0, offset: 0 }]; if (a0 > 0) kf.push({ opacity: 0, offset: a0 - .001 }); kf.push({ opacity: 1, offset: a0 }, { opacity: 1, offset: a1 - .001 }, { opacity: 0, offset: a1 }, { opacity: 0, offset: 1 });
        A(e, kf, { duration: dur });
      });
      // aura azul alrededor de Goku mientras carga
      var au = document.createElement('i'); au.className = 'fxkau'; au.style.cssText = 'left:' + (gx + 18 * k) + 'px;top:' + (feetY - 30 * k) + 'px;width:' + 60 * k + 'px;height:' + 60 * k + 'px'; document.body.appendChild(au);
      A(au, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: .85, offset: .3 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: .9, offset: .55 }, { transform: 'translate(-50%,-50%) scale(1.8)', opacity: 0, offset: .65 }, { opacity: 0, offset: 1 }], { duration: dur });
      // rayo: arranque + tramo central que se estira + cabeza que avanza hasta el hueco
      var SW = 127 * k, HW = 129 * k, headCx = sx, startX = hands - 4 * k, headTargetLeft = headCx - HW / 2, midLen = Math.max(10, headTargetLeft - (startX + SW)), midW = 121 * k;
      var by = sy - (BC - 15) * k, bh = (142 - 15 + 1) * k;
      var st = piece(402, 528, 15, 142), mi = piece(530, 650, 15, 142), he = piece(652, 779, 15, 142);
      st.style.left = startX + 'px'; st.style.top = by + 'px'; mi.style.left = startX + SW + 'px'; mi.style.top = by + 'px'; mi.style.transformOrigin = '0 50%'; he.style.top = by + 'px'; he.style.left = startX + SW + 'px';
      var t0 = .57, t1 = .79, tf = .93;
      A(st, [{ opacity: 0, transform: 'scale(.2)', offset: 0 }, { opacity: 0, transform: 'scale(.2)', offset: t0 }, { opacity: 1, transform: 'scale(1)', offset: t0 + .05 }, { opacity: 1, transform: 'scale(1)', offset: tf - .02 }, { opacity: 0, transform: 'scale(1)', offset: 1 }], { duration: dur });
      st.style.transformOrigin = '0 50%';
      var sxm = midLen / midW;
      A(mi, [{ opacity: 0, transform: 'scaleX(.01)', offset: 0 }, { opacity: 0, transform: 'scaleX(.01)', offset: t0 + .02 }, { opacity: 1, transform: 'scaleX(.01)', offset: t0 + .04 }, { opacity: 1, transform: 'scaleX(' + sxm + ')', offset: t1, easing: 'cubic-bezier(.3,0,.5,1)' }, { opacity: 1, transform: 'scaleX(' + sxm + ')', offset: tf - .02 }, { opacity: 0, transform: 'scaleX(' + sxm + ')', offset: 1 }], { duration: dur });
      A(he, [{ opacity: 0, transform: 'translateX(0)', offset: 0 }, { opacity: 0, transform: 'translateX(0)', offset: t0 + .02 }, { opacity: 1, transform: 'translateX(0)', offset: t0 + .04 }, { opacity: 1, transform: 'translateX(' + midLen + 'px)', offset: t1, easing: 'cubic-bezier(.3,0,.5,1)' }, { opacity: 1, transform: 'translateX(' + midLen + 'px)', offset: tf - .02 }, { opacity: 0, transform: 'translateX(' + midLen + 'px)', offset: 1 }], { duration: dur });
      snd('magic', delay + dur * .3); snd('hit', delay + dur * .6);
      impact(sx, sy, delay + dur * t1);
      // la carta viaja con la cabeza del rayo y se queda en su hueco
      var G = function (a) { return 'drop-shadow(0 0 ' + Math.round(6 + a * 28) + 'px rgba(80,200,255,' + (.2 + a * .8).toFixed(2) + ')) drop-shadow(0 18px 24px rgba(0,0,0,.5))'; };
      var from = hands - sx;
      return wrap.animate([
        { transform: 'translateX(' + from + 'px) scale(.5)', filter: G(1), opacity: 0, offset: 0 },
        { transform: 'translateX(' + from + 'px) scale(.5)', filter: G(1), opacity: 0, offset: t0 + .03 },
        { transform: 'translateX(' + from + 'px) scale(.9)', filter: G(1), opacity: 1, offset: t0 + .07 },
        { transform: 'translateX(' + (from * .02) + 'px) scale(1.25)', filter: G(1), opacity: 1, offset: t1, easing: 'cubic-bezier(.3,0,.5,1)' },
        { transform: 'translateX(0) scale(1.08)', filter: G(.8), opacity: 1, offset: t1 + .06, easing: 'ease-out' },
        { transform: 'translateX(0) scale(1)', filter: G(0), opacity: 1, offset: 1 }
      ], { duration: dur, delay: delay, fill: 'both' });
    },
    'grimorio': function (wrap, r, delay, dur) {
      var W = window.innerWidth, H = window.innerHeight, cx = W / 2 - (r.left + r.width / 2), cy = H / 2 - (r.top + r.height / 2) - 10;
      var sc = Math.max(1.4, Math.min(3, Math.min(300, W * .62, H * .5 * 5 / 7) / r.width)) * 1.0, mx = r.left + r.width / 2 + cx, my = r.top + r.height / 2 + cy;
      var T = function (x, y, z) { return 'perspective(1100px) translate(' + x + 'px,' + y + 'px) scale(' + z + ')'; };
      var G = function (a) { return 'drop-shadow(0 0 ' + Math.round(6 + a * 28) + 'px rgba(250,230,120,' + (.2 + a * .8).toFixed(2) + ')) drop-shadow(0 18px 24px rgba(0,0,0,.5))'; };
      var bw = Math.round(sc * r.width * 1.05), bh = Math.round(bw * 1.3);
      var mk = function (cls, parent, w, h, x, y) { var e = document.createElement('div'); e.className = cls; e.style.cssText = 'width:' + w + 'px;height:' + h + 'px;left:' + x + 'px;top:' + y + 'px'; parent.appendChild(e); return e; };
      var clover = '<svg viewBox="-50 -50 100 100"><defs><linearGradient id="gcl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4b3a24"/><stop offset=".5" stop-color="#9a7b43"/><stop offset="1" stop-color="#33260f"/></linearGradient></defs>' + [0, 72, 144, 216, 288].map(function (a) { return '<path transform="rotate(' + a + ')" d="M0 -3 C-19 -10 -24 -34 -10 -39 C-4 -41 0 -35 0 -31 C0 -35 4 -41 10 -39 C24 -34 19 -10 0 -3Z" fill="url(#gcl)" stroke="#1a1208" stroke-width="1.4"/>'; }).join('') + '<path d="M0 0 L4 22" stroke="url(#gcl)" stroke-width="3.4" stroke-linecap="round"/></svg>';
      var box = document.createElement('div'); box.className = 'fxgri'; box.style.cssText = 'left:' + mx + 'px;top:' + my + 'px;width:' + bw + 'px;height:' + bh + 'px'; document.body.appendChild(box);
      var aura = mk('fxgau', box, bw * 2, bw * 2, bw / 2 - bw, bh / 2 - bw);
      var back = mk('fxgbk', box, bw, bh, 0, 0), pages = mk('fxgpg', box, bw * .94, bh * .95, bw * .04, bh * .025);
      var glow = mk('fxgg', box, bw * .9, bh * .9, bw * .05, bh * .05);
      var cover = mk('fxgcv', box, bw, bh, 0, 0); cover.innerHTML = '<div class="fxgf"><span class="fxgem">' + clover + '</span></div><div class="fxgb"></div>';
      var bigGlow = mk('fxgem2', box, bw * .6, bw * .6, bw * .2, bh * .5 - bw * .3); bigGlow.innerHTML = clover;
      var all = [box], A = function (e, kf, o) { var a = e.animate(kf, Object.assign({ fill: 'both', delay: delay }, o)); return a; };
      A(box, [{ transform: 'translate(-50%,-50%) translateY(60px) rotate(-30deg) scale(.2)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) translateY(0) rotate(-14deg) scale(1)', opacity: 1, offset: .16, easing: 'ease-out' }, { transform: 'translate(-50%,-50%) translateY(-10px) rotate(-12deg) scale(1)', opacity: 1, offset: .3 }, { transform: 'translate(-50%,-50%) translateY(-6px) rotate(-6deg) scale(1.02)', opacity: 1, offset: .5 }, { transform: 'translate(-50%,-50%) translateY(10px) rotate(0deg) scale(.9)', opacity: 1, offset: .66 }, { transform: 'translate(-50%,-50%) translateY(40px) rotate(0deg) scale(.6)', opacity: 0, offset: .8 }, { opacity: 0, offset: 1 }], { duration: dur }).onfinish = function () { box.remove(); };
      A(aura, [{ transform: 'scale(.3) rotate(0deg)', opacity: 0, offset: 0 }, { transform: 'scale(1) rotate(60deg)', opacity: .9, offset: .3 }, { transform: 'scale(1.1) rotate(160deg)', opacity: .8, offset: .62 }, { transform: 'scale(1.3) rotate(220deg)', opacity: 0, offset: .82 }, { opacity: 0, offset: 1 }], { duration: dur });
      // la tapa se abre (gira sobre el lomo) y la luz sale por las páginas
      A(cover, [{ transform: 'rotateY(0deg)', offset: 0 }, { transform: 'rotateY(0deg)', offset: .33 }, { transform: 'rotateY(-168deg)', offset: .5, easing: 'cubic-bezier(.3,.1,.3,1)' }, { transform: 'rotateY(-168deg)', offset: 1 }], { duration: dur });
      A(glow, [{ opacity: 0, transform: 'scale(.6)', offset: 0 }, { opacity: 0, transform: 'scale(.6)', offset: .38 }, { opacity: 1, transform: 'scale(1.1)', offset: .5 }, { opacity: .8, transform: 'scale(1.5)', offset: .64 }, { opacity: 0, transform: 'scale(1.9)', offset: .8 }, { opacity: 0, offset: 1 }], { duration: dur });
      A(bigGlow, [{ opacity: 0, transform: 'scale(.4)', offset: 0 }, { opacity: 0, transform: 'scale(.4)', offset: .3 }, { opacity: .95, transform: 'scale(1)', offset: .42 }, { opacity: 0, transform: 'scale(1.6)', offset: .56 }, { opacity: 0, offset: 1 }], { duration: dur });
      // motas de luz que suben del libro
      for (var i = 0; i < 16; i++) {
        var sp = document.createElement('i'), x = mx + (Math.random() - .5) * bw * .9, rise = bh * (.5 + Math.random() * .9), d0 = dur * (.4 + Math.random() * .2);
        sp.className = 'fxspark'; sp.style.cssText = 'left:' + x + 'px;top:' + my + 'px'; document.body.appendChild(sp);
        sp.animate([{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .2 }, { transform: 'translate(-50%,' + (-rise) + 'px) scale(.2)', opacity: 0, offset: 1 }], { duration: 800 + Math.random() * 500, delay: delay + d0, fill: 'both', easing: 'ease-out' }).onfinish = (function (n) { return function () { n.remove(); }; })(sp);
      }
      snd('magic', delay + dur * .12); snd('magic', delay + dur * .42);
      impact(r.left + r.width / 2, r.top + r.height / 2, delay + dur * .9);
      return wrap.animate([
        { transform: T(cx, cy + 30, .35), filter: G(1), opacity: 0, offset: 0 },
        { transform: T(cx, cy + 30, .35), filter: G(1), opacity: 0, offset: .46 },
        { transform: T(cx, cy + 10, .6), filter: G(1) + ' brightness(2)', opacity: .9, offset: .53, easing: 'ease-out' },
        { transform: T(cx, cy - 30, sc), filter: G(1) + ' brightness(1.2)', opacity: 1, offset: .68, easing: 'ease-in-out' },
        { transform: T(cx, cy - 36, sc * 1.03), filter: G(.7), opacity: 1, offset: .78, easing: 'cubic-bezier(.5,0,.8,.4)' },
        { transform: T(0, 5, .94), filter: G(.8), opacity: 1, offset: .92, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: T(0, 0, 1), filter: G(0), opacity: 1, offset: 1 }
      ], { duration: dur, delay: delay, fill: 'both' });
    },
    'perro': function (wrap, r, delay, dur) {
      var W = window.innerWidth, w = r.width, h = r.height, sx = r.left + w / 2;
      var dh = Math.max(80, w * 1.05), dw = dh * 424 / 412, cordL = h * .22, rump = dw * .86, half = h * .49;
      var tx0 = W - sx + half + cordL + rump, txE = -dw - sx + half + cordL + rump, ts = tx0 / (tx0 - txE), ty0 = h / 2 - w / 2 - 2;
      var dog = document.createElement('div'); dog.className = 'fxdog';
      dog.style.cssText = '--dw:' + dw + 'px;width:' + dw + 'px;height:' + dh + 'px;left:' + (sx - half - cordL - rump) + 'px;top:' + (r.bottom - dh + dh * .04) + 'px';
      var cord = document.createElement('i'); cord.className = 'fxcord'; cord.style.cssText = 'left:' + (rump - 4) + 'px;top:' + (dh * .46) + 'px;width:' + (cordL + 6) + 'px'; dog.appendChild(cord); document.body.appendChild(dog);
      var da = dog.animate([{ transform: 'translateX(' + tx0 + 'px)' }, { transform: 'translateX(' + txE + 'px)' }], { duration: dur, delay: delay, fill: 'both' });
      da.onfinish = function () { dog.remove(); };
      cord.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: Math.max(0, ts - .02) }, { opacity: 0, offset: Math.min(1, ts + .03) }, { opacity: 0, offset: 1 }], { duration: dur, delay: delay, fill: 'both' });
      var ks = [], n = 14, i, rot;
      for (i = 0; i <= n; i++) { // arrastrada: avanza al mismo ritmo que el perro y va dando botes
        rot = -82 + (i % 2 ? 4 : -3);
        ks.push({ transform: 'translate(' + (tx0 * (1 - i / n)) + 'px,' + (ty0 - (i % 2 ? 5 : 0)) + 'px) rotate(' + rot + 'deg)', offset: ts * i / n });
      }
      ks.push({ transform: 'translate(0,' + (ty0 - h * .32) + 'px) rotate(-30deg) scale(1.08)', offset: Math.min(.98, ts + .07), easing: 'ease-out' });
      ks.push({ transform: 'translate(0,' + (-h * .08) + 'px) rotate(0deg) scale(1.04)', offset: Math.min(.99, ts + .14), easing: 'ease-in' });
      ks.push({ transform: 'translate(0,0) rotate(0deg) scale(1)', offset: Math.min(1, ts + .2) });
      ks.push({ transform: 'translate(0,0) rotate(0deg) scale(1)', offset: 1 });
      impact(sx, r.top + h / 2, delay + dur * (ts + .14));
      return wrap.animate(ks, { duration: dur, delay: delay, fill: 'both' });
    },
    'grieta': function (wrap, r, delay, dur) {
      var W = window.innerWidth, H = window.innerHeight, cx = W / 2 - (r.left + r.width / 2), cy = H / 2 - (r.top + r.height / 2) - 10;
      var sc = Math.max(1.4, Math.min(3, Math.min(300, W * .62, H * .5 * 5 / 7) / r.width)) * 1.02, mx = r.left + r.width / 2 + cx, my = r.top + r.height / 2 + cy;
      var T = function (x, y, z) { return 'perspective(1100px) translate(' + x + 'px,' + y + 'px) scale(' + z + ')'; };
      var G = function (a) { return 'drop-shadow(0 0 ' + Math.round(6 + a * 28) + 'px rgba(150,200,255,' + (.2 + a * .8).toFixed(2) + ')) drop-shadow(0 18px 24px rgba(0,0,0,.5))'; };
      var NS = 'http://www.w3.org/2000/svg', cw = sc * r.width, ch = sc * r.height, i, k;
      var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'fxcrk'); svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var gid = 'crg' + Math.floor(Math.random() * 1e6);
      svg.innerHTML = '<defs><radialGradient id="' + gid + '"><stop offset="0" stop-color="#ffffff"/><stop offset=".35" stop-color="#bfe3ff"/><stop offset=".7" stop-color="#6d4bd8"/><stop offset="1" stop-color="#150a3a"/></radialGradient></defs>';
      document.body.appendChild(svg);
      var gr = document.createElementNS(NS, 'g'); svg.appendChild(gr);
      // la brecha: un polígono irregular que se abre en el centro
      var pts = [], n = 20, rx = cw * .66, ry = ch * .62;
      for (i = 0; i < n; i++) { var a = i / n * Math.PI * 2, f = i % 2 ? .62 + Math.random() * .2 : .95 + Math.random() * .25; pts.push((mx + Math.cos(a) * rx * f).toFixed(1) + ',' + (my + Math.sin(a) * ry * f).toFixed(1)); }
      var rift = document.createElementNS(NS, 'polygon'); rift.setAttribute('points', pts.join(' ')); rift.setAttribute('fill', 'url(#' + gid + ')'); rift.setAttribute('class', 'fxcrkr'); rift.style.transformOrigin = mx + 'px ' + my + 'px'; gr.appendChild(rift);
      // grietas que se ramifican desde el centro
      var paths = [];
      var branch = function (x, y, ang, len, depth) {
        var d = 'M' + x.toFixed(1) + ' ' + y.toFixed(1), run = 0;
        while (run < len) {
          var seg = 26 + Math.random() * 46; ang += (Math.random() - .5) * .9; x += Math.cos(ang) * seg; y += Math.sin(ang) * seg; run += seg; d += 'L' + x.toFixed(1) + ' ' + y.toFixed(1);
          if (depth > 0 && run > 60 && Math.random() < .42) branch(x, y, ang + (Math.random() < .5 ? -1 : 1) * (.5 + Math.random() * .7), (len - run) * (.5 + Math.random() * .4), depth - 1);
        }
        paths.push({ d: d, depth: depth });
      };
      var big = Math.hypot(W, H) * .62;
      for (i = 0; i < 9; i++) branch(mx, my, i / 9 * Math.PI * 2 + Math.random() * .5, big * (.45 + Math.random() * .55), 2);
      paths.forEach(function (p, j) {
        var e = document.createElementNS(NS, 'path'); e.setAttribute('d', p.d); e.setAttribute('pathLength', '1'); e.setAttribute('class', 'fxcrkp d' + p.depth); e.style.strokeDasharray = '1'; e.style.strokeDashoffset = '1'; gr.appendChild(e);
        e.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: dur * (.1 + p.depth * -.02 + Math.random() * .04), delay: delay + dur * (.02 + (2 - p.depth) * .035), fill: 'both', easing: 'cubic-bezier(.2,.8,.3,1)' });
      });
      // la brecha se abre con un resplandor
      rift.animate([{ transform: 'scale(.05)', opacity: 0, offset: 0 }, { transform: 'scale(.05)', opacity: 0, offset: .14 }, { transform: 'scale(1.08)', opacity: 1, offset: .3, easing: 'cubic-bezier(.2,.9,.3,1)' }, { transform: 'scale(1)', opacity: 1, offset: .7 }, { transform: 'scale(.9)', opacity: 0, offset: .88 }, { opacity: 0, offset: 1 }], { duration: dur, delay: delay, fill: 'both' });
      var fade = gr.animate([{ opacity: 1, offset: 0 }, { opacity: 1, offset: .72 }, { opacity: 0, offset: .92 }, { opacity: 0, offset: 1 }], { duration: dur, delay: delay, fill: 'both' });
      var fl = document.createElement('i'); fl.className = 'fxcrf'; fl.style.background = 'radial-gradient(circle at ' + mx + 'px ' + my + 'px, rgba(220,240,255,.95), rgba(130,160,255,.4) 35%, transparent 62%)'; document.body.appendChild(fl);
      fl.animate([{ opacity: 0, offset: 0 }, { opacity: 0, offset: .13 }, { opacity: 1, offset: .2 }, { opacity: 0, offset: .38 }, { opacity: 0, offset: 1 }], { duration: dur, delay: delay, fill: 'both' });
      fade.onfinish = function () { svg.remove(); fl.remove(); };
      if (!REDUCED) app.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,4px)' }, { transform: 'translate(6px,-5px)' }, { transform: 'translate(-4px,-3px)' }, { transform: 'translate(3px,4px)' }, { transform: 'translate(0,0)' }], { duration: dur * .16, delay: delay + dur * .02 });
      if (!REDUCED) app.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-10px,6px)' }, { transform: 'translate(9px,-7px)' }, { transform: 'translate(-6px,-4px)' }, { transform: 'translate(0,0)' }], { duration: dur * .14, delay: delay + dur * .17 });
      // esquirlas que salen despedidas al abrirse
      for (k = 0; k < 18; k++) {
        var aa = (k / 18) * Math.PI * 2 + Math.random() * .3, dist = 80 + Math.random() * 160, sp = document.createElement('i');
        sp.className = 'fxspark vio'; sp.style.cssText = 'left:' + mx + 'px;top:' + my + 'px'; document.body.appendChild(sp);
        sp.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 0, offset: 0 }, { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .08 }, { transform: 'translate(' + (Math.cos(aa) * dist) + 'px,' + (Math.sin(aa) * dist) + 'px) scale(.1)', opacity: 0, offset: 1 }], { duration: 750, delay: delay + dur * (.2 + Math.random() * .06), fill: 'both' }).onfinish = (function (e) { return function () { e.remove(); }; })(sp);
      }
      snd('hit', delay + dur * .02); snd('hit', delay + dur * .17); snd('magic', delay + dur * .3);
      impact(r.left + r.width / 2, r.top + r.height / 2, delay + dur * .9);
      return wrap.animate([
        { transform: T(cx, cy, .2), filter: G(1) + ' brightness(3)', opacity: 0, offset: 0 },
        { transform: T(cx, cy, .2), filter: G(1) + ' brightness(3)', opacity: 0, offset: .24 },
        { transform: T(cx, cy, .5), filter: G(1) + ' brightness(2.4)', opacity: 1, offset: .34, easing: 'ease-out' },
        { transform: T(cx, cy, sc), filter: G(1) + ' brightness(1.3)', opacity: 1, offset: .52, easing: 'ease-in-out' },
        { transform: T(cx, cy - 16, sc * 1.03), filter: G(.7), opacity: 1, offset: .72, easing: 'cubic-bezier(.5,0,.8,.4)' },
        { transform: T(0, 5, .94), filter: G(.8), opacity: 1, offset: .9, easing: 'cubic-bezier(.2,.9,.3,1)' },
        { transform: T(0, 0, 1), filter: G(0), opacity: 1, offset: 1 }
      ], { duration: dur, delay: delay, fill: 'both' });
    },
    'default': function (wrap, r, delay, dur) {
      var cx = window.innerWidth / 2 - (r.left + r.width / 2), cy = window.innerHeight / 2 - (r.top + r.height / 2) - 10, sc = Math.max(1.4, Math.min(3, Math.min(300, window.innerWidth * .62, window.innerHeight * .5 * 5 / 7) / r.width));
      var T = function (x, y, z, ry) { return 'perspective(1100px) translate(' + x + 'px,' + y + 'px) scale(' + z + ') rotateY(' + ry + 'deg)'; };
      return wrap.animate([
        { transform: T(cx, cy, .15, 0), opacity: 0, offset: 0 },
        { transform: T(cx, cy, sc, 0), opacity: 1, offset: .14, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
        { transform: T(cx, cy, sc, 720), opacity: 1, offset: .62, easing: 'cubic-bezier(.45,0,.55,1)' },
        { transform: T(cx, cy, sc * 1.04, 720), opacity: 1, offset: .70 },
        { transform: T(0, 0, 1, 720), opacity: 1, offset: 1 }
      ], { duration: dur - 150, delay: delay, fill: 'both', easing: 'cubic-bezier(.5,0,.3,1)' });
    }
  };
  function deployId() { var id = ui.acct && ui.acct.fx && ui.acct.fx.deploy; return DEPLOY_FX[id] && fxHas(id) ? id : 'default'; }
  // Vista previa en Colección → Efectos: la carta de muestra vuela desde el centro hasta su hueco
  function previewDeploy(id, root, done) {
    var t = (root || app).querySelector('.fxdemo .card'); if (!t || ui.fxBusy) return;
    var r = t.getBoundingClientRect(); ui.fxBusy = true;
    var wrap = document.createElement('div'); wrap.className = 'flyc'; wrap.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    wrap.appendChild(t.cloneNode(true)); document.body.appendChild(wrap); t.style.visibility = 'hidden';
    var an = (DEPLOY_FX[id] || DEPLOY_FX.default)(wrap, r, 0, deployMeta(id).ms);
    an.onfinish = function () { wrap.remove(); t.style.visibility = ''; ui.fxBusy = false; if (done) done(); };
  }
  // Vista previa desde el pase: una carta de muestra en un hueco flotante sobre la pantalla atenuada
  function passPlay(id) {
    if (ui.fxBusy) return;
    var sample = D.cards.filter(function (c) { return owns(c.id) && ARTS[c.id]; })[0] || D.cards[0];
    var bg = document.createElement('div'); bg.className = 'fxtmpbg';
    var box = document.createElement('div'); box.className = 'fxdemo fxtmp'; box.innerHTML = '<div class="fxslot"></div><div class="fxcard">' + cardHtml(sample, { lv: 1, skin: '' }) + '</div>';
    document.body.appendChild(bg); document.body.appendChild(box);
    bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 250, fill: 'both' });
    setTimeout(function () { previewDeploy(id, box, function () { box.remove(); bg.remove(); }); }, 280);
  }
  function fxDemo() {
    var sample = D.cards.filter(function (c) { return owns(c.id) && ARTS[c.id]; })[0] || D.cards[0];
    return '<div class="fxdemo"><div class="fxslot"></div><div class="fxcard">' + cardHtml(sample, { lv: 1, skin: '' }) + '</div></div>';
  }
  // Demo de fundas: reverso y frente con la funda que se está probando
  function slvDemo() {
    var sample = D.cards.filter(function (c) { return owns(c.id) && ARTS[c.id]; })[0] || D.cards[0], id = ui.slvPrev || sleeveId(), cls = id !== 'sin' ? ' slv-' + id : '';
    return '<div class="slvdemo' + cls + '"><div class="slvback"><span>' + ic('cartas') + '</span></div><div class="slvfront">' + cardHtml(sample, { lv: 1, skin: '', slv: id }) + '</div></div>';
  }
  // Lista de efectos. where: 'col' (Colección: equipar) o 'shop' (Tienda: comprar); kind: 'deploy' o 'sleeve'
  function fxItems(where, kind) {
    kind = kind || 'deploy';
    var a = ui.acct, sl = kind === 'sleeve', fi = kind === 'finish', cur = sl ? sleeveId() : fi ? finId() : deployId(), prev = sl ? 'slvprev' : fi ? 'finprev' : 'fxprev';
    return (sl ? SLEEVE_LIST : fi ? FIN_LIST : DEPLOY_LIST).filter(function (e) { return where === 'col' || (e.price > 0 && !e.pass); }).map(function (e) {
      var eq = e.id === cur, has = fxHas(e.id) || e.price === 0, btn;
      if (where === 'shop') btn = has ? '<button class="btn sec sm" disabled>' + ic('check') + ' Ya lo tienes</button>' : '<button class="btn sm" data-act="fxbuy" data-id="' + e.id + '"' + (a.coins < (a.admin ? 0 : e.price) ? ' disabled' : '') + '>Comprar · ' + (a.admin ? 'gratis' : e.price + ' ' + ic('moneda')) + '</button>';
      else btn = eq ? '' : has ? '<button class="btn sm" data-act="fxequip" data-kind="' + kind + '" data-id="' + e.id + '">Equipar</button>' : '<button class="btn sm" disabled title="Cómpralo en la tienda">' + ic('candado') + (e.pass ? ' Pase de batalla' : ' Sin comprar') + '</button>' + (e.pass ? '' : '<button class="btn sec sm" data-act="fxgoshop">Ir a la tienda</button>');
      return '<div class="fxitem' + (eq && where === 'col' ? ' eq' : '') + (has ? '' : ' nofx') + '"><div class="fxinfo"><b>' + esc(e.name) + (eq && where === 'col' ? ' <span class="fxbadge">' + ic('check') + ' Equipado</span>' : '') + (has || e.price === 0 ? '' : e.pass ? ' <span class="fxprice">Pase de batalla</span>' : ' <span class="fxprice">' + e.price + ' ' + ic('moneda') + '</span>') + '</b><span class="mut">' + esc(e.desc) + '</span></div><div class="fxbtns"><button class="btn sec sm" data-act="' + prev + '" data-id="' + e.id + '">' + ic('ojo') + ' Probar</button>' + btn + '</div></div>';
    }).join('');
  }
  function effectsTab() {
    var sec = ui.fxSec === 'sleeve' || ui.fxSec === 'finish' ? ui.fxSec : 'deploy';
    var nav = '<nav class="fxnav"><button class="' + (sec === 'deploy' ? 'on' : '') + '" data-act="fxsec" data-t="deploy">Despliegues</button><button class="' + (sec === 'sleeve' ? 'on' : '') + '" data-act="fxsec" data-t="sleeve">Fundas</button><button class="' + (sec === 'finish' ? 'on' : '') + '" data-act="fxsec" data-t="finish">Victoria y derrota</button></nav>';
    if (sec === 'finish') return '<div class="fxlayout">' + nav + '<div class="fxmain"><h2 class="dedh">Victoria y derrota</h2><p class="mut colhint">Cada pack incluye la animación de victoria y la de derrota, con su banner y efectos. Pulsa «Probar» para ver las dos.</p><div class="fxlist">' + fxItems('col', 'finish') + '</div></div></div>' + finPrevHtml();
    if (sec === 'sleeve') return '<div class="fxlayout">' + nav + '<div class="fxmain"><h2 class="dedh">Fundas</h2><p class="mut colhint">Cambian el borde de tus cartas en la partida y el reverso al abrir sobres. Pulsa «Probar» para verlas.</p>' +
      slvDemo() + '<div class="fxlist">' + fxItems('col', 'sleeve') + '</div></div></div>';
    return '<div class="fxlayout">' + nav + '<div class="fxmain"><h2 class="dedh">Despliegues</h2><p class="mut colhint">Así aparecen tus cartas en la mesa al jugarlas. Los demás jugadores ven el efecto que tengas equipado.</p>' +
      fxDemo() + '<div class="fxlist">' + fxItems('col', 'deploy') + '</div></div></div>';
  }
  function runFlights() {
    var L = ui.fl; ui.fl = [];
    if (!L || !L.length) return;
    var end = 0;
    L.forEach(function (f) {
      var t = app.querySelector('.card[data-cuid="' + f.uid + '"][data-side="' + f.side + '"]'); if (!t) return;
      var r = t.getBoundingClientRect(); if (!r.width) return;
      var wrap = document.createElement('div'); wrap.className = 'flyc'; wrap.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
      var cl = t.cloneNode(true); cl.classList.remove('dealwait', 'sel', 'tgtable'); ['data-cuid', 'data-act', 'data-side'].forEach(function (a) { cl.removeAttribute(a); });
      wrap.appendChild(cl); wrap.style.visibility = 'hidden'; document.body.appendChild(wrap);
      snd('deploy', f.delay);
      var anim = (DEPLOY_FX[deployId()] || DEPLOY_FX.default)(wrap, r, f.delay, deployMeta().ms);
      anim.onfinish = function () {
        wrap.remove();
        var real = app.querySelector('.card[data-cuid="' + f.uid + '"][data-side="' + f.side + '"]');
        if (real) { real.classList.remove('dealwait'); real.classList.add('landed'); }
        delete ui.hideUntil[f.side + ':' + f.uid];
      };
      wrap.style.visibility = '';
      end = Math.max(end, Date.now() + f.delay + deployMeta().ms);
    });
    ui.flyUntil = Math.max(ui.flyUntil || 0, end);
  }
  function clearFlights() { document.querySelectorAll('.flyc').forEach(function (n) { n.remove(); }); }

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
  var FXICON = { pereza: 'sofa', duo: 'duo', novia: 'corazon', eriko: 'corazon', lucia: 'ojo', pueblo: 'pueblo', nini: 'sofa', voley: 'voley', comeback: 'fuego', tilt: 'enfado', koi: 'trofeo', trabajo: 'maletin', gorb: 'dado', gambling: 'dado', malaracha: 'dado', colega: 'dado' };
  // Gambling: ruleta de casino (una sola tirada) que termina mostrando el total de mejora de todas las orbes
  function gamWheelSvg(win, total) {
    var N = 24, step = 360 / N, h = '', k, hi = Math.max(3, total + 2), vals = [];
    function pt(r, a) { var t = (a - 90) * Math.PI / 180; return (200 + r * Math.cos(t)).toFixed(2) + ' ' + (200 + r * Math.sin(t)).toFixed(2); }
    for (k = 0; k < N; k++) { var v; if (k === win) v = total; else { do { v = 1 + Math.floor(Math.random() * hi); } while (v === total); } vals.push(v); }
    h += '<circle cx="200" cy="200" r="178" fill="#0b1226" stroke="#d9b25a" stroke-width="3"/>';
    for (k = 0; k < N; k++) {
      var a0 = k * step - step / 2, a1 = k * step + step / 2, col = k % 2 ? '#a21caf' : '#16254a';
      h += '<path d="M' + pt(122, a0) + ' L' + pt(168, a0) + ' A168 168 0 0 1 ' + pt(168, a1) + ' L' + pt(122, a1) + ' A122 122 0 0 0 ' + pt(122, a0) + 'Z" fill="' + col + '" stroke="#d9b25a" stroke-width="1.4" data-k="' + k + '"/>';
      h += '<text x="200" y="' + (200 - 146) + '" transform="rotate(' + (k * step) + ' 200 200)" text-anchor="middle" dominant-baseline="middle" font-family="Georgia,serif" font-weight="700" font-size="20" fill="' + (k % 2 ? '#fff' : '#f0d58a') + '">' + vals[k] + '</text>';
    }
    h += '<circle cx="200" cy="200" r="118" fill="#0b1226" stroke="#d9b25a" stroke-width="2"/>';
    for (k = 0; k < 12; k++) h += '<path d="M' + pt(30, k * 30) + ' L' + pt(116, k * 30) + '" stroke="rgba(217,178,90,.45)" stroke-width="2"/>';
    h += '<circle cx="200" cy="200" r="86" fill="url(#gcone)" stroke="#f0d58a" stroke-width="2"/><circle cx="200" cy="200" r="30" fill="url(#gcone)" stroke="#f0d58a" stroke-width="2"/>';
    return '<svg viewBox="0 0 400 400" class="gwsvg"><defs><radialGradient id="gcone" cx="40%" cy="35%"><stop offset="0" stop-color="#fff2b8"/><stop offset=".5" stop-color="#d9a52c"/><stop offset="1" stop-color="#5a3a05"/></radialGradient></defs>' + h + '</svg>';
  }
  function gamblingRoulette(fx) {
    var old = document.getElementById('gambov'); if (old) old.remove();
    var orbs = fx.orbs || [], total = fx.total || 0, N = 24, step = 360 / N, win = Math.floor(Math.random() * N);
    var el = document.createElement('div'); el.id = 'gambov'; el.className = fx.side === 0 ? 'mine' : 'foe';
    el.innerHTML = '<div class="gcard"><div class="gt">' + (fx.side === 0 ? 'Tu Gambling' : 'Gambling rival') + ' · ' + (orbs.length ? orbs.length + (orbs.length === 1 ? ' orbe' : ' orbes') : 'sin orbes') + '</div>' +
      '<div class="rscene"><div class="rtilt"><div class="rrim"></div><div class="rwheel">' + gamWheelSvg(win, total) + '</div><div class="rball"><i></i></div><div class="rpin"></div></div></div>' +
      '<div class="rres"><b>+' + total + '</b><span>/+' + total + '</span></div>' +
      '<div class="gorbs">' + orbs.map(function (v, i) { return '<span class="gorb v' + v + '" style="--i:' + i + '">+' + v + '</span>'; }).join('') + '</div>' +
      '<div class="gtot">+' + total + '/+' + total + ' permanente a las Gambling</div></div>';
    document.body.appendChild(el);
    var wheel = el.querySelector('.rwheel'), ball = el.querySelector('.rball'), bi = ball.querySelector('i'), D = REDUCED || !wheel.animate ? 0 : 4300;
    var wf = 360 * 3 - win * step; // el bolsillo ganador termina arriba, donde cae la bola
    if (!D) { wheel.style.transform = 'rotate(' + wf + 'deg)'; el.classList.add('done'); }
    else {
      wheel.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + wf + 'deg)' }], { duration: D, fill: 'forwards', easing: 'cubic-bezier(.2,.55,.25,1)' });
      ball.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(' + (-360 * 6) + 'deg)' }], { duration: D - 250, fill: 'forwards', easing: 'cubic-bezier(.25,.5,.3,1)' });
      bi.animate([{ transform: 'translateY(-178px)', offset: 0 }, { transform: 'translateY(-178px)', offset: .55 }, { transform: 'translateY(-158px)', offset: .8 }, { transform: 'translateY(-149px)', offset: .9 }, { transform: 'translateY(-156px)', offset: .95 }, { transform: 'translateY(-154px)', offset: 1 }], { duration: D - 250, fill: 'forwards' });
      setTimeout(function () { el.classList.add('done'); var pk = el.querySelector('path[data-k="' + win + '"]'); if (pk) pk.setAttribute('class', 'rwin'); }, D);
    }
    setTimeout(function () { el.classList.add('out'); }, D + 2900); setTimeout(function () { if (el.parentNode) el.remove(); }, D + 3300);
  }
  ui.showRoulette = gamblingRoulette; // (también útil para probar la animación desde la consola)
  function fxBanner() {
    var fx = ui.playing && ui.hl && ui.hl.fx; if (!fx) return;
    if (fx.type === 'gambling') return gamblingRoulette(fx);
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
  var ROUTES = { home: 'inicio', modes: 'jugar', pvp: 'jugar', game: 'jugar', deck: 'coleccion', packs: 'tienda', profile: 'perfil', settings: 'ajustes', pass: 'pase', ladder: 'clasificacion', missions: 'misiones' };
  var ROUTE_SCREEN = { inicio: 'home', jugar: 'modes', coleccion: 'deck', mazo: 'deck', tienda: 'packs', perfil: 'profile', ajustes: 'settings', pase: 'pass', clasificacion: 'ladder', misiones: 'missions' };
  var ROUTE_TITLE = { home: 'Inicio', modes: 'Jugar', pvp: 'Jugar', game: 'Partida', deck: 'Colección', packs: 'Tienda', profile: 'Perfil', settings: 'Ajustes', pass: 'Pase de batalla', ladder: 'Clasificación', missions: 'Misiones' };
  function hashScreen() { var m = /^#\/([a-z]+)/.exec(location.hash || ''); return m && ROUTE_SCREEN[m[1]] || null; }
  function landing() { var sc = hashScreen() || 'home'; return sc; }
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
    ui.screen = sc; ui.msg = ''; window.scrollTo(0, 0); render();
  }
  // Re-pinta la colección sin que los filtros se muevan: conserva la altura de la página y el scroll
  function keepFlow(fn) {
    var H0 = document.documentElement.scrollHeight, y0 = window.scrollY;
    app.style.minHeight = ''; fn();
    var d = H0 - document.documentElement.scrollHeight;
    if (d > 0) app.style.minHeight = (app.offsetHeight + d) + 'px';
    window.scrollTo(0, y0);
  }
  function render() {
    app.style.minHeight = '';
    if (ui.genfx) return; // la animación de la Genkidama pinta el resultado al terminar
    document.body.classList.remove('shopbg');
    if (PV.wait && ui.screen !== 'pvp') pvpCancelWait();
    var f = { home: renderHome, deck: renderDeck, modes: renderModes, pvp: renderPvp, login: renderLogin, starter: renderStarter, packs: renderPacks, profile: renderProfile, settings: renderSettings, pass: renderPass, ladder: renderLadder, missions: renderMissions, boot: renderBoot }[ui.screen];
    if (f) f(); else renderGame();
    if (ui.screen !== 'game') clearFlights();
    if (ui.tut && ui.screen !== 'game') ui.tut = null;
    if (ui.tut) tutCheck(); else tutClear();
    syncHash();
    emoSync();
    if (window.CartasSocial) window.CartasSocial.sync();
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
    if (ui.playing || ui.busy || Date.now() < Math.max(ui.splashUntil || 0, ui.actNext || 0, ui.flyUntil || 0) + 250) { tutHide(); ui.tutTm = setTimeout(tutCheck, 350); return; }
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
    void el.offsetWidth; el.classList.add('show'); ui.splashUntil = Date.now() + 1500; snd(o.kind === 'end' ? 'end' : 'round');
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
  function combatSnd(prev, f) {
    var hl = f.hl; if (!hl) return;
    if (hl.fx) snd(hl.fx.type === 'heal' ? 'heal' : hl.fx.type === 'gambling' ? 'roulette' : hl.fx.type === 'gorb' ? 'orb' : 'magic');
    if (hl.dmg > 0) snd(hl.dmg >= 6 ? 'heavy' : 'hit'); else if (hl.att && hl.tgt && hl.dmg === 0) snd('miss');
    if (ui.floats.some(function (x) { return x.cls === 'pos'; })) snd('buff', 150);
    if (prev) { var cnt = function (v) { var n = 0; v.mesa.forEach(function (row) { row.forEach(function (c) { if (c) n++; }); }); return n; }; if (cnt(f.view) < cnt(prev)) snd('death', 140); }
  }
  function step() {
    if (ui.shown >= ui.frames.length) { stopPlay(); return; }
    var f = ui.frames[ui.shown++], prev = ui.view || (ui.frames[0] && ui.frames[0].view);
    ui.floats = diffFloats(prev, f); combatSnd(prev, f);
    ui.view = f.view; ui.hl = f.hl; render();
    var fxk = f.hl && f.hl.fx; timer = setTimeout(step, fxk ? (fxk.type === 'gambling' ? (REDUCED ? 3600 : 7600) : fxk.type === 'pokemon' ? 1700 : 1250) : 780);
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
  app.addEventListener('input', function (e) {
    if (e.target.id === 'slot-name') ui.slotName = e.target.value;
    var d = e.target.dataset && e.target.dataset.sfx;
    if (d && window.CartasSfx) { window.CartasSfx.set(d, e.target.value, e.target.dataset.cat); var b = e.target.parentNode.querySelector('b'); if (b) b.textContent = e.target.value + '%'; }
  });
  app.addEventListener('change', function (e) {
    var d = e.target.dataset && e.target.dataset.sfx;
    if (d && window.CartasSfx) snd(e.target.dataset.cat === 'combat' ? 'hit' : e.target.dataset.cat === 'pack' ? 'rev-Rara' : e.target.dataset.cat === 'event' ? 'round' : 'confirm');
  });
  app.addEventListener('change', function (e) { if (e.target.id === 'slot-to') ui.slotTo = +e.target.value; });
  var noClick = 0;
  function nextPending() { ui.sel = null; } // el objetivo siempre se elige a mano
  app.addEventListener('click', function (e) {
    if (Date.now() - noClick < 350 || ui.busy) return;
    var el = e.target.closest('[data-act]'); if (!el) return;
    var act = el.dataset.act, s = ui.s, P = s && s.p[0];
    if (act !== 'sfxbg') snd(SND_ACT.hasOwnProperty(act) ? SND_ACT[act] : 'click');
    if (act === 'buy' && P) { var g0 = P.gold; setTimeout(function () { snd(P.gold < g0 ? 'buy' : 'error'); }, 60); }
    if (act === 'sell' && P) { var n0 = P.hand.length + P.mesa.filter(Boolean).length; setTimeout(function () { snd(P.hand.length + P.mesa.filter(Boolean).length < n0 ? 'sell' : 'error'); }, 60); }
    if (act === 'sfxmute') { window.CartasSfx.toggleMute(); snd('confirm'); return render(); }
    if (act === 'sfxbg') { window.CartasSfx.set('bg', el.checked); return; }
    if (act === 'sfxreset') { window.CartasSfx.reset(); snd('confirm'); return render(); }
    if (act === 'sfxtest') { var tc = el.dataset.cat; snd(tc === 'ui' ? 'buy' : tc === 'combat' ? 'heavy' : tc === 'pack' ? 'rev-Épica' : 'win'); return; }
    if (ui.finPrev && act !== 'finprev' && act !== 'passfin' && act !== 'finflip' && act !== 'finclose') ui.finPrev = null;
    if (ui.dedit) { var ne = document.getElementById('de-name'); if (ne) ui.dedit.name = ne.value; }
    if (act === 'playanim') { if (el.dataset.id === 'correa') openIntro(); else if (el.dataset.id === 'v12') openIntro12(); else if (el.dataset.id === 'v13') openIntro13(); else if (el.dataset.id === 'v20') openIntro20(); return; }
    if (act === 'avedit') { ui.avEdit = !ui.avEdit; return render(); }
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
    if (act === 'qdiff') { ui.diff = +el.dataset.v | 0; try { localStorage.setItem('tcg_diff', String(ui.diff)); } catch (e) {} return renderModes(); }
    if (act === 'qopt') { if (ui.qo === el.dataset.v) return; ui.qo = el.dataset.v; ui.qfx = 'opt'; return renderModes(); }
    if (act === 'cardbuy') return api('cardBuy', { id: el.dataset.card }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); ui.msg = r.ok ? '' : (r.data.error || ''); render(); });
    if (act === 'skinbuy') return api('skinBuy', { id: el.dataset.skin }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); ui.msg = r.ok ? '' : (r.data.error || ''); render(); });
    if (act === 'skinequip') return api('skinEquip', { id: el.dataset.skin, card: el.dataset.card }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); render(); });
    if (act === 'daily') { return api('daily').then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); ui.msg = r.ok ? '' : (r.data.error || ''); render(); }); }
    if (act === 'openpack') {
      if (ui.pack) return; ui.msg = ''; var pkId = el.dataset.pack === 'anime' ? 'anime' : 'set1'; ui.pack = { cards: null, rev: [], pack: pkId }; render(); snd('shake');
      var t0 = Date.now(), pk0 = ui.pack;
      return api('open', el.dataset.inv ? { inv: 1, pack: pkId } : { pack: pkId }).then(function (r) {
        var wait = Math.max(0, 1300 - (Date.now() - t0));
        setTimeout(function () {
          if (ui.pack !== pk0) return;
          if (!r.ok) { ui.pack = null; ui.msg = (r.data && r.data.error) || 'No se pudo abrir.'; if (r.data && r.data.user) setAcct(r.data.user); return render(); }
          pk0.cards = r.data.cards; pk0.rev = r.data.cards.map(function () { return false; }); pk0.stage = 'rip'; setAcct(r.data.user); render(); snd('rip');
          setTimeout(function () { if (ui.pack === pk0) { pk0.stage = 'reveal'; render(); } }, RIP_MS(pk0));
        }, wait);
      });
    }
    if (act === 'flipcard') { var fi = +el.dataset.i; if (ui.pack && ui.pack.cards) { if (!ui.pack.rev[fi]) { var fc = CARD[ui.pack.cards[fi].id || ui.pack.cards[fi]]; snd('flip'); if (fc) snd('rev-' + fc.rarity, 120); } ui.pack.rev[fi] = true; el.classList.add('flipped'); packHint(); } return; }
    if (act === 'flipall') { if (ui.pack && ui.pack.cards) { ui.pack.rev = ui.pack.rev.map(function () { return true; }); app.querySelectorAll('.pcard').forEach(function (n, k) { setTimeout(function () { n.classList.add('flipped'); snd('flip'); }, k * 140); }); packHint(); } return; }
    if (act === 'packbg') { if (ui.pack && ui.pack.cards && ui.pack.stage === 'reveal' && ui.pack.rev.every(Boolean)) { ui.pack = null; render(); } return; }
    if (act === 'cardsub') { ui.cardSub = el.dataset.t; return render(); }
    if (act === 'shoptab') { ui.shopTab = el.dataset.t; ui.msg = ''; return render(); }
    if (act === 'shopsel') { ui.shopSel = +el.dataset.i; ui.shopTab = 'feat'; return render(); }
    if (act === 'newssel') { ui.newsSel = +el.dataset.i; ui.newsFull = false; return refreshNews(); }
    if (act === 'devchat') return openChat();
    if (act === 'newsmore') { ui.newsFull = !ui.newsFull; return refreshNews(); }
    if (act === 'setavatar') { return api('avatarSet', { card: el.dataset.card }).then(function (r) { if (r.ok) { setAcct(r.data.user); ui.msg = ''; ui.avEdit = false; } else ui.msg = (r.data && r.data.error) || 'No se pudo cambiar la foto.'; render(); }); }
    if (PLAYACTS[act]) { if (!ui.picked) return askDeck(act); ui.picked = false; }
    if (act === 'tutstart') return startTutorial();
    if (act === 'tutexit') { tutExit(); return; }
    if (ui.tut && (act === 'refresh' || act === 'freeze')) return;
    if (act === 'msclaim') { return api('missionClaim', { id: el.dataset.id }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); if (r.ok) snd('claim'); ui.msg = r.ok ? '' : (r.data.error || ''); render(); }); }
    if (act === 'mstab') { ui.msTab = el.dataset.v; return render(); }
    if (act === 'smclaim') { return api('seasonMissionClaim', { id: el.dataset.id }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); if (r.ok) snd('claim'); ui.msg = r.ok ? '' : (r.data.error || ''); render(); }); }
    if (act === 'passsel') { var tk = document.getElementById('ptrack'); ui.passScroll = tk ? tk.scrollLeft : null; ui.passSel = +el.dataset.lv; ui.passNote = ''; return render(); }
    if (act === 'passscroll') { var tk2 = document.getElementById('ptrack'); if (tk2) tk2.scrollBy({ left: +el.dataset.d * tk2.clientWidth * .8, behavior: 'smooth' }); return; }
    if (act === 'slclaim') { var lv0 = +el.dataset.lv, L0 = SS.SEASON.levels[lv0 - 1], tk3 = document.getElementById('ptrack'); ui.passScroll = tk3 ? tk3.scrollLeft : null; return api('seasonLevelClaim', { lv: lv0 }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); if (r.ok) { snd('claim'); ui.passNote = 'Recogido: ' + seasonRewardInfo(L0.reward).t; } ui.msg = r.ok ? '' : (r.data.error || ''); render(); }); }
    if (act === 'slclaimall') {
      var tk4 = document.getElementById('ptrack'); ui.passScroll = tk4 ? tk4.scrollLeft : null;
      var todo = SS.SEASON.levels.filter(function (L) { return L.lv <= seLevel() && seData().lc.indexOf(L.lv) < 0; }), got = 0;
      return todo.reduce(function (pr, L) { return pr.then(function () { return api('seasonLevelClaim', { lv: L.lv }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); if (r.ok) got++; }); }); }, Promise.resolve()).then(function () { if (got) snd('claim'); ui.passNote = got ? 'Recogidas ' + got + ' recompensas' : ''; render(); });
    }
    if (act === 'rkclaim') { return api('rankClaim', { id: el.dataset.id }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); if (r.ok) snd('claim'); ui.msg = r.ok ? '' : (r.data.error || ''); render(); }); }
    if (act === 'goinv') { ui.screen = 'deck'; ui.colTab = 'inv'; ui.dedit = null; window.scrollTo(0, 0); return render(); }
    if (act === 'boxinfo') { ui.boxInfo = !ui.boxInfo; return renderDeck(); }
    if (act === 'boxclose') { ui.box = null; return renderDeck(); }
    if (act === 'boxopen') {
      if (ui.box || !ui.acct || !ui.acct.boxes) return;
      var bx = ui.box = { stage: 'shake' }, t0 = Date.now(); ui.msg = ''; renderDeck(); snd('shake');
      return api('boxOpen').then(function (r) {
        setTimeout(function () {
          if (ui.box !== bx) return;
          var show = function () { if (ui.screen === 'deck' && (ui.colTab || '') === 'inv') renderDeck(); };
          if (!r.ok) { ui.box = null; ui.msg = (r.data && r.data.error) || 'No se pudo abrir la caja.'; if (r.data && r.data.user) setAcct(r.data.user); return show(); }
          bx.reward = r.data.reward; setAcct(r.data.user); bx.stage = 'burst'; show(); snd('lid');
          setTimeout(function () { if (ui.box === bx) { bx.stage = 'reveal'; show(); snd('rev-' + rewardInfo(bx.reward).best); } }, REDUCED ? 300 : 1900);
        }, Math.max(0, (REDUCED ? 200 : 1700) - (Date.now() - t0)));
      });
    }
    if (act === 'nav') {
      clearTimeout(timer); ui.playing = false;
      if (['missions', 'ladder', 'profile', 'pass'].indexOf(el.dataset.to) >= 0) { if (el.dataset.to === 'pass') ui.passSel = 0; ui.passNote = ''; refreshAcct(function () { if (['missions', 'ladder', 'profile', 'pass'].indexOf(ui.screen) >= 0) render(); }); }
      if (el.dataset.to === 'play') { ui.screen = 'modes'; window.scrollTo(0, 0); return render(); }
      ui.screen = el.dataset.to; ui.msg = ''; ui.avEdit = false; window.scrollTo(0, 0); return render();
    }
    if (act === 'filter') { var t = el.dataset.t, k0 = ui.filters.indexOf(t); if (k0 >= 0) ui.filters.splice(k0, 1); else ui.filters.push(t); ui.screen = 'deck'; return keepFlow(renderDeck); }
    if (act === 'filterset') { ui.filters = el.dataset.t ? [el.dataset.t] : []; ui.screen = 'deck'; return keepFlow(renderDeck); }
    if (act === 'fmode') { ui.fmode = el.dataset.m; return keepFlow(renderDeck); }
    if (act === 'group') { ui.group = el.checked; if (ui.group) ui.groupRar = false; return render(); }
    if (act === 'groupr') { ui.groupRar = el.checked; if (ui.groupRar) ui.group = false; return render(); }
    if (act === 'rarfilter') { var rr = el.dataset.r, ri = ui.rar.indexOf(rr); if (ri >= 0) ui.rar.splice(ri, 1); else ui.rar.push(rr); return keepFlow(renderDeck); }
    if (act === 'onlyowned') { ui.onlyOwned = el.checked; return render(); }
    if (act === 'sortlv') { ui.sortLv = el.checked; return render(); }
    if (act === 'introplay') { e.preventDefault(); openIntro(); return; }
    if (act === 'zoom') { e.stopPropagation(); openZoom(el.dataset.id, el.dataset.skin); return; }
    if (act === 'novtog') { e.stopPropagation(); ui.novView = ui.novView || {}; ui.novView[el.dataset.id] = !ui.novView[el.dataset.id]; var y0 = window.scrollY; renderDeck(); window.scrollTo(0, y0); return; }
    if (act === 'onlydeck') { ui.onlyDeck = el.checked; return render(); }
    if (act === 'coltab') { ui.colTab = el.dataset.t; ui.dedit = null; ui.msg = ''; ui.delAsk = null; window.scrollTo(0, 0); return render(); }
    if (act === 'shopfxsec') { ui.shopFxSec = el.dataset.t; ui.slvPrev = null; return render(); }
    if (act === 'fxsec') { ui.fxSec = el.dataset.t; ui.slvPrev = null; return renderDeck(); }
    if (act === 'passfin') { ui.finPrev = { id: el.dataset.id, win: true }; snd('win', 300); return render(); }
    if (act === 'finprev') { ui.finPrev = { id: el.dataset.id, win: true }; snd('win', 300); return ui.screen === 'packs' ? render() : renderDeck(); }
    if (act === 'finflip') { if (ui.finPrev) { ui.finPrev.win = !ui.finPrev.win; snd(ui.finPrev.win ? 'win' : 'lose', 300); } return ui.screen === 'packs' || ui.screen === 'pass' ? render() : renderDeck(); }
    if (act === 'finclose') { ui.finPrev = null; return ui.screen === 'packs' || ui.screen === 'pass' ? render() : renderDeck(); }
    if (act === 'slvprev') { ui.slvPrev = el.dataset.id; return ui.screen === 'packs' ? render() : renderDeck(); }
    if (act === 'fxgoshop') { ui.screen = 'packs'; ui.shopTab = 'fx'; window.scrollTo(0, 0); return render(); }
    if (act === 'fxbuy') { return api('fxBuy', { id: el.dataset.id }).then(function (r) { if (r.data && r.data.user) setAcct(r.data.user); ui.msg = r.ok ? '' : (r.data.error || ''); render(); }); }
    if (act === 'fxprev') return previewDeploy(el.dataset.id);
    if (act === 'passplay') return passPlay(el.dataset.id);
    if (act === 'fxequip') { return api('fxEquip', { kind: el.dataset.kind || 'deploy', id: el.dataset.id }).then(function (r) { if (r.ok) setAcct(r.data.user); ui.msg = ''; renderDeck(); }); }
    if (act === 'dkopen') { var oi = +el.dataset.i; ui.deckOpen = ui.deckOpen === oi ? null : oi; ui.delAsk = null; ui.msg = ''; return renderDeck(); }
    if (act === 'dkedit') { ui.auto = null; ui.autoNote = ''; var ei = +el.dataset.i, esl = ui.slots[ei]; ui.dedit = { i: ei, name: esl ? esl.name : 'Mazo ' + (ei + 1), ids: esl ? esl.ids.slice() : [], cover: esl ? esl.cover || '' : '', theme: '' }; ui.colTab = 'decks'; ui.msg = ''; window.scrollTo(0, 0); return render(); }
    if (act === 'dkdel') { ui.delAsk = +el.dataset.i; return renderDeck(); }
    if (act === 'dkdelno') { ui.delAsk = null; return renderDeck(); }
    if (act === 'dkdelyes') { var di = +el.dataset.i; ui.slots[di] = null; saveSlots(); ui.delAsk = null; ui.deckOpen = null; ui.msg = 'Mazo eliminado.'; return renderDeck(); }
    if (act === 'synall') { ui.synAll = !ui.synAll; var ys = window.scrollY; renderDeck(); window.scrollTo(0, ys); return; }
    if (act === 'dethm') { ui.synAll = false; ui.dedit.theme = ui.dedit.theme === el.dataset.t ? '' : el.dataset.t; var yt = window.scrollY; renderDeck(); window.scrollTo(0, yt); return; }
    if (act === 'detoggle') {
      var d0 = ui.dedit, id = el.dataset.id, k = d0.ids.indexOf(id); ui.msg = '';
      if (!owns(id)) ui.msg = 'Aún no tienes esta carta: consíguela en la tienda.';
      else if (k >= 0) d0.ids.splice(k, 1);
      else if (E.deckSize(d0.ids) + CARD[id].size <= CFG.deckBudget) d0.ids.push(id);
      else ui.msg = 'No cabe: el mazo ya está lleno de espacio.';
      var y = window.scrollY; renderDeck(); window.scrollTo(0, y); return;
    }
    if (act === 'decover') { ui.dedit.cover = el.dataset.id; var yc = window.scrollY; renderDeck(); window.scrollTo(0, yc); return; }
    if (act === 'deauto') { ui.auto = { sel: [], msg: '' }; return renderDeck(); }
    if (act === 'autoclose') { ui.auto = null; return renderDeck(); }
    if (act === 'autotog') { var at = el.dataset.t, ai = ui.auto.sel.indexOf(at); ui.auto.msg = ''; if (ai >= 0) ui.auto.sel.splice(ai, 1); else if (ui.auto.sel.length < 3) ui.auto.sel.push(at); else ui.auto.msg = 'Máximo 3 sinergias.'; return renderDeck(); }
    if (act === 'autogo') {
      var asel = ui.auto.sel.slice(); if (!asel.length) return;
      var aids = autoBuild(asel), aerr = deckErrFor(aids);
      ui.auto = null;
      if (aerr) { ui.msg = 'No he podido montar un mazo válido con tus cartas: ' + aerr; return renderDeck(); }
      ui.dedit.ids = aids; ui.msg = ''; ui.synAll = false; ui.dedit.theme = asel[0]; // se abre la primera sinergia para ver y retocar sus cartas
      var tc = asel.map(function (t) { return t + ' ' + aids.filter(function (id) { return CARD[id].type === 'tropa' && CARD[id].themes.indexOf(t) >= 0; }).length; }).join(', ');
      ui.autoNote = 'Mazo montado con ' + aids.length + ' cartas (' + E.deckSize(aids) + '/' + CFG.deckBudget + ' de espacio). Tropas por sinergia: ' + tc + '. Puedes retocarlo a mano antes de guardar.';
      return renderDeck();
    }
    if (act === 'derand') { ui.dedit.ids = E.randomDeck(Math.random, ui.acct.owned); ui.msg = ''; return renderDeck(); }
    if (act === 'declear') { ui.dedit.ids = []; ui.msg = ''; ui.autoNote = ''; return renderDeck(); }
    if (act === 'decancel') { ui.dedit = null; ui.auto = null; ui.autoNote = ''; ui.msg = ''; window.scrollTo(0, 0); return render(); }
    if (act === 'desave') {
      var dd = ui.dedit, derr = deckErrFor(dd.ids);
      if (derr) { ui.msg = derr; return renderDeck(); }
      var nm = (dd.name || '').trim().slice(0, 20) || 'Mazo ' + (dd.i + 1);
      ui.slots[dd.i] = { name: nm, ids: dd.ids.slice(), cover: dd.cover || '' }; saveSlots();
      ui.deckOpen = dd.i; ui.dedit = null; ui.msg = '«' + nm + '» guardado.'; window.scrollTo(0, 0); return render();
    }
    if (act === 'pickcancel') { ui.pick = null; return render(); }
    if (act === 'pickdeck') {
      var psl = ui.slots[+el.dataset.i]; if (!psl || !ui.pick) return;
      ui.deck = psl.ids.slice(); saveDeck(); var pa = ui.pick.act; ui.pick = null; ui.picked = true;
      var fb = document.createElement('button'); fb.dataset.act = pa; app.appendChild(fb); fb.click(); fb.remove(); ui.picked = false; return;
    }
    if (act === 'menu') { if (PV.on) { if (s && !s.over && !window.confirm('Si sales ahora pierdes la partida. ¿Salir?')) return; pvpLeaveGame(); } clearTimeout(timer); ui.playing = false; ui.screen = el.dataset.to || 'home'; return render(); }
    if (act === 'openpvp' || act === 'openrevpvp' || act === 'openrrpvp') {
      ui.botGame = false;
      if (act !== 'openrrpvp' && deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'pvp'; ui.lobby = 'pvp'; PV.mode = act === 'openrrpvp' ? 'rumble' : act === 'openrevpvp' ? 'revive' : '';
      return api('pvpPoll', {}).then(function (r) { if (r.ok && r.data.s && !r.data.s.over) return pvpBegin(r.data); ui.screen = 'pvp'; window.scrollTo(0, 0); render(); });
    }
    if (act === 'openvs4' || act === 'openrevvs4' || act === 'openrrvs4') {
      ui.botGame = false; PV.mode = act === 'openrrvs4' ? 'rumble' : act === 'openrevvs4' ? 'revive' : '';
      if (act !== 'openrrvs4' && deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'vs4'; ui.lobby = 'vs4';
      return api('vs4Poll', {}).then(function (r) {
        if (r.ok && r.data.s && !r.data.s.over) return pvpBegin(r.data);
        if (r.ok && r.data.wait) { PV.wait = { kind: 'code', code: r.data.code, players: r.data.players, host: r.data.host }; ui.screen = 'pvp'; render(); return pvpSchedule(1500); }
        ui.screen = 'pvp'; window.scrollTo(0, 0); render();
      });
    }
    if (act === 'startvs4b' || act === 'startrevvs4b' || act === 'startrrvs4b') {
      if (act !== 'startrrvs4b' && deckError()) { ui.screen = 'deck'; return render(); }
      saveDeck(); if (PV.on) pvpLeaveGame(); ui.msg = ''; PV.wait = null; PV.px = 'vs4'; ui.lobby = 'vs4'; PV.mode = act === 'startrrvs4b' ? 'rumble' : act === 'startrevvs4b' ? 'revive' : ''; ui.botGame = true;
      return api('vs4Bots', { deck: ui.deck, mode: PV.mode, diff: curDiff() }).then(pvpGot);
    }
    if (act === 'pvpsearch') { PV.wait = { kind: 'search' }; ui.msg = ''; render(); return api(PV.px + 'Search', { deck: ui.deck, mode: PV.mode, cover: curCover() }).then(pvpGot); }
    if (act === 'pvpcreate') { PV.wait = { kind: 'code', code: '' }; ui.msg = ''; render(); return api(PV.px + 'Create', { deck: ui.deck, mode: PV.mode, cover: curCover() }).then(pvpGot); }
    if (act === 'pvpjoin') { var jc = (document.getElementById('pvp-code').value || '').trim(); if (jc.length !== 5) { ui.msg = 'El código tiene 5 letras.'; return render(); } ui.msg = ''; return api(PV.px + 'Join', { deck: ui.deck, code: jc, mode: PV.mode, cover: curCover() }).then(pvpGot); }
    if (act === 'v4addbot') { return api('vs4AddBot', { deck: ui.deck, mode: PV.mode, cover: curCover() }).then(pvpGot); }
    if (act === 'v4rmbot') { return api('vs4RmBot', { deck: ui.deck, mode: PV.mode, name: el.dataset.name }).then(pvpGot); }
    if (act === 'pvpcancel') { pvpCancelWait(); return render(); }
    if (act === 'startai' || act === 'startrev') { if (deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); ui.mode = act === 'startrev' ? 'revive' : ''; return startGame(); }
    if (act === 'startrr') { ui.mode = 'rumble'; return startGame(); }
    if (act === 'play') { if (ui.mode !== 'rumble' && deckError()) { ui.screen = 'deck'; return render(); } saveDeck(); return startGame(); }
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
    if (PV.on && (PV.busy || PV.q.length) && (act === 'buy' || act === 'refresh' || act === 'freeze' || act === 'pick')) return;
    if (PV.on && (act === 'fight' || act === 'endshop' || act === 'next')) {
      if (act === 'fight' && (E.pendingTargets(s).length || (!P.mesa.some(Boolean) && E.mesaTroops(s.p[1]).length))) return;
      PV.rdy[0] = true; ui.sel = null; ui.hint = ''; pvpSend('ready'); return render();
    }
    if (act === 'fight') { if (E.fight(s) === false) return; ui.deadline = null; ui.sel = null; ui.hint = ''; return play(); }
    if (act === 'endshop') { E.endShop(s); ui.sel = null; ui.hint = ''; announce(); return render(); }
    if (act === 'next') { E.nextRound(s); ui.sel = null; ui.hint = ''; announce(); return render(); }
    if (act === 'buy') { var bi = +el.dataset.i, bc = CARD[P.offers[bi]]; if (!E.buy(s, 0, bi)) ui.hint = bc && P.gold < bc.cost ? 'No tienes oro suficiente.' : 'Tu mano está llena.'; else { ui.hint = ''; pvs('buy', [bi]); } return render(); }
    if (act === 'undo') { E.clearTargets(s, 0); pvs('clear'); ui.hint = ''; nextPending(s); return render(); }
    if (act === 'freeze') { if (PV.on) { pvpSend('freeze'); } else E.freeze(s, 0); return render(); }
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
      else if (c.target === 'none') { ui.hint = playA(i, null) ? (pvs('action', [i, null]), '') : s.err; ui.sel = null; }
      else { ui.sel = { k: 'act', i: i }; ui.hint = c.target === 'ally' ? 'Elige una tropa tuya en la mesa.' : 'Elige una tropa rival.'; }
      return render();
    }
    if (act === 'novia') {
      var nk = -1; (s.p[0].nvs || []).forEach(function (n, q) { if (n.id === el.dataset.id) nk = q; });
      if (nk < 0) return; // ya está en el hueco 5
      if (E.place(s, 0, -1 - nk, 4)) { ui.landed = s.p[0].mesa[4].uid; snd('place'); pvs('place', [-1 - nk, 4]); ui.hint = ''; } else ui.hint = 'No se puede colocar ahora.';
      ui.sel = null; if (!s.shopOpen) nextPending(s);
      return render();
    }
    if (act === 'slot') {
      ui.hint = '';
      if (ui.sel && ui.sel.k === 'hand') { var sl2 = +el.dataset.i; if (E.place(s, 0, ui.sel.i, sl2)) { ui.landed = s.p[0].mesa[sl2].uid; snd('place'); pvs('place', [ui.sel.i, sl2]); } else if (E.dupBlock(s, 0, ui.sel.i)) ui.hint = 'Ya tienes esa carta en la mesa: los duplicados solo van en la mano.'; }
      ui.sel = null;
      if (!s.shopOpen) nextPending(s);
      return render();
    }
    if (act === 'mine') {
      var uid = +el.dataset.cuid;
      if (ui.sel && ui.sel.k === 'act') { if (playA(ui.sel.i, uid)) { pvs('action', [ui.sel.i, uid]); ui.sel = null; ui.hint = ''; } else ui.hint = s.err || 'Esa acción no va sobre una tropa tuya.'; return render(); }
      if (s.shopOpen) return;
      if (ui.sel && ui.sel.k === 'mine' && ui.sel.uid === uid) { ui.sel = null; ui.hint = ''; return render(); }
      ui.sel = { k: 'mine', uid: uid }; ui.hint = 'Ahora pulsa la tropa rival a la que atacará.'; return render();
    }
    if (act === 'foe') {
      var fu = +el.dataset.cuid;
      if (ui.sel && ui.sel.k === 'act') { if (playA(ui.sel.i, fu)) { pvs('action', [ui.sel.i, fu]); ui.sel = null; ui.hint = ''; } else ui.hint = s.err || 'Esa acción no va sobre una tropa rival.'; return render(); }
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
        if (idx >= 0 && E.place(s, 0, drag.i, idx)) { ok = true; ui.landed = P.mesa[idx].uid; snd('place'); pvs('place', [drag.i, idx]); }
      } else if (c.target === 'none') { if (t.closest('#board')) { ok = playA(drag.i, null); if (ok) pvs('action', [drag.i, null]); } }
      else { var cd = t.closest('[data-cuid]'); if (cd && cd.dataset.side === (c.target === 'ally' ? '0' : '1')) { ok = playA(drag.i, +cd.dataset.cuid); if (ok) pvs('action', [drag.i, +cd.dataset.cuid]); } }
    }
    ui.sel = null; ui.hint = ok ? '' : (s.err && c && c.type !== 'tropa' ? s.err : 'No se pudo soltar ahí.');
    if (ok && !s.shopOpen) nextPending(s);
    render();
  }

  // ---------- Enlaces con el sistema de amigos (social.js) ----------
  ui.api = api; ui.ic = ic; ui.esc = esc; ui.artOk = artOk;
  ui.socPlaying = function () { return !!PV.on || ui.screen === 'game'; };
  ui.socInRoom = function () { return PV.wait && PV.wait.kind === 'code' && PV.wait.code ? { kind: PV.px === 'vs4' ? 'vs4' : 'pvp', code: PV.wait.code, mode: PV.mode || '' } : null; };
  ui.socCreateRoom = function (kind, mode) { // crea una sala con tu mazo actual y devuelve {kind, code, mode}
    if (PV.on || ui.screen === 'game') return Promise.resolve({ err: 'Termina la partida antes de invitar.' });
    if (mode !== 'rumble' && deckError()) { ui.screen = 'deck'; render(); return Promise.resolve({ err: 'Tu mazo no es válido todavía.' }); }
    saveDeck(); ui.botGame = false; PV.mode = mode || ''; PV.wait = { kind: 'code', code: '' }; PV.px = kind === 'vs4' ? 'vs4' : 'pvp'; ui.lobby = PV.px; ui.msg = ''; ui.screen = 'pvp'; render();
    return api(PV.px + 'Create', { deck: ui.deck, mode: PV.mode, cover: curCover() }).then(function (r) { pvpGot(r); return r.ok && r.data.code ? { kind: PV.px, code: r.data.code, mode: PV.mode } : { err: (r.data && r.data.error) || 'No se pudo crear la sala.' }; });
  };
  ui.socJoin = function (inv) { // unirse a la sala de una invitación
    if (PV.on || ui.screen === 'game') return 'Termina la partida antes de unirte.';
    if (inv.mode !== 'rumble' && deckError()) { ui.screen = 'deck'; render(); return 'Tu mazo no es válido todavía.'; }
    saveDeck();
    var pre = PV.wait ? api(PV.px + 'Cancel') : Promise.resolve(); // si estabas en otra sala o buscando, sales antes de entrar
    clearTimeout(PV.tm); PV.wait = null; ui.botGame = false; PV.mode = inv.mode || ''; PV.px = inv.kind === 'vs4' ? 'vs4' : 'pvp'; ui.lobby = PV.px; ui.msg = ''; ui.screen = 'pvp'; render();
    pre.then(function () { return api(PV.px + 'Join', { deck: ui.deck, code: inv.code, mode: PV.mode, cover: curCover() }); }).then(pvpGot);
    return '';
  };
  ui.cardHtml = cardHtml; window.CartasUI = ui; window.CartasRender = render; // depuración
  document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.acctw')) { var o = document.querySelector('.acctw.open'); if (o) o.classList.remove('open'); } });
  app.addEventListener('keydown', function (e) { if (e.key === 'Enter' && ui.screen === 'login' && e.target.id && e.target.id.indexOf('lg-') === 0) { var b = app.querySelector('[data-act=login],[data-act=register]'); if (b) b.click(); } });
  render();
  if (!getTok()) { ui.screen = 'login'; render(); }
  else api('me').then(function (r) {
    if (r.ok) { setAcct(r.data.user); loadLocal(); ui.screen = landing(); } else if (ui.screen === 'boot') ui.screen = 'login';
    render();
  });
})();
