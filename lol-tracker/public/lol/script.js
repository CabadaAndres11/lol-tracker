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
// Temática según quién va primero (nombre de invocador en minúsculas -> campeón)
// Cualquiera del podio con temática puede activarla pulsando su icono.
const THEMES = {
  aitorlg: { id: 'akali', champ: 'Akali K/DA Firestarter', tag: 'La Rebelde del Escenario' },
  lihone: { id: 'viego', champ: 'Viego', tag: 'El Rey Arruinado' },
  'σxpσrt': { id: 'aatrox', champ: 'Aatrox', tag: 'La Espada de los Darkin' },
  dashlight: { id: 'fiora', champ: 'Fiora', tag: 'La Gran Duelista' },
  helbramn: { id: 'shyvana', champ: 'Shyvana', tag: 'La Mestiza Dragón' },
};
const keyOf = (p) => p.displayName.split('#')[0].toLowerCase();

const THEME_PREF_KEY = 'lol-theme-pref-v1';
let themePref = null;            // jugador elegido a mano (se recuerda en este navegador)
try { themePref = localStorage.getItem(THEME_PREF_KEY) || null; } catch (e) {}
function saveThemePref() { try { themePref ? localStorage.setItem(THEME_PREF_KEY, themePref) : localStorage.removeItem(THEME_PREF_KEY); } catch (e) {} }
let themeOverride = null;        // preferencia vigente: solo si sigue en el podio
let podiumKeys = [];             // jugadores del podio

function applyTheme(players) {
  const ok = (players || []).filter((p) => !p.error);
  const first = ok[0];
  podiumKeys = ok.slice(0, 3).map(keyOf);
  themeOverride = (themePref && podiumKeys.includes(themePref) && THEMES[themePref]) ? themePref : null;
  const key = themeOverride || (first ? keyOf(first) : '');
  const t = THEMES[key];
  const line = document.getElementById('theme-line');
  if (t) {
    const nm = (ok.find((p) => keyOf(p) === key) || first).displayName.split('#')[0];
    document.body.dataset.theme = t.id;
    line.textContent = `${themeOverride ? 'Temática de' : ''} ${nm}${themeOverride ? '' : ' lidera'} · ${t.champ}, ${t.tag}`.trim();
    line.hidden = false;
  } else {
    delete document.body.dataset.theme;
    line.hidden = true;
  }
  // iconos del podio: botón si tienen temática
  for (let place = 1; place <= 3; place++) {
    const av = document.querySelector(`#podium-${place} .podium-avatar`);
    if (!av) continue;
    const k = podiumKeys[place - 1];
    const th = k && THEMES[k];
    av.classList.toggle('themable', !!th);
    av.classList.toggle('theme-on', !!th && k === key);
    if (th) {
      av.setAttribute('role', 'button');
      av.tabIndex = 0;
      av.title = k === key ? `Tema activo: ${th.champ}` : `Tematizar la página como ${th.champ}`;
      av.setAttribute('aria-pressed', k === key ? 'true' : 'false');
      av.dataset.key = k;
    } else {
      av.removeAttribute('role'); av.removeAttribute('tabindex'); av.removeAttribute('title');
      av.removeAttribute('aria-pressed'); delete av.dataset.key;
    }
  }
}

function onPodiumThemeClick(e) {
  const av = e.target.closest('.podium-avatar.themable');
  if (!av) return;
  if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  const k = av.dataset.key;
  const first = lastPlayers.find((p) => !p.error);
  const leader = first ? keyOf(first) : '';
  themePref = (k === leader || k === themeOverride) ? null : k;
  saveThemePref();
  applyTheme(lastPlayers);
}
document.getElementById('podium').addEventListener('click', onPodiumThemeClick);
document.getElementById('podium').addEventListener('keydown', onPodiumThemeClick);

let lastPlayers = [];            // en el orden del servidor (diferencia de LP)
let formMap = null;              // { 'Nombre#Tag': [partida, ...] } (de la más reciente a la más antigua)
const openRows = new Set();      // participantes con el desplegable de partidas abierto
let justOpened = null;           // fila recién abierta (para animarla solo esa vez)
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
  'https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/',
  'https://raw.communitydragon.org/14.10/plugins/rcp-fe-lol-static-assets/global/default/images/ranked-mini-crests/',
];
const EMBLEM_TIERS = new Set(['unranked', 'iron', 'bronze', 'silver', 'gold', 'platinum', 'emerald', 'diamond', 'master', 'grandmaster', 'challenger']);

