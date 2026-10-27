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
let rivals = {};           // { idJugador: { species, dexId?, shiny? } }  Pokémon rival de la escena de combate
let leads = {};            // { idJugador: índice del Pokémon que está en el campo }
let badges = {};           // { idJugador: máscara de bits (bit 0 = medalla 1 ... bit 8 = Liga) }

const idOf = (p) => p.name.toLowerCase();

// ---------------------------------------------------------------
// Medallas (misma forma y color para todos los jugadores)
// Cambia aquí los nombres si quieres los de las medallas reales del juego.
// ---------------------------------------------------------------

const BADGES = [
  { name: 'Medalla 1', color: '#9aa4b2', shape: { type: 'path', d: 'M50 5 L90 50 L50 95 L10 50 Z M50 5 L50 95 M10 50 L90 50' } },   // octaedro gris
  { name: 'Medalla 2', color: '#5ec8ff', shape: { type: 'path', d: 'M50 5 C50 5 18 42 18 63 A32 32 0 0 0 82 63 C82 42 50 5 50 5 Z' } }, // gota azul celeste
  { name: 'Medalla 3', color: '#ffa726', shape: { type: 'star', points: 16, inner: 0.62 } },                                             // sol
  { name: 'Medalla 4', color: '#c58bff', shape: { type: 'flower', petals: 8 } },                                                          // flor de 8 pétalos
  { name: 'Medalla 5', color: '#ff6fae', shape: { type: 'path', d: 'M50 90 C20 68 7 48 7 31 C7 18 17 10 29 10 C39 10 47 16 50 25 C53 16 61 10 71 10 C83 10 93 18 93 31 C93 48 80 68 50 90 Z' } }, // corazón rosa
  { name: 'Medalla 6', color: '#ffd23f', shape: { type: 'poly', sides: 40 } },                                                            // círculo amarillo
  { name: 'Medalla 7', color: '#ff4b3a', shape: { type: 'path', d: 'M50 4 C57 22 80 34 80 60 C80 78 67 94 50 94 C33 94 20 80 20 62 C20 50 26 41 33 34 C33 44 39 49 44 49 C40 34 43 18 50 4 Z' } }, // llama roja
  { name: 'Medalla 8', color: '#52d681', shape: { type: 'path', d: 'M88 8 C46 10 16 34 14 70 C14 78 16 84 20 90 C58 90 86 58 88 8 Z M20 90 L8 98 M20 90 L66 38' } }, // pluma verde
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
  if (shape.type === 'path') {
    // Misma figura a la mitad de tamaño, centrada, para el brillo interior.
    return `<svg viewBox="0 0 100 100" aria-hidden="true">
      <path class="b-shape" d="${shape.d}" />
      <path class="b-inner" d="${shape.d}" transform="translate(27.5 27.5) scale(.45)" />
    </svg>`;
  }
  if (shape.type === 'flower') {
    const petals = Array.from({ length: shape.petals }, (_, k) =>
      `<ellipse class="b-shape" cx="50" cy="26" rx="13" ry="21" transform="rotate(${(360 / shape.petals) * k} 50 50)" />`
    ).join('');
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${petals}<circle class="b-inner" cx="50" cy="50" r="13" /></svg>`;
  }
  return `<svg viewBox="0 0 100 100" aria-hidden="true">
    <polygon class="b-shape" points="${shapePoints(shape, 44)}" />
    <polygon class="b-inner" points="${shapePoints(shape, 22)}" />
  </svg>`;
}

function badgesBlock(id, compact = false) {
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

  if (compact) {
    return `<div class="bt-medals${champion ? ' is-champion' : ''}" role="group" aria-label="Medallas: ${total} de ${BADGES.length}" title="Medallas ${total}/${BADGES.length}">
      <div class="badges-row">${buttons}</div>
      <div class="bt-medal-count">MEDALLAS ${total}/${BADGES.length}</div>
    </div>`;
  }

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

const SHINY_URL = (id) =>
  `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${id}.png`;

// Naturalezas: [español, inglés, sube, baja]  (stats: ATQ, DEF, ATQ.ESP, DEF.ESP, VEL)
const NATURES = [
  ['Fuerte', 'Hardy'], ['Huraña', 'Lonely', 'ATQ', 'DEF'], ['Audaz', 'Brave', 'ATQ', 'VEL'], ['Firme', 'Adamant', 'ATQ', 'ATQ.ESP'], ['Pícara', 'Naughty', 'ATQ', 'DEF.ESP'],
  ['Osada', 'Bold', 'DEF', 'ATQ'], ['Dócil', 'Docile'], ['Plácida', 'Relaxed', 'DEF', 'VEL'], ['Agitada', 'Impish', 'DEF', 'ATQ.ESP'], ['Floja', 'Lax', 'DEF', 'DEF.ESP'],
  ['Miedosa', 'Timid', 'VEL', 'ATQ'], ['Activa', 'Hasty', 'VEL', 'DEF'], ['Seria', 'Serious'], ['Alegre', 'Jolly', 'VEL', 'ATQ.ESP'], ['Ingenua', 'Naive', 'VEL', 'DEF.ESP'],
  ['Modesta', 'Modest', 'ATQ.ESP', 'ATQ'], ['Afable', 'Mild', 'ATQ.ESP', 'DEF'], ['Mansa', 'Quiet', 'ATQ.ESP', 'VEL'], ['Tímida', 'Bashful'], ['Alocada', 'Rash', 'ATQ.ESP', 'DEF.ESP'],
  ['Serena', 'Calm', 'DEF.ESP', 'ATQ'], ['Amable', 'Gentle', 'DEF.ESP', 'DEF'], ['Grosera', 'Sassy', 'DEF.ESP', 'VEL'], ['Cauta', 'Careful', 'DEF.ESP', 'ATQ.ESP'], ['Rara', 'Quirky'],
];
const natureText = (n) => (n[2] ? `${n[0]} (+${n[2]} −${n[3]})` : `${n[0]} (neutra)`);
const natureByName = (name) => NATURES.find((n) => n[0] === name || n[1].toLowerCase() === String(name).toLowerCase());

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

// ---------------------------------------------------------------
// Pokémon no permitidos para la entrega
// ---------------------------------------------------------------

const NOGUARD = [['No Guard', 'Indefenso']];                 // solo prohibido junto a un movimiento OHKO
const BANNED_ABILITIES = [['Wonder Guard', 'Superguarda']];
const BANNED_MOVES = [['Fissure', 'Fisura'], ['Guillotine', 'Guillotina'], ['Horn Drill', 'Perforador'], ['Sheer Cold', 'Frío Polar']];
const BANNED_SPECIES = ['slaking'];

const normText = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const bannedSet = (pairs) => new Set(pairs.flat().map(normText));
const BAN_ABILITY_SET = bannedSet(BANNED_ABILITIES);
const NOGUARD_SET = bannedSet(NOGUARD);
const BAN_MOVE_SET = bannedSet(BANNED_MOVES);

// Devuelve la lista de motivos por los que un Pokémon no vale (vacía si es válido).
function banReasons(mon) {
  const reasons = [];
  if (BANNED_SPECIES.includes(normText(mon.species))) reasons.push('Slaking no está permitido');
  if (BAN_ABILITY_SET.has(normText(mon.ability))) reasons.push(`la habilidad ${mon.ability} no está permitida`);
  // Indefenso + movimiento OHKO: solo es ilegal la combinación (cada cosa por separado vale).
  if (NOGUARD_SET.has(normText(mon.ability))) {
    (mon.moves || []).filter(Boolean).forEach((m) => {
      if (BAN_MOVE_SET.has(normText(m))) reasons.push(`Indefenso junto al movimiento OHKO ${m} no está permitido`);
    });
  }
  return reasons;
}

const banAlert = (reasons) =>
  `<div class="ban-alert" role="alert">⚠ Pokémon no permitido para la entrega: ${reasons.map(escapeHtml).join('; ')}.</div>`;

function monImage(mon, cls = 'mon-img') {
  const id = mon.dexId || dexLookup(mon.species)?.id;
  if (!id) return `<div class="${cls} ${cls}-empty">?</div>`;

  // Orden de intentos: shiny (si toca) -> dibujo normal -> dibujo de la especie base.
  const fb = dexById[id]?.baseId;
  const urls = [mon.shiny ? SHINY_URL(id) : null, ARTWORK_URL(id), fb ? ARTWORK_URL(fb) : null].filter(Boolean);
  const [first, ...rest] = urls;
  const fbAttr = rest.length ? ` data-fb="${rest.join('|')}"` : '';
  const onerror = `var q=(this.dataset.fb||'').split('|').filter(Boolean);if(q.length){this.src=q.shift();this.dataset.fb=q.join('|')}else{this.replaceWith(Object.assign(document.createElement('div'),{className:'${cls} ${cls}-empty',textContent:'?'}))}`;
  return `<img class="${cls}${mon.shiny ? ' is-shiny' : ''}" src="${first}"${fbAttr} alt="${escapeHtml(mon.species)}" loading="lazy" onerror="${onerror}">`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------
// Render
// ---------------------------------------------------------------

// Tipos (ids de PokéAPI 1..18): nombre en español y color.
const TYPES = {
  1: ['Normal', '#A8A77A'], 2: ['Lucha', '#C22E28'], 3: ['Volador', '#A98FF3'], 4: ['Veneno', '#A33EA1'],
  5: ['Tierra', '#E2BF65'], 6: ['Roca', '#B6A136'], 7: ['Bicho', '#A6B91A'], 8: ['Fantasma', '#735797'],
  9: ['Acero', '#B7B7CE'], 10: ['Fuego', '#EE8130'], 11: ['Agua', '#6390F0'], 12: ['Planta', '#7AC74C'],
  13: ['Eléctrico', '#F7D02C'], 14: ['Psíquico', '#F95587'], 15: ['Hielo', '#96D9D6'], 16: ['Dragón', '#6F35FC'],
  17: ['Siniestro', '#705746'], 18: ['Hada', '#D685AD'],
};

// Fondo del movimiento según su tipo; texto claro u oscuro según el color.
function moveLi(name) {
  const t = TYPES[moveTypes[String(name).toLowerCase()]];
  if (!t) return `<li>${escapeHtml(name)}</li>`;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(t[1].slice(i, i + 2), 16));
  const dark = (0.299 * r + 0.587 * g + 0.114 * b) > 150;
  return `<li class="typed${dark ? ' typed-light' : ''}" style="--tc:${t[1]}" title="${t[0]}">${escapeHtml(name)}</li>`;
}

function monDetail(mon, index, id) {
  const moves = mon.moves.filter(Boolean).map(moveLi).join('');
  return `
    <div class="mon-detail${banReasons(mon).length ? ' is-banned' : ''}">
      ${banReasons(mon).length ? banAlert(banReasons(mon)) : ''}
      ${monImage(mon, 'detail-img')}
      <h2>${escapeHtml(mon.species)}${mon.shiny ? ' <span class="shiny-star" title="Shiny">✨</span>' : ''}</h2>
      ${mon.nickname ? `<div class="mon-nick">“${escapeHtml(mon.nickname)}”</div>` : ''}
      <div class="detail-rows">
        <div class="mon-ability"><span>Habilidad</span> ${escapeHtml(mon.ability)}</div>
        ${mon.nature ? `<div class="mon-ability"><span>Naturaleza</span> ${escapeHtml(natureByName(mon.nature) ? natureText(natureByName(mon.nature)) : mon.nature)}</div>` : ''}
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
        <label>Naturaleza
          <select name="nature">
            <option value="">— Sin indicar —</option>
            ${NATURES.map((n) => `<option value="${n[0]}"${mon?.nature === n[0] ? ' selected' : ''}>${natureText(n)}</option>`).join('')}
          </select>
        </label>
        <label class="check-label"><input type="checkbox" name="shiny"${mon?.shiny ? ' checked' : ''} /> ✨ Shiny</label>
      </div>
      <div class="mon-form-label">Movimientos (1 a 4)</div>
      <div class="mon-form-moves">${moveInputs}</div>
      <div class="form-ban" data-ban></div>
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

// Avatares fijos: public/pokemon/avatars/<nombre>.png (minúsculas, sin tildes ni espacios).
// Si alguien se apuntó con un nombre distinto al de la Liga, se enlaza aquí: 'nombre-apuntado': 'archivo'.
const AVATAR_ALIAS = { beldinho: 'beldino' };

function avatarSlug(name) {
  const slug = String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return AVATAR_ALIAS[slug] || slug;
}

// Si falta la imagen, se muestra un círculo con la inicial.
function avatarHtml(name, cls) {
  const initial = escapeHtml(String(name).trim().charAt(0).toUpperCase() || '?');
  const onerror = `this.replaceWith(Object.assign(document.createElement('span'),{className:'${cls} avatar-fallback',textContent:'${initial}'}))`;
  return `<img class="${cls}" src="/pokemon/avatars/${avatarSlug(name)}.png" alt="" loading="lazy" draggable="false" onerror="${onerror}">`;
}

function nameSize(name) {
  const n = name.length;
  return n <= 7 ? '1.5rem' : n <= 11 ? '1.2rem' : n <= 16 ? '1rem' : '0.85rem';
}

// ---- Tipos de cada especie (PokéAPI), con caché; solo se piden los que se ven en pantalla ----
const TYPES_CACHE_KEY = 'pokemon-types-v1';
let typeCache = {};
try { typeCache = JSON.parse(localStorage.getItem(TYPES_CACHE_KEY) || '{}'); } catch { typeCache = {}; }
const typePending = new Set();
let typeRefreshTimer = null;

function typesOf(mon) {
  const id = mon.dexId || dexLookup(mon.species)?.id;
  if (!id) return [];
  if (typeCache[id]) return typeCache[id];
  if (!typePending.has(id)) {
    typePending.add(id);
    fetch(`https://pokeapi.co/api/v2/pokemon/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status))))
      .then((d) => {
        typeCache[id] = d.types.map((t) => idFromUrl(t.type.url));
        try { localStorage.setItem(TYPES_CACHE_KEY, JSON.stringify(typeCache)); } catch { /* ignorar */ }
        clearTimeout(typeRefreshTimer);
        typeRefreshTimer = setTimeout(() => { if (!editing && !viewing && !animating) render(); }, 80);
      })
      .catch(() => { /* sin tipos: se muestra sin chips */ });
  }
  return [];
}

const isLightColor = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
};

function moveBtn(name) {
  if (!name) return '<div class="bt-mv empty">—</div>';
  const t = TYPES[moveTypes[String(name).toLowerCase()]];
  if (!t) return `<div class="bt-mv">${escapeHtml(name)}</div>`;
  return `<div class="bt-mv${isLightColor(t[1]) ? ' light' : ''}" style="--tc:${t[1]}" title="${t[0]}"><span>${escapeHtml(name)}</span></div>`;
}

function leadIndex(id) {
  const n = (teams[id] || []).length;
  return Math.max(0, Math.min(leads[id] ?? 0, n - 1));
}

// Escena de combate: el equipo del participante frente al Pokémon rival que ha elegido.
function circleHtml(player) {
  const id = idOf(player);
  const eid = encodeURIComponent(id);
  const team = teams[id] || [];
  const mask = badges[id] || 0;
  const li = leadIndex(id);
  const lead = team[li];
  const rival = rivals[id];
  const banned = lead ? banReasons(lead) : [];
  const leadTypes = lead ? typesOf(lead) : [];
  const rivalTypes = rival ? typesOf(rival) : [];
  const firstMoveType = lead ? TYPES[moveTypes[String(lead.moves[0] || '').toLowerCase()]] : null;
  const tint = TYPES[leadTypes[0]]?.[1] || firstMoveType?.[1] || '#4cc9f0';
  const chips = (ids) => ids.map((t) => TYPES[t] ? `<span class="bt-type${isLightColor(TYPES[t][1]) ? ' light' : ''}" style="--tc:${TYPES[t][1]}">${TYPES[t][0]}</span>` : '').join('');
  const fav = favInfo(player.name);

  const leadName = lead ? (lead.nickname || lead.species) : '';
  const msg = lead ? `¡Adelante, ${leadName}!` : team.length ? '' : 'Todavía no hay Pokémon. ¡Añade el primero!';

  const sparks = (on) => on ? '<i class="bt-spark" style="left:12%;top:14%"></i><i class="bt-spark" style="right:14%;top:26%;animation-delay:.4s"></i><i class="bt-spark" style="left:46%;top:4%;animation-delay:.8s"></i><i class="bt-spark" style="right:24%;bottom:22%;animation-delay:1.1s"></i>' : '';

  const meHtml = lead
    ? `<button type="button" class="bt-sprite" data-action="open-mon" data-id="${eid}" data-index="${li}" title="Ver detalles de ${escapeHtml(lead.species)}" aria-label="Ver detalles de ${escapeHtml(lead.species)}">${monImage(lead, 'bt-img')}${sparks(lead.shiny)}</button>`
    : `<button type="button" class="bt-sprite" data-action="add-mon" data-id="${eid}" aria-label="Añadir Pokémon"><div class="bt-img bt-img-empty">+</div></button>`;

  const foeHtml = rival
    ? `${monImage(rival, 'bt-img')}${sparks(rival.shiny)}`
    : '<div class="bt-img bt-img-empty">?</div>';

  const parties = Array.from({ length: MAX_TEAM }, (_, i) => {
    const mon = team[i];
    if (!mon) return `<button type="button" class="bt-slot bt-slot-empty" data-action="add-mon" data-id="${eid}" title="Añadir Pokémon" aria-label="Añadir Pokémon">+</button>`;
    const title = `${mon.species}${mon.nickname ? ` “${mon.nickname}”` : ''}${banReasons(mon).length ? ' — ⚠ NO PERMITIDO' : ''}`;
    return `<button type="button" class="bt-slot${i === li ? ' is-on' : ''}${banReasons(mon).length ? ' is-banned' : ''}" data-action="set-lead" data-id="${eid}" data-index="${i}" title="${escapeHtml(title)}" aria-label="Sacar a ${escapeHtml(mon.species)}">${monImage(mon, 'bt-slot-img')}</button>`;
  }).join('');

  const moves = lead ? [0, 1, 2, 3].map((i) => moveBtn(lead.moves[i])).join('') : [0, 1, 2, 3].map(() => moveBtn('')).join('');
  const nat = lead?.nature ? (natureByName(lead.nature) ? natureText(natureByName(lead.nature)) : lead.nature) : '—';

  return `
    <div class="battle${fav ? ` is-fav fav-glow-${fav.rank + 1}` : ''}">
      <div class="bt-ghost" aria-hidden="true">${escapeHtml(player.name.toUpperCase())}</div>
      <div class="bt-head">
        ${avatarHtml(player.name, 'bt-avatar')}
        <div>
          <h2 class="bt-name">${escapeHtml(player.name)}${hasBadge(mask, LEAGUE) ? ' <span class="crown" title="Campeón de la Liga">🏆</span>' : ''}</h2>
          <div class="bt-sub">${team.length}/${MAX_TEAM} Pokémon</div>
        </div>
        ${badgesBlock(id, true)}
      </div>

      <div class="bt-field" style="--tint:${tint}">
        <div class="bt-plat bt-plat-foe"></div><div class="bt-plat bt-plat-me"></div>
        <div class="bt-foe">${foeHtml}</div>
        <div class="bt-me">${meHtml}</div>

        <div class="bt-box bt-box-foe">
          <div class="bt-nm"><span>${rival ? escapeHtml(rival.species) : 'Rival sin elegir'}</span><span class="bt-lv">VS</span></div>
          <div class="bt-hp"><b>PS</b><div class="bt-hpbar"><div class="bt-hpfill"></div></div></div>
          ${rivalTypes.length ? `<div class="bt-types">${chips(rivalTypes)}</div>` : ''}
          <button type="button" class="bt-link" data-action="edit-rival" data-id="${eid}">⚔ ${rival ? 'Cambiar rival' : 'Elegir rival'}</button>
        </div>

        ${lead ? `<div class="bt-box bt-box-me${banned.length ? ' is-banned' : ''}">
          <div class="bt-nm"><span>${escapeHtml(leadName)}</span><span class="bt-lv">${lead.shiny ? '✦ SHINY' : ''}</span></div>
          <div class="bt-hp"><b>PS</b><div class="bt-hpbar"><div class="bt-hpfill"></div></div></div>
          ${leadTypes.length ? `<div class="bt-types">${chips(leadTypes)}</div>` : ''}
        </div>` : ''}

        ${msg ? `<div class="bt-msg fx-type">${escapeHtml(msg)}</div>` : ''}
      </div>

      <div class="bt-cmd">
        <div class="bt-moves">${moves}</div>
        ${lead ? `<div class="bt-info">
          ${banned.length ? banAlert(banned) : ''}
          <div><span>Pokémon</span>${escapeHtml(lead.species)}</div>
          <div><span>Habilidad</span>${escapeHtml(lead.ability)}</div>
          <div><span>Objeto</span>${escapeHtml(lead.item || '—')}</div>
          <div><span>Naturaleza</span>${escapeHtml(nat)}</div>
          <button type="button" class="bt-link" data-action="open-mon" data-id="${eid}" data-index="${li}">Ver / editar este Pokémon</button>
        </div>` : ''}
      </div>

      <div class="bt-party">${parties}</div>
      <div class="bt-hint">Pulsa un Pokémon del equipo para sacarlo al campo</div>
    </div>`;
}

function trainersHtml() {
  const cur = currentId;
  return '<h3>ENTRENADORES</h3>' + players.map((p, i) => {
    const id = idOf(p);
    return `<button type="button" class="tr-row${id === cur ? ' is-on' : ''}" data-action="go-player" data-index="${i}">
      ${avatarHtml(p.name, 'tr-avatar')}<span class="tr-name">${escapeHtml(p.name)}</span><span class="tr-count">${countBadges(badges[id] || 0)}/${BADGES.length}</span></button>`;
  }).join('');
}

// ---- Efectos de pantalla (encendido + barrido de Poké Ball). Se desactivan con "reducir movimiento". ----
const dexScreen = document.getElementById('dex-screen');
const dexWipe = document.getElementById('dex-wipe');
function playFx() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  dexScreen.classList.remove('fx-boot');
  dexWipe.classList.remove('fx-wipe-on');
  void dexScreen.offsetWidth;
  dexScreen.classList.add('fx-boot');
  dexWipe.classList.add('fx-wipe-on');
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

  stage.innerHTML = circleHtml(player) + favBlock(player.name) + `<div class="import-row"><button type="button" class="link-btn" data-action="import-team" data-id="${encodeURIComponent(currentId)}">⬆ Importar equipo desde archivo (.txt)</button></div>` + porraBlock(currentId);
  updatePorraBar();
  document.getElementById('trainers').innerHTML = trainersHtml();

  const index = players.indexOf(player);
  counterEl.textContent = `${index + 1} / ${players.length}`;
  jump.innerHTML = players
    .map((p, i) => `<option value="${i}"${i === index ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
    .join('');

  document.getElementById('prev').disabled = players.length < 2;
  document.getElementById('next').disabled = players.length < 2;
}

// Ventana emergente de un Pokémon (ver / editar / añadir)
function rivalFormHtml(id) {
  const cur = rivals[id];
  const v = (x) => escapeHtml(x || '').replace(/"/g, '&quot;');
  return `<h2 class="popup-title">Pokémon rival</h2>
    <p class="card-text small">El Pokémon que aparece enfrente de ti en tu escena de combate. Puede ser cualquiera.</p>
    <form class="rival-form" data-id="${encodeURIComponent(id)}" autocomplete="off">
      <label>Pokémon rival *<input name="species" type="text" maxlength="30" required list="pokemon-names" placeholder="Escribe en inglés…" value="${v(cur?.species)}" /></label>
      <label class="check-label"><input type="checkbox" name="shiny"${cur?.shiny ? ' checked' : ''} /> ✨ Shiny</label>
      <p class="form-error" role="alert">${escapeHtml(teamError)}</p>
      <div class="rival-actions">
        <button type="submit" class="add-btn small">Guardar</button>
        ${cur ? '<button type="button" class="link-btn link-danger" data-action="clear-rival">Quitar rival</button>' : ''}
        <button type="button" class="link-btn" data-action="cancel-mon">Cancelar</button>
      </div>
    </form>`;
}

function renderPopup() {
  if (!viewing && !editing) {
    monModal.hidden = true;
    return;
  }

  if (editing && editing.rival) {
    monBody.innerHTML = rivalFormHtml(editing.id);
    monModal.hidden = false;
    monBody.querySelector('input')?.focus();
  } else if (editing) {
    monBody.innerHTML = `<h2 class="popup-title">${editing.index >= 0 ? 'Editar Pokémon' : 'Añadir Pokémon'}</h2>${monForm(editing.id, editing.index)}`;
    monModal.hidden = false;
    const formEl = monBody.querySelector('.mon-form');
    if (formEl) updateFormBan(formEl);
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

// Cambio de participante (con el efecto de pantalla de la Pokédex)
async function goTo(newIndex) {
  if (animating || players.length < 2) return;
  playFx();
  currentId = idOf(players[newIndex]);
  render();
}

function step(dir) {
  if (!players.length) return;
  const i = players.indexOf(currentPlayer());
  goTo((i + dir + players.length) % players.length);
}

// ---------------------------------------------------------------
// Porra: orden de los 8 clasificados de la Liga + top 3 del bracket
// ---------------------------------------------------------------

let porras = {};            // { idJugador: { league: [8 nombres], top3: [3 nombres] } }
let spectators = [];        // [{ name, league, top3, at }]  (porras de gente que no participa)
const SPEC = '__spec';        // valor del selector "Soy espectador"
const SPEC_STORE = 'pokemon-spec-v1';
function getSpecId() { try { return JSON.parse(localStorage.getItem(SPEC_STORE) || '{}'); } catch { return {}; } }
function setSpecId(v) { try { localStorage.setItem(SPEC_STORE, JSON.stringify(v)); } catch { /* sin almacenamiento */ } }
let porraClosed = false;    // se cierra al empezar el torneo
let porraDraft = null;      // borrador que se edita en el popup
const porraModal = document.getElementById('porra-modal');
const porraBody = document.getElementById('porra-body');
const porraOpenIds = new Set(); // desplegables abiertos
const MEDALS = ['🥇', '🥈', '🥉'];
const POOL_SIZE = 8;

function updatePorraBar() {
  const done = players.filter((p) => porras[idOf(p)]).length;
  const el = document.getElementById('porra-count');
  if (el) {
    el.textContent = players.length
      ? `${done}/${players.length} participantes${spectators.length ? ` · ${spectators.length} espectador${spectators.length === 1 ? '' : 'es'}` : ''} con porra`
      : '';
  }
  const btn = document.getElementById('open-porra');
  if (btn) {
    btn.disabled = porraClosed;
    btn.textContent = porraClosed ? '🎯 Porra cerrada' : '🎯 Haz tu porra';
  }
}

// Todas las porras (participantes + espectadores) en una sola lista
function allPorras() {
  const fromPlayers = players
    .filter((p) => porras[idOf(p)])
    .map((p) => ({ kind: 'player', key: idOf(p), name: p.name, ...porras[idOf(p)] }));
  const fromSpec = spectators.map((s) => ({ kind: 'spec', key: s.name.toLowerCase(), ...s }));
  return [...fromPlayers, ...fromSpec];
}

// Estadísticas de la porra: quién es favorito (más veces en el top 3, luego campeón, luego clasificado)
function porraStats() {
  const list = allPorras();
  const map = new Map();
  const get = (n) => {
    const k = avatarSlug(n);
    if (!map.has(k)) map.set(k, { name: n, champ: 0, top3: 0, qual: 0, posSum: 0 });
    return map.get(k);
  };
  list.forEach((p) => {
    p.league.forEach((n, i) => { const s = get(n); s.qual++; s.posSum += i + 1; });
    p.top3.forEach((n, i) => { const s = get(n); s.top3++; if (i === 0) s.champ++; });
  });
  const rows = [...map.values()].sort(
    (a, b) => b.top3 - a.top3 || b.champ - a.champ || b.qual - a.qual || a.name.localeCompare(b.name, 'es')
  );
  return { total: list.length, rows };
}

// Puesto de favorito (0, 1 o 2) de un participante, o -1 si no está entre los 3 más repetidos
function favInfo(name, stats = porraStats()) {
  const k = avatarSlug(name);
  const i = stats.rows.slice(0, 3).findIndex((r) => r.top3 > 0 && avatarSlug(r.name) === k);
  return i === -1 ? null : { rank: i, count: stats.rows[i].top3, total: stats.total };
}

function favBlock(name) {
  const f = favInfo(name);
  if (!f) return '';
  return `<div class="fav-row"><span class="fav-tag fav-${f.rank + 1}" title="Está entre los 3 más repetidos en el top 3 de las porras">⭐ Favorito del público #${f.rank + 1} · en el top 3 de ${f.count} de ${f.total} porras</span></div>`;
}

// ---------- Pestaña "Porras" ----------
const porrasTabOpen = new Set();

function renderPorrasTab() {
  const root = document.getElementById('porras-root');
  if (!root) return;
  if (!players.length && !spectators.length) {
    root.innerHTML = '<p class="roster-empty">Cargando las porras…</p>';
    return;
  }

  const list = allPorras();
  const stats = porraStats();
  const nPlayers = list.filter((p) => p.kind === 'player').length;
  const nSpec = list.length - nPlayers;
  const pending = players.filter((p) => !porras[idOf(p)]).map((p) => p.name);

  const actions = porraClosed
    ? '<p class="porra-note">🔒 La porra está cerrada: el torneo ya ha empezado.</p>'
    : `<div class="porras-actions">
         <button type="button" class="add-btn small" data-action="open-porra" data-id="">🎯 Haz tu porra</button>
         <button type="button" class="add-btn small ghost" data-action="open-porra" data-id="${SPEC}">👀 Soy espectador</button>
       </div>`;

  const maxTop = Math.max(1, ...stats.rows.map((r) => r.top3));
  const favRows = stats.rows
    .map(
      (r, i) => `<tr class="${i < 3 && r.top3 > 0 ? 'fav-top' : ''}">
        <td class="c-pos">${i + 1}</td>
        <td class="c-name">${avatarHtml(r.name, 'row-avatar')}${escapeHtml(r.name)}${i < 3 && r.top3 > 0 ? ' <span title="Favorito">⭐</span>' : ''}</td>
        <td>${r.champ}</td>
        <td class="c-bar"><span class="bar"><span style="width:${Math.round((r.top3 / maxTop) * 100)}%"></span></span><b>${r.top3}</b></td>
        <td>${r.qual}/${stats.total}</td>
        <td>${(r.posSum / r.qual).toFixed(1)}</td>
      </tr>`
    )
    .join('');

  const detail = (p) => {
    const k = `${p.kind}:${p.key}`;
    return `<details class="porra-details" data-k="${escapeHtml(k)}"${porrasTabOpen.has(k) ? ' open' : ''}>
      <summary>
        <span class="porras-who">${escapeHtml(p.name)} <em class="who-tag ${p.kind}">${p.kind === 'player' ? 'Participante' : 'Espectador'}</em></span>
        <span class="porras-podium">${p.top3.map((n, i) => `${MEDALS[i]} ${escapeHtml(n)}`).join(' · ')}</span>
      </summary>
      <div class="porra-body"><h4>Clasificados de la Liga</h4>
        <ol class="porra-list porra-list-inline">${p.league.map((n) => `<li>${personRow(n)}</li>`).join('')}</ol>
      </div>
    </details>`;
  };

  root.innerHTML = `
    <div class="card porras-head">
      <h2>Porras del torneo</h2>
      <p class="card-text"><strong>${list.length}</strong> porra${list.length === 1 ? '' : 's'} hecha${list.length === 1 ? '' : 's'} (${nPlayers} de participantes${nSpec ? `, ${nSpec} de espectadores` : ''}).
        Cada uno predice <strong>el orden de los 8 clasificados</strong> de la Liga y <strong>su top 3</strong> del bracket. ¡Cualquiera puede participar!</p>
      ${actions}
    </div>

    <div class="card">
      <h2>⭐ Favoritos</h2>
      ${
        stats.total
          ? `<p class="card-text">Ordenados por las veces que aparecen en el top 3 de las porras. Los 3 primeros llevan el distintivo de favorito en la ventana Participantes.</p>
             <div class="table-scroll"><table class="liga-table porras-table">
               <thead><tr><th class="c-pos">#</th><th class="c-name">Participante</th><th title="Veces elegido campeón">🥇</th><th title="Veces en el top 3">Top 3</th><th title="Veces entre los 8 clasificados">Clasifica</th><th title="Posición media predicha en la Liga">Pos. media</th></tr></thead>
               <tbody>${favRows}</tbody></table></div>`
          : '<p class="porra-empty">Todavía no hay porras. ¡Sé el primero en hacer la tuya!</p>'
      }
    </div>

    <div class="card">
      <h2>Todas las porras</h2>
      ${list.length ? list.map(detail).join('') : '<p class="porra-empty">Aquí aparecerán las porras en cuanto se vayan rellenando.</p>'}
      ${pending.length && !porraClosed ? `<p class="porra-note porra-pending-list">🕒 Aún sin porra: ${pending.map(escapeHtml).join(', ')}.</p>` : ''}
    </div>`;
}

document.getElementById('porras-root').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action="open-porra"]');
  if (!btn) return;
  const v = btn.dataset.id ? decodeURIComponent(btn.dataset.id) : '';
  openPorra(v || undefined);
});
document.getElementById('porras-root').addEventListener('toggle', (e) => {
  const d = e.target.closest?.('.porra-details');
  if (!d) return;
  if (d.open) porrasTabOpen.add(d.dataset.k); else porrasTabOpen.delete(d.dataset.k);
}, true);

const personRow = (name) => `${avatarHtml(name, 'row-avatar')}<span>${escapeHtml(name)}</span>`;

// Desplegable de la porra de cada participante (en la ventana Participantes)
function porraBlock(id) {
  const player = players.find((p) => idOf(p) === id);
  const porra = porras[id];
  const state = porra ? '<span class="porra-ok">✓ Hecha</span>' : '<span class="porra-pending">Pendiente</span>';

  let body;
  if (porra) {
    body = `
      <div class="porra-cols">
        <div>
          <h4>Clasificados de la Liga</h4>
          <ol class="porra-list">${porra.league.map((n) => `<li>${personRow(n)}</li>`).join('')}</ol>
        </div>
        <div>
          <h4>Top 3 del bracket</h4>
          <ul class="porra-podium">${porra.top3.map((n, i) => `<li><span class="medal">${MEDALS[i]}</span>${personRow(n)}</li>`).join('')}</ul>
        </div>
      </div>
      ${porraClosed ? '' : `<button type="button" class="link-btn" data-action="open-porra" data-id="${encodeURIComponent(id)}">Cambiar porra</button>`}`;
  } else {
    body = `
      <div class="porra-empty">
        <div class="porra-empty-icon" aria-hidden="true">🕒</div>
        <p>${escapeHtml(player.name)} todavía no ha hecho su porra.</p>
        ${porraClosed ? '<p class="porra-note">La porra ya está cerrada.</p>' : `<button type="button" class="add-btn small" data-action="open-porra" data-id="${encodeURIComponent(id)}">Hacer la porra de ${escapeHtml(player.name)}</button>`}
      </div>`;
  }

  return `
    <details class="porra-details${porra ? '' : ' is-empty'}" data-id="${encodeURIComponent(id)}"${porraOpenIds.has(id) ? ' open' : ''}>
      <summary><span>🎯 Porra de ${escapeHtml(player.name)}</span>${state}</summary>
      <div class="porra-body">${body}</div>
    </details>`;
}

// Recordamos qué desplegables están abiertos entre refrescos.
stage.addEventListener('toggle', (e) => {
  const d = e.target.closest?.('.porra-details');
  if (!d) return;
  const id = decodeURIComponent(d.dataset.id);
  if (d.open) porraOpenIds.add(id); else porraOpenIds.delete(id);
}, true);

// Rellena el borrador de un espectador con lo que recuerda este navegador (nombre, PIN y su porra si ya existe).
function loadSpecDraft(d) {
  const saved = getSpecId();
  d.name = saved.name || '';
  d.pin = saved.pin || '';
  const mine = d.name && spectators.find((x) => x.name.toLowerCase() === d.name.toLowerCase());
  d.league = mine ? [...mine.league] : [];
  d.top3 = mine ? [...mine.top3] : [];
  d.step = 1;
}

async function openPorra(id) {
  if (porraClosed) return alert('La porra está cerrada: el torneo ya ha empezado.');
  if (!leaguePlayers.length) await loadLeague();
  if (!leaguePlayers.length) return alert('No se ha podido cargar la lista de la Liga. Inténtalo de nuevo.');
  const spec = id === SPEC;
  const who = spec ? SPEC : id && players.some((p) => idOf(p) === id) ? id : currentId;
  const prev = porras[who];
  porraDraft = { id: who, mode: spec ? 'spec' : 'player', step: 1, league: prev ? [...prev.league] : [], top3: prev ? [...prev.top3] : [], name: '', pin: '', error: '', saving: false };
  if (spec) loadSpecDraft(porraDraft);
  renderPorra();
}

function closePorra() {
  porraDraft = null;
  renderPorra();
}

function porraCanSave(d) {
  if (d.top3.length !== 3 || d.saving) return false;
  return d.mode !== 'spec' || (d.name.trim().length >= 2 && /^\d{4}$/.test(d.pin));
}

function renderPorra() {
  if (!porraDraft) {
    porraModal.hidden = true;
    return;
  }
  const d = porraDraft;
  const ctl = (act, i, label, title, disabled) =>
    `<button type="button" class="pick-btn" data-p="${act}" data-i="${i}" title="${title}" aria-label="${title}"${disabled ? ' disabled' : ''}>${label}</button>`;

  const isSpec = d.mode === 'spec';
  const who = `
    <label class="porra-who">¿Quién eres?
      <select data-p="who">${players.map((p) => `<option value="${encodeURIComponent(idOf(p))}"${!isSpec && idOf(p) === d.id ? ' selected' : ''}>${escapeHtml(p.name)}</option>`).join('')}
        <option value="${SPEC}"${isSpec ? ' selected' : ''}>👀 Soy espectador (no participo)</option>
      </select>
    </label>
    ${isSpec ? `
    <div class="spec-fields">
      <label>Tu nombre<input type="text" data-p="spec-name" maxlength="20" placeholder="Nombre o apodo" value="${escapeHtml(d.name).replace(/"/g, '&quot;')}" autocomplete="off"></label>
      <label>Elige un PIN de 4 dígitos<input type="text" inputmode="numeric" data-p="spec-pin" maxlength="4" pattern="[0-9]{4}" placeholder="0000" value="${escapeHtml(d.pin)}" autocomplete="off"></label>
      <p class="porra-note">Apunta tu PIN: lo necesitarás para cambiar tu porra más adelante.</p>
    </div>` : ''}`;

  let content;
  if (d.step === 1) {
    const rows = Array.from({ length: POOL_SIZE }, (_, i) => {
      const n = d.league[i];
      return n
        ? `<li class="pick-row"><span class="pick-pos">${i + 1}</span><span class="pick-name">${personRow(n)}</span>
            <span class="pick-ctl">${ctl('up', i, '↑', 'Subir', i === 0)}${ctl('down', i, '↓', 'Bajar', i === d.league.length - 1)}${ctl('rm', i, '✕', 'Quitar', false)}</span></li>`
        : `<li class="pick-row pick-empty"><span class="pick-pos">${i + 1}</span><span class="pick-name">—</span></li>`;
    }).join('');
    const pool = leaguePlayers
      .map((n) => `<button type="button" class="pk-chip" data-p="add" data-n="${encodeURIComponent(n)}"${d.league.includes(n) || d.league.length >= POOL_SIZE ? ' disabled' : ''}>${personRow(n)}</button>`)
      .join('');
    content = `
      <p class="porra-help"><strong>Paso 1 de 2.</strong> Ordena a los <strong>${POOL_SIZE}</strong> que crees que se clasifican en la Liga, del 1.º al ${POOL_SIZE}.º. Pulsa en un nombre para añadirlo.</p>
      <div class="porra-grid">
        <div><h4>Participantes</h4><div class="pk-chips">${pool}</div></div>
        <div><h4>Tu clasificación <span class="porra-counter">${d.league.length}/${POOL_SIZE}</span></h4><ol class="pick-list">${rows}</ol></div>
      </div>`;
  } else {
    const slots = [0, 1, 2].map((i) => {
      const n = d.top3[i];
      return n
        ? `<li class="pick-row"><span class="pick-pos">${MEDALS[i]}</span><span class="pick-name">${personRow(n)}</span><span class="pick-ctl">${ctl('top-rm', i, '✕', 'Quitar', false)}</span></li>`
        : `<li class="pick-row pick-empty"><span class="pick-pos">${MEDALS[i]}</span><span class="pick-name">—</span></li>`;
    }).join('');
    const cands = d.league
      .map((n, i) => `<button type="button" class="pk-chip" data-p="top-add" data-n="${encodeURIComponent(n)}"${d.top3.includes(n) || d.top3.length >= 3 ? ' disabled' : ''}><span class="pk-chip-seed">${i + 1}º</span>${personRow(n)}</button>`)
      .join('');
    content = `
      <p class="porra-help"><strong>Paso 2 de 2.</strong> De esos ${POOL_SIZE}, ¿quiénes serán tu <strong>top 3 del bracket</strong>? Elige primero al campeón, luego al segundo y al tercero.</p>
      <div class="porra-grid">
        <div><h4>Tus ${POOL_SIZE} clasificados</h4><div class="pk-chips">${cands}</div></div>
        <div><h4>Tu top 3 <span class="porra-counter">${d.top3.length}/3</span></h4><ol class="pick-list">${slots}</ol></div>
      </div>`;
  }

  const actions =
    d.step === 1
      ? `<button type="button" class="add-btn small" data-p="next"${d.league.length === POOL_SIZE ? '' : ' disabled'}>Siguiente →</button>
         <button type="button" class="link-btn" data-p="clear">Vaciar</button>`
      : `<button type="button" class="link-btn" data-p="back">← Atrás</button>
         <button type="button" class="add-btn small" data-p="save"${porraCanSave(d) ? '' : ' disabled'}>${d.saving ? 'Guardando…' : 'Guardar porra'}</button>`;

  porraBody.innerHTML = `
    <h2 id="porra-title">🎯 Haz tu porra</h2>
    ${who}
    ${content}
    <p class="form-error" role="alert">${escapeHtml(d.error)}</p>
    <div class="porra-actions">${actions}</div>`;
  porraModal.hidden = false;
}

async function savePorra() {
  const d = porraDraft;
  if (!d || d.saving) return;
  d.saving = true;
  d.error = '';
  renderPorra();
  try {
    if (d.mode === 'spec') {
      const res = await fetch('/api/pokemon-porra', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ spectator: true, name: d.name, pin: d.pin, league: d.league, top3: d.top3 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Error desconocido');
      const i = spectators.findIndex((x) => x.name.toLowerCase() === data.porra.name.toLowerCase());
      if (i >= 0) spectators[i] = data.porra; else spectators.push(data.porra);
      setSpecId({ name: data.porra.name, pin: d.pin });
      porrasTabOpen.add(`spec:${data.porra.name.toLowerCase()}`);
      porraDraft = null;
      renderPorra();
      updatePorraBar();
      render();
      renderPorrasTab();
      showTab('porras');
      history.replaceState(null, '', '#porras');
      return;
    }

    const player = players.find((p) => idOf(p) === d.id);
    const data = await putWithPin(d.id, '/api/pokemon-porra', { player: player.name, league: d.league, top3: d.top3 });
    porras[d.id] = data.porra;
    porraOpenIds.add(d.id);
    currentId = d.id; // mostramos al participante cuya porra se acaba de guardar
    porraDraft = null;
    renderPorra();
    render();
    renderPorrasTab();
  } catch (err) {
    d.saving = false;
    d.error = err.cancelled ? '' : err.message;
    renderPorra();
  }
}

porraModal.addEventListener('click', (e) => {
  if (e.target === porraModal) return closePorra();
  const btn = e.target.closest('[data-p]');
  const d = porraDraft;
  if (!btn || !d || btn.tagName === 'SELECT' || btn.tagName === 'INPUT') return;
  const act = btn.dataset.p;
  const i = Number(btn.dataset.i);
  const name = btn.dataset.n ? decodeURIComponent(btn.dataset.n) : null;
  d.error = '';

  if (act === 'add' && d.league.length < POOL_SIZE && !d.league.includes(name)) d.league.push(name);
  else if (act === 'rm') {
    const [gone] = d.league.splice(i, 1);
    d.top3 = d.top3.filter((n) => n !== gone);
  } else if (act === 'up' && i > 0) [d.league[i - 1], d.league[i]] = [d.league[i], d.league[i - 1]];
  else if (act === 'down' && i < d.league.length - 1) [d.league[i + 1], d.league[i]] = [d.league[i], d.league[i + 1]];
  else if (act === 'clear') { d.league = []; d.top3 = []; }
  else if (act === 'next' && d.league.length === POOL_SIZE) d.step = 2;
  else if (act === 'back') d.step = 1;
  else if (act === 'top-add' && d.top3.length < 3 && !d.top3.includes(name)) d.top3.push(name);
  else if (act === 'top-rm') d.top3.splice(i, 1);
  else if (act === 'save') return savePorra();
  renderPorra();
});

porraModal.addEventListener('change', (e) => {
  if (e.target.dataset?.p !== 'who' || !porraDraft) return;
  const v = decodeURIComponent(e.target.value);
  const d = porraDraft;
  d.error = '';
  d.step = 1;
  if (v === SPEC) {
    d.mode = 'spec';
    d.id = SPEC;
    loadSpecDraft(d);
  } else {
    d.mode = 'player';
    d.id = v;
    // Si ya tenía porra, la cargamos para poder cambiarla; si no, empezamos de cero.
    const prev = porras[v];
    d.league = prev ? [...prev.league] : [];
    d.top3 = prev ? [...prev.top3] : [];
  }
  renderPorra();
});

// Nombre y PIN del espectador: se actualizan sin repintar para no perder el foco.
porraModal.addEventListener('input', (e) => {
  const d = porraDraft;
  const kind = e.target.dataset?.p;
  if (!d || (kind !== 'spec-name' && kind !== 'spec-pin')) return;
  if (kind === 'spec-name') d.name = e.target.value;
  else {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4);
    d.pin = e.target.value;
  }
  d.error = '';
  const save = porraBody.querySelector('[data-p="save"]');
  if (save) save.disabled = !porraCanSave(d);
});

document.getElementById('close-porra').addEventListener('click', closePorra);
document.getElementById('open-porra').addEventListener('click', () => openPorra(currentId));

// ---------------------------------------------------------------
// Datos
// ---------------------------------------------------------------

let lastSig = '';
async function loadAll() {
  // No refrescamos mientras alguien está rellenando un formulario.
  if (editing || viewing || animating) return;

  try {
    const [pRes, tRes, bRes, prRes, rvRes] = await Promise.all([
      fetch('/api/pokemon-players'),
      fetch('/api/pokemon-team'),
      fetch('/api/pokemon-badges'),
      fetch('/api/pokemon-porra').catch(() => null), // si falla, el resto de la página sigue funcionando
      fetch('/api/pokemon-rival').catch(() => null),
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
    if (prRes && prRes.ok) {
      const prData = await prRes.json();
      porras = prData.porras;
      spectators = prData.spectators || [];
      porraClosed = prData.closed;
    }
    if (rvRes && rvRes.ok) rivals = (await rvRes.json()).rivals || {};
    renderLeague(); // los equipos alimentan las fotos de la liga
    renderPorrasTab();
    if (editing || viewing) return; // por si empezó a editar mientras cargaba
    // Solo se repinta si los datos han cambiado (así no se reinician las animaciones en cada sondeo).
    const sig = JSON.stringify([players, teams, badges, rivals, porras, spectators, porraClosed]);
    if (sig === lastSig && stage.querySelector('.battle')) return;
    lastSig = sig;
    render();
  } catch (err) {
    stage.innerHTML = `<p class="roster-empty roster-error">No se pudo cargar la lista: ${escapeHtml(err.message)}</p>`;
    console.error(err);
  }
}

// PIN por participante (se recuerda en este navegador tras acertarlo).
const PIN_KEY = 'pokemon-pins-v1';
function getPin(id) {
  try { return JSON.parse(localStorage.getItem(PIN_KEY) || '{}')[id] || ''; } catch { return ''; }
}
function setPin(id, pin) {
  try {
    const o = JSON.parse(localStorage.getItem(PIN_KEY) || '{}');
    if (pin) o[id] = pin; else delete o[id];
    localStorage.setItem(PIN_KEY, JSON.stringify(o));
  } catch { /* sin almacenamiento: se pedirá cada vez */ }
}

// PUT que pide el PIN del participante si el servidor lo exige.
async function putWithPin(id, url, payload) {
  const player = players.find((p) => idOf(p) === id);
  let pin = getPin(id);
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(pin ? { 'X-Pin': pin } : {}) },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.status === 401 && data.needPin) {
      setPin(id, '');
      const asked = prompt(
        attempt ? `PIN incorrecto. Prueba otra vez (PIN de ${player.name}):` : `Introduce el PIN de ${player.name} (4 dígitos) para modificar sus datos:`
      );
      if (asked == null) throw Object.assign(new Error('Cancelado: hace falta el PIN.'), { cancelled: true });
      pin = asked.trim();
      continue;
    }
    if (!res.ok) throw new Error(data.error || 'Error desconocido');
    if (pin) setPin(id, pin);
    return data;
  }
  throw new Error('Demasiados intentos con PIN incorrecto.');
}

async function saveRival(id, rival) {
  const player = players.find((p) => idOf(p) === id);
  const data = await putWithPin(id, '/api/pokemon-rival', { player: player.name, rival });
  if (data.rival) rivals[id] = data.rival; else delete rivals[id];
}

async function saveTeam(id, team) {
  const player = players.find((p) => idOf(p) === id);
  const data = await putWithPin(id, '/api/pokemon-team', { player: player.name, team });
  teams[id] = data.team;
}

// Las peticiones de medallas se envían de una en una y en orden, para que
// varios clics rápidos no lleguen desordenados al servidor.
let badgeQueue = Promise.resolve();

function saveBadges(id, mask) {
  const player = players.find((p) => idOf(p) === id);
  badgeQueue = badgeQueue
    .then(async () => {
      await putWithPin(id, '/api/pokemon-badges', { player: player.name, mask });
    })
    .catch(async (err) => {
      if (!err.cancelled) alert(err.message);
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
  } else if (action === 'go-player') {
    goTo(index);
  } else if (action === 'set-lead') {
    leads[id] = index;
    playFx();
    render();
  } else if (action === 'edit-rival') {
    editing = { id, rival: true, index: -2 };
    teamError = '';
    renderPopup();
  } else if (action === 'clear-rival') {
    saveRival(editing.id, null).then(() => { closePopup(); render(); }).catch((err) => { if (!err.cancelled) alert(err.message); });
  } else if (action === 'open-mon') {
    viewing = { id, index };
    renderPopup();
  } else if (action === 'open-porra') {
    openPorra(id);
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
      if (!err.cancelled) alert(err.message);
    }
    closePopup();
    render();
  }
}

stage.addEventListener('click', onAction);
document.getElementById('trainers').addEventListener('click', onAction);
monModal.addEventListener('click', (e) => {
  if (e.target === monModal) closePopup();
  else onAction(e);
});
document.getElementById('close-mon').addEventListener('click', closePopup);

// Aviso en vivo en el formulario (se puede guardar igualmente).
function updateFormBan(form) {
  const fd = new FormData(form);
  const reasons = banReasons({
    species: fd.get('species'),
    ability: fd.get('ability'),
    moves: [0, 1, 2, 3].map((i) => fd.get(`move${i}`)),
  });
  const box = form.querySelector('[data-ban]');
  if (box) box.innerHTML = reasons.length ? banAlert(reasons) : '';
}
monModal.addEventListener('input', (e) => {
  const f = e.target.closest('.mon-form');
  if (f) updateFormBan(f);
});
monModal.addEventListener('change', (e) => {
  const f = e.target.closest('.mon-form');
  if (f) updateFormBan(f);
});

monModal.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  if (f.classList.contains('rival-form')) return submitRival(f);
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
    nature: fd.get('nature') || '',
    shiny: fd.get('shiny') === 'on',
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

async function submitRival(f) {
  const id = decodeURIComponent(f.dataset.id);
  const fd = new FormData(f);
  const known = dexLookup(String(fd.get('species')));
  const rival = { species: known ? known.name : String(fd.get('species')).trim(), shiny: fd.get('shiny') === 'on' };
  if (known) rival.dexId = known.id;
  const submit = f.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await saveRival(id, rival);
    editing = null;
    teamError = '';
    renderPopup();
    playFx();
    render();
  } catch (err) {
    if (!err.cancelled) f.querySelector('.form-error').textContent = err.message;
    submit.disabled = false;
  }
}

// ---------------------------------------------------------------
// Navegación entre participantes (flechas, teclado, deslizar, selector)
// ---------------------------------------------------------------

document.getElementById('prev').addEventListener('click', () => step(-1));
document.getElementById('next').addEventListener('click', () => step(1));

jump.addEventListener('change', () => {
  const target = Number(jump.value);
  const current = players.indexOf(currentPlayer());
  if (target === current) return;
  goTo(target);
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
  if (document.getElementById('tab-participantes').hidden) return;
  if (!monModal.hidden || !notice.hidden || !porraModal.hidden) return;
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
    let nature = '';
    let shiny = false;
    const moves = [];
    for (const l of lines.slice(1)) {
      if (/^ability:/i.test(l)) ability = l.replace(/^ability:/i, '').trim();
      else if (/^shiny:\s*yes/i.test(l)) shiny = true;
      else if (/^[A-Za-z]+\s+nature$/i.test(l)) nature = natureByName(l.replace(/\s+nature$/i, ''))?.[0] || '';
      else if (/^-\s*\S/.test(l)) moves.push(l.replace(/^-\s*/, '').trim());
    }

    const known = dexLookup(species);
    const mon = {
      species: clean(known ? known.name : species),
      dexId: known ? known.id : undefined,
      nickname: nickname && nickname.toLowerCase() !== species.toLowerCase() ? clean(nickname) : '',
      ability: ability ? toEs('abilities', ability) : '',
      item: item ? toEs('items', item) : '',
      nature,
      shiny,
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
    return err.cancelled ? undefined : alert(err.message);
  }
  render();
});

// Sugerencias en español (generadas a partir de los datos oficiales de PokéAPI).
const esMap = {};
const moveTypes = {}; // nombre del movimiento (es o en, minúsculas) -> id de tipo
async function loadEsData() {
  try {
    const res = await fetch('/pokemon/data/es.json');
    if (!res.ok) return;
    const data = await res.json();
    for (const k of ['moves', 'abilities', 'items']) {
      esMap[k] = new Map(data[k].map(([es, en]) => [en.toLowerCase(), es]));
    }
    data.moves.forEach(([es, en, type]) => {
      if (type) { moveTypes[es.toLowerCase()] = type; moveTypes[en.toLowerCase()] = type; }
    });
    if (viewing) renderPopup(); // por si el detalle ya estaba abierto
    if (!editing && !viewing && players.length) render();
    renderLeague();
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

let firstTab = true;
function showTab(name) {
  if (!document.getElementById(`tab-${name}`)) name = 'participantes';
  if (!firstTab) playFx();
  firstTab = false;

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
      ? `<span class="thumb${banReasons(team[i]).length ? ' is-banned' : ''}" title="${escapeHtml(team[i].species)}${banReasons(team[i]).length ? ' — ⚠ NO PERMITIDO' : ''}">${monImage(team[i], 'liga-img')}</span>`
      : '<span class="thumb thumb-empty"></span>'
  ).join('');
}

function sideHtml(name, other, key, state) {
  const label = state === 'win' ? '🏆 Ganador · +3 pts' : state === 'lose' ? 'Derrota' : 'Elegir ganador';
  return `
    <button type="button" class="duel-side is-${state}" data-pick="${encodeURIComponent(name)}"
      data-a="${encodeURIComponent(name)}" data-b="${encodeURIComponent(other)}" data-key="${escapeHtml(key)}"
      aria-pressed="${state === 'win'}" title="${state === 'win' ? 'Clic para deshacer' : 'Clic para marcar como ganador'}">
      ${avatarHtml(name, 'duel-avatar')}
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

// ---------- Bracket eliminatorio (cruces 1-8, 4-5, 2-7, 3-6; todo al mejor de 3) ----------

let ligaView = 'liga';  // 'liga' | 'bracket'
let paneAnim = '';      // dirección de la animación al cambiar de vista

const BK_QUARTERS = [['q1', 1, 8], ['q2', 4, 5], ['q3', 2, 7], ['q4', 3, 6]];

function playedCount() {
  return schedule.reduce((n, r) => n + roundStatus(r).done, 0);
}

// Calcula los cruces: quién juega cada uno y quién ha ganado (si el ganador guardado sigue siendo válido).
function bracketModel(standings, played) {
  const seed = (n) => (played > 0 && standings[n - 1] ? standings[n - 1].name : null);
  const tie = (id, title, a, b, seedA, seedB) => {
    const w = leagueResults['bk:' + id];
    const winner = a && b && w ? (w === lcName(a) ? a : w === lcName(b) ? b : null) : null;
    return { id, title, a, b, seedA, seedB, winner };
  };
  const q = BK_QUARTERS.map(([id, x, y], i) => tie(id, `Cuartos ${i + 1}`, seed(x), seed(y), x, y));
  const s1 = tie('s1', 'Semifinal 1', q[0].winner, q[1].winner);
  const s2 = tie('s2', 'Semifinal 2', q[2].winner, q[3].winner);
  const f = tie('f', 'Final', s1.winner, s2.winner);
  return { ties: [...q, s1, s2, f], q, semis: [s1, s2], final: f };
}

function bracketHtml(standings, played, totalMatches) {
  const model = bracketModel(standings, played);

  const label = (t, side) => {
    const prev = { s1: ['Ganador cuartos 1', 'Ganador cuartos 2'], s2: ['Ganador cuartos 3', 'Ganador cuartos 4'], f: ['Ganador semifinal 1', 'Ganador semifinal 2'] }[t.id];
    return prev ? prev[side] : `Puesto ${side ? t.seedB : t.seedA} de la Liga`;
  };

  const slot = (t, side) => {
    const name = side ? t.b : t.a;
    const seed = t.seedA ? `${side ? t.seedB : t.seedA}º` : '?';
    if (!name) return `<div class="bk-slot bk-tbd"><span class="bk-seed">${seed}</span><span class="bk-name">${label(t, side)}</span></div>`;
    const ready = t.a && t.b;
    const state = !t.winner ? 'none' : t.winner === name ? 'win' : 'lose';
    const inner = `<span class="bk-seed">${seed}</span>${avatarHtml(name, 'row-avatar')}<span class="bk-name">${escapeHtml(name)}</span>${state === 'win' ? '<span class="bk-badge" title="Avanza de ronda">✔</span>' : ''}`;
    return ready
      ? `<button type="button" class="bk-slot bk-pick is-${state}" data-bk="${t.id}" data-name="${encodeURIComponent(name)}" aria-pressed="${state === 'win'}" title="${state === 'win' ? 'Clic para deshacer' : 'Clic para que avance'}">${inner}</button>`
      : `<div class="bk-slot">${inner}</div>`;
  };

  const card = (t) => `
    <article class="bk-match${t.winner ? ' is-played' : ''}">
      <div class="bk-title">${t.title}<span>Mejor de 3</span></div>
      ${slot(t, 0)}<div class="bk-vs">VS</div>${slot(t, 1)}
    </article>`;

  const champion = model.final.winner
    ? `<div class="bk-champion">🏆 Campeón del torneo: <strong>${avatarHtml(model.final.winner, 'row-avatar')}${escapeHtml(model.final.winner)}</strong></div>`
    : '';

  const note =
    played === 0
      ? 'Los cruces se rellenarán con la clasificación en cuanto haya resultados en la Liga.'
      : played < totalMatches
        ? `Cruces provisionales: se actualizan con cada resultado. Serán definitivos al jugarse los ${totalMatches} combates de la Liga.`
        : 'Liga terminada: estos son los cruces definitivos.';

  return `
    <div class="liga-summary">
      <span><strong>Bracket eliminatorio</strong> · los ${QUALIFY} primeros de la Liga</span>
      <span class="liga-rule">Todos los cruces al mejor de 3</span>
    </div>
    <p class="liga-hint">${note} Haz clic en un participante para que avance de ronda (otro clic lo deshace).</p>
    ${champion}
    <div class="bracket">
      <section class="bk-round"><h3>Cuartos de final</h3><div class="bk-cards">${model.q.map(card).join('')}</div></section>
      <section class="bk-round"><h3>Semifinales</h3><div class="bk-cards">${model.semis.map(card).join('')}</div></section>
      <section class="bk-round"><h3>Final</h3><div class="bk-cards">${card(model.final)}</div></section>
    </div>
    <div class="reset-row"><button type="button" class="link-btn link-danger" data-reset="bracket">Reiniciar bracket</button></div>`;
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
        <td class="c-name">${avatarHtml(row.name, 'row-avatar')}${escapeHtml(row.name)}</td>
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

  const ligaPane = `
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

    <div class="duels">${rd.matches.map(duelHtml).join('')}</div>
    <div class="reset-row"><button type="button" class="link-btn link-danger" data-reset="league">Reiniciar liga y bracket</button></div>`;

  const anim = paneAnim ? ` slide-${paneAnim}` : '';
  paneAnim = '';
  root.innerHTML = `
    <div class="liga-switch" role="tablist" aria-label="Vista de la Liga">
      <button type="button" role="tab" class="${ligaView === 'liga' ? 'is-active' : ''}" aria-selected="${ligaView === 'liga'}" data-view="liga">Clasificación y combates</button>
      <button type="button" role="tab" class="${ligaView === 'bracket' ? 'is-active' : ''}" aria-selected="${ligaView === 'bracket'}" data-view="bracket">Bracket ›</button>
    </div>
    <div class="liga-pane${anim}">${ligaView === 'liga' ? ligaPane : bracketHtml(standings, played, totalMatches)}</div>`;
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

async function sendBracket(id, winner) {
  const res = await fetch('/api/pokemon-league', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Key': getAdminKey() },
    body: JSON.stringify({ bracket: id, winner }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Error desconocido');
    err.needKey = res.status === 401;
    throw err;
  }
}

function setBracketWinner(id, name) {
  if (leagueProtected && !getAdminKey()) {
    const k = window.prompt('Solo el administrador puede marcar resultados. Introduce la clave:');
    if (!k) return;
    setAdminKey(k.trim());
  }
  const changes = [[id, name]];
  if (name == null) delete leagueResults['bk:' + id];
  else leagueResults['bk:' + id] = lcName(name);

  // Si cambia un ganador, las rondas siguientes que dependían de él se limpian.
  const model = bracketModel(computeStandings(), playedCount());
  model.ties.forEach((t) => {
    if (leagueResults['bk:' + t.id] && !t.winner) {
      delete leagueResults['bk:' + t.id];
      changes.push([t.id, null]);
    }
  });

  renderLeague();
  leagueQueue = leagueQueue
    .then(async () => { for (const [cid, w] of changes) await sendBracket(cid, w); })
    .catch(async (err) => {
      if (err.needKey) setAdminKey('');
      alert(err.message);
      await loadLeague();
    });
}

async function resetLeague(scope) {
  if (!leagueProtected) {
    alert('Para poder reiniciar hay que proteger la Liga con una clave de administrador.\n\nEn Vercel: Settings → Environment Variables → crea LEAGUE_ADMIN_KEY con la clave que quieras y vuelve a desplegar.');
    return;
  }
  const what = scope === 'league' ? 'TODOS los resultados de la Liga y del bracket' : 'todos los resultados del bracket';
  if (!confirm(`¿Seguro que quieres borrar ${what}? Esta acción no se puede deshacer.`)) return;
  if (!getAdminKey()) {
    const k = window.prompt('Introduce la clave de administrador:');
    if (!k) return;
    setAdminKey(k.trim());
  }
  try {
    const res = await fetch('/api/pokemon-league', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': getAdminKey() },
      body: JSON.stringify({ reset: scope }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) setAdminKey('');
      throw new Error(data.error || 'Error desconocido');
    }
    if (scope === 'league') leagueResults = {};
    else Object.keys(leagueResults).filter((k) => k.startsWith('bk:')).forEach((k) => delete leagueResults[k]);
    roundChosen = false;
    renderLeague();
  } catch (err) {
    alert(err.message);
  }
}

function setLigaView(view) {
  if (view === ligaView) return;
  paneAnim = view === 'bracket' ? 'left' : 'right';
  ligaView = view;
  renderLeague();
}

// Deslizar el dedo a izquierda/derecha cambia entre Liga y Bracket.
let ligaTouch = null;
const ligaRoot = document.getElementById('liga-root');
ligaRoot.addEventListener('touchstart', (e) => {
  ligaTouch = e.target.closest('.table-scroll, .pills') ? null : { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
ligaRoot.addEventListener('touchend', (e) => {
  if (!ligaTouch) return;
  const dx = e.changedTouches[0].clientX - ligaTouch.x;
  const dy = e.changedTouches[0].clientY - ligaTouch.y;
  ligaTouch = null;
  if (Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
  setLigaView(dx < 0 ? 'bracket' : 'liga');
});

document.getElementById('liga-root').addEventListener('click', (e) => {
  const reset = e.target.closest('[data-reset]');
  if (reset) {
    resetLeague(reset.dataset.reset);
    return;
  }

  const bk = e.target.closest('[data-bk]');
  if (bk) {
    const name = decodeURIComponent(bk.dataset.name);
    const current = leagueResults['bk:' + bk.dataset.bk];
    setBracketWinner(bk.dataset.bk, current === lcName(name) ? null : name);
    return;
  }

  const viewBtn = e.target.closest('[data-view]');
  if (viewBtn) {
    setLigaView(viewBtn.dataset.view);
    return;
  }

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


// ============================================================
// CALCULADORA DE TIPOS
// ============================================================

// Tabla de tipos (generación 6 en adelante). Para cada tipo atacante:
// [súper eficaz contra, poco eficaz contra, sin efecto contra]. Nombres en inglés = claves de TYPE_IDS.
const TYPE_IDS = { normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6, bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12, electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18 };
const TYPE_CHART = {
  normal:   [[], ['rock', 'steel'], ['ghost']],
  fire:     [['grass', 'ice', 'bug', 'steel'], ['fire', 'water', 'rock', 'dragon'], []],
  water:    [['fire', 'ground', 'rock'], ['water', 'grass', 'dragon'], []],
  electric: [['water', 'flying'], ['electric', 'grass', 'dragon'], ['ground']],
  grass:    [['water', 'ground', 'rock'], ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'], []],
  ice:      [['grass', 'ground', 'flying', 'dragon'], ['fire', 'water', 'ice', 'steel'], []],
  fighting: [['normal', 'ice', 'rock', 'dark', 'steel'], ['poison', 'flying', 'psychic', 'bug', 'fairy'], ['ghost']],
  poison:   [['grass', 'fairy'], ['poison', 'ground', 'rock', 'ghost'], ['steel']],
  ground:   [['fire', 'electric', 'poison', 'rock', 'steel'], ['grass', 'bug'], ['flying']],
  flying:   [['grass', 'fighting', 'bug'], ['electric', 'rock', 'steel'], []],
  psychic:  [['fighting', 'poison'], ['psychic', 'steel'], ['dark']],
  bug:      [['grass', 'psychic', 'dark'], ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'], []],
  rock:     [['fire', 'ice', 'flying', 'bug'], ['fighting', 'ground', 'steel'], []],
  ghost:    [['psychic', 'ghost'], ['dark'], ['normal']],
  dragon:   [['dragon'], ['steel'], ['fairy']],
  dark:     [['psychic', 'ghost'], ['fighting', 'dark', 'fairy'], []],
  steel:    [['ice', 'rock', 'fairy'], ['fire', 'water', 'electric', 'steel'], []],
  fairy:    [['fighting', 'dragon', 'dark'], ['fire', 'poison', 'steel'], []],
};

// Multiplicador con el que un tipo atacante golpea a un Pokémon con los tipos defensores indicados.
function typeMultiplier(attacker, defenders) {
  const [se, nve, imm] = TYPE_CHART[attacker];
  return defenders.reduce((m, d) => m * (imm.includes(d) ? 0 : se.includes(d) ? 2 : nve.includes(d) ? 0.5 : 1), 1);
}

let tiposSel = [];   // hasta 2 tipos defensores seleccionados (claves en inglés)
const tiposRoot = document.getElementById('tipos-root');
const tipoName = (k) => TYPES[TYPE_IDS[k]][0];
const tipoColor = (k) => TYPES[TYPE_IDS[k]][1];
const tipoChip = (k, extra = '') => `<span class="tp-chip${isLightColor(tipoColor(k)) ? ' light' : ''}${extra}" style="--tc:${tipoColor(k)}">${tipoName(k)}</span>`;

const TIPO_GROUPS = [
  { mult: 4, label: 'x4', text: 'Muy efectivo', cls: 'x4' },
  { mult: 2, label: 'x2', text: 'Efectivo', cls: 'x2' },
  { mult: 0.5, label: 'x0.5', text: 'Resistente', cls: 'x05' },
  { mult: 0.25, label: 'x0.25', text: 'Muy resistente', cls: 'x025' },
  { mult: 0, label: '', text: 'Inmune', cls: 'x0' },
];

function renderTipos() {
  const keys = Object.keys(TYPE_IDS);
  const buttons = keys.map((k) => {
    const on = tiposSel.includes(k);
    return `<button type="button" class="tp-btn${isLightColor(tipoColor(k)) ? ' light' : ''}${on ? ' is-on' : ''}" style="--tc:${tipoColor(k)}" data-tipo="${k}" aria-pressed="${on}">${tipoName(k)}</button>`;
  }).join('');

  const slots = [0, 1].map((i) => tiposSel[i]
    ? `<button type="button" class="tp-slot is-filled" data-tipo="${tiposSel[i]}" title="Quitar ${tipoName(tiposSel[i])}">${tipoChip(tiposSel[i])}<span class="tp-x" aria-hidden="true">×</span></button>`
    : `<span class="tp-slot">${i === 0 ? 'Tipo 1' : 'Tipo 2 (opcional)'}</span>`).join('<span class="tp-plus" aria-hidden="true">+</span>');

  let results = '<p class="tp-empty">Elige el tipo (o los dos tipos) del Pokémon que defiende y verás de qué tipos recibe más o menos daño.</p>';
  if (tiposSel.length) {
    const groups = TIPO_GROUPS.map((g) => {
      const list = keys.filter((a) => typeMultiplier(a, tiposSel) === g.mult);
      if (!list.length) return '';
      return `<div class="tp-group tp-${g.cls}"><div class="tp-mult">${g.label ? `<span class="tp-n">${g.label}</span>` : ''}<span class="tp-t">${g.text}</span></div><div class="tp-list">${list.map((a) => tipoChip(a)).join('')}</div></div>`;
    }).join('');
    results = `<div class="tp-results" aria-live="polite">${groups}</div>`;
  }

  tiposRoot.innerHTML = `
    <div class="card tp-card">
      <h2>Calculadora de Tipos</h2>
      <p class="card-text">Selecciona los tipos del Pokémon que <strong>recibe</strong> el ataque (1 o 2) y mira qué tipos le pegan x4, x2, x0.5, x0.25 o ni le hacen daño.</p>
      <div class="tp-pick" role="group" aria-label="Tipos seleccionados">${slots}${tiposSel.length ? '<button type="button" class="link-btn tp-clear" data-tipo-clear>Limpiar</button>' : ''}</div>
      <div class="tp-grid" role="group" aria-label="Elegir tipo">${buttons}</div>
    </div>
    <div class="card tp-card"><h2>Recibe daño de</h2>${results}</div>`;
}

tiposRoot.addEventListener('click', (e) => {
  if (e.target.closest('[data-tipo-clear]')) { tiposSel = []; renderTipos(); return; }
  const btn = e.target.closest('[data-tipo]');
  if (!btn) return;
  const k = btn.dataset.tipo;
  if (tiposSel.includes(k)) tiposSel = tiposSel.filter((t) => t !== k);
  else tiposSel = [...tiposSel, k].slice(-2); // con un tercero, sale el más antiguo
  renderTipos();
});
renderTipos();
