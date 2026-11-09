// PIN de 4 dígitos por participante.
// No se guarda en ningún sitio: se calcula a partir del nombre del participante
// y de un secreto (variable de entorno PIN_SECRET en Vercel). Sin ese secreto,
// no se pide PIN (la web funciona como antes).
const crypto = require('crypto');
const { redis } = require('./_redis');

const MAX_FAILS = 10;      // intentos fallidos permitidos...
const BLOCK_SECONDS = 900; // ...en esta ventana de tiempo (15 min)

function pinFor(id) {
  const secret = process.env.PIN_SECRET;
  if (!secret) return null;
  const h = crypto.createHmac('sha256', secret).update(String(id)).digest();
  return String(h.readUInt32BE(0) % 10000).padStart(4, '0');
}

// Clave de administrador (LEAGUE_ADMIN_KEY): sin ella configurada nadie es administrador.
function adminOk(req) {
  const expected = process.env.LEAGUE_ADMIN_KEY;
  if (!expected) return false;
  const a = Buffer.from(String(req.headers['x-admin-key'] ?? ''));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Comprueba un PIN suelto (lectura de equipos ocultos). Cuenta los fallos igual que checkPin.
async function verifyPin(cfg, id, given) {
  const expected = pinFor(id);
  if (!expected) return true; // sin PIN_SECRET no hay forma de identificar a nadie
  given = String(given || '').trim();
  if (!/^\d{4}$/.test(given)) return false;
  const failKey = `pokemon:pinfail:${id}`;
  if (Number((await redis(cfg, ['GET', failKey])) || 0) >= MAX_FAILS) return false;
  if (crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return true;
  await redis(cfg, ['INCR', failKey]);
  await redis(cfg, ['EXPIRE', failKey, BLOCK_SECONDS]);
  return false;
}

// Devuelve null si todo va bien, o { status, body } con la respuesta de error.
// Los administradores (clave de administrador) pueden modificar cualquier cosa sin PIN.
async function checkPin(cfg, req, id) {
  if (adminOk(req)) return null;
  const expected = pinFor(id);
  if (!expected) return null;

  const failKey = `pokemon:pinfail:${id}`;
  const fails = Number((await redis(cfg, ['GET', failKey])) || 0);
  if (fails >= MAX_FAILS) {
    return { status: 429, body: { error: 'Demasiados intentos con PIN incorrecto. Espera unos 15 minutos.' } };
  }

  const given = String(req.headers['x-pin'] || '').trim();
  if (/^\d{4}$/.test(given) && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return null;

  if (given) {
    await redis(cfg, ['INCR', failKey]);
    await redis(cfg, ['EXPIRE', failKey, BLOCK_SECONDS]);
  }
  return {
    status: 401,
    body: { needPin: true, error: given ? 'PIN incorrecto.' : 'Hace falta el PIN de este participante.' },
  };
}

module.exports = { pinFor, checkPin, adminOk, verifyPin };