function emblemHtml(tier, color, small) {
  const t = String(tier || '').toLowerCase();
  const crest = `<span class="crest${small ? ' crest-sm' : ''}" style="--c:${color}"><i></i></span>`;
  if (!EMBLEM_TIERS.has(t)) return crest;
  const urls = EMBLEM_BASES.map((b) => `${b}${t}.svg`);
  const fallbackCrest = crest.replace(/"/g, '&quot;');
  const onerror = `var q=(this.dataset.fb||'').split('|').filter(Boolean);if(q.length){this.src=q.shift();this.dataset.fb=q.join('|')}else{this.outerHTML='${fallbackCrest}'}`;
  return `<img class="emblem${small ? ' emblem-sm' : ''}" src="${urls[0]}" data-fb="${urls.slice(1).join('|')}" alt="${capitalize(t)}" loading="lazy" draggable="false" onerror="${onerror}">`;
}

// ---------- Desplegable: últimas 5 partidas de cada participante ----------
const CHAMP_ICON = (id) => `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${id}.png`;
const RESULT = { W: ['Victoria', 'win'], L: ['Derrota', 'loss'], R: ['Rehacer', 'remake'] };

function timeAgo(ts) {
  const m = Math.max(1, Math.round((Date.now() - ts) / 60000));
  if (m < 60) return `hace ${m} ${m === 1 ? 'minuto' : 'minutos'}`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

function champImg(id, cls, name) {
  return `<img class="${cls}" src="${CHAMP_ICON(id)}" alt="${escapeHtml(name || '')}" loading="lazy" draggable="false" onerror="this.style.visibility='hidden'">`;
}

function matchHtml(m) {
  if (!m) return '<li class="match match-empty"><span class="match-skel"></span></li>';
  const [label, cls] = RESULT[m.r] || RESULT.L;
  const mins = Math.max(1, m.dur / 60);
  const kda = m.d === 0 ? (m.k + m.a > 0 ? 'Perfecto' : '0.00') : ((m.k + m.a) / m.d).toFixed(2);
  const team = (t) => `<ul class="match-team">${(t || [])
    .map(([id, name, me]) => `<li class="${me ? 'is-me' : ''}">${champImg(id, 'mt-ic', '')}<span>${escapeHtml(name)}</span></li>`)
    .join('')}</ul>`;
  return `
    <li class="match is-${cls}">
      <div class="match-head">
        <span class="match-result">${label}</span>
        <span class="match-meta">Clasificatoria solo/dúo</span>
        <span class="match-meta">${timeAgo(m.end)} · ${Math.floor(m.dur / 60)} min ${String(m.dur % 60).padStart(2, '0')} s</span>
      </div>
      <div class="match-champ">
        <span class="mc-wrap">${champImg(m.c, 'mc-ic', m.cn)}<b class="mc-lv">${m.lv}</b></span>
        <span class="mc-name">${escapeHtml(m.cn || '')}</span>
      </div>
      <div class="match-kda">
        <span class="kda-line"><b>${m.k}</b> / <b class="kda-d">${m.d}</b> / <b>${m.a}</b></span>
        <span class="kda-ratio">${kda}${m.d === 0 && m.k + m.a > 0 ? '' : ':1'} KDA</span>
      </div>
      <div class="match-stats">
        <span>P/Kill <b>${m.kp}%</b></span>
        <span>CS <b>${m.cs}</b> (${(m.cs / mins).toFixed(1)})</span>
      </div>
      <div class="match-teams">${team(m.t && m.t[0])}${team(m.t && m.t[1])}</div>
    </li>`;
}

function matchesHtml(displayName) {
  if (formMap == null) return '<p class="matches-note">Cargando las últimas partidas…</p>';
  const arr = formMap[displayName];
  if (arr === undefined || arr === null) return '<p class="matches-note">Todavía no hay datos de sus partidas. Se cargarán en unos segundos.</p>';
  if (!arr.length) return '<p class="matches-note">No ha jugado clasificatorias solo/dúo recientemente.</p>';
  return `<ul class="matches">${arr.map(matchHtml).join('')}</ul>`;
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
        <td colspan="6">${escapeHtml(p.displayName)} — no se pudo cargar (${escapeHtml(p.error)})</td>`;
      body.appendChild(tr);
      return;
    }

    const isLeader = p.displayName === leader;
    if (isLeader) tr.classList.add('rank-first');
    const isOpen = openRows.has(p.displayName);
    tr.classList.add('player-row');
    if (isOpen) tr.classList.add('is-open');
    tr.dataset.player = p.displayName;

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
          <span class="player-link">${escapeHtml(name)} <span class="player-tag">#${escapeHtml(tag)}</span></span>
          ${liveDot}
        </span>
      </td>
      <td class="col-tier">
        <span class="tier-badge">
          ${emblemHtml(p.tier, color, false)}
          <span class="tier-text">
            <span class="tier-label" style="color:${color}">${escapeHtml(tierLabel)}</span>
            ${p.tier === 'UNRANKED' ? '' : `<span class="tier-lp">${p.lp} LP</span>`}
          </span>
        </span>
      </td>
      <td class="col-gained">${deltaHtml}</td>
      <td class="col-start">
        <span class="start-row">
          <span class="tier-badge">
            ${emblemHtml(p.startTier, startColor, true)}
            <span class="tier-text">
              <span class="tier-label" style="color:${startColor}">${escapeHtml(startTierLabel)}</span>
              ${p.startLP != null ? `<span class="tier-lp">${p.startLP} LP</span>` : ''}
            </span>
          </span>
        </span>
      </td>
      <td class="col-wr ${wrClass}">
        ${p.winrate == null ? '—' : `<span class="wr-num">${p.winrate}%</span><span class="wr-bar"><i style="width:${p.winrate}%"></i></span><span class="wr-sub">${p.wins}V · ${p.losses}D</span>`}
      </td>
      <td class="col-form">
        <span class="row-actions">
          <a class="opgg-btn" href="${profileUrl}" target="_blank" rel="noopener noreferrer" title="Ver a ${escapeHtml(name)} en OP.GG" aria-label="Ver a ${escapeHtml(name)} en OP.GG"><img src="/lol/opgg.png" alt="" width="30" height="30" draggable="false"></a>
          <button type="button" class="expand-btn" aria-expanded="${isOpen}" aria-label="${isOpen ? 'Ocultar' : 'Ver'} las últimas partidas de ${escapeHtml(name)}" title="Últimas 5 partidas"><span aria-hidden="true">▾</span></button>
        </span>
      </td>`;

    body.appendChild(tr);

    if (isOpen) {
      const dr = document.createElement('tr');
      dr.className = `detail-row${justOpened === p.displayName ? ' just-opened' : ''}`;
      dr.style.setProperty('--tc', color);
      dr.innerHTML = `<td colspan="7"><div class="matches-panel"><h3>Últimas 5 partidas de ${escapeHtml(name)}</h3>${matchesHtml(p.displayName)}</div></td>`;
      body.appendChild(dr);
    }
  });
}

