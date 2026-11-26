/* Service worker: aplikace funguje offline, prohlédnuté mapové dlaždice se ukládají. */
const VERSION = "pd-0.5.3";
const SHELL = [
  "./", "index.html", "css/app.css", "js/config.js", "js/odesilani.js", "js/app.js", "data/racice.js", "audio/audio.js",
  "js/kronika.js", "data/racice-kronika.js",
  "data/racice-mapa.js", "js/kreslena-mapa.js",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "manifest.webmanifest", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
  // minihry na stanovištích
  "css/hry.css", "js/hry.js",
  "audio/racice/hymna-kdo-je-tady-doma.mp3", "audio/racice/zvony-modlitba.mp3",
  "audio/racice/koza-1.mp3", "audio/racice/koza-2.mp3",
  // kresby tužkou
  "img/racice/1-cedule.svg", "img/racice/1-koza.svg", "img/racice/1-dojeni-koza.svg", "img/racice/2-pullitr.svg", "img/racice/2-zbrojnice.svg",
  "img/racice/3-kybl.svg", "img/racice/3-skolka.svg", "img/racice/4-kriz.svg", "img/racice/5-amplion.svg",
  "img/racice/5-stadion.svg", "img/racice/6-florian.svg", "img/racice/6-moskvic.svg", "img/racice/7-sokolovna.svg",
  "img/racice/7-stany.svg", "img/racice/8-kocarky.svg", "img/racice/8-urad.svg",
  // osobní kronika: razítka a schovaná koza
  "img/racice/koza-schovana.svg",
  "img/racice/razitko-1.svg", "img/racice/razitko-2.svg", "img/racice/razitko-3.svg", "img/racice/razitko-4.svg",
  "img/racice/razitko-5.svg", "img/racice/razitko-6.svg", "img/racice/razitko-7.svg", "img/racice/razitko-8.svg"
];
const TILES = "pd-tiles-v1";
const TRASA = "pd-trasa-v1"; // dlaždice stažené tlačítkem „Stáhnout na cestu“ (neprořezávají se)
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
    keys.filter((k) => k !== VERSION && k !== TILES && k !== AUDIO && k !== TRASA).map((k) => caches.delete(k))
  )).then(() => self.clients.claim()));
});

async function cacheAudio() {
  const c = await caches.open(AUDIO);
  const want = new Set(AUDIO_FILES.map((f) => new URL(f, self.registration.scope).href));
  for (const k of await c.keys()) if (!want.has(k.url)) await c.delete(k);
  for (const u of want) if (!(await c.match(u))) { try { await c.add(u); } catch (e) { /* zkusí se příště */ } }
}

// „Stáhnout na cestu“: aplikace, kresby, nahrávky a okolí trasy na skutečné mapě (max. 250 dlaždic).
// Stránka pošle seznam dlaždic a port, sem posíláme průběh.
self.addEventListener("message", (e) => {
  const m = e.data || {};
  if (m.typ !== "stahni" || !e.ports[0]) return;
  const port = e.ports[0];
  e.waitUntil(stahni(m, port).catch(() => port.postMessage({ typ: "hotovo", verze: VERSION, chyby: -1 })));
});
async function stahni(m, port) {
  const scope = self.registration.scope;
  const shell = SHELL.map((u) => new URL(u, scope).href);
  const audio = AUDIO_FILES.map((u) => new URL(u, scope).href);
  const tiles = (m.dlazdice || []).filter((u) => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(u)).slice(0, 250);
  const jobs = [].concat(shell.map((u) => [VERSION, u]), audio.map((u) => [AUDIO, u]), tiles.map((u) => [TRASA, u]));
  let hotovo = 0, chyby = 0, bajty = 0;
  const celkem = jobs.length;
  const open = {};
  async function one([name, url]) {
    const c = open[name] || (open[name] = await caches.open(name));
    let hit = await c.match(url);
    if (!hit || name === VERSION) {
      try {
        const r = name === TRASA
          ? await fetch(url, { mode: "cors", credentials: "omit" }).catch(() => fetch(url, { mode: "no-cors" }))
          : await fetch(url, { cache: "no-cache" });
        if (r.ok || r.type === "opaque") { await c.put(url, r.clone()); hit = r; } else chyby++;
      } catch (err) { if (!hit) chyby++; }
    }
    if (hit) { try { bajty += (await hit.clone().blob()).size; } catch (err) {} }
    hotovo++;
    if (hotovo % 4 === 0 || hotovo === celkem) port.postMessage({ typ: "prubeh", hotovo, celkem });
  }
  // po dvou souběžně: šetrné k serveru OSM i k telefonu
  let i = 0;
  async function worker() { while (i < jobs.length) await one(jobs[i++]); }
  await Promise.all([worker(), worker()]);
  port.postMessage({ typ: "hotovo", verze: VERSION, chyby, bajty });
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
      const hit = (await c.match(e.request)) || (await caches.match(e.request.url, { cacheName: TRASA }));
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
