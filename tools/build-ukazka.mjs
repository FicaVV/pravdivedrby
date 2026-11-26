// Sestaví jednosouborovou ukázku (pro náhled v claude.ai Artifactu, bez GPS a mapových dlaždic).
// Spuštění: node tools/build-ukazka.mjs  →  dist/ukazka.html
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = r("index.html");
// kresby vložit jako data URI, ať ukázka funguje jako jeden soubor
const img = {};
for (const f of readdirSync(new URL("../img/racice/", import.meta.url))) {
  if (f.endsWith(".svg")) img["img/racice/" + f] = "data:image/svg+xml;base64," + Buffer.from(r("img/racice/" + f)).toString("base64");
}
const markup = html.split("<!--APP-->")[1].split("<!--/APP-->")[0];
const out = `<title>Pravdivé drby</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Fraunces:opsz,wght@9..144,800;9..144,900&family=Caveat:wght@600;700&display=swap">
<style>
${r("vendor/leaflet/leaflet.css")}
${r("css/app.css")}
</style>
${markup}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>window.PD_ARTIFACT = true; window.PD_NO_TILES = true; window.PD_IMG = ${JSON.stringify(img)};</script>
<script>
${r("data/racice.js")}
${r("data/racice-mapa.js")}
${r("js/kreslena-mapa.js")}
</script>
<script>
${r("js/app.js")}
</script>
`;
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/ukazka.html", import.meta.url), out);
console.log("dist/ukazka.html", out.length, "B");
