/* Service worker: aplikace funguje offline, prohlédnuté mapové dlaždice se ukládají. */
const VERSION = "pd-0.4.1";
const SHELL = [
  "./", "index.html", "css/app.css", "js/app.js", "data/racice.js", "audio/audio.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  "audio/racice/hymna-kdo-je-tady-doma.mp3"
];
const TILES = "pd-tiles-v1";
const AUDIO = "pd-audio-v1";
// seznam namluvených nahrávek (audio/audio.js nastaví self.PD_AUDIO)
try { importScripts("audio/audio.js"); } catch (e) { /* bez nahrávek */ }
const AUDIO_FILES = Object.values((self.PD_AUDIO && self.PD_AUDIO.files) || {});
const TILE_LIMIT = 1500;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: "reload" })))).then(() => self.skipWaiting()));
  // nahrávky stáhnout předem, ať předčítání funguje i bez signálu (chyba instalaci nezastaví)
  e.waitUntil(cacheAudio().catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => k !== VERSION && k !== TILES && k !== AUDIO).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function cacheAudio() {
  const c = await caches.open(AUDIO);
  const want = new Set(AUDIO_FILES.map((f) => new URL(f, self.registration.scope).href));
  for (const k of await c.keys()) if (!want.has(k.url)) await c.delete(k);
  for (const u of want) if (!(await c.match(u))) { try { await c.add(u); } catch (e) { /* zkusí se příště */ } }
}

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
  // Nahrávky: z cache nahrávek, jinak síť (a uložit)
  if (url.origin === location.origin && url.pathname.endsWith(".mp3")) {
    e.respondWith(caches.open(AUDIO).then(async (c) => {
      const hit = await caches.match(e.request, { ignoreSearch: true });
      if (hit) return hit;
      const r = await fetch(e.request);
      if (r.ok && r.status === 200) c.put(e.request, r.clone());
      return r;
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
