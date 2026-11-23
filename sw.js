/* Service worker: aplikace funguje offline, prohlédnuté mapové dlaždice se ukládají. */
const VERSION = "pd-0.2.1";
const SHELL = [
  "./", "index.html", "css/app.css", "js/app.js", "data/racice.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"
];
const TILES = "pd-tiles-v1";
const TILE_LIMIT = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== VERSION && k !== TILES).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - TILE_LIMIT; i++) await c.delete(keys[i]);
}

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return;

  // Mapové dlaždice a fonty: z cache, na pozadí obnovit
  if (url.hostname.endsWith("tile.openstreetmap.org") || url.hostname.includes("fonts.g")) {
    e.respondWith(caches.open(TILES).then(async (c) => {
      const hit = await c.match(e.request);
      const net = fetch(e.request).then((r) => {
        if (r.ok || r.type === "opaque") { c.put(e.request, r.clone()); trimTiles(); }
        return r;
      }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // Vlastní soubory: nejdřív síť (vždy čerstvá verze), offline z cache
  if (url.origin === location.origin) {
    e.respondWith(fetch(e.request, { cache: "no-cache" }).then((r) => {
      if (r.ok) { const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })
      .then((hit) => hit || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))));
  }
});
