/* Kreslená mapa obce (Leaflet vrstva z data/<obec>-mapa.js).
 * Ulice, domy a pole jsou skutečná data OpenStreetMap, „tužkou“ je rozvlnil už generátor
 * (tools/kreslena-mapa.py), tady se jen kreslí obyčejné SVG cesty. Mapa je celá v telefonu,
 * takže funguje bez signálu. Vrací ovladač { vrstva, trasa, update(state), zobrazit(bool) }. */
(function () {
  "use strict";

  function dec(a) {
    var out = [], la = 0, ln = 0;
    for (var i = 0; i < a.length; i += 2) { la += a[i]; ln += a[i + 1]; out.push([la / 1e5, ln / 1e5]); }
    return out;
  }
  function img(src) { return (window.PD_IMG && window.PD_IMG[src]) || src; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // šrafy a vzorky plochy (v pixelech obrazovky, takže vypadají stejně při každém přiblížení)
  var DEFS =
    '<pattern id="pd-pole" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(38)">' +
      '<path d="M0 0 V9" stroke="#b9ab8c" stroke-width="1.1" opacity=".75"/></pattern>' +
    '<pattern id="pd-louka" width="22" height="18" patternUnits="userSpaceOnUse">' +
      '<path d="M3 12 l2 -4 M6 12 l0 -5 M9 12 l-1.5 -4 M14 5 l1.5 -3 M17 5 l0 -4" stroke="#8fa06a" stroke-width="1.1" fill="none" stroke-linecap="round"/></pattern>' +
    '<pattern id="pd-voda" width="16" height="8" patternUnits="userSpaceOnUse">' +
      '<path d="M1 5 q3 -3 6 0 t6 0" stroke="#5b86a8" stroke-width="1" fill="none" opacity=".8"/></pattern>' +
    '<pattern id="pd-hrbitov" width="16" height="16" patternUnits="userSpaceOnUse">' +
      '<path d="M8 3 v8 M5 6 h6" stroke="#8a8170" stroke-width="1.1" fill="none"/></pattern>' +
    '<pattern id="pd-dvur" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(-40)">' +
      '<path d="M0 0 V7" stroke="#c4b89c" stroke-width="1"/></pattern>';

  // tloušťka ulic podle přiblížení (px): [obrys, vnitřek]
  function sirka(k, z) {
    var f = Math.max(0.45, Math.min(2.2, Math.pow(2, z - 17)));
    var base = { hlavni: 13, ulice: 10, cesta: 6, stezka: 3 }[k] || 6;
    var w = Math.max(k === "stezka" ? 1.6 : 3, base * f);
    return [w, Math.max(0, w - 3)];
  }

  // koza v kresbě (obrys tužkou, stejný rukopis jako maskot)
  var KOZA = '<svg viewBox="0 0 64 48" width="46" height="35" aria-hidden="true"><g fill="#fffdf6" stroke="#2f2c28" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M14 22 C14 14 26 13 36 14 C42 14 46 16 46 22 C46 29 40 31 30 31 C20 31 14 29 14 22 Z"/>' +
    '<path d="M18 30 L17 42 M23 31 L23 42 M38 31 L38 42 M43 29 L44 41" fill="none"/>' +
    '<path d="M14 21 C10 20 9 17 10 15" fill="none"/>' +
    '<path d="M44 17 C46 10 50 7 54 8 C58 9 60 13 59 17 C58 20 55 21 53 20 C51 19 48 19 46 21"/>' +
    '<path d="M51 8 C50 4 47 2 45 3 M55 8 C56 4 59 3 60 5" fill="none"/>' +
    '<path d="M57 19 C57 23 55 25 53 25" fill="none"/>' +
    '<circle cx="55" cy="13" r="1.1" fill="#2f2c28"/>' +
    '<path d="M28 31 C28 34 32 34 32 31" fill="#eeb33b"/></g></svg>';

  function vytvor(map, M, OBEC, opts) {
    opts = opts || {};
    map.createPane("pd-kresba").style.zIndex = 250;
    map.createPane("pd-trasa").style.zIndex = 390;
    map.createPane("pd-stitky").style.zIndex = 590;
    var rKresba = L.svg({ pane: "pd-kresba", padding: 0.6 });
    var rTrasa = L.svg({ pane: "pd-trasa", padding: 0.6 });
    var vrstva = L.layerGroup();
    var ulice = [];

    function poly(g, cls, extra) {
      return L.polygon(dec(g), Object.assign({ renderer: rKresba, className: cls, interactive: false, smoothFactor: 0.5 }, extra || {}));
    }
    // plochy: pole, louky, voda…
    (M.plochy || []).forEach(function (p) {
      var fill = { pole: "url(#pd-pole)", louka: "url(#pd-louka)", voda: "url(#pd-voda)", mokrad: "url(#pd-louka)",
        hrbitov: "url(#pd-hrbitov)", dvur: "url(#pd-dvur)" }[p.k];
      var o = { stroke: true, weight: 1, color: "#9c8f74", dashArray: p.k === "pole" || p.k === "louka" ? "5 5" : null,
        fill: true, fillOpacity: 1, fillColor: fill || "#eadfc6" };
      if (p.k === "voda") { o.color = "#4f7a9c"; o.weight = 1.4; o.dashArray = null; }
      if (p.k === "hriste") { o.color = "#3a352e"; o.weight = 1.3; o.dashArray = null; o.fillColor = "#e4e7cf"; }
      if (p.k === "detske") { o.fillColor = "#f1e8cf"; o.dashArray = "2 3"; }
      vrstva.addLayer(poly(p.g, "pd-plocha pd-" + p.k, o));
      if (p.k === "hriste") vrstva.addLayer(hriste(dec(p.g)));
    });
    // potoky
    (M.toky || []).forEach(function (g) {
      vrstva.addLayer(L.polyline(dec(g), { renderer: rKresba, interactive: false, color: "#4f7a9c", weight: 2.2, opacity: .9, lineCap: "round", smoothFactor: 0.5 }));
    });
    // ulice: tmavý obrys a světlý vnitřek = dvě čáry tužkou
    var poradi = { stezka: 0, cesta: 1, ulice: 2, hlavni: 3 };
    (M.ulice || []).slice().sort(function (a, b) { return poradi[a.k] - poradi[b.k]; }).forEach(function (u) {
      var ll = dec(u.g);
      var obrys = L.polyline(ll, { renderer: rKresba, interactive: false, color: "#2f2c28", opacity: .85, lineCap: "round", lineJoin: "round", smoothFactor: 0.4 });
      var vnitr = u.k === "stezka" ? null : L.polyline(ll, { renderer: rKresba, interactive: false, color: u.k === "cesta" ? "#efe6d2" : "#fbf7ee", opacity: 1, lineCap: "round", lineJoin: "round", smoothFactor: 0.4 });
      if (u.k === "stezka") obrys.setStyle({ dashArray: "4 5", opacity: .7 });
      vrstva.addLayer(obrys); if (vnitr) vrstva.addLayer(vnitr);
      ulice.push({ k: u.k, o: obrys, v: vnitr });
    });
    // domy
    (M.domy || []).forEach(function (g) {
      vrstva.addLayer(poly(g, "pd-dum", { color: "#4a443b", weight: 1, opacity: .85, fillColor: "#fffdf7", fillOpacity: 1, lineJoin: "round" }));
    });

    // hřiště: středová čára a kruh, ať je fotbal poznat
    function hriste(ll) {
      var a = ll.reduce(function (s, p) { return [s[0] + p[0] / ll.length, s[1] + p[1] / ll.length]; }, [0, 0]);
      return L.circle(a, { renderer: rKresba, radius: 9, interactive: false, color: "#3a352e", weight: 1.2, fill: false });
    }

    // popisky ručním písmem
    (M.popisky || []).forEach(function (p) {
      vrstva.addLayer(L.marker(p.p, { pane: "pd-kresba", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "", iconSize: [0, 0], html: '<span class="pd-popisek' + (p.c ? " " + p.c : "") + '" style="transform:translate(-50%,-50%) rotate(' + (p.r || 0) + 'deg)">' + esc(p.t) + "</span>" }) }));
    });

    // schovaná koza
    if (M.koza) {
      var koza = L.marker(M.koza, { pane: "pd-stitky", keyboard: true, title: "Koza",
        icon: L.divIcon({ className: "", iconSize: [46, 35], iconAnchor: [23, 30], html: '<button class="pd-koza" aria-label="Koza">' + KOZA + "</button>" }) });
      koza.on("click", function () {
        try { document.dispatchEvent(new CustomEvent("pd:koza", { detail: { kde: "mapa", obec: OBEC.id } })); } catch (e) {}
        if (opts.onKoza) opts.onKoza();
      });
      vrstva.addLayer(koza);
    }

    // trasa: ušlá část žlutě, zbytek tečkovaně
    var trasa = L.layerGroup();
    var nohy = (M.trasa || []).map(function (g) {
      var ll = dec(g);
      var zluta = L.polyline(ll, { renderer: rTrasa, interactive: false, color: "#eeb33b", weight: 10, opacity: .85, lineCap: "round", lineJoin: "round" });
      var cara = L.polyline(ll, { renderer: rTrasa, interactive: false, color: "#16130f", weight: 3, lineCap: "round", lineJoin: "round" });
      trasa.addLayer(zluta); trasa.addLayer(cara);
      return { z: zluta, c: cara };
    });

    // kartičky stanovišť: jen u splněných stanovišť (kresba s názvem), ostatní nemají nic
    var stitky = {};
    OBEC.body.forEach(function (b) {
      var s = (M.stitky || {})[b.id]; if (!s || !b.ilustrace) return;
      var m = L.marker(b.pozice, { pane: "pd-stitky", interactive: false, keyboard: false,
        icon: L.divIcon({ className: "", iconSize: [0, 0], html: "" }) });
      stitky[b.id] = { m: m, s: s, b: b, stav: null };
      vrstva.addLayer(m);
    });

    // přidat šrafy do SVG, jakmile vznikne
    function defs() {
      var svg = rKresba._container;
      if (!svg || svg.querySelector("#pd-pole")) return;
      var d = document.createElementNS("http://www.w3.org/2000/svg", "defs");
      d.innerHTML = DEFS; svg.insertBefore(d, svg.firstChild);
    }
    function tloustky() {
      var z = map.getZoom();
      ulice.forEach(function (u) {
        var w = sirka(u.k, z);
        u.o.setStyle({ weight: w[0] }); if (u.v) u.v.setStyle({ weight: w[1] });
      });
      var c = map.getContainer();
      c.classList.toggle("pd-z-pryc", z < 14.5);
      c.classList.toggle("pd-z-dal", z < 15.5);
      c.classList.toggle("pd-z-blizko", z >= 17);
    }
    map.on("zoomend", function () { if (zobrazeno) tloustky(); });

    var zobrazeno = false, posledni = null;
    function zobrazit(on) {
      zobrazeno = !!on;
      map.getContainer().classList.toggle("pd-kreslena", zobrazeno);
      if (on) { vrstva.addTo(map); defs(); tloustky(); }
      else vrstva.remove();
      if (posledni) update(posledni);
    }
    function update(state) {
      posledni = state;
      // noha i vede ze stanoviště i+1 do i+2; ušlá je, když je cílové stanoviště splněné
      nohy.forEach(function (n, i) {
        var b = OBEC.body[i + 1], hotovo = b && state.done[b.id];
        n.z.setStyle({ opacity: hotovo ? .85 : 0 });
        n.c.setStyle(hotovo ? { dashArray: null, weight: 3, opacity: 1 } : { dashArray: "0.1 8", weight: 4.2, opacity: .8 });
      });
      Object.keys(stitky).forEach(function (id) {
        var x = stitky[id], b = x.b, i = OBEC.body.indexOf(b);
        var stav = state.done[b.id] ? "hotovo" : i === state.idx ? "cil" : "zamceno";
        if (x.stav === stav) return; x.stav = stav;
        // nesplněná stanoviště nemají žádnou kartičku, ani prázdný rámeček
        if (stav !== "hotovo") { x.m.setIcon(L.divIcon({ className: "", iconSize: [0, 0], html: "" })); return; }
        var rot = ((b.id * 37) % 9) - 4;
        var popis = stav === "zamceno" ? "???" : x.s.t;
        x.m.setIcon(L.divIcon({ className: "", iconSize: [0, 0],
          html: '<figure class="pd-stitek ' + stav + '" style="--dx:' + x.s.d[0] + "px;--dy:" + x.s.d[1] + "px;--r:" + rot + 'deg">' +
            (stav === "hotovo" ? '<img src="' + esc(img(b.ilustrace.obrazek)) + '" alt="" decoding="async">' : '<span class="pd-stitek-nic" aria-hidden="true">?</span>') +
            "<figcaption>" + esc(popis) + "</figcaption></figure>" }));
      });
    }

    return { vrstva: vrstva, trasa: trasa, zobrazit: zobrazit, update: update, licence: M.licence, delka: M.delka };
  }

  window.PD_KRESBA = { vytvor: vytvor };
})();
