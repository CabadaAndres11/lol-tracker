const TIER_COLORS = {
  CHALLENGER: '#f4c874',
  GRANDMASTER: '#e35b5b',
  MASTER: '#b98af0',
  DIAMOND: '#5db7e8',
  EMERALD: '#3fbf8f',
  PLATINUM: '#3fc7b0',
  GOLD: '#c9a15a',
  SILVER: '#9aa4b2',
  BRONZE: '#a97a52',
  IRON: '#6c6c6c',
  UNRANKED: '#5a616e',
};

const REFRESH_MS = 2 * 60 * 1000;
let lastUpdateTime = null;

// op.gg usa códigos de región distintos a los "platform" de la API de Riot.
const OPGG_REGIONS = {
  euw1: 'euw',
  eun1: 'eune',
  tr1: 'tr',
  ru: 'ru',
  na1: 'na',
  br1: 'br',
  la1: 'lan',
  la2: 'las',
  oc1: 'oce',
  kr: 'kr',
  jp1: 'jp',
};

function opggUrl(name, tag, platform) {
  const region = OPGG_REGIONS[platform] || 'euw';
  return `https://www.op.gg/summoners/${region}/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`;
}

// ---------- Estado de la tabla ----------
let lastPlayers = [];            // en el orden del servidor (diferencia de LP)
let formMap = null;              // { 'Nombre#Tag': ['W','L',...] } (de más antigua a más reciente)
let sortKey = 'gained';          // 'gained' | 'rank' | 'wr'
let sortDir = 'desc';            // 'desc' | 'asc'
let formRetries = 0;

const SORTERS = {
  gained: (p) => p.lpGained,
  rank: (p) => p.absoluteLP,
  wr: (p) => p.winrate,
};

function sortedPlayers() {
  const ok = lastPlayers.filter((p) => !p.error);
  const bad = lastPlayers.filter((p) => p.error);
  const val = SORTERS[sortKey];
  const dir = sortDir === 'desc' ? -1 : 1;
  ok.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x == null && y == null) return 0;
    if (x == null) return 1;           // sin dato: siempre al final
    if (y == null) return -1;
    if (x !== y) return (x - y) * dir;
    // Desempate: más diferencia de LP primero
    return (b.lpGained ?? -Infinity) - (a.lpGained ?? -Infinity);
  });
  return [...ok, ...bad];
}

// Emblemas oficiales de rango (CommunityDragon). Si una imagen no carga, se prueba una versión
// antigua del parche y, como último recurso, el hexágono de color.
const EMBLEM_BASES = [
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/',
  'https://raw.communitydragon.org/14.10/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-emblem/',
];
const EMBLEM_TIERS = new Set(['iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger']);

function emblemHtml(tier, color, small) {
  const t = String(tier || '').toLowerCase();
  const crest = `<span class="crest${small ? ' crest-sm' : ''}" style="--c:${color}"><i></i></span>`;
  if (!EMBLEM_TIERS.has(t)) return crest;
  const urls = EMBLEM_BASES.map((b) => `${b}emblem-${t}.png`);
  const fallbackCrest = crest.replace(/"/g, '&quot;');
  const onerror = `var q=(this.dataset.fb||'').split('|').filter(Boolean);if(q.length){this.src=q.shift();this.dataset.fb=q.join('|')}else{this.outerHTML='${fallbackCrest}'}`;
  return `<img class="emblem${small ? ' emblem-sm' : ''}" src="${urls[0]}" data-fb="${urls.slice(1).join('|')}" alt="${capitalize(t)}" loading="lazy" draggable="false" onerror="${onerror}">`;
}

function formHtml(displayName) {
  const arr = formMap ? formMap[displayName] : undefined;
  const loading = formMap == null;
  const slots = [];
  const list = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < 5 - list.length; i++) slots.push(null); // huecos a la izquierda
  list.forEach((r) => slots.push(r));
  const last = slots.length - 1;
  const label = { W: 'Victoria', L: 'Derrota', R: 'Remake' };
  const txt = { W: 'V', L: 'D', R: '–' };
  return `<span class="form${loading ? ' is-loading' : ''}" aria-label="Últimas 5 partidas">${slots
    .map((r, i) => r
      ? `<span class="fm fm-${r.toLowerCase()}${i === last ? ' fm-last' : ''}" title="${label[r]}${i === last ? ' (la más reciente)' : ''}">${txt[r]}</span>`
      : `<span class="fm fm-none" title="Sin datos"></span>`)
    .join('')}</span>`;
}

