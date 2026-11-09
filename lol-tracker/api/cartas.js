// Cuentas, monedas y sobres del juego de cartas.
// Todo se guarda en Redis (Upstash). Una cuenta = nombre + PIN de 4 dígitos.
// Las monedas y la colección viven en el servidor: el navegador solo pide acciones.
const crypto = require('crypto');
const { redisConfig, redis } = require('./_redis');
const DATA = require('../public/cartas/cards.js');
const SKINS = require('../public/cartas/skins.js');
const MS = require('../public/cartas/missions.js');
const SS = require('../public/cartas/season.js');
const EM = require('../public/cartas/emotes.js');
const EMOTE_CD = 2000; // ms entre emoticonos en partida
const emoteSetsOf = (u) => (String(u.name).toLowerCase() === 'admin' ? EM.SETS.map((s) => s.id) : (u.emoteSets || []).filter((id) => EM.setOf(id)));
const emoteOwns = (u, id) => emoteSetsOf(u).includes(id);
// Emoticonos de la partida tal como los ve el cliente: { e, n, ago }
const emView = (x) => (x ? { e: x.e, n: x.n, ago: Date.now() - x.t } : null);
// Intenta enviar un emoticono en una partida; devuelve true si se ha registrado
function emoteSend(g, seat, u, body, nseats) {
  const p = EM.parse(body.e);
  if (!p || !emoteOwns(u, p.set.id)) return false;
  g.em = g.em || new Array(nseats).fill(null);
  const prev = g.em[seat];
  if (prev && Date.now() - prev.t < EMOTE_CD) return false;
  g.em[seat] = { e: p.set.id + '-' + p.n, t: Date.now(), n: (prev ? prev.n : 0) + 1 };
  g.v++; return true;
}
const SKIN_BY_ID = {}; SKINS.forEach((s) => { SKIN_BY_ID[s.id] = s; });

const START_COINS = 150;
const PACK_COST = 50;
const PACK_SIZE = 5;
const DAILY_COINS = 30;
const GAME_COINS = { played: 10, win: 20 };
const MAX_GAME_REWARDS_PER_DAY = 15;
const MIN_GAME_SECONDS = 60;
const MIN_GAME_ROUNDS = 3;
const levelOf = (u, id) => { const c = 1 + ((u.dups || {})[id] || 0); return c >= 4 ? 3 : c >= 2 ? 2 : 1; }; // 2 copias = ★2, 4 copias = ★3
const skinsOf = (u, deck) => { const o = {}; Object.keys(u.skinSel || {}).forEach((c) => { if (deck.includes(c) && (u.skins || []).includes(u.skinSel[c])) o[c] = u.skinSel[c]; }); return o; };
const levelsOf = (u, deck) => { const o = {}; deck.forEach((id) => { const l = levelOf(u, id); if (l > 1) o[id] = l; }); return o; };
const DUP_COINS = { 'Común': 0, 'Rara': 0, 'Épica': 0, 'Legendaria': 0 }; // las repetidas ya no dan monedas
const MAXED_DUP_COINS = 5; // una copia de una carta que ya tienes a nivel 3 se canjea por monedas, sea cual sea su rareza
const WEIGHTS = { 'Común': 50, 'Rara': 30, 'Épica': 15, 'Legendaria': 5 };
const TOKEN_DAYS = 30;
const MAX_FAILS = 10, BLOCK_SECONDS = 900;

