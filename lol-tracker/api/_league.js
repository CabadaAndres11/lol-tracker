// Participantes de la liga, en el orden en que se reparten los emparejamientos.
// Lo comparten la API de la liga y la de la porra.
const PLAYERS = [
  'Lihone', 'Petea', 'Mertens', 'El compa', 'Pampert', 'Kekkan',
  'Helbramn', 'Steven', 'AitoRLG', 'Dashlight', 'Beldiño', 'Leviathan',
];

// Participantes dados de baja: sus rivales ganan automáticamente cada combate de la liga (en minúsculas).
const WITHDRAWN = ['beldiño'];

module.exports = { PLAYERS, WITHDRAWN };