async function loadForm() {
  try {
    const res = await fetch('/api/lol-form');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error');
    formMap = data.matches || {};
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

// Pulsar la fila (o su flecha) abre o cierra las últimas partidas; los enlaces siguen funcionando.
document.getElementById('ladder-body').addEventListener('click', (e) => {
  if (e.target.closest('a')) return;
  const tr = e.target.closest('tr.player-row');
  if (!tr) return;
  const key = tr.dataset.player;
  if (openRows.has(key)) openRows.delete(key);
  else { openRows.add(key); justOpened = key; }
  renderTable();
  justOpened = null;
});

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
    applyTheme(data.players);

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
          <td colspan="7">No se pudo cargar la clasificación: ${escapeHtml(err.message)}</td>
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


// ============================================================
// CUENTA ATRÁS DEL RETO (hasta el 6 de enero de 2027, 8:59 CET)
// ============================================================

const CHALLENGE_END = new Date('2027-01-06T08:59:00+01:00').getTime();
const ccTime = document.getElementById('cc-time');
function updateChallengeCountdown() {
  const ms = CHALLENGE_END - Date.now();
  if (ms <= 0) { ccTime.textContent = '¡Tiempo cumplido!'; return; }
  const t = Math.floor(ms / 1000);
  const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
  const u = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  ccTime.textContent = `Quedan ${u(d, 'día', 'días')}, ${u(h, 'hora', 'horas')} y ${u(m, 'minuto', 'minutos')}`;
}
updateChallengeCountdown();
setInterval(updateChallengeCountdown, 1000);
