// Cuentas, monedas y sobres del juego de cartas.
// Todo se guarda en Redis (Upstash). Una cuenta = nombre + PIN de 4 dígitos.
// Las monedas y la colección viven en el servidor: el navegador solo pide acciones.
const crypto = require('crypto');
const { redisConfig, redis } = require('./_redis');
const DATA = require('../public/cartas/cards.js');

const START_COINS = 150;
const PACK_COST = 50;
const PACK_SIZE = 5;
const DAILY_COINS = 30;
const GAME_COINS = { played: 10, win: 20 };
const MAX_GAME_REWARDS_PER_DAY = 15;
const MIN_GAME_SECONDS = 60;
const MIN_GAME_ROUNDS = 3;
const DUP_COINS = { 'Común': 0, 'Rara': 0, 'Épica': 0, 'Legendaria': 0 }; // las repetidas ya no dan monedas
const WEIGHTS = { 'Común': 50, 'Rara': 30, 'Épica': 15, 'Legendaria': 5 };
const TOKEN_DAYS = 30;
const MAX_FAILS = 10, BLOCK_SECONDS = 900;

const ALL = DATA.cards.concat(DATA.actions);
const BY_ID = {}; ALL.forEach((c) => { BY_ID[c.id] = c; });
// Regalo de bienvenida: el jugador elige un mazo inicial de una sinergia (+ acciones generales Comunes).
// Si la sinergia no tiene tropas Comunes se añaden dos tropas Comunes baratas para poder jugar la tienda inicial.
const STARTER_THEMES = ['Pokémon', 'Informático', 'Trabajo', 'Lol', 'Comebacker', 'KOI'];
function starterFor(theme) {
  const troops = DATA.cards.filter((c) => c.themes.includes(theme));
  const ids = troops.map((c) => c.id);
  if (!troops.some((c) => c.rarity === 'Común')) {
    DATA.cards.filter((c) => c.rarity === 'Común' && !ids.includes(c.id)).sort((x, y) => x.cost - y.cost).slice(0, 2).forEach((c) => ids.push(c.id));
  }
  return ids.concat(DATA.actions.filter((a) => a.theme === theme || (!a.theme && a.rarity === 'Común')).map((a) => a.id));
}

const uKey = (n) => `cartas:user:${n.toLowerCase()}`;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' }); // AAAA-MM-DD

function hashPin(pin, salt) { return crypto.scryptSync(String(pin), salt, 32).toString('hex'); }
function pickRarity() {
  const tot = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let r = crypto.randomInt(0, tot * 1000) / 1000;
  for (const k of Object.keys(WEIGHTS)) { r -= WEIGHTS[k]; if (r < 0) return k; }
  return 'Común';
}
function drawCard(minRarity) {
  const order = ['Común', 'Rara', 'Épica', 'Legendaria'];
  let rar = pickRarity();
  if (minRarity && order.indexOf(rar) < order.indexOf(minRarity)) rar = minRarity;
  const pool = ALL.filter((c) => c.rarity === rar);
  return pool[crypto.randomInt(0, pool.length)].id;
}
function publicUser(u) {
  return {
    name: u.name, coins: u.coins, owned: u.owned,
    dailyAvailable: u.lastDaily !== today(),
    gamesToday: u.rewardDay === today() ? u.rewardCount : 0,
    maxGamesToday: MAX_GAME_REWARDS_PER_DAY,
    packCost: isAdmin(u) ? 0 : PACK_COST, packSize: PACK_SIZE, dailyCoins: DAILY_COINS,
    ...(isAdmin(u) ? { admin: true, starters: Object.fromEntries(STARTER_THEMES.map((t) => [t, starterFor(t)])) } : {}),
  };
}
const isAdmin = (u) => String(u.name).toLowerCase() === 'admin';
async function loadUser(cfg, name) {
  const raw = await redis(cfg, ['GET', uKey(name)]);
  const u = raw ? JSON.parse(raw) : null;
  if (u && !u.c100) { u.coins = 100; u.c100 = true; await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]); } // ajuste único: todas las cuentas existentes pasan a 100 monedas
  if (u && isAdmin(u) && !u.adminView) u.owned = ALL.map((c) => c.id); // la cuenta ADMIN lo tiene todo (para pruebas), salvo en modo "vista de jugador nuevo"
  return u;
}
const saveUser = (cfg, u) => redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);

