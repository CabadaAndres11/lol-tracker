const players = require('../players.json');
 
// Enrutamiento regional: cada plataforma (servidor) pertenece a un clúster
// regional distinto para el endpoint de cuenta (Riot ID -> PUUID).
const REGIONAL_ROUTING = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia',
};
 
const TIER_ORDER = [
  'CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD',
  'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON', 'UNRANKED',
];
const RANK_ORDER = ['I', 'II', 'III', 'IV', ''];
 
async function riotFetch(url, apiKey) {
  const r = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Riot API respondió ${r.status} en ${url}: ${body}`);
  }
  return r.json();
}
 
async function fetchPlayer(p, apiKey) {
  const region = REGIONAL_ROUTING[p.platform];
  if (!region) {
    throw new Error(`Plataforma desconocida "${p.platform}" para ${p.name}#${p.tag}`);
  }
 
  // 1. Riot ID (nombre#tag) -> PUUID
  const account = await riotFetch(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}`,
    apiKey
  );
 
  // 2. PUUID -> entradas de liga (rango, LP, winrate). El endpoint antiguo
  // por summonerId está deprecado por Riot, así que consultamos directo
  // por PUUID.
  const entries = await riotFetch(
    `https://${p.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
    apiKey
  );
 
  const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
  const totalGames = solo ? solo.wins + solo.losses : 0;
 
  return {
    displayName: `${p.name}#${p.tag}`,
    platform: p.platform,
    tier: solo ? solo.tier : 'UNRANKED',
    rank: solo ? solo.rank : '',
    lp: solo ? solo.leaguePoints : 0,
    wins: solo ? solo.wins : 0,
    losses: solo ? solo.losses : 0,
    winrate: totalGames > 0 ? Math.round((solo.wins / totalGames) * 100) : null,
  };
}
 
module.exports = async function handler(req, res) {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta la variable de entorno RIOT_API_KEY en Vercel.' });
    return;
  }
 
  try {
    // Secuencial y no en paralelo puro: evita reventar el rate limit de la
    // clave de desarrollo si hay muchos participantes. Ajusta el delay si
    // usas una clave de producción con límites más altos.
    const results = [];
    for (const p of players) {
      try {
        results.push(await fetchPlayer(p, apiKey));
      } catch (err) {
        results.push({
          displayName: `${p.name}#${p.tag}`,
          platform: p.platform,
          error: err.message,
        });
      }
    }
 
    results.sort((a, b) => {
      if (a.error) return 1;
      if (b.error) return -1;
      const t = TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier);
      if (t !== 0) return t;
      const r = RANK_ORDER.indexOf(a.rank) - RANK_ORDER.indexOf(b.rank);
      if (r !== 0) return r;
      return b.lp - a.lp;
    });
 
    res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=60');
    res.status(200).json({ updatedAt: new Date().toISOString(), players: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
 
