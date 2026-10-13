const roster = document.getElementById('roster');
const countEl = document.getElementById('count');
const modal = document.getElementById('modal');
const form = document.getElementById('add-form');
const input = document.getElementById('player-name');
const errorEl = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function render(players) {
  countEl.textContent = players.length;

  if (!players.length) {
    roster.innerHTML = '<li class="roster-empty">Todavía no hay nadie apuntado. ¡Sé el primero!</li>';
    return;
  }

  roster.innerHTML = players
    .map(
      (p, i) => `
        <li class="roster-item">
          <span class="roster-pos">${i + 1}</span>
          <span class="roster-name">${escapeHtml(p.name)}</span>
        </li>`
    )
    .join('');
}

async function loadPlayers() {
  try {
    const res = await fetch('/api/pokemon-players');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error desconocido');
    render(data.players);
  } catch (err) {
    roster.innerHTML = `<li class="roster-empty roster-error">No se pudo cargar la lista: ${escapeHtml(err.message)}</li>`;
    console.error(err);
  }
}

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
    render(data.players);
    closeModal();
  } catch (err) {
    errorEl.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

loadPlayers();
// Refresca la lista para ver a quienes se apunten desde otros dispositivos.
setInterval(loadPlayers, 30 * 1000);


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
