const MAX_TEAM = 6;

const stage = document.getElementById('stage');
const slide = document.getElementById('slide');
const monModal = document.getElementById('mon-modal');
const monBody = document.getElementById('mon-modal-body');
const jump = document.getElementById('jump');
const counterEl = document.getElementById('stage-counter');
const countEl = document.getElementById('count');

// Estado de la pantalla
let players = [];          // [{ name, at }]
let teams = {};            // { idJugador: [pokemon, ...] }
let currentId = null;      // participante que se está mostrando
let viewing = null;        // { id, index } Pokémon abierto en la ventana emergente
let animating = false;     // true mientras dura la animación de deslizamiento
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

const DEX_URL = 'https://pokeapi.co/api/v2/pokemon-species?limit=2000';  // especies base (nº 1-1025...)
const FORMS_URL = 'https://pokeapi.co/api/v2/pokemon?limit=2000';          // incluye formas: Alola, Galar, Hisui, Paldea, Mega...
const DEX_CACHE_KEY = 'pokedex-v2';
const FORM_MIN_ID = 10000; // en PokéAPI las formas alternativas tienen id >= 10001
const ARTWORK_URL = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${id}.png`;

let dexByName = {};   // 'mr mime' | 'alolan raichu' | 'raichu alola' -> { id, name, baseId }
let dexById = {};     // id -> { id, name, baseId }

const dexKey = (str) => String(str).toLowerCase().replace(/[-_\s]+/g, ' ').trim();
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const prettyName = (slug) => slug.split('-').map(cap).join(' ');

// Palabras de formas que pasan al principio del nombre: raichu-alola -> "Alolan Raichu"
const FORM_PREFIX = {
  alola: 'Alolan',
  galar: 'Galarian',
  hisui: 'Hisuian',
  paldea: 'Paldean',
  mega: 'Mega',
  gmax: 'Gigantamax',
  primal: 'Primal',
};

function formName(slug) {
  const parts = slug.split('-');
  const k = parts.findIndex((p, i) => i > 0 && FORM_PREFIX[p]);
  if (k === -1) return prettyName(slug);
  const base = parts.slice(0, k);
  const rest = parts.slice(k + 1);
  return [FORM_PREFIX[parts[k]], ...base.map(cap), ...rest.map(cap)].join(' ');
}

function dexLookup(name) {
  return dexByName[dexKey(name)] || null;
}

const idFromUrl = (url) => Number(url.split('/').filter(Boolean).pop());

function buildDex(results) {
  dexByName = {};
  dexById = {};

  const species = results.filter((r) => idFromUrl(r.url) < FORM_MIN_ID);
  const forms = results.filter((r) => idFromUrl(r.url) >= FORM_MIN_ID);

  species.forEach((r) => {
    const id = idFromUrl(r.url);
    const entry = { id, name: prettyName(r.name), baseId: null };
    dexById[id] = entry;
    dexByName[dexKey(r.name)] = entry;
  });

  // Para cada forma, buscamos su especie base (quitando partes del final del nombre)
  forms.forEach((r) => {
    const id = idFromUrl(r.url);
    const parts = r.name.split('-');
    let baseId = null;
    for (let n = parts.length - 1; n >= 1 && baseId == null; n--) {
      baseId = dexByName[dexKey(parts.slice(0, n).join(' '))]?.id ?? null;
    }
    const entry = { id, name: formName(r.name), baseId };
    dexById[id] = entry;
    dexByName[dexKey(entry.name)] = entry;   // "alolan raichu"
    dexByName[dexKey(r.name)] = entry;       // "raichu alola"
  });

  // Lista de sugerencias para el campo "Pokémon"
  let list = document.getElementById('pokemon-names');
  if (!list) {
    list = document.createElement('datalist');
    list.id = 'pokemon-names';
    document.body.appendChild(list);
  }
  list.innerHTML = Object.values(dexById)
    .sort((a, b) => a.id - b.id)
    .map((d) => `<option value="${escapeHtml(d.name)}"></option>`)
    .join('');
}

async function loadDex() {
  try {
    const cached = localStorage.getItem(DEX_CACHE_KEY);
    if (cached) {
      buildDex(JSON.parse(cached));
      return;
    }
  } catch { /* sin caché, seguimos */ }

  try {
    const [sRes, fRes] = await Promise.all([fetch(DEX_URL), fetch(FORMS_URL)]);
    if (!sRes.ok || !fRes.ok) throw new Error(`PokéAPI respondió ${sRes.status}/${fRes.status}`);
    const species = (await sRes.json()).results;
    const forms = (await fRes.json()).results.filter((r) => idFromUrl(r.url) >= FORM_MIN_ID);
    const all = [...species, ...forms];
    buildDex(all);
    try { localStorage.setItem(DEX_CACHE_KEY, JSON.stringify(all)); } catch { /* ignorar */ }
    renderLeague();
    if (!editing && !viewing) render(); // para que aparezcan las imágenes de los equipos ya cargados
  } catch (err) {
    console.warn('No se pudo cargar la Pokédex:', err);
  }
}

function monImage(mon, cls = 'mon-img') {
  const id = mon.dexId || dexLookup(mon.species)?.id;
  if (!id) return `<div class="${cls} ${cls}-empty">?</div>`;

  // Si una forma no tiene dibujo propio, probamos con el de su especie base.
  const fb = dexById[id]?.baseId;
  const fbAttr = fb ? ` data-fb="${ARTWORK_URL(fb)}"` : '';
  const onerror = `if(this.dataset.fb){this.src=this.dataset.fb;delete this.dataset.fb}else{this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls} ${cls}-empty',textContent:'?'}))}`;
  return `<img class="${cls}" src="${ARTWORK_URL(id)}"${fbAttr} alt="${escapeHtml(mon.species)}" loading="lazy" onerror="${onerror}">`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------

