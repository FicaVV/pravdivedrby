/*
 * Osobní kronika okruhu Račice-Pístovice: razítka, schovaná koza, pohlednice.
 * Doplňuje body z data/racice.js podle id (zvlášť, ať se texty a hry dají upravovat nezávisle).
 *
 * razitko:   kresba razítka, které se „bouchne“ do kroniky po dokončení stanoviště
 *            (vyrábí je tools/kronika-kresby.mjs).
 * koza:      kde se v hlavní kresbě stanoviště schovává strakatá koza („Kde je koza?“).
 *            Souřadnice jsou v jednotkách kresby (viewBox 0 0 200 150).
 *            x, y, s: kam a jak velkou kozu (img/racice/koza-schovana.svg, také 200 × 150) vložit;
 *            otoc: zrcadlově (hlavou doprava); orez: [x0, y0, x1, y1] výřez, mimo který je koza „za“ něčím;
 *            jenKlik: [x0, y0, x1, y1] koza už v kresbě je, jen se na ni klepe (bez vkládání).
 *            hlaska: co koza řekne, když ji hráč najde. Nesmí prozradit odpověď na úkol!
 */
(function () {
  var OBEC = (window.PD_OBCE || []).filter(function (o) { return o.id === "racice-pistovice"; })[0];
  if (!OBEC) return;
  var K = {
    1: {
      // dobová listina do kroniky (js/listiny.js); vymyšlená, bez jmen
      listina: {
        nazev: "Protokol okresního hygienika",
        typ: "protokol",
        hlavicka: ["OKRESNÍ HYGIENICKÁ STANICE VE VYŠKOVĚ", "PROTOKOL O MIMOŘÁDNÉ KONTROLE", "provozovny společného stravování"],
        cj: "Č. j. Hyg-1958/0711-K",
        datum: "Račice, 11. července 1958",
        odstavce: [
          { nadpis: "Provozovna", text: "hostinec, Račice č. 37" },
          { nadpis: "Podnět", text: "hromadná nevolnost strávníků po obědě (uzená krkovice, bramborová kaše, okurkový salát)." },
          { nadpis: "Zjištěno", body: [
            "Kaše má hořkou chuť. Původ: kozí mléko z vlastního chovu hostinského.",
            "Koza dle výpovědi „~~sežrala~~ spásla kopřivy u plotu“. Výslech kozy proveden, bez výsledku.",
            "Krkovice bez závad."
          ] },
          { nadpis: "Opatření", text: "kuchyně uzavřena do odvolání. Schůze a slavnosti v sále se nedoporučují." },
          { nadpis: "Zajištěné vzorky", text: "krkovice 4 plátky, salát okurkový 1 porce (ešus). _Vzorky se nevracejí._" }
        ],
        podpisy: ["Hostinský", "Okresní hygienik"],
        razitko: ["OKRESNÍ", "HYGIENICKÁ", "STANICE", "VYŠKOV"],
        skvrny: [[58, 62, 34, 17], [10, 40, 13, 8]],
        kopyto: true
      },
      koza: { jenKlik: [20, 55, 166, 142], hlaska: "Tak to jsem já, koza hostinského. Za všechno můžou kopřivy, ne já! Na dalších zastávkách se ti schovám do kresby. Najdeš mě?" }
    },
    2: {
      koza: { x: 147.6, y: 81.8, s: 0.36, orez: [146, 60, 186.5, 107.6], hlaska: "Pst! Za sudem je chládek a sem tam něco ukápne. Hasit pivem? Já bych radši vodu." }
    },
    3: {
      koza: { x: 99.1, y: 50.6, s: 0.36, orez: [107.6, 54.6, 128.2, 83.6], hlaska: "Z okna školky je nejlepší výhled na tu flekatou spoušť. Já jsem jen dodala mléko, kaši jsem nekopla!" }
    },
    4: {
      koza: { x: 40.7, y: 103.6, s: 0.16, hlaska: "Tady na kopečku je klid. U kříže se nemečí, tak jen šeptám: dobře ti to jde." }
    },
    5: {
      koza: { jenKlik: [92, 70, 170, 142], hlaska: "Tady se neschovávám, tady chytám! Turnaj sice zakázali, ale trénovat se snad smí." }
    },
    6: {
      koza: { x: 60, y: 111.2, s: 0.3, orez: [52, 112, 81, 141], hlaska: "Za podstavcem jsem v bezpečí. Na téhle silnici jezdí Moskviči jako splašení." }
    },
    7: {
      koza: { x: 134.7, y: 96.2, s: 0.3, orez: [141.2, 99.4, 165.2, 127.4], hlaska: "Dveře sokolovny byly otevřené, tak se dívám, jestli tu olympionik zrovna necvičí. Zatím nikde, ale já počkám." }
    },
    8: {
      koza: { x: 119, y: 107.2, s: 0.3, otoc: true, orez: [158.4, 100, 175, 141], hlaska: "Na úřad kozy nesmí, tak koukám zpoza rohu. Razítko by se mi ale taky hodilo." }
    }
  };
  OBEC.body.forEach(function (b) {
    var k = K[b.id]; if (!k) return;
    b.razitko = "img/racice/razitko-" + b.id + ".svg";
    if (k.koza) b.koza = k.koza;
    if (k.listina) b.listina = k.listina;
  });
  OBEC.pohlednice = {
    pozdrav: "Pozdrav z Račic-Pístovic",
    podtitul: "Neoficiální kronika obce, dopsaná vlastní rukou",
    adresa: "ficavv.github.io/pravdivedrby"
  };
})();
