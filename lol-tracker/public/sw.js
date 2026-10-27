// Service worker: permite instalar la web como app y abrirla (con los últimos datos vistos) sin conexión.
// Estrategia "red primero": con conexión siempre se ve la versión más reciente; sin conexión, la última guardada.
const VERSION = 'retos-v2';
const PAGES = `${VERSION}-pages`;
const IMAGES = `${VERSION}-img`;
const SHELL = ['/', '/hub.css', '/manifest.webmanifest', '/icons/icon-192.png', '/lol/', '/lol/style.css', '/lol/script.js', '/pokemon/', '/pokemon/style.css', '/pokemon/script.js'];
const IMAGE_HOSTS = ['raw.githubusercontent.com', 'raw.communitydragon.org'];
const MAX_IMAGES = 250;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(PAGES).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function trim(cacheName, max) {
  const c = await caches.open(cacheName);
  const keys = await c.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => c.delete(k)));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return; // los guardados (PUT/POST) van siempre a la red
  const url = new URL(req.url);

  // Imágenes externas (sprites, iconos): primero la caché, que no cambian.
  if (IMAGE_HOSTS.includes(url.hostname)) {
    e.respondWith(
      caches.open(IMAGES).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok || res.type === 'opaque') { c.put(req, res.clone()); trim(IMAGES, MAX_IMAGES); }
          return res;
        } catch { return hit || Response.error(); }
      })
    );
    return;
  }

  if (url.origin !== location.origin) return; // fuentes, PokéAPI, etc.: el navegador se encarga

  // Mismo origen (páginas, estilos, scripts y /api): red primero, caché como respaldo sin conexión.
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(PAGES).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const hit = await caches.match(req, { ignoreSearch: false });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await caches.match('/')) || Response.error();
        return Response.error();
      })
  );
});
