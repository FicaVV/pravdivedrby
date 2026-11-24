/* Service worker: aplikace funguje offline, prohlédnuté mapové dlaždice se ukládají. */
const VERSION = "pd-0.3.1";
const SHELL = [
  "./", "index.html", "css/app.css", "js/app.js", "data/racice.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "audio/racice/hymna-kdo-je-tady-doma.mp3"
];
const TILES = "pd-tiles-v1";
const TILE_LIMIT = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  // Audio: přehrávač (hlavně Safari) chce části souboru (Range), cache má celý soubor → vyříznout 206
  if (url.origin === location.origin && e.request.headers.has("range")) {
    e.respondWith(caches.match(e.request.url, { ignoreSearch: true })
      .then((hit) => hit ? rangeResponse(hit, e.request.headers.get("range")) : fetch(e.request)));
    return;
  }
  // Vlastní soubory: nejdřív cache, jinak síť
  if (url.origin === location.origin) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((r) => {
      const copy = r.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return r;
    })));
  }
});

async function rangeResponse(full, range) {
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range) || [];
  let start = m[1] ? +m[1] : 0, end = m[2] ? +m[2] : buf.byteLength - 1;
  if (!m[1] && m[2]) { start = Math.max(0, buf.byteLength - +m[2]); end = buf.byteLength - 1; }
  end = Math.min(end, buf.byteLength - 1);
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      "Content-Type": full.headers.get("Content-Type") || "audio/mpeg",
      "Content-Range": `bytes ${start}-${end}/${buf.byteLength}`,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes"
    }
  });
}
