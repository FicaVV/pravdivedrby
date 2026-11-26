// Namluví texty stanovišť neuronovým hlasem a uloží MP3 do audio/.
// Hra je pak přehrává místo hlasu telefonu (stejně na všech telefonech, i offline).
// Služba: Google Cloud Text-to-Speech (výchozí), záložně Azure Speech.
//
// Google:  GOOGLE_TTS_API_KEY=… node tools/namluvit.mjs   (starší název GOOGLE_TTS_KEY funguje taky)
//          GOOGLE_TTS_VOICE=cs-CZ-Chirp3-HD-Charon (výchozí)
// Azure:   TTS_SLUZBA=azure AZURE_SPEECH_KEY=… AZURE_SPEECH_REGION=swedencentral node tools/namluvit.mjs
//          AZURE_VOICE=cs-CZ-AntoninNeural (výchozí) nebo cs-CZ-VlastaNeural
// Bez TTS_SLUZBA se použije Google, pokud je nastavený jeho klíč, jinak Azure.
// Proměnné se načtou i ze souboru .env v kořeni repozitáře (ten se necommituje).
// TTS_RATE=0.95  tempo vypravěče (1 = normální)
//   --znovu       přegenerovat i existující nahrávky (např. po změně hlasu)
//   --nanecisto   jen spočítat znaky, nic nevolat
//   --hlasy       vypsat dostupné české hlasy
//   --ukazky      namluvit první odstavec všemi českými hlasy do ukazky/ (pro výběr hlasu)
//   --kvota       vypsat, kolik znaků Google TTS je tento měsíc použito a kolik zbývá
//
// Hotové nahrávky se nepřegenerovávají; po úpravě textu se namluví jen změněné odstavce
// a nepoužité soubory se smažou.
//
// Hlídání kvóty Google (zdarma 1 000 000 znaků měsíčně, pak 30 USD / 1M; Google sám strop nemá):
// - počet odeslaných znaků za měsíc se ukládá do tools/tts-kvota.json (klíč RRRR-MM podle
//   času v America/Los_Angeles, podle kterého Google účtuje); workflow soubor commituje,
// - znaky se počítají v Unicode znacích (i mezery), připíšou se PŘED každým voláním,
//   i když se volání nepovede, pod zámkem tools/tts-kvota.lock,
// - nevejde-li se celé namlouvání pod 950 000, nezačne se vůbec; nad 800 000 se varuje.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, unlinkSync, openSync, closeSync, renameSync, statSync, appendFileSync } from "node:fs";
import vm from "node:vm";
import { spawnSync } from "node:child_process";

