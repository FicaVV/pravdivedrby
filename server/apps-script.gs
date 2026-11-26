/**
 * Hravý kronikář – příjem hodnocení, návrhů obcí a anonymních statistik.
 *
 * Běží jako Google Apps Script webová aplikace nad jednou Google tabulkou.
 * Zdarma, bez serveru, data zůstávají ve vašem Google Disku.
 * Apps Script IP adresu hráče vůbec nevidí, žádné cookies se nenastavují.
 *
 * Nastavení (jednou, asi 5 minut) je popsané v README v části
 * „Hodnocení, návrhy a statistiky“.
 */

var LISTY = {
  udalost: { nazev: "Statistiky", sloupce: ["přijato", "den", "obec", "verze", "událost", "stanoviště", "pořadí", "nápověda", "prozrazeno", "chyby", "minut", "bez nápovědy", "stanovišť"] },
  hodnoceni: { nazev: "Hodnocení", sloupce: ["přijato", "den", "obec", "verze", "hvězdy"] },
  navrh: { nazev: "Návrhy obcí", sloupce: ["přijato", "den", "obec hry", "verze", "navržená obec", "co se tam šušká", "e-mail"] }
};
var MAX_POLOZEK = 50;

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var data = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    var polozky = Array.isArray(data.polozky) ? data.polozky.slice(0, MAX_POLOZEK) : [];
    var verze = txt(data.verze, 20);
    var radky = { udalost: [], hodnoceni: [], navrh: [] };
    var ted = new Date();

    polozky.forEach(function (p) {
      if (!p || !radky[p.typ]) return;
      var den = /^\d{4}-\d{2}-\d{2}$/.test(p.den) ? p.den : "";
      var obec = txt(p.obec, 40);
      if (p.typ === "udalost") {
        if (["start", "stanoviste", "konec"].indexOf(p.nazev) === -1) return;
        radky.udalost.push([ted, den, obec, verze, p.nazev, (typeof p.stanoviste === "number" ? p.stanoviste : txt(p.stanoviste, 10)), num(p.poradi), bool(p.napoveda), bool(p.prozrazeno), num(p.chyby), num(p.minut), num(p.bezNapovedy), num(p.stanovist)]);
      } else if (p.typ === "hodnoceni") {
        var h = num(p.hvezdy);
        if (h >= 1 && h <= 5) radky.hodnoceni.push([ted, den, obec, verze, h]);
      } else if (p.typ === "navrh") {
        var nazev = txt(p.navrhObec, 120);
        if (nazev) radky.navrh.push([ted, den, obec, verze, nazev, txt(p.drb, 2000), txt(p.mail, 120)]);
      }
    });

    lock.waitLock(10000);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    Object.keys(radky).forEach(function (typ) {
      var r = radky[typ];
      if (!r.length) return;
      var sh = list(ss, typ);
      sh.getRange(sh.getLastRow() + 1, 1, r.length, r[0].length).setValues(r);
    });
    if (radky.navrh.length) upozornit(radky.navrh);
    return json({ ok: true, prijato: polozky.length });
  } catch (err) {
    return json({ ok: false, chyba: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) { /* nebyl zamčený */ }
  }
}

/** Otevření adresy v prohlížeči jen ověří, že skript běží. */
function doGet() { return json({ ok: true, sluzba: "pravdive-drby" }); }

/** Spusťte jednou ručně (Spustit → pripravit): založí listy a souhrn. */
function pripravit() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(LISTY).forEach(function (typ) { list(ss, typ); });
  var s = ss.getSheetByName("Souhrn") || ss.insertSheet("Souhrn", 0);
  s.clear();
  s.getRange("A1:B9").setValues([
    ["Souhrn (počítá se sám)", ""],
    ["Rozehraných her", '=COUNTIF(Statistiky!E:E,"start")'],
    ["Dohraných her", '=COUNTIF(Statistiky!E:E,"konec")'],
    ["Dohráno z rozehraných", '=IFERROR(B3/B2,"")'],
    ["Průměrná délka hry (min)", '=IFERROR(AVERAGEIF(Statistiky!E:E,"konec",Statistiky!K:K),"")'],
    ["Průměrné hodnocení", '=IFERROR(AVERAGE(\'Hodnocení\'!E2:E),"")'],
    ["Počet hodnocení", "=COUNT('Hodnocení'!E2:E)"],
    ["Návrhů obcí", "=MAX(0,COUNTA('Návrhy obcí'!E:E)-1)"],
    ["", ""]
  ]);
  s.getRange("A11:E11").setValues([["Stanoviště", "Došlo hráčů", "S nápovědou", "Prozrazeno", "Ø chyb"]]);
  var rows = [];
  for (var i = 1; i <= 8; i++) {
    var r = 11 + i;
    rows.push([i,
      '=COUNTIFS(Statistiky!E:E,"stanoviste",Statistiky!F:F,A' + r + ")",
      '=COUNTIFS(Statistiky!E:E,"stanoviste",Statistiky!F:F,A' + r + ",Statistiky!H:H,TRUE)",
      '=COUNTIFS(Statistiky!E:E,"stanoviste",Statistiky!F:F,A' + r + ",Statistiky!I:I,TRUE)",
      '=IFERROR(AVERAGEIFS(Statistiky!J:J,Statistiky!E:E,"stanoviste",Statistiky!F:F,A' + r + '),"")']);
  }
  s.getRange(12, 1, rows.length, 5).setValues(rows);
  s.getRange(12, 5, rows.length, 1).setNumberFormat("0.0");
  s.getRange("B4").setNumberFormat("0%");
  s.getRange("A1").setFontWeight("bold");
  s.getRange("A11:E11").setFontWeight("bold");
  s.autoResizeColumn(1);
}

function list(ss, typ) {
  var d = LISTY[typ];
  var sh = ss.getSheetByName(d.nazev);
  if (!sh) {
    sh = ss.insertSheet(d.nazev);
    sh.getRange(1, 1, 1, d.sloupce.length).setValues([d.sloupce]).setFontWeight("bold");
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Nový návrh obce pošle e-mailem majiteli tabulky (vypnete smazáním řádku níže). */
function upozornit(radky) {
  try {
    var komu = Session.getEffectiveUser().getEmail();
    if (!komu) return;
    var text = radky.map(function (r) { return "Obec: " + r[4] + "\nCo se šušká: " + (r[5] || "–") + "\nE-mail: " + (r[6] || "–"); }).join("\n\n");
    MailApp.sendEmail(komu, "Hravý kronikář: nový návrh obce", text + "\n\n" + SpreadsheetApp.getActiveSpreadsheet().getUrl());
  } catch (e) { /* bez e-mailu */ }
}

function txt(v, n) {
  var s = String(v == null ? "" : v).slice(0, n);
  // ochrana proti vložení vzorce do tabulky
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
function num(v) { return typeof v === "number" && isFinite(v) ? v : ""; }
function bool(v) { return typeof v === "boolean" ? v : ""; }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
