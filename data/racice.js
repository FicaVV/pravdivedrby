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
 * answer: index správné možnosti (0 = A), nebo null = zatím neověřeno (hra přijme jakoukoli odpověď).
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
        "V obecní kronice Račic dnes nalistujeme paměti z léta roku 1958, tedy první zmínky o událostech, které o dva roky později vedly ke sloučení Račic a Pístovic.",
        "Vše začalo docela nevinně. Bylo krásné počasí, slunce svítilo a ve vesnici byl klid. Jenom koza hostinského se u plotu za hospodou tak přejedla kopřiv, že jí nateklo vemeno a mléko v něm zhořklo. Vinou hospodářské neobratnosti se i přesto dostalo do bramborové kaše. Ta se toho dne podávala k oblíbené uzené krkovici. Jídlo díky tomu bylo nepoživatelné. Někteří hosté si stěžovali hned. Jiní neodolali vůni uzeného a s nespokojeností se ozvali až po výplachu žaludku.",
        "Na místo dorazil okresní hygienik. Mával protokolem a hrozil všem okolo. Nakonec si jako polehčující okolnost nechal do ešusu nabrat čtyři poctivé plátky krkovice a pořádnou dávku okurkového salátu."
      ],
      // minihra místo otázky (js/app.js → dojeni)
      hra: {
        typ: "dojeni",
        klepnuti: 5,
        nadpis: "Pomoz koze od bolesti",
        zadani: "Koze po kopřivách nateklo vemeno a bolí ji. Podoj ji do vědra: pětkrát klepni na vemeno.",
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
        "Z důvodu hygienických patálií nebylo doporučeno, aby se odpolední schůze hasičského sboru konala v hostinci. Každý na vsi ale ví, že „schůze“ je jen noblesní označení pro posezení u piva. Není tedy divu, že součástí plánu na provizorní uspořádání schůze v místní hasičárně bylo i propojení výčepu se zbrojnicí hasičskou hadicí. Díky důmyslnému chlazení přes nádrž s vodou bylo toto zařízení náčelníkem označeno za největší technické dílo v obci od zavedení rozhlasu.",
        "Kdyby začalo hořet, mohlo se hasit rovnou pivem."
      ],
      predOtazkou: "U piva se rozhořel spor, zda dokáže dobře vychlazená desítka hasit oheň stejně dobře jako žízeň. Chlapi se vsadili a rozhodli se to hned ověřit. Bez jednoznačného výsledku vypálili část klubovny. Opravu si museli zaplatit sami, a tak rok obnovy vytesali do zdi zbrojnice jako připomínku, že pivo už budou používat pouze k pití.",
      otazka: "Na zdi hasičárny najdi vytesaný rok. Který to je?",
      moznosti: ["1948", "1958", "1968"],
      answer: null, // TODO ověřit na místě
      napoveda: "Číslo je dole hned vedle bílých vrat."
    },
    {
      id: 3,
      nazev: "Mateřská škola",
      ilustrace: { obrazek: "img/racice/3-skolka.svg", popis: "Školka postříkaná žlutou bramborovou kaší", mezi: [{ po: 1, src: "img/racice/3-kybl.svg", popis: "Převržený kýbl s kaší" }] },
      adresa: "Račice 170",
      pozice: [49.279924, 16.873720], // RÚIAN, čp. 170 (sídlo MŠ Račice-Pístovice)
      priblizne: false,
      text: [
        "Náčelník hasičů měl toho dne plné ruce práce. Hlídal tlak v hadici, teplotu v chladicí nádrži a dohlížel na provizorní vedení od výčepu ke zbrojnici. Právě proto zapomněl vyzvednout syna ze školky.",
        "Chlapec zrovna prožíval období vzdoru. Přehlížený a znuděný kopl do kýble, v němž se od oběda povalovala hořká bramborová kaše z hostince.",
        "Kaše se rozprskla po zdech, oknech i dveřích a budova byla během chvíle celá žlutá. Místním se to vlastně docela zalíbilo, a proto je školka žlutá dodnes."
      ],
      predOtazkou: "Starostliví rodiče se rozhodli postavit za stravování svých dětí. Na oplátku začali kolektivně bojkotovat sběr hluchavek. Ti odvážnější se dokonce pod rouškou noci vydali školku označit. Velký červený protestní nápis měl znít „Na kaši záleží“. Bohužel, malíř vysoko na lešení diktát špatně slyšel. Výsledek zněl skoro stejně.",
      otazka: "Najdi na budově, co tam doopravdy stojí.",
      moznosti: ["Našim dětem", "Naší mládeži", "Naší budoucnosti"],
      answer: null, // TODO ověřit na místě
      napoveda: "Nápis je úplně nahoře, v horním patře. Nehledej kaši."
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
        "Zastav se u kříže a pusť si nahrávku modlitby. Pozor, přepis tady na místě končí dřív než nahrávka."
      ],
      // sloky modlitby (každá sloka = pole řádků); mezi slokami je při předčítání pauza
      modlitba: [
        ["Pane,", "stojíme na místě, kde se člověk zastaví,", "když neví, kudy dál."],
        ["Nehledáme viníka,", "protože každému z nás se někdy", "něco nepovedlo."],
        ["Prosíme tě o klid v myšlenkách", "a o rozvahu v činech,", "aby drobné chyby nezanechaly velké stopy."],
        ["Ať si pamatujeme,", "že věci mají své místo,", "čas svůj řád", "a odpovědnost svou váhu."]
      ],
      // zvony a tiché varhany pod modlitbou (vygenerované přes tools/zvony.mjs), hlas nastoupí po úvodním vyzvánění
      podklad: { src: "audio/racice/zvony-modlitba.mp3", uvod: 5 },
      modlitbaKonec: [
        ["Ať nikdo nehasí, co nezapálil,", "nevaří, co sám neochutnal,", "a nestěžuje si jinde než u výčepu."],
        ["Amen."]
      ],
      otazka: "Přepis modlitby končí dřív než nahrávka. Jak nahrávka končí?",
      moznosti: [
        ["Ať nás mine mlha na silnici,", "tužka ať se nezlomí při písemce", "a dopis ať dojde dřív než jeho pisatel."],
        ["Ať nikdo nehasí, co nezapálil,", "nevaří, co sám neochutnal,", "a nestěžuje si jinde než u výčepu."],
        ["Ať nám hodiny jdou správně,", "berní úředník ať je mírný", "a kominík ať přijde dřív než sníh."]
      ],
      answer: 1,
      napoveda: "Přepis končí slovy „svou váhu“. Nahrávka pokračuje ještě jednou slokou. Poslouchej, jestli se v ní mluví o něčem, co jsi dnes slyšel."
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
      otazka: "Poslechni si hymnu. Které slovo v ní zazní nejčastěji?",
      moznosti: ["Hej", "Račice", "Ole"],
      answer: 1,
      napoveda: "Zkus počítat na prstech. Co stadion odpoví pokaždé, když se předzpěvák na něco zeptá?"
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
      otazka: "Sv. Florián je patronem všech hasičů. Čím je patronem druhá socha, sv. Vendelín?",
      moznosti: ["horníků", "pastýřů a dobytka", "hostinských"],
      answer: 1,
      napoveda: "Podívej se na sochu sv. Vendelína. Co nebo koho drží nebo má u nohou?"
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
      otazka: "Dle informací na budově zjisti, kde Alois Hudec zvítězil na olympiádě.",
      moznosti: ["Paříž", "Berlín", "Los Angeles"],
      answer: 1,
      napoveda: "Najdi na budově sokolovny pamětní desku. Text pod zlatým gymnastou říká, kde bratr Alois Hudec zvítězil."
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
      otazka: null,
      konec: true
    }
  ],
  // Závěrečná stránka – PRACOVNÍ NÁVRH, obsah v podkladech zatím chybí.
  fakta: [
    "Račice a Pístovice jsou opravdu jednou obcí od roku 1960.",
    "Alois Hudec, rodák z Račic, vyhrál na olympijských hrách v Berlíně v roce 1936 zlatou medaili na kruzích. Pamětní deska na sokolovně je skutečná.",
    "Koza, hořká kaše, pivní hadice ani gumové nohy sv. Floriána v oficiální kronice nejsou. To ale ještě neznamená, že se nestaly."
  ]
});
