// Convierte tier+rank+LP en un único número comparable, para poder calcular
// cuánto ha subido o bajado alguien aunque haya cambiado de división o tier
// entre medias (ascender de Oro III a Oro II, por ejemplo).
const TIER_VALUES = {
  IRON: 0,
  BRONZE: 400,
  SILVER: 800,
  GOLD: 1200,
  PLATINUM: 1600,
  EMERALD: 2000,
  DIAMOND: 2400,
  MASTER: 2800,
  GRANDMASTER: 2800,
  CHALLENGER: 2800,
};

const RANK_VALUES = { IV: 0, III: 100, II: 200, I: 300, '': 0 };

function absoluteLP(tier, rank, lp) {
  const tierBase = TIER_VALUES[tier];
  if (tierBase === undefined) return null; // UNRANKED u otro valor no reconocido
  return tierBase + (RANK_VALUES[rank] || 0) + lp;
}

const REGIONAL_ROUTING = {
  na1: 'americas', br1: 'americas', la1: 'americas', la2: 'americas', oc1: 'americas',
  euw1: 'europe', eun1: 'europe', tr1: 'europe', ru: 'europe',
  kr: 'asia', jp1: 'asia',
};

async function riotFetch(url, apiKey) {
  const r = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Riot API respondió ${r.status} en ${url}: ${body}`);
  }
  return r.json();
}

async function isPlayerLive(p, puuid, apiKey) {
  const url = `https://${p.platform}.api.riotgames.com/lol/spectator/v5/active-games/by-summoner/${puuid}`;
  try {
    const r = await fetch(url, { headers: { 'X-Riot-Token': apiKey } });
    if (r.status === 404) return false; // no está en partida, respuesta normal
    if (!r.ok) return false; // cualquier otro fallo: no bloqueamos el resto del leaderboard por esto
    return true;
  } catch {
    return false;
  }
}

async function fetchPlayer(p, apiKey) {
  const region = REGIONAL_ROUTING[p.platform];
  if (!region) {
    throw new Error(`Plataforma desconocida "${p.platform}" para ${p.name}#${p.tag}`);
  }

  const account = await riotFetch(
    `https://${region}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}`,
    apiKey
  );

  const entries = await riotFetch(
    `https://${p.platform}.api.riotgames.com/lol/league/v4/entries/by-puuid/${account.puuid}`,
    apiKey
  );

  // El campo "id" (summonerId) de este endpoint está deprecado, pero el
  // resto de datos, como el icono de invocador, siguen siendo válidos.
  let iconUrl = null;
  try {
    const summoner = await riotFetch(
      `https://${p.platform}.api.riotgames.com/lol/summoner/v4/summoners/by-puuid/${account.puuid}`,
      apiKey
    );
    iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${summoner.profileIconId}.jpg`;
  } catch {
    // Si falla, simplemente no mostramos icono para ese jugador, no rompemos el resto.
  }

  const solo = entries.find((e) => e.queueType === 'RANKED_SOLO_5x5');
  const totalGames = solo ? solo.wins + solo.losses : 0;
  const tier = solo ? solo.tier : 'UNRANKED';
  const rank = solo ? solo.rank : '';
  const lp = solo ? solo.leaguePoints : 0;
  const isLive = await isPlayerLive(p, account.puuid, apiKey);

  return {
    displayName: `${p.name}#${p.tag}`,
    platform: p.platform,
    tier,
    rank,
    lp,
    wins: solo ? solo.wins : 0,
    losses: solo ? solo.losses : 0,
    winrate: totalGames > 0 ? Math.round((solo.wins / totalGames) * 100) : null,
    absoluteLP: absoluteLP(tier, rank, lp),
    isLive,
    iconUrl,
  };
}

module.exports = { absoluteLP, fetchPlayer };