const ALL = DATA.cards.concat(DATA.actions);
const BY_ID = {}; ALL.forEach((c) => { BY_ID[c.id] = c; });
// Regalo de bienvenida: el jugador elige un mazo inicial de una sinergia (+ acciones generales Comunes).
// Si la sinergia no tiene tropas Comunes se añaden dos tropas Comunes baratas para poder jugar la tienda inicial.
const STARTER_THEMES = ['Pokémon', 'Comebacker', 'Correa', 'Informático', 'Anime'];
function starterFor(theme) {
  const troops = DATA.cards.filter((c) => c.themes.includes(theme));
  const ids = troops.map((c) => c.id);
  if (!troops.some((c) => c.rarity === 'Común')) {
    DATA.cards.filter((c) => c.rarity === 'Común' && !ids.includes(c.id)).sort((x, y) => x.cost - y.cost).slice(0, 2).forEach((c) => ids.push(c.id));
  }
  const out = ids.concat(DATA.actions.filter((a) => a.theme === theme || (!a.theme && a.rarity === 'Común')).map((a) => a.id));
  // El mazo debe ocupar al menos deckMin huecos: si el pack se queda corto, se completa con tropas Comunes baratas de otras sinergias.
  const fill = DATA.cards.filter((c) => c.rarity === 'Común' && !out.includes(c.id)).sort((x, y) => x.cost - y.cost || x.size - y.size);
  while (E.deckSize(out) < E.CFG.deckMin && fill.length) out.push(fill.shift().id);
  return out;
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
const isAnime = (c) => (c.themes || []).includes('Anime') || c.theme === 'Anime';
const PACK_POOLS = { set1: ALL.filter((c) => !isAnime(c) && !c.pack && !c.nopack), anime: ALL.filter((c) => isAnime(c) && !c.pack && !c.nopack), set2: ALL.filter((c) => c.pack === 'set2' && !c.nopack) }; // Set 2: Goblins, Magic Botlane y K-Pop; // el sobre Anime solo trae la sinergia Anime y su acción; el Set 1, todo lo demás
const packKey = (v) => (v === 'anime' ? 'anime' : v === 'set2' ? 'set2' : 'set1');
const packField = (k) => (k === 'anime' ? 'packsAnime' : k === 'set2' ? 'packsSet2' : 'packs');
function drawCard(minRarity, poolAll) {
  const order = ['Común', 'Rara', 'Épica', 'Legendaria'];
  let rar = pickRarity();
  if (minRarity && order.indexOf(rar) < order.indexOf(minRarity)) rar = minRarity;
  const src = poolAll || ALL;
  let pool = src.filter((c) => c.rarity === rar);
  if (!pool.length) pool = src;
  return pool[crypto.randomInt(0, pool.length)].id;
}
// Efectos cosméticos disponibles (por ahora todos son de todos los jugadores)
const FX_KINDS = { deploy: { default: 0, meteoro: 30, arcano: 30, perro: 30, fichas: 30, sombras: 30, kame: 30, grimorio: 30, grieta: 30, monedas: 30 }, sleeve: { sin: 0, oro: 40, moneda: 40, neon: 30, casino: 40, dragonball: 40, trebol: 40, petalos: 40, pokeball: 40 }, finish: { default: 0, eclipse: 50, hechizo: 50, poker: 50, dball: 50, trebol: 50, petalos: 50, goblin: 50, gato: 50, mascara: 50 } }; // precio en monedas de cada efecto, por tipo
const FX_PASS = ['grieta', 'pokeball', 'mascara']; // efectos exclusivos del pase de batalla (no se venden ni salen en sobres)
const FX_PRICE = Object.assign({}, FX_KINDS.deploy, FX_KINDS.sleeve, FX_KINDS.finish);
const FX_DEFAULT = { deploy: 'default', sleeve: 'sin', finish: 'default' };
const FX_DEPLOY = Object.keys(FX_PRICE);
const fxOwned = (u) => ['default', 'sin', ...((u.fxOwned || []).filter((x) => FX_DEPLOY.includes(x) && FX_PRICE[x] > 0))];
const fxSel = (u, kind) => { const id = (u.fx || {})[kind]; return id && FX_KINDS[kind][id] !== undefined && fxOwned(u).includes(id) ? id : FX_DEFAULT[kind]; };
// ---------- Misiones y cajas ----------
// Registra una partida válida en las estadísticas de la cuenta. kind: 'ia' | 'pvp' | 'v4'
function recordGame(u, o) {
  const st = (u.st = u.st || {});
  st.games = (st.games || 0) + 1;
  if (o.won) { st.wins = (st.wins || 0) + 1; st.streak = (st.streak || 0) + 1; st.bestStreak = Math.max(st.bestStreak || 0, st.streak); } else st.streak = 0;
  MS.MISSIONS.forEach((m) => { if (m.stat === 'streak' && st.streak >= m.goal) st['hit_' + m.id] = 1; }); // la misión de racha queda cumplida aunque luego se corte
  st.cards = (st.cards || 0) + Math.max(0, Math.min(60, Number(o.cards) || 0));
  if (o.mode === 'revive' || o.mode === 'rumble') st.revive = (st.revive || 0) + 1;
  if (o.mode === 'rumble') st.rumble = (st.rumble || 0) + 1;
  if (o.kind === 'pvp') st.mp = (st.mp || 0) + 1;
  if (o.kind === 'v4') st.v4 = (st.v4 || 0) + 1;
  seasonGame(u, o);
}
// ---------- Temporada y pase de batalla ----------
const seasonActive = () => !SS.SEASON.end || Date.now() < Date.parse(SS.SEASON.end);
function ensureSeason(u) { // el progreso de temporada se reinicia al cambiar de temporada
  if (!u.se || u.se.id !== SS.SEASON.id) u.se = { id: SS.SEASON.id, xp: 0, st: {}, streak: 0, mc: [], lc: [] };
  return u.se;
}
function seasonBump(u, key, n) { if (!seasonActive()) return; const se = ensureSeason(u); se.st[key] = (se.st[key] || 0) + (n || 1); }
function seasonGame(u, o) {
  if (!seasonActive()) return;
  const se = ensureSeason(u);
  seasonBump(u, 'games');
  if (o.won) { seasonBump(u, 'wins'); se.streak = (se.streak || 0) + 1; se.st.bestStreak = Math.max(se.st.bestStreak || 0, se.streak); } else se.streak = 0;
  se.st.streak = se.streak;
  SS.SEASON.missions.forEach((m) => { if (m.stat === 'streak' && se.streak >= m.goal) se.st['hit_' + m.id] = 1; });
  seasonBump(u, 'cards', Math.max(0, Math.min(60, Number(o.cards) || 0)));
  if (o.mode === 'revive' || o.mode === 'rumble') seasonBump(u, 'revive');
  if (o.mode === 'rumble') seasonBump(u, 'rumble');
  if (o.kind === 'pvp') seasonBump(u, 'mp');
  if (o.kind === 'v4') seasonBump(u, 'v4');
}
function seasonPublic(u) {
  const se = ensureSeason(u);
  return { id: se.id, xp: se.xp, st: se.st, mc: se.mc, lc: se.lc, active: seasonActive() };
}
// Entrega la recompensa de un nivel del pase
function grantReward(u, r) {
  if (r.kind === 'coins') u.coins += r.n | 0;
  else if (r.kind === 'pack') { const f = packField(packKey(r.set)); u[f] = (u[f] || 0) + (r.n | 0); }
  else if (r.kind === 'emotes') { if (EM.setOf(r.id) && !(u.emoteSets || []).includes(r.id)) u.emoteSets = [...(u.emoteSets || []), r.id]; }
  else if (r.kind === 'box') u.boxes = (u.boxes || 0) + (r.n | 0);
  else if (r.kind === 'card') { if (!(u.owned || []).includes(r.id)) u.owned.push(r.id); else { u.dups = u.dups || {}; u.dups[r.id] = (u.dups[r.id] || 0) + 1; } }
  else if (r.kind === 'skin') { u.skins = u.skins || []; if (!u.skins.includes(r.id)) u.skins.push(r.id); else u.coins += 50; }
  else if (r.kind === 'fx') { if (!fxOwned(u).includes(r.id)) u.fxOwned = [...(u.fxOwned || []), r.id]; else u.coins += 30; }
}
function missionStats(u) {
  const st = u.st || {};
  const fxCount = fxOwned(u).filter((x) => FX_PRICE[x] > 0).length;
  return {
    games: st.games || 0, wins: st.wins || 0, bestStreak: st.bestStreak || 0, streak: st.streak || 0, ...Object.fromEntries(Object.keys(st).filter((k) => k.startsWith('hit_')).map((k) => [k, 1])), cards: st.cards || 0, revive: st.revive || 0, rumble: st.rumble || 0, mp: st.mp || 0, v4: st.v4 || 0, packs: st.packs || 0,
    lv3: Object.keys(u.dups || {}).filter((id) => (u.dups[id] || 0) >= 3).length, owned: (u.owned || []).length, skins: (u.skins || []).length, fx: fxCount,
  };
}
const rankReached = (u) => Math.max(u.ptsMax || 0, u.pts || 0);
// Caja: una carta, una skin o un efecto que aún no tengas. Si lo tienes todo desbloqueado no se pueden abrir cajas.
function boxPools(u) {
  const cards = ALL.filter((c) => !c.nopack && !(u.owned || []).includes(c.id)); // nopack: Mítica, ni en sobres ni en cajas
  const skins = SKINS.filter((s) => !s.pass && !(u.skins || []).includes(s.id));
  const fxs = FX_DEPLOY.filter((id) => FX_PRICE[id] > 0 && !FX_PASS.includes(id) && !fxOwned(u).includes(id));
  return [['card', cards, 5], ['skin', skins, 3], ['fx', fxs, 2]].filter((p) => p[1].length);
}
const boxLocked = (u) => !boxPools(u).length;
function rollBox(u) {
  const pools = boxPools(u);
  if (!pools.length) return null;
  let r = crypto.randomInt(0, pools.reduce((a, p) => a + p[2], 0)), pool = pools[0];
  for (const p of pools) { if (r < p[2]) { pool = p; break; } r -= p[2]; }
  const [kind, list] = pool;
  if (kind === 'card') { // más probables las comunes
    const tot = list.reduce((a, c) => a + WEIGHTS[c.rarity], 0); let x = crypto.randomInt(0, tot), pick = list[0];
    for (const c of list) { if (x < WEIGHTS[c.rarity]) { pick = c; break; } x -= WEIGHTS[c.rarity]; }
    u.owned.push(pick.id); return { kind, id: pick.id, isNew: true };
  }
  if (kind === 'skin') { const pick = list[crypto.randomInt(0, list.length)]; u.skins = u.skins || []; u.skins.push(pick.id); return { kind, id: pick.id, isNew: true }; }
  const id = list[crypto.randomInt(0, list.length)]; u.fxOwned = [...(u.fxOwned || []), id];
  const fk = Object.keys(FX_KINDS).find((k) => FX_KINDS[k][id] !== undefined);
  return { kind: 'fx', id, fxKind: fk, isNew: true };
}
// ---------- Destino (gacha) ----------
const GACHA = { id: 'aitorlg-singer', cost: 25, rate: 10, pity: 20 }; // recompensa principal rotativa; rate = % por tirada; pity = tirada en la que está asegurada
const GACHA_MIX = [['card', 60], ['fx', 25], ['skin', 15]]; // reparto del 90% restante entre cartas, efectos y skins
const skinRar = (sk) => ((sk.price || 0) >= 200 ? 'Legendaria' : 'Épica');
const fxRar = (id) => { const pr = FX_PRICE[id] || 0; return pr >= 50 ? 'Legendaria' : pr >= 40 ? 'Épica' : 'Rara'; };
function pickWeighted(list, w) { const tot = list.reduce((a, x) => a + w(x), 0); let r = crypto.randomInt(0, Math.max(1, Math.round(tot * 100))) / 100; for (const x of list) { const v = w(x); if (r < v) return x; r -= v; } return list[list.length - 1]; }
function gachaRoll(u) {
  u.gachaN = u.gachaN || 0;
  const main = u.gachaN + 1 >= GACHA.pity || crypto.randomInt(0, 100) < GACHA.rate;
  if (main) { u.gachaN = 0; return { kind: 'card', id: GACHA.id, rarity: 'Mítica', main: true }; }
  u.gachaN += 1;
  const cat = pickWeighted(GACHA_MIX, (x) => x[1])[0];
  if (cat === 'skin') {
    const list = SKINS.filter((k) => !k.pass);
    if (list.length) { const sk = pickWeighted(list, (k) => (skinRar(k) === 'Legendaria' ? 1 : 3)); return { kind: 'skin', id: sk.id, rarity: skinRar(sk) }; }
  }
  if (cat === 'fx') {
    const list = FX_DEPLOY.filter((id) => FX_PRICE[id] > 0 && !FX_PASS.includes(id));
    if (list.length) { const id = pickWeighted(list, (x) => 300 / FX_PRICE[x]); return { kind: 'fx', id, fxKind: Object.keys(FX_KINDS).find((k) => FX_KINDS[k][id] !== undefined), rarity: fxRar(id) }; }
  }
  const list = ALL.filter((c) => !c.nopack);
  const c = pickWeighted(list, (x) => WEIGHTS[x.rarity] || 1);
  return { kind: 'card', id: c.id, rarity: c.rarity };
}
function publicUser(u) {
  return {
    name: u.name, boxLocked: boxLocked(u), pts: u.pts || 0, coins: u.coins, owned: u.owned, dups: u.dups || {}, skins: u.skins || [], skinSel: u.skinSel || {}, decks: u.decks || null, avatar: u.avatar || '', fx: { deploy: fxSel(u, 'deploy'), sleeve: fxSel(u, 'sleeve'), finish: fxSel(u, 'finish') }, fxOwned: fxOwned(u), boxes: u.boxes || 0, invSkins: (u.invSkins || []).filter((id) => !(u.skins || []).includes(id)), invDup: u.invDup || {}, gachaN: u.gachaN || 0, gacha: { id: GACHA.id, cost: GACHA.cost, rate: GACHA.rate, pity: GACHA.pity }, ms: { stats: missionStats(u), claimed: u.msClaimed || [] }, packs: u.packs || 0, packsAnime: u.packsAnime || 0, packsSet2: u.packsSet2 || 0, emoteSets: emoteSetsOf(u), rkClaimed: u.rkClaimed || [], season: seasonPublic(u), ptsMax: rankReached(u),
    dailyAvailable: u.lastDaily !== today(),
    gamesToday: u.rewardDay === today() ? u.rewardCount : 0,
    maxGamesToday: MAX_GAME_REWARDS_PER_DAY,
    packCost: isAdmin(u) ? 0 : PACK_COST, packSize: PACK_SIZE, dailyCoins: DAILY_COINS,
    ...(isAdmin(u) ? { admin: true, starters: Object.fromEntries(STARTER_THEMES.map((t) => [t, starterFor(t)])) } : {}),
  };
}
const isAdmin = (u) => String(u.name).toLowerCase() === 'admin';
// Skins de compensación (por cartas eliminadas): van al inventario y el jugador las desbloquea cuando quiere
function giveSkin(u, id) { u.skins = u.skins || []; u.invSkins = u.invSkins || []; if (!u.skins.includes(id) && !u.invSkins.includes(id)) u.invSkins.push(id); }
async function loadUser(cfg, name) {
  const raw = await redis(cfg, ['GET', uKey(name)]);
  const u = raw ? JSON.parse(raw) : null;
  if (u && ((u.owned || []).includes('dashlight-gambler') || JSON.stringify(u.decks || '').includes('dashlight-gambler'))) { // Dashlight Gambler pasó a ser Pampert Gambler
    const fix = (a) => Array.isArray(a) ? a.map((x) => x === 'dashlight-gambler' ? 'pampert-gambler' : x) : a;
    u.owned = [...new Set(fix(u.owned || []))]; if (u.decks) u.decks = JSON.parse(JSON.stringify(u.decks).split('dashlight-gambler').join('pampert-gambler'));
    if (u.dups && u.dups['dashlight-gambler'] != null) { u.dups['pampert-gambler'] = u.dups['dashlight-gambler']; delete u.dups['dashlight-gambler']; }
    await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);
  }
  // Fusión: PokeAitoRLG pasa a ser AitoRLG Palomitero (id aitorlg-regla). Quien tenía PokeAitoRLG recibe su ilustración como skin
  // de Palomitero, conserva la carta (si no tenía Regla) y sus copias se suman; en los mazos se sustituye por Palomitero.
  const OLD_FRIKI = 'aitorlg-friki';
  if (u && ((u.owned || []).includes(OLD_FRIKI) || JSON.stringify(u.decks || '').includes(OLD_FRIKI) || (u.dups || {})[OLD_FRIKI] != null)) {
    const had = (u.owned || []).includes(OLD_FRIKI), hadRegla = (u.owned || []).includes('aitorlg-regla');
    u.dups = u.dups || {};
    if (had) {
      giveSkin(u, 'aitorlg-pokeaito');
      if (!hadRegla) u.owned.push('aitorlg-regla');
      u.dups['aitorlg-regla'] = (u.dups['aitorlg-regla'] || 0) + (hadRegla ? 1 : 0) + (u.dups[OLD_FRIKI] || 0);
    }
    delete u.dups[OLD_FRIKI];
    u.owned = (u.owned || []).filter((x) => x !== OLD_FRIKI);
    const swap = (v) => {
      if (v === OLD_FRIKI) return 'aitorlg-regla';
      if (Array.isArray(v)) { const m = v.map(swap); return m.every((x) => typeof x === 'string') ? [...new Set(m)] : m; } // las listas de ids no repiten cartas
      return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
    };
    if (u.decks) u.decks = swap(u.decks);
    await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);
  }
  // Fusión: Javihi Prime pasa a ser una skin de Javihi vs All (id javihi-friki, que conserva su pasiva Remate). Quien tenía Javihi Prime
  // recibe la skin, conserva la carta (si no tenía Javihi vs All) y sus copias se suman; en los mazos se sustituye por Javihi vs All.
  const OLD_PRIME = 'javihi-prime';
  if (u && ((u.owned || []).includes(OLD_PRIME) || JSON.stringify(u.decks || '').includes(OLD_PRIME) || (u.dups || {})[OLD_PRIME] != null)) {
    const had = (u.owned || []).includes(OLD_PRIME), hadNew = (u.owned || []).includes('javihi-friki');
    u.dups = u.dups || {};
    if (had) {
      giveSkin(u, 'javihi-friki-prime');
      if (!hadNew) u.owned.push('javihi-friki');
      u.dups['javihi-friki'] = (u.dups['javihi-friki'] || 0) + (hadNew ? 1 : 0) + (u.dups[OLD_PRIME] || 0);
    }
    delete u.dups[OLD_PRIME];
    u.owned = (u.owned || []).filter((x) => x !== OLD_PRIME);
    const swapP = (v) => {
      if (v === OLD_PRIME) return 'javihi-friki';
      if (Array.isArray(v)) { const m = v.map(swapP); return m.every((x) => typeof x === 'string') ? [...new Set(m)] : m; }
      return v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swapP(x)])) : v;
    };
    if (u.decks) u.decks = swapP(u.decks);
    if (u.skinSel && u.skinSel[OLD_PRIME]) delete u.skinSel[OLD_PRIME];
    await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);
  }
  // Lihone Setter (haikyuu-lihone) se eliminó: quien la tenía recibe su ilustración como skin de Lihone en el inventario
  if (u && ((u.owned || []).includes('haikyuu-lihone') || (u.dups || {})['haikyuu-lihone'] != null)) {
    if ((u.owned || []).includes('haikyuu-lihone')) giveSkin(u, 'lihone-setter');
    await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);
  }
  // Chipy Llorón (chipy-lloron) se eliminó: quien la tenía recibe su ilustración como skin de Chipy Correa en el inventario
  if (u && ((u.owned || []).includes('chipy-lloron') || (u.dups || {})['chipy-lloron'] != null)) {
    if ((u.owned || []).includes('chipy-lloron')) giveSkin(u, 'chipy-correa-lloron');
    await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);
  }
  // Regalo: cada cuenta existente recibe en el inventario las skins de compensación de las cartas eliminadas (una vez por skin).
  // Las cuentas nuevas nacen con la lista completa en legacyGiven y no las reciben.
  if (u) {
    const legacyIds = SKINS.filter((k) => k.legacy).map((k) => k.id);
    const given = u.legacyGiven || (u.legacyGift ? ['aitorlg-pokeaito', 'javihi-friki-prime', 'lihone-setter', 'chipy-correa-lloron'] : []);
    const todo = legacyIds.filter((id) => !given.includes(id));
    if (!u.legacyGiven || todo.length) {
      todo.forEach((id) => giveSkin(u, id));
      u.legacyGiven = legacyIds; delete u.legacyGift;
      await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);
    }
  }
  const GONE = ['mertens-prime', 'capitulo-especial', 'rabia-contenida', 'fiesta-del-pueblo', 'hermano-del-alma', 'sofa-compartido', 'madrugon', 'haikyuu-lihone', 'chipy-lloron']; // cartas eliminadas del juego
  if (u && ((u.owned || []).some((x) => GONE.includes(x)) || GONE.some((g) => JSON.stringify(u.decks || '').includes(g)))) {
    u.owned = (u.owned || []).filter((x) => !GONE.includes(x));
    const clean = (v) => Array.isArray(v) ? v.filter((x) => !GONE.includes(x)).map(clean) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, clean(x)])) : v;
    if (u.decks) u.decks = clean(u.decks);
    if (u.dups) GONE.forEach((g) => delete u.dups[g]);
    await redis(cfg, ['SET', uKey(u.name), JSON.stringify(u)]);
  }
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
// Clasificación (ladder): puntos por partida. 1v1: +20/-20. Versus de 4: +40/+20/-20/-40 por puesto. Nunca baja de 0.
const LADDER_KEY = 'cartas:ladder';
const PTS_1V1 = { win: 20, lose: -20 };
const PTS_V4 = [0, 40, 20, -20, -40];
const DIFF_MULT = [1, 1.5, 2], EXPERT_PTS = 10; // dificultad de la IA: multiplicador de monedas y puntos por vencer al Experto
const BOT_COINS = { played: 10, place: [0, 20, 10, 3, 0] }; // Versus de 4 contra 3 IAs: menos monedas y sin puntos de clasificación
async function addPts(cfg, u, delta) {
  const before = u.pts || 0;
  u.pts = Math.max(0, before + delta);
  u.ptsMax = Math.max(u.ptsMax || 0, u.pts);
  if (!isAdmin(u)) await redis(cfg, ['HSET', LADDER_KEY, u.name, String(u.pts)]);
  return u.pts - before;
}
const PVP_DC_MS = 60000, PVP_TTL = 7200;
const gKey = (id) => `cartas:pvp:g:${id}`;
const pKey = (n) => `cartas:pvp:user:${n.toLowerCase()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Modos de partida: '' clásico, 'revive' Resurrección, 'rumble' Royal Rumble (sin mazo: sale todo el juego)
const normMode = (m) => (m === 'rumble' ? 'rumble' : m === 'revive' ? 'revive' : '');
function checkDeck(u, deck) {
  if (!Array.isArray(deck) || deck.length < 3 || deck.length > 40) return 'Tu mazo no es válido.';
  const seen = new Set();
  for (const id of deck) {
    if (!BY_ID[id] || seen.has(id)) return 'Tu mazo no es válido.';
    seen.add(id);
    if (u.owned.indexOf(id) < 0) return 'Tu mazo tiene cartas que no tienes.';
  }
  if (E.deckSize(deck) > E.CFG.deckBudget) return 'Tu mazo se pasa del presupuesto.';
  if (E.deckSize(deck) < E.CFG.deckMin) return `Tu mazo debe ocupar al menos ${E.CFG.deckMin} de ${E.CFG.deckBudget} huecos.`;
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
async function newPvpGame(cfg, a, b, mode) { // a, b: { name, deck }
  if (crypto.randomInt(0, 2)) { const t = a; a = b; b = t; }
  const id = crypto.randomBytes(8).toString('hex');
  const s = E.newGame(a.deck, b.deck, crypto.randomInt(1, 2 ** 30), { pvp: true, mode: normMode(mode), lv: [a.lv || {}, b.lv || {}], sk: [a.sk || {}, b.sk || {}] });
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
    if (valid) recordGame(u, { won: won && g.ab !== seat, kind: 'pvp', mode: s.rumble ? 'rumble' : s.mode, cards: (s.p[seat] || {}).used });
    let gained = 0;
    if (valid && g.ab !== seat && u.rewardCount < MAX_GAME_REWARDS_PER_DAY) {
      gained = PVP_COINS.played + (won ? PVP_COINS.win : 0); u.rewardCount++; u.coins += gained;
    }
    // puntos: solo en partidas válidas; quien abandona pierde siempre
    const pd = g.ab === seat ? PTS_1V1.lose : valid ? (won ? PTS_1V1.win : PTS_1V1.lose) : 0;
    const pts = pd ? await addPts(cfg, u, pd) : 0;
    g.rew[seat] = { gained, capped: valid && g.ab !== seat && gained === 0, pts, total: u.pts || 0 };
    await saveUser(cfg, u);
  }
}
// ---- Sortear victoria (1 vs 1): tras la ronda SORTEO_MIN_ROUND se puede proponer una moneda al aire; el rival acepta o rechaza ----
const SORTEO_MIN_ROUND = 20, SORTEO_COOLDOWN = 5;
function sorView(g, seat) {
  const s = g.s, wait = Math.max(0, (g.sorAt || 0) - s.round);
  return {
    show: s.round > SORTEO_MIN_ROUND || g.coin != null,
    can: !s.over && s.round > SORTEO_MIN_ROUND && !g.sor && !wait,
    wait, pend: g.sor ? (g.sor.by === seat ? 'out' : 'in') : '',
    coin: g.coin == null ? '' : (g.coin === seat ? 'win' : 'lose'),
  };
}
function sorteoOp(g, seat, op) { // devuelve un aviso (texto) si no se puede
  const s = g.s;
  if (op === 'sor') {
    if (s.round <= SORTEO_MIN_ROUND) return 'El sorteo se desbloquea pasada la ronda ' + SORTEO_MIN_ROUND + '.';
    if (g.sor) return 'Ya hay un sorteo propuesto.';
    if ((g.sorAt || 0) > s.round) return 'Podrás volver a proponerlo en ' + (g.sorAt - s.round) + ' rondas.';
    g.sor = { by: seat }; g.v++; return '';
  }
  if (!g.sor) return '';
  if (op === 'sorCancel') { if (g.sor.by === seat) { g.sor = null; g.v++; } return ''; }
  if (g.sor.by === seat) return ''; // solo responde el rival
  if (op === 'sorNo') { g.sor = null; g.sorAt = s.round + SORTEO_COOLDOWN; g.v++; return ''; }
  if (op === 'sorYes') {
    const w = crypto.randomInt(0, 2), loser = 1 - w;
    g.sor = null; g.coin = w;
    E.forfeit(s, loser, E.pv(s, w, 'Sorteo a cara o cruz: ¡la moneda te da la victoria!', 'Sorteo a cara o cruz: la moneda da la victoria al rival.'));
    g.dl = 0; g.v++;
  }
  return '';
}
function viewFor(g, seat) {
  const s = E.mirror(g.s, seat);
  s.acts = s.acts.filter((a) => a.p === 1); // solo lo que ha jugado el rival (lo tuyo ya lo ves)
  s.pvp = true;
  return {
    ok: true, id: g.id, v: g.v, seat, names: seat ? [g.names[1], g.names[0]] : g.names.slice(),
    rdy: seat ? [g.rdy[1], g.rdy[0]] : g.rdy.slice(), dl: g.dl ? Math.max(0, g.dl - Date.now()) : 0,
    reward: g.rew[seat], s,
    sor: sorView(g, seat),
    em: g.em ? (seat ? [emView(g.em[1]), emView(g.em[0])] : g.em.map(emView)) : [null, null],
  };
}
const SEAT_OPS = {
  place: (s, p, a) => E.place(s, p, +a[0], +a[1]),
  action: (s, p, a, x) => E.playAction(s, p, +a[0], a[1] == null ? null : x(a[1])),
  target: (s, p, a, x) => { E.setTarget(s, p, x(a[0]), a[1] == null ? null : x(a[1])); return true; },
  clear: (s, p) => { E.clearTargets(s, p); return true; },
  voley: (s, p, a, x) => { E.setVoley(s, p, x(a[0]), a[1] === 'def' ? 'def' : 'atk'); return true; },
  kpop: (s, p, a) => E.kpopPick(s, p, String(a[0])),
  buy: (s, p, a) => E.buy(s, p, +a[0]),
  refresh: (s, p) => E.refresh(s, p),
  freeze: (s, p) => E.freeze(s, p),
  pick: (s, p, a) => E.pickFromDeck(s, p, String(a[0])),
  retire: (s, p, a) => E.retire(s, p, +a[0]),
  sell: (s, p, a) => E.sell(s, p, a[0] === 'mesa' ? 'mesa' : 'hand', +a[1]),
};
async function pvpHandle(cfg, act, body, u) {
  const me = u.name;
  if (act === 'pvpCreate' || act === 'pvpJoin' || act === 'pvpSearch') {
    const cur = await redis(cfg, ['GET', pKey(me)]);
    if (cur) { const g = await loadGame(cfg, cur); if (g && !g.s.over) return viewFor(g, g.names.indexOf(me)); }
    let mode = normMode(body.mode);
    if (act === 'pvpJoin') { // al unirse a una sala de Royal Rumble no hace falta mazo
      const jc = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), jr = jc.length === 5 ? await redis(cfg, ['GET', `cartas:pvp:room:${jc}`]) : null;
      if (jr && JSON.parse(jr).mode === 'rumble') mode = 'rumble';
    }
    const rr = mode === 'rumble', qk = rr ? 'cartas:pvp:q:rr' : mode ? 'cartas:pvp:q:rv' : 'cartas:pvp:q';
    if (rr) body.deck = E.rumbleDeck(); // Royal Rumble: no se entra con mazo
    const err = rr ? '' : checkDeck(u, body.deck); if (err) return { status: 400, error: err };
    const mine = { name: me, deck: body.deck, lv: rr ? {} : levelsOf(u, body.deck), sk: skinsOf(u, body.deck), mode };
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
      const g = await newPvpGame(cfg, host, mine, host.mode);
      return viewFor(g, g.names.indexOf(me));
    }
    // búsqueda automática: se empareja con quien esté esperando
    const raw = await redis(cfg, ['GETDEL', qk]);
    if (raw) {
      const o = JSON.parse(raw);
      if (o.name.toLowerCase() !== me.toLowerCase() && Date.now() - o.t < 12000) {
        const g = await newPvpGame(cfg, o, mine, mode);
        return viewFor(g, g.names.indexOf(me));
      }
    }
    await redis(cfg, ['SET', qk, JSON.stringify({ ...mine, t: Date.now() }), 'EX', 15]);
    return { ok: true, wait: true };
  }
  if (act === 'pvpCancel') {
    const code = await redis(cfg, ['GET', `cartas:pvp:host:${me.toLowerCase()}`]);
    if (code) { await redis(cfg, ['DEL', `cartas:pvp:room:${code}`]); await redis(cfg, ['DEL', `cartas:pvp:host:${me.toLowerCase()}`]); }
    for (const qk of ['cartas:pvp:q', 'cartas:pvp:q:rv']) {
      const q = await redis(cfg, ['GET', qk]);
      if (q && JSON.parse(q).name.toLowerCase() === me.toLowerCase()) await redis(cfg, ['DEL', qk]);
    }
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
    } else if (act === 'pvpEmote' && !s.over) {
      emoteSend(g, seat, u, body, 2);
    } else if (act === 'pvpOp' && !s.over) {
      const op = String(body.op || ''), a = Array.isArray(body.a) ? body.a : [];
      const x = (n) => (seat === 1 && typeof n === 'number' ? n ^ 1 : n); // uid de su vista -> canónico
      if (op === 'ready') {
        if (g.rdy[seat]) { /* ya estaba */ }
        else if (s.phase === 'prep' && !s.shopOpen && E.pendingTargets(s, seat).length) hint = 'Elige objetivo para todas tus tropas.';
        else { g.rdy[seat] = true; g.v++; resolveIfReady(g, false); }
      } else if (op === 'unready') {
        if (g.rdy[seat]) { g.rdy[seat] = false; g.v++; }
      } else if (op === 'sor' || op === 'sorYes' || op === 'sorNo' || op === 'sorCancel') {
        hint = sorteoOp(g, seat, op);
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

// ---------- Versus de 4 ----------
const V4 = require('./_vs4');
const ALL_THEMES = Object.keys(DATA.themes);
const v4Key = (id) => `cartas:vs4:g:${id}`;
const v4Ptr = (n) => `cartas:vs4:user:${n.toLowerCase()}`;
const v4In = (n) => `cartas:vs4:in:${n.toLowerCase()}`;
const v4Pub = (e) => ({ name: e.name, avatar: e.avatar || '', cover: e.cover || '', bot: !!e.bot });
function v4BotFor(room) { // IA en dificultad Normal con un mazo de una temática que aún no esté en la sala
  const used = new Set(room.players.filter((p) => p.bot).map((p) => p.theme));
  const free = ALL_THEMES.filter((t) => !used.has(t)), lead = free[crypto.randomInt(0, free.length)] || ALL_THEMES[0];
  const rng = E.mulberry32(crypto.randomInt(1, 2 ** 30));
  const others = ALL_THEMES.filter((t) => t !== lead).sort(() => rng() - 0.5).slice(0, 2);
  const deck = E.aiDeck(rng, [lead].concat(others), 0);
  const troops = deck.filter((id) => E.CARD[id] && E.CARD[id].type === 'tropa');
  return { name: 'Bot · ' + lead, deck, bot: true, diff: 0, theme: lead, cover: troops[0] || '' };
}
async function loadV4(cfg, id) {
  const raw = await redis(cfg, ['GET', v4Key(id)]);
  if (!raw) return null;
  const g = JSON.parse(raw); E.revive(g.T); return g;
}
const saveV4 = (cfg, g) => redis(cfg, ['SET', v4Key(g.id), JSON.stringify(g), 'EX', PVP_TTL]);
function v4Deadline(g) {
  const T = g.T, now = Date.now();
  if (T.over) { g.dl = 0; return; }
  if (T.phase === 'prep') g.dl = now + ((T.shopOpen ? 60 : 45) + 3) * 1000;
  else g.dl = now + (14 + Math.max(0, ...T.fx.map((f) => (f && f.frames ? f.frames.length : 0))) * 1.2) * 1000;
}
async function newV4Game(cfg, players, mode, diff) {
  const order = players.slice().sort(() => crypto.randomInt(0, 2) - 0.5);
  const id = crypto.randomBytes(8).toString('hex'), now = Date.now();
  const bots = order.map((p) => !!p.bot), hasBots = bots.some(Boolean);
  const T = V4.newTable(order.map((p) => p.deck), order.map((p) => p.name), crypto.randomInt(1, 2 ** 30), order.map((p) => p.lv || {}), order.map((p) => p.sk || {}), normMode(mode), hasBots ? bots : null, order.map((p) => (p.bot ? p.diff | 0 : 0)));
  const g = { id, names: order.map((p) => p.name), T, v: 1, hb: [now, now, now, now], t0: now, paid: [false, false, false, false], rew: [null, null, null, null], bots: hasBots ? bots : null, diff: hasBots ? diff | 0 : 0 };
  v4Deadline(g);
  await saveV4(cfg, g);
  for (const p of order) { if (p.bot) continue; await redis(cfg, ['SET', v4Ptr(p.name), id, 'EX', PVP_TTL]); await redis(cfg, ['DEL', v4In(p.name)]); }
  return g;
}
function v4View(g, seat) {
  const T = g.T, opp = T.opp[seat], s = V4.viewFor(T, seat);
  s.acts = s.acts || [];
  return {
    ok: true, id: g.id, v: g.v, seat, vs4: true, names: [g.names[seat], opp >= 0 ? g.names[opp] : 'Descanso'],
    rdy: [!!T.rdy[seat], opp >= 0 ? !!T.rdy[opp] : false], dl: g.dl ? Math.max(0, g.dl - Date.now()) : 0, reward: g.rew[seat], s,
    em: (g.em || [null, null, null, null]).map(emView), emn: g.names.slice(),
  };
}
async function payV4(cfg, g) {
  const T = g.T, valid = T.round >= MIN_GAME_ROUNDS && Date.now() - g.t0 >= MIN_GAME_SECONDS * 1000;
  for (let seat = 0; seat < 4; seat++) {
    if (!(T.out[seat] || T.over) || g.paid[seat]) continue;
    g.paid[seat] = true; g.v++;
    if (g.bots && g.bots[seat]) continue;
    const u = await loadUser(cfg, g.names[seat]); if (!u) continue;
    if (u.rewardDay !== today()) { u.rewardDay = today(); u.rewardCount = 0; }
    const abandoned = (T.ab || []).includes(seat);
    if (valid) recordGame(u, { won: !abandoned && T.place[seat] === 1, kind: 'v4', mode: T.rumble ? 'rumble' : T.mode, cards: (T.p[seat] || {}).used });
    let gained = 0;
    if (valid && !abandoned && u.rewardCount < MAX_GAME_REWARDS_PER_DAY) {
      gained = g.bots ? Math.round((BOT_COINS.played + (BOT_COINS.place[T.place[seat]] || 0)) * DIFF_MULT[g.diff | 0]) : PVP_COINS.played + (V4.PLACE_BONUS[T.place[seat]] || 0); u.rewardCount++; u.coins += gained;
    }
    const pd = g.bots ? (g.diff === 2 && valid && !abandoned && T.place[seat] === 1 ? EXPERT_PTS : 0) : PTS_V4[T.place[seat]] || 0;
    const pts = (valid || (abandoned && pd < 0)) && pd ? await addPts(cfg, u, pd) : 0;
    g.rew[seat] = { gained, capped: valid && !abandoned && gained === 0, place: T.place[seat], pts, total: u.pts || 0 };
    await saveUser(cfg, u);
  }
}
async function v4Tick(cfg, g, seat) {
  const T = g.T, now = Date.now();
  if (seat != null) g.hb[seat] = now;
  if (!T.over) {
    for (let o = 0; o < 4; o++) {
      if (o !== seat && !T.out[o] && !(g.bots && g.bots[o]) && now - g.hb[o] > PVP_DC_MS) { V4.eliminate(T, o, 'Te desconectaste: eliminado.', true); g.v++; }
    }
    if (!T.over && g.dl && now > g.dl && V4.resolve(T, true)) { v4Deadline(g); g.v++; }
    if (!T.over && V4.aliveSeats(T).length && V4.aliveSeats(T).every((p) => T.rdy[p]) && V4.resolve(T, false)) { v4Deadline(g); g.v++; }    if (g.bots && !T.over && !V4.aliveSeats(T).some((p) => !g.bots[p])) { V4.finish(T); g.v++; } // solo quedan IAs: se acaba
  }
  await payV4(cfg, g);
}
const V4_OPS = {
  place: (T, p, a) => E.place(T, p, +a[0], +a[1]),
  target: (T, p, a) => { E.setTarget(T, p, a[0], a[1] == null ? null : a[1]); return true; },
  clear: (T, p) => { E.clearTargets(T, p); return true; },
  voley: (T, p, a) => { E.setVoley(T, p, a[0], a[1] === 'def' ? 'def' : 'atk'); return true; },
  kpop: (T, p, a) => E.kpopPick(T, p, String(a[0])),
  buy: (T, p, a) => E.buy(T, p, +a[0]),
  refresh: (T, p) => E.refresh(T, p),
  freeze: (T, p) => E.freeze(T, p),
  pick: (T, p, a) => E.pickFromDeck(T, p, String(a[0])),
  retire: (T, p, a) => E.retire(T, p, +a[0]),
  sell: (T, p, a) => E.sell(T, p, a[0] === 'mesa' ? 'mesa' : 'hand', +a[1]),
};
async function vs4Handle(cfg, act, body, u) {
  const me = u.name, lme = me.toLowerCase();
  const wantsGame = act === 'vs4Create' || act === 'vs4AddBot' || act === 'vs4RmBot' || act === 'vs4Join' || act === 'vs4Search' || act === 'vs4Bots' || (act === 'vs4Poll' && !body.id);
  if (wantsGame || act === 'vs4Cancel') {
    const cur = await redis(cfg, ['GET', v4Ptr(me)]);
    if (cur && act !== 'vs4Cancel') {
      const g = await loadV4(cfg, cur), seat = g ? g.names.indexOf(me) : -1;
      if (g && seat >= 0 && !g.T.over && !g.T.out[seat]) return v4View(g, seat);
    }
    if (act === 'vs4Poll') { // ¿sigo en una sala o en la cola?
      const where = await redis(cfg, ['GET', v4In(me)]);
      if (!where) return { ok: true, none: true };
      if (where === 'Q') return { ok: true, none: true };
      const raw = await redis(cfg, ['GET', `cartas:vs4:room:${where}`]);
      if (!raw) { await redis(cfg, ['DEL', v4In(me)]); return { ok: true, gone: true }; }
      const rm = JSON.parse(raw); return { ok: true, wait: true, code: where, players: rm.players.map(v4Pub), host: rm.host };
    }
    if (act === 'vs4Cancel') {
      const where = await redis(cfg, ['GET', v4In(me)]);
      await withLock(cfg, 'v4q', async () => {
        if (where && where !== 'Q') {
          const raw = await redis(cfg, ['GET', `cartas:vs4:room:${where}`]);
          if (raw) {
            const room = JSON.parse(raw); room.players = room.players.filter((p) => p.name.toLowerCase() !== lme);
            if (!room.players.length || room.host === lme) { await redis(cfg, ['DEL', `cartas:vs4:room:${where}`]); }
            else await redis(cfg, ['SET', `cartas:vs4:room:${where}`, JSON.stringify(room), 'EX', 900]);
          }
        }
        for (const qk of ['cartas:vs4:q', 'cartas:vs4:q:rv', 'cartas:vs4:q:rr']) {
          const q = JSON.parse((await redis(cfg, ['GET', qk])) || '[]').filter((e) => e.name.toLowerCase() !== lme);
          await redis(cfg, ['SET', qk, JSON.stringify(q), 'EX', 30]);
        }
      });
      await redis(cfg, ['DEL', v4In(me)]);
      return { ok: true };
    }
    let vmode = normMode(body.mode);
    if (act === 'vs4Join' || act === 'vs4AddBot') {
      const jc = act === 'vs4Join' ? String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '') : await redis(cfg, ['GET', v4In(me)]), jr = jc && jc.length === 5 ? await redis(cfg, ['GET', `cartas:vs4:room:${jc}`]) : null;
      if (jr && JSON.parse(jr).mode === 'rumble') vmode = 'rumble';
    }
    const vrr = vmode === 'rumble', vqk = vrr ? 'cartas:vs4:q:rr' : vmode ? 'cartas:vs4:q:rv' : 'cartas:vs4:q';
    if (vrr) body.deck = E.rumbleDeck(); // Royal Rumble: no se entra con mazo
    const err = vrr ? '' : checkDeck(u, body.deck); if (err) return { status: 400, error: err };
    const cov = String(body.cover || '').replace(/[^a-z0-9-]/g, '').slice(0, 40);
    const mine = { name: me, deck: body.deck, lv: vrr ? {} : levelsOf(u, body.deck), sk: skinsOf(u, body.deck), avatar: u.avatar || '', cover: E.CARD[cov] ? cov : '' };
    if (act === 'vs4Bots') { // partida contra 3 IAs, cada una con un mazo de una temática distinta
      const diff = vrr ? 0 : Math.max(0, Math.min(2, body.diff | 0)); // Royal Rumble: siempre IA Normal
      const lv = ALL_THEMES.slice().sort(() => crypto.randomInt(0, 2) - 0.5).slice(0, 3);
      const rng = E.mulberry32(crypto.randomInt(1, 2 ** 30));
      const bots = lv.map((lead) => {
        const others = ALL_THEMES.filter((t) => t !== lead).sort(() => rng() - 0.5).slice(0, 2);
        return { name: 'Bot · ' + lead, deck: E.aiDeck(rng, [lead].concat(others), diff), bot: true, diff };
      });
      await redis(cfg, ['DEL', v4In(me)]);
      const g = await newV4Game(cfg, [mine].concat(bots), vmode, diff);
      return v4View(g, g.names.indexOf(me));
    }
    return withLock(cfg, 'v4q', async () => {
      if (act === 'vs4Create') {
        const AL = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let code = '';
        for (let i = 0; i < 5; i++) code += AL[crypto.randomInt(0, AL.length)];
        await redis(cfg, ['SET', `cartas:vs4:room:${code}`, JSON.stringify({ host: lme, mode: vmode, players: [mine] }), 'EX', 900]);
        await redis(cfg, ['SET', v4In(me), code, 'EX', 900]);
        return { ok: true, wait: true, code, players: [v4Pub(mine)], host: lme };
      }
      if (act === 'vs4AddBot' || act === 'vs4RmBot') { // el anfitrión rellena o vacía huecos con IAs en dificultad Normal
        const code = await redis(cfg, ['GET', v4In(me)]);
        const raw = code && code !== 'Q' ? await redis(cfg, ['GET', `cartas:vs4:room:${code}`]) : null;
        if (!raw) return { status: 404, error: 'No estás en una sala.' };
        const room = JSON.parse(raw);
        if (room.host !== lme) return { status: 403, error: 'Solo quien creó la sala puede añadir bots.' };
        if (act === 'vs4RmBot') room.players = room.players.filter((p) => !(p.bot && p.name === String(body.name || '')));
        else if (room.players.length < 4) room.players.push(v4BotFor(room));
        if (room.players.length === 4) {
          await redis(cfg, ['DEL', `cartas:vs4:room:${code}`]);
          const g = await newV4Game(cfg, room.players, room.mode, 0);
          return v4View(g, g.names.indexOf(me));
        }
        await redis(cfg, ['SET', `cartas:vs4:room:${code}`, JSON.stringify(room), 'EX', 900]);
        return { ok: true, wait: true, code, players: room.players.map(v4Pub), host: room.host };
      }
      if (act === 'vs4Join') {
        const code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const raw = code.length === 5 ? await redis(cfg, ['GET', `cartas:vs4:room:${code}`]) : null;
        if (!raw) return { status: 404, error: 'Ese código no existe o ha caducado.' };
        const room = JSON.parse(raw);
        if (!room.players.some((p) => p.name.toLowerCase() === lme)) {
          if (room.players.length >= 4) return { status: 409, error: 'La sala ya está llena.' };
          room.players.push(mine);
        }
        if (room.players.length === 4) {
          await redis(cfg, ['DEL', `cartas:vs4:room:${code}`]);
          const g = await newV4Game(cfg, room.players, room.mode);
          return v4View(g, g.names.indexOf(me));
        }
        await redis(cfg, ['SET', `cartas:vs4:room:${code}`, JSON.stringify(room), 'EX', 900]);
        await redis(cfg, ['SET', v4In(me), code, 'EX', 900]);
        return { ok: true, wait: true, code, players: room.players.map(v4Pub), host: room.host };
      }
      // búsqueda automática: cola de jugadores; arranca al juntarse 4
      const now = Date.now();
      let q = JSON.parse((await redis(cfg, ['GET', vqk])) || '[]').filter((e) => e.name.toLowerCase() !== lme && now - e.t < 12000);
      q.push({ ...mine, t: now });
      if (q.length >= 4) {
        const take = q.slice(0, 4); q = q.slice(4);
        await redis(cfg, ['SET', vqk, JSON.stringify(q), 'EX', 30]);
        const g = await newV4Game(cfg, take, vmode);
        return g.names.includes(me) ? v4View(g, g.names.indexOf(me)) : { ok: true, wait: true, players: q.map(v4Pub) };
      }
      await redis(cfg, ['SET', vqk, JSON.stringify(q), 'EX', 30]);
      await redis(cfg, ['SET', v4In(me), 'Q', 'EX', 60]);
      return { ok: true, wait: true, players: q.map(v4Pub) };
    });
  }
  // ---- con partida ----
  const gid = String(body.id || '');
  if (!/^[0-9a-f]{16}$/.test(gid)) return { ok: true, none: true };
  return withLock(cfg, gid, async () => {
    const g = await loadV4(cfg, gid);
    if (!g) return { ok: true, none: true };
    const seat = g.names.findIndex((n) => n.toLowerCase() === lme);
    if (seat < 0) return { status: 403, error: 'Esa partida no es tuya.' };
    const T = g.T, v0 = g.v; let hint = '';
    if (act === 'vs4Leave') {
      if (!T.out[seat]) { V4.eliminate(T, seat, 'Abandonaste la partida.', true); g.v++; }
    } else if (act === 'vs4Emote' && !T.over) {
      emoteSend(g, seat, u, body, 4);
    } else if (act === 'vs4Op' && !T.out[seat] && !T.over) {
      const op = String(body.op || ''), a = Array.isArray(body.a) ? body.a : [];
      const opp = T.opp[seat];
      if (op === 'ready') {
        const pend = T.phase === 'prep' && !T.shopOpen && opp >= 0 ? E.pendingTargets(V4.duelState(T, seat, opp), 0).length : 0;
        if (T.rdy[seat]) { /* ya estaba */ }
        else if (pend) hint = 'Elige objetivo para todas tus tropas.';
        else { T.rdy[seat] = true; g.v++; if (V4.resolve(T, false)) v4Deadline(g); }
      } else if (op === 'unready') {
        if (T.rdy[seat]) { T.rdy[seat] = false; g.v++; }
      } else if (!T.rdy[seat]) {
        T.err = '';
        if (op === 'action') {
          const S = V4.duelState(T, seat, opp);
          const ok = E.playAction(S, 0, +a[0], a[1] == null ? null : a[1]);
          V4.commit(T, S, seat, opp);
          if (ok === false) hint = S.err || 'No se puede.';
          else {
            S.log.forEach((l) => { V4.note(T, seat, E.resolveText(l.text, 0)); if (opp >= 0) V4.note(T, opp, E.resolveText(l.text, 1)); });
            S.acts.forEach((x) => { T.acts.push({ n: x.n, by: seat, id: x.id, res: x.res, tgt: x.tgt }); }); T.acts = T.acts.slice(-16);
          }
          g.v++;
        } else if (V4_OPS[op]) {
          const ok = V4_OPS[op](T, seat, a);
          if (ok === false) hint = T.err || 'No se puede.';
          V4.processStuck(T);
          T.log.length = 0; g.v++;
        }
      }
    }
    await v4Tick(cfg, g, seat);
    await saveV4(cfg, g);
    if (act === 'vs4Poll' && g.v === Number(body.v) && g.v === v0) return { ok: true, same: true, dl: g.dl ? Math.max(0, g.dl - Date.now()) : 0, rdy: [!!T.rdy[seat], T.opp[seat] >= 0 ? !!T.rdy[T.opp[seat]] : false] };
    const out = v4View(g, seat); if (hint) out.hint = hint;
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
        const u = { legacyGiven: SKINS.filter((k) => k.legacy).map((k) => k.id), name, salt, hash: hashPin(pin, salt), coins: START_COINS, owned: starterFor(STARTER_THEMES.includes(starter) ? starter : STARTER_THEMES[0]), lastDaily: '', rewardDay: '', rewardCount: 0, startedAt: 0, c100: true, createdAt: Date.now() };
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
        u.adminView = true; u.owned = starterFor(th); u.coins = START_COINS; u.dups = {};
      } else { u.adminView = false; u.owned = ALL.map((c) => c.id); }
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act.startsWith('soc')) {
      const r = await require('./_social').socialHandle(cfg, act, body, u, { stats: missionStats, rank: rankReached, loadUser, emote: { parse: EM.parse, owns: emoteOwns } });
      if (r.status) { res.status(r.status).json({ error: r.error }); return; }
      res.status(200).json(r); return;
    }
    if (act.startsWith('vs4')) {
      const r = await vs4Handle(cfg, act, body, u);
      if (r.status) { res.status(r.status).json({ error: r.error }); return; }
      res.status(200).json(r); return;
    }
    if (act.startsWith('pvp')) {
      const r = await pvpHandle(cfg, act, body, u);
      if (r.status) { res.status(r.status).json({ error: r.error }); return; }
      res.status(200).json(r); return;
    }
    if (act === 'ladder') { // top 10 de TODAS las cuentas (hayan jugado o no), sin ADMIN
      const keys = []; let cur = '0';
      for (let n = 0; n < 50; n++) {
        const r = await redis(cfg, ['SCAN', cur, 'MATCH', 'cartas:user:*', 'COUNT', '200']);
        cur = String(r[0]); (r[1] || []).forEach((k) => keys.push(k));
        if (cur === '0') break;
      }
      const raws = keys.length ? await redis(cfg, ['MGET', ...keys]) : [];
      const rows = [];
      (raws || []).forEach((raw) => {
        if (!raw) return;
        let x; try { x = JSON.parse(raw); } catch (e) { return; }
        if (!x || !x.name || isAdmin(x)) return;
        rows.push({ name: x.name, pts: x.pts || 0, avatar: x.avatar || '' });
      });
      rows.sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name));
      const pos = rows.findIndex((r) => r.name.toLowerCase() === u.name.toLowerCase());
      res.status(200).json({ top: rows.slice(0, 10), me: u.pts || 0, pos: pos >= 0 ? pos + 1 : 0, total: rows.length }); return;
    }
    if (act === 'me') { res.status(200).json({ user: publicUser(u) }); return; }

    if (act === 'cardBuy') { // tienda de cartas nuevas
      const it = (DATA.shop || []).find((x) => x.id === String(body.id || ''));
      if (!it) { res.status(400).json({ error: 'Esa carta no está a la venta.' }); return; }
      if (u.owned.indexOf(it.id) >= 0) { res.status(409).json({ error: 'Ya tienes esa carta.', user: publicUser(u) }); return; }
      const cost = isAdmin(u) ? 0 : it.price;
      if (u.coins < cost) { res.status(402).json({ error: `Necesitas ${it.price} monedas.`, user: publicUser(u) }); return; }
      u.coins -= cost; u.owned.push(it.id);
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'deckSave') {
      const own = new Set(u.owned), clean = (l) => (Array.isArray(l) ? l : []).filter((x) => typeof x === 'string' && own.has(x)).slice(0, 80);
      const sl = Array.isArray(body.slots) ? body.slots.slice(0, 3) : [];
      u.decks = {
        deck: clean(body.deck),
        slots: [0, 1, 2].map((i) => (sl[i] && Array.isArray(sl[i].ids) ? { name: String(sl[i].name || 'Mazo').slice(0, 30), ids: clean(sl[i].ids), cover: String(sl[i].cover || '').slice(0, 60) } : null)),
      };
      await saveUser(cfg, u);
      res.status(200).json({ ok: true }); return;
    }
    if (act === 'fxEquip') { // equipar un efecto (kind: 'deploy' o 'sleeve')
      const kind = String(body.kind || ''), id = String(body.id || '');
      if (!FX_KINDS[kind] || FX_KINDS[kind][id] === undefined) { res.status(400).json({ error: 'Ese efecto no existe.' }); return; }
      if (!fxOwned(u).includes(id) && !isAdmin(u)) { res.status(403).json({ error: 'Aún no tienes ese efecto: cómpralo en la tienda.' }); return; }
      u.fx = { ...(u.fx || {}), [kind]: id };
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'fxBuy') { // comprar un efecto en la tienda
      const id = String(body.id || '');
      if (!FX_DEPLOY.includes(id)) { res.status(400).json({ error: 'Ese efecto no existe.' }); return; }
      if (FX_PASS.includes(id) && !isAdmin(u)) { res.status(403).json({ error: 'Ese efecto es exclusivo del pase de batalla.' }); return; }
      if (fxOwned(u).includes(id)) { res.status(409).json({ error: 'Ya tienes ese efecto.', user: publicUser(u) }); return; }
      const cost = isAdmin(u) ? 0 : FX_PRICE[id];
      if (u.coins < cost) { res.status(402).json({ error: `Necesitas ${FX_PRICE[id]} monedas.`, user: publicUser(u) }); return; }
      u.coins -= cost; u.fxOwned = [...(u.fxOwned || []), id];
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'avatarSet') { // foto de perfil: la ilustración de una carta que tengas desbloqueada (o vacía)
      const id = String(body.card || '');
      const okCard = u.owned.indexOf(id) >= 0 && ALL.some((c) => c.id === id && c.type === 'tropa'), okSkin = (u.skins || []).indexOf(id) >= 0 && !!SKIN_BY_ID[id];
      if (id && !okCard && !okSkin) { res.status(400).json({ error: 'Esa ilustración no está desbloqueada.' }); return; }
      u.avatar = id;
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'skinUnlock') { // desbloquear una skin guardada en el inventario
      const id = String(body.id || body.skin || '');
      if (!(u.invSkins || []).includes(id)) { res.status(409).json({ error: 'Esa skin no está en tu inventario.', user: publicUser(u) }); return; }
      u.invSkins = u.invSkins.filter((x) => x !== id); u.skins = u.skins || [];
      if (!u.skins.includes(id)) u.skins.push(id);
      await saveUser(cfg, u);
      res.status(200).json({ ok: true, user: publicUser(u) }); return;
    }
    if (act === 'skinBuy' || act === 'skinEquip') {
      const sk = SKIN_BY_ID[String(body.id || body.skin || '')];
      u.skins = u.skins || []; u.skinSel = u.skinSel || {};
      if (act === 'skinBuy') {
        if (!sk) { res.status(400).json({ error: 'Skin no válida.' }); return; }
        if (sk.pass) { res.status(403).json({ error: 'Esa skin es exclusiva del pase de batalla.' }); return; }
        if (u.skins.includes(sk.id)) { res.status(409).json({ error: 'Ya tienes esa skin.', user: publicUser(u) }); return; }
        if (u.owned.indexOf(sk.card) < 0) { res.status(403).json({ error: 'Necesitas tener la carta para comprar su skin.' }); return; }
        const cost = isAdmin(u) ? 0 : sk.price;
        if (u.coins < cost) { res.status(402).json({ error: `Necesitas ${sk.price} monedas.`, user: publicUser(u) }); return; }
        u.coins -= cost; u.skins.push(sk.id); u.skinSel[sk.card] = sk.id;
      } else {
        const card = String(body.card || '');
        if (!sk) delete u.skinSel[card];
        else if (!u.skins.includes(sk.id)) { res.status(403).json({ error: 'No tienes esa skin.' }); return; }
        else u.skinSel[sk.card] = sk.id;
      }
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'daily') {
      if (u.lastDaily === today()) { res.status(409).json({ error: 'Ya has cobrado la recompensa de hoy.', user: publicUser(u) }); return; }
      u.lastDaily = today(); u.coins += DAILY_COINS;
      await saveUser(cfg, u);
      res.status(200).json({ gained: DAILY_COINS, user: publicUser(u) }); return;
    }

    if (act === 'open') {
      const fromInv = !!body.inv; // sobre del inventario (pase de batalla...): no cuesta monedas
      const pk = packKey(body.pack), pf = packField(pk);
      const cost = isAdmin(u) ? 0 : PACK_COST;
      if (fromInv) {
        if ((u[pf] || 0) < 1) { res.status(409).json({ error: 'No tienes sobres en el inventario.', user: publicUser(u) }); return; }
        u[pf] -= 1;
      } else {
        if (u.coins < cost) { res.status(402).json({ error: `Necesitas ${PACK_COST} monedas.`, user: publicUser(u) }); return; }
        u.coins -= cost;
      }
      const ids = [];
      for (let k = 0; k < PACK_SIZE; k++) ids.push(drawCard(k === PACK_SIZE - 1 ? 'Rara' : null, PACK_POOLS[pk])); // la última es Rara o mejor
      const cards = ids.map((id) => {
        const isNew = u.owned.indexOf(id) < 0;
        let dup = 0;
        let lvl = 1, lvlUp = false, copies = 1;
        let dupCoins = 0;
        if (isNew) u.owned.push(id);
        else if ((DATA.actions || []).some((a) => a.id === id)) { dupCoins = MAXED_DUP_COINS; u.coins += dupCoins; lvl = levelOf(u, id); } // acción repetida: no cuenta copias, da oro directamente
        else if (levelOf(u, id) >= 3) { dupCoins = MAXED_DUP_COINS; u.coins += dupCoins; lvl = 3; } // ya a nivel 3: la copia da oro
        else { u.dups = u.dups || {}; const before = levelOf(u, id); u.dups[id] = (u.dups[id] || 0) + 1; lvl = levelOf(u, id); lvlUp = lvl > before; }
        if (!isNew && !dupCoins) copies = 1 + ((u.dups || {})[id] || 0); else if (isNew) lvl = 1;
        return { id, isNew, dupCoins, lvl, lvlUp, copies, act: (DATA.actions || []).some((a) => a.id === id) || undefined };
      });
      u.st = u.st || {}; u.st.packs = (u.st.packs || 0) + 1; seasonBump(u, 'packs');
      await saveUser(cfg, u);
      res.status(200).json({ cards, user: publicUser(u) }); return;
    }

    if (act === 'gachaPull') { // Destino: una tirada o una multi-tirada (10 por el precio de 10 sueltas)
      const n = body.n === 10 ? 10 : 1;
      const cost = isAdmin(u) ? 0 : GACHA.cost * n;
      if (u.coins < cost) { res.status(402).json({ error: `Necesitas ${GACHA.cost * n} monedas.`, user: publicUser(u) }); return; }
      u.coins -= cost;
      const rewards = [];
      for (let k = 0; k < n; k++) {
        const r = gachaRoll(u);
        if (r.kind === 'card') {
          const isAct = (DATA.actions || []).some((a) => a.id === r.id);
          r.isNew = u.owned.indexOf(r.id) < 0;
          if (r.isNew) u.owned.push(r.id);
          else if (isAct || levelOf(u, r.id) >= 3) { r.dupCoins = MAXED_DUP_COINS; u.coins += r.dupCoins; }
          else { u.dups = u.dups || {}; const before = levelOf(u, r.id); u.dups[r.id] = (u.dups[r.id] || 0) + 1; r.lvl = levelOf(u, r.id); r.lvlUp = r.lvl > before; r.copies = 1 + u.dups[r.id]; }
        } else {
          const own = r.kind === 'skin' ? (u.skins || []).includes(r.id) || (u.invSkins || []).includes(r.id) : fxOwned(u).includes(r.id);
          r.isNew = !own;
          if (r.isNew) { if (r.kind === 'skin') { u.skins = u.skins || []; u.skins.push(r.id); } else u.fxOwned = [...(u.fxOwned || []), r.id]; }
          else { u.invDup = u.invDup || {}; const key = r.kind + ':' + r.id; u.invDup[key] = (u.invDup[key] || 0) + 1; r.inv = true; } // repetido: al inventario (sin opción de desbloquear por ahora)
        }
        rewards.push(r);
      }
      u.st = u.st || {}; u.st.gacha = (u.st.gacha || 0) + n;
      await saveUser(cfg, u);
      res.status(200).json({ rewards, reward: rewards[0], user: publicUser(u) }); return;
    }

    if (act === 'reforge') { // Reforja: 3 repetidos de la misma clase (skins o efectos) -> 1 skin/efecto que no tengas
      const kind = body.kind === 'fx' ? 'fx' : 'skin';
      const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
      if (keys.length !== 3 || keys.some((k) => !k.startsWith(kind + ':'))) { res.status(400).json({ error: 'Elige 3 objetos repetidos de la misma clase.', user: publicUser(u) }); return; }
      const need = {};
      keys.forEach((k) => { need[k] = (need[k] || 0) + 1; });
      u.invDup = u.invDup || {};
      if (Object.keys(need).some((k) => (u.invDup[k] || 0) < need[k])) { res.status(400).json({ error: 'No tienes esas copias repetidas.', user: publicUser(u) }); return; }
      let pool;
      if (kind === 'skin') pool = SKINS.filter((k) => !k.pass && !(u.skins || []).includes(k.id) && !(u.invSkins || []).includes(k.id)).map((k) => ({ id: k.id, rarity: skinRar(k) }));
      else pool = FX_DEPLOY.filter((id) => FX_PRICE[id] > 0 && !FX_PASS.includes(id) && !fxOwned(u).includes(id)).map((id) => ({ id, rarity: fxRar(id) }));
      if (!pool.length) { res.status(400).json({ error: kind === 'skin' ? 'Ya tienes todas las skins.' : 'Ya tienes todos los efectos.', user: publicUser(u) }); return; }
      Object.keys(need).forEach((k) => { u.invDup[k] -= need[k]; if (u.invDup[k] <= 0) delete u.invDup[k]; });
      const pick = pool[crypto.randomInt(0, pool.length)];
      const reward = { kind, id: pick.id, rarity: pick.rarity, isNew: true };
      if (kind === 'skin') { u.skins = u.skins || []; u.skins.push(pick.id); }
      else { u.fxOwned = [...(u.fxOwned || []), pick.id]; reward.fxKind = Object.keys(FX_KINDS).find((k) => FX_KINDS[k][pick.id] !== undefined); }
      u.st = u.st || {}; u.st.reforge = (u.st.reforge || 0) + 1;
      await saveUser(cfg, u);
      res.status(200).json({ reward, user: publicUser(u) }); return;
    }

    if (act === 'missionClaim') { // recoger la caja de una misión completada
      const m = MS.MISSIONS.find((x) => x.id === String(body.id || ''));
      if (!m) { res.status(400).json({ error: 'Esa misión no existe.' }); return; }
      u.msClaimed = u.msClaimed || [];
      if (u.msClaimed.includes(m.id)) { res.status(409).json({ error: 'Ya has recogido esa caja.', user: publicUser(u) }); return; }
      { const ms2 = missionStats(u); if ((ms2[m.stat] || 0) < m.goal && !ms2['hit_' + m.id]) { res.status(403).json({ error: 'Aún no has completado esa misión.', user: publicUser(u) }); return; } }
      u.msClaimed.push(m.id); u.boxes = (u.boxes || 0) + 1;
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'seasonMissionClaim') { // recoger el XP de una misión de temporada completada
      const m = SS.SEASON.missions.find((x) => x.id === String(body.id || ''));
      if (!m) { res.status(400).json({ error: 'Esa misión no existe.' }); return; }
      if (!seasonActive()) { res.status(403).json({ error: 'La temporada ha terminado.', user: publicUser(u) }); return; }
      const se = ensureSeason(u);
      if (se.mc.includes(m.id)) { res.status(409).json({ error: 'Ya has recogido esa misión.', user: publicUser(u) }); return; }
      if ((se.st[m.stat] || 0) < m.goal && !se.st['hit_' + m.id]) { res.status(403).json({ error: 'Aún no has completado esa misión.', user: publicUser(u) }); return; }
      se.mc.push(m.id); se.xp += m.xp;
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'seasonLevelClaim') { // recoger la recompensa de un nivel del pase
      const L = SS.SEASON.levels.find((x) => x.lv === (body.lv | 0));
      if (!L) { res.status(400).json({ error: 'Ese nivel no existe.' }); return; }
      const se = ensureSeason(u);
      if (se.lc.includes(L.lv)) { res.status(409).json({ error: 'Ya has recogido esa recompensa.', user: publicUser(u) }); return; }
      if (SS.levelOf(se.xp) < L.lv) { res.status(403).json({ error: 'Aún no has llegado a ese nivel.', user: publicUser(u) }); return; }
      se.lc.push(L.lv); grantReward(u, L.reward);
      await saveUser(cfg, u);
      res.status(200).json({ reward: L.reward, user: publicUser(u) }); return;
    }
    if (act === 'rankClaim') { // recoger la caja de un rango alcanzado
      const rk = MS.RANK_BOXES.find((x) => x.id === String(body.id || ''));
      if (!rk) { res.status(400).json({ error: 'Ese rango no existe.' }); return; }
      u.rkClaimed = u.rkClaimed || [];
      if (u.rkClaimed.includes(rk.id)) { res.status(409).json({ error: 'Ya has recogido esa caja.', user: publicUser(u) }); return; }
      if (rankReached(u) < rk.min) { res.status(403).json({ error: 'Aún no has alcanzado ese rango.', user: publicUser(u) }); return; }
      u.rkClaimed.push(rk.id); u.boxes = (u.boxes || 0) + 1;
      await saveUser(cfg, u);
      res.status(200).json({ user: publicUser(u) }); return;
    }
    if (act === 'boxOpen') { // abrir una caja del inventario
      if ((u.boxes || 0) < 1) { res.status(409).json({ error: 'No tienes cajas.', user: publicUser(u) }); return; }
      if (boxLocked(u)) { res.status(409).json({ error: 'Lo tienes todo desbloqueado: no hay nada nuevo que pueda salir de una caja.', user: publicUser(u) }); return; }
      u.boxes -= 1;
      const reward = rollBox(u);
      await saveUser(cfg, u);
      res.status(200).json({ reward, user: publicUser(u) }); return;
    }
    if (act === 'gameStart') { u.startedAt = Date.now(); u.gameDiff = Math.max(0, Math.min(2, body.diff | 0)); await saveUser(cfg, u); res.status(200).json({ ok: true }); return; }

    if (act === 'gameFinish') {
      const secs = (Date.now() - (u.startedAt || 0)) / 1000;
      const rounds = Number(body.rounds) || 0;
      const valid = u.startedAt && secs >= MIN_GAME_SECONDS && rounds >= MIN_GAME_ROUNDS;
      u.startedAt = 0;
      const diff = body.mode === 'rumble' ? 0 : u.gameDiff | 0; u.gameDiff = 0; // Royal Rumble: siempre IA Normal
      if (u.rewardDay !== today()) { u.rewardDay = today(); u.rewardCount = 0; }
      if (valid) recordGame(u, { won: !!body.won, kind: 'ia', mode: normMode(body.mode), cards: body.cards });
      let gained = 0, pts = 0;
      if (valid && u.rewardCount < MAX_GAME_REWARDS_PER_DAY) {
        gained = Math.round((GAME_COINS.played + (body.won ? GAME_COINS.win : 0)) * DIFF_MULT[diff]);
        u.rewardCount++; u.coins += gained;
      }
      if (valid && body.won && diff === 2) pts = await addPts(cfg, u, EXPERT_PTS); // los puntos no dependen del límite diario de monedas
      await saveUser(cfg, u);
      res.status(200).json({ gained, pts, user: publicUser(u), capped: valid && gained === 0 }); return;
    }

    res.status(400).json({ error: 'Acción desconocida.' });
  } catch (e) {
    res.status(500).json({ error: e.message || 'Error del servidor.' });
  }
};
