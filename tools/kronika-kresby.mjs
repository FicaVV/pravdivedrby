// Vyrobí kresby pro osobní kroniku: razítka stanovišť a průhlednou kozu na schovávání do kreseb.
// Spuštění: node tools/kronika-kresby.mjs
//  - img/racice/razitko-1.svg … razitko-8.svg  razítko „Zapsáno“ v tužce se žlutou (ikony z ilustrace-navrh/razitko-*.svg)
//  - img/racice/koza-schovana.svg              strakatá koza z 1-dojeni-koza.svg bez papíru a trávy
import { readFileSync, writeFileSync } from "node:fs";
const R = (p) => new URL("../" + p, import.meta.url);

// ---------- koza bez pozadí ----------
{
  const src = readFileSync(R("img/racice/1-dojeni-koza.svg"), "utf8");
  const head = src.slice(0, src.indexOf("</defs>") + 7);
  const body = src.slice(src.indexOf("</defs>") + 7).replace(/<\/svg>\s*$/, "");
  // prvky nejvyšší úrovně (cesty, skupiny, clipPath)
  const parts = [];
  for (let i = 0, depth = 0, start = 0; i < body.length; i++) {
    if (body[i] !== "<") continue;
    const end = body.indexOf(">", i), tag = body.slice(i, end + 1);
    if (tag.startsWith("</")) depth--;
    else { if (depth === 0) start = i; if (!tag.endsWith("/>")) depth++; }
    if (depth === 0 && !tag.startsWith("<metadata")) parts.push(body.slice(start, end + 1));
    i = end;
  }
  // první 4 = papír a žlutá tráva, poslední 4 = čára země a stébla
  const goat = parts.slice(4, parts.length - 4).join("");
  const out = (head + goat + "</svg>\n").replace(/djk-/g, "kzs-");
  writeFileSync(R("img/racice/koza-schovana.svg"), out);
  console.log("img/racice/koza-schovana.svg", out.length, "B");
}

// ---------- razítka ----------
// Ikony stanovišť (souřadnice 0–120 × 0–90), převzaté z ilustrace-navrh/razitko-*.svg.
// Barvy: Y = žlutá pastelka, I = tužka (inkoust razítka)
const ICONS = {
  1: `<path d="M14 80 L106 80"/><path d="M22 80 L22 42 L48 22 L74 42 L74 80"/><path d="M18 45 L48 20 L78 45"/><rect x="40" y="56" width="16" height="24" rx="1" fill="Y"/><path d="M53 68 L54 68"/><rect x="27" y="48" width="10" height="10"/><path d="M32 48 V58 M27 53 H37"/><rect x="59" y="48" width="10" height="10"/><path d="M64 48 V58 M59 53 H69"/><path d="M74 50 L88 50 M80 50 V54 M86 50 V54"/><rect x="76" y="54" width="14" height="14" rx="2" fill="Y"/><path d="M80 58 V65 H85 V58 M85 60 H87 V63 H85"/><path d="M92 80 V64 M100 80 V64 M106 80 V64 M90 69 H108 M90 75 H108"/><path d="M96 80 C95 75 93 73 91 72 M96 80 C97 76 99 74 101 73 M96 76 C95 72 96 70 97 68"/>`,
  2: `<path d="M10 80 H110"/><path d="M18 36 H44 V74 C44 77 42 79 39 79 H23 C20 79 18 77 18 74Z" fill="Y"/><path d="M18 36 C16 30 21 26 25 28 C26 23 33 22 35 27 C38 23 45 25 44 31 C47 32 46 37 44 36" fill="#fffdf6"/><path d="M44 44 H50 C53 44 54 46 54 49 V62 C54 65 53 67 50 67 H44"/><path d="M25 48 V70 M31 48 V70 M37 48 V70" stroke-width="1.6"/><path d="M31 79 C31 86 46 86 58 82 C72 77 64 60 72 54 C79 49 86 54 88 46"/><path d="M84 46 L96 34 L100 38 L88 50Z" fill="none"/><path d="M98 32 L102 28 M102 36 L106 32"/><path d="M104 26 C106 22 107 19 106 15 M109 31 C113 29 115 27 117 24 M107 29 C110 24 112 21 112 17" stroke-width="1.6"/>`,
  3: `<path d="M8 80 H112"/><path d="M60 14 C66 8 76 12 74 20 C82 18 88 26 82 31 C90 34 88 46 78 44 C78 52 68 54 64 48 C58 54 48 50 50 42 C42 42 40 32 48 30 C44 22 52 14 60 14Z" fill="Y"/><circle cx="94" cy="20" r="3.5" fill="Y"/><circle cx="38" cy="22" r="2.5" fill="Y"/><circle cx="96" cy="44" r="2.2" fill="Y"/><circle cx="34" cy="48" r="3" fill="Y"/><path d="M22 58 L52 70 L46 82 L20 72 C16 70 18 60 22 58Z" fill="none"/><ellipse cx="50" cy="76" rx="4" ry="7" transform="rotate(22 50 76)" fill="Y"/><path d="M26 60 C28 52 40 50 44 64"/><path d="M56 80 C62 78 66 80 72 79" stroke="Y" stroke-width="5"/>`,
  4: `<path d="M14 82 H106"/><path d="M44 82 V70 H76 V82"/><path d="M48 70 V62 H72 V70"/><path d="M56 62 V30 H46 V22 H56 V10 H64 V22 H74 V30 H64 V62Z" fill="none"/><path d="M57 38 L63 38 M57 44 H63" stroke-width="1.6"/><rect x="82" y="70" width="8" height="12" rx="1" fill="Y"/><path d="M86 70 V66"/><path d="M86 66 C84 62 86 59 86 57 C88 60 89 63 86 66Z" fill="Y"/><path d="M26 82 C25 77 22 75 20 74 M26 82 C27 77 30 75 32 75 M26 79 V72"/><path d="M84 24 C88 28 88 34 84 38 M90 20 C96 26 96 36 90 42" stroke-width="2"/><path d="M36 24 C32 28 32 34 36 38 M30 20 C24 26 24 36 30 42" stroke-width="2"/>`,
  5: `<path d="M6 82 H114"/><path d="M14 82 V24 H84 V82" stroke-width="3"/><path d="M14 24 L24 34 H74 L84 24 M24 34 V82 M74 34 V82"/><path d="M34 34 V82 M44 34 V82 M54 34 V82 M64 34 V82 M24 46 H74 M24 58 H74 M24 70 H74" stroke-width="1.2"/><circle cx="98" cy="72" r="9" fill="Y"/><path d="M98 67 L102 70 L100 75 H96 L94 70Z" fill="I" stroke-width="1"/><path d="M98 63 V67 M102 70 L106 69 M100 75 L102 79 M96 75 L93 79 M94 70 L90 68" stroke-width="1.4"/>`,
  6: `<path d="M8 82 H112"/><path d="M40 82 V66 H80 V82"/><path d="M36 66 H84"/><path d="M54 66 L52 50 M66 66 L66 50"/><path d="M62 56 H70 M62 60 H70 M62 64 H70" stroke="Y" stroke-width="3"/><path d="M50 50 C48 40 50 30 54 26 H66 C70 30 72 40 70 50Z" fill="none"/><circle cx="60" cy="18" r="7" fill="none"/><circle cx="60" cy="18" r="11" stroke="Y" stroke-width="3"/><path d="M70 32 L78 24 M76 22 L82 28"/><path d="M6 76 C20 72 26 78 36 74" stroke-width="1.6" stroke-dasharray="3 4"/><path d="M90 76 C96 70 104 74 112 70" stroke-width="1.6" stroke-dasharray="3 4"/>`,
  7: `<path d="M8 82 H112"/><path d="M20 50 H100" stroke-width="3.5"/><rect x="14" y="36" width="10" height="28" rx="3" fill="Y"/><rect x="96" y="36" width="10" height="28" rx="3" fill="Y"/><rect x="26" y="40" width="6" height="20" rx="2" fill="none"/><rect x="88" y="40" width="6" height="20" rx="2" fill="none"/><path d="M30 8 H90" stroke-width="3"/><path d="M48 8 V24 M72 8 V24"/><circle cx="48" cy="31" r="7" fill="none"/><circle cx="72" cy="31" r="7" fill="none"/><path d="M30 76 H90 M40 76 V82 M80 76 V82"/>`,
  8: `<path d="M8 82 H112"/><path d="M18 70 H62 L58 78 H22Z" fill="none"/><path d="M30 70 V58 H50 V70"/><rect x="34" y="40" width="12" height="18" rx="5" fill="Y"/><path d="M66 66 C66 80 102 80 102 66Z" fill="none"/><path d="M66 66 C66 54 80 50 86 56"/><path d="M70 78 C72 84 80 84 84 80 M88 80 C92 84 100 84 100 78"/><circle cx="80" cy="62" r="4" fill="none"/><path d="M76 24 C76 20 82 19 82 24 C82 19 88 20 88 24 C88 28 82 32 82 32 C82 32 76 28 76 24Z" fill="Y"/>`
};
const INK = "#2f2c28", YEL = "#f5c400";
const TILT = { 1: -8, 2: 6, 3: -4, 4: 9, 5: -10, 6: 3, 7: -6, 8: 7 };

