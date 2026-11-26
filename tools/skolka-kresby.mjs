// Dvě podoby školky pro stanoviště 3 a minihru „Umyj a přemaluj školku“.
// Spuštění: node tools/skolka-kresby.mjs
//  - img/racice/3-skolka.svg       dnešní podoba: žlutá školka s nápisem NAŠÍ MLÁDEŽI (odměna, kronika, mapa)
//  - img/racice/3-skolka-bila.svg  na začátku: bílá školka, fleky kaše a protestní nápis NA KAŠI ZÁLEŽÍ
// Skript jde pouštět opakovaně, vychází z 3-skolka.svg a mění jen nápis, barvu zdí a kaši.
import { readFileSync, writeFileSync } from "node:fs";
const R = (p) => new URL("../" + p, import.meta.url);
const P = "kx3skolka-";
const src = readFileSync(R("img/racice/3-skolka.svg"), "utf8");
const NAPIS = /(<text[^>]*>)(NA KAŠI ZÁLEŽÍ|NAŠÍ MLÁDEŽI)(<\/text>)/;
if (!NAPIS.test(src)) throw new Error("V 3-skolka.svg chybí nápis na štítu");

// ---------- žlutá (dnešní) ----------
const zluta = src.replace(NAPIS, "$1NAŠÍ MLÁDEŽI$3");
writeFileSync(R("img/racice/3-skolka.svg"), zluta);
console.log("img/racice/3-skolka.svg", zluta.length, "B");

// ---------- bílá s kaší ----------
// zdi bez žlutého šrafování (zem pod školkou zůstává)
const ZDI = ["M6 140 V62 H64 V140Z", "M136 140 V62 H194 V140Z", "M62 140 V34 H138 V140Z"];
let bila = src.replace(NAPIS, "$1NA KAŠI ZÁLEŽÍ$3");
for (const d of ZDI) {
  const a = `<path d="${d}" fill="url(#${P}yel)"/>`;
  if (!bila.includes(a)) throw new Error("Nenašla se žlutá zeď " + d);
  bila = bila.replace(a, `<path d="${d}" fill="#fbfaf6"/>`);
}
// fleky kaše [x, y, r] na zdech, oknech a dveřích (souřadnice kresby 200 × 150)
const B = [[21, 81, 11], [47, 120, 11], [86, 68, 12], [87, 119, 13], [153, 81, 11], [173, 120, 11], [117, 124, 10],
  [36, 98, 8], [164, 100, 8], [72, 92, 7], [130, 96, 7], [100, 103, 6], [52, 70, 6], [180, 70, 6], [14, 128, 6], [146, 132, 6]];
let seed = 42;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const ln = (d, w) =>
  `<path d="${d}" fill="none" stroke="#2f2c28" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" filter="url(#${P}w1)"/>` +
  `<path d="${d}" fill="none" stroke="#2f2c28" stroke-width="${f1(w * 0.6)}" opacity=".35" stroke-linecap="round" stroke-linejoin="round" filter="url(#${P}w2)"/>`;
function splat(x, y, r) {
  const n = 13, pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2, rr = r * (0.72 + rnd() * 0.45) * (i % 3 === 0 ? 1.18 : 1);
    pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr]);
  }
  let d = "";
  for (let i = 0; i < n; i++) {
    const p0 = pts[i], p1 = pts[(i + 1) % n], m = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    d += (i ? " Q" : "M" + f1((pts[n - 1][0] + p0[0]) / 2) + " " + f1((pts[n - 1][1] + p0[1]) / 2) + " Q") + f1(p0[0]) + " " + f1(p0[1]) + " " + f1(m[0]) + " " + f1(m[1]);
  }
  d += " Z";
  let drips = "", dripLines = ""; // výplň kapek je uzavřená, obrys jen po stranách a dole (navazuje na flek)
  for (let j = 0; j < 2; j++) {
    const dx = x + (j ? 0.35 : -0.3) * r, top = y + r * 0.6, len = 3 + rnd() * r * 0.7, w = 1.2 + rnd() * r * 0.1;
    const open = "M" + f1(dx - w) + " " + f1(top + r * 0.25) + " L" + f1(dx - w) + " " + f1(top + len) + " A" + f1(w) + " " + f1(w) + " 0 0 0 " + f1(dx + w) + " " + f1(top + len) + " L" + f1(dx + w) + " " + f1(top + r * 0.25);
    drips += "M" + f1(dx - w) + " " + f1(top) + open.slice(open.indexOf(" L")) + " Z ";
    dripLines += open + " ";
  }
  let lumps = "";
  for (let j = 0; j < Math.max(2, Math.round(r / 3)); j++) {
    const la = rnd() * Math.PI * 2, lr = rnd() * r * 0.55;
    lumps += `<circle cx="${f1(x + Math.cos(la) * lr)}" cy="${f1(y + Math.sin(la) * lr)}" r="${f1(0.7 + rnd() * r * 0.12)}" fill="#d9a520"/>`;
  }
  return `<path d="${d} ${drips}" fill="#f7e6a4"/>` + lumps + ln(d, 1.1) +
    `<path d="${drips}" fill="#f7e6a4"/>` + ln(dripLines, 0.8); // kapky přes obrys fleku, ať do něj plynule vytékají
}
const kase = '<g class="kase">' + B.map((q) => splat(...q)).join("") + "</g>";
bila = bila.replace(/<\/svg>\s*$/, kase + "</svg>\n");
writeFileSync(R("img/racice/3-skolka-bila.svg"), bila);
console.log("img/racice/3-skolka-bila.svg", bila.length, "B");
