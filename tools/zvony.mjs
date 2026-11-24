// Vygeneruje zvukový podklad pod modlitbu u kříže: zvony, varhany a tichý sbor v prostoru kostela.
// Zvuk je celý syntetizovaný tímto skriptem (žádné cizí nahrávky), takže na něj nejsou licenční omezení.
//
//   node tools/zvony.mjs          → audio/racice/zvony-modlitba.mp3 (potřebuje ffmpeg)
//
// Stavba (100 s, modlitba trvá asi minutu): 0–7 s vyzvánění dvou zvonů, pak varhany (principál 8′+4′,
// kvinta, pedál 16′) a sborové „á“ s chorálními akordy, zhruba každých 18 s vzdálený zvon, dlouhý
// dozvuk jako v kostelní lodi, na konci doznění. Hlasitost je zapečená přímo v souboru
// (podklad asi -26 LUFS, hlas zůstane zřetelně nahoře), protože na iPhonu nejde hlasitost měnit z webu.
import { writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SR = 44100, DUR = 100, N = SR * DUR;
const out = new Float32Array(N);
const dB = (d) => Math.pow(10, d / 20);
// deterministický „náhodný“ generátor, ať je výsledek pokaždé stejný
let seed = 7; const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);

// ---------- zvon ----------
// Partialy kostelního zvonu vůči nominálu: hum 0.5, prima 1, tercie 1.2 (malá), kvinta 1.5, nominál 2, výš 2.5, 3, 4.2
const PARTIALS = [
  [0.5, 0.55, 9.0], [1.0, 0.75, 6.0], [1.2, 0.5, 4.5], [1.5, 0.28, 3.2],
  [2.0, 0.6, 3.0], [2.5, 0.22, 2.0], [3.0, 0.16, 1.5], [4.2, 0.1, 0.9], [5.4, 0.05, 0.5]
];
function bell(buf, t0, f, gain, decayMul = 1) {
  const start = Math.round(t0 * SR);
  for (const [ratio, amp, decay] of PARTIALS) {
    const fr = f * ratio, d = decay * decayMul, beat = 0.6 + rnd() * 0.9; // dvojice blízkých frekvencí → typické chvění zvonu
    const len = Math.min(N - start, Math.round(d * 6 * SR));
    const ph1 = rnd() * 6.28, ph2 = rnd() * 6.28;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = Math.exp(-t / d) * (1 - Math.exp(-t * 900));
      const s = Math.sin(2 * Math.PI * fr * t + ph1) * 0.6 + Math.sin(2 * Math.PI * (fr + beat) * t + ph2) * 0.4;
      buf[start + i] += s * env * amp * gain;
    }
  }
  // úder srdce: krátký šum
  for (let i = 0; i < SR * 0.03 && start + i < N; i++) buf[start + i] += (rnd() * 2 - 1) * Math.exp(-i / (SR * 0.006)) * 0.15 * gain;
}

// ---------- akordy (chorál v d moll, každý 8 s, s plagálními a autentickými závěry) ----------
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// [pedál, tenor, alt, soprán]
const CHORDS = [
  [38, 57, 62, 65], [43, 58, 62, 67], [38, 57, 62, 65], [45, 57, 61, 64],
  [41, 57, 60, 65], [36, 55, 60, 64], [34, 58, 62, 65], [45, 57, 61, 64],
  [38, 57, 62, 65], [43, 55, 62, 70], [41, 57, 60, 65], [43, 58, 62, 67], [38, 57, 62, 66]
];
const CH_LEN = 8, START = 2.5, XF = 2.5; // XF = překryv akordů (plynulý přechod)
const COUNT = Math.ceil((DUR - START) / CH_LEN);
function chordAt(ci) { return CHORDS[ci % CHORDS.length]; }
function envAt(t, len) { return Math.min(1, t / XF) * Math.min(1, (len - t) / XF); }

// ---------- varhany ----------
// rejstříky: principál 8′, oktáva 4′, kvinta 2 2/3′, superoktáva 2′ (pedál navíc 16′)
const ORGAN = [[1, 1], [2, 0.55], [3, 0.22], [4, 0.2], [6, 0.06], [8, 0.05]];
const organ = new Float32Array(N);
for (let ci = 0; ci < COUNT; ci++) {
  const ch = chordAt(ci);
  const s0 = Math.round((START + ci * CH_LEN) * SR), s1 = Math.min(N, Math.round((START + (ci + 1) * CH_LEN + XF) * SR));
  const len = (s1 - s0) / SR;
  ch.forEach((m, ni) => {
    const f = midi(m), pedal = ni === 0, vol = pedal ? 1.0 : 0.6;
    const det = 0.1 + rnd() * 0.12;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR, env = envAt(t, len);
      let s = 0;
      for (const [h, a] of ORGAN) {
        const fh = f * h;
        s += a * (Math.sin(2 * Math.PI * fh * t) + Math.sin(2 * Math.PI * (fh + det * h) * t + ni)) * 0.5;
      }
      if (pedal) s += 0.8 * Math.sin(2 * Math.PI * f / 2 * t); // 16′
      organ[i] += s * env * vol;
    }
  });
}

