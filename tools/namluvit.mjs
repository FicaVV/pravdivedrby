// Namluví texty stanovišť hlasem Google Cloud Text-to-Speech a uloží MP3 do audio/.
// Hra je pak přehrává místo hlasu telefonu (stejně na všech telefonech, i offline).
//
// Spuštění:
//   GOOGLE_TTS_KEY=… node tools/namluvit.mjs
// Volitelně:
//   GOOGLE_TTS_VOICE=cs-CZ-Chirp3-HD-Charon   (výchozí; seznam hlasů: --hlasy)
//   GOOGLE_TTS_RATE=0.95                       (tempo, 0.25–2, výchozí 0.95)
//   --znovu       přegenerovat i existující nahrávky (např. po změně hlasu)
//   --nanecisto   jen spočítat znaky, nic nevolat
//   --hlasy       vypsat dostupné české hlasy
//   --ukazky      namluvit první odstavec několika hlasy do ukazky/ (pro výběr hlasu)
//
// Hotové nahrávky se nepřegenerovávají; po úpravě textu se namluví jen změněné odstavce
// a nepoužité soubory se smažou. Měsíčně je zdarma 1 milion znaků hlasů Chirp 3: HD
// (4 miliony u WaveNet/Standard), celý okruh má asi 5 000 znaků.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const KEY = process.env.GOOGLE_TTS_KEY;
const VOICE = process.env.GOOGLE_TTS_VOICE || "cs-CZ-Chirp3-HD-Charon";
const RATE = Number(process.env.GOOGLE_TTS_RATE || 0.95);
const arg = (a) => process.argv.includes(a);
const FORCE = arg("--znovu"), DRY = arg("--nanecisto");
const API = "https://texttospeech.googleapis.com/v1";

// stejná normalizace a hash jako v js/app.js
const norm = (t) => String(t).replace(/\s+/g, " ").trim();
function textKey(t) {
  const s = norm(t); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

function needKey() {
  if (!KEY) { console.error("Chybí GOOGLE_TTS_KEY."); process.exit(1); }
}
async function api(path, body) {
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(API + path, {
      method: body ? "POST" : "GET",
      headers: { "X-Goog-Api-Key": KEY, "Content-Type": "application/json; charset=utf-8" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (r.ok) return r.json();
    if ((r.status === 429 || r.status >= 500) && pokus < 5) { await new Promise((ok) => setTimeout(ok, 2000 * pokus)); continue; }
    throw new Error(`Google TTS ${r.status}: ${await r.text()}`);
  }
}
async function synth(text, voice = VOICE) {
  const j = await api("/text:synthesize", {
    input: { text },
    voice: { languageCode: voice.slice(0, 5), name: voice },
    audioConfig: { audioEncoding: "MP3", speakingRate: RATE }
  });
  return Buffer.from(j.audioContent, "base64");
}
async function czechVoices() {
  const j = await api("/voices?languageCode=cs-CZ");
  return (j.voices || []).filter((v) => v.languageCodes.includes("cs-CZ"));
}

// načíst všechny obce z data/*.js
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of readdirSync(new URL("data/", root)).filter((f) => f.endsWith(".js")).sort()) {
  vm.runInContext(readFileSync(new URL("data/" + f, root), "utf8"), ctx, { filename: f });
}
const segs = new Set();
for (const obec of ctx.window.PD_OBCE || []) {
  for (const b of obec.body) {
    (b.text || []).forEach((t) => segs.add(norm(t)));
    if (b.modlitba) segs.add(norm(b.modlitba.concat(b.modlitbaKonec || []).join(" ")));
  }
}

if (arg("--hlasy")) {
  needKey();
  for (const v of await czechVoices()) console.log(v.name.padEnd(32), v.ssmlGender);
  process.exit(0);
}

if (arg("--ukazky")) {
  needKey();
  const first = [...segs][0];
  const voices = (await czechVoices()).map((v) => v.name)
    .sort((a, b) => (/Chirp3/.test(b) - /Chirp3/.test(a)) || a.localeCompare(b));
  mkdirSync(new URL("ukazky/", root), { recursive: true });
  for (const v of voices) {
    writeFileSync(new URL(`ukazky/${v}.mp3`, root), await synth(first, v));
    console.log("ukazky/" + v + ".mp3");
  }
  process.exit(0);
}

const fileKey = (t) => textKey(VOICE + "|" + RATE + "|" + norm(t));
mkdirSync(new URL("audio/", root), { recursive: true });
const files = {}; const keep = new Set(); let nove = 0, znaky = 0;
for (const t of segs) {
  const name = fileKey(t) + ".mp3";
  files[textKey(t)] = "audio/" + name; keep.add(name);
  const target = new URL("audio/" + name, root);
  if (existsSync(target) && !FORCE) continue;
  nove++; znaky += t.length;
  if (DRY) continue;
  needKey();
  writeFileSync(target, await synth(t));
  process.stdout.write(".");
}
if (DRY) { console.log(`Nanečisto: ${segs.size} odstavců, k namluvení ${nove} (${znaky} znaků), hlas ${VOICE}.`); process.exit(0); }
for (const f of readdirSync(new URL("audio/", root))) {
  if (f.endsWith(".mp3") && !keep.has(f)) unlinkSync(new URL("audio/" + f, root));
}
writeFileSync(new URL("audio/audio.js", root),
  "/* Generováno: node tools/namluvit.mjs – ručně neupravovat. */\nglobalThis.PD_AUDIO = " +
  JSON.stringify({ voice: VOICE, files }, null, 2) + ";\n");
console.log(`\nHotovo: ${segs.size} odstavců, nově namluveno ${nove} (${znaky} znaků), hlas ${VOICE}.`);
