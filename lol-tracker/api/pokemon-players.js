// Lista de participantes del torneo Pokémon. Guarda los nombres en Redis
// (Upstash, vía la integración de Vercel Marketplace), porque Vercel no
// permite escribir ficheros de forma persistente.
const KEY = 'pokemon:players';
// Inscripciones cerradas: poner a true para volver a permitir apuntarse.
const REGISTRATION_OPEN = false;
const MAX_PLAYERS = 64;
const MIN_LEN = 2;
const MAX_LEN = 24;

function redisConfig() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

async function redis(cfg, command) {
  const r = await fetch(cfg.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${cfg.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || `Redis respondió ${r.status}`);
  return data.result;
}

// Los miembros se guardan como JSON {name, at} en un sorted set cuyo score
// es la fecha de alta, así la lista sale siempre por orden de inscripción.
async function listPlayers(cfg) {
  const raw = await redis(cfg, ['ZRANGE', KEY, 0, -1]);
  return raw.map((s) => JSON.parse(s));
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const cfg = redisConfig();
  if (!cfg) {
    res.status(500).json({
      error: 'Falta conectar la base de datos (Upstash Redis) al proyecto en Vercel.',
    });
    return;
  }

  try {
    if (req.method === 'GET') {
      res.status(200).json({ players: await listPlayers(cfg) });
      return;
    }

    if (req.method === 'POST') {
      if (!REGISTRATION_OPEN) {
        res.status(403).json({ error: 'Las inscripciones están cerradas.' });
        return;
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const name = String(body.name ?? '').replace(/\s+/g, ' ').trim();

      if (name.length < MIN_LEN || name.length > MAX_LEN) {
        res.status(400).json({ error: `El nombre debe tener entre ${MIN_LEN} y ${MAX_LEN} caracteres.` });
        return;
      }
      if (/[<>]/.test(name)) {
        res.status(400).json({ error: 'El nombre contiene caracteres no permitidos.' });
        return;
      }

      const players = await listPlayers(cfg);
      if (players.length >= MAX_PLAYERS) {
        res.status(400).json({ error: 'La lista de participantes está completa.' });
        return;
      }
      if (players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
        res.status(409).json({ error: 'Ese nombre ya está en la lista.' });
        return;
      }

      const at = Date.now();
      await redis(cfg, ['ZADD', KEY, at, JSON.stringify({ name, at })]);
      res.status(201).json({ players: [...players, { name, at }] });
      return;
    }

    res.setHeader('Allow', 'GET, POST');
    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