// ---------- sbor („á“): rozladěné pilovité hlasy přes formantové filtry ----------
function biquadBP(x, fc, q) {
  const w = 2 * Math.PI * fc / SR, al = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + al;
  const b0 = al / a0, b2 = -al / a0, a1 = -2 * c / a0, a2 = (1 - al) / a0;
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let n = 0; n < x.length; n++) {
    const v = b0 * x[n] + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x[n]; y2 = y1; y1 = v; y[n] = v;
  }
  return y;
}
const voices = new Float32Array(N);
for (let ci = 0; ci < COUNT; ci++) {
  const ch = chordAt(ci);
  const s0 = Math.round((START + 3 + ci * CH_LEN) * SR), s1 = Math.min(N, Math.round((START + 3 + (ci + 1) * CH_LEN + XF) * SR));
  const len = (s1 - s0) / SR;
  if (s0 >= N) break;
  ch.slice(1).forEach((m) => {
    const f = midi(m);
    for (let v = 0; v < 3; v++) { // tři zpěváci na hlas, každý trochu jinak
      const df = f * (1 + (rnd() - 0.5) * 0.008), vr = 5 + rnd(), vp = rnd() * 6.28;
      let ph = rnd();
      for (let i = s0; i < s1; i++) {
        const t = (i - s0) / SR;
        ph += df * (1 + 0.004 * Math.sin(2 * Math.PI * vr * t + vp)) / SR; ph -= Math.floor(ph);
        voices[i] += (2 * ph - 1) * envAt(t, len) * 0.33;
      }
    }
  });
}
const choir = new Float32Array(N);
for (const [fc, q, g] of [[700, 6, 1], [1150, 7, 0.5], [2600, 8, 0.18]]) {
  const y = biquadBP(voices, fc, q);
  for (let i = 0; i < N; i++) choir[i] += y[i] * g;
}

// ---------- mix plochy: varhany + sbor, měkce, s pomalým „dýcháním“ ----------
let lp = 0;
const a = Math.exp(-2 * Math.PI * 1800 / SR);
let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(organ[i]));
let pc = 0; for (let i = 0; i < N; i++) pc = Math.max(pc, Math.abs(choir[i]));
for (let i = 0; i < N; i++) {
  const mixd = organ[i] / pk + choir[i] / pc * 0.55;
  lp = (1 - a) * mixd + a * lp;
  const t = i / SR;
  const breathe = 0.88 + 0.12 * Math.sin(2 * Math.PI * t / 13);
  const fadeIn = Math.min(1, Math.max(0, (t - START) / 4));
  out[i] += lp * breathe * fadeIn * dB(-8);
}

// ---------- zvony ----------
const bells = new Float32Array(N);
// úvodní vyzvánění: dva zvony střídavě
const BIG = 196, SMALL = 262; // nominály (G3, C4)
[[0.2, BIG, 1], [1.6, SMALL, 0.75], [3.0, BIG, 0.9], [4.4, SMALL, 0.7], [5.9, BIG, 0.75]]
  .forEach(([t, f, g]) => bell(bells, t, f, g));
// vzdálené údery pod modlitbou (delší doznění)
for (let t = 20; t < DUR - 14; t += 17 + rnd() * 3) bell(bells, t, BIG, 0.28, 1.2);
// závěrečný úder
bell(bells, DUR - 12, BIG, 0.45, 1.3);
for (let i = 0; i < N; i++) out[i] += bells[i] * dB(-6);

// ---------- dozvuk kostelní lodi (Schroeder/Freeverb: 8 hřebenových + 4 allpass, dlouhý dozvuk) ----------
function reverb(x, mix) {
  const y = new Float32Array(x.length);
  const combs = [1557, 1617, 1491, 1422, 1277, 1356, 1188, 1116].map((d) => ({ d: d * 2, buf: new Float32Array(d * 2), i: 0, fb: 0.9, lp: 0 }));
  // předzpoždění 40 ms
  const pre = Math.round(0.04 * SR);
  for (let n = 0; n < x.length; n++) {
    const xin = n >= pre ? x[n - pre] : 0;
    let s = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.lp = o * 0.6 + c.lp * 0.4; // tlumení výšek jako v kamenném prostoru
      c.buf[c.i] = xin + c.lp * c.fb;
      c.i = (c.i + 1) % c.d; s += o;
    }
    y[n] = s / 8;
  }
  for (const d of [556, 441, 341, 225]) {
    const buf = new Float32Array(d); let i = 0;
    for (let n = 0; n < y.length; n++) {
      const b = buf[i], v = y[n] + b * 0.5;
      buf[i] = v; y[n] = b - v * 0.5; i = (i + 1) % d;
    }
  }
  for (let n = 0; n < x.length; n++) y[n] = x[n] * (1 - mix) + y[n] * mix * 3;
  return y;
}
const wet = reverb(out, 0.55);

// konec: posledních 6 s pozvolna dozní
for (let i = 0; i < N; i++) {
  const t = i / SR;
  if (t > DUR - 6) wet[i] *= (DUR - t) / 6;
}
// normalizace špičky na -1 dBFS
let peak = 0; for (const v of wet) peak = Math.max(peak, Math.abs(v));
const g = dB(-1) / peak;

const pcm = Buffer.alloc(44 + N * 2);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write("data", 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(wet[i] * g * 32767))), 44 + i * 2);

const dir = new URL("../audio/racice/", import.meta.url);
mkdirSync(dir, { recursive: true });
const wav = new URL("zvony-modlitba.wav", dir).pathname, mp3 = new URL("zvony-modlitba.mp3", dir).pathname;
writeFileSync(wav, pcm);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "80k", mp3]);
unlinkSync(wav);
console.log("Hotovo:", mp3);