function updateSortHeaders() {
  document.querySelectorAll('.ladder thead th').forEach((th) => {
    const btn = th.querySelector('.sort-btn');
    if (!btn) return;
    const on = btn.dataset.sort === sortKey;
    th.setAttribute('aria-sort', on ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none');
    th.classList.toggle('is-sorted', on);
    btn.querySelector('.sort-arrow').textContent = on ? (sortDir === 'desc' ? '▼' : '▲') : '↕';
  });
}

function renderTable() {
  const body = document.getElementById('ladder-body');
  if (!lastPlayers.length) return;
  const leader = lastPlayers.find((p) => !p.error)?.displayName; // quien va primero en el reto
  const list = sortedPlayers();
  body.innerHTML = '';
  updateSortHeaders();

  list.forEach((p, i) => {
    const tr = document.createElement('tr');

    if (p.error) {
      tr.classList.add('error-row');
      tr.innerHTML = `
        <td>${i + 1}</td>
        <td colspan="7">${escapeHtml(p.displayName)} — no se pudo cargar (${escapeHtml(p.error)})</td>`;
      body.appendChild(tr);
      return;
    }

    const isLeader = p.displayName === leader;
    if (isLeader) tr.classList.add('rank-first');

    const [name, tag] = p.displayName.split('#');
    const color = TIER_COLORS[p.tier] || TIER_COLORS.UNRANKED;
    tr.style.setProperty('--tc', color);

    const wrClass = p.winrate == null ? '' : p.winrate >= 50 ? 'wr-high' : 'wr-low';
    const tierLabel = p.tier === 'UNRANKED' ? 'Sin clasificar' : `${capitalize(p.tier)} ${p.rank}`.trim();

    const startColor = TIER_COLORS[p.startTier] || TIER_COLORS.UNRANKED;
    const startTierLabel = p.startTier ? `${capitalize(p.startTier)} ${p.startRank || ''}`.trim() : '—';

    const deltaHtml = p.lpGained == null
      ? '<span class="lp-delta">—</span>'
      : `<span class="lp-delta ${p.lpGained > 0 ? 'up' : p.lpGained < 0 ? 'down' : ''}">${p.lpGained > 0 ? '▲ +' : p.lpGained < 0 ? '▼ ' : '= '}${p.lpGained}<small>LP</small></span>`;

    const icon = p.iconUrl
      ? `<img class="summoner-icon" src="${p.iconUrl}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
      : `<span class="icon-wrap"></span>`;
    const liveDot = p.isLive ? `<span class="live-dot" title="En partida ahora mismo"></span>` : '';
    const crown = isLeader ? '<span class="crown" title="Va primero">👑</span>' : '';
    const profileUrl = opggUrl(name, tag, p.platform);

    tr.innerHTML = `
      <td class="col-pos"><span class="pos-n">${i + 1}</span>${crown}</td>
      <td class="col-name">
        <span class="name-wrap">
          ${icon}
          <a class="player-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)} <span class="player-tag">#${escapeHtml(tag)}</span></a>
          ${liveDot}
        </span>
      </td>
      <td class="col-tier">
        <span class="tier-badge">
          ${emblemHtml(p.tier, color, false)}
          <span class="tier-label" style="color:${color}">${escapeHtml(tierLabel)}</span>
        </span>
      </td>
      <td class="col-lp">${p.tier === 'UNRANKED' ? '—' : `${p.lp}<small>LP</small>`}</td>
      <td class="col-gained">${deltaHtml}</td>
      <td class="col-start">
        <span class="start-row">
          <span class="tier-badge">
            ${emblemHtml(p.startTier, startColor, true)}
            <span class="tier-label" style="color:${startColor}">${escapeHtml(startTierLabel)}</span>
          </span>
          ${p.startLP != null ? `<span class="start-lp">${p.startLP} LP</span>` : ''}
        </span>
      </td>
      <td class="col-wr ${wrClass}">
        ${p.winrate == null ? '—' : `<span class="wr-num">${p.winrate}%</span><span class="wr-bar"><i style="width:${p.winrate}%"></i></span><span class="wr-sub">${p.wins}V · ${p.losses}D</span>`}
      </td>
      <td class="col-form">${formHtml(p.displayName)}</td>`;

    body.appendChild(tr);
  });
}

async function loadForm() {
  try {
    const res = await fetch('/api/lol-form');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    formMap = data.form || {};
    renderTable();
    // Si faltan partidas por consultar, volvemos a preguntar en unos segundos.
    if (data.pending && formRetries < 8) {
      formRetries++;
      setTimeout(loadForm, 6000);
    }
  } catch (err) {
    console.warn('No se pudieron cargar las últimas partidas:', err);
    if (formMap == null) { formMap = {}; renderTable(); }
  }
}

document.querySelector('.ladder thead').addEventListener('click', (e) => {
  const btn = e.target.closest('.sort-btn');
  if (!btn) return;
  const key = btn.dataset.sort;
  if (key === sortKey) sortDir = sortDir === 'desc' ? 'asc' : 'desc';
  else { sortKey = key; sortDir = 'desc'; }
  renderTable();
});

async function loadLeaderboard() {
  const body = document.getElementById('ladder-body');
  const statusText = document.getElementById('status-text');

  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    lastPlayers = data.players;
    renderTable();
    renderPodium(data.players);

    lastUpdateTime = new Date(data.updatedAt);
    document.getElementById('updated-at').textContent = lastUpdateTime.toLocaleTimeString('es-ES');
    statusText.textContent = 'En vivo';

    formRetries = 0;
    loadForm();
  } catch (err) {
    statusText.textContent = 'Error al actualizar';

    if (!body.children.length || body.querySelector('.loading-row')) {
      body.innerHTML = `
        <tr class="error-row">
          <td colspan="8">No se pudo cargar la clasificación: ${escapeHtml(err.message)}</td>
        </tr>`;
    }
    console.error(err);
  }
}

function renderPodium(players) {
  const top3 = players
    .filter(p => !p.error)
    .slice(0, 3);

  for (let place = 1; place <= 3; place++) {
    const el = document.getElementById(`podium-${place}`);
    const p = top3[place - 1];

    if (!p) {
      el.hidden = true;
      continue;
    }

    const [name, tag] = p.displayName.split('#');

    const nameEl = el.querySelector('.podium-name');
    const lpEl = el.querySelector('.podium-lp');
    const icon = el.querySelector('.podium-icon');

    nameEl.textContent = name;
    nameEl.title = `${name}#${tag}`;

    lpEl.textContent = p.lpGained == null
      ? '—'
      : `${p.lpGained > 0 ? '+' : ''}${p.lpGained} LP`;

    lpEl.classList.toggle(
      'podium-lp-negative',
      p.lpGained != null && p.lpGained < 0
    );

    if (p.iconUrl) {
      icon.src = p.iconUrl;
      icon.style.visibility = 'visible';
    } else {
      icon.removeAttribute('src');
      icon.style.visibility = 'hidden';
    }

    el.hidden = false;
  }
}

function capitalize(s) {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}


// ============================================================
// CARGA Y ACTUALIZACIÓN DEL LEADERBOARD
// ============================================================

loadLeaderboard();
setInterval(loadLeaderboard, REFRESH_MS);


// ============================================================
// CONTADOR DE ACTUALIZACIÓN
// ============================================================

const countdown = document.getElementById("update-countdown");
const progress = document.getElementById("timer-progress");

const radius = 17;
const circumference = 2 * Math.PI * radius;

progress.style.strokeDasharray = circumference;
progress.style.strokeDashoffset = 0;

function updateCountdown() {

  if (!lastUpdateTime) return;

  const nextUpdate = new Date(
    lastUpdateTime.getTime() + REFRESH_MS
  );

  const now = new Date();

  let remaining = Math.floor(
    (nextUpdate - now) / 1000
  );

  if (remaining < 0) {
    remaining = 0;
  }

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  countdown.textContent =
    `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  const percent =
    remaining / (REFRESH_MS / 1000);

  progress.style.strokeDashoffset =
    circumference * (1 - percent);
}

updateCountdown();
setInterval(updateCountdown, 1000);


// ============================================================
// VENTANA FLOTANTE DEL GANADOR
// ============================================================

document.getElementById("winner-close").addEventListener("click", () => {
  document.getElementById("winner-popup").classList.add("is-hidden");
});
