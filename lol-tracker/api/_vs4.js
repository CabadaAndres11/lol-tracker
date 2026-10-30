// Versus de 4: reglas de la mesa de 4 jugadores. Reutiliza el motor 1 vs 1: cada duelo de la ronda se
// ejecuta como una partida de 2 con los jugadores emparejados (los datos de cada jugador son los mismos objetos).
const E = require('../public/cartas/engine.js');

const CFG4 = { life: 30, gold: 14, income: 3 };
const MATCH = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]];
const PLACE_BONUS = [0, 45, 20, 5, 0]; // por puesto 1º..4º (se suma a la recompensa base por jugar)

function aliveSeats(T) { return [0, 1, 2, 3].filter((p) => !T.out[p]); }

function newTable(decks, names, seed, lv, sk) {
  const T = {
    vs4: true, pvp: true, names, rs: seed | 0, uidn: [1, 1, 1, 1], uidm: 4, uidk: [0, 1, 2, 3], inc: CFG4.income,
    fightN: 0, round: 0, shops: 0, combat: 0, phase: 'prep', shopOpen: false, first: 0, over: false, winner: -1, reason: '',
    log: [], frames: [], acts: [], actN: 0, err: '', lastBall: [null, null, null, null], refreshN: [0, 0, 0, 0],
    out: [false, false, false, false], place: [0, 0, 0, 0], logs: [[], [], [], []], pairs: [], rest: -1, opp: [-1, -1, -1, -1],
    lv: lv || [{}, {}, {}, {}], sk: sk || [{}, {}, {}, {}], fx: [null, null, null, null], firstOf: [0, 0, 0, 0], rdy: [false, false, false, false], stuck: {},
    p: decks.map((d) => { const P = E.newPlayer(d); P.life = CFG4.life; P.gold = CFG4.gold; return P; }),
  };
  E.bindRng(T);
  startRound(T);
  return T;
}

function note(T, seat, text) { T.logs[seat].push(text); if (T.logs[seat].length > 60) T.logs[seat].shift(); }
function noteAll(T, text, except) { for (let p = 0; p < 4; p++) if (p !== except) note(T, p, text); }

// ---------- Duelo de 2 sobre la mesa ----------
function duelState(T, a, b) {
  const Pa = T.p[a], Pb = b >= 0 ? T.p[b] : E.newPlayer([]);
  [Pa, Pb].forEach((P, k) => ['mesa', 'hand', 'grave'].forEach((z) => P[z].forEach((i) => { if (i) i.owner = k; })));
  const S = {
    pvp: true, uidm: 4, uidk: [a, b >= 0 ? b : a], inc: T.inc, rs: T.rs, uidn: [T.uidn[a], b >= 0 ? T.uidn[b] : 1],
    refreshN: [T.refreshN[a], b >= 0 ? T.refreshN[b] : 0], lastBall: [T.lastBall[a], b >= 0 ? T.lastBall[b] : null],
    lv: [T.lv[a] || {}, b >= 0 ? T.lv[b] || {} : {}], sk: [T.sk[a] || {}, b >= 0 ? T.sk[b] || {} : {}], lvl: 1, p: [Pa, Pb], round: T.round, shops: T.shops, phase: T.phase, shopOpen: T.shopOpen, first: T.firstOf[a] || 0, over: false, winner: -1,
    reason: '', log: [], frames: [], acts: [], actN: T.actN, err: '', fightN: T.fightN,
  };
  E.bindRng(S);
  return S;
}
function commit(T, S, a, b) {
  T.rs = S.rs; T.uidn[a] = S.uidn[0]; T.refreshN[a] = S.refreshN[0]; T.lastBall[a] = S.lastBall[0]; T.actN = S.actN;
  if (b >= 0) { T.uidn[b] = S.uidn[1]; T.refreshN[b] = S.refreshN[1]; T.lastBall[b] = S.lastBall[1]; }
}

