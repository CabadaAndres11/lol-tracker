// Amistades del juego de cartas: solicitudes, presencia (en línea / jugando), chat e invitaciones a partida.
// Todo vive en Redis. El guion bajo inicial hace que Vercel no lo exponga como endpoint.
const crypto = require('crypto');
const { redis } = require('./_redis');

const MAX_FRIENDS = 100, MAX_PENDING = 50, CHAT_KEEP = 80, CHAT_LEN = 300, PRES_TTL = 45, INV_TTL = 120;
const lc = (n) => String(n).toLowerCase();
const sKey = (n) => `cartas:soc:${lc(n)}`;
const presKey = (n) => `cartas:pres:${lc(n)}`;
const chatKey = (a, b) => `cartas:chat:${[lc(a), lc(b)].sort().join('|')}`;
const readKey = (me, o) => `cartas:chrd:${lc(me)}|${lc(o)}`;
const invKey = (n) => `cartas:invs:${lc(n)}`;
const uKey = (n) => `cartas:user:${lc(n)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const parse = (raw, d) => { try { return raw ? JSON.parse(raw) : d; } catch (e) { return d; } };

async function lock(cfg, fn) { // un solo cerrojo global para las operaciones que tocan a dos jugadores
  const key = 'cartas:soc:lk', tok = crypto.randomBytes(6).toString('hex');
  for (let i = 0; i < 60; i++) {
    if ((await redis(cfg, ['SET', key, tok, 'NX', 'PX', '3000'])) === 'OK') {
      try { return await fn(); } finally { if ((await redis(cfg, ['GET', key])) === tok) await redis(cfg, ['DEL', key]); }
    }
    await sleep(40);
  }
  throw new Error('Ocupado, reinténtalo.');
}
async function rec(cfg, n) { const r = parse(await redis(cfg, ['GET', sKey(n)]), null) || {}; return { fr: r.fr || [], inc: r.inc || [], out: r.out || [] }; }
const saveRec = (cfg, n, r) => redis(cfg, ['SET', sKey(n), JSON.stringify(r)]);
const has = (arr, n) => arr.some((x) => lc(x) === lc(n));
const without = (arr, n) => arr.filter((x) => lc(x) !== lc(n));
// Nombre y foto de una cuenta (null si no existe)
async function profile(cfg, n) {
  const x = parse(await redis(cfg, ['GET', uKey(n)]), null);
  return x ? { name: x.name, avatar: x.avatar || '' } : null;
}
async function profiles(cfg, names) {
  if (!names.length) return [];
  const raws = await redis(cfg, ['MGET', ...names.map(uKey)]);
  return names.map((n, k) => { const x = parse(raws[k], null); return x ? { name: x.name, avatar: x.avatar || '' } : { name: n, avatar: '' }; });
}
const cleanName = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 16);

async function socialHandle(cfg, act, body, u) {
  const me = u.name;
  // ---- latido + lista de amigos (se llama cada pocos segundos) ----
  if (act === 'socPoll') {
    await redis(cfg, ['SET', presKey(me), body.playing ? 'play' : 'on', 'EX', String(PRES_TTL)]);
    const r = await rec(cfg, me);
    const names = r.fr.concat(r.inc);
    const profs = await profiles(cfg, names);
    const pr = r.fr.length ? await redis(cfg, ['MGET', ...r.fr.map(presKey)]) : [];
    const chats = r.fr.length ? await redis(cfg, ['MGET', ...r.fr.map((n) => chatKey(me, n))]) : [];
    const reads = r.fr.length ? await redis(cfg, ['MGET', ...r.fr.map((n) => readKey(me, n))]) : [];
    const friends = r.fr.map((n, k) => {
      const msgs = parse(chats[k], []), seen = Number(reads[k] || 0);
      return { name: profs[k].name, avatar: profs[k].avatar, st: pr[k] === 'play' ? 'play' : pr[k] ? 'on' : 'off', unread: msgs.filter((m) => lc(m.f) !== lc(me) && m.t > seen).length, last: msgs.length ? msgs[msgs.length - 1].t : 0 };
    });
    const inc = r.inc.map((n, k) => profs[r.fr.length + k]);
    const now = Date.now();
    const invs = parse(await redis(cfg, ['GET', invKey(me)]), []).filter((i) => now - i.t < INV_TTL * 1000);
    const out = { ok: true, friends, inc, out: r.out, invs };
    const chatWith = cleanName(body.chat);
    if (chatWith && has(r.fr, chatWith)) {
      const msgs = parse(await redis(cfg, ['GET', chatKey(me, chatWith)]), []);
      out.chat = { with: chatWith, msgs: msgs.slice(-CHAT_KEEP) };
      await redis(cfg, ['SET', readKey(me, chatWith), String(now), 'EX', String(60 * 86400)]);
    }
    return out;
  }
  // ---- buscar jugadores por nombre (empieza por…) ----
  if (act === 'socSearch') {
    const q = cleanName(body.q).toLowerCase().replace(/[*?\[\]\\]/g, '');
    if (q.length < 2) return { ok: true, res: [] };
    const keys = []; let cur = '0';
    for (let n = 0; n < 40 && keys.length < 400; n++) {
      const r = await redis(cfg, ['SCAN', cur, 'MATCH', `cartas:user:${q}*`, 'COUNT', '300']);
      cur = String(r[0]); (r[1] || []).forEach((k) => keys.push(k));
      if (cur === '0') break;
    }
    const names = keys.slice(0, 8).map((k) => k.slice('cartas:user:'.length));
    const profs = (await profiles(cfg, names)).filter((p) => lc(p.name) !== lc(me) && lc(p.name) !== 'admin');
    const r = await rec(cfg, me);
    return { ok: true, res: profs.map((p) => ({ name: p.name, avatar: p.avatar, rel: has(r.fr, p.name) ? 'friend' : has(r.out, p.name) ? 'sent' : has(r.inc, p.name) ? 'recv' : 'none' })) };
  }
  // ---- enviar / aceptar / rechazar solicitud, borrar amigo ----
  if (act === 'socAdd' || act === 'socAccept' || act === 'socDecline' || act === 'socCancel' || act === 'socRemove') {
    const other = await profile(cfg, cleanName(body.name));
    if (!other || lc(other.name) === lc(me) || lc(other.name) === 'admin') return { status: 404, error: 'No existe ningún jugador con ese nombre.' };
    return lock(cfg, async () => {
      const a = await rec(cfg, me), b = await rec(cfg, other.name);
      if (act === 'socAdd' || act === 'socAccept') {
        if (has(a.fr, other.name)) return { ok: true, msg: 'Ya sois amigos.' };
        const theySent = has(a.inc, other.name);
        if (act === 'socAccept' && !theySent) return { status: 404, error: 'Esa solicitud ya no existe.' };
        if (a.fr.length >= MAX_FRIENDS || b.fr.length >= MAX_FRIENDS) return { status: 409, error: 'Has llegado al máximo de amigos.' };
        if (theySent) { // se cruzan: quedan como amigos
          a.inc = without(a.inc, other.name); b.out = without(b.out, me);
          a.fr.push(other.name); b.fr.push(me);
          await saveRec(cfg, me, a); await saveRec(cfg, other.name, b);
          return { ok: true, msg: `Ahora eres amigo de ${other.name}.` };
        }
        if (has(a.out, other.name)) return { ok: true, msg: 'Ya le enviaste una solicitud.' };
        if (a.out.length >= MAX_PENDING || b.inc.length >= MAX_PENDING) return { status: 409, error: 'Demasiadas solicitudes pendientes.' };
        a.out.push(other.name); b.inc.push(me);
        await saveRec(cfg, me, a); await saveRec(cfg, other.name, b);
        return { ok: true, msg: `Solicitud enviada a ${other.name}.` };
      }
      if (act === 'socDecline') { a.inc = without(a.inc, other.name); b.out = without(b.out, me); }
      else if (act === 'socCancel') { a.out = without(a.out, other.name); b.inc = without(b.inc, me); }
      else { a.fr = without(a.fr, other.name); b.fr = without(b.fr, me); await redis(cfg, ['DEL', chatKey(me, other.name)]); }
      await saveRec(cfg, me, a); await saveRec(cfg, other.name, b);
      return { ok: true };
    });
  }
  // ---- chat ----
  if (act === 'socSend') {
    const to = cleanName(body.to), text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, CHAT_LEN);
    if (!text) return { status: 400, error: 'Escribe un mensaje.' };
    const r = await rec(cfg, me);
    if (!has(r.fr, to)) return { status: 403, error: 'Solo puedes escribir a tus amigos.' };
    return lock(cfg, async () => {
      const k = chatKey(me, to), msgs = parse(await redis(cfg, ['GET', k]), []);
      msgs.push({ f: me, t: Date.now(), x: text });
      await redis(cfg, ['SET', k, JSON.stringify(msgs.slice(-CHAT_KEEP)), 'EX', String(30 * 86400)]);
      await redis(cfg, ['SET', readKey(me, to), String(Date.now()), 'EX', String(60 * 86400)]);
      return { ok: true };
    });
  }
  // ---- invitar a partida / responder ----
  if (act === 'socInvite') {
    const to = cleanName(body.to), kind = body.kind === 'vs4' ? 'vs4' : 'pvp', code = String(body.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const r = await rec(cfg, me);
    if (!has(r.fr, to)) return { status: 403, error: 'Solo puedes invitar a tus amigos.' };
    if (!(await redis(cfg, ['GET', presKey(to)]))) return { status: 409, error: `${to} no está conectado.` };
    if (code.length !== 5 || !(await redis(cfg, ['GET', `cartas:${kind === 'vs4' ? 'vs4' : 'pvp'}:room:${code}`]))) return { status: 404, error: 'La sala ya no existe.' };
    return lock(cfg, async () => {
      const now = Date.now(), list = parse(await redis(cfg, ['GET', invKey(to)]), []).filter((i) => now - i.t < INV_TTL * 1000 && !(lc(i.from) === lc(me) && i.code === code));
      list.push({ id: crypto.randomBytes(5).toString('hex'), from: me, kind, code, mode: body.mode === 'revive' ? 'revive' : '', t: now });
      await redis(cfg, ['SET', invKey(to), JSON.stringify(list.slice(-10)), 'EX', String(INV_TTL)]);
      return { ok: true, msg: `Invitación enviada a ${to}.` };
    });
  }
  if (act === 'socInvAns') {
    const id = String(body.id || '');
    return lock(cfg, async () => {
      const list = parse(await redis(cfg, ['GET', invKey(me)]), []), inv = list.find((i) => i.id === id);
      await redis(cfg, ['SET', invKey(me), JSON.stringify(list.filter((i) => i.id !== id)), 'EX', String(INV_TTL)]);
      return { ok: true, inv: inv && body.accept ? inv : null };
    });
  }
  return { status: 400, error: 'Acción desconocida.' };
}

module.exports = { socialHandle };
