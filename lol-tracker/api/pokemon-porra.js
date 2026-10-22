// La porra del torneo: cada participante predice
//   - el orden de los 8 que se clasifican en la fase de Liga, y
//   - su top 3 del bracket eliminatorio (1.º, 2.º y 3.º, elegidos entre esos 8).
// Se guarda en un hash de Redis: campo = nombre del participante en minúsculas,
// valor = JSON { league: [8 nombres], top3: [3 nombres], at }.
// Modificar la porra requiere el PIN del participante (ver _pin.js).
const crypto = require('crypto');
const { redisConfig, redis } = require('./_redis');
const { checkPin } = require('./_pin');
const { PLAYERS } = require('./_league');

const PLAYERS_KEY = 'pokemon:players';
const PORRAS_KEY = 'pokemon:porras';
const SPECTATORS_KEY = 'pokemon:porras:spec'; // porras de espectadores (no participantes)
const MAX_SPECTATORS = 300;
const MAX_FAILS = 10;
const BLOCK_SECONDS = 900;
const QUALIFY = 8;

// La porra se cierra cuando empieza el torneo.
const CLOSES_AT = Date.parse('2026-11-15T17:00:00+01:00');

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

// Valida el contenido de una porra. Devuelve { league, top3 } o lanza Error con mensaje.
function validatePorra(body) {
  const canon = (name) => PLAYERS.find((p) => p.toLowerCase() === clean(name).toLowerCase());
  const league = (Array.isArray(body.league) ? body.league : []).map(canon);
  const top3 = (Array.isArray(body.top3) ? body.top3 : []).map(canon);

  if (league.length !== QUALIFY || league.some((n) => !n) || new Set(league).size !== QUALIFY) {
    throw new Error(`Elige ${QUALIFY} participantes distintos para la Liga.`);
  }
  if (top3.length !== 3 || top3.some((n) => !n || !league.includes(n)) || new Set(top3).size !== 3) {
    throw new Error('El top 3 debe ser de 3 participantes distintos entre los 8 elegidos.');
  }
  return { league, top3 };
}

// El PIN de un espectador se guarda solo como huella (con el secreto del servidor si existe).
const hashPin = (id, pin) =>
  crypto.createHash('sha256').update(`${process.env.PIN_SECRET || ''}|${id}|${pin}`).digest('hex');

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
      const flatSpec = await redis(cfg, ['HGETALL', SPECTATORS_KEY]);
      const spectators = [];
      for (let i = 0; i < flatSpec.length; i += 2) {
        const { name, league, top3, at } = JSON.parse(flatSpec[i + 1]); // sin la huella del PIN
        spectators.push({ name, league, top3, at });
      }
      spectators.sort((a, b) => a.at - b.at);
      res.status(200).json({ porras, spectators, closed, closesAt: new Date(CLOSES_AT).toISOString() });
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      // ---- Porra de un espectador (nombre libre + PIN que elige él) ----
      if (body.spectator) {
        const name = clean(body.name);
        const id = name.toLowerCase();
        const pin = String(body.pin ?? '').trim();

        if (name.length < 2 || name.length > 20 || /[<>|]/.test(name)) {
          res.status(400).json({ error: 'El nombre debe tener entre 2 y 20 caracteres (sin < > |).' });
          return;
        }
        if (!/^\d{4}$/.test(pin)) {
          res.status(400).json({ error: 'El PIN debe tener 4 dígitos.' });
          return;
        }
        const taken = (await redis(cfg, ['ZRANGE', PLAYERS_KEY, 0, -1])).map((x) => JSON.parse(x).name.toLowerCase());
        if (taken.includes(id) || PLAYERS.some((p) => p.toLowerCase() === id)) {
          res.status(400).json({ error: 'Ese nombre es de un participante. Si eres tú, elige "Soy participante".' });
          return;
        }
        if (closed) {
          res.status(403).json({ error: 'La porra está cerrada: el torneo ya ha empezado.' });
          return;
        }

        let content;
        try {
          content = validatePorra(body);
        } catch (err) {
          res.status(400).json({ error: err.message });
          return;
        }

        const failKey = `pokemon:pinfail:spec:${id}`;
        const existing = await redis(cfg, ['HGET', SPECTATORS_KEY, id]);
        if (existing) {
          if (Number((await redis(cfg, ['GET', failKey])) || 0) >= MAX_FAILS) {
            res.status(429).json({ error: 'Demasiados intentos con PIN incorrecto. Espera unos 15 minutos.' });
            return;
          }
          const a = Buffer.from(JSON.parse(existing).pin || '');
          const b = Buffer.from(hashPin(id, pin));
          if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
            await redis(cfg, ['INCR', failKey]);
            await redis(cfg, ['EXPIRE', failKey, BLOCK_SECONDS]);
            res.status(401).json({ error: 'Ese nombre ya está en uso. Si es tuyo, usa tu PIN; si no, elige otro nombre.' });
            return;
          }
        } else if ((await redis(cfg, ['HLEN', SPECTATORS_KEY])) >= MAX_SPECTATORS) {
          res.status(403).json({ error: 'Se ha alcanzado el máximo de porras de espectadores.' });
          return;
        }

        const porra = { name, ...content, at: Date.now() };
        await redis(cfg, ['HSET', SPECTATORS_KEY, id, JSON.stringify({ ...porra, pin: hashPin(id, pin) })]);
        res.status(200).json({ spectator: true, porra });
        return;
      }

      // ---- Porra de un participante (con su PIN) ----
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

      let content;
      try {
        content = validatePorra(body);
      } catch (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      const { league, top3 } = content;

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
