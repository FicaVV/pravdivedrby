/*
 * Osobní kronika: razítka stanovišť, „Kde je koza?“ a pohlednice na konec (se společnou fotkou, nebo bez ní).
 * Fotka zůstává jen v telefonu (IndexedDB), nic se neodesílá.
 * Použití v js/app.js: var K = window.PDK.init({ OBEC, state, save, el, toast, vibrate });
 */
(function () {
  "use strict";
  window.PDK = { init: init };

  function init(ctx) {
    var OBEC = ctx.OBEC, state = ctx.state, save = ctx.save, el = ctx.el, toast = ctx.toast, vibrate = ctx.vibrate;
    var KOZA = "img/racice/koza-schovana.svg";
    // Hledání schované kozy v kresbách stanovišť je vypnuté (rušilo nad příběhem); kód zůstává, kdyby se vracelo.
    var HLEDAT_KOZU = !!OBEC.hledatKozu;
    if (!state.kozy) state.kozy = {};
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    function url(src) { return (window.PD_IMG && window.PD_IMG[src]) || src; }
    function pct(v) { return (+v).toFixed(3) + "%"; }
    function boxStyle(r) { // r = [x0, y0, x1, y1] v jednotkách kresby 200 × 150
      return "left:" + pct(r[0] / 2) + ";top:" + pct(r[1] / 1.5) + ";width:" + pct((r[2] - r[0]) / 2) + ";height:" + pct((r[3] - r[1]) / 1.5);
    }
    function kozBody() { return HLEDAT_KOZU ? OBEC.body.filter(function (b) { return b.koza; }) : []; }
    function kozNalezeno() { return kozBody().filter(function (b) { return state.kozy[b.id]; }).length; }

    // ---------- „Kde je koza?“ ----------
    // Viditelná část kozy (pro klepnutí): výřez ∩ obrys kozy
    function kozaHit(k) {
      if (k.jenKlik) return k.jenKlik;
      var s = k.s, gx0 = k.otoc ? 200 - 167 : 25, gx1 = k.otoc ? 200 - 25 : 167;
      var r = [k.x + gx0 * s, k.y + 14 * s, k.x + gx1 * s, k.y + 142 * s];
      if (k.orez) r = [Math.max(r[0], k.orez[0]), Math.max(r[1], k.orez[1]), Math.min(r[2], k.orez[2]), Math.min(r[3], k.orez[3])];
      // aspoň ~20 jednotek (na telefonu cca 36 px), ať se dá trefit prstem
      var padX = Math.max(3, (20 - (r[2] - r[0])) / 2), padY = Math.max(3, (20 - (r[3] - r[1])) / 2);
      return [r[0] - padX, r[1] - padY, r[2] + padX, r[3] + padY];
    }
    function kozaVrstva(k) {
      if (k.jenKlik) return null;
      var o = k.orez || [k.x, k.y, k.x + 200 * k.s, k.y + 150 * k.s];
      var w = o[2] - o[0], h = o[3] - o[1];
      var img = el("img", { class: "koza-img", src: url(KOZA), alt: "", draggable: "false" });
      img.style.cssText = "left:" + pct((k.x - o[0]) / w * 100) + ";top:" + pct((k.y - o[1]) / h * 100) +
        ";width:" + pct(200 * k.s / w * 100) + (k.otoc ? ";transform:scaleX(-1)" : "");
      var box = el("div", { class: "koza-orez", "aria-hidden": "true" }, [img]);
      box.style.cssText = boxStyle(o);
      return box;
    }
    function krouzek(r) {
      var cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2, rx = (r[2] - r[0]) / 2 + 3, ry = (r[3] - r[1]) / 2 + 3;
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("viewBox", "0 0 200 150"); svg.setAttribute("class", "koza-krouzek"); svg.setAttribute("aria-hidden", "true");
      // tužkou nakreslený kroužek: dvě mírně posunuté elipsy
      svg.innerHTML = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry + '" pathLength="100" transform="rotate(-4 ' + cx + ' ' + cy + ')"/>' +
        '<ellipse cx="' + (cx + 1) + '" cy="' + (cy - 0.5) + '" rx="' + (rx + 1.5) + '" ry="' + (ry + 0.5) + '" pathLength="100" transform="rotate(3 ' + cx + ' ' + cy + ')"/>';
      return svg;
    }

    // Hlavní kresba stanoviště se schovanou kozou. hra = true: na kozu jde klepnout (stanoviště),
    // false: jen ukázat (kronika), nalezená koza je zakroužkovaná.
    // ilustrace.predtim: podoba místa před splněním úkolu (školka: bílá s kaší), ukazuje se jen na nesplněném stanovišti.
    function kresba(b, hra, cls, onFound) {
      var ilu = b.ilustrace || {};
      var src = hra && ilu.predtim && !state.done[b.id] ? ilu.predtim : ilu.obrazek;
      var stage = el("div", { class: "ilu-stage" }, [el("img", { class: "ilu-img", src: url(src), alt: ilu.popis || "", decoding: "async" })]);
      var fig = el("figure", { class: cls }, [stage]);
      var k = HLEDAT_KOZU && b.koza;
      if (!k) return fig;
      var vrstva = kozaVrstva(k); if (vrstva) stage.appendChild(vrstva);
      var hit = kozaHit(k);
      stage.appendChild(krouzek(hit));
      if (state.kozy[b.id]) stage.classList.add("nalezena", "hned");
      if (hra) {
        var btn = el("button", { class: "koza-hit", type: "button", "aria-label": "Tady je koza!" });
        btn.style.cssText = boxStyle(hit);
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          var nova = !state.kozy[b.id];
          if (nova) { state.kozy[b.id] = Date.now(); save(); }
          stage.classList.remove("hned"); stage.classList.add("nalezena");
          void stage.offsetWidth; stage.classList.add("zamec");
          setTimeout(function () { stage.classList.remove("zamec"); }, 700);
          mec(b); vibrate(nova ? [30, 40, 30] : 20);
          if (onFound) onFound(nova);
        });
        stage.appendChild(btn);
        // klepnutí vedle: jen jemně „zatřást“, ať hráč ví, že kresba reaguje
        stage.addEventListener("click", function () {
          if (stage.classList.contains("nalezena")) return;
          stage.classList.remove("vedle"); void stage.offsetWidth; stage.classList.add("vedle");
        });
      }
      return fig;
    }
    // Řádek pod kresbou: výzva, po nalezení bublina s hláškou kozy
    function kozaRadek(b) {
      var box = el("div", { class: "koza-radek", "aria-live": "polite" });
      function paint() {
        box.innerHTML = "";
        var hlava = el("span", { class: "koza-hlava", "aria-hidden": "true" }, [el("img", { src: url(KOZA), alt: "" })]);
        if (state.kozy[b.id]) {
          box.classList.add("ok");
          box.appendChild(hlava);
          box.appendChild(el("div", { class: "koza-bublina" }, [
            el("p", { text: b.koza.hlaska }),
            el("small", { text: "Nalezené kozy: " + kozNalezeno() + " z " + kozBody().length })
          ]));
        } else {
          box.classList.remove("ok");
          box.appendChild(hlava);
          box.appendChild(el("p", {}, [el("b", { text: "Kde je koza? " }), b.id === OBEC.body[0].id
            ? "Koza hostinského bude tvoje průvodkyně. Klepni na ni v kresbě."
            : "Schovala se někde v kresbě. Najdeš ji? Klepni na ni."]));
        }
      }
      paint();
      return { el: box, paint: paint };
    }

    // Zamečení (stejné nahrávky jako u dojení)
    function mec(b) {
      var files = (OBEC.body[0].hra && OBEC.body[0].hra.meceni) || [];
      if (!files.length) return;
      try {
        var a = new Audio(files[(b.id + kozNalezeno()) % files.length]);
        a.volume = 0.8; a.preservesPitch = false; a.playbackRate = 1.15;
        var p = a.play(); if (p && p.catch) p.catch(function () {});
      } catch (e) { /* bez zvuku */ }
    }

    // ---------- razítka ----------
    function razitko(b, cls) {
      return el("img", { class: cls || "razitko", src: url(b.razitko), alt: "Razítko: zapsáno " + b.id, decoding: "async" });
    }
    var actx = null;
    function zvukRazitka() {
      try {
        var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        actx = actx || new AC(); if (actx.state === "suspended") actx.resume();
        var t = actx.currentTime + 0.02;
        // tupé „bum“: klesající sinus…
        var o = actx.createOscillator(), g = actx.createGain();
        o.type = "sine"; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.9, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g).connect(actx.destination); o.start(t); o.stop(t + 0.25);
        // …a „plesk“ gumy o papír: krátký šum přes dolní propust
        var n = Math.floor(actx.sampleRate * 0.09), buf = actx.createBuffer(1, n, actx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
        var src = actx.createBufferSource(), f = actx.createBiquadFilter(), g2 = actx.createGain();
        src.buffer = buf; f.type = "lowpass"; f.frequency.value = 1400; g2.gain.value = 0.7;
        src.connect(f).connect(g2).connect(actx.destination); src.start(t);
      } catch (e) { /* bez zvuku */ }
    }
    // Bouchnutí razítka přes celou obrazovku po dokončení stanoviště
    function bouchni(b) {
      if (!b.razitko) return;
      var old = document.querySelector(".razitko-bouch"); if (old) old.remove();
      var hotovo = OBEC.body.filter(function (x) { return state.done[x.id]; }).length;
      var box = el("div", { class: "razitko-bouch", role: "status" }, [
        el("div", { class: "rb-papir" }, [
          razitko(b, "rb-razitko"),
          el("p", { class: "rb-text", text: "Zapsáno do kroniky" }),
          el("p", { class: "rb-misto", text: b.nazev }),
          el("p", { class: "rb-sub", text: "Razítko " + hotovo + " z " + OBEC.body.length }),
          b.listina ? el("p", { class: "rb-listina", text: "+ do kroniky přibyla listina: " + b.listina.nazev }) : null,
          el("p", { class: "rb-dal", text: "Klepni a pokračuj" })
        ])
      ]);
      // razítko zůstane na obrazovce dost dlouho, ať si ho hráč prohlédne; klepnutím zmizí dřív
      var t = null, zavri = function () {
        clearTimeout(t); if (box.classList.contains("pryc")) return;
        box.classList.add("pryc"); setTimeout(function () { box.remove(); }, 400);
      };
      box.addEventListener("click", function () { if (Date.now() - start > 700) zavri(); });
      var start = Date.now();
      document.body.appendChild(box);
      setTimeout(function () { zvukRazitka(); vibrate([10, 30, 60]); }, reduced ? 0 : 330);
      t = setTimeout(zavri, 6500);
    }
    // Řada razítek v kronice (prázdná místa čekají)
    function razitkaRada() {
      var wrap = el("div", { class: "razitka-rada", role: "list", "aria-label": "Razítka" });
      OBEC.body.forEach(function (b) {
        if (state.done[b.id] && b.razitko) wrap.appendChild(el("div", { class: "rz-slot on", role: "listitem" }, [razitko(b)]));
        else wrap.appendChild(el("div", { class: "rz-slot", role: "listitem", "aria-label": "Razítko " + b.id + " zatím chybí" }, [el("span", { text: String(b.id) })]));
      });
      return wrap;
    }
    function kozyRadek() {
      if (!HLEDAT_KOZU) return null;
      var n = kozNalezeno(), all = kozBody().length;
      return el("p", { class: "koza-souhrn" }, [
        el("span", { class: "koza-hlava", "aria-hidden": "true" }, [el("img", { src: url(KOZA), alt: "" })]),
        el("span", {}, [el("b", { text: "Kde je koza? " }), n === all ? "Našli jste ji ve všech " + all + " kresbách!" : "Nalezeno " + n + " z " + all + ". Hledejte ji v kresbách na stanovištích."])
      ]);
    }

    // ---------- společná fotka na pohlednici (jen v telefonu) ----------
    var dbP = null;
    function db() {
      if (!dbP) dbP = new Promise(function (ok, ko) {
        if (!window.indexedDB) return ko(new Error("bez IndexedDB"));
        var r = indexedDB.open("pd-kronika", 1);
        r.onupgradeneeded = function () { r.result.createObjectStore("fotky"); };
        r.onsuccess = function () { ok(r.result); };
        r.onerror = function () { ko(r.error); };
      });
      return dbP;
    }
    function tx(mode, fn) {
      return db().then(function (d) {
        return new Promise(function (ok, ko) {
          var t = d.transaction("fotky", mode), st = t.objectStore("fotky"), res = fn(st);
          t.oncomplete = function () { ok(res && "result" in res ? res.result : undefined); };
          t.onerror = t.onabort = function () { ko(t.error); };
        });
      });
    }
    var SPOLECNA = "spolecna"; // klíč společné fotky; dřívější fotky u stanovišť měly klíč podle čísla stanoviště
    function key(id) { return OBEC.id + ":" + id; }
    function fotoGet(id) { return tx("readonly", function (st) { return st.get(key(id)); }).catch(function () { return null; }); }
    function fotoPut(id, blob) { return tx("readwrite", function (st) { st.put(blob, key(id)); }); }
    function fotoDel(id) { return tx("readwrite", function (st) { st.delete(key(id)); }).catch(function () {}); }
    // Zmenšit na max. 1400 px a uložit jako JPEG (fotka z mobilu má i 5 MB)
    function zmensit(file) {
      return new Promise(function (ok, ko) {
        var u = URL.createObjectURL(file), img = new Image();
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, 1400 / Math.max(w, h));
          var c = document.createElement("canvas"); c.width = Math.round(w * k); c.height = Math.round(h * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          URL.revokeObjectURL(u);
          c.toBlob(function (bl) { bl ? ok(bl) : ko(new Error("toBlob")); }, "image/jpeg", 0.85);
        };
        img.onerror = function () { URL.revokeObjectURL(u); ko(new Error("obrázek nejde načíst")); };
        img.src = u;
      });
    }

    // ---------- pohlednice ----------
    var CZ_DATE = function (d) { return d.getDate() + ". " + (d.getMonth() + 1) + ". " + d.getFullYear(); };
    function loadImg(src) {
      return new Promise(function (ok) {
        var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { ok(null); }; i.src = src;
      });
    }
    function fontsReady() {
      if (!document.fonts || !document.fonts.load) return Promise.resolve();
      return Promise.all(["900 80px Fraunces", "800 40px Fraunces", "700 30px 'Atkinson Hyperlegible Next'", "400 30px 'Atkinson Hyperlegible Next'"]
        .map(function (f) { return document.fonts.load(f).catch(function () {}); }));
    }
    var FD = "Fraunces, Georgia, 'Times New Roman', serif", FB = "'Atkinson Hyperlegible Next', 'Atkinson Hyperlegible', system-ui, sans-serif";
    function cover(ctx2, img, x, y, w, h) {
      var iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, k = Math.max(w / iw, h / ih);
      var sw = w / k, sh = h / k;
      ctx2.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
    }
    function rnd(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
    function hatch(c, x, y, w, h, color, step, lw) { // žlutá pastelka: šikmé čáry
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.strokeStyle = color; c.lineWidth = lw || 3; c.beginPath();
      for (var t = -h; t < w + h; t += step) { c.moveTo(x + t, y + h); c.lineTo(x + t + h * 0.6, y); }
      c.stroke(); c.restore();
    }
    // Kresby stanovišť pro pohlednici bez fotky (koláž „pozdrav z…“ jako na staré pohlednici)
    function kolazBody() {
      return OBEC.body.filter(function (b) { return state.done[b.id] && b.ilustrace && b.ilustrace.obrazek; }).slice(0, 6);
    }
    // Vykreslí pohlednici 1500 × 1050 px; fotoBlob = společná fotka (vlevo jako polaroid), bez ní koláž kreseb
    function kresliPohlednici(fotoBlob) {
      var W = 1500, H = 1050, c = document.createElement("canvas"); c.width = W; c.height = H;
      var g = c.getContext("2d"), P = OBEC.pohlednice || {}, r = rnd(7);
      var hotove = OBEC.body.filter(function (b) { return state.done[b.id]; });
      var kolaz = fotoBlob ? [] : kolazBody();
      var zdroje = [fotoBlob ? URL.createObjectURL(fotoBlob) : null, url(KOZA), url((OBEC.body[0].ilustrace || {}).obrazek)]
        .concat(OBEC.body.map(function (b) { return state.done[b.id] && b.razitko ? url(b.razitko) : null; }))
        .concat(kolaz.map(function (b) { return url(b.ilustrace.obrazek); }));
      return fontsReady().then(function () {
        return Promise.all(zdroje.map(function (s) { return s ? loadImg(s) : null; }))
          .then(function (imgs) { return state.podpis ? loadImg(state.podpis).then(function (p) { return imgs.concat([p]); }) : imgs.concat([null]); });
      }).then(function (imgs) {
        if (fotoBlob) URL.revokeObjectURL(zdroje[0]);
        var nb = OBEC.body.length;
        var foto = imgs[0], koza = imgs[1], kresba1 = imgs[2], raz = imgs.slice(3, 3 + nb);
        var kresby = imgs.slice(3 + nb, 3 + nb + kolaz.length), podpis = imgs[3 + nb + kolaz.length];
        // papír
        g.fillStyle = "#f7f4ec"; g.fillRect(0, 0, W, H);
        for (var i = 0; i < 2600; i++) { g.fillStyle = "rgba(90,80,60," + (r() * 0.07).toFixed(3) + ")"; g.fillRect(r() * W, r() * H, 1.6, 1.6); }
        // okraj pohlednice: dvojitá linka tužkou
        g.strokeStyle = "#2f2c28"; g.lineWidth = 4; g.strokeRect(28, 28, W - 56, H - 56);
        g.lineWidth = 1.5; g.strokeRect(40, 40, W - 80, H - 80);

        var tym = (state.tym || "").trim();
        if (foto) {
          // ---- polaroid se společnou fotkou vlevo ----
          g.save(); g.translate(400, 520); g.rotate(-3 * Math.PI / 180);
          g.shadowColor = "rgba(22,19,15,.28)"; g.shadowBlur = 24; g.shadowOffsetY = 8;
          g.fillStyle = "#fffdf8"; g.fillRect(-300, -380, 600, 740);
          g.shadowColor = "transparent";
          var fx = -270, fy = -350, fw = 540, fh = 560;
          cover(g, foto, fx, fy, fw, fh);
          g.strokeStyle = "rgba(47,44,40,.35)"; g.lineWidth = 2; g.strokeRect(fx, fy, fw, fh);
          // popisek polaroidu
          g.fillStyle = "#2f2c28"; g.textAlign = "center"; g.textBaseline = "alphabetic";
          g.font = "800 40px " + FD; fitText(g, tym || "Hraví kronikáři", 0, 278, 520);
          g.font = "400 28px " + FB; g.fillStyle = "#554c40"; g.fillText(CZ_DATE(new Date(state.konecAt || Date.now())), 0, 324);
          g.restore();
          // lepicí pásky (žlutá průsvitná)
          paska(g, 175, 150, -20); paska(g, 620, 135, 16);
        } else {
          // ---- bez fotky: koláž kreseb ze stanovišť (2 × 3), pod ní jméno výpravy ----
          var cw = 290, ch = 218, pad = 12, gx = 28, gy = 26, x0 = 92, y0 = 84;
          var mista = kresby.length ? kresby : [kresba1];
          mista.forEach(function (im, k) {
            if (!im) return;
            var col = k % 2, row = Math.floor(k / 2), rot = ((k * 37) % 7 - 3) * Math.PI / 180;
            var cx = x0 + col * (cw + gx) + cw / 2, cy = y0 + row * (ch + gy) + ch / 2;
            g.save(); g.translate(cx, cy); g.rotate(rot);
            g.shadowColor = "rgba(22,19,15,.25)"; g.shadowBlur = 14; g.shadowOffsetY = 5;
            g.fillStyle = "#fffdf8"; g.fillRect(-cw / 2, -ch / 2, cw, ch);
            g.shadowColor = "transparent";
            g.drawImage(im, -cw / 2 + pad, -ch / 2 + pad, cw - 2 * pad, ch - 2 * pad);
            g.strokeStyle = "rgba(47,44,40,.35)"; g.lineWidth = 2; g.strokeRect(-cw / 2 + pad, -ch / 2 + pad, cw - 2 * pad, ch - 2 * pad);
            g.restore();
            if (k % 3 === 0) paska(g, cx - cw / 2 + 30, cy - ch / 2 + 6, -28);
            else if (k % 3 === 1) paska(g, cx + cw / 2 - 30, cy - ch / 2 + 6, 24);
          });
          var ty = y0 + 3 * (ch + gy) + 52;
          g.textAlign = "center"; g.fillStyle = "#2f2c28"; g.font = "800 44px " + FD;
          fitText(g, tym || "Hraví kronikáři", x0 + cw + gx / 2, ty, 2 * cw + gx);
          g.font = "400 28px " + FB; g.fillStyle = "#554c40"; g.textAlign = "center";
          g.fillText("Kronika dopsána " + CZ_DATE(new Date(state.konecAt || Date.now())), x0 + cw + gx / 2, ty + 42);
        }

        // ---- pravá strana ----
        var X = 790;
        g.textAlign = "left"; g.fillStyle = "#16130f";
        var pozdrav = P.pozdrav || ("Pozdrav z obce " + OBEC.nazev);
        var m = /^(Pozdrav z|Pozdrav ze)\s+(.*)$/.exec(pozdrav);
        g.font = "900 52px " + FD; g.fillText(m ? m[1] : "", X, 160);
        // název obce se zvýrazňovačem
        g.font = "900 84px " + FD;
        var nazev = m ? m[2] : pozdrav, nw = Math.min(g.measureText(nazev).width, 640);
        g.fillStyle = "#eeb33b"; g.fillRect(X - 6, 205, nw + 12, 40);
        g.fillStyle = "#16130f"; fitText(g, nazev, X, 240, 640, "left");
        g.font = "400 30px " + FB; g.fillStyle = "#554c40";
        fitText(g, P.podtitul || "Kronika obce", X, 300, 640, "left");

        // razítka 4 × 2
        var sz = 140, gap = 22, top = 350;
        OBEC.body.forEach(function (b, k) {
          var cx = X + (k % 4) * (sz + gap), cy = top + Math.floor(k / 4) * (sz + gap);
          if (raz[k]) g.drawImage(raz[k], cx, cy, sz, sz);
          else {
            g.save(); g.setLineDash([8, 8]); g.strokeStyle = "rgba(47,44,40,.35)"; g.lineWidth = 3;
            g.beginPath(); g.arc(cx + sz / 2, cy + sz / 2, sz / 2 - 8, 0, Math.PI * 2); g.stroke(); g.restore();
          }
        });
        // shrnutí
        var y = top + 2 * (sz + gap) + 44;
        g.fillStyle = "#16130f"; g.font = "800 38px " + FD;
        g.fillText("Kapitol dopsáno: " + hotove.length + " z " + OBEC.body.length, X, y);
        var nk = kozNalezeno(), ak = kozBody().length;
        g.font = "400 30px " + FB; g.fillStyle = "#2f2c28";
        if (ak) g.fillText(nk ? "Kozu jsme našli " + nk + "× z " + ak + "." : "Kozu jsme hledali, ale ona nás našla první.", X, y + 48);
        if (podpis) {
          g.font = "400 24px " + FB; g.fillStyle = "#554c40"; g.fillText("Podpis kronikáře:", X, y + 100);
          var ph = 90, pw = Math.min(360, podpis.width * ph / podpis.height);
          g.drawImage(podpis, X + 210, y + 50, pw, ph);
        }
        // adresa dole
        g.font = "700 26px " + FB; g.fillStyle = "#16130f"; g.textAlign = "left";
        g.fillText("Hravý kronikář", X, H - 96);
        g.font = "400 24px " + FB; g.fillStyle = "#554c40";
        g.fillText(P.adresa || location.host, X, H - 64);
        // koza vykukuje zpravého dolního rohu
        if (koza) {
          g.save(); g.beginPath(); g.rect(40, 40, W - 80, H - 80); g.clip();
          g.translate(W - 40, H - 250); g.scale(-1, 1);
          g.drawImage(koza, -30, 0, 360, 270);
          g.restore();
          hatch(g, 40, H - 70, W - 80, 30, "rgba(240,184,0,.55)", 9, 3);
        }
        return new Promise(function (ok) { c.toBlob(function (bl) { ok(bl); }, "image/jpeg", 0.9); });
      });
    }
    function paska(g, x, y, deg) {
      g.save(); g.translate(x, y); g.rotate(deg * Math.PI / 180);
      g.fillStyle = "rgba(238,179,59,.55)"; g.fillRect(-80, -22, 160, 44);
      hatch(g, -80, -22, 160, 44, "rgba(240,184,0,.6)", 7, 2);
      g.restore();
    }
    function fitText(g, t, x, y, max, align) {
      g.textAlign = align || "center";
      var size = parseFloat(/(\d+)px/.exec(g.font)[1]);
      while (g.measureText(t).width > max && size > 18) { size -= 2; g.font = g.font.replace(/\d+px/, size + "px"); }
      g.fillText(t, x, y);
    }

    // Sekce na závěrečné stránce: výzva ke společné fotce, jméno výpravy, náhled pohlednice, Sdílet / Uložit.
    // state.pohlFoto: "spolecna" = s fotkou, "bez" = hráči fotku odmítli (pohlednice s koláží kreseb), null = ještě nevybrali.
    function pohledniceSekce() {
      if (!state.konecAt) { state.konecAt = Date.now(); save(); }
      var box = el("section", { class: "pohlednice" });
      box.appendChild(el("h3", { text: "Vaše pohlednice z výletu" }));
      var input = el("input", { type: "file", accept: "image/*", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
      box.appendChild(input);

      // výzva ke společné fotce
      var vyzva = el("div", { class: "foto-vyzva", hidden: "" }, [
        el("span", { class: "kicker", text: "Na závěr společná fotka" }),
        el("p", { class: "foto-ukol", text: "Stoupněte si všichni k sobě, třeba před obecní úřad, a vyfoťte se. Fotka se vlepí do pohlednice z výletu." }),
        el("button", { class: "btn btn-primary btn-block", type: "button", html: ICO_FOTO + "Vyfotit společnou fotku", onclick: function () { input.click(); } }),
        el("button", { class: "btn btn-block", type: "button", text: "Raději bez fotky", onclick: function () { zvolit("bez"); } }),
        el("p", { class: "draft-note", text: "Fotka zůstane jen v tomhle telefonu a nikam se neodesílá. Bez fotky dostanete pohlednici s kresbami ze stanovišť." })
      ]);
      box.appendChild(vyzva);

      var hotova = el("div", { class: "pohl-hotova", hidden: "" });
      var form = el("div", { class: "form" });
      var inp = el("input", { id: "pohl-tym", maxlength: "40", placeholder: "např. Kronikáři Novotní", autocomplete: "off" });
      inp.value = state.tym || "";
      form.appendChild(el("label", { for: "pohl-tym", text: "Jméno výpravy" }));
      form.appendChild(inp);
      hotova.appendChild(form);
      var fig = el("figure", { class: "pohl-nahled" }, [el("div", { class: "pohl-cekej", text: "Kreslím pohlednici…" })]);
      hotova.appendChild(fig);
      var share = el("button", { class: "btn btn-primary btn-block", type: "button", disabled: "" });
      share.innerHTML = ICO_SHARE + "Sdílet pohlednici";
      var dl = el("a", { class: "btn btn-block", download: "pohlednice-" + OBEC.id + ".jpg", href: "#", "aria-disabled": "true" });
      dl.innerHTML = ICO_SAVE + "Uložit obrázek";
      hotova.appendChild(el("div", { class: "pohl-akce" }, [share, dl]));
      var zmena = el("div", { class: "pohl-zmena" });
      hotova.appendChild(zmena);
      box.appendChild(hotova);

      var foto = null, blob = null, outUrl = null, gen = 0, t = null;
      function vykresli() {
        var my = ++gen;
        share.disabled = true; dl.setAttribute("aria-disabled", "true");
        kresliPohlednici(state.pohlFoto === SPOLECNA ? foto : null).then(function (bl) {
          if (my !== gen || !bl) return;
          blob = bl;
          if (outUrl) URL.revokeObjectURL(outUrl);
          outUrl = URL.createObjectURL(bl);
          fig.innerHTML = "";
          fig.appendChild(el("img", { src: outUrl, alt: "Pohlednice: " + ((OBEC.pohlednice || {}).pozdrav || OBEC.nazev) + (state.pohlFoto === SPOLECNA ? ", razítka a společná fotka výpravy" : ", razítka a kresby ze stanovišť") }));
          dl.href = outUrl; dl.removeAttribute("aria-disabled");
          share.disabled = false;
        });
      }
      function ukaz() {
        var volba = state.pohlFoto === SPOLECNA && foto ? SPOLECNA : state.pohlFoto === "bez" ? "bez" : null;
        vyzva.hidden = !!volba; hotova.hidden = !volba;
        zmena.innerHTML = "";
        if (!volba) return;
        if (volba === SPOLECNA) {
          zmena.appendChild(el("button", { class: "btn btn-small", type: "button", html: ICO_FOTO + "Vyfotit znovu", onclick: function () { input.click(); } }));
          zmena.appendChild(el("button", { class: "btn btn-small btn-ghost", type: "button", text: "Pohlednice bez fotky", onclick: function () { zvolit("bez"); } }));
        } else {
          zmena.appendChild(el("button", { class: "btn btn-small", type: "button", html: ICO_FOTO + (foto ? "Pohlednice s naší fotkou" : "Přece jen se vyfotit"), onclick: function () { if (foto) zvolit(SPOLECNA); else input.click(); } }));
        }
        vykresli();
      }
      function zvolit(v) { state.pohlFoto = v; save(); ukaz(); }
      input.addEventListener("change", function () {
        var f = input.files && input.files[0]; input.value = "";
        if (!f) return;
        zmensit(f).then(function (bl) { return fotoPut(SPOLECNA, bl).then(function () { return bl; }); })
          .then(function (bl) { foto = bl; toast("Fotka je na pohlednici"); vibrate(30); zvolit(SPOLECNA); },
                function () { toast("Fotku se nepodařilo uložit, zkuste to znovu"); });
      });
      inp.addEventListener("input", function () {
        state.tym = inp.value; save();
        clearTimeout(t); t = setTimeout(vykresli, 350);
      });
      share.addEventListener("click", function () {
        if (!blob) return;
        var file = new File([blob], "pohlednice-" + OBEC.id + ".jpg", { type: "image/jpeg" });
        var data = { files: [file], title: "Hravý kronikář", text: "Dopsali jsme kroniku obce " + OBEC.nazev + "! https://" + ((OBEC.pohlednice || {}).adresa || location.host) };
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share(data).catch(function (e) { if (e && e.name !== "AbortError") toast("Sdílení se nepovedlo, zkus Uložit obrázek"); });
        } else { dl.click(); toast("Tenhle prohlížeč sdílení neumí, pohlednice se uloží"); }
      });
      fotoGet(SPOLECNA).then(function (f) { foto = f || null; ukaz(); });
      return box;
    }

    // Smazat postup: nalezené kozy a fotky (i ty starší, focené dřív u jednotlivých stanovišť)
    function smazat() {
      state.kozy = {}; state.pohlFoto = null; state.konecAt = null; save();
      fotoDel(SPOLECNA);
      OBEC.body.forEach(function (b) { fotoDel(b.id); });
    }

    var ICO_FOTO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/></svg>';
    var ICO_SHARE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
    var ICO_SAVE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>';

    return {
      kresba: kresba, kozaRadek: kozaRadek, razitko: razitko, bouchni: bouchni, razitkaRada: razitkaRada, kozyRadek: kozyRadek,
      pohledniceSekce: pohledniceSekce, smazat: smazat
    };
  }
})();
