# Pravdivé drby – prototyp PWA (okruh Račice-Pístovice)

Mobilní webová hra: mapa s GPS radarem, 8 stanovišť s příběhem, pozorovací úkoly
s nápovědou a „prozradit“, postupně odkrývaná kronika, předčítání nahlas,
závěrečná stránka s hodnocením a návrhem další obce. Postup se ukládá jen v telefonu.

## Technologie a proč

| Část | Volba | Proč |
|---|---|---|
| Aplikace | Čisté HTML + CSS + JavaScript, bez build kroku | Prototyp jde nahrát na jakýkoli statický hosting a upravovat bez nástrojů. Až poroste (víc obcí, administrace), přejít na Vite + TypeScript. |
| Mapa | Leaflet 1.9.4 (přibalený ve `vendor/`) | Malý (40 kB), osvědčený, funguje na všech telefonech. |
| Mapové podklady | OpenStreetMap dlaždice | Zdarma, pro prototyp ideální. **Pro ostrý provoz** buď Mapy.com API (česká turistická mapa, má bezplatný tarif), nebo vlastní balík dlaždic Protomaps/PMTiles pro každou obec, který jde legálně stáhnout offline. Pravidla OSM zakazují hromadné stahování dlaždic předem. |
| Poloha | Geolocation API (`watchPosition`, vysoká přesnost) | Standard prohlížeče, vyžaduje HTTPS. |
| Offline | Service worker (`sw.js`) | Aplikace a obsah trasy se uloží při prvním otevření, prohlédnuté dlaždice se ukládají průběžně (max. 1500). |
| Předčítání | Web Speech API (`speechSynthesis`, cs-CZ) | Funguje bez serveru. Pro hezčí hlas později nahrané MP3 od vypravěče. |
| Data | `data/racice.js` | Jeden soubor na obec. Později JSON z jednoduchého CMS. |

## Spuštění na počítači

```bash
cd pravdivedrby
python3 -m http.server 8080      # nebo: npx serve .
```

Otevřete http://localhost:8080. V **Nastavení → Simulace polohy** se poloha nastavuje klepnutím
do mapy nebo tlačítky „Krok k cíli“ a „Skočit na místo“.

## Vyzkoušení na telefonu v terénu

GPS v prohlížeči funguje jen přes HTTPS. Nejrychlejší cesty:

- **Netlify Drop** (app.netlify.com/drop): přetáhnout složku `pravdive-drby-pwa`, za minutu je adresa.
- **GitHub Pages**: každý push do `main` nasadí hru automaticky (workflow `.github/workflows/pages.yml`),
  adresa je https://ficavv.github.io/pravdivedrby/.

V telefonu pak „Přidat na plochu“ a hra se chová jako aplikace, i offline.

## Fotky stanovišť

Každé stanoviště může mít nahoře fotku místa. Do bodu v `data/racice.js` doplňte
`foto: { src: "img/racice/1.jpg", autor: "jméno" }` a soubor dejte do `img/racice/`.
Bez fotky se ukáže neutrální obrázek domu. Ideální jsou vlastní fotky z trasy
(na šířku, cca 1200 px, do 300 kB); snímky ze Street View použít nejde, podmínky Googlu
jejich ukládání a zobrazování mimo Google mapy nedovolují.

## Nahrávky u stanovišť

Stanoviště může mít přehrávač s nahrávkou: v bodu v `data/racice.js` vyplňte
`hymna: { src: "audio/racice/….mp3", nazev, popis, text: [[řádky sloky], …] }`.
Soubor patří do `audio/racice/` a musí být i v seznamu `SHELL` v `sw.js`, aby hrál offline
(a zvyšte tam `VERSION`). Text se ukáže až po vyřešení úkolu, protože obvykle prozrazuje odpověď.
U stadionu takhle hraje klubová hymna „Kdo je tady doma?“.

## Doladění souřadnic

Přesné souřadnice mají jen **stadion a sochy**. Ostatní body jsou umístěné odhadem.
V Nastavení zapněte **Režim úprav bodů**, přetáhněte značky na správná místa (nejlépe přímo
na místě, s GPS) a tlačítkem **Zkopírovat souřadnice** získáte hodnoty do `data/racice.js`.

## Co v obsahu chybí (hra s tím počítá)

- Bod 2 a 3: neověřená správná odpověď. Hra zatím uzná jakoukoli volbu (`answer: null`).
- Bod 8: závěrečná stránka s fakty je pracovní návrh.
- Bod 4: „nahrávku“ modlitby zatím čte syntetický hlas.

## Jednosouborová ukázka

`node tools/build-ukazka.mjs` vytvoří `dist/ukazka.html` (bez GPS a mapových dlaždic,
se schematickou mapou a zapnutou simulací). Slouží pro rychlý náhled v prohlížeči.

## Struktura

```
index.html              obrazovky (úvod, mapa s radarem, listy stanoviště/kroniky/nastavení)
css/app.css             vzhled (světlé kontrastní téma pro čitelnost na slunci)
js/app.js               herní logika, radar, simulace, kronika, TTS
data/racice.js          obsah okruhu
sw.js, manifest.webmanifest, icons/   PWA
vendor/leaflet/         mapová knihovna
```