function monDetail(mon, index, id) {
  const moves = mon.moves.filter(Boolean).map((m) => `<li>${escapeHtml(m)}</li>`).join('');
  return `
    <div class="mon-detail">
      ${monImage(mon, 'detail-img')}
      <h2>${escapeHtml(mon.species)}</h2>
      ${mon.nickname ? `<div class="mon-nick">“${escapeHtml(mon.nickname)}”</div>` : ''}
      <div class="detail-rows">
        <div class="mon-ability"><span>Habilidad</span> ${escapeHtml(mon.ability)}</div>
        ${mon.item ? `<div class="mon-ability"><span>Objeto</span> ${escapeHtml(mon.item)}</div>` : ''}
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
      (i) => `<input name="move${i}" type="text" maxlength="30" list="es-moves" autocomplete="off" placeholder="Movimiento ${i + 1}${i === 0 ? ' *' : ''}" value="${v(mon?.moves[i])}" ${i === 0 ? 'required' : ''} />`
    )
    .join('');

  return `
    <form class="mon-form" data-id="${encodeURIComponent(id)}" data-index="${index}" autocomplete="off">
      <div class="mon-form-grid">
        <label>Pokémon *<input name="species" type="text" maxlength="30" required list="pokemon-names" placeholder="Escribe en inglés…" value="${v(mon?.species)}" /></label>
        <label>Mote<input name="nickname" type="text" maxlength="30" value="${v(mon?.nickname)}" /></label>
        <label>Habilidad *<input name="ability" type="text" maxlength="30" required list="es-abilities" autocomplete="off" value="${v(mon?.ability)}" /></label>
        <label>Objeto equipado<input name="item" type="text" maxlength="30" list="es-items" autocomplete="off" value="${v(mon?.item)}" /></label>
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

function currentPlayer() {
  return players.find((p) => idOf(p) === currentId) || players[0] || null;
}

function nameSize(name) {
  const n = name.length;
  return n <= 7 ? '2.1rem' : n <= 11 ? '1.6rem' : n <= 16 ? '1.25rem' : '1rem';
}

function circleHtml(player) {
  const id = idOf(player);
  const team = teams[id] || [];
  const mask = badges[id] || 0;

  const minis = Array.from({ length: MAX_TEAM }, (_, i) => {
    const mon = team[i];
    const angle = `style="--a:${i * 60}deg"`;
    if (mon) {
      const title = `${mon.species}${mon.nickname ? ` “${mon.nickname}”` : ''}`;
      return `<button type="button" class="mini" ${angle} data-action="open-mon" data-id="${encodeURIComponent(id)}" data-index="${i}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">
        <span class="mini-face">${monImage(mon, 'mini-img')}</span></button>`;
    }
    return `<button type="button" class="mini mini-empty" ${angle} data-action="add-mon" data-id="${encodeURIComponent(id)}" title="Añadir Pokémon" aria-label="Añadir Pokémon">
      <span class="mini-face">+</span></button>`;
  }).join('');

  return `
    <div class="circle">
      <div class="circle-name">
        <span class="circle-title" style="font-size:${nameSize(player.name)}">${escapeHtml(player.name)}${hasBadge(mask, LEAGUE) ? ' <span class="crown" title="Campeón de la Liga">🏆</span>' : ''}</span>
        <span class="circle-sub">${team.length}/${MAX_TEAM} Pokémon</span>
      </div>
      ${minis}
    </div>`;
}

function render() {
  countEl.textContent = players.length;

  if (!players.length) {
    stage.innerHTML = '<p class="roster-empty">Todavía no hay participantes.</p>';
    jump.innerHTML = '';
    counterEl.textContent = '';
    return;
  }

  const player = currentPlayer();
  currentId = idOf(player);

  stage.innerHTML = circleHtml(player) + `<div class="import-row"><button type="button" class="link-btn" data-action="import-team" data-id="${encodeURIComponent(currentId)}">⬆ Importar equipo desde archivo (.txt)</button></div>` + badgesBlock(currentId);

  const index = players.indexOf(player);
  counterEl.textContent = `${index + 1} / ${players.length}`;
  jump.innerHTML = players
    .map((p, i) => `<option value="${i}"${i === index ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');

  document.getElementById('prev').disabled = players.length < 2;
  document.getElementById('next').disabled = players.length < 2;
}

// Ventana emergente de un Pokémon (ver / editar / añadir)
function renderPopup() {
  if (!viewing && !editing) {
    monModal.hidden = true;
    return;
  }

  if (editing) {
    monBody.innerHTML = `<h2 class="popup-title">${editing.index >= 0 ? 'Editar Pokémon' : 'Añadir Pokémon'}</h2>${monForm(editing.id, editing.index)}`;
    monModal.hidden = false;
    monBody.querySelector('input')?.focus();
  } else {
    const mon = teams[viewing.id]?.[viewing.index];
    if (!mon) {
      viewing = null;
      monModal.hidden = true;
      return;
    }
    monBody.innerHTML = monDetail(mon, viewing.index, viewing.id);
    monModal.hidden = false;
  }
}

function closePopup() {
  viewing = null;
  editing = null;
  teamError = '';
  renderPopup();
}

// Cambio de participante con animación de deslizamiento
async function goTo(newIndex, dir) {
  if (animating || players.length < 2) return;
  animating = true;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dist = Math.min(window.innerWidth * 0.7, 700);
  document.body.style.overflowX = 'hidden';

  try {
    if (!reduce) {
      await slide.animate(
        [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dir * dist}px)`, opacity: 0 }],
        { duration: 220, easing: 'ease-in', fill: 'forwards' }
      ).finished;
    }

    currentId = idOf(players[newIndex]);
    render();

    if (!reduce) {
      slide.getAnimations().forEach((a) => a.cancel());
      await slide.animate(
        [{ transform: `translateX(${dir * dist}px)`, opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
        { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' }
      ).finished;
    }
  } finally {
    slide.getAnimations().forEach((a) => a.cancel());
    document.body.style.overflowX = '';
    animating = false;
  }
}

function step(dir) {
  if (!players.length) return;
  const i = players.indexOf(currentPlayer());
  goTo((i + dir + players.length) % players.length, dir);
}

// ---------------------------------------------------------------
// Datos
// ---------------------------------------------------------------

async function loadAll() {
  // No refrescamos mientras alguien está rellenando un formulario.
  if (editing || viewing || animating) return;

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
    renderLeague(); // los equipos alimentan las fotos de la liga
    if (editing || viewing) return; // por si empezó a editar mientras cargaba
    render();
  } catch (err) {
    stage.innerHTML = `<p class="roster-empty roster-error">No se pudo cargar la lista: ${escapeHtml(err.message)}</p>`;
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

async function onAction(e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const action = btn.dataset.action;
  const id = btn.dataset.id ? decodeURIComponent(btn.dataset.id) : null;
  const index = Number(btn.dataset.index);

  if (action === 'badge') {
    toggleBadge(id, index);
  } else if (action === 'open-mon') {
    viewing = { id, index };
    renderPopup();
  } else if (action === 'import-team') {
    importTarget = id;
    importInput.click();
  } else if (action === 'add-mon') {
    if ((teams[id] || []).length >= MAX_TEAM) return;
    editing = { id, index: -1 };
    teamError = '';
    renderPopup();
  } else if (action === 'edit-mon') {
    editing = { id, index };
    viewing = null;
    teamError = '';
    renderPopup();
  } else if (action === 'cancel-mon') {
    const was = editing;
    editing = null;
    teamError = '';
    viewing = was && was.index >= 0 ? { id: was.id, index: was.index } : null;
    renderPopup();
  } else if (action === 'delete-mon') {
    const mon = teams[id][index];
    if (!confirm(`¿Quitar a ${mon.nickname || mon.species} del equipo?`)) return;
    try {
      await saveTeam(id, teams[id].filter((_, i) => i !== index));
    } catch (err) {
      alert(err.message);
    }
    closePopup();
    render();
  }
}

stage.addEventListener('click', onAction);
monModal.addEventListener('click', (e) => {
  if (e.target === monModal) closePopup();
  else onAction(e);
});
document.getElementById('close-mon').addEventListener('click', closePopup);

monModal.addEventListener('submit', async (e) => {
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
    viewing = { id, index: index >= 0 ? index : teams[id].length - 1 };
    render();
    renderPopup();
  } catch (err) {
    teamError = err.message;
    f.querySelector('.form-error').textContent = err.message;
    submit.disabled = false;
  }
});

// ---------------------------------------------------------------
// Navegación entre participantes (flechas, teclado, deslizar, selector)
// ---------------------------------------------------------------

document.getElementById('prev').addEventListener('click', () => step(-1));
document.getElementById('next').addEventListener('click', () => step(1));

jump.addEventListener('change', () => {
  const target = Number(jump.value);
  const current = players.indexOf(currentPlayer());
  if (target === current) return;
  goTo(target, target > current ? 1 : -1);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (document.getElementById('tab-participantes').hidden) return;
  if (!monModal.hidden || !notice.hidden) return;
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
  step(e.key === 'ArrowRight' ? 1 : -1);
});

let touchX = null;
slide.addEventListener('touchstart', (e) => { touchX = e.touches[0].clientX; }, { passive: true });
slide.addEventListener('touchend', (e) => {
  if (touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  touchX = null;
  if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
});

// ---------------------------------------------------------------
// Importar equipo (formato de exportación tipo Showdown)
// ---------------------------------------------------------------

let importTarget = null;
const importInput = Object.assign(document.createElement('input'), { type: 'file', accept: '.txt,text/plain', hidden: true });
document.body.appendChild(importInput);

const clean = (x) => String(x || '').replace(/[<>]/g, '').trim().slice(0, 30);

// Traduce al español si el nombre en inglés está en nuestra lista; si no, lo deja igual.
function toEs(kind, name) {
  const hit = esMap[kind]?.get(String(name).toLowerCase());
  return clean(hit || name);
}

function parseTeamText(text) {
  const mons = [];
  const skipped = [];
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);

  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    let head = lines[0];
    let item = '';
    const at = head.lastIndexOf(' @ ');
    if (at >= 0) { item = head.slice(at + 3); head = head.slice(0, at); }
    head = head.replace(/\s*\((M|F)\)\s*$/i, '').trim();

    let nickname = '';
    let species = head;
    const m = head.match(/^(.*)\s\(([^()]+)\)$/);
    if (m) { nickname = m[1].trim(); species = m[2].trim(); }

    let ability = '';
    const moves = [];
    for (const l of lines.slice(1)) {
      if (/^ability:/i.test(l)) ability = l.replace(/^ability:/i, '').trim();
      else if (/^-\s*\S/.test(l)) moves.push(l.replace(/^-\s*/, '').trim());
    }

    const known = dexLookup(species);
    const mon = {
      species: clean(known ? known.name : species),
      dexId: known ? known.id : undefined,
      nickname: nickname && nickname.toLowerCase() !== species.toLowerCase() ? clean(nickname) : '',
      ability: ability ? toEs('abilities', ability) : '',
      item: item ? toEs('items', item) : '',
      moves: [0, 1, 2, 3].map((i) => (moves[i] ? toEs('moves', moves[i]) : '')),
    };
    if (!mon.species || !mon.ability || !mon.moves[0]) { skipped.push(nickname || species || '(sin nombre)'); continue; }
    mons.push(mon);
  }
  return { mons, skipped };
}

