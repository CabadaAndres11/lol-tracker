// Últimas 5 partidas clasificatorias (SoloQ) de cada jugador, con su detalle: resultado (W victoria,
// L derrota, R remake), campeón, K/D/A, súbditos, duración y los diez jugadores de la partida.
// Los resultados de una partida no cambian nunca, así que se guardan en Redis y solo se piden a Riot
// las partidas nuevas. Si no da tiempo a todas en una petición, devuelve lo que tiene con
// pending:true y la web vuelve a preguntar unos segundos después.
const players = require('../players.json');
const { redisConfig, redis } = require('./_redis');
const { REGIONAL_ROUTING, riotFetch } = require('./_riot');

const PUUIDS_KEY = 'lol:puuids';
const MATCHES_KEY = 'lol:matches:v2'; // v2: guarda el detalle de la partida en JSON, no solo W/L/R
const COUNT = 5;
const SOLOQ = 420;
const BUDGET_MS = 7000; // límite de la función en Vercel: 10 s

// Resumen compacto de una partida desde el punto de vista de un jugador.
function summarize(m, puuid) {
  const ps = m.info.participants || [];
  const me = ps.find((x) => x.puuid === puuid);
  if (!me) return null;
  const teamKills = ps.filter((x) => x.teamId === me.teamId).reduce((n, x) => n + (x.kills || 0), 0);
  const side = (teamId) => ps
    .filter((x) => x.teamId === teamId)
    .map((x) => [x.championId, String(x.riotIdGameName || x.summonerName || '?').slice(0, 24), x.puuid === puuid ? 1 : 0]);
  return {
    r: me.gameEndedInEarlySurrender ? 'R' : me.win ? 'W' : 'L',
    c: me.championId,
    cn: me.championName,
    lv: me.champLevel,
    k: me.kills, d: me.deaths, a: me.assists,
    cs: (me.totalMinionsKilled || 0) + (me.neutralMinionsKilled || 0),
    kp: teamKills > 0 ? Math.round(((me.kills + me.assists) / teamKills) * 100) : 0,
    dur: m.info.gameDuration,
    end: m.info.gameEndTimestamp || (m.info.gameCreation + m.info.gameDuration * 1000),
    t: [side(100), side(200)],
  };
}
const parse = (s) => { try { return typeof s === 'string' ? JSON.parse(s) : null; } catch { return null; } };

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
        let r = parse(cached[i]);
        if (!r) {
          if (Date.now() - started > BUDGET_MS) { missing = true; results.push(null); continue; }
          try {
            const m = await riotFetch(`https://${region}.api.riotgames.com/lol/match/v5/matches/${ids[i]}`, apiKey);
            r = summarize(m, puuid);
            if (r) await rd(['HSET', MATCHES_KEY, fields[i], JSON.stringify(r)]);
          } catch {
            r = null;
          }
        }
        if (!r) missing = true;
        results.push(r);
      }
      if (missing) pending = true;
      // De la más reciente a la más antigua.
      out[key] = results;
    } catch (err) {
      out[key] = null;
    }
  }

  res.status(200).json({ matches: out, pending });
};
