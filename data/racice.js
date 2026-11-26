/*
 * Obsah okruhu Račice-Pístovice.
 * Zdroj: pribeh_racice.txt (sdílená složka projektu).
 *
 * Souřadnice (WGS84, [lat, lng]):
 *  - body 2, 3, 7, 8: definiční body budov z RÚIAN podle čísla popisného (přes regiony.kurzy.cz),
 *  - body 5, 6: souřadnice z podkladů (pribeh_racice.txt),
 *  - body 1 (hospoda) a 4 (kříž): z trasy na mapy.com, kterou připravil Vojta
 *    (ta potvrzuje i body 2, 3, 5–8 s odchylkou do 5 m).
 * Dolaďte je v aplikaci: Nastavení → Režim úprav bodů → přetáhněte značky → Zkopírovat souřadnice.
 *
 * Úkolem na každém stanovišti je minihra (hra: { typ, … }, viz js/hry.js). Otázky s možnostmi už hra nemá,
 * ale kód je pořád umí (otazka, moznosti, answer, napoveda), kdyby se k nim někdy vracelo.
 * foto (nepovinné): fotka místa nahoře na stanovišti, např. foto: { src: "img/racice/1.jpg", autor: "Vojta" }.
 *   Používejte vlastní fotky nebo fotky s volnou licencí (ne snímky ze Street View, ty podmínky Googlu nedovolují ukládat).
 */
