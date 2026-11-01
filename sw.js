/* EcoConnect · service worker
   Guarda la app en el dispositivo para que abra sin señal.
   Si cambias archivos, sube el número de VERSION para que se actualice. */
const VERSION = "ecoconnect-v2";

const ESENCIALES = [
  "./", "index.html", "manifest.webmanifest",
  "css/styles.css", "js/config.js", "js/sound.js", "js/app.js",
  "assets/icons/icon.svg", "assets/icons/icon-192.png", "assets/icons/icon-512.png", "assets/icons/apple-touch-icon.png",
  "assets/fonts/lora-latin-600-normal.woff2", "assets/fonts/lora-latin-700-normal.woff2",
  "assets/fonts/lato-latin-400-normal.woff2", "assets/fonts/lato-latin-700-normal.woff2", "assets/fonts/lato-latin-900-normal.woff2",
  "assets/sounds/tap.mp3", "assets/sounds/pendiente.mp3", "assets/sounds/recibido.mp3",
  "assets/sounds/sincronizado.mp3", "assets/sounds/respuesta.mp3", "assets/sounds/bienvenida.mp3"
];
const OPCIONALES = ["assets/sounds/ambiente.mp3"]; // pesa ~1 MB: si falla, la app igual funciona

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(ESENCIALES.map(u => new Request(u, { cache: "reload" })));
    await Promise.all(OPCIONALES.map(u => cache.add(new Request(u, { cache: "reload" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;          // Apps Script y otros sitios: sin intervenir
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const hit = await cache.match(req, { ignoreSearch: true });
    const red = fetch(req).then(res => {
      if (res && res.ok && res.status === 200) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    if (hit) { e.waitUntil(red); return hit; }          // primero lo guardado; actualiza por detrás
    const res = await red;
    if (res) return res;
    if (req.mode === "navigate") return (await cache.match("index.html")) || Response.error();
    return Response.error();
  })());
});
