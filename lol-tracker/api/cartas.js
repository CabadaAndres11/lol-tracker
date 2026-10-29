// Cuentas, monedas y sobres del juego de cartas (prototipo).
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
const DUP_COINS = { 'Común': 5, 'Rara': 15, 'Épica': 40, 'Legendaria': 100 };
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
  if (u && isAdmin(u) && !u.adminView) u.owned = ALL.map((c) => c.id); // la cuenta ADMIN lo tiene todo (para pruebas), salvo en modo "vista de jugador nuevo"
  return u;
}
const saveUser = (cfg, u) => redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);

async function newSession(cfg, name) {
  const token = crypto.randomBytes(24).toString('hex');
  await redis(cfg, ['SET', `cartas:tok:${token}`, name.toLowerCase(), 'EX', TOKEN_DAYS * 86400]);
  return token;
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
        const u = { name, salt, hash: hashPin(pin, salt), coins: START_COINS, owned: starterFor(STARTER_THEMES.includes(starter) ? starter : STARTER_THEMES[0]), lastDaily: '', rewardDay: '', rewardCount: 0, startedAt: 0, createdAt: Date.now() };
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