window.PD_OBCE = window.PD_OBCE || [];
window.PD_OBCE.push({
  id: "racice-pistovice",
  nazev: "Račice-Pístovice",
  okres: "Vyškov",
  zapletka: "Proč se v roce 1960 sloučily Račice a Pístovice? Úředně kvůli „efektivitě správy“. Ve skutečnosti za tím stojí zapomenuté příběhy z roku 1958, po kterých obě obce prostě neměly na vybranou…",
  delka: "2,5 km",
  cas: "cca 90 minut",
  narocnost: "rodinná",
  stred: [49.2793, 16.8758],
  radius: 35, // metrů – kdy se stanoviště odemkne
  body: [
    {
      id: 1,
      nazev: "Hospoda U Pastorku",
      ilustrace: { obrazek: "img/racice/1-koza.svg", popis: "Koza hostinského se pase u plotu za hospodou" },
      adresa: "Račice 37",
      pozice: [49.276466, 16.872248], // z Vojtovy trasy na mapy.com
      priblizne: false,
      text: [
        "Otevíráme obecní kroniku Račic na létě roku 1958. Právě tady začínají události, které o dva roky později vedly ke sloučení Račic a Pístovic.",
        "Všechno začalo docela nevinně. Svítilo slunce a ve vsi byl klid. Jen koza hostinského se u plotu za hospodou přejedla kopřiv. Nateklo jí vemeno a mléko v něm zhořklo.",
        "Vinou hospodářské neobratnosti to hořké mléko přesto skončilo v bramborové kaši. A ta se ten den podávala k oblíbené uzené krkovici. Oběd byl rázem nepoživatelný. Někteří hosté si stěžovali hned. Jiní neodolali vůni uzeného a ozvali se až po výplachu žaludku.",
        "Na místo dorazil okresní hygienik. Mával protokolem a hrozil všem okolo. Nakonec si jako polehčující okolnost nechal do ešusu nabrat čtyři poctivé plátky krkovice a pořádnou dávku okurkového salátu. Kaši si nevzal."
      ],
      // minihra místo otázky (js/app.js → dojeni)
      hra: {
        typ: "dojeni",
        klepnuti: 8,
        // skutečné zamečení: „Single Goat Bleating 2x“ od Kinoton, Freesound, CC0 (viz audio/racice/LICENSE.md)
        meceni: ["audio/racice/koza-1.mp3", "audio/racice/koza-2.mp3"],
        nadpis: "Pomoz koze od bolesti",
        zadani: "Koze po kopřivách nateklo vemeno a bolí ji. Podoj ji do vědra: klepej vždycky na ten struk, který svítí žlutě. Když se spleteš, koza ucukne a kus mléka vyšplíchne.",
        hotovo: "Koze se ulevilo a vědro je plné. Jenže mléko je hořké… a teď už víš, kam se to vědro nakonec dostalo."
      },
    },
    {
      id: 2,
      nazev: "Hasičská zbrojnice",
      ilustrace: { obrazek: "img/racice/2-zbrojnice.svg", popis: "Hasičská zbrojnice napojená hadicí na pivní sud", mezi: [{ po: 0, src: "img/racice/2-pullitr.svg", popis: "Půllitr napojený na hasičskou hadici" }] },
      adresa: "Račice 296",
      pozice: [49.277029, 16.871080], // RÚIAN, čp. 296 (sídlo SDH Račice)
      priblizne: false,
      text: [
        "Kvůli hygienickým patáliím se nedoporučovalo, aby hasiči měli odpolední schůzi v hostinci. Přesunuli se tedy do nedaleké hasičárny. Aby neměli žízeň, propojili výčep se zbrojnicí hasičskou hadicí a cestou pivo chladili v nádrži s vodou. Náčelník to zařízení prohlásil za největší technické dílo v obci od zavedení rozhlasu.",
        "Později se rozhořel spor, jestli dobře vychlazená desítka uhasí oheň stejně spolehlivě jako žízeň. Chlapi se vsadili a hned to šli vyzkoušet."
      ],
      // minihra (js/hry.js → haseni), syčení hadice: audio/racice/hadice.mp3
      hra: {
        typ: "haseni",
        nadpis: "Uhas hasičárnu pivem",
        zadani: "Hasičárna hoří! Klepej na plameny a stříkej na ně pivo z hadice. Pozor: neuhašený plamen přeskočí na vedlejší okno a piva v sudu moc není.",
        hotovo: "Uhašeno! Sud je prázdný, hasičárna ohořelá a sázka nerozhodnutá. Opravu si chlapi zaplatili ze svého a rok opravy vytesali do zdi, aby nezapomněli, že pivo je jen k pití. Rozhlédni se po něm venku.",
        zvuk: "audio/racice/hadice.mp3"
      }
    },
    {
      id: 3,
      nazev: "Mateřská škola",
      // predtim: bílá školka s kaší a nápisem NA KAŠI ZÁLEŽÍ, ukazuje se, dokud hráč úkol nesplní
      ilustrace: { obrazek: "img/racice/3-skolka.svg", predtim: "img/racice/3-skolka-bila.svg", popis: "Žlutá školka s nápisem NAŠÍ MLÁDEŽI", mezi: [{ po: 1, src: "img/racice/3-kybl.svg", popis: "Převržený kýbl s kaší" }] },
      adresa: "Račice 170",
      pozice: [49.279924, 16.873720], // RÚIAN, čp. 170 (sídlo MŠ Račice-Pístovice)
      priblizne: false,
      text: [
        "Náčelník hasičů měl toho dne plné ruce práce. Hlídal tlak v hadici, teplotu v chladicí nádrži a kontroloval, jestli pivo teče od výčepu až do hasičárny. Kvůli tomu úplně zapomněl vyzvednout syna ze školky.",
        "Chlapec zrovna prožíval období vzdoru. Čekal sám a nudil se. A tak ze vzdoru kopl do kýble, ve kterém od oběda stála hořká bramborová kaše z hostince.",
        "Kaše se rozprskla po zdech, oknech i dveřích. Bílá školka byla během chvíle celá flekatá.",
        "Starostliví rodiče se postavili za stravování svých dětí. Na protest přestali chodit na sběr hluchavek. Ti odvážnější v noci namalovali na štít školky velký červený nápis: Na kaši záleží!",
        "Ráno poslal národní výbor malíře, ať ostudu co nejrychleji napraví. Měl setřít kaši ze zdí a celou školku přetřít na žluto, aby se fleky ztratily. Upravil i nápis: z „Na kaši záleží“ bylo rázem „Naší mládeži“."
      ],
      // minihra (js/hry.js → kase): stírání kaše a přemalování na žluto, zvuk audio/racice/umyvani.mp3
      hra: {
        typ: "kase",
        nadpis: "Umyj a přemaluj školku",
        zadani: "Teď jsi malíř na lešení ty. Přejížděj prstem po školce: setřeš kaši a rovnou natřeš zdi na žluto. Jenže ten kluk v období vzdoru má vzteku pořád dost: když vykoukne s kýblem, klepni na něj, ať dá chvíli pokoj. Nové fleky kaše musíš setřít znovu.",
        hotovo: "Hotovo! Školka je žlutá jako kaše a na štítu svítí „NAŠÍ MLÁDEŽI“. Zní to skoro stejně, ne? Rodiče mávli rukou a nápis tam vydržel dodnes.",
        zvuk: "audio/racice/umyvani.mp3"
      }
    },
    {
      id: 4,
      nazev: "Památný kříž",
      ilustrace: { obrazek: "img/racice/4-kriz.svg", popis: "Památný kříž se svíčkou", mezi: [] },
      adresa: "Račice 312",
      pozice: [49.282868, 16.877889], // z Vojtovy trasy na mapy.com
      priblizne: false,
      typ: "modlitba",
      text: [
        "Zastav se u kříže, zapal svíčku a pusť si nahrávku modlitby."
      ],
      // nejdřív svíčka (škrtnutí sirky: audio/racice/sirka.mp3), pak se odemkne modlitba
      hra: {
        typ: "svicka",
        pred: true,
        nadpis: "Zapal svíčku",
        zadani: "U kříže se nejdřív zapaluje svíčka. Polož prst na obrázek, tím vezmeš sirku. Švihni s ní přes hnědé škrtátko na krabičce a hořící ji dones ke knotu. Když se zvedne vítr, schovej sirku do skleničky.",
        hotovo: "Svíčka hoří. Teď si v klidu pusť modlitbu.",
        zvuk: "audio/racice/sirka.mp3"
      },
      // sloky modlitby (každá sloka = pole řádků); mezi slokami je při předčítání pauza
      modlitba: [
        ["Pane,", "stojíme na místě, kde se člověk zastaví,", "když neví, kudy dál."],
        ["Nehledáme viníka,", "protože každému z nás se někdy", "něco nepovedlo."],
        ["Prosíme tě o klid v myšlenkách", "a o rozvahu v činech,", "aby drobné chyby nezanechaly velké stopy."],
        ["Ať si pamatujeme,", "že věci mají své místo,", "čas svůj řád", "a odpovědnost svou váhu."]
      ],
      // zvony a tiché varhany pod modlitbou (vygenerované přes tools/zvony.mjs), hlas nastoupí po úvodním vyzvánění
      podklad: { src: "audio/racice/zvony-modlitba.mp3", uvod: 5 },
      // závěr modlitby (dřív skrytý jako odpověď na otázku), v přepisu je teď celý
      modlitbaKonec: [
        ["Ať nikdo nehasí, co nezapálil,", "nevaří, co sám neochutnal,", "a nestěžuje si jinde než u výčepu."],
        ["Amen."]
      ]
    },
    {
      id: 5,
      nazev: "Fotbalový stadion",
      ilustrace: { obrazek: "img/racice/5-stadion.svg", popis: "Koza u branky a amplion s klubovou hymnou", mezi: [{ po: 1, src: "img/racice/5-amplion.svg", popis: "Amplion zasažený kamenem" }] },
      adresa: "49°16'42.041\"N, 16°52'49.512\"E",
      pozice: [49.278345, 16.880420],
      priblizne: false,
      text: [
        "Zdravotní potíže po obědě, podnapilí hasiči, žlutá školka. Zprávy o chaosu v obci se velmi rychle dostaly na okresní výbor Komunistické strany Československa, který ve snaze zamezit dalším škodám hned následující den vydal zákaz pořádání všech společenských i sportovních akcí. Rozhodnutí se bohužel dotklo i plánovaného fotbalového turnaje.",
        "Správce stadionu to nesl těžce. Na protest nechal celé dopoledne znít klubovou hymnu ve smyčce místním rozhlasem. Obyvatelé tuto odvetnou akci nepřijali s pochopením. Hymna se brzy stala vlezlou a nekonečně otravnou. Důkazem byl neblahý stav několika amplionů po zásazích kamenů.",
        "Situaci po stížnosti nakonec vyřešili přivolaní příslušníci Státní bezpečnosti. Vtrhli do rozhlasovny na stadionu a magnetofonový pásek s hymnou zničili."
      ],
      hymna: {
        src: "audio/racice/hymna-kdo-je-tady-doma.mp3",
        nazev: "Kdo je tady doma?",
        popis: "Tohle zní z amplionů celé dopoledne. Vydržíš aspoň jednou celou?",
        text: [
          ["RA-ČI-CE! (tlesk, tlesk, tlesk)", "RA-ČI-CE! (tlesk, tlesk, tlesk)"],
          ["Kdo je tady doma? – RA-ČI-CE!", "Kdo to dneska vyhraje? – RA-ČI-CE!", "Kdo dá další gól? – RA-ČI-CE!", "A kdo platí rundu? – RA-ČI-CE!"],
          ["Hej, hej, hej – RA-ČI-CE!", "Hej, hej, hej – RA-ČI-CE!", "Ole, ole, ole, ole – RA-ČI-CE!"],
          ["Ještě jednou! – RA-ČI-CE!", "Ještě jednou! – RA-ČI-CE!", "RA-ČI-CE!"]
        ]
      },
      // minihra (js/hry.js → amplion): kamenem umlčet tři ampliony, z nich hraje hymna
      hra: {
        typ: "amplion",
        nadpis: "Umlč ampliony",
        zadani: "Hymna hraje už celé dopoledne a nikdo to nevydrží. Táhni prstem nahoru směrem k amplionu a pusť: čím delší tah, tím dál kámen doletí. Trefuj trychtýře.",
        hotovo: "Ticho! Všechny tři ampliony jsou zmlklé a pomačkané. Sousedé za plotem tleskají. Hymnu si můžeš pustit výš, když to vydržíš.",
        zvuk: "audio/racice/hymna-kdo-je-tady-doma.mp3"
      }
    },
    {
      id: 6,
      nazev: "Sochy sv. Floriána a Vendelína",
      ilustrace: { obrazek: "img/racice/6-florian.svg", popis: "Socha sv. Floriána v gumácích", mezi: [{ po: 0, src: "img/racice/6-moskvic.svg", popis: "Moskvič 402 ve smyku" }] },
      adresa: "49°16'32.743\"N, 16°52'35.467\"E",
      pozice: [49.275762, 16.876519],
      priblizne: false,
      text: [
        "Nacházíme se v místě, kudy projížděla hlídka příslušníků Státní bezpečnosti při zásahu na stadionu. Při rychlé jízdě vozem Moskvič 402 najeli na nezpevněnou krajnici a následným smykem poškodili zdejší sochu sv. Floriána.",
        "Opravy Floriánovy pravé nohy se ochotně ujala amatérská keramička z Pístovic. Po několika pokusech se ale ukázalo, že vymodelovat napuchlý nárt bude nad její síly. Aby zachránila svou řemeslnou pověst, tajně Floriánovi urazila i druhou nohu. Obě původní nohy pak nahradila odlitkem z gumáků svého muže, zaměstnance místního jednotného zemědělského družstva."
      ],
      hra: {
        typ: "gumaky",
        nadpis: "Slep Floriánovi gumák",
        zadani: "Keramička odlila Floriánovi novou nohu z manželovy vysoké holínky. Jenže forma praskla a odlitek se rozsypal na kusy. Slep ho: přetahuj kusy prstem na obrys boty. Každý kus zapadne jen na své místo.",
        hotovo: "Sedí jako ulitý. Svatý Florián je od té doby jediný svatý v gumácích široko daleko."
      }
    },
    {
      id: 7,
      nazev: "Sokolovna",
      ilustrace: { obrazek: "img/racice/7-sokolovna.svg", popis: "Sokolovna", mezi: [{ po: 2, src: "img/racice/7-stany.svg", popis: "Stany na loukách za vsí" }] },
      adresa: "Račice 44",
      pozice: [49.275736, 16.874337], // RÚIAN, čp. 44
      priblizne: false,
      text: [
        "Zatímco keramička u cesty pracovala na Floriánových nohách, roznesla se po kraji mylná fáma, že obec staví sochu k 50. narozeninám slavného rodáka.",
        "V Račicích se totiž narodil olympijský vítěz Alois Hudec a cvičil v místní sokolovně. I k němu se šuškanda o nové soše dostala a zpráva ho potěšila. Při plánované cestě na Moravu pro okurky se proto rozhodl rodnou obec navštívit.",
        "Říkalo se, že má ramena jako Bivoj, který podle pověsti chytil divokého kance za uši, hodil si ho na záda a odnesl na Vyšehrad. To je ale jiný příběh. Mladí muži i ženy se sjížděli z širokého okolí, aby slavného olympionika spatřili. Několik dní s nadějí stanovali na okolních loukách."
      ],
      hra: {
        typ: "kruhy",
        nadpis: "Zacvič sestavu na kruzích",
        zadani: "Alois Hudec vyhrál olympiádu na kruzích. Pomoz mu zacvičit celou sestavu. Pod obrázkem kmitá ručička tachometru: klepni přesně ve chvíli, kdy je v zeleném poli, a Hudec předvede další prvek. Zelené pole se pokaždé posune a zúží.",
        hotovo: "Celá sestava a čistý seskok. Stejně jako v Berlíně v roce 1936: zlatá medaile pro Aloise Hudce. A louky za vsí se plní stany."
      }
    },
    {
      id: 8,
      nazev: "Obecní úřad",
      ilustrace: { obrazek: "img/racice/8-urad.svg", popis: "Místní národní výbor", mezi: [{ po: 0, src: "img/racice/8-kocarky.svg", popis: "Tři kočárky" }] },
      adresa: "Račice 72",
      pozice: [49.275929, 16.872666], // RÚIAN, čp. 72 (oficiální adresa OÚ)
      priblizne: false,
      text: [
        "Ostudu s chybějící sochou se na místním národním výboru pokusili odvrátit příslibem pamětní desky na stěně místní sokolovny. (Ta nakonec přibyla až v roce 1992.) Mnohem větším problémem se ale ukázala výrazně zvýšená očekávání v oblasti porodnosti. Stanování na loukách za vsí při čekání na slavného olympionika mělo totiž nečekané následky: kromě květů pampelišek tu hojně bujela i láska mezi místními. Ukázalo se, že jeden obecní rozpočet na předvoj husákových dětí stačit nebude.",
        "Rozpočtová komise ve svém odborném stanovisku konstatovala, že očekávaný přírůstek obyvatelstva přesahuje únosnou kapacitu jedné obce, zejména v oblasti školských a kojeneckých potřeb.",
        "Úřady tentokrát jednaly s neobvyklou svižností. Okresní národní výbor neprodleně odsouhlasil návrh na sloučení obcí Račice a Pístovice za účelem společného a hospodárného zajištění péče o nastupující generaci. Od roku 1960 jsou obě obce jednou."
      ],
      hra: {
        typ: "vynos",
        nadpis: "Projdi úřední kolečko",
        zadani: "Fronta maminek před jeslemi nemá konce. Dítě se veze na jeřábu: klepni, a pustíš ho na hromadu na střeše jeslí. Čím přesněji ho položíš na to horní, tím rychleji hromada roste (přesná trefa jsou dvojčata). Až jesle prasknou, zatluč hraniční kameny nové obce a výnos orazítkuj a podepiš.",
        hotovo: "Úředně potvrzeno a podepsáno. Od roku 1960 jsou Račice a Pístovice jedna obec."
      },
      konec: true
    }
  ]
});