importInput.addEventListener('change', async () => {
  const file = importInput.files[0];
  const id = importTarget;
  importInput.value = '';
  if (!file || !id) return;
  if (file.size > 100 * 1024) return alert('El archivo es demasiado grande para ser un equipo.');

  await Promise.all([esReady, dexReady]);
  const { mons, skipped } = parseTeamText(await file.text());
  if (!mons.length) return alert('No he encontrado ningún Pokémon válido en ese archivo.');

  const used = mons.slice(0, MAX_TEAM);
  const player = players.find((p) => idOf(p) === id);
  let msg = `Se van a importar ${used.length} Pokémon para ${player.name}:\n\n` +
    used.map((x) => `• ${x.species}${x.nickname ? ` (${x.nickname})` : ''}`).join('\n');
  if (mons.length > MAX_TEAM) msg += `\n\nEl equipo admite ${MAX_TEAM}: se ignoran ${mons.length - MAX_TEAM} más.`;
  if (skipped.length) msg += `\n\nSin habilidad o movimientos, omitidos: ${skipped.join(', ')}.`;
  if ((teams[id] || []).length) msg += `\n\n⚠ Esto REEMPLAZA el equipo actual.`;
  if (!confirm(msg)) return;

  try {
    await saveTeam(id, used);
  } catch (err) {
    return alert(err.message);
  }
  render();
});