const root = new URL("../", import.meta.url);
const env = process.env;
// .env (KLÍČ=hodnota); už nastavené proměnné mají přednost
if (existsSync(new URL(".env", root))) {
  for (const l of readFileSync(new URL(".env", root), "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const GKEY = env.GOOGLE_TTS_API_KEY || env.GOOGLE_TTS_KEY;
const SLUZBA = (env.TTS_SLUZBA || (GKEY ? "google" : "azure")).toLowerCase();
const AZ = SLUZBA === "azure";
const KEY = AZ ? env.AZURE_SPEECH_KEY : GKEY;
const REGION = (env.AZURE_SPEECH_REGION || "swedencentral").replace(/\s+/g, "").toLowerCase();
const VOICE = (AZ ? env.AZURE_VOICE : env.GOOGLE_TTS_VOICE) || (AZ ? "cs-CZ-AntoninNeural" : "cs-CZ-Chirp3-HD-Charon");
const RATE = Number(env.TTS_RATE || env.GOOGLE_TTS_RATE || 0.95);
// Modlitba u kříže jako od faráře v kostele: pomaleji, (u Azure i hlouběji) a s dozvukem kostelní lodi.
// Dozvuk přidává ffmpeg (na GitHubu je předinstalovaný); bez něj zůstane jen pomalejší tempo.
const FARAR = { rate: Number(env.TTS_RATE_MODLITBA || 0.8), pitch: -8,
  ozvena: "aecho=0.8:0.88:45|90|150|230:0.32|0.24|0.16|0.1,lowpass=f=7000,apad=pad_dur=1" };
const arg = (a) => process.argv.includes(a);
const FORCE = arg("--znovu"), DRY = arg("--nanecisto");
const GAPI = "https://texttospeech.googleapis.com/v1";
const AAPI = `https://${REGION}.tts.speech.microsoft.com/cognitiveservices`;
const POKUSU = 3; // max pokusů na jeden požadavek při 429/5xx
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

// stejná normalizace a hash jako v js/app.js
const norm = (t) => String(t).replace(/\s+/g, " ").trim();
function textKey(t) {
  const s = norm(t); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, "0");
}

// ---------- Kvóta Google TTS ----------
const ZDARMA = 1_000_000, STROP = 950_000, VAROVANI = 800_000;
const KVOTA = new URL("tools/tts-kvota.json", root);
const ZAMEK = new URL("tools/tts-kvota.lock", root);
const LIMIT_MSG = "Měsíční limit namlouvání vyčerpán, obnoví se 1. dne příštího měsíce";
class LimitError extends Error {}
const znaku = (s) => [...s].length; // Unicode znaky, ne bajty ani UTF-16
function mesic(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit" })
    .formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}`;
}
function nactiKvotu() {
  try { return JSON.parse(readFileSync(KVOTA, "utf8")); } catch { return { mesice: {} }; }
}
const pouzito = () => nactiKvotu().mesice?.[mesic()] || 0;
function sZamkem(fn) {
  let fd;
  for (let i = 0; ; i++) {
    try { fd = openSync(ZAMEK, "wx"); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      try { if (Date.now() - statSync(ZAMEK).mtimeMs > 60_000) { unlinkSync(ZAMEK); continue; } } catch {}
      if (i > 600) throw new Error("Počítadlo kvóty je zamčené (tools/tts-kvota.lock), běží jiné namlouvání?");
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
    }
  }
  try { return fn(); } finally { closeSync(fd); try { unlinkSync(ZAMEK); } catch {} }
}
let varovano = false;
function varuj(n) {
  if (varovano || n < VAROVANI) return;
  varovano = true;
  const msg = `Google TTS: tento měsíc použito ${n.toLocaleString("cs-CZ")} znaků, přes 80 % bezplatné kvóty.`;
  console.warn(env.GITHUB_ACTIONS ? `::warning::${msg}` : "VAROVÁNÍ: " + msg);
}
// Ověří předem, že se celé namlouvání vejde pod strop; jinak nezačne vůbec.
function overitPredem(n) {
  const u = pouzito();
  if (u + n > STROP) throw new LimitError(`${LIMIT_MSG}. (Potřeba ${n} znaků, použito ${u} z ${STROP}.)`);
}
// Atomicky připíše znaky před voláním API; při překročení stropu API nevolat.
function pripsat(n) {
  const nove = sZamkem(() => {
    const k = nactiKvotu(); k.mesice ||= {};
    const m = mesic(), u = k.mesice[m] || 0;
    if (u + n > STROP) throw new LimitError(`${LIMIT_MSG}. (Použito ${u} z ${STROP}, kus má ${n} znaků.)`);
    k.mesice[m] = u + n;
    k.popis = "Znaky odeslané do Google TTS za měsíc (RRRR-MM, čas America/Los_Angeles). Zapisuje tools/namluvit.mjs.";
    const tmp = new URL("tools/tts-kvota.json.tmp", root);
    writeFileSync(tmp, JSON.stringify({ popis: k.popis, mesice: k.mesice }, null, 2) + "\n");
    renameSync(tmp, KVOTA);
    return u + n;
  });
  varuj(nove);
  return nove;
}
function prehledKvoty() {
  const u = pouzito(), m = mesic();
  const f = (n) => n.toLocaleString("cs-CZ");
  const text = `Google TTS ${m} (čas Los Angeles): použito ${f(u)} znaků, ` +
    `do pojistky ${f(STROP)} zbývá ${f(Math.max(0, STROP - u))} (zdarma ${f(ZDARMA)}, ${Math.round((u / ZDARMA) * 100)} %).`;
  console.log(text);
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `### Kvóta Google TTS\n\n| Měsíc | Použito | Zbývá do ${f(STROP)} | Z bezplatného milionu |\n|---|---|---|---|\n` +
      `| ${m} | ${f(u)} | ${f(Math.max(0, STROP - u))} | ${Math.round((u / ZDARMA) * 100)} % |\n`);
  }
}

