// Equipos de los participantes del torneo Pokémon (máx. 6 Pokémon cada uno).
// Se guardan en Redis (Upstash) en un hash: campo = nombre del jugador en
// minúsculas, valor = JSON con la lista de Pokémon.
const { checkPin, adminOk, verifyPin } = require('./_pin');

// Fecha límite de entrega de equipos (misma que la cuenta atrás de la web).
// Pasada esa hora solo se pueden modificar con la clave de administrador (LEAGUE_ADMIN_KEY).
const DELIVERY_DEADLINE = Date.parse('2026-11-11T23:59:00+01:00');


const PLAYERS_KEY = 'pokemon:players';
const TEAMS_KEY = 'pokemon:teams';
const MAX_TEAM = 6;
const MAX_FIELD = 30;
const NATURES = [
  'Fuerte', 'Huraña', 'Audaz', 'Firme', 'Pícara', 'Osada', 'Dócil', 'Plácida', 'Agitada', 'Floja',
  'Miedosa', 'Activa', 'Seria', 'Alegre', 'Ingenua', 'Modesta', 'Afable', 'Mansa', 'Tímida', 'Alocada',
  'Serena', 'Amable', 'Grosera', 'Cauta', 'Rara',
];

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

// Megapiedras: en español acaban en "-ita" (con X/Y/Z opcional) y en inglés en "-ite". Eviolite no lo es.
const isMegaStone = (item) => {
  const t = String(item || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  return t !== 'eviolite' && /(ita|ite)( [xyz])?$/.test(t);
};

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
    const item = clean(mon?.item); // objeto equipado (opcional)
    const megaAbility = clean(mon?.megaAbility); // habilidad al megaevolucionar (obligatoria con megapiedra)
    const moves = (Array.isArray(mon?.moves) ? mon.moves : []).slice(0, 4).map(clean);
    while (moves.length < 4) moves.push('');

    if (!species) throw new Error(`Pokémon ${n}: falta indicar qué Pokémon es.`);
    if (!ability) throw new Error(`Pokémon ${n}: falta la habilidad.`);
    if (!moves[0]) throw new Error(`Pokémon ${n}: indica al menos un movimiento.`);

    // Con megapiedra la habilidad de la Mega es obligatoria en el formulario; si falta (p. ej. al importar de Showdown) se guarda vacía y la web lo marca en rojo.
    for (const text of [species, nickname, ability, item, megaAbility, ...moves]) {
      if (text.length > MAX_FIELD) throw new Error(`Los textos no pueden superar ${MAX_FIELD} caracteres.`);
      if (/[<>]/.test(text)) throw new Error('Hay caracteres no permitidos.');
    }

    // Número de la Pokédex (opcional): lo usa la web para mostrar la imagen.
    const dexId = Number.isInteger(mon?.dexId) && mon.dexId > 0 && mon.dexId < 20000 ? mon.dexId : undefined;

    // Naturaleza (opcional, de la lista) y shiny (opcional).
    const nature = clean(mon?.nature);
    if (nature && !NATURES.includes(nature)) throw new Error(`Pokémon ${n}: naturaleza no válida.`);

    const out = { species, nickname, ability, item, moves };
    if (isMegaStone(item) || /^ultranecro(stal|zium) z$/i.test(item.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) out.megaAbility = megaAbility;
    if (nature) out.nature = nature;
    if (mon?.shiny === true) out.shiny = true;
    if (dexId) out.dexId = dexId;
    return out;
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
      const all = {};
      for (let i = 0; i < flat.length; i += 2) all[flat[i]] = JSON.parse(flat[i + 1]);
      // Hasta la fecha de entrega cada equipo solo lo ve su dueño (con su PIN) o un administrador;
      // del resto solo se devuelve cuántos Pokémon tiene.
      const admin = adminOk(req);
      if (Date.now() >= DELIVERY_DEADLINE || admin) {
        res.status(200).json({ teams: all, hidden: {}, admin, open: Date.now() >= DELIVERY_DEADLINE });
        return;
      }
      let pins = {};
      try { pins = JSON.parse(String(req.headers['x-pins'] || '{}')) || {}; } catch { pins = {}; }
      const teams = {}, hidden = {}, badPins = [];
      for (const id of Object.keys(all)) {
        if (await verifyPin(cfg, id, pins[id])) teams[id] = all[id];
        else { hidden[id] = all[id].length; if (pins[id]) badPins.push(id); }
      }
      res.status(200).json({ teams, hidden, badPins, admin: false, open: false });
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

      if (Date.now() >= DELIVERY_DEADLINE && !adminOk(req)) {
        res.status(403).json({ closed: true, error: 'La entrega de equipos está cerrada: ya no se pueden modificar.' });
        return;
      }

      const denied = await checkPin(cfg, req, id);
      if (denied) {
        res.status(denied.status).json(denied.body);
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
