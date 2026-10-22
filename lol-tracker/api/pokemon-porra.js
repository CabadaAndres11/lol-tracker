// La porra del torneo: cada participante predice
//   - el orden de los 8 que se clasifican en la fase de Liga, y
//   - su top 3 del bracket eliminatorio (1.º, 2.º y 3.º, elegidos entre esos 8).
// Se guarda en un hash de Redis: campo = nombre del participante en minúsculas,
// valor = JSON { league: [8 nombres], top3: [3 nombres], at }.
// Modificar la porra requiere el PIN del participante (ver _pin.js).
const { redisConfig, redis } = require('./_redis');
const { checkPin } = require('./_pin');
const { PLAYERS } = require('./_league');

const PLAYERS_KEY = 'pokemon:players';
const PORRAS_KEY = 'pokemon:porras';
const QUALIFY = 8;

// La porra se cierra cuando empieza el torneo.
const CLOSES_AT = Date.parse('2026-11-15T17:00:00+01:00');

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const cfg = redisConfig();
  if (!cfg) {
    res.status(500).json({ error: 'Falta conectar la base de datos (Upstash Redis) al proyecto en Vercel.' });
    return;
  }

  try {
    const closed = Date.now() >= CLOSES_AT;

    if (req.method === 'GET') {
      const flat = await redis(cfg, ['HGETALL', PORRAS_KEY]);
      const porras = {};
      for (let i = 0; i < flat.length; i += 2) porras[flat[i]] = JSON.parse(flat[i + 1]);
      res.status(200).json({ porras, closed, closesAt: new Date(CLOSES_AT).toISOString() });
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const id = clean(body.player).toLowerCase();

      const registered = (await redis(cfg, ['ZRANGE', PLAYERS_KEY, 0, -1])).map((s) => JSON.parse(s));
      if (!id || !registered.some((p) => p.name.toLowerCase() === id)) {
        res.status(404).json({ error: 'Ese participante no existe.' });
        return;
      }

      const denied = await checkPin(cfg, req, id);
      if (denied) {
        res.status(denied.status).json(denied.body);
        return;
      }

      if (closed) {
        res.status(403).json({ error: 'La porra está cerrada: el torneo ya ha empezado.' });
        return;
      }

      // Nombres válidos = los de la liga; se guardan tal cual están escritos en PLAYERS.
      const canon = (name) => PLAYERS.find((p) => p.toLowerCase() === clean(name).toLowerCase());
      const league = (Array.isArray(body.league) ? body.league : []).map(canon);
      const top3 = (Array.isArray(body.top3) ? body.top3 : []).map(canon);

      if (league.length !== QUALIFY || league.some((n) => !n) || new Set(league).size !== QUALIFY) {
        res.status(400).json({ error: `Elige ${QUALIFY} participantes distintos para la Liga.` });
        return;
      }
      if (top3.length !== 3 || top3.some((n) => !n || !league.includes(n)) || new Set(top3).size !== 3) {
        res.status(400).json({ error: 'El top 3 debe ser de 3 participantes distintos entre los 8 elegidos.' });
        return;
      }

      const porra = { league, top3, at: Date.now() };
      await redis(cfg, ['HSET', PORRAS_KEY, id, JSON.stringify(porra)]);
      res.status(200).json({ id, porra });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