// Sugerencias en español (generadas a partir de los datos oficiales de PokéAPI).
const esMap = {};
async function loadEsData() {
  try {
    const res = await fetch('/pokemon/data/es.json');
    if (!res.ok) return;
    const data = await res.json();
    for (const k of ['moves', 'abilities', 'items']) {
      esMap[k] = new Map(data[k].map(([es, en]) => [en.toLowerCase(), es]));
    }
    const fill = (id, rows) => {
      let dl = document.getElementById(id);
      if (!dl) { dl = document.createElement('datalist'); dl.id = id; document.body.appendChild(dl); }
      dl.innerHTML = rows
        .map(([es, en]) => `<option value="${escapeHtml(es)}"${en && en !== es ? ` label="${escapeHtml(en)}"` : ''}></option>`)
        .join('');
    };
    fill('es-moves', data.moves);
    fill('es-abilities', data.abilities);
    fill('es-items', data.items);
  } catch { /* sin sugerencias: se puede escribir a mano */ }
}

const dexReady = loadDex();
const esReady = loadEsData();
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


// ============================================================
// CUENTA ATRÁS DE LA ENTREGA
// ============================================================

// Horario de España peninsular en noviembre = UTC+1.
const DELIVERY_DEADLINE = new Date('2026-11-11T23:59:00+01:00');
const TOURNAMENT_START = new Date('2026-11-15T17:00:00+01:00');

