// Equipos de los participantes del torneo Pokémon (máx. 6 Pokémon cada uno).
// Se guardan en Redis (Upstash) en un hash: campo = nombre del jugador en
// minúsculas, valor = JSON con la lista de Pokémon.
const PLAYERS_KEY = 'pokemon:players';
const TEAMS_KEY = 'pokemon:teams';
const MAX_TEAM = 6;
const MAX_FIELD = 30;

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

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

// Valida y normaliza un equipo. Lanza un Error con mensaje para el usuario.
function validateTeam(team) {
  if (!Array.isArray(team)) throw new Error('Equipo no válido.');
  if (team.length > MAX_TEAM) throw new Error(`Un equipo no puede tener más de ${MAX_TEAM} Pokémon.`);

  return team.map((mon, i) => {
    const n = i + 1;
    const species = clean(mon?.species);
    const nickname = clean(mon?.nickname);
    const ability = clean(mon?.ability);
    const moves = (Array.isArray(mon?.moves) ? mon.moves : []).slice(0, 4).map(clean);
    while (moves.length < 4) moves.push('');

    if (!species) throw new Error(`Pokémon ${n}: falta indicar qué Pokémon es.`);
    if (!ability) throw new Error(`Pokémon ${n}: falta la habilidad.`);
    if (!moves[0]) throw new Error(`Pokémon ${n}: indica al menos un movimiento.`);

    for (const text of [species, nickname, ability, ...moves]) {
      if (text.length > MAX_FIELD) throw new Error(`Los textos no pueden superar ${MAX_FIELD} caracteres.`);
      if (/[<>]/.test(text)) throw new Error('Hay caracteres no permitidos.');
    }

    return { species, nickname, ability, moves };
  });
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
      const flat = await redis(cfg, ['HGETALL', TEAMS_KEY]);
      const teams = {};
      for (let i = 0; i < flat.length; i += 2) teams[flat[i]] = JSON.parse(flat[i + 1]);
      res.status(200).json({ teams });
      return;
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const playerName = clean(body.player);
      const id = playerName.toLowerCase();

      // Solo se puede guardar el equipo de alguien que esté en la lista.
      const players = (await redis(cfg, ['ZRANGE', PLAYERS_KEY, 0, -1])).map((s) => JSON.parse(s));
      if (!id || !players.some((p) => p.name.toLowerCase() === id)) {
        res.status(404).json({ error: 'Ese participante no existe.' });
        return;
      }

      let team;
      try {
        team = validateTeam(body.team);
      } catch (err) {
        res.status(400).json({ error: err.message });
        return;
      }

      await redis(cfg, ['HSET', TEAMS_KEY, id, JSON.stringify(team)]);
      res.status(200).json({ id, team });
      return;
    }

    res.setHeader('Allow', 'GET, POST, PUT');
    res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
