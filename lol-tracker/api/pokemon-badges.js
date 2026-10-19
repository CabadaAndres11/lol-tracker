// Medallas de cada participante: 8 medallas + Liga Pokémon = 9 bits.
// Se guardan como un número (máscara de bits) en un hash de Redis:
// campo = nombre del jugador en minúsculas, valor = máscara (0 a 511).
const { redisConfig, redis } = require('./_redis');
const { checkPin } = require('./_pin');

const PLAYERS_KEY = 'pokemon:players';
const BADGES_KEY = 'pokemon:badges';
const TOTAL = 9;
const FULL_MASK = (1 << TOTAL) - 1;

const has = (mask, i) => (mask & (1 << i)) !== 0;

// Regla: una medalla solo puede estar activa si la anterior también lo está,
// pero solo se exige a las que se acaban de activar (quitar es libre).
function validateChange(oldMask, newMask) {
  for (let i = 1; i < TOTAL; i++) {
    const added = has(newMask, i) && !has(oldMask, i);
    if (added && !has(newMask, i - 1)) {
      return `No puedes activar la medalla ${i + 1} sin tener la anterior.`;
    }
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const cfg = redisConfig();
  if (!cfg) {
    res.status(500).json({ error: 'Falta conectar la base de datos (Upstash Redis) al proyecto en Vercel.' });
    return;
  }

  try {
    if (req.method === 'GET') {
      const flat = await redis(cfg, ['HGETALL', BADGES_KEY]);
      const badges = {};
      for (let i = 0; i < flat.length; i += 2) badges[flat[i]] = Number(flat[i + 1]);
      res.status(200).json({ badges });
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const id = String(body.player ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
      const mask = body.mask;

      if (!Number.isInteger(mask) || mask < 0 || mask > FULL_MASK) {
        res.status(400).json({ error: 'Valor de medallas no válido.' });
        return;
      }

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

      const oldMask = Number((await redis(cfg, ['HGET', BADGES_KEY, id])) || 0);
      const problem = validateChange(oldMask, mask);
      if (problem) {
        res.status(400).json({ error: problem });
        return;
      }

      await redis(cfg, ['HSET', BADGES_KEY, id, mask]);
      res.status(200).json({ id, mask });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
