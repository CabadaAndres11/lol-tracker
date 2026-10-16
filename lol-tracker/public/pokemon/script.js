const MAX_TEAM = 6;

const roster = document.getElementById('roster');
const countEl = document.getElementById('count');
const modal = document.getElementById('modal');
const form = document.getElementById('add-form');
const input = document.getElementById('player-name');
const errorEl = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

// Estado de la pantalla
let players = [];          // [{ name, at }]
let teams = {};            // { idJugador: [pokemon, ...] }
let openId = null;         // jugador cuyo desplegable está abierto
let editing = null;        // { id, index } mientras se edita/añade un Pokémon (index -1 = nuevo)
let teamError = '';        // error al guardar un equipo
let badges = {};           // { idJugador: máscara de bits (bit 0 = medalla 1 ... bit 8 = Liga) }

const idOf = (p) => p.name.toLowerCase();

// ---------------------------------------------------------------
// Medallas (misma forma y color para todos los jugadores)
// Cambia aquí los nombres si quieres los de las medallas reales del juego.
// ---------------------------------------------------------------

const BADGES = [
  { name: 'Medalla 1', color: '#ff5d5d', shape: { type: 'poly', sides: 30 } },               // círculo
  { name: 'Medalla 2', color: '#ff9a3c', shape: { type: 'poly', sides: 3 } },                // triángulo
  { name: 'Medalla 3', color: '#ffd23f', shape: { type: 'poly', sides: 4, rotate: 45 } },    // rombo
  { name: 'Medalla 4', color: '#52d681', shape: { type: 'poly', sides: 5 } },                // pentágono
  { name: 'Medalla 5', color: '#2fe6e0', shape: { type: 'poly', sides: 6 } },                // hexágono
  { name: 'Medalla 6', color: '#4f9dff', shape: { type: 'star', points: 5, inner: 0.45 } },  // estrella
  { name: 'Medalla 7', color: '#b478ff', shape: { type: 'poly', sides: 8, rotate: 22.5 } },  // octógono
  { name: 'Medalla 8', color: '#ff4fa3', shape: { type: 'star', points: 4, inner: 0.35 } },  // destello
  { name: 'Liga Pokémon', color: '#f4c874', shape: { type: 'star', points: 12, inner: 0.72 } }, // sol dorado
];

const LEAGUE = BADGES.length - 1;
const bit = (i) => 1 << i;
const hasBadge = (mask, i) => (mask & bit(i)) !== 0;
const countBadges = (mask) => BADGES.reduce((n, _, i) => n + (hasBadge(mask, i) ? 1 : 0), 0);

function shapePoints(shape, r) {
  const pts = [];
  if (shape.type === 'star') {
    const n = shape.points * 2;
    for (let k = 0; k < n; k++) {
      const rad = k % 2 === 0 ? r : r * shape.inner;
      const a = (Math.PI * 2 * k) / n - Math.PI / 2;
      pts.push([50 + rad * Math.cos(a), 50 + rad * Math.sin(a)]);
    }
  } else {
    const rot = ((shape.rotate || 0) * Math.PI) / 180;
    for (let k = 0; k < shape.sides; k++) {
      const a = (Math.PI * 2 * k) / shape.sides - Math.PI / 2 + rot;
      pts.push([50 + r * Math.cos(a), 50 + r * Math.sin(a)]);
    }
  }
  return pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
}

