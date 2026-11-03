/* Amigos: lista a la derecha, solicitudes, estado (en línea / en partida / desconectado), chat e invitaciones a partida. */
(function () {
  'use strict';
  var ui = window.CartasUI;
  if (!ui) return;
  var esc = ui.esc, ic = ui.ic;
  var SOC = { friends: [], inc: [], out: [], invs: [], loaded: false, chat: '', msgs: [], q: '', res: null, add: false, invMenu: '', toast: '', toastT: null, tm: null, searchT: null, openPref: null, openGame: false, polling: false, seen: {} };
  var root, tab, chatEl;

  function pref() { try { var v = localStorage.getItem('cartas_soc_open'); return v === null ? null : v === '1'; } catch (e) { return null; } }
  function setPref(v) { SOC.openPref = v; try { localStorage.setItem('cartas_soc_open', v ? '1' : '0'); } catch (e) {} }
  function isOpen() {
    if (ui.screen === 'game') return SOC.openGame;
    var p = SOC.openPref === null ? pref() : SOC.openPref;
    return p === null ? window.innerWidth >= 1250 : p;
  }
  function logged() { return !!ui.acct && ui.screen !== 'login' && ui.screen !== 'boot' && ui.screen !== 'starter'; }

  function avatar(f, st) {
    var ok = f.avatar && ui.artOk(f.avatar);
    return '<span class="fav' + (ok ? ' has' : '') + '"' + (ok ? ' style="background-image:url(/cartas/art/' + esc(f.avatar) + '.webp)"' : '') + '>' + (ok ? '' : ic('usuario')) + (st ? '<i class="fdot ' + st + '"></i>' : '') + '</span>';
  }
  var STXT = { on: 'En línea', play: 'En partida', off: 'Desconectado' };

  function build() {
    if (root) return;
    root = document.createElement('aside'); root.id = 'soc'; root.setAttribute('aria-label', 'Amigos');
    root.innerHTML = '<div class="shead"><b>Social</b><span class="sgrow"></span><button class="sbtn" data-soc="addtog" title="Añadir amigo" aria-label="Añadir amigo">+</button><button class="sbtn" data-soc="close" title="Ocultar" aria-label="Ocultar la lista de amigos">»</button></div>' +
      '<div class="ssearch" hidden><input id="soc-q" maxlength="16" autocomplete="off" placeholder="Buscar jugador por nombre…"><div class="sres"></div></div>' +
      '<div class="sinv"></div><div class="slist"></div><div class="stoast"></div>';
    document.body.appendChild(root);
    tab = document.createElement('button'); tab.id = 'soctab'; tab.setAttribute('data-soc', 'open'); tab.setAttribute('aria-label', 'Abrir lista de amigos'); tab.hidden = true;
    document.body.appendChild(tab);
    chatEl = document.createElement('div'); chatEl.id = 'socchat'; chatEl.hidden = true;
    chatEl.innerHTML = '<div class="chead"></div><div class="cmsgs"></div><div class="cform"><input id="soc-ci" maxlength="300" autocomplete="off" placeholder="Escribe un mensaje…"><button class="sbtn go" data-soc="send">Enviar</button></div>';
    document.body.appendChild(chatEl);
    [root, tab, chatEl].forEach(function (el) { el.addEventListener('click', onClick); });
    root.querySelector('#soc-q').addEventListener('input', function (e) {
      SOC.q = e.target.value; clearTimeout(SOC.searchT);
      if (SOC.q.trim().length < 2) { SOC.res = null; drawSearch(); return; }
      SOC.searchT = setTimeout(function () { ui.api('socSearch', { q: SOC.q }).then(function (r) { if (r.ok && SOC.q === e.target.value) { SOC.res = r.data.res || []; drawSearch(); } }); }, 300);
    });
    chatEl.querySelector('#soc-ci').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  }

  function toast(t) { SOC.toast = t; draw(); clearTimeout(SOC.toastT); SOC.toastT = setTimeout(function () { SOC.toast = ''; draw(); }, 3500); }
  function fmtT(t) { var d = new Date(t); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }

  // ---------- Dibujo ----------
  function row(f) {
    var menu = SOC.invMenu === f.name;
    var online = f.st !== 'off';
    return '<div class="frow ' + f.st + (SOC.chat === f.name ? ' sel' : '') + '" data-soc="chat" data-n="' + esc(f.name) + '" tabindex="0">' + avatar(f, f.st) +
      '<div class="ftx"><b>' + esc(f.name) + '</b><span class="fst ' + f.st + '">' + STXT[f.st] + '</span></div>' +
      (f.unread ? '<span class="fbadge">' + (f.unread > 9 ? '9+' : f.unread) + '</span>' : '') +
      '<div class="fact">' + (online ? '<button class="sbtn" data-soc="invite" data-n="' + esc(f.name) + '" title="Invitar a partida" aria-label="Invitar a partida">' + ic('espadas') + '</button>' : '') +
      '<button class="sbtn" data-soc="remove" data-n="' + esc(f.name) + '" title="Eliminar amigo" aria-label="Eliminar amigo">' + ic('papelera') + '</button></div>' +
      (menu ? '<div class="fmenu"><span>Invitar a:</span><button class="sbtn go" data-soc="invk" data-k="pvp" data-n="' + esc(f.name) + '">1 contra 1</button><button class="sbtn go" data-soc="invk" data-k="vs4" data-n="' + esc(f.name) + '">Versus de 4</button></div>' : '') + '</div>';
  }
  function section(title, n, body, cls) { return n || body ? '<div class="ssec ' + (cls || '') + '"><h4>' + title + (n != null ? ' <i>' + n + '</i>' : '') + '</h4>' + body + '</div>' : ''; }
  function draw() {
    if (!root) return;
    var on = SOC.friends.filter(function (f) { return f.st !== 'off'; }), off = SOC.friends.filter(function (f) { return f.st === 'off'; });
    var order = { play: 1, on: 0 };
    on.sort(function (a, b) { return order[a.st] - order[b.st] || a.name.localeCompare(b.name); });
    off.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var inc = SOC.inc.map(function (p) { return '<div class="frow req">' + avatar(p, '') + '<div class="ftx"><b>' + esc(p.name) + '</b><span class="fst">Quiere ser tu amigo</span></div><div class="fact on"><button class="sbtn go" data-soc="accept" data-n="' + esc(p.name) + '" title="Aceptar" aria-label="Aceptar">' + ic('check') + '</button><button class="sbtn" data-soc="decline" data-n="' + esc(p.name) + '" title="Rechazar" aria-label="Rechazar">×</button></div></div>'; }).join('');
    var out = SOC.out.map(function (n) { return '<div class="frow req out"><span class="fav"></span><div class="ftx"><b>' + esc(n) + '</b><span class="fst">Solicitud enviada</span></div><div class="fact on"><button class="sbtn" data-soc="cancel" data-n="' + esc(n) + '" title="Cancelar solicitud" aria-label="Cancelar solicitud">×</button></div></div>'; }).join('');
    var h = section('Solicitudes', SOC.inc.length || null, inc, 'req') + section('Enviadas', SOC.out.length || null, out, 'req') +
      section('Conectados', on.length, on.map(row).join('')) + section('Desconectados', off.length, off.map(row).join(''));
    if (SOC.loaded && !SOC.friends.length && !SOC.inc.length && !SOC.out.length) h = '<p class="sempty">Aún no tienes amigos. Pulsa <b>+</b> para buscar a un jugador y enviarle una solicitud.</p>';
    if (!SOC.loaded) h = '<p class="sempty">Cargando…</p>';
    root.querySelector('.slist').innerHTML = h;
    root.querySelector('.sinv').innerHTML = SOC.invs.map(function (i) {
      return '<div class="sinvc"><b>' + esc(i.from) + '</b> te invita a ' + (i.kind === 'vs4' ? 'un Versus de 4' : 'una partida 1 contra 1') + (i.mode === 'rumble' ? ' (Royal Rumble)' : i.mode === 'revive' ? ' (Resurrección)' : '') + '<div><button class="sbtn go" data-soc="invyes" data-id="' + esc(i.id) + '">Aceptar</button><button class="sbtn" data-soc="invno" data-id="' + esc(i.id) + '">Rechazar</button></div></div>';
    }).join('');
    root.querySelector('.stoast').textContent = SOC.toast; root.querySelector('.stoast').classList.toggle('on', !!SOC.toast);
    drawTab();
  }
  function drawSearch() {
    var box = root.querySelector('.sres'), q = SOC.q.trim();
    box.innerHTML = SOC.res === null ? (q.length ? '<p class="sempty">Escribe al menos 2 letras.</p>' : '') : !SOC.res.length ? '<p class="sempty">Nadie se llama así.</p>' :
      SOC.res.map(function (p) {
        var btn = p.rel === 'friend' ? '<span class="fst">Ya sois amigos</span>' : p.rel === 'sent' ? '<span class="fst">Enviada</span>' : p.rel === 'recv' ? '<button class="sbtn go" data-soc="accept" data-n="' + esc(p.name) + '">Aceptar</button>' : '<button class="sbtn go" data-soc="add" data-n="' + esc(p.name) + '">Añadir</button>';
        return '<div class="frow res">' + avatar(p, '') + '<div class="ftx"><b>' + esc(p.name) + '</b></div><div class="fact on">' + btn + '</div></div>';
      }).join('');
  }
  function drawTab() {
    var n = SOC.friends.filter(function (f) { return f.st !== 'off'; }).length, un = SOC.friends.reduce(function (a, f) { return a + f.unread; }, 0) + SOC.inc.length + SOC.invs.length;
    tab.innerHTML = ic('grupo') + '<b>' + n + '</b>' + (un ? '<i class="fbadge">' + (un > 9 ? '9+' : un) + '</i>' : '');
  }
  function drawChat() {
    if (!SOC.chat) { chatEl.hidden = true; return; }
    var f = SOC.friends.filter(function (x) { return x.name === SOC.chat; })[0] || { name: SOC.chat, avatar: '', st: 'off' };
    chatEl.hidden = !isOpen();
    chatEl.querySelector('.chead').innerHTML = avatar(f, f.st) + '<div class="ftx"><b>' + esc(f.name) + '</b><span class="fst ' + f.st + '">' + STXT[f.st] + '</span></div><button class="sbtn" data-soc="chatx" aria-label="Cerrar chat">×</button>';
    var me = ui.acct.name.toLowerCase(), box = chatEl.querySelector('.cmsgs'), near = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    box.innerHTML = SOC.msgs.length ? SOC.msgs.map(function (m) { return '<div class="cm ' + (m.f.toLowerCase() === me ? 'me' : 'them') + '"><span>' + esc(m.x) + '</span><i>' + fmtT(m.t) + '</i></div>'; }).join('') : '<p class="sempty">Aún no habéis hablado. ¡Saluda!</p>';
    if (near || SOC.stick) { box.scrollTop = box.scrollHeight; SOC.stick = false; }
  }
  function layout() {
    if (!root) return;
    var show = logged(), open = show && isOpen();
    root.classList.toggle('open', open); root.hidden = !show;
    tab.hidden = !show || open;
    document.body.classList.toggle('soc-open', open);
    if (!show) { chatEl.hidden = true; return; }
    chatEl.hidden = !(SOC.chat && open);
  }

  // ---------- Red ----------
  function schedule() { clearTimeout(SOC.tm); if (!logged()) { SOC.polling = false; return; } SOC.tm = setTimeout(poll, SOC.chat && isOpen() ? 3000 : document.hidden ? 20000 : 9000); }
  function poll() {
    if (!logged()) { SOC.polling = false; return; }
    ui.api('socPoll', { playing: ui.socPlaying(), chat: isOpen() ? SOC.chat : '' }).then(function (r) {
      if (r.ok) {
        var d = r.data; SOC.friends = d.friends || []; SOC.inc = d.inc || []; SOC.out = d.out || []; SOC.loaded = true;
        var fresh = (d.invs || []).filter(function (i) { return !SOC.seen[i.id]; });
        fresh.forEach(function (i) { SOC.seen[i.id] = 1; });
        SOC.invs = d.invs || [];
        var rel = JSON.stringify(SOC.friends.map(function (f) { return f.name; }).concat(SOC.out, SOC.inc.map(function (p) { return p.name; })));
        if (rel !== SOC.relKey) { SOC.relKey = rel; if (SOC.res) refreshSearch(); }
        if (d.chat && d.chat.with === SOC.chat) { var changed = JSON.stringify(d.chat.msgs) !== JSON.stringify(SOC.msgs); SOC.msgs = d.chat.msgs; if (changed) drawChat(); SOC.friends.forEach(function (f) { if (f.name === SOC.chat) f.unread = 0; }); }
        draw(); drawChat();
        if (fresh.length) try { if (window.CartasSfx) window.CartasSfx.play('nav'); } catch (e) {}
      }
      schedule();
    });
  }
  function startPoll() { if (SOC.polling) return; SOC.polling = true; poll(); }
  function doRel(act, name, okMsg) { return ui.api(act, { name: name }).then(function (r) { if (!r.ok) toast((r.data && r.data.error) || 'No se pudo.'); else if (okMsg || r.data.msg) toast(okMsg || r.data.msg); clearTimeout(SOC.tm); poll(); if (SOC.res) refreshSearch(); }); }
  function refreshSearch() { var q = SOC.q; if (q.trim().length < 2) return; ui.api('socSearch', { q: q }).then(function (r) { if (r.ok) { SOC.res = r.data.res || []; drawSearch(); } }); }
  function openChat(name) {
    SOC.chat = name; SOC.msgs = []; SOC.stick = true; SOC.friends.forEach(function (f) { if (f.name === name) f.unread = 0; });
    draw(); drawChat(); layout(); clearTimeout(SOC.tm); poll();
    setTimeout(function () { var i = chatEl.querySelector('#soc-ci'); if (i && !chatEl.hidden) i.focus(); }, 50);
  }
  function send() {
    var inp = chatEl.querySelector('#soc-ci'), t = inp.value.trim(); if (!t || !SOC.chat) return;
    inp.value = '';
    SOC.msgs = SOC.msgs.concat([{ f: ui.acct.name, t: Date.now(), x: t }]); SOC.stick = true; drawChat();
    ui.api('socSend', { to: SOC.chat, text: t }).then(function (r) { if (!r.ok) toast((r.data && r.data.error) || 'No se pudo enviar.'); clearTimeout(SOC.tm); poll(); });
  }
  function sendInvite(name, room) {
    return ui.api('socInvite', { to: name, kind: room.kind, code: room.code, mode: room.mode }).then(function (r) { toast(r.ok ? (r.data.msg || 'Invitación enviada.') : ((r.data && r.data.error) || 'No se pudo invitar.')); });
  }

  function onClick(e) {
    var t = e.target.closest('[data-soc]'); if (!t) return;
    var a = t.dataset.soc, n = t.dataset.n;
    if (a === 'chat') { if (e.target.closest('.fact') || e.target.closest('.fmenu')) return; return openChat(n); }
    e.stopPropagation();
    if (a === 'open') { if (ui.screen === 'game') SOC.openGame = true; else setPref(true); layout(); drawChat(); return; }
    if (a === 'close') { if (ui.screen === 'game') SOC.openGame = false; else setPref(false); layout(); return; }
    if (a === 'addtog') { SOC.add = !SOC.add; var box = root.querySelector('.ssearch'); box.hidden = !SOC.add; if (SOC.add) root.querySelector('#soc-q').focus(); return; }
    if (a === 'add') return doRel('socAdd', n);
    if (a === 'accept') return doRel('socAccept', n);
    if (a === 'decline') return doRel('socDecline', n);
    if (a === 'cancel') return doRel('socCancel', n);
    if (a === 'remove') { if (!window.confirm('¿Eliminar a ' + n + ' de tus amigos?')) return; if (SOC.chat === n) { SOC.chat = ''; layout(); } return doRel('socRemove', n); }
    if (a === 'chatx') { SOC.chat = ''; SOC.msgs = []; layout(); return; }
    if (a === 'send') return send();
    if (a === 'invite') {
      var room = ui.socInRoom();
      if (room) return sendInvite(n, room);
      SOC.invMenu = SOC.invMenu === n ? '' : n; draw(); return;
    }
    if (a === 'invk') {
      SOC.invMenu = ''; draw();
      return ui.socCreateRoom(t.dataset.k, '').then(function (res) { if (res && res.err) return toast(res.err); if (res) return sendInvite(n, res); });
    }
    if (a === 'invyes' || a === 'invno') {
      var id = t.dataset.id, yes = a === 'invyes';
      return ui.api('socInvAns', { id: id, accept: yes }).then(function (r) {
        SOC.invs = SOC.invs.filter(function (i) { return i.id !== id; }); draw();
        if (yes) { var inv = r.ok && r.data.inv; if (!inv) return toast('La invitación ha caducado.'); var err = ui.socJoin(inv); if (err) toast(err); }
      });
    }
  }

  // ---------- Enlace con el juego ----------
  function sync() {
    build();
    layout();
    if (logged()) { startPoll(); if (!root.querySelector('.slist').innerHTML) draw(); drawChat(); }
    else if (!ui.acct) { SOC.friends = []; SOC.inc = []; SOC.out = []; SOC.invs = []; SOC.loaded = false; SOC.chat = ''; SOC.msgs = []; SOC.res = null; SOC.seen = {}; clearTimeout(SOC.tm); SOC.polling = false; }
  }
  window.addEventListener('resize', function () { layout(); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden && logged()) { clearTimeout(SOC.tm); poll(); } });
  window.CartasSocial = { sync: sync, state: SOC };
  sync();
})();