// Vista de un jugador: partida de 2 (tú siempre eres p[0]) + marcador de la mesa.
function viewFor(T, seat) {
  const opp = T.out[seat] ? (T.opp[seat] >= 0 ? T.opp[seat] : -1) : T.opp[seat];
  const S = duelState(T, seat, opp);
  S.first = T.firstOf[seat] || 0;
  S.frames = (T.fx[seat] && T.fx[seat].frames) || [];
  S.log = T.logs[seat].slice(-30).map((text) => ({ r: T.round, text }));
  S.fightN = T.fightN;
  S.acts = T.acts.filter((a) => opp >= 0 && a.by === opp).map((a) => ({ n: a.n, p: 1, id: a.id, res: a.res, tgt: a.tgt }));
  S.vs4 = true; S.rest = T.rest === seat && !T.shopOpen && !T.out[seat];
  S.phase = T.out[seat] || T.over ? 'over' : T.phase;
  S.over = !!(T.out[seat] || T.over);
  S.place = T.place[seat];
  S.winner = S.over ? (T.place[seat] === 1 ? 0 : 1) : -1;
  S.reason = T.out[seat] ? (T.place[seat] === 1 ? 'Último en pie.' : 'Eliminado.') : '';
  S.board = T.p.map((P, k) => ({ name: T.names[k], life: Math.max(0, P.life), out: T.out[k], me: k === seat, opp: k === opp, rest: T.rest === k && !T.shopOpen, rdy: !T.out[k] && T.rdy[k], place: T.place[k] }));
  S.maxLife = CFG4.life;
  S.spec = (T.fx[seat] && T.fx[seat].spec) || null;
  const V = E.mirror(S, 0); // copia profunda y sin secretos del rival
  V.shopOpen = T.shopOpen;
  return V;
}

// ---------- Rondas ----------
function eliminate(T, seat, reason, abandoned) {
  if (T.out[seat]) return;
  const alive = aliveSeats(T).length;
  T.out[seat] = true; T.place[seat] = alive; T.p[seat].life = Math.min(T.p[seat].life, 0);
  note(T, seat, reason || 'Has sido eliminado.');
  noteAll(T, T.names[seat] + ' ha sido eliminado (' + alive + 'º).', seat);
  if (abandoned) T.ab = (T.ab || []).concat(seat);
  // su rival de esta ronda descansa
  const o = T.opp[seat];
  if (o >= 0 && !T.out[o]) { T.opp[o] = -1; T.rest = T.rest === -1 ? o : T.rest; }
  T.opp[seat] = -1;
  T.pairs = T.pairs.filter((pr) => pr.indexOf(seat) < 0);
  if (aliveSeats(T).length <= 1) finish(T);
}
function finish(T) {
  if (T.over) return;
  const al = aliveSeats(T);
  if (al.length === 1) { T.place[al[0]] = 1; }
  else if (al.length > 1) { // límite de rondas: gana la vida más alta
    al.sort((x, y) => T.p[y].life - T.p[x].life).forEach((p, k) => { T.place[p] = k + 1; });
  }
  al.forEach((p) => { T.out[p] = true; });
  T.over = true; T.phase = 'over'; T.shopOpen = false;
  T.winner = al.length ? al.slice().sort((x, y) => T.place[x] - T.place[y])[0] : -1;
  T.reason = 'Fin de la partida.';
}