function updateDeadlineCountdown() {
  const el = document.getElementById('deadline-countdown');
  const now = new Date();
  let text;

  if (now < DELIVERY_DEADLINE) {
    const mins = Math.floor((DELIVERY_DEADLINE - now) / 60000);
    const d = Math.floor(mins / 1440);
    const hh = Math.floor((mins % 1440) / 60);
    const mm = mins % 60;
    text = d > 0
      ? `⏳ Quedan ${d} ${d === 1 ? 'día' : 'días'} y ${hh} h para entregar tu equipo`
      : `⏳ ¡Último día! Quedan ${hh} h ${mm} min para entregar tu equipo`;
  } else if (now < TOURNAMENT_START) {
    text = '🔒 La entrega de equipos está cerrada';
  } else {
    text = '';
  }

  el.textContent = text;
}

updateDeadlineCountdown();
setInterval(updateDeadlineCountdown, 60 * 1000);


// ============================================================
// LIGA (todos contra todos)
// ============================================================

const POINTS_WIN = 3;   // puntos por victoria
const QUALIFY = 8;      // los 8 primeros pasan al bracket
const ADMIN_KEY_STORAGE = 'pokemon-league-admin-key';

let leaguePlayers = [];     // nombres, en el orden del servidor
let leagueResults = {};     // { 'ana|luis': 'ana' }  (ganador en minúsculas)
let leagueProtected = false;
let schedule = [];          // [{ round: 1, matches: [{ a, b, key }] }]
let selectedRound = 0;      // índice de la jornada que se está viendo
let roundChosen = false;    // true cuando el usuario elige una jornada a mano
let leagueLoaded = false;
let leagueError = '';

