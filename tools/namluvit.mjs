// Namluví texty stanovišť neuronovým hlasem a uloží MP3 do audio/.
// Hra je pak přehrává místo hlasu telefonu (stejně na všech telefonech, i offline).
// Služba se vybere podle nastaveného klíče: Azure Speech, nebo Google Cloud Text-to-Speech.
//
// Azure:   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=swedencentral node tools/namluvit.mjs
//          AZURE_VOICE=cs-CZ-AntoninNeural (výchozí) nebo cs-CZ-VlastaNeural
// Google:  GOOGLE_TTS_KEY=… node tools/namluvit.mjs
//          GOOGLE_TTS_VOICE=cs-CZ-Chirp3-HD-Charon (výchozí)
// Když jsou nastavené oba klíče, použije se Azure (změníte to TTS_SLUZBA=google).
// TTS_RATE=0.95  tempo vypravěče (1 = normální)
//   --znovu       přegenerovat i existující nahrávky (např. po změně hlasu)
//   --nanecisto   jen spočítat znaky, nic nevolat
//   --hlasy       vypsat dostupné české hlasy
//   --ukazky      namluvit první odstavec všemi českými hlasy do ukazky/ (pro výběr hlasu)
//
// Hotové nahrávky se nepřegenerovávají; po úpravě textu se namluví jen změněné odstavce
// a nepoužité soubory se smažou. Celý okruh má asi 5 000 znaků, bezplatné limity
// (Azure F0 500 000 znaků/měsíc, Google Chirp 3: HD 1 milion/měsíc) to pokryjí mnohonásobně.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const env = process.env;
const SLUZBA = env.TTS_SLUZBA || (env.AZURE_SPEECH_KEY ? "azure" : env.GOOGLE_TTS_KEY ? "google" : "azure");
const AZ = SLUZBA === "azure";
const KEY = AZ ? env.AZURE_SPEECH_KEY : env.GOOGLE_TTS_KEY;
const REGION = (env.AZURE_SPEECH_REGION || "swedencentral").replace(/\s+/g, "").toLowerCase();
const VOICE = (AZ ? env.AZURE_VOICE : env.GOOGLE_TTS_VOICE) || (AZ ? "cs-CZ-AntoninNeural" : "cs-CZ-Chirp3-HD-Charon");
const RATE = Number(env.TTS_RATE || env.GOOGLE_TTS_RATE || 0.95);
const arg = (a) => process.argv.includes(a);
const FORCE = arg("--znovu"), DRY = arg("--nanecisto");
const GAPI = "https://texttospeech.googleapis.com/v1";
const AAPI = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices`;

// stejná normalizace a hash jako v js/app.js
const norm = (t) => String(t).replace(/\s+/g, " ").trim();
function textKey(t) {
  const s = norm(t); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

function needKey() {
  if (!KEY) { console.error(AZ ? "Chybí AZURE_SPEECH_KEY." : "Chybí GOOGLE_TTS_KEY."); process.exit(1); }
}
async function call(url, opts, json) {
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(url, opts);
    if (r.ok) return json ? r.json() : Buffer.from(await r.arrayBuffer());
    if ((r.status === 429 || r.status >= 500) && pokus < 5) { await new Promise((ok) => setTimeout(ok, 2000 * pokus)); continue; }
    let hint = "";
    if (AZ && r.status === 401) hint = " (špatný klíč, nebo AZURE_SPEECH_REGION neodpovídá regionu prostředku)";
    throw new Error(`${AZ ? "Azure" : "Google TTS"} ${r.status}: ${await r.text()}${hint}`);
  }
}
const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
async function synth(text, voice = VOICE) {
  if (AZ) {
    const pct = Math.round((RATE - 1) * 100);
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="cs-CZ">` +
      `<voice name="${voice}"><prosody rate="${pct >= 0 ? "+" : ""}${pct}%">${esc(text)}</prosody></voice></speak>`;
    return call(AAPI + "/v1", { method: "POST", body: ssml, headers: {
      "Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "pravdive-drby-namluvit"
    } });
  }
  const j = await call(GAPI + "/text:synthesize", { method: "POST", headers: { "X-Goog-Api-Key": KEY, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ input: { text }, voice: { languageCode: voice.slice(0, 5), name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: RATE } })
  }, true);
  return Buffer.from(j.audioContent, "base64");
}
// [{ name, gender }]
async function czechVoices() {
  if (AZ) {
    const list = await call(AAPI + "/voices/list", { headers: { "Ocp-Apim-Subscription-Key": KEY } }, true);
    return list.filter((v) => v.Locale === "cs-CZ").map((v) => ({ name: v.ShortName, gender: v.Gender }));
  }
  const j = await call(GAPI + "/voices?languageCode=cs-CZ", { headers: { "X-Goog-Api-Key": KEY } }, true);
  return (j.voices || []).filter((v) => v.languageCodes.includes("cs-CZ")).map((v) => ({ name: v.name, gender: v.ssmlGender }));
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
  for (const v of await czechVoices()) console.log(v.name.padEnd(32), v.gender);
  process.exit(0);
}

if (arg("--ukazky")) {
  needKey();
  const first = [...segs][0];
  const voices = (await czechVoices()).map((v) => v.name)
    .sort((a, b) => (/Chirp3|Neural/.test(b) - /Chirp3|Neural/.test(a)) || a.localeCompare(b));
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
if (DRY) { console.log(`Nanečisto (${SLUZBA}): ${segs.size} odstavců, k namluvení ${nove} (${znaky} znaků), hlas ${VOICE}.`); process.exit(0); }
for (const f of readdirSync(new URL("audio/", root))) {
  if (f.endsWith(".mp3") && !keep.has(f)) unlinkSync(new URL("audio/" + f, root));
}
writeFileSync(new URL("audio/audio.js", root),
  "/* Generováno: node tools/namluvit.mjs – ručně neupravovat. */\nglobalThis.PD_AUDIO = " +
  JSON.stringify({ voice: VOICE, files }, null, 2) + ";\n");
console.log(`\nHotovo (${SLUZBA}): ${segs.size} odstavců, nově namluveno ${nove} (${znaky} znaků), hlas ${VOICE}.`);
