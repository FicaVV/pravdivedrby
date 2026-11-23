// Sestaví jednosouborovou ukázku (pro náhled v claude.ai Artifactu, bez GPS a mapových dlaždic).
// Spuštění: node tools/build-ukazka.mjs  →  dist/ukazka.html
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
const r = (p) => readFileSync(new URL("../" + p, import.meta.url), "utf8");
const html = r("index.html");
const markup = html.split("<!--APP-->")[1].split("<!--/APP-->")[0];
const out = `<title>Pravdivé drby</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible+Next:wght@400;700&family=Bricolage+Grotesque:wght@700;800&display=swap">
<style>
${r("vendor/leaflet/leaflet.css")}
${r("css/app.css")}
</style>
${markup}
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
<script>window.PD_ARTIFACT = true; window.PD_NO_TILES = true;</script>
<script>
${r("data/racice.js")}
</script>
<script>
${r("js/app.js")}
</script>
`;
mkdirSync(new URL("../dist/", import.meta.url), { recursive: true });
writeFileSync(new URL("../dist/ukazka.html", import.meta.url), out);
console.log("dist/ukazka.html", out.length, "B");