const lcName = (s) => String(s).replace(/\s+/g, ' ').trim().toLowerCase();
const matchKey = (a, b) => [lcName(a), lcName(b)].sort().join('|');

// Método del círculo: en cada jornada todos juegan exactamente una vez
// y, al final, todos se han enfrentado con todos.
function buildSchedule(names) {
  const arr = names.slice();
  if (arr.length % 2) arr.push(null); // descanso si fueran impares
  const n = arr.length;
  const rounds = [];

  for (let r = 0; r < n - 1; r++) {
    const matches = [];
    for (let i = 0; i < n / 2; i++) {
      let a = arr[i];
      let b = arr[n - 1 - i];
      if (a == null || b == null) continue;
      if (i === 0 && r % 2 === 1) [a, b] = [b, a]; // alterna el lado del jugador fijo
      matches.push({ a, b, key: matchKey(a, b) });
    }
    rounds.push({ round: r + 1, matches });
    arr.splice(1, 0, arr.pop()); // rotación
  }
  return rounds;
}

function computeStandings() {
  const table = new Map(leaguePlayers.map((name) => [lcName(name), { name, pj: 0, v: 0, d: 0, pts: 0 }]));

  schedule.forEach((rd) =>
    rd.matches.forEach((m) => {
      const winner = leagueResults[m.key];
      if (!winner) return;
      const loser = winner === lcName(m.a) ? lcName(m.b) : lcName(m.a);
      const w = table.get(winner);
      const l = table.get(loser);
      if (!w || !l) return;
      w.pj++; w.v++; w.pts += POINTS_WIN;
      l.pj++; l.d++;
    })
  );

  return [...table.values()].sort(
    (x, y) => y.pts - x.pts || y.v - x.v || x.d - y.d || x.name.localeCompare(y.name, 'es')
  );
}