function badgeSvg(shape) {
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <polygon class="b-shape" points="${shapePoints(shape, 44)}" />
    <polygon class="b-inner" points="${shapePoints(shape, 22)}" />
  </svg>`;
}

function badgesBlock(id) {
  const mask = badges[id] || 0;
  const total = countBadges(mask);
  const champion = hasBadge(mask, LEAGUE);

  const buttons = BADGES.map((b, i) => {
    const on = hasBadge(mask, i);
    const locked = !on && i > 0 && !hasBadge(mask, i - 1);
    const label = on
      ? `${b.name}: conseguida (clic para quitar)`
      : locked
        ? `${b.name}: bloqueada, necesitas ${BADGES[i - 1].name}`
        : `${b.name}: clic para marcar como conseguida`;
    return `
      <button type="button" class="badge${on ? ' is-on' : ''}${locked ? ' is-locked' : ''}${i === LEAGUE ? ' badge-league' : ''}"
        style="--c:${b.color}" data-action="badge" data-id="${encodeURIComponent(id)}" data-index="${i}"
        aria-pressed="${on}" ${locked ? 'aria-disabled="true"' : ''} title="${escapeHtml(label)}">
        ${badgeSvg(b.shape)}
        <span class="badge-label">${i === LEAGUE ? 'LIGA' : i + 1}</span>
      </button>`;
  }).join('');

  return `
    <div class="badges${champion ? ' is-champion' : ''}">
      <div class="badges-top">
        <span class="badges-title">Medallas <strong>${total}/${BADGES.length}</strong></span>
        ${champion ? '<span class="champion-tag">🏆 ¡Campeón de la Liga!</span>' : ''}
      </div>
      <div class="badges-row">${buttons}</div>
    </div>`;
}

// ---------------------------------------------------------------
// Pokédex (nombres en inglés + imagen oficial, vía PokéAPI)
// ---------------------------------------------------------------

const DEX_URL = 'https://pokeapi.co/api/v2/pokemon-species?limit=2000';
const ARTWORK_URL = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

let dexByName = {};   // 'mr mime' -> { id: 122, name: 'Mr Mime' }

const dexKey = (str) => String(str).toLowerCase().replace(/[-_\s]+/g, ' ').trim();
const prettyName = (slug) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

function dexLookup(name) {
  return dexByName[dexKey(name)] || null;
}

function buildDex(results) {
  dexByName = {};
  results.forEach((r) => {
    const id = Number(r.url.split('/').filter(Boolean).pop());
    dexByName[dexKey(r.name)] = { id, name: prettyName(r.name) };
  });

  // Lista de sugerencias para el campo "Pokémon"
  let list = document.getElementById('pokemon-names');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'pokemon-names';
    document.body.appendChild(list);
  }
  list.innerHTML = Object.values(dexByName)
    .sort((a, b) => a.id - b.id)
    .map((d) => `<option value="${escapeHtml(d.name)}"></option>`)
    .join('');
}

async function loadDex() {
  try {
    const cached = localStorage.getItem('pokedex-v1');
    if (cached) {
      buildDex(JSON.parse(cached));
      return;
    }
  } catch { /* sin caché, seguimos */ }

  try {
    const res = await fetch(DEX_URL);
    if (!res.ok) throw new Error(`PokéAPI respondió ${res.status}`);
    const data = await res.json();
    buildDex(data.results);
    try { localStorage.setItem('pokedex-v1', JSON.stringify(data.results)); } catch { /* ignorar */ }
    if (!editing) render(); // para que aparezcan las imágenes de los equipos ya cargados
  } catch (err) {
    console.warn('No se pudo cargar la Pokédex:', err);
  }
}

function monImage(mon) {
  const id = mon.dexId || dexLookup(mon.species)?.id;
  return id
    ? `<img class="mon-img" src="${ARTWORK_URL(id)}" alt="${escapeHtml(mon.species)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'mon-img mon-img-empty',textContent:'?'}))">`
    : `<div class="mon-img mon-img-empty">?</div>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------

function monCard(mon, index, id) {
  const moves = mon.moves.filter(Boolean).map((m) => `<li>${escapeHtml(m)}</li>`).join('');
  return `
    <div class="mon">
      <div class="mon-head">
        ${monImage(mon)}
        <div class="mon-info">
          <div class="mon-top">
            <span class="mon-species">${escapeHtml(mon.species)}</span>
            ${mon.nickname ? `<span class="mon-nick">“${escapeHtml(mon.nickname)}”</span>` : ''}
          </div>
          <div class="mon-ability"><span>Habilidad</span> ${escapeHtml(mon.ability)}</div>
          ${mon.item ? `<div class="mon-ability"><span>Objeto</span> ${escapeHtml(mon.item)}</div>` : ''}
        </div>
      </div>
      <ul class="mon-moves">${moves}</ul>
      <div class="mon-actions">
        <button type="button" class="link-btn" data-action="edit-mon" data-id="${encodeURIComponent(id)}" data-index="${index}">Editar</button>
        <button type="button" class="link-btn link-danger" data-action="delete-mon" data-id="${encodeURIComponent(id)}" data-index="${index}">Quitar</button>
      </div>
    </div>`;
}

function monForm(id, index) {
  const mon = index >= 0 ? teams[id][index] : null;
  const v = (x) => escapeHtml(x || '').replace(/"/g, '&quot;');
  const moveInputs = [0, 1, 2, 3]
    .map(
      (i) => `<input name="move${i}" type="text" maxlength="30" placeholder="Movimiento ${i + 1}${i === 0 ? ' *' : ''}" value="${v(mon?.moves[i])}" ${i === 0 ? 'required' : ''} />`
    )
    .join('');

  return `
    <form class="mon-form" data-id="${encodeURIComponent(id)}" data-index="${index}" autocomplete="off">
      <div class="mon-form-grid">
        <label>Pokémon *<input name="species" type="text" maxlength="30" required list="pokemon-names" placeholder="Escribe en inglés…" value="${v(mon?.species)}" /></label>
        <label>Mote<input name="nickname" type="text" maxlength="30" value="${v(mon?.nickname)}" /></label>
        <label>Habilidad *<input name="ability" type="text" maxlength="30" required value="${v(mon?.ability)}" /></label>
        <label>Objeto equipado<input name="item" type="text" maxlength="30" value="${v(mon?.item)}" /></label>
      </div>
      <div class="mon-form-label">Movimientos (1 a 4)</div>
      <div class="mon-form-moves">${moveInputs}</div>
      <p class="form-error" role="alert">${escapeHtml(teamError)}</p>
      <div class="mon-form-actions">
        <button type="submit" class="add-btn small">Guardar</button>
        <button type="button" class="link-btn" data-action="cancel-mon">Cancelar</button>
      </div>
    </form>`;
}

function teamPanel(id) {
  const team = teams[id] || [];
  const cards = team
    .map((mon, i) => (editing && editing.id === id && editing.index === i ? monForm(id, i) : monCard(mon, i, id)))
    .join('');

  const isAdding = editing && editing.id === id && editing.index === -1;
  const addArea = isAdding
    ? monForm(id, -1)
    : team.length < MAX_TEAM
      ? `<button type="button" class="add-btn small" data-action="add-mon" data-id="${encodeURIComponent(id)}">+ Añadir Pokémon</button>`
      : `<p class="team-full">Equipo completo (${MAX_TEAM}/${MAX_TEAM})</p>`;

  return `
    ${badgesBlock(id)}
    <div class="team-grid">${cards || '<p class="team-empty">Este participante aún no ha añadido ningún Pokémon.</p>'}</div>
    <div class="team-add">${addArea}</div>`;
}

function render() {
  countEl.textContent = players.length;

  if (!players.length) {
    roster.innerHTML = '<li class="roster-empty">Todavía no hay nadie apuntado. ¡Sé el primero!</li>';
    return;
  }

  roster.innerHTML = players
    .map((p, i) => {
      const id = idOf(p);
      const open = openId === id;
      const count = (teams[id] || []).length;
      const mask = badges[id] || 0;
      const dots = BADGES.map(
        (b, k) => `<span class="mini-dot${hasBadge(mask, k) ? ' on' : ''}" style="--c:${b.color}"></span>`
      ).join('');
      return `
        <li class="roster-item${open ? ' is-open' : ''}">
          <button type="button" class="roster-head" data-action="toggle" data-id="${encodeURIComponent(id)}" aria-expanded="${open}">
            <span class="roster-pos">${i + 1}</span>
            <span class="roster-name">${escapeHtml(p.name)}${hasBadge(mask, LEAGUE) ? ' <span class="crown" title="Campeón de la Liga">🏆</span>' : ''}</span>
            <span class="mini-dots" title="${countBadges(mask)}/${BADGES.length} medallas">${dots}</span>
            <span class="team-badge">${count}/${MAX_TEAM}</span>
            <span class="chevron" aria-hidden="true">▸</span>
          </button>
          ${open ? `<div class="team-panel">${teamPanel(id)}</div>` : ''}
        </li>`;
    })
    .join('');
}

// ---------------------------------------------------------------
// Datos
// ---------------------------------------------------------------

async function loadAll() {
  // No refrescamos mientras alguien está rellenando un formulario.
  if (editing || !modal.hidden) return;

  try {
    const [pRes, tRes, bRes] = await Promise.all([
      fetch('/api/pokemon-players'),
      fetch('/api/pokemon-team'),
      fetch('/api/pokemon-badges'),
    ]);
    const pData = await pRes.json();
    const tData = await tRes.json();
    const bData = await bRes.json();
    if (!pRes.ok) throw new Error(pData.error || 'Error desconocido');
    if (!tRes.ok) throw new Error(tData.error || 'Error desconocido');
    if (!bRes.ok) throw new Error(bData.error || 'Error desconocido');

    players = pData.players;
    teams = tData.teams;
    badges = bData.badges;
    if (editing) return; // por si empezó a editar mientras cargaba
    render();
  } catch (err) {
    roster.innerHTML = `<li class="roster-empty roster-error">No se pudo cargar la lista: ${escapeHtml(err.message)}</li>`;
    console.error(err);
  }
}

async function saveTeam(id, team) {
  const player = players.find((p) => idOf(p) === id);
  const res = await fetch('/api/pokemon-team', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player: player.name, team }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error desconocido');
  teams[id] = data.team;
}

// Las peticiones de medallas se envían de una en una y en orden, para que
// varios clics rápidos no lleguen desordenados al servidor.
let badgeQueue = Promise.resolve();

function saveBadges(id, mask) {
  const player = players.find((p) => idOf(p) === id);
  badgeQueue = badgeQueue
    .then(async () => {
      const res = await fetch('/api/pokemon-badges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ player: player.name, mask }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
    })
    .catch(async (err) => {
      alert(err.message);
      editing = null;
      await loadAll(); // volvemos a lo que dice el servidor
    });
}

function toggleBadge(id, i) {
  if (editing) return; // primero guarda o cancela el formulario abierto
  const mask = badges[id] || 0;
  if (hasBadge(mask, i)) {
    badges[id] = mask & ~bit(i); // quitar siempre se puede
  } else {
    if (i > 0 && !hasBadge(mask, i - 1)) return; // bloqueada
    badges[id] = mask | bit(i);
  }
  render(); // respuesta inmediata
  saveBadges(id, badges[id]);
}

// ---------------------------------------------------------------
// Interacción con la lista (delegación de eventos)
// ---------------------------------------------------------------

roster.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id ? decodeURIComponent(btn.dataset.id) : null;
  const index = Number(btn.dataset.index);

  if (action === 'badge') {
    toggleBadge(id, index);
  } else if (action === 'toggle') {
    if (editing && editing.id === openId) return; // primero guardar o cancelar
    openId = openId === id ? null : id;
    teamError = '';
    render();
  } else if (action === 'add-mon') {
    editing = { id, index: -1 };
    teamError = '';
    render();
    roster.querySelector('.mon-form input')?.focus();
  } else if (action === 'edit-mon') {
    if (editing) return;
    editing = { id, index };
    teamError = '';
    render();
    roster.querySelector('.mon-form input')?.focus();
  } else if (action === 'cancel-mon') {
    editing = null;
    teamError = '';
    render();
  } else if (action === 'delete-mon') {
    if (editing) return;
    const mon = teams[id][index];
    if (!confirm(`¿Quitar a ${mon.nickname || mon.species} del equipo?`)) return;
    try {
      await saveTeam(id, teams[id].filter((_, i) => i !== index));
    } catch (err) {
      alert(err.message);
    }
    render();
  }
});

roster.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const id = decodeURIComponent(f.dataset.id);
  const index = Number(f.dataset.index);
  const fd = new FormData(f);

  // Si coincide con un Pokémon conocido, normalizamos el nombre y guardamos su nº de Pokédex.
  const known = dexLookup(String(fd.get('species')));

  const mon = {
    species: known ? known.name : fd.get('species'),
    dexId: known ? known.id : undefined,
    nickname: fd.get('nickname'),
    ability: fd.get('ability'),
    item: fd.get('item'),
    moves: [0, 1, 2, 3].map((i) => fd.get(`move${i}`)),
  };

  const current = teams[id] || [];
  const next = index >= 0 ? current.map((m, i) => (i === index ? mon : m)) : [...current, mon];

  const submit = f.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await saveTeam(id, next);
    editing = null;
    teamError = '';
    render();
  } catch (err) {
    teamError = err.message;
    f.querySelector('.form-error').textContent = err.message;
    submit.disabled = false;
  }
});

