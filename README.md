# Pravdivé drby – prototyp PWA (okruh Račice-Pístovice)

Mobilní webová hra: mapa s GPS radarem, 8 stanovišť s příběhem, pozorovací úkoly
s nápovědou a „prozradit“, postupně odkrývaná kronika, předčítání nahlas,
závěrečná stránka s hodnocením a návrhem další obce. Postup se ukládá jen v telefonu.

## Technologie a proč

| Část | Volba | Proč |
|---|---|---|
| Aplikace | Čisté HTML + CSS + JavaScript, bez build kroku | Prototyp jde nahrát na jakýkoli statický hosting a upravovat bez nástrojů. Až poroste (víc obcí, administrace), přejít na Vite + TypeScript. |
| Mapa | Leaflet 1.9.4 (přibalený ve `vendor/`) | Malý (40 kB), osvědčený, funguje na všech telefonech. |
| Kreslená mapa | Vektorová data z OpenStreetMap (`data/racice-mapa.js`), kreslí je `js/kreslena-mapa.js` | Hlavní mapa hry. Je součástí aplikace, takže funguje bez signálu a bez cizího serveru. |
| Mapové podklady | OpenStreetMap dlaždice (přepínač „Skutečná“) | Zdarma, pro prototyp ideální. **Pro ostrý provoz** buď Mapy.com API (česká turistická mapa, má bezplatný tarif), nebo vlastní balík dlaždic Protomaps/PMTiles pro každou obec, který jde legálně stáhnout offline. Pravidla OSM zakazují hromadné stahování dlaždic předem. |
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

## Předčítání příběhů

Hra čte příběhy dvěma způsoby:

1. **Namluvený vypravěč (doporučeno).** Odstavce jsou předem namluvené neuronovým hlasem
   (Google Cloud Text-to-Speech, záložně Azure Speech) a uložené jako MP3 v `audio/`.
   Zní stejně na všech telefonech a funguje offline (service worker nahrávky stáhne předem).
2. **Hlas telefonu** jako záloha. Hra vybírá nejpřirozenější dostupný český hlas
   (Natural v Edge, Google na Androidu, vylepšená Zuzana na iPhonu). V Nastavení jde hlas
   i rychlost změnit a vyzkoušet.

Jak zapnout namluveného vypravěče (stačí jedna služba, při obou klíčích vyhraje Google):

