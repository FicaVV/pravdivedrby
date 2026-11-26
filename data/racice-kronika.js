/*
 * Osobní kronika okruhu Račice-Pístovice: razítka, schovaná koza, zadání rodinné fotky, pohlednice.
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
 * fotoUkol:  zábavné zadání rodinné fotky u stanoviště (nepovinné).
 */
(function () {
  var OBEC = (window.PD_OBCE || []).filter(function (o) { return o.id === "racice-pistovice"; })[0];
  if (!OBEC) return;
  var K = {
    1: {
      koza: { jenKlik: [20, 55, 166, 142], hlaska: "Tak to jsem já, koza hostinského. Za všechno můžou kopřivy, ne já! Na dalších zastávkách se ti schovám do kresby. Najdeš mě?" },
      fotoUkol: "Vyfoťte se jako hosté po obědě: jedna ruka na břiše, v obličeji čistá hrůza."
    },
    2: {
      koza: { x: 147.6, y: 81.8, s: 0.36, orez: [146, 60, 186.5, 107.6], hlaska: "Pst! Za sudem je chládek a sem tam něco ukápne. Hasit pivem? Já bych radši vodu." },
      fotoUkol: "Postavte se do řady jako hasičský sbor a hrdě zvedněte neviditelné půllitry."
    },
    3: {
      koza: { x: 99.1, y: 50.6, s: 0.36, orez: [107.6, 54.6, 128.2, 83.6], hlaska: "Z okna školky je nejlepší výhled na tu žlutou spoušť. Já jsem jen dodala mléko, kaši jsem nekopla!" },
      fotoUkol: "Udělejte obličej jako kluk ve vzdoru, který zrovna kopl do kýble."
    },
    4: {
      koza: { x: 40.7, y: 103.6, s: 0.16, hlaska: "Tady na kopečku je klid. U kříže se nemečí, tak jen šeptám: dobře ti to jde." },
      fotoUkol: "Chvilka ticha: vyfoťte se se sklopenou hlavou, jako když přemýšlíte, kudy dál."
    },
    5: {
      koza: { jenKlik: [92, 70, 170, 142], hlaska: "Tady se neschovávám, tady chytám! Turnaj sice zakázali, ale trénovat se snad smí." },
      fotoUkol: "Zakřičte do foťáku jako fanoušci na tribuně. Hlasitost se nepočítá, výraz ano."
    },
    6: {
      koza: { x: 60, y: 111.2, s: 0.3, orez: [52, 112, 81, 141], hlaska: "Za podstavcem jsem v bezpečí. Na téhle silnici jezdí Moskviči jako splašení." },
      fotoUkol: "Zapózujte jako sv. Florián: jedna ruka nahoře, druhá lije vodu z neviditelného vědra."
    },
    7: {
      koza: { x: 134.7, y: 96.2, s: 0.3, orez: [141.2, 99.4, 165.2, 127.4], hlaska: "Dveře sokolovny byly otevřené, tak se dívám, jestli tu olympionik zrovna necvičí. Zatím nikde, ale já počkám." },
      fotoUkol: "Ukažte svaly jako olympijský vítěz na kruzích. Kdo vydrží nejdéle, vyhrává."
    },
    8: {
      koza: { x: 119, y: 107.2, s: 0.3, otoc: true, orez: [158.4, 100, 175, 141], hlaska: "Na úřad kozy nesmí, tak koukám zpoza rohu. Razítko by se mi ale taky hodilo." },
      fotoUkol: "Poslední fotka do kroniky: celá výprava pohromadě, slavnostně jako při podpisu výnosu."
    }
  };
  OBEC.body.forEach(function (b) {
    var k = K[b.id]; if (!k) return;
    b.razitko = "img/racice/razitko-" + b.id + ".svg";
    if (k.koza) b.koza = k.koza;
    if (k.fotoUkol) b.fotoUkol = k.fotoUkol;
  });
  OBEC.pohlednice = {
    pozdrav: "Pozdrav z Račic-Pístovic",
    podtitul: "Neoficiální kronika obce, dopsaná vlastní rukou",
    adresa: "ficavv.github.io/pravdivedrby"
  };
})();
