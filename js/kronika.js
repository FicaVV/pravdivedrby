/*
 * Osobní kronika: razítka stanovišť, „Kde je koza?“, rodinné fotky a pohlednice na konec.
 * Fotky zůstávají jen v telefonu (IndexedDB), nic se neodesílá.
 * Použití v js/app.js: var K = window.PDK.init({ OBEC, state, save, el, toast, vibrate });
 */
(function () {
  "use strict";
  window.PDK = { init: init };

  function init(ctx) {
    var OBEC = ctx.OBEC, state = ctx.state, save = ctx.save, el = ctx.el, toast = ctx.toast, vibrate = ctx.vibrate;
    var KOZA = "img/racice/koza-schovana.svg";
    if (!state.kozy) state.kozy = {};
    var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

    function url(src) { return (window.PD_IMG && window.PD_IMG[src]) || src; }
    function pct(v) { return (+v).toFixed(3) + "%"; }
    function boxStyle(r) { // r = [x0, y0, x1, y1] v jednotkách kresby 200 × 150
      return "left:" + pct(r[0] / 2) + ";top:" + pct(r[1] / 1.5) + ";width:" + pct((r[2] - r[0]) / 2) + ";height:" + pct((r[3] - r[1]) / 1.5);
    }
    function kozBody() { return OBEC.body.filter(function (b) { return b.koza; }); }
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
    function kresba(b, hra, cls, onFound) {
      var ilu = b.ilustrace || {};
      var stage = el("div", { class: "ilu-stage" }, [el("img", { class: "ilu-img", src: url(ilu.obrazek), alt: ilu.popis || "", decoding: "async" })]);
      var fig = el("figure", { class: cls }, [stage]);
      var k = b.koza;
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
          el("p", { class: "rb-sub", text: "Razítko " + hotovo + " z " + OBEC.body.length })
        ])
      ]);
      var zavri = function () { box.classList.add("pryc"); setTimeout(function () { box.remove(); }, 250); };
      box.addEventListener("click", zavri);
      document.body.appendChild(box);
      setTimeout(function () { zvukRazitka(); vibrate([10, 30, 60]); }, reduced ? 0 : 330);
      setTimeout(zavri, 1900);
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
      var n = kozNalezeno(), all = kozBody().length;
      return el("p", { class: "koza-souhrn" }, [
        el("span", { class: "koza-hlava", "aria-hidden": "true" }, [el("img", { src: url(KOZA), alt: "" })]),
        el("span", {}, [el("b", { text: "Kde je koza? " }), n === all ? "Našli jste ji ve všech " + all + " kresbách!" : "Nalezeno " + n + " z " + all + ". Hledejte ji v kresbách na stanovištích."])
      ]);
    }

    // ---------- rodinné fotky (jen v telefonu) ----------
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
    function key(id) { return OBEC.id + ":" + id; }
    function fotoGet(id) { return tx("readonly", function (st) { return st.get(key(id)); }).catch(function () { return null; }); }
    function fotoPut(id, blob) { return tx("readwrite", function (st) { st.put(blob, key(id)); }); }
    function fotoDel(id) { return tx("readwrite", function (st) { st.delete(key(id)); }).catch(function () {}); }
    function fotkyVse() { // { idBodu: Blob }
      var out = {};
      return Promise.all(OBEC.body.map(function (b) {
        return fotoGet(b.id).then(function (f) { if (f) out[b.id] = f; });
      })).then(function () { return out; });
    }
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
    var urls = {};
    function blobUrl(id, blob) { if (urls[id]) URL.revokeObjectURL(urls[id]); urls[id] = URL.createObjectURL(blob); return urls[id]; }

    // Blok na stanovišti: zadání, tlačítko „Vyfoťte se tady“, náhled
    function fotoBlok(b) {
      var box = el("section", { class: "foto-blok" });
      var input = el("input", { type: "file", accept: "image/*", class: "sr-only", tabindex: "-1", "aria-hidden": "true" });
      var nahled = el("figure", { class: "polaroid", hidden: "" }, [el("img", { alt: "Vaše fotka u stanoviště " + b.nazev })]);
      var btn = el("button", { class: "btn btn-block", type: "button" });
      var del = el("button", { class: "btn btn-small btn-ghost", type: "button", text: "Smazat fotku", hidden: "" });
      function ukaz(blob) {
        if (blob) { nahled.querySelector("img").src = blobUrl(b.id, blob); nahled.hidden = false; del.hidden = false; }
        else { nahled.hidden = true; del.hidden = true; }
        btn.innerHTML = ICO_FOTO + (blob ? "Vyfotit znovu" : "Vyfoťte se tady");
      }
      btn.addEventListener("click", function () { input.click(); });
      input.addEventListener("change", function () {
        var f = input.files && input.files[0]; input.value = "";
        if (!f) return;
        btn.disabled = true;
        zmensit(f).then(function (bl) { return fotoPut(b.id, bl).then(function () { return bl; }); })
          .then(function (bl) { ukaz(bl); toast("Fotka je vlepená v kronice"); vibrate(30); },
                function () { toast("Fotku se nepodařilo uložit"); })
          .then(function () { btn.disabled = false; });
      });
      del.addEventListener("click", function () { fotoDel(b.id).then(function () { ukaz(null); toast("Fotka smazaná"); }); });
      box.appendChild(el("span", { class: "kicker", text: "Rodinná fotka do kroniky" }));
      if (b.fotoUkol) box.appendChild(el("p", { class: "foto-ukol", text: b.fotoUkol }));
      box.appendChild(nahled);
      box.appendChild(btn); box.appendChild(del); box.appendChild(input);
      box.appendChild(el("p", { class: "draft-note", text: "Nepovinné. Fotka zůstane jen v tomhle telefonu a nikam se neodesílá." }));
      ukaz(null);
      fotoGet(b.id).then(function (f) { if (f) ukaz(f); });
      return box;
    }
    // Fotka vlepená do kapitoly kroniky vedle kresby (když existuje)
    function fotoDoKroniky(b, slot) {
      fotoGet(b.id).then(function (f) {
        if (!f) return;
        slot.classList.add("s-fotkou");
        slot.appendChild(el("figure", { class: "polaroid ch-rodina" }, [el("img", { src: blobUrl(b.id, f), alt: "Vaše fotka u stanoviště " + b.nazev })]));
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
    // Vykreslí pohlednici 1500 × 1050 px; fotoId = stanoviště, jehož fotka je na přední straně (nebo null)
    function kresliPohlednici(fotky, fotoId) {
      var W = 1500, H = 1050, c = document.createElement("canvas"); c.width = W; c.height = H;
      var g = c.getContext("2d"), P = OBEC.pohlednice || {}, r = rnd(7);
      var hotove = OBEC.body.filter(function (b) { return state.done[b.id]; });
      var fotoBlob = fotoId && fotky[fotoId];
      var zdroje = [fotoBlob ? URL.createObjectURL(fotoBlob) : null, url(KOZA), url((OBEC.body[0].ilustrace || {}).obrazek)]
        .concat(OBEC.body.map(function (b) { return state.done[b.id] && b.razitko ? url(b.razitko) : null; }));
      return fontsReady().then(function () {
        return Promise.all(zdroje.map(function (s) { return s ? loadImg(s) : null; }))
          .then(function (imgs) { return state.podpis ? loadImg(state.podpis).then(function (p) { return imgs.concat([p]); }) : imgs.concat([null]); });
      }).then(function (imgs) {
        if (fotoBlob) URL.revokeObjectURL(zdroje[0]);
        var foto = imgs[0], koza = imgs[1], kresba1 = imgs[2], raz = imgs.slice(3, 3 + OBEC.body.length), podpis = imgs[3 + OBEC.body.length];
        // papír
        g.fillStyle = "#f7f4ec"; g.fillRect(0, 0, W, H);
        for (var i = 0; i < 2600; i++) { g.fillStyle = "rgba(90,80,60," + (r() * 0.07).toFixed(3) + ")"; g.fillRect(r() * W, r() * H, 1.6, 1.6); }
        // okraj pohlednice: dvojitá linka tužkou
        g.strokeStyle = "#2f2c28"; g.lineWidth = 4; g.strokeRect(28, 28, W - 56, H - 56);
        g.lineWidth = 1.5; g.strokeRect(40, 40, W - 80, H - 80);

        // ---- polaroid vlevo ----
        g.save(); g.translate(400, 520); g.rotate(-3 * Math.PI / 180);
        g.shadowColor = "rgba(22,19,15,.28)"; g.shadowBlur = 24; g.shadowOffsetY = 8;
        g.fillStyle = "#fffdf8"; g.fillRect(-300, -380, 600, 740);
        g.shadowColor = "transparent";
        var fx = -270, fy = -350, fw = 540, fh = 560;
        if (foto) cover(g, foto, fx, fy, fw, fh);
        else if (kresba1) { g.fillStyle = "#f7f4ec"; g.fillRect(fx, fy, fw, fh); cover(g, kresba1, fx, fy + 70, fw, fh - 140); }
        g.strokeStyle = "rgba(47,44,40,.35)"; g.lineWidth = 2; g.strokeRect(fx, fy, fw, fh);
        // popisek polaroidu
        g.fillStyle = "#2f2c28"; g.textAlign = "center"; g.textBaseline = "alphabetic";
        var tym = (state.tym || "").trim();
        g.font = "800 40px " + FD; fitText(g, tym || "Neoficiální kronikáři", 0, 278, 520);
        g.font = "400 28px " + FB; g.fillStyle = "#554c40"; g.fillText(CZ_DATE(new Date(state.konecAt || Date.now())), 0, 324);
        g.restore();
        // lepicí pásky (žlutá průsvitná)
        paska(g, 175, 150, -20); paska(g, 620, 135, 16);

        // ---- pravá strana ----
        var X = 790;
        g.textAlign = "left"; g.fillStyle = "#16130f";
        var pozdrav = P.pozdrav || ("Pozdrav z obce " + OBEC.nazev);
        var m = /^(Pozdrav z|Pozdrav ze)\s+(.*)$/.exec(pozdrav);
        g.font = "900 52px " + FD; g.fillText(m ? m[1] : "", X, 160);
        // název obce se zvýrazňovačem
        g.font = "900 84px " + FD;
        var nazev = m ? m[2] : pozdrav, nw = Math.min(g.measureText(nazev).width, 640);
        g.fillStyle = "#f5c400"; g.fillRect(X - 6, 205, nw + 12, 40);
        g.fillStyle = "#16130f"; fitText(g, nazev, X, 240, 640, "left");
        g.font = "400 30px " + FB; g.fillStyle = "#554c40";
        fitText(g, P.podtitul || "Neoficiální kronika obce", X, 300, 640, "left");

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
        g.fillText(nk ? "Kozu jsme našli " + nk + "× z " + ak + "." : "Kozu jsme hledali, ale ona nás našla první.", X, y + 48);
        if (podpis) {
          g.font = "400 24px " + FB; g.fillStyle = "#554c40"; g.fillText("Podpis kronikáře:", X, y + 100);
          var ph = 90, pw = Math.min(360, podpis.width * ph / podpis.height);
          g.drawImage(podpis, X + 210, y + 50, pw, ph);
        }
        // adresa dole
        g.font = "700 26px " + FB; g.fillStyle = "#16130f"; g.textAlign = "left";
        g.fillText("Pravdivé drby", X, H - 96);
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
      g.fillStyle = "rgba(245,196,0,.55)"; g.fillRect(-80, -22, 160, 44);
      hatch(g, -80, -22, 160, 44, "rgba(240,184,0,.6)", 7, 2);
      g.restore();
    }
    function fitText(g, t, x, y, max, align) {
      g.textAlign = align || "center";
      var size = parseFloat(/(\d+)px/.exec(g.font)[1]);
      while (g.measureText(t).width > max && size > 18) { size -= 2; g.font = g.font.replace(/\d+px/, size + "px"); }
      g.fillText(t, x, y);
    }

    // Sekce na závěrečné stránce: jméno výpravy, výběr fotky, náhled, Sdílet / Uložit
    function pohledniceSekce() {
      if (!state.konecAt) { state.konecAt = Date.now(); save(); }
      var box = el("section", { class: "pohlednice" });
      box.appendChild(el("h3", { text: "Vaše pohlednice z výletu" }));
      box.appendChild(el("p", { class: "draft-note", text: "Razítka, rodinná fotka a koza na jednom obrázku. Pošlete ho babičce nebo kamarádům." }));
      var form = el("div", { class: "form" });
      var inp = el("input", { id: "pohl-tym", maxlength: "40", placeholder: "např. Kronikáři Novotní", autocomplete: "off" });
      inp.value = state.tym || "";
      form.appendChild(el("label", { for: "pohl-tym", text: "Jméno výpravy" }));
      form.appendChild(inp);
      box.appendChild(form);
      var volba = el("div", { class: "pohl-volba", role: "radiogroup", "aria-label": "Fotka na pohlednici", hidden: "" });
      box.appendChild(volba);
      var fig = el("figure", { class: "pohl-nahled" }, [el("div", { class: "pohl-cekej", text: "Kreslím pohlednici…" })]);
      box.appendChild(fig);
      var share = el("button", { class: "btn btn-primary btn-block", type: "button", disabled: "" });
      share.innerHTML = ICO_SHARE + "Sdílet pohlednici";
      var dl = el("a", { class: "btn btn-block", download: "pohlednice-" + OBEC.id + ".jpg", href: "#", "aria-disabled": "true" });
      dl.innerHTML = ICO_SAVE + "Uložit obrázek";
      box.appendChild(el("div", { class: "pohl-akce" }, [share, dl]));

      var fotky = {}, blob = null, outUrl = null, gen = 0, t = null;
      function vykresli() {
        var my = ++gen;
        kresliPohlednici(fotky, state.pohlFoto && fotky[state.pohlFoto] ? state.pohlFoto : null).then(function (bl) {
          if (my !== gen || !bl) return;
          blob = bl;
          if (outUrl) URL.revokeObjectURL(outUrl);
          outUrl = URL.createObjectURL(bl);
          fig.innerHTML = "";
          fig.appendChild(el("img", { src: outUrl, alt: "Pohlednice: " + ((OBEC.pohlednice || {}).pozdrav || OBEC.nazev) + ", razítka a fotka výpravy" }));
          dl.href = outUrl; dl.removeAttribute("aria-disabled");
          share.disabled = false;
        });
      }
      inp.addEventListener("input", function () {
        state.tym = inp.value; save();
        clearTimeout(t); t = setTimeout(vykresli, 350);
      });
      share.addEventListener("click", function () {
        if (!blob) return;
        var file = new File([blob], "pohlednice-" + OBEC.id + ".jpg", { type: "image/jpeg" });
        var data = { files: [file], title: "Pravdivé drby", text: "Dopsali jsme neoficiální kroniku obce " + OBEC.nazev + "! https://" + ((OBEC.pohlednice || {}).adresa || location.host) };
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          navigator.share(data).catch(function (e) { if (e && e.name !== "AbortError") toast("Sdílení se nepovedlo, zkus Uložit obrázek"); });
        } else { dl.click(); toast("Tenhle prohlížeč sdílení neumí, pohlednice se uloží"); }
      });
      fotkyVse().then(function (f) {
        fotky = f;
        var ids = Object.keys(f);
        if (ids.length) {
          if (!state.pohlFoto || !f[state.pohlFoto]) { state.pohlFoto = ids[ids.length - 1]; save(); }
          volba.hidden = false;
          volba.appendChild(el("p", { class: "pohl-volba-h", text: "Fotka na pohlednici" }));
          var row = el("div", { class: "pohl-thumbs" });
          ids.forEach(function (id) {
            var b = OBEC.body.filter(function (x) { return String(x.id) === id; })[0];
            var bt = el("button", { type: "button", role: "radio", "aria-checked": String(state.pohlFoto === id), "aria-label": "Fotka od stanoviště " + (b ? b.nazev : id) },
              [el("img", { src: blobUrl(id, f[id]), alt: "" })]);
            bt.addEventListener("click", function () {
              state.pohlFoto = id; save();
              Array.prototype.forEach.call(row.children, function (x) { x.setAttribute("aria-checked", String(x === bt)); });
              vykresli();
            });
            row.appendChild(bt);
          });
          volba.appendChild(row);
        } else {
          box.insertBefore(el("p", { class: "draft-note", text: "Tip: když se na stanovištích vyfotíte, fotka se objeví i tady na pohlednici." }), fig);
        }
        vykresli();
      });
      return box;
    }

    // Smazat postup: nalezené kozy a fotky
    function smazat() {
      state.kozy = {}; state.pohlFoto = null; state.konecAt = null; save();
      OBEC.body.forEach(function (b) { fotoDel(b.id); });
    }

    var ICO_FOTO = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8a2 2 0 0 1 2-2h2.5l1.5-2h6l1.5 2H19a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="4"/></svg>';
    var ICO_SHARE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/></svg>';
    var ICO_SAVE = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 19h14"/></svg>';

    return {
      kresba: kresba, kozaRadek: kozaRadek, razitko: razitko, bouchni: bouchni, razitkaRada: razitkaRada, kozyRadek: kozyRadek,
      fotoBlok: fotoBlok, fotoDoKroniky: fotoDoKroniky, pohledniceSekce: pohledniceSekce, smazat: smazat
    };
  }
})();
