const players = require('../players.json');
const { fetchPlayer, absoluteLP } = require('./_riot');
 
const TIER_ORDER = [
  'CHALLENGER', 'GRANDMASTER', 'MASTER', 'DIAMOND', 'EMERALD',
  'PLATINUM', 'GOLD', 'SILVER', 'BRONZE', 'IRON', 'UNRANKED',
];
const RANK_ORDER = ['I', 'II', 'III', 'IV', ''];
 
module.exports = async function handler(req, res) {
  const apiKey = process.env.RIOT_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'Falta la variable de entorno RIOT_API_KEY en Vercel.' });
    return;
  }
 
  try {
    const results = [];
    for (const p of players) {
      try {
        const player = await fetchPlayer(p, apiKey);
 
        // Si el jugador tiene rango de partida definido en players.json,
        // calculamos cuánto LP ha ganado/perdido desde ahí.
        if (p.startTier && player.absoluteLP != null) {
          const startAbs = absoluteLP(p.startTier, p.startRank || '', p.startLP || 0);
          player.lpGained = startAbs != null ? player.absoluteLP - startAbs : null;
        } else {
          player.lpGained = null;
        }
 
        results.push(player);
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
