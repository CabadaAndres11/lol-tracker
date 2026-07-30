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
        ? 'Sin clasificar'
        : `${capitalize(p.tier)} ${p.rank}`.trim();

      const gainedClass = p.lpGained == null ? '' : p.lpGained >= 0 ? 'wr-high' : 'wr-low';
      const gainedText = p.lpGained == null
        ? '—'
        : `${p.lpGained > 0 ? '+' : ''}${p.lpGained} LP`;

      const liveDot = p.isLive
        ? `<span class="live-dot" title="En partida ahora mismo"></span>`
        : '';

      tr.innerHTML = `
        <td class="col-pos">${i + 1}</td>
        <td class="col-name">${liveDot}${escapeHtml(name)}<span class="player-tag">#${escapeHtml(tag)}</span></td>
        <td class="col-tier">
          <span class="tier-pill" style="color:${color}">${escapeHtml(tierLabel)}</span>
        </td>
        <td class="col-lp">${p.tier === 'UNRANKED' ? '—' : `${p.lp} LP`}</td>
        <td class="col-gained ${gainedClass}">${gainedText}</td>
        <td class="col-wr ${wrClass}">${p.winrate == null ? '—' : `${p.winrate}% (${p.wins}V/${p.losses}D)`}</td>
      `;
      body.appendChild(tr);
    });

    document.getElementById('updated-at').textContent =
      new Date(data.updatedAt).toLocaleTimeString('es-ES');
    statusText.textContent = 'En vivo';
  } catch (err) {
    statusText.textContent = 'Error al actualizar';
    if (!body.children.length || body.querySelector('.loading-row')) {
      body.innerHTML = `<tr class="error-row"><td colspan="5">No se pudo cargar la clasificación: ${escapeHtml(err.message)}</td></tr>`;
    }
    console.error(err);
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