// ---------------------------------------------------------------
// Ventana "Añadir participante"
// ---------------------------------------------------------------

function openModal() {
  errorEl.textContent = '';
  form.reset();
  modal.hidden = false;
  input.focus();
}

function closeModal() {
  modal.hidden = true;
}

document.getElementById('open-modal').addEventListener('click', openModal);
document.getElementById('close-modal').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) closeModal(); });

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorEl.textContent = '';
  submitBtn.disabled = true;

  try {
    const res = await fetch('/api/pokemon-players', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.value }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');
    players = data.players;
    closeModal();
    render();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

loadDex();
loadAll();
// Refresca para ver los cambios de otros jugadores (se pausa mientras editas).
setInterval(loadAll, 30 * 1000);


// ============================================================
// PESTAÑAS
// ============================================================

const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');

function showTab(name) {
  if (!document.getElementById(`tab-${name}`)) name = 'participantes';

  tabs.forEach((t) => {
    const active = t.dataset.tab === name;
    t.classList.toggle('is-active', active);
    t.setAttribute('aria-selected', active);
  });
  panels.forEach((p) => {
    p.hidden = p.id !== `tab-${name}`;
  });
}

tabs.forEach((t) =>
  t.addEventListener('click', () => {
    history.replaceState(null, '', `#${t.dataset.tab}`);
    showTab(t.dataset.tab);
  })
);

// Permite enlazar directamente a una sección: /pokemon/#normas
showTab(location.hash.slice(1) || 'participantes');


// ============================================================
// AVISO AL ABRIR LA PÁGINA
// ============================================================

// Si en el futuro quieres volver a mostrar un aviso a todo el mundo
// (aunque hayan pulsado "No mostrar más"), cambia este número de versión.
const NOTICE_KEY = 'pokemon-notice-pokemon-z-v1';

const notice = document.getElementById('notice');

function noticeDismissed() {
  try { return localStorage.getItem(NOTICE_KEY) === '1'; } catch { return false; }
}

function closeNotice() {
  notice.hidden = true;
}

if (!noticeDismissed()) notice.hidden = false;

document.getElementById('notice-ok').addEventListener('click', closeNotice);

document.getElementById('notice-never').addEventListener('click', () => {
  try { localStorage.setItem(NOTICE_KEY, '1'); } catch { /* sin almacenamiento: solo se cierra */ }
  closeNotice();
});

document.getElementById('notice-download').addEventListener('click', () => {
  closeNotice();
  history.replaceState(null, '', '#descarga');
  showTab('descarga');
});

notice.addEventListener('click', (e) => { if (e.target === notice) closeNotice(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !notice.hidden) closeNotice(); });
