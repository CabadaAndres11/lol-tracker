// Resultados de la liga (todos contra todos). Gana quien reciba el clic: +3 puntos.
// Los resultados se guardan en un hash de Redis:
//   campo = pareja de jugadores en minúsculas y ordenados ("ana|luis"), valor = ganador en minúsculas.
//
// Opcional: si defines la variable de entorno LEAGUE_ADMIN_KEY en Vercel, solo quien
// conozca esa clave podrá marcar o borrar resultados (los demás solo los verán).
const crypto = require('crypto');
const { redisConfig, redis } = require('./_redis');
const { PLAYERS } = require('./_league');

const LEAGUE_KEY = 'pokemon:league';


const BRACKET_IDS = ['q1', 'q2', 'q3', 'q4', 's1', 's2', 'f'];

const lc = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const matchKey = (a, b) => [lc(a), lc(b)].sort().join('|');

function adminOk(req) {
  const expected = process.env.LEAGUE_ADMIN_KEY;
  if (!expected) return true; // sin clave configurada, cualquiera puede marcar
  const given = String(req.headers['x-admin-key'] ?? '');
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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
      const flat = await redis(cfg, ['HGETALL', LEAGUE_KEY]);
      const results = {};
      for (let i = 0; i < flat.length; i += 2) results[flat[i]] = flat[i + 1];
      res.status(200).json({ players: PLAYERS, results, protected: Boolean(process.env.LEAGUE_ADMIN_KEY) });
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      if (!adminOk(req)) {
        res.status(401).json({ error: 'Clave de administrador incorrecta.', needKey: true });
        return;
      }

      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const known = PLAYERS.map(lc);

      // Reiniciar: 'league' borra todos los resultados (liga y bracket); 'bracket' solo el bracket.
      // Solo se permite si hay clave de administrador configurada (adminOk ya la ha comprobado).
      if (body.reset != null) {
        if (!process.env.LEAGUE_ADMIN_KEY) {
          res.status(403).json({ error: 'Para reiniciar hay que configurar LEAGUE_ADMIN_KEY en Vercel.' });
          return;
        }
        if (body.reset === 'league') {
          await redis(cfg, ['DEL', LEAGUE_KEY]);
        } else if (body.reset === 'bracket') {
          await redis(cfg, ['HDEL', LEAGUE_KEY, ...BRACKET_IDS.map((id) => `bk:${id}`)]);
        } else {
          res.status(400).json({ error: 'Reinicio no válido.' });
          return;
        }
        res.status(200).json({ reset: body.reset });
        return;
      }

      // Ganador de un cruce del bracket (cuartos q1-q4, semifinales s1-s2, final f).
      if (body.bracket != null) {
        const id = String(body.bracket);
        if (!BRACKET_IDS.includes(id)) {
          res.status(400).json({ error: 'Cruce no válido.' });
          return;
        }
        if (body.winner == null) {
          await redis(cfg, ['HDEL', LEAGUE_KEY, `bk:${id}`]);
          res.status(200).json({ bracket: id, winner: null });
          return;
        }
        const w = lc(body.winner);
        if (!known.includes(w)) {
          res.status(400).json({ error: 'Participante no válido.' });
          return;
        }
        await redis(cfg, ['HSET', LEAGUE_KEY, `bk:${id}`, w]);
        res.status(200).json({ bracket: id, winner: w });
        return;
      }

      const a = lc(body.a);
      const b = lc(body.b);

      if (!known.includes(a) || !known.includes(b) || a === b) {
        res.status(400).json({ error: 'Combate no válido.' });
        return;
      }

      const key = matchKey(a, b);

      if (body.winner == null) {
        await redis(cfg, ['HDEL', LEAGUE_KEY, key]); // deshacer resultado
        res.status(200).json({ key, winner: null });
        return;
      }

      const winner = lc(body.winner);
      if (winner !== a && winner !== b) {
        res.status(400).json({ error: 'El ganador debe ser uno de los dos jugadores.' });
        return;
      }

      await redis(cfg, ['HSET', LEAGUE_KEY, key, winner]);
      res.status(200).json({ key, winner });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
