// Vygeneruje zvukový podklad pod modlitbu u kříže: zvony + tichý varhanní ambient.
// Zvuk je celý syntetizovaný tímto skriptem (žádné cizí nahrávky), takže na něj nejsou licenční omezení.
//
//   node tools/zvony.mjs          → audio/racice/zvony-modlitba.mp3 (potřebuje ffmpeg)
//
// Stavba (100 s, modlitba trvá kolem minuty): 0–7 s vyzvánění dvou zvonů, pod tím nastupují varhany (tiché, ať nepřekrývají hlas),
// zhruba každých 20 s vzdálený úder zvonu, na konci doznění. Hlasitost je zapečená přímo v souboru,
// protože na iPhonu nejde hlasitost přehrávače z JavaScriptu měnit.
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

// ---------- varhany ----------
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
// D moll – B dur – F dur – C dur – D moll – g moll – A dur – D moll (pomalé, každý akord 10 s)
const CHORDS = [
  [38, 50, 57, 62, 65], [34, 50, 58, 62, 65], [41, 53, 57, 60, 65], [36, 52, 55, 60, 64],
  [38, 50, 57, 62, 65], [43, 50, 58, 62, 67], [45, 52, 57, 61, 64], [38, 50, 57, 62, 66]
];
const CH_LEN = 10, ORGAN_START = 2.5;
const HARM = [[1, 1], [2, 0.45], [3, 0.18], [4, 0.1], [6, 0.04]]; // flétnový/principálový rejstřík
const pad = new Float32Array(N);
const COUNT = Math.ceil((DUR - ORGAN_START) / CH_LEN);
for (let ci = 0; ci < COUNT; ci++) {
  const ch = CHORDS[ci % CHORDS.length];
  const t0 = ORGAN_START + ci * CH_LEN, t1 = t0 + CH_LEN + 3; // 3 s překryv = plynulé přechody
  const s0 = Math.round(t0 * SR), s1 = Math.min(N, Math.round(t1 * SR));
  ch.forEach((m, ni) => {
    const f = midi(m), vol = ni === 0 ? 0.9 : 0.55;
    const det = 0.12 + rnd() * 0.1;
    for (let i = s0; i < s1; i++) {
      const t = (i - s0) / SR, len = (s1 - s0) / SR;
      const env = Math.min(1, t / 2.5) * Math.min(1, (len - t) / 3);
      // jemné tremolo píšťal: fáze s integrovaným vibratem (ne f·vib·t, to by tón ujížděl)
      const tv = t + 0.0015 / (2 * Math.PI * 4.8) * (1 - Math.cos(2 * Math.PI * 4.8 * t));
      let s = 0;
      for (const [h, a] of HARM) {
        const fh = f * h;
        s += a * (Math.sin(2 * Math.PI * fh * tv) + Math.sin(2 * Math.PI * (fh + det * h) * tv + ni)) * 0.5;
      }
      pad[i] += s * env * vol;
    }
  });
}
// měkčí zvuk (jednopólový low-pass) a pomalé „dýchání“
let lp = 0;
const a = Math.exp(-2 * Math.PI * 1400 / SR);
for (let i = 0; i < N; i++) {
  lp = (1 - a) * pad[i] + a * lp;
  const t = i / SR;
  const breathe = 0.85 + 0.15 * Math.sin(2 * Math.PI * t / 13);
  const fadeIn = Math.min(1, Math.max(0, (t - ORGAN_START) / 5));
  out[i] += lp * breathe * fadeIn * dB(-23);
}

// ---------- zvony ----------
const bells = new Float32Array(N);
// úvodní vyzvánění: dva zvony střídavě
const BIG = 196, SMALL = 262; // nominály (G3, C4)
[[0.2, BIG, 1], [1.6, SMALL, 0.75], [3.0, BIG, 0.9], [4.4, SMALL, 0.65], [5.9, BIG, 0.7]]
  .forEach(([t, f, g]) => bell(bells, t, f, g));
// vzdálené údery pod modlitbou (tiché, delší doznění)
for (let t = 22; t < DUR - 14; t += 20 + rnd() * 4) bell(bells, t, BIG, 0.16, 1.2);
// závěrečný úder
bell(bells, DUR - 12, BIG, 0.3, 1.3);

// ---------- dozvuk (Schroeder: 4 hřebenové + 2 allpass filtry) ----------
function reverb(x, mix) {
  const y = new Float32Array(x.length);
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0, fb: 0.84, lp: 0 }));
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (const c of combs) {
      const o = c.buf[c.i];
      c.lp = o * 0.7 + c.lp * 0.3;
      c.buf[c.i] = x[n] + c.lp * c.fb;
      c.i = (c.i + 1) % c.d; s += o;
    }
    y[n] = s / 4;
  }
  for (const d of [225, 556]) {
    const buf = new Float32Array(d); let i = 0;
    for (let n = 0; n < y.length; n++) {
      const b = buf[i], v = y[n] + b * 0.5;
      buf[i] = v; y[n] = b - v * 0.5; i = (i + 1) % d;
    }
  }
  for (let n = 0; n < x.length; n++) y[n] = x[n] * (1 - mix) + y[n] * mix * 2.2;
  return y;
}
const bellsWet = reverb(bells, 0.45);
for (let i = 0; i < N; i++) out[i] += bellsWet[i] * dB(-7);
const outWet = reverb(out.map((v, i) => v - bellsWet[i] * dB(-7)), 0.3); // jemný prostor i pro varhany
for (let i = 0; i < N; i++) out[i] = outWet[i] + bellsWet[i] * dB(-7);

// konec: posledních 6 s pozvolna dozní
for (let i = 0; i < N; i++) {
  const t = i / SR;
  if (t > DUR - 6) out[i] *= (DUR - t) / 6;
}
// normalizace špičky na -3 dBFS
let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
const g = dB(-3) / peak;

const pcm = Buffer.alloc(44 + N * 2);
pcm.write("RIFF", 0); pcm.writeUInt32LE(36 + N * 2, 4); pcm.write("WAVEfmt ", 8);
pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(1, 22);
pcm.writeUInt32LE(SR, 24); pcm.writeUInt32LE(SR * 2, 28); pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
pcm.write("data", 36); pcm.writeUInt32LE(N * 2, 40);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(out[i] * g * 32767))), 44 + i * 2);

const dir = new URL("../audio/racice/", import.meta.url);
mkdirSync(dir, { recursive: true });
const wav = new URL("zvony-modlitba.wav", dir).pathname, mp3 = new URL("zvony-modlitba.mp3", dir).pathname;
writeFileSync(wav, pcm);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", wav, "-ac", "1", "-b:a", "80k", mp3]);
unlinkSync(wav);
console.log("Hotovo:", mp3);