// Rozdělí text na kusy do ~4 500 bajtů UTF-8 (limit požadavku je 5 000):
// přednostně na odstavcích, pak na větách, v nouzi na slovech.
const MAX_B = 4500, bajtu = (s) => Buffer.byteLength(s, "utf8");
function rozdelit(text) {
  if (bajtu(text) <= MAX_B) return [text];
  const kusy = []; let cur = "";
  const pridej = (cast, sep) => {
    if (!cast) return;
    if (bajtu(cast) > MAX_B) {
      if (cur) { kusy.push(cur); cur = ""; }
      const mensi = sep === "\n\n" ? cast.split(/(?<=[.!?…])\s+/) : cast.split(/\s+/);
      for (const c of mensi) pridej(c, sep === "\n\n" ? " " : "  ");
      return;
    }
    const spoj = cur ? cur + (sep === "\n\n" ? "\n\n" : " ") + cast : cast;
    if (bajtu(spoj) <= MAX_B) cur = spoj; else { kusy.push(cur); cur = cast; }
  };
  for (const odst of text.split(/\n\s*\n/)) pridej(odst.trim(), "\n\n");
  if (cur) kusy.push(cur);
  return kusy;
}

function needKey() {
  if (!KEY) { console.error(AZ ? "Chybí AZURE_SPEECH_KEY." : "Chybí GOOGLE_TTS_API_KEY."); process.exit(1); }
}
const retriable = (st) => st === 429 || st >= 500;
// predPokusem: zavolá se před každým pokusem (u Googlu připíše znaky do kvóty)
async function call(url, opts, json, predPokusem) {
  for (let pokus = 1; ; pokus++) {
    predPokusem?.();
    let r;
    try { r = await fetch(url, opts); } catch (e) {
      if (pokus < POKUSU) { await sleep(2000 * pokus); continue; }
      throw e;
    }
    if (r.ok) return json ? r.json() : Buffer.from(await r.arrayBuffer());
    if (retriable(r.status) && pokus < POKUSU) { await sleep(2000 * pokus); continue; }
    let hint = "";
    if (AZ && r.status === 401) hint = " (špatný klíč, nebo AZURE_SPEECH_REGION neodpovídá regionu prostředku)";
    throw new Error(`${AZ ? "Azure" : "Google TTS"} ${r.status}: ${await r.text()}${hint}`);
  }
}
const esc = (s) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
// dozvuk přes ffmpeg; když ffmpeg chybí nebo selže, vrátí nahrávku beze změny
function ozvena(mp3, filtr) {
  const tmp = new URL(".ozvena-" + process.pid + ".mp3", root), out = new URL(".ozvena-" + process.pid + "-out.mp3", root);
  try {
    writeFileSync(tmp, mp3);
    const r = spawnSync("ffmpeg", ["-v", "error", "-y", "-i", tmp.pathname, "-af", filtr, "-ac", "1", "-b:a", "64k", out.pathname]);
    return r.status === 0 ? readFileSync(out) : mp3;
  } catch (e) { return mp3; }
  finally { for (const f of [tmp, out]) if (existsSync(f)) unlinkSync(f); }
}
async function synth(text, voice = VOICE, styl = null) {
  const rate = styl ? styl.rate : RATE;
  if (AZ) {
    const pct = Math.round((rate - 1) * 100);
    const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="cs-CZ">` +
      `<voice name="${voice}"><prosody rate="${pct >= 0 ? "+" : ""}${pct}%"${styl ? ` pitch="${styl.pitch}%"` : ""}>${esc(text)}</prosody></voice></speak>`;
    return call(AAPI + "/v1", { method: "POST", body: ssml, headers: {
      "Ocp-Apim-Subscription-Key": KEY, "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "audio-24khz-48kbitrate-mono-mp3", "User-Agent": "pravdive-drby-namluvit"
    } });
  }
  // Google: čistý text, po kusech, MP3 se spojí za sebou
  const casti = [];
  for (const kus of rozdelit(text)) {
    const j = await call(GAPI + "/text:synthesize", { method: "POST", headers: { "x-goog-api-key": KEY, "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ input: { text: kus }, voice: { languageCode: voice.slice(0, 5), name: voice }, audioConfig: { audioEncoding: "MP3", speakingRate: rate } })
    }, true, () => pripsat(znaku(kus)));
    casti.push(Buffer.from(j.audioContent, "base64"));
  }
  return Buffer.concat(casti);
}
// znaky, které synth(text) odešle do Googlu (součet kusů)
const znakuKOdeslani = (t) => rozdelit(t).reduce((n, k) => n + znaku(k), 0);
// [{ name, gender }]
async function czechVoices() {
  if (AZ) {
    const list = await call(AAPI + "/voices/list", { headers: { "Ocp-Apim-Subscription-Key": KEY } }, true);
    return list.filter((v) => v.Locale === "cs-CZ").map((v) => ({ name: v.ShortName, gender: v.Gender }));
  }
  const j = await call(GAPI + "/voices?languageCode=cs-CZ", { headers: { "x-goog-api-key": KEY } }, true);
  return (j.voices || []).filter((v) => v.languageCodes.includes("cs-CZ")).map((v) => ({ name: v.name, gender: v.ssmlGender }));
}

// načíst všechny obce z data/*.js
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of readdirSync(new URL("data/", root)).filter((f) => f.endsWith(".js")).sort()) {
  vm.runInContext(readFileSync(new URL("data/" + f, root), "utf8"), ctx, { filename: f });
}
const lines = (x) => [].concat(x).join(" ");
const segs = new Set(), modlitby = new Set();
for (const obec of ctx.window.PD_OBCE || []) {
  for (const b of obec.body) {
    (b.text || []).forEach((t) => segs.add(norm(t)));
    // stejné úseky jako prayerSegs/questionSegs v js/app.js
    if (b.modlitba) b.modlitba.concat(b.modlitbaKonec || []).forEach((sl) => { segs.add(norm(lines(sl))); modlitby.add(norm(lines(sl))); });
    if (b.otazka) {
      if (b.predOtazkou) segs.add(norm(b.predOtazkou));
      segs.add(norm(b.otazka));
      b.moznosti.forEach((m, k) => segs.add(norm("Možnost " + "ABCD"[k] + ". " + lines(m))));
    }
  }
}

if (arg("--kvota")) { prehledKvoty(); process.exit(0); }

if (arg("--hlasy")) {
  needKey();
  for (const v of await czechVoices()) console.log(v.name.padEnd(32), v.gender);
  process.exit(0);
}

try {
  if (arg("--ukazky")) {
    needKey();
    const first = [...segs][0];
    const voices = (await czechVoices()).map((v) => v.name)
      .sort((a, b) => (/Chirp3|Neural/.test(b) - /Chirp3|Neural/.test(a)) || a.localeCompare(b));
    if (!AZ) overitPredem(voices.length * znakuKOdeslani(first));
    mkdirSync(new URL("ukazky/", root), { recursive: true });
    for (const v of voices) {
      writeFileSync(new URL(`ukazky/${v}.mp3`, root), await synth(first, v));
      console.log("ukazky/" + v + ".mp3");
    }
  } else {
    const styl = (t) => modlitby.has(norm(t)) ? FARAR : null;
    const fileKey = (t) => textKey(VOICE + "|" + (styl(t) ? "farar|" + FARAR.rate + "|" + FARAR.ozvena : RATE) + "|" + norm(t));
    mkdirSync(new URL("audio/", root), { recursive: true });
    // nejdřív zjistit, co chybí (hotové nahrávky se znovu nenamlouvají)
    const files = {}, keep = new Set(), todo = [];
    for (const t of segs) {
      const name = fileKey(t) + ".mp3";
      files[textKey(t)] = "audio/" + name; keep.add(name);
      if (!existsSync(new URL("audio/" + name, root)) || FORCE) todo.push([t, name]);
    }
    const znaky = todo.reduce((n, [t]) => n + znakuKOdeslani(t), 0);
    if (DRY) {
      console.log(`Nanečisto (${SLUZBA}): ${segs.size} odstavců, k namluvení ${todo.length} (${znaky} znaků), hlas ${VOICE}.`);
    } else {
      if (todo.length) needKey();
      // celé namlouvání se musí vejít do limitu, jinak se nezačne (žádné useknuté audio)
      if (!AZ && todo.length) overitPredem(znaky);
      for (const [t, name] of todo) {
        const st = styl(t);
        let mp3 = await synth(t, VOICE, st);
        if (st) mp3 = ozvena(mp3, st.ozvena);
        writeFileSync(new URL("audio/" + name, root), mp3);
        process.stdout.write(".");
      }
      for (const f of readdirSync(new URL("audio/", root))) {
        if (f.endsWith(".mp3") && !keep.has(f)) unlinkSync(new URL("audio/" + f, root));
      }
      writeFileSync(new URL("audio/audio.js", root),
        "/* Generováno: node tools/namluvit.mjs – ručně neupravovat. */\nglobalThis.PD_AUDIO = " +
        JSON.stringify({ voice: VOICE, files }, null, 2) + ";\n");
      console.log(`\nHotovo (${SLUZBA}): ${segs.size} odstavců, nově namluveno ${todo.length} (${znaky} znaků), hlas ${VOICE}.`);
    }
  }
} catch (e) {
  console.error("\n" + (env.GITHUB_ACTIONS ? "::error::" : "") + e.message);
  process.exitCode = 1;
} finally {
  if (!AZ) prehledKvoty();
}