function startRound(T) {
  T.round++; T.phase = 'prep'; T.stuck = {}; T.rest = -1; T.opp = [-1, -1, -1, -1]; T.pairs = [];
  T.fx = [null, null, null, null];
  T.shopOpen = T.round % 3 === 1;
  const alive = aliveSeats(T);
  alive.forEach((p) => {
    const got = E.income(T, p);
    T.p[p].target = {}; T.p[p].anime = 0; T.p[p].fl = {};
    note(T, p, 'Ronda ' + T.round + ': +' + got + ' de oro.');
  });
  if (T.shopOpen) {
    T.shops++;
    alive.forEach((p) => { E.openShop(T, p); note(T, p, 'Se abre la tienda.'); });
    processStuck(T);
  } else {
    alive.forEach((p) => { if (E.noTroops(T.p[p])) eliminate(T, p, 'Te quedaste sin tropas: eliminado.'); });
    if (!T.over) pairUp(T);
  }
  T.log.length = 0;
  T.rdy = [false, false, false, false];
}
function pairUp(T) {
  const al = aliveSeats(T);
  if (al.length === 4) T.pairs = MATCH[T.combat % 3].map((x) => x.slice());
  else if (al.length === 3) { T.rest = al[T.combat % 3]; T.pairs = [al.filter((x) => x !== T.rest)]; }
  else if (al.length === 2) T.pairs = [al.slice()];
  T.combat++;
  T.pairs.forEach((pr, k) => {
    const a = pr[0], b = pr[1], f = (T.combat + k) % 2;
    T.opp[a] = b; T.opp[b] = a; T.firstOf[a] = f; T.firstOf[b] = 1 - f;
    note(T, a, 'Te toca contra ' + T.names[b] + '.'); note(T, b, 'Te toca contra ' + T.names[a] + '.');
  });
  if (T.rest >= 0) note(T, T.rest, 'Descansas esta ronda.');
}
function processStuck(T) {
  Object.keys(T.stuck || {}).forEach((k) => { const p = +k; if (!T.out[p]) eliminate(T, p, 'Te quedaste sin oro y sin tropas en la tienda: eliminado.'); });
  T.stuck = {};
}
function autoTargets(T, seat) {
  const o = T.opp[seat]; if (o < 0) return;
  const S = duelState(T, seat, o);
  const foes = E.mesaTroops(S.p[1]);
  E.pendingTargets(S, 0).forEach((i) => { if (foes.length) E.setTarget(S, 0, i.uid, foes[Math.floor(S.rng() * foes.length)].uid); });
  commit(T, S, seat, o);
}
function resolveCombat(T) {
  const fought = {};
  let spec = null;
  T.fx = [null, null, null, null];
  T.pairs.slice().forEach((pr) => {
    const a = pr[0], b = pr[1];
    if (T.out[a] || T.out[b]) return;
    autoTargets(T, a); autoTargets(T, b);
    const D = duelState(T, a, b); D.first = T.firstOf[a]; D.phase = 'prep'; D.shopOpen = false;
    E.fight(D);
    if (D.over) E.cleanup(D);
    commit(T, D, a, b);
    const m0 = E.mirror(D, 0), m1 = E.mirror(D, 1);
    T.fx[a] = { frames: m0.frames }; T.fx[b] = { frames: m1.frames };
    m0.log.forEach((l) => note(T, a, l.text)); m1.log.forEach((l) => note(T, b, l.text));
    fought[a] = fought[b] = true;
    if (!spec) spec = { frames: m0.frames, spec: [T.names[a], T.names[b]] };
    if (D.over) { const loser = D.winner === 0 ? b : a; T.fx[loser].frames = (loser === a ? m0 : m1).frames; eliminate(T, loser, 'Tu vida llegó a cero: eliminado.'); }
  });
  if (spec && T.rest >= 0 && !T.out[T.rest]) T.fx[T.rest] = spec; // el que descansa mira el duelo
  T.fightN++;
  T.log.length = 0;
  if (T.over) return;
  T.phase = 'post';
  T.rdy = [0, 1, 2, 3].map((p) => T.out[p] || !fought[p]); // los que no han peleado no esperan
}
function advance(T, maxRounds) {
  if (T.round >= maxRounds) { finish(T); return; }
  startRound(T);
}
// Resuelve la fase actual cuando todos están listos (o por tiempo, forced). Devuelve true si algo cambió.
function resolve(T, forced, maxRounds) {
  if (T.over) return false;
  const waiting = aliveSeats(T).filter((p) => !T.rdy[p]);
  if (waiting.length && !forced) return false;
  if (T.phase === 'prep' && T.shopOpen) advance(T, maxRounds);
  else if (T.phase === 'prep') resolveCombat(T);
  else if (T.phase === 'post') advance(T, maxRounds);
  else return false;
  return true;
}

// Reparto de monedas: 15 por jugar + bonus por puesto. Lo calcula el servidor.
module.exports = { CFG4, PLACE_BONUS, newTable, viewFor, duelState, commit, eliminate, resolve, processStuck, aliveSeats, note, noteAll };