function teamThumbs(name) {
  const team = teams[lcName(name)] || [];
  return Array.from({ length: MAX_TEAM }, (_, i) =>
    team[i]
      ? `<span class="thumb" title="${escapeHtml(team[i].species)}">${monImage(team[i], 'liga-img')}</span>`
      : '<span class="thumb thumb-empty"></span>'
  ).join('');
}

function sideHtml(name, other, key, state) {
  const label = state === 'win' ? '🏆 Ganador · +3 pts' : state === 'lose' ? 'Derrota' : 'Elegir ganador';
  return `
    <button type="button" class="duel-side is-${state}" data-pick="${encodeURIComponent(name)}"
      data-a="${encodeURIComponent(name)}" data-b="${encodeURIComponent(other)}" data-key="${escapeHtml(key)}"
      aria-pressed="${state === 'win'}" title="${state === 'win' ? 'Clic para deshacer' : 'Clic para marcar como ganador'}">
      <span class="duel-name">${escapeHtml(name)}</span>
      <span class="duel-team">${teamThumbs(name)}</span>
      <span class="duel-tag">${label}</span>
    </button>`;
}

function duelHtml(m) {
  const winner = leagueResults[m.key];
  const stateOf = (name) => (!winner ? 'none' : winner === lcName(name) ? 'win' : 'lose');
  return `
    <article class="duel${winner ? ' is-played' : ''}">
      ${sideHtml(m.a, m.b, m.key, stateOf(m.a))}
      <div class="duel-vs" aria-hidden="true">VS</div>
      ${sideHtml(m.b, m.a, m.key, stateOf(m.b))}
    </article>`;
}

function roundStatus(rd) {
  const done = rd.matches.filter((m) => leagueResults[m.key]).length;
  return { done, total: rd.matches.length, complete: done === rd.matches.length };
}

function renderLeague() {
  const root = document.getElementById('liga-root');
  if (!root) return;

  if (leagueError) {
    root.innerHTML = `<p class="roster-empty roster-error">No se pudo cargar la liga: ${escapeHtml(leagueError)}</p>`;
    return;
  }
  if (!leagueLoaded) return;

  const standings = computeStandings();
  const totalMatches = schedule.reduce((n, r) => n + r.matches.length, 0);
  const played = schedule.reduce((n, r) => n + roundStatus(r).done, 0);

  // Si el usuario no ha elegido jornada, mostramos la primera con combates pendientes.
  if (!roundChosen) {
    const firstPending = schedule.findIndex((r) => !roundStatus(r).complete);
    selectedRound = firstPending === -1 ? schedule.length - 1 : firstPending;
  }
  const rd = schedule[selectedRound];

  const rows = standings
    .map((row, i) => {
      const qualifies = played > 0 && i < QUALIFY;
      const cut = played > 0 && i === QUALIFY - 1;
      return `<tr class="${qualifies ? 'q' : ''}${cut ? ' q-cut' : ''}">
        <td class="c-pos">${i + 1}</td>
        <td class="c-name">${escapeHtml(row.name)}</td>
        <td>${row.pj}</td><td>${row.v}</td><td>${row.d}</td>
        <td class="c-pts">${row.pts}</td>
      </tr>`;
    })
    .join('');

  const pills = schedule
    .map((r, i) => {
      const st = roundStatus(r);
      return `<button type="button" class="pill${i === selectedRound ? ' is-active' : ''}${st.complete ? ' is-done' : ''}" data-round="${i}"
        title="Jornada ${r.round}: ${st.done}/${st.total} jugados">${r.round}</button>`;
    })
    .join('');

  const st = roundStatus(rd);

  root.innerHTML = `
    <div class="liga-summary">
      <span><strong>${played}</strong> / ${totalMatches} combates jugados</span>
      <span class="liga-rule">Victoria = ${POINTS_WIN} puntos · Los ${QUALIFY} primeros pasan al bracket</span>
    </div>

    <div class="card liga-table-card">
      <h2>Clasificación</h2>
      <div class="table-scroll">
        <table class="liga-table">
          <thead><tr><th class="c-pos">#</th><th class="c-name">Participante</th><th title="Jugados">PJ</th><th title="Victorias">V</th><th title="Derrotas">D</th><th class="c-pts">Pts</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${played > 0 ? `<p class="liga-note">Zona dorada: clasifican al bracket eliminatorio.</p>` : ''}
    </div>

    <div class="liga-rounds-head">
      <h2>Combates</h2>
      <div class="pills" role="group" aria-label="Jornadas">${pills}</div>
    </div>

    <div class="round-title">
      <strong>Jornada ${rd.round}</strong> de ${schedule.length}
      <span class="round-progress">${st.done}/${st.total} jugados</span>
    </div>
    <p class="liga-hint">Haz clic en un participante para marcarlo como ganador. Vuelve a pulsarlo para deshacerlo.</p>

    <div class="duels">${rd.matches.map(duelHtml).join('')}</div>`;
}

