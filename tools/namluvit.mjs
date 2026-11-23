// Namluví texty stanovišť neuronovým hlasem Azure a uloží MP3 do audio/.
// Hra je pak přehrává místo hlasu telefonu (stejně na všech telefonech, i offline).
//
// Spuštění:
//   AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=westeurope node tools/namluvit.mjs
// Volitelně:
//   AZURE_VOICE=cs-CZ-VlastaNeural   (výchozí cs-CZ-AntoninNeural)
//   AZURE_RATE=-5%                    (tempo vypravěče, výchozí -4%)
//   --znovu                           (přegenerovat i existující nahrávky)
//
// Hotové nahrávky se nepřegenerovávají; po úpravě textu se namluví jen změněné odstavce
// a nepoužité soubory se smažou. Bezplatná úroveň Azure (F0) má 500 000 znaků měsíčně,
// celý okruh má kolem 8 000.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const KEY = process.env.AZURE_SPEECH_KEY;
const REGION = process.env.AZURE_SPEECH_REGION || "westeurope";
const VOICE = process.env.AZURE_VOICE || "cs-CZ-AntoninNeural";
const RATE = process.env.AZURE_RATE || "-4%";
const FORCE = process.argv.includes("--znovu");
const DRY = process.argv.includes("--nanecisto");

// stejná normalizace a hash jako v js/app.js
const norm = (t) => String(t).replace(/\s+/g, " ").trim();
function textKey(t) {
  const s = norm(t); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}
const fileKey = (t) => textKey(VOICE + "|" + RATE + "|" + norm(t));

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

const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
const ssml = (t) => `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="cs-CZ">` +
  `<voice name="${VOICE}"><prosody rate="${RATE}">${esc(t)}</prosody></voice></speak>`;

async function synth(text) {
  for (let pokus = 1; ; pokus++) {
    const r = await fetch(`https://${REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": KEY,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3",
        "User-Agent": "pravdive-drby-namluvit"
      },
      body: ssml(text)
    });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    if ((r.status === 429 || r.status >= 500) && pokus < 5) { await new Promise((ok) => setTimeout(ok, 2000 * pokus)); continue; }
    throw new Error(`Azure ${r.status}: ${await r.text()}`);
  }
}

mkdirSync(new URL("audio/", root), { recursive: true });
const files = {}; const keep = new Set(); let nove = 0, znaky = 0;
for (const t of segs) {
  const name = fileKey(t) + ".mp3";
  files[textKey(t)] = "audio/" + name; keep.add(name);
  const target = new URL("audio/" + name, root);
  if (existsSync(target) && !FORCE) continue;
  nove++; znaky += t.length;
  if (DRY) continue;
  if (!KEY) { console.error("Chybí AZURE_SPEECH_KEY."); process.exit(1); }
  writeFileSync(target, await synth(t));
  process.stdout.write(".");
}
if (DRY) { console.log(`Nanečisto: ${segs.size} odstavců, k namluvení ${nove} (${znaky} znaků).`); process.exit(0); }
for (const f of readdirSync(new URL("audio/", root))) {
  if (f.endsWith(".mp3") && !keep.has(f)) unlinkSync(new URL("audio/" + f, root));
}
writeFileSync(new URL("audio/audio.js", root),
  "/* Generováno: node tools/namluvit.mjs – ručně neupravovat. */\nglobalThis.PD_AUDIO = " +
  JSON.stringify({ voice: VOICE, files }, null, 2) + ";\n");
console.log(`\nHotovo: ${segs.size} odstavců, nově namluveno ${nove} (${znaky} znaků), hlas ${VOICE}.`);
