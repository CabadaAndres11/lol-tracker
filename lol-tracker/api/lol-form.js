// Últimas 5 partidas clasificatorias (SoloQ) de cada jugador: victoria (W), derrota (L) o remake (R).
// Los resultados de una partida no cambian nunca, así que se guardan en Redis y solo se piden a Riot
// las partidas nuevas. Si no da tiempo a todas en una petición, devuelve lo que tiene con
// pending:true y la web vuelve a preguntar unos segundos después.
const players = require('../players.json');
const { redisConfig, redis } = require('./_redis');
const { REGIONAL_ROUTING, riotFetch } = require('./_riot');

const PUUIDS_KEY = 'lol:puuids';
const MATCHES_KEY = 'lol:matches';
const COUNT = 5;
const SOLOQ = 420;
const BUDGET_MS = 7000; // límite de la función en Vercel: 10 s

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta la variable de entorno RIOT_API_KEY en Vercel.' });
    return;
  }

  const cfg = redisConfig();
  const rd = async (cmd) => (cfg ? redis(cfg, cmd).catch(() => null) : null);
  const started = Date.now();
  const out = {};
  let pending = false;

  for (const p of players) {
    const key = `${p.name}#${p.tag}`;
    if (Date.now() - started > BUDGET_MS) { pending = true; out[key] = null; continue; }
    try {
      const region = REGIONAL_ROUTING[p.platform];
      const pf = `${p.platform}:${key.toLowerCase()}`;
      let puuid = await rd(['HGET', PUUIDS_KEY, pf]);
      if (!puuid) {
        const acc = await riotFetch(
          `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}`,
          apiKey
        );
        puuid = acc.puuid;
        await rd(['HSET', PUUIDS_KEY, pf, puuid]);
      }

      const ids = await riotFetch(
        `https://${region}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?queue=${SOLOQ}&type=ranked&start=0&count=${COUNT}`,
        apiKey
      );
      if (!ids.length) { out[key] = []; continue; }

      const fields = ids.map((id) => `${puuid}:${id}`);
      const cached = (await rd(['HMGET', MATCHES_KEY, ...fields])) || fields.map(() => null);
      const results = [];
      let missing = false;
      for (let i = 0; i < ids.length; i++) {
        let r = cached[i];
        if (!r) {
          if (Date.now() - started > BUDGET_MS) { missing = true; results.push(null); continue; }
          try {
            const m = await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${ids[i]}`, apiKey);
            const me = m.info.participants.find((x) => x.puuid === puuid);
            r = !me ? null : me.gameEndedInEarlySurrender ? 'R' : me.win ? 'W' : 'L';
            if (r) await rd(['HSET', MATCHES_KEY, fields[i], r]);
          } catch {
            r = null;
          }
        }
        if (!r) missing = true;
        results.push(r);
      }
      if (missing) pending = true;
      // Más antigua → más reciente (la última partida queda a la derecha).
      out[key] = results.reverse();
    } catch (err) {
      out[key] = null;
    }
  }

  res.status(200).json({ form: out, pending });
};