async function loadLeague() {
  try {
    const res = await fetch('/api/pokemon-league');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');

    const first = !leagueLoaded;
    leaguePlayers = data.players;
    leagueResults = data.results;
    leagueProtected = data.protected;
    if (first) schedule = buildSchedule(leaguePlayers);
    leagueLoaded = true;
    leagueError = '';
  } catch (err) {
    leagueError = err.message;
    console.error(err);
  }
  renderLeague();
}

// --- Guardar resultados (en cola, para que lleguen en orden) ---

let leagueQueue = Promise.resolve();

function getAdminKey() {
  try { return sessionStorage.getItem(ADMIN_KEY_STORAGE) || ''; } catch { return ''; }
}
function setAdminKey(v) {
  try { v ? sessionStorage.setItem(ADMIN_KEY_STORAGE, v) : sessionStorage.removeItem(ADMIN_KEY_STORAGE); } catch { /* ignorar */ }
}

async function sendResult(a, b, winner) {
  const res = await fetch('/api/pokemon-league', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': getAdminKey() },
    body: JSON.stringify({ a, b, winner }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Error desconocido');
    err.needKey = res.status === 401;
    throw err;
  }
}

function setResult(a, b, key, winnerName) {
  // Si el servidor está protegido con clave y aún no la tenemos, la pedimos.
  if (leagueProtected && !getAdminKey()) {
    const k = window.prompt('Solo el administrador puede marcar resultados. Introduce la clave:');
    if (!k) return;
    setAdminKey(k.trim());
  }

  const previous = leagueResults[key];
  if (winnerName == null) delete leagueResults[key];
  else leagueResults[key] = lcName(winnerName);
  renderLeague(); // respuesta inmediata

  leagueQueue = leagueQueue
    .then(() => sendResult(a, b, winnerName))
    .catch(async (err) => {
      if (err.needKey) setAdminKey('');
      alert(err.message);
      if (previous) leagueResults[key] = previous;
      else delete leagueResults[key];
      await loadLeague(); // volvemos a lo que dice el servidor
    });
}

document.getElementById('liga-root').addEventListener('click', (e) => {
  const pill = e.target.closest('[data-round]');
  if (pill) {
    selectedRound = Number(pill.dataset.round);
    roundChosen = true;
    renderLeague();
    return;
  }

  const side = e.target.closest('[data-pick]');
  if (!side) return;

  const pick = decodeURIComponent(side.dataset.pick);
  const a = decodeURIComponent(side.dataset.a);
  const b = decodeURIComponent(side.dataset.b);
  const key = side.dataset.key;

  // Pulsar de nuevo al ganador deshace el resultado; pulsar al otro lo cambia.
  setResult(a, b, key, leagueResults[key] === lcName(pick) ? null : pick);
});

loadLeague();
setInterval(loadLeague, 30 * 1000);