for (const [n, ico] of Object.entries(ICONS)) {
  const id = "rz" + n;
  const icon = ico.replace(/"Y"/g, `"${YEL}"`).replace(/"I"/g, `"${INK}"`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<defs>
<filter id="${id}-ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="1" seed="${n * 7}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.2 1.55"/><feComposite in="SourceGraphic" operator="in"/></filter>
<filter id="${id}-wob"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="${n}"/><feDisplacementMap in="SourceGraphic" scale="1.6"/></filter>
<pattern id="${id}-yel" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(${30 + n * 3})"><path d="M0 0 V3" stroke="#f0b800" stroke-width="1.7"/></pattern>
<path id="${id}-a" d="M20 60 A40 40 0 0 1 100 60"/>
<path id="${id}-b" d="M24 64 A36 36 0 0 0 96 64"/>
</defs>
<g transform="rotate(${TILT[n]} 60 60)">
<circle cx="60" cy="60" r="53" fill="url(#${id}-yel)" opacity=".75" filter="url(#${id}-wob)"/>
<g filter="url(#${id}-ink)">
<circle cx="60" cy="60" r="56" fill="none" stroke="${INK}" stroke-width="3.6"/>
<circle cx="60" cy="60" r="49" fill="none" stroke="${INK}" stroke-width="1.6"/>
<text font-family="Fraunces, Georgia, 'Times New Roman', serif" font-weight="900" font-size="12" letter-spacing="1.5" fill="${INK}"><textPath href="#${id}-a" startOffset="50%" text-anchor="middle">ZAPSÁNO · ${n}</textPath></text>
<text font-family="Fraunces, Georgia, 'Times New Roman', serif" font-weight="900" font-size="9.5" letter-spacing="1.5" fill="${INK}"><textPath href="#${id}-b" startOffset="50%" text-anchor="middle">NEOFICIÁLNĚ</textPath></text>
<g transform="translate(27 33) scale(.55)" fill="none" stroke="${INK}" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round">${icon}</g>
</g>
</g>
</svg>
`;
  writeFileSync(R(`img/racice/razitko-${n}.svg`), svg);
}
console.log("img/racice/razitko-1…8.svg");