- **Google (výchozí):** v [Google Cloud Console](https://console.cloud.google.com) zapněte
  **Cloud Text-to-Speech API**, vytvořte API klíč omezený jen na toto API a na GitHubu v
  *Settings → Secrets and variables → Actions* ho uložte jako secret `GOOGLE_TTS_API_KEY`.
  Hlas: variable `GOOGLE_TTS_VOICE` (výchozí `cs-CZ-Chirp3-HD-Charon`).
- **Azure (záloha):** v [Azure portálu](https://portal.azure.com) prostředek **Speech service**
  s úrovní **Free F0**, secret `AZURE_SPEECH_KEY` a variable `AZURE_SPEECH_REGION`
  (např. `swedencentral`). Hlas: variable `AZURE_VOICE` (výchozí `cs-CZ-AntoninNeural`).
  Když jsou nastavené oba klíče, přepnete na Azure variable `TTS_SLUZBA` = `azure`.

Pak *Actions → Namluvit příběhy → Run workflow.* Nahrávky se uloží do `audio/` a web se nasadí.
Se zaškrtnutým „Jen ukázky“ se místo toho první odstavec namluví všemi českými hlasy
a výsledek je ke stažení v detailu běhu (Artifacts → ukazky-hlasu).

Po každé úpravě textů v `data/` se workflow spustí sám a namluví jen změněné odstavce
(stejný text stejným hlasem se nikdy nenamlouvá dvakrát). Po změně hlasu se přegeneruje vše.
Ručně: klíč dejte do souboru `.env` (`GOOGLE_TTS_API_KEY=…`, necommituje se) a spusťte
`node tools/namluvit.mjs` (`--nanecisto` jen spočítá znaky, `--hlasy` vypíše české hlasy,
`--ukazky` namluví ukázky, `--znovu` přegeneruje vše, `--kvota` vypíše spotřebu).

### Hlídání bezplatné kvóty Google

Google dává zdarma 1 000 000 znaků měsíčně, nad to účtuje 30 USD za milion a sám strop nemá.
Proto ho hlídá `tools/namluvit.mjs`:

- Odeslané znaky (Unicode znaky včetně mezer) se počítají v `tools/tts-kvota.json` po měsících
  `RRRR-MM` podle času v Los Angeles (tak účtuje Google). Workflow soubor commituje i po chybě.
- Znaky se připíšou **před** každým voláním API (i za nepovedené pokusy), pod zámkem.
- Nevejde-li se celé namlouvání pod pojistku **950 000**, nezačne vůbec a běh skončí chybou
  „Měsíční limit namlouvání vyčerpán, obnoví se 1. dne příštího měsíce“.
- Nad 800 000 (80 %) se v běhu objeví varování. GitHub o neúspěšném běhu pošle e-mail.
- Přehled (použito / zbývá) je v souhrnu každého běhu workflow, lokálně `node tools/namluvit.mjs --kvota`.
- Text delší než ~4 500 bajtů se dělí na odstavcích nebo větách a MP3 se spojí; při chybách
  429/5xx jsou nejvýš 3 pokusy s prodlevou.

Lokální běhy počítají do stejného souboru, tak změnu `tools/tts-kvota.json` po nich commitněte.
Počítadlo je odhad z naší strany; skutečnou spotřebu ukazuje Google Cloud Console → Billing.

## Minihra u hospody (dojení kozy)

Bod může mít místo otázky `hra: { typ: "dojeni", klepnuti, nadpis, zadani, hotovo, meceni: [mp3…] }`.
Koza je `img/racice/1-dojeni-koza.svg`, vemeno, vědro a mléko kreslí a animuje `js/app.js`.
Při každém klepnutí koza zamečí: náhodně jedna z nahrávek v `meceni`, pokaždé trochu jinou výškou.
Nahrávky kozy jsou CC0 od uživatele Kinoton z Freesound, přehled licencí je v `audio/racice/LICENSE.md`.

## Minihry na ostatních stanovištích

Ostatní minihry jsou v `js/hry.js` (styly v `css/hry.css`), bod je zapne přes `hra: { typ, nadpis, zadani, hotovo }`:

| Stanoviště | `typ` | Co se dělá | Vztah k otázce |
|---|---|---|---|
| Hasičárna | `haseni` | klepáním stříká pivo z hadice na 6 plamenů | před otázkou |
| Školka | `kase` | prstem stírá kaši z 8 oken a dveří | před otázkou |
| Kříž | `svicka` (`pred: true`) | podrží prst na knotu, svíčka se zapálí | před modlitbou i otázkou |
| Stadion | `tleskani` (`tempo`, `tlesknuti`) | tleská do rytmu RA-ČI-CE! | místo otázky |
| Sochy | `gumaky` | přetáhne Floriánovi gumáky na sochu | před otázkou |
| Sokolovna | `kruhy` (`sekund`) | klepáním vlevo/vpravo drží gymnastu v klidu | před otázkou |
| Úřad | `vynos` | orazítkuje 3 vyhotovení a podepíše originál | před poslední kapitolou |

Když má bod i `otazka` (nebo `konec`), zbytek stanoviště se odemkne až po dohrání. Bez otázky hra
úkol nahrazuje. Zvuky se syntetizují ve Web Audio, takže nic dalšího se nestahuje a vše jede offline.
Kresby používají stávající obrázky stanovišť, nové kresby (svíčka, kruhy, výnos) jsou přímo v kódu.

## Nahrávky u stanovišť

Stanoviště může mít přehrávač s nahrávkou: v bodu v `data/racice.js` vyplňte
`hymna: { src: "audio/racice/….mp3", nazev, popis, text: [[řádky sloky], …] }`.
Soubor patří do `audio/racice/` a musí být i v seznamu `SHELL` v `sw.js`, aby hrál offline
(a zvyšte tam `VERSION`). Text se ukáže až po vyřešení úkolu, protože obvykle prozrazuje odpověď.
U stadionu takhle hraje klubová hymna „Kdo je tady doma?“.

### Zvukový podklad pod předčítáním

Bod s modlitbou může mít `podklad: { src: "audio/racice/….mp3", uvod: 5 }`. Po klepnutí na
„Přehrát nahrávku modlitby“ se pustí podklad, hlas (namluvený i hlas telefonu) nastoupí po `uvod`
sekundách a po dočtení se podklad ztlumí a zastaví. U kříže takhle zní zvony, varhany a tichý sbor
s dozvukem kostelní lodi (`audio/racice/zvony-modlitba.mp3`). Zvuk je celý syntetizovaný skriptem
`node tools/zvony.mjs` (potřebuje ffmpeg), takže není cizí nahrávkou a nemá žádná licenční omezení.
Hlasitost je zapečená v souboru (podklad je asi o 10 dB tišší než hlas), protože iPhone nedovolí
měnit hlasitost z webu.

Modlitba a možnosti odpovědi můžou být zapsané po slokách (pole řádků). Mezi slokami je při
předčítání pauza, namluvený vypravěč má každou sloku jako samostatnou nahrávku.

### Předčítání otázek

Každý úkol má tlačítko „Přečíst otázku a možnosti“. Předčítá úvod k otázce, otázku a možnosti
(„Možnost A. …“) s krátkou pauzou mezi nimi. Nahrávky pro ně namluví stejný workflow jako příběhy.

## Kreslená mapa

Hlavní mapa je „kreslená tužkou“: ulice, domy, potoky, pole a louky jsou skutečná data
OpenStreetMap, jen nakreslená ručním stylem. Ušlá část trasy je žlutá, zbytek tečkovaný,
u stanovišť jsou kartičky s kresbou (barevně po splnění, šedě „???“ dokud jsou zamčená;
zamčené se ukážou až po přiblížení). V mapě se pase schovaná koza (klepnutí vyšle událost
`pd:koza`). Přepínač **Kreslená / Skutečná** vpravo nahoře přepne na dlaždice OSM.

- `tools/osm/racice-osm.json` je výřez OSM (API `/api/0.6/map`, okolí trasy, jen potřebné tagy).
- `python3 tools/kreslena-mapa.py` z něj vyrobí `data/racice-mapa.js`: zjednoduší a „rozvlní“ čáry
  (pevné semínko, výstup je stabilní), spočítá pěší trasu po ulicích mezi stanovišti (nejkratší
  cesta, teď 2,4 km) a přidá popisky, místo kozy a umístění kartiček (`stitky`, posun v px).
- Po přesunu stanoviště v `data/racice.js` skript spusťte znovu, ať trasa vede ke správným bodům.

**Licence:** data © přispěvatelé OpenStreetMap pod ODbL 1.0. Kreslená mapa je odvozená databáze,
proto je pod ní v mapě atribuce „Kresba podle dat © přispěvatelé OpenStreetMap (ODbL)“ a soubory
`tools/osm/racice-osm.json` a `data/racice-mapa.js` jsou pod stejnou licencí ODbL.

## Navigace: kompas a stažení na cestu

- **Šipka podle kompasu telefonu.** Na Androidu se kompas zapne sám (`deviceorientationabsolute`),
  na iPhonu je potřeba klepnout na kompas v radaru („Zapnout kompas“) a povolit pohyb a orientaci.
  Pak šipka ukazuje směr vzhledem k tomu, kam je telefon natočený, text říká „rovně / doprava /
  doleva / za tebou“ a modrá tečka na mapě má kužel natočení. Bez kompasu ukazuje šipka podle severu
  jako dřív (písmeno S nahoře).
- **Stáhnout na cestu** (úvod, radar, nastavení). Service worker stáhne celou aplikaci, kresby,
  nahrávky a okolí trasy na skutečné mapě (zoomy 14–17/18, **nejvýš 250 dlaždic**, víc
  [pravidla tile.openstreetmap.org](https://operations.osmfoundation.org/policies/tiles/) pro offline
  použití nedovolují) do samostatné cache `pd-trasa-v1`, která se neprořezává. Kreslená mapa
  je v telefonu vždycky, stažení ji jen pojistí. Hra zároveň požádá o trvalé úložiště
  (`navigator.storage.persist`), ať telefon data nesmaže.

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

## Kresby stanovišť

Stanoviště mají kresby tužkou se žlutou pastelkou (`img/racice/*.svg`). V `data/racice.js` je u bodu
`ilustrace: { obrazek, popis, mezi: [{ po, src, popis }] }`: `obrazek` je široká kresba pod nadpisem
a zároveň „vlepená fotka“ v kronice po dopsání kapitoly, `mezi` jsou menší kresby vložené za odstavec
s indexem `po` (0 = za první odstavec). Nová kresba se musí přidat i do seznamu v `sw.js`, aby fungovala offline.

## Struktura

```
index.html              obrazovky (úvod, mapa s radarem, listy stanoviště/kroniky/nastavení)
css/app.css             vzhled (světlé kontrastní téma pro čitelnost na slunci)
js/app.js               herní logika, radar, simulace, kronika, TTS
data/racice.js          obsah okruhu
data/racice-mapa.js     kreslená mapa (vygenerovaná z OSM, ODbL)
js/kreslena-mapa.js     vykreslení kreslené mapy v Leafletu
tools/kreslena-mapa.py  generátor kreslené mapy z tools/osm/racice-osm.json
img/racice/             kresby stanovišť (SVG)
sw.js, manifest.webmanifest, icons/   PWA
vendor/leaflet/         mapová knihovna
```
