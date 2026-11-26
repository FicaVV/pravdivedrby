/* Dobové listiny v kronice: vymyšlené „úřední papíry“ z roku 1958, které se odemknou s kapitolou.
 * Listina je v datech obce jako text (data/<obec>-kronika.js → body[].listina), tady se jen vykreslí
 * HTML a CSS (css/app.css → .listina). Podpisy jsou schválně nečitelné klikyháky, žádná jména.
 *
 * listina: {
 *   nazev:     krátký název do kroniky („Protokol okresního hygienika“),
 *   hlavicka:  [úřad, NADPIS, podnadpis],
 *   cj, datum: řádek s číslem jednacím a místem a datem,
 *   odstavce:  [{ nadpis, text } | { nadpis, body: [..] }]; v textu ~~přeškrtnuto~~ a _kurzíva_,
 *   podpisy:   popisky pod podpisy (podpis sám je klikyhák),
 *   razitko:   řádky kulatého razítka,
 *   skvrny:    [[x %, y %, šířka %, výška %], …] mastné skvrny,
 *   kopyto:    true = otisk kozího kopyta v rohu
 * }
 */
(function () {
  "use strict";

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function md(s) { return esc(s).replace(/~~(.+?)~~/g, "<s>$1</s>").replace(/_(.+?)_/g, "<i>$1</i>"); }

  // nečitelné podpisy (klikyháky tužkou), střídají se
  var PODPIS = [
    "M4 30 C10 6 16 6 14 24 C13 34 22 10 28 12 C34 14 26 30 34 26 C42 22 44 8 50 14 C56 20 50 30 60 22 C66 17 72 18 80 16 M20 34 C40 30 60 31 86 28",
    "M6 26 C8 10 20 4 22 18 C24 30 12 34 18 22 C24 10 34 8 36 20 C38 30 44 14 52 18 C58 21 56 28 64 22 C70 17 76 8 78 20 C79 28 86 24 92 20 M30 33 C50 29 70 30 90 27"
  ];
  var KOPYTO = '<svg class="ls-kopyto" viewBox="0 0 26 24" aria-hidden="true"><path d="M4 22 C2 12 6 3 11 3 C13 3 13 8 12 22Z M15 22 C14 8 14 3 16 3 C21 3 25 12 22 22Z"/></svg>';

  function vykresli(l) {
    var h = l.hlavicka || [];
    var html = '<div class="ls-hl">' + esc(h[0] || "") + (h[1] ? "<b>" + esc(h[1]) + "</b>" : "") + esc(h[2] || "") + "</div>";
    if (l.cj || l.datum) html += '<div class="ls-cj"><span>' + esc(l.cj || "") + "</span><span>" + esc(l.datum || "") + "</span></div>";
    (l.odstavce || []).forEach(function (o) {
      var nad = o.nadpis ? "<u>" + esc(o.nadpis) + ":</u> " : "";
      if (o.body) html += "<p>" + nad + "</p><ol>" + o.body.map(function (t) { return "<li>" + md(t) + "</li>"; }).join("") + "</ol>";
      else html += "<p>" + nad + md(o.text || "") + "</p>";
    });
    if (l.podpisy && l.podpisy.length) {
      html += '<div class="ls-podpisy">' + l.podpisy.map(function (p, k) {
        return '<span>' + esc(p) + ':<svg viewBox="0 0 96 40" aria-label="nečitelný podpis"><path d="' + PODPIS[k % PODPIS.length] + '"/></svg></span>';
      }).join("") + "</div>";
    }
    (l.skvrny || []).forEach(function (s) {
      html += '<i class="ls-skvrna" style="left:' + s[0] + "%;top:" + s[1] + "%;width:" + s[2] + "%;height:" + s[3] + '%"></i>';
    });
    if (l.razitko) html += '<div class="ls-razitko" aria-hidden="true">' + l.razitko.map(esc).join("<br>") + "</div>";
    if (l.kopyto) html += KOPYTO;
    var d = document.createElement("article");
    d.className = "listina ls-" + (l.typ || "protokol");
    d.setAttribute("aria-label", l.nazev || "Dobová listina");
    d.innerHTML = html;
    return d;
  }

  function otevrit(l) {
    var old = document.querySelector(".listina-okno"); if (old) old.remove();
    var okno = document.createElement("div");
    okno.className = "listina-okno"; okno.setAttribute("role", "dialog"); okno.setAttribute("aria-modal", "true");
    okno.setAttribute("aria-label", l.nazev || "Dobová listina");
    var list = vykresli(l);
    var zavrit = document.createElement("button");
    zavrit.className = "btn btn-primary"; zavrit.type = "button"; zavrit.textContent = "Zavřít listinu";
    var pozn = document.createElement("p");
    pozn.className = "listina-pozn"; pozn.textContent = "Listina je vymyšlená. Koza ne.";
    okno.appendChild(list); okno.appendChild(pozn); okno.appendChild(zavrit);
    function zavri() { okno.remove(); document.removeEventListener("keydown", esc2); }
    function esc2(e) { if (e.key === "Escape") zavri(); }
    zavrit.addEventListener("click", zavri);
    okno.addEventListener("click", function (e) { if (e.target === okno) zavri(); });
    document.addEventListener("keydown", esc2);
    document.body.appendChild(okno);
    zavrit.focus({ preventScroll: true });
  }

  // náhled do kroniky: horní část listiny jako vlepený papír, klepnutím se otevře celá
  function nahled(l) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "listina-nahled";
    b.setAttribute("aria-label", "Otevřít listinu: " + (l.nazev || "dobová listina"));
    var okno = document.createElement("span"); okno.className = "ln-okno";
    okno.appendChild(vykresli(l));
    var pop = document.createElement("span"); pop.className = "ln-popis";
    pop.innerHTML = "<b>" + esc(l.nazev || "Dobová listina") + "</b>Ze spisu, klepni a přečti";
    b.appendChild(okno); b.appendChild(pop);
    b.addEventListener("click", function () { otevrit(l); });
    return b;
  }

  window.PDL = { vykresli: vykresli, otevrit: otevrit, nahled: nahled };
})();
