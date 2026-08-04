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
  euw1: 'euw', eun1: 'eune', tr1: 'tr', ru: 'ru',
  na1: 'na', br1: 'br', la1: 'lan', la2: 'las', oc1: 'oce',
  kr: 'kr', jp1: 'jp',
};

function opggUrl(name, tag, platform) {
  const region = OPGG_REGIONS[platform] || 'euw';
  return `https://www.op.gg/summoners/${region}/${encodeURIComponent(name)}-${encodeURIComponent(tag)}`;
}

async function loadLeaderboard() {
  const body = document.getElementById('ladder-body');
  const statusText = document.getElementById('status-text');

  try {
    const res = await fetch('/api/leaderboard');
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    body.innerHTML = '';

    data.players.forEach((p, i) => {
      const tr = document.createElement('tr');
      if (i === 0 && !p.error) tr.classList.add('rank-first');

      if (p.error) {
        tr.classList.add('error-row');
        tr.innerHTML = `
          <td>${i + 1}</td>
          <td colspan="5">${escapeHtml(p.displayName)} — no se pudo cargar (${escapeHtml(p.error)})</td>
        `;
        body.appendChild(tr);
        return;
      }

      const [name, tag] = p.displayName.split('#');
      const color = TIER_COLORS[p.tier] || TIER_COLORS.UNRANKED;
      const wrClass = p.winrate == null ? '' : p.winrate >= 50 ? 'wr-high' : 'wr-low';
      const tierLabel = p.tier === 'UNRANKED'
        ? 'Aún sin invocar'
        : `${capitalize(p.tier)} ${p.rank}`.trim();

      const gainedClass = p.lpGained == null ? '' : p.lpGained >= 0 ? 'wr-high' : 'wr-low';
      const gainedText = p.lpGained == null
        ? '—'
        : `${p.lpGained > 0 ? '+' : ''}${p.lpGained} LP`;

      const icon = p.iconUrl
        ? `<img class="summoner-icon" src="${p.iconUrl}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
        : `<span class="icon-wrap"></span>`;

      const liveDot = p.isLive
        ? `<span class="live-dot" title="En partida ahora mismo"></span>`
        : '';

      const crown = i === 0 ? '<span class="crown" title="Va primero">👑</span>' : '';
      const profileUrl = opggUrl(name, tag, p.platform);

      tr.innerHTML = `
        <td class="col-pos">${crown}${i + 1}</td>
        <td class="col-name">
          ${icon}<a class="player-link" href="${profileUrl}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}<span class="player-tag">#${escapeHtml(tag)}</span></a>${liveDot}
        </td>
        <td class="col-tier">
          <span class="tier-badge">
            <span class="tier-hex" style="background: radial-gradient(circle at 35% 30%, ${color}, ${color}66 70%); border: 1px solid ${color};"></span>
            <span class="tier-label" style="color:${color}">${escapeHtml(tierLabel)}</span>
          </span>
        </td>
        <td class="col-lp">${p.tier === 'UNRANKED' ? '—' : `${p.lp} LP`}</td>
        <td class="col-gained ${gainedClass}">${gainedText}</td>
        <td class="col-wr ${wrClass}">${p.winrate == null ? '—' : `${p.winrate}% (${p.wins}V/${p.losses}D)`}</td>
      `;
      body.appendChild(tr);
    });

    renderPodium(data.players);

     lastUpdateTime = new Date(data.updatedAt);

    document.getElementById('updated-at').textContent =
    lastUpdateTime.toLocaleTimeString('es-ES');
    statusText.textContent = 'En vivo';
  } catch (err) {
    statusText.textContent = 'Error al actualizar';
    if (!body.children.length || body.querySelector('.loading-row')) {
      body.innerHTML = `<tr class="error-row"><td colspan="5">No se pudo cargar la clasificación: ${escapeHtml(err.message)}</td></tr>`;
    }
    console.error(err);
  }
}

function renderPodium(players) {
  const top3 = players.filter(p => !p.error).slice(0, 3);

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
    lpEl.classList.toggle('podium-lp-negative', p.lpGained != null && p.lpGained < 0);

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

loadLeaderboard();
setInterval(loadLeaderboard, REFRESH_MS);

const countdown = document.getElementById("update-countdown");
const progress = document.getElementById("timer-progress");

const radius = 17;
const circumference = 2 * Math.PI * radius;

progress.style.strokeDasharray = circumference;
progress.style.strokeDashoffset = 0;

function updateCountdown() {

    if (!lastUpdateTime) return;

    const nextUpdate = new Date(lastUpdateTime.getTime() + REFRESH_MS);
    const now = new Date();

    let remaining = Math.floor((nextUpdate - now) / 1000);

    if (remaining < 0) remaining = 0;

    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;

    countdown.textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    const percent = remaining / (REFRESH_MS / 1000);

    progress.style.strokeDashoffset =
        circumference * (1 - percent);
}

updateCountdown();
setInterval(updateCountdown, 1000);