async function newSession(cfg, name) {
  const token = crypto.randomBytes(24).toString('hex');
  await redis(cfg, ['SET', `cartas:tok:${token}`, name.toLowerCase(), 'EX', TOKEN_DAYS * 86400]);
  return token;
}


// ---------- 1 vs 1 online ----------
// La partida vive en Redis (estado canónico del motor). Los clientes mandan acciones y reciben su vista (E.mirror).
const E = require('../public/cartas/engine.js');
const PVP_COINS = { played: 15, win: 40 };
const PVP_DC_MS = 60000, PVP_TTL = 7200;
const gKey = (id) => `cartas:pvp:g:${id}`;
const pKey = (n) => `cartas:pvp:user:${n.toLowerCase()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function checkDeck(u, deck) {
  if (!Array.isArray(deck) || deck.length < 3 || deck.length > 40) return 'Tu mazo no es válido.';
  const seen = new Set();
  for (const id of deck) {
    if (!BY_ID[id] || seen.has(id)) return 'Tu mazo no es válido.';
    seen.add(id);
    if (u.owned.indexOf(id) < 0) return 'Tu mazo tiene cartas que no tienes.';
  }
  if (E.deckSize(deck) > E.CFG.deckBudget) return 'Tu mazo se pasa del presupuesto.';
  if (!deck.some((id) => BY_ID[id].type === 'tropa' && BY_ID[id].rarity === 'Común')) return 'Tu mazo necesita al menos una tropa Común.';
  return '';
}
async function withLock(cfg, id, fn) {
  const key = `cartas:pvp:lk:${id}`, tok = crypto.randomBytes(6).toString('hex');
  for (let i = 0; i < 80; i++) {
    if ((await redis(cfg, ['SET', key, tok, 'NX', 'PX', '4000'])) === 'OK') {
      try { return await fn(); } finally { if ((await redis(cfg, ['GET', key])) === tok) await redis(cfg, ['DEL', key]); }
    }
    await sleep(40);
  }
  throw new Error('La partida está ocupada, reinténtalo.');
}
async function loadGame(cfg, id) {
  const raw = await redis(cfg, ['GET', gKey(id)]);
  if (!raw) return null;
  const g = JSON.parse(raw); E.revive(g.s); return g;
}
const saveGame = (cfg, g) => redis(cfg, ['SET', gKey(g.id), JSON.stringify(g), 'EX', PVP_TTL]);
function deadlineFor(g) {
  const s = g.s, now = Date.now();
  g.rdy = [false, false];
  if (s.over) g.dl = 0;
  else if (s.phase === 'prep') g.dl = now + ((s.shopOpen ? 60 : 45) + 3) * 1000;
  else g.dl = now + (14 + s.frames.length * 1.2) * 1000; // fase 'post': deja ver la animación
}
async function newPvpGame(cfg, a, b) { // a, b: { name, deck }
  if (crypto.randomInt(0, 2)) { const t = a; a = b; b = t; }
  const id = crypto.randomBytes(8).toString('hex');
  const s = E.newGame(a.deck, b.deck, crypto.randomInt(1, 2 ** 30), { pvp: true });
  const now = Date.now();
  const g = { id, names: [a.name, b.name], s, v: 1, hb: [now, now], t0: now, paid: false, rew: [null, null], ab: -1 };
  deadlineFor(g);
  await saveGame(cfg, g);
  await redis(cfg, ['SET', pKey(a.name), id, 'EX', PVP_TTL]);
  await redis(cfg, ['SET', pKey(b.name), id, 'EX', PVP_TTL]);
  return g;
}
function autoTargets(s, seat) {
  const foes = E.mesaTroops(s.p[1 - seat]);
  E.pendingTargets(s, seat).forEach((i) => { if (foes.length) E.setTarget(s, seat, i.uid, foes[Math.floor(s.rng() * foes.length)].uid); });
}
function resolveIfReady(g, forced) {
  const s = g.s;
  if (s.over) return false;
  const both = g.rdy[0] && g.rdy[1];
  if (!both && !forced) return false;
  if (s.phase === 'prep' && s.shopOpen) E.endShop(s);
  else if (s.phase === 'prep') { autoTargets(s, 0); autoTargets(s, 1); E.fight(s); }
  else if (s.phase === 'post') E.nextRound(s);
  else return false;
  deadlineFor(g); g.v++;
  return true;
}
async function tickGame(cfg, g, seat) {
  const s = g.s, now = Date.now();
  if (seat != null) g.hb[seat] = now;
  if (!s.over) {
    const other = seat == null ? -1 : 1 - seat;
    if (other >= 0 && now - g.hb[other] > PVP_DC_MS) {
      E.forfeit(s, other, E.pv(s, other, 'Te desconectaste: derrota.', 'El rival se desconectó: victoria.')); g.ab = other; g.dl = 0; g.v++;
    } else if (g.dl && now > g.dl) resolveIfReady(g, true);
  }
  if (s.over && !g.paid) await payPvp(cfg, g);
}
async function payPvp(cfg, g) {
  g.paid = true; g.v++;
  const s = g.s, valid = s.round >= MIN_GAME_ROUNDS && Date.now() - g.t0 >= MIN_GAME_SECONDS * 1000;
  for (const seat of [0, 1]) {
    const u = await loadUser(cfg, g.names[seat]); if (!u) continue;
    if (u.rewardDay !== today()) { u.rewardDay = today(); u.rewardCount = 0; }
    const won = s.winner === seat;
    let gained = 0;
    if (valid && g.ab !== seat && u.rewardCount < MAX_GAME_REWARDS_PER_DAY) {
      gained = PVP_COINS.played + (won ? PVP_COINS.win : 0); u.rewardCount++; u.coins += gained;
    }
    g.rew[seat] = { gained, capped: valid && g.ab !== seat && gained === 0 };
    await saveUser(cfg, u);
  }
}
function viewFor(g, seat) {
  const s = E.mirror(g.s, seat);
  s.acts = s.acts.filter((a) => a.p === 1); // solo lo que ha jugado el rival (lo tuyo ya lo ves)
  s.pvp = true;
  return {
    ok: true, id: g.id, v: g.v, seat, names: seat ? [g.names[1], g.names[0]] : g.names.slice(),
    rdy: seat ? [g.rdy[1], g.rdy[0]] : g.rdy.slice(), dl: g.dl ? Math.max(0, g.dl - Date.now()) : 0,
    reward: g.rew[seat], s,
  };
}
const SEAT_OPS = {
  place: (s, p, a) => E.place(s, p, +a[0], +a[1]),
  action: (s, p, a, x) => E.playAction(s, p, +a[0], a[1] == null ? null : x(a[1])),
  target: (s, p, a, x) => { E.setTarget(s, p, x(a[0]), a[1] == null ? null : x(a[1])); return true; },
  clear: (s, p) => { E.clearTargets(s, p); return true; },
  voley: (s, p, a, x) => { E.setVoley(s, p, x(a[0]), a[1] === 'def' ? 'def' : 'atk'); return true; },
  buy: (s, p, a) => E.buy(s, p, +a[0]),
  refresh: (s, p) => E.refresh(s, p),
  pick: (s, p, a) => E.pickFromDeck(s, p, String(a[0])),
  retire: (s, p, a) => E.retire(s, p, +a[0]),
  cede: (s, p, a, x) => E.cede(s, x(a[0]), x(a[1]), a[2] === 'hp' ? 'hp' : 'atk', p),
};
async function pvpHandle(cfg, act, body, u) {
  const me = u.name;
  if (act === 'pvpCreate' || act === 'pvpJoin' || act === 'pvpSearch') {
    const cur = await redis(cfg, ['GET', pKey(me)]);
    if (cur) { const g = await loadGame(cfg, cur); if (g && !g.s.over) return viewFor(g, g.names.indexOf(me)); }
    const err = checkDeck(u, body.deck); if (err) return { status: 400, error: err };
    const mine = { name: me, deck: body.deck };
    if (act === 'pvpCreate') {
      const old = await redis(cfg, ['GET', `cartas:pvp:host:${me.toLowerCase()}`]);
      if (old) await redis(cfg, ['DEL', `cartas:pvp:room:${old}`]);
      const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '';
      for (let i = 0; i < 5; i++) code += AL[crypto.randomInt(0, AL.length)];
      await redis(cfg, ['SET', `cartas:pvp:room:${code}`, JSON.stringify(mine), 'EX', 900]);
      await redis(cfg, ['SET', `cartas:pvp:host:${me.toLowerCase()}`, code, 'EX', 900]);
      return { ok: true, wait: true, code };
    }
    if (act === 'pvpJoin') {
      const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const raw = code.length === 5 ? await redis(cfg, ['GET', `cartas:pvp:room:${code}`]) : null;
      if (!raw) return { status: 404, error: 'Ese código no existe o ha caducado.' };
      const host = JSON.parse(raw);
      if (host.name.toLowerCase() === me.toLowerCase()) return { status: 400, error: 'Es tu propia sala: pásale el código a tu rival.' };
      if ((await redis(cfg, ['GETDEL', `cartas:pvp:room:${code}`])) == null) return { status: 404, error: 'Ese código ya se ha usado.' };
      await redis(cfg, ['DEL', `cartas:pvp:host:${host.name.toLowerCase()}`]);
      const g = await newPvpGame(cfg, host, mine);
      return viewFor(g, g.names.indexOf(me));
    }
    // búsqueda automática: se empareja con quien esté esperando
    const raw = await redis(cfg, ['GETDEL', 'cartas:pvp:q']);
    if (raw) {
      const o = JSON.parse(raw);
      if (o.name.toLowerCase() !== me.toLowerCase() && Date.now() - o.t < 12000) {
        const g = await newPvpGame(cfg, o, mine);
        return viewFor(g, g.names.indexOf(me));
      }
    }
    await redis(cfg, ['SET', 'cartas:pvp:q', JSON.stringify({ ...mine, t: Date.now() }), 'EX', 15]);
    return { ok: true, wait: true };
  }
  if (act === 'pvpCancel') {
    const code = await redis(cfg, ['GET', `cartas:pvp:host:${me.toLowerCase()}`]);
    if (code) { await redis(cfg, ['DEL', `cartas:pvp:room:${code}`]); await redis(cfg, ['DEL', `cartas:pvp:host:${me.toLowerCase()}`]); }
    const q = await redis(cfg, ['GET', 'cartas:pvp:q']);
    if (q && JSON.parse(q).name.toLowerCase() === me.toLowerCase()) await redis(cfg, ['DEL', 'cartas:pvp:q']);
    return { ok: true };
  }
  // ---- con partida ----
  const gid = String(body.id || (await redis(cfg, ['GET', pKey(me)])) || '');
  if (!/^[0-9a-f]{16}$/.test(gid)) return { ok: true, none: true };
  return withLock(cfg, gid, async () => {
    const g = await loadGame(cfg, gid);
    if (!g) { await redis(cfg, ['DEL', pKey(me)]); return { ok: true, none: true }; }
    const seat = g.names.findIndex((n) => n.toLowerCase() === me.toLowerCase());
    if (seat < 0) return { status: 403, error: 'Esa partida no es tuya.' };
    const s = g.s, v0 = g.v;
    let hint = '';
    if (act === 'pvpLeave') {
      if (!s.over) { E.forfeit(s, seat, E.pv(s, seat, 'Abandonaste la partida: derrota.', 'El rival abandonó: victoria.')); g.ab = seat; g.dl = 0; g.v++; }
    } else if (act === 'pvpOp' && !s.over) {
      const op = String(body.op || ''), a = Array.isArray(body.a) ? body.a : [];
      const x = (n) => (seat === 1 && typeof n === 'number' ? n ^ 1 : n); // uid de su vista -> canónico
      if (op === 'ready') {
        if (g.rdy[seat]) { /* ya estaba */ }
        else if (s.phase === 'prep' && !s.shopOpen && E.pendingTargets(s, seat).length) hint = 'Elige objetivo para todas tus tropas.';
        else { g.rdy[seat] = true; g.v++; resolveIfReady(g, false); }
      } else if (SEAT_OPS[op] && !g.rdy[seat]) {
        s.err = '';
        const ok = SEAT_OPS[op](s, seat, a, x);
        if (ok === false) hint = s.err || 'No se puede.';
        g.v++;
      }
    }
    await tickGame(cfg, g, seat);
    if (g.s.over && !g.paid) await payPvp(cfg, g);
    const changed = g.v !== v0;
    await saveGame(cfg, g);
    if (act === 'pvpPoll' && !changed && Number(body.v) === g.v) return { ok: true, same: true, dl: g.dl ? Math.max(0, g.dl - Date.now()) : 0, rdy: seat ? [g.rdy[1], g.rdy[0]] : g.rdy.slice() };
    const out = viewFor(g, seat); if (hint) out.hint = hint;
    return out;
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método no permitido.' }); return; }
  const cfg = redisConfig();
  if (!cfg) { res.status(500).json({ error: 'Falta conectar la base de datos (Upstash Redis) al proyecto en Vercel.' }); return; }
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
  const act = String(body.action || '');

  try {
    // ---- Cuenta ----
    if (act === 'register' || act === 'login') {
      const name = String(body.name || '').replace(/\s+/g, ' ').trim();
      const pin = String(body.pin || '').trim();
      if (!/^[\p{L}\p{N} _-]{3,16}$/u.test(name)) { res.status(400).json({ error: 'El nombre debe tener entre 3 y 16 letras, números, espacios, _ o -.' }); return; }
      if (!/^\d{4}$/.test(pin)) { res.status(400).json({ error: 'El PIN son 4 dígitos.' }); return; }
      const failKey = `cartas:fail:${name.toLowerCase()}`;
      if (act === 'register') {
        const starter = String(body.starter || '');
        if (!STARTER_THEMES.includes(starter) && name.toLowerCase() !== 'admin') { res.status(400).json({ error: 'Elige un mazo inicial.' }); return; }
        if (await loadUser(cfg, name)) { res.status(409).json({ error: 'Ese nombre ya está cogido.' }); return; }
        const salt = crypto.randomBytes(16).toString('hex');
        const u = { name, salt, hash: hashPin(pin, salt), coins: START_COINS, owned: starterFor(STARTER_THEMES.includes(starter) ? starter : STARTER_THEMES[0]), lastDaily: '', rewardDay: '', rewardCount: 0, startedAt: 0, c100: true, createdAt: Date.now() };
        if (isAdmin(u)) u.owned = ALL.map((c) => c.id);
        await saveUser(cfg, u);
        res.status(200).json({ token: await newSession(cfg, name), user: publicUser(u) });
        return;
      }
      const fails = Number((await redis(cfg, ['GET', failKey])) || 0);
      if (fails >= MAX_FAILS) { res.status(429).json({ error: 'Demasiados intentos. Espera unos 15 minutos.' }); return; }
      const u = await loadUser(cfg, name);
      const ok = u && crypto.timingSafeEqual(Buffer.from(hashPin(pin, u.salt)), Buffer.from(u.hash));
      if (!ok) {
        await redis(cfg, ['INCR', failKey]); await redis(cfg, ['EXPIRE', failKey, BLOCK_SECONDS]);
        res.status(401).json({ error: 'Nombre o PIN incorrectos.' }); return;
      }
      res.status(200).json({ token: await newSession(cfg, u.name), user: publicUser(u) });
      return;
    }

    // ---- Con sesión ----
    const token = String(req.headers['x-token'] || '');
    const lname = /^[0-9a-f]{48}$/.test(token) ? await redis(cfg, ['GET', `cartas:tok:${token}`]) : null;
    const u = lname ? await loadUser(cfg, lname) : null;
    if (!u) { res.status(401).json({ error: 'Sesión caducada. Entra de nuevo.', login: true }); return; }

    if (act === 'adminstarter' || act === 'adminall') {
      if (!isAdmin(u)) { res.status(403).json({ error: 'Solo para la cuenta ADMIN.' }); return; }
      const th = String(body.starter || '');
      if (act === 'adminstarter') {
        if (!STARTER_THEMES.includes(th)) { res.status(400).json({ error: 'Mazo inicial no válido.' }); return; }
        u.adminView = true; u.owned = starterFor(th); u.coins = START_COINS;
      } else { u.adminView = false; u.owned = ALL.map((c) => c.id); }
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act.startsWith('pvp')) {
      const r = await pvpHandle(cfg, act, body, u);
      if (r.status) { res.status(r.status).json({ error: r.error }); return; }
      res.status(200).json(r); return;
    }
    if (act === 'me') { res.status(200).json({ user: publicUser(u) }); return; }

    if (act === 'daily') {
      if (u.lastDaily === today()) { res.status(409).json({ error: 'Ya has cobrado la recompensa de hoy.', user: publicUser(u) }); return; }
      u.lastDaily = today(); u.coins += DAILY_COINS;
      await saveUser(cfg, u);
      res.status(200).json({ gained: DAILY_COINS, user: publicUser(u) }); return;
    }

    if (act === 'open') {
      const cost = isAdmin(u) ? 0 : PACK_COST;
      if (u.coins < cost) { res.status(402).json({ error: `Necesitas ${PACK_COST} monedas.`, user: publicUser(u) }); return; }
      u.coins -= cost;
      const ids = [];
      for (let k = 0; k < PACK_SIZE; k++) ids.push(drawCard(k === PACK_SIZE - 1 ? 'Rara' : null)); // la última es Rara o mejor
      const cards = ids.map((id) => {
        const isNew = u.owned.indexOf(id) < 0;
        let dup = 0;
        if (isNew) u.owned.push(id); else { dup = DUP_COINS[BY_ID[id].rarity]; u.coins += dup; }
        return { id, isNew, dupCoins: dup };
      });
      await saveUser(cfg, u);
      res.status(200).json({ cards, user: publicUser(u) }); return;
    }

    if (act === 'gameStart') { u.startedAt = Date.now(); await saveUser(cfg, u); res.status(200).json({ ok: true }); return; }

    if (act === 'gameFinish') {
      const secs = (Date.now() - (u.startedAt || 0)) / 1000;
      const rounds = Number(body.rounds) || 0;
      const valid = u.startedAt && secs >= MIN_GAME_SECONDS && rounds >= MIN_GAME_ROUNDS;
      u.startedAt = 0;
      if (u.rewardDay !== today()) { u.rewardDay = today(); u.rewardCount = 0; }
      let gained = 0;
      if (valid && u.rewardCount < MAX_GAME_REWARDS_PER_DAY) {
        gained = GAME_COINS.played + (body.won ? GAME_COINS.win : 0);
        u.rewardCount++; u.coins += gained;
      }
      await saveUser(cfg, u);
      res.status(200).json({ gained, user: publicUser(u), capped: valid && gained === 0 }); return;
    }

    res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error del servidor.' });
  }
};
