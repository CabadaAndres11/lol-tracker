// Pokémon rival ("el de enfrente" en la escena de combate) que elige cada participante.
// Hash de Redis: campo = nombre del jugador en minúsculas, valor = JSON { species, dexId? }.
// Mandar rival: null borra la elección.
const { redisConfig, redis } = require('./_redis');
const { checkPin } = require('./_pin');

const PLAYERS_KEY = 'pokemon:players';
const RIVALS_KEY = 'pokemon:rivals';
const MAX_FIELD = 30;

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const cfg = redisConfig();
  if (!cfg) {
    res.status(500).json({ error: 'Falta conectar la base de datos (Upstash Redis) al proyecto en Vercel.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const flat = await redis(cfg, ['HGETALL', RIVALS_KEY]);
      const rivals = {};
      for (let i = 0; i < flat.length; i += 2) rivals[flat[i]] = JSON.parse(flat[i + 1]);
      res.status(200).json({ rivals });
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const id = clean(body.player).toLowerCase();

      const players = (await redis(cfg, ['ZRANGE', PLAYERS_KEY, 0, -1])).map((s) => JSON.parse(s));
      if (!id || !players.some((p) => p.name.toLowerCase() === id)) {
        res.status(404).json({ error: 'Ese participante no existe.' });
        return;
      }

      const denied = await checkPin(cfg, req, id);
      if (denied) {
        res.status(denied.status).json(denied.body);
        return;
      }

      if (body.rival == null) {
        await redis(cfg, ['HDEL', RIVALS_KEY, id]);
        res.status(200).json({ id, rival: null });
        return;
      }

      const species = clean(body.rival.species);
      if (!species) {
        res.status(400).json({ error: 'Indica qué Pokémon es el rival.' });
        return;
      }
      if (species.length > MAX_FIELD || /[<>]/.test(species)) {
        res.status(400).json({ error: 'Nombre de Pokémon no válido.' });
        return;
      }
      const d = body.rival.dexId;
      const rival = { species };
      if (Number.isInteger(d) && d > 0 && d < 20000) rival.dexId = d;
      if (body.rival.shiny === true) rival.shiny = true;

      await redis(cfg, ['HSET', RIVALS_KEY, id, JSON.stringify(rival)]);
      res.status(200).json({ id, rival });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
