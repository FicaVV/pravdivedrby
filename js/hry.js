/*
 * Minihry na stanovištích (kromě dojení kozy, to je v app.js).
 * Každá hra: window.PD_HRY[typ](b, hotovo, onDone) → prvek .hra
 *   b.hra = { typ, nadpis, zadani, hotovo, kicker? }
 *   hotovo = stanoviště už je v kronice → hra se ukáže rovnou dohraná
 *   onDone se zavolá jednou po dohrání (ne při znovuotevření)
 * Kresby jsou tužka + žlutá jako zbytek hry, zvuky se syntetizují přes Web Audio (bez souborů, offline).
 */
(function () {
  var INK = "#2f2c28";
  var HRY = window.PD_HRY = window.PD_HRY || {};

  // ---------- pomocníci ----------
  function E(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (k === "class") n.className = v;
      else if (k === "text") n.textContent = v;
      else if (k === "html") n.innerHTML = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  function img(src) { return (window.PD_IMG && window.PD_IMG[src]) || src; }
  function f1(n) { return (Math.round(n * 10) / 10).toString(); }
  function restart(node, cls) { node.classList.remove(cls); void (node.getBBox ? node.getBBox() : node.offsetWidth); node.classList.add(cls); }
  // souřadnice prstu v jednotkách kresby (viewBox 200 × 150, scéna má poměr 4:3)
  function pt(svg, e) {
    var r = svg.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 200, y: (e.clientY - r.top) / r.height * 150 };
  }
  // jednoduchý opakovatelný náhodný generátor (ať kaše vypadá pokaždé stejně)
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- tužka ----------
  function defs(P, extra) {
    return '<defs>' +
      '<filter id="' + P + 'w1"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.4"/></filter>' +
      '<filter id="' + P + 'w2"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="1.8"/></filter>' +
      '<filter id="' + P + 'paper"><feTurbulence baseFrequency=".8" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .38  0 0 0 0 .33  0 0 0 .07 0"/></filter>' +
      '<pattern id="' + P + 'x" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0 V4" stroke="#55514a" stroke-width=".6"/></pattern>' +
      '<pattern id="' + P + 'xx" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-42)"><path d="M0 0 V3" stroke="#55514a" stroke-width=".7"/></pattern>' +
      '<pattern id="' + P + 'red" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><path d="M0 0 V3" stroke="#c2341e" stroke-width=".9"/></pattern>' +
      '<pattern id="' + P + 'yel" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 0 V3" stroke="#f0b800" stroke-width="1.5"/></pattern>' +
      (extra || "") + '</defs>';
  }
  function ln(P, d, w, extra, col) {
    col = col || INK;
    return '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" filter="url(#' + P + 'w1)"' + (extra || "") + '/>' +
      '<path d="' + d + '" fill="none" stroke="' + col + '" stroke-width="' + f1(w * 0.6) + '" opacity=".35" stroke-linecap="round" stroke-linejoin="round" filter="url(#' + P + 'w2)"/>';
  }
  function shape(P, d, fill, w) { return '<path d="' + d + '" fill="' + fill + '"/>' + ln(P, d, w || 1.6); }
  function paper(P, ground) {
    return '<rect width="200" height="150" fill="#f7f4ec"/><rect width="200" height="150" filter="url(#' + P + 'paper)"/>' +
      (ground === false ? "" :
        '<path d="M6 136 C50 128 150 128 196 136 V146 H6Z" fill="url(#' + P + 'yel)" opacity=".5" filter="url(#' + P + 'w2)"/>' +
        ln(P, "M6 140 C40 139 70 141 100 140 C130 139 160 141 194 140", 1));
  }
  function backdrop(src) { return '<image href="' + img(src) + '" width="200" height="150"/>'; }

  // ---------- zvuky (Web Audio, nic se nestahuje) ----------
  var AC = null, NOISE = null;
  function ac() {
    try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { AC = null; }
    if (AC && AC.state === "suspended") AC.resume();
    return AC;
  }
  function env(c, g, t, peak, att, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noise(o) {
    var c = ac(); if (!c) return;
    var t = o.at || c.currentTime;
    if (!NOISE) {
      NOISE = c.createBuffer(1, c.sampleRate, c.sampleRate);
      var d = NOISE.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    var s = c.createBufferSource(); s.buffer = NOISE;
    var f = c.createBiquadFilter(); f.type = o.type || "bandpass"; f.frequency.value = o.f || 1000; f.Q.value = o.q || 1;
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    var g = c.createGain(); env(c, g, t, o.gain || 0.4, o.att || 0.004, o.dur);
    s.connect(f); f.connect(g); g.connect(c.destination);
    s.start(t, Math.random() * 0.4); s.stop(t + o.dur + 0.05);
  }
  function tone(o) {
    var c = ac(); if (!c) return;
    var t = o.at || c.currentTime;
    var s = c.createOscillator(); s.type = o.type || "sine";
    s.frequency.setValueAtTime(o.f, t);
    if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
    var g = c.createGain(); env(c, g, t, o.gain || 0.3, o.att || 0.005, o.dur);
    s.connect(g); g.connect(c.destination); s.start(t); s.stop(t + o.dur + 0.05);
  }
  var SFX = {
    spray: function () { noise({ f: 2600, q: 0.7, dur: 0.38, gain: 0.25, att: 0.02 }); },
    hiss: function () { noise({ f: 3800, to: 1200, q: 1.2, dur: 0.6, gain: 0.22, att: 0.03 }); },
    wipe: function () { noise({ f: 900, q: 0.6, dur: 0.14, gain: 0.12, att: 0.02 }); },
    clap: function (at) { noise({ f: 1500, q: 1.4, dur: 0.11, gain: 0.7, at: at }); noise({ f: 3000, q: 1, dur: 0.06, gain: 0.3, at: at }); },
    drum: function (at, hi) { tone({ f: hi ? 150 : 115, to: 45, dur: 0.28, gain: 0.9, at: at }); noise({ f: 300, q: 0.8, dur: 0.08, gain: 0.25, at: at }); },
    thump: function () { tone({ f: 110, to: 40, dur: 0.18, gain: 0.8 }); noise({ type: "lowpass", f: 700, dur: 0.12, gain: 0.5 }); },
    slide: function () { noise({ f: 700, to: 2400, q: 0.5, dur: 0.35, gain: 0.12, att: 0.05 }); },
    pen: function () { noise({ f: 4200, q: 2, dur: 0.09, gain: 0.06, att: 0.01 }); },
    pop: function () { tone({ f: 420, to: 160, dur: 0.12, gain: 0.35, type: "triangle" }); },
    match: function () { noise({ f: 2200, to: 600, q: 0.8, dur: 0.45, gain: 0.3, att: 0.01 }); },
    bell: function () { [523.25, 1046.5, 1568].forEach(function (f, i) { tone({ f: f, dur: 2.4 - i * 0.5, gain: 0.16 / (i + 1), att: 0.01 }); }); },
    tick: function () { tone({ f: 1320, dur: 0.08, gain: 0.12 }); },
    whoosh: function () { noise({ f: 600, to: 1400, q: 0.7, dur: 0.2, gain: 0.15, att: 0.03 }); },
    fanfare: function () {
      var c = ac(); if (!c) return; var t = c.currentTime + 0.05;
      [523.25, 659.25, 783.99, 1046.5].forEach(function (f, i) { tone({ f: f, dur: i === 3 ? 0.9 : 0.22, gain: 0.18, type: "triangle", at: t + i * 0.13 }); });
    }
  };

  // ---------- nahrávky (b.hra.zvuk) ----------
  // MP3 se načte a dekóduje do Web Audia (jde pak přehrávat úryvky a víckrát přes sebe).
  // Když se nenačte (bez sítě a mimo cache, jednosouborová ukázka), hra použije syntetický zvuk.
  var BUF = {};
  function loadSample(src) {
    var c = ac(); if (!src || !c || BUF[src]) return;
    BUF[src] = "loading";
    fetch(src).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
      .then(function (a) { return new Promise(function (ok, ko) { c.decodeAudioData(a, ok, ko); }); })
      .then(function (buf) { BUF[src] = buf; }, function () { delete BUF[src]; });
  }
  // o = { offset, dur, gain, rate, loop, fadeIn, fadeOut } → { stop() } nebo null (nahrávka není připravená)
  function sample(src, o) {
    var c = ac(), buf = src && BUF[src];
    if (!c || !buf || buf === "loading") { loadSample(src); return null; }
    o = o || {};
    var t = c.currentTime, peak = o.gain || 1, fi = o.fadeIn || 0.015, fo = o.fadeOut || 0.12;
    var s = c.createBufferSource(); s.buffer = buf; s.loop = !!o.loop;
    if (o.rate) s.playbackRate.value = o.rate;
    var gn = c.createGain();
    gn.gain.setValueAtTime(0, t); gn.gain.linearRampToValueAtTime(peak, t + fi);
    var off = (o.offset || 0) % buf.duration;
    s.connect(gn); gn.connect(c.destination); s.start(t, off);
    if (o.dur) {
      gn.gain.setValueAtTime(peak, t + Math.max(fi, o.dur - fo)); gn.gain.linearRampToValueAtTime(0, t + o.dur);
      s.stop(t + o.dur + 0.05);
    }
    return { stop: function () {
      var n = c.currentTime;
      try { gn.gain.cancelScheduledValues(n); gn.gain.setValueAtTime(gn.gain.value, n); gn.gain.linearRampToValueAtTime(0, n + 0.15); s.stop(n + 0.2); } catch (e) {}
    } };
  }

  // ---------- společný rámeček minihry ----------
  // o = { svg, dots, tip, label } → api { box, stage, svg, set(n), say(t), finish(), finished }
  function shell(b, hotovo, o) {
    var h = b.hra;
    var box = E("div", { class: "hra hr-" + h.typ });
    box.appendChild(E("span", { class: "kicker", text: h.kicker || "Úkol" }));
    box.appendChild(E("h3", { text: h.nadpis }));
    box.appendChild(E("p", { text: h.zadani }));
    var stage = E("div", { class: "dj-stage hr-stage", html: o.svg });
    if (o.label) { stage.setAttribute("role", "group"); stage.setAttribute("aria-label", o.label); }
    box.appendChild(stage);
    var tip = null;
    if (o.tip && !hotovo) { tip = E("span", { class: "dj-tip hr-tip" + (o.tipTop ? " hr-tip-top" : ""), text: o.tip }); stage.appendChild(tip); }
    var dots = E("div", { class: "dj-dots", "aria-hidden": "true" });
    for (var k = 0; k < (o.dots || 0); k++) dots.appendChild(E("i"));
    if (o.dots) box.appendChild(dots);
    var live = E("p", { class: "dj-count", "aria-live": "polite" });
    box.appendChild(live);
    var fb = E("div", { class: "feedback ok", hidden: "", text: h.hotovo });
    box.appendChild(fb);
    var api = {
      box: box, stage: stage, svg: stage.querySelector("svg"), finished: !!hotovo,
      set: function (n) { Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k < n ? "on" : ""; }); },
      say: function (t) { live.textContent = t || ""; },
      hideTip: function () { if (tip) tip.hidden = true; },
      tip: function (t) { if (tip) { tip.textContent = t; tip.hidden = false; } },
      bump: function () { if (!reduced) restart(stage, "bump"); },
      finish: function (quiet) {
        api.finished = true; api.hideTip(); api.say("");
        box.classList.add("done"); fb.hidden = false; api.set(o.dots || 0);
        if (quiet) return;
        vibrate([30, 60, 30, 60, 90]);
        SFX.fanfare();
        if (onDoneRef) setTimeout(onDoneRef, 900);
      }
    };
    var onDoneRef = null;
    api.onDone = function (fn) { onDoneRef = fn; };
    if (hotovo) { box.classList.add("done"); fb.hidden = false; api.set(o.dots || 0); }
    return api;
  }
  // tlačítko přes část kresby (x, y = střed v jednotkách kresby; w, h v procentech scény)
  function hotspot(x, y, w, h, label) {
    return E("button", { class: "hr-hot", "aria-label": label,
      style: "left:" + f1(x / 2) + "%;top:" + f1(y / 1.5) + "%;width:" + w + "%;height:" + h + "%" });
  }

  // =====================================================================
  // 2) Hasičárna: uhas klubovnu pivem
  // =====================================================================
  HRY.haseni = function (b, hotovo, onDone) {
    var P = "hs-";
    // [x, y] = pata plamene; okna, věž a střecha zbrojnice
    var F = [[36, 92], [96, 92], [126, 71], [126, 99], [30, 70], [100, 69]];
    var HP = 2; // kolik stříknutí plamen potřebuje
    var flame = "M-6 0 C-9 -6 -4 -9 -3.5 -14 C-1 -10 1.5 -11 1 -17 C5 -12 9 -7 6 0 Z";
    var core = "M-3 0 C-4.5 -3 -1.5 -5 -0.5 -8.5 C1 -5.5 4 -3.5 3 0 Z";
    var NOZ = { x: 150, y: 95 };
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hořící hasičská zbrojnice a sud piva s hadicí">' +
      defs(P) + backdrop("img/racice/2-zbrojnice.svg") +
      // proudnice napojená na sud
      ln(P, "M168 108 C166 100 160 97 154 96.5", 2.4) +
      '<path d="M146 93 L155 94.5 L154.4 98.6 L145.6 97.4 Z" fill="#e9e5db"/>' + ln(P, "M146 93 L155 94.5 L154.4 98.6 L145.6 97.4 Z", 1.4) +
      F.map(function (p, k) {
        return '<g class="hs-fire" data-k="' + k + '" transform="translate(' + p[0] + ' ' + p[1] + ') scale(1.35)">' +
          '<g class="hs-smoke" fill="#b8b2a6" opacity="0"><circle cx="-2" cy="-6" r="3"/><circle cx="2" cy="-11" r="3.6"/><circle cx="-1" cy="-17" r="4"/></g>' +
          '<g class="hs-fl" style="animation-delay:-' + (k * 0.17).toFixed(2) + 's">' +
            '<path d="' + flame + '" fill="#f6dcc9"/><path d="' + flame + '" fill="url(#' + P + 'red)" opacity=".9"/>' +
            ln(P, flame, 1.1) +
            '<path d="' + core + '" fill="#f5c400"/>' + ln(P, core, 0.7) +
          '</g></g>';
      }).join("") +
      // proud piva a pěna
      '<g class="hs-beer"><path class="hs-jet" pathLength="100" stroke="#c99400" stroke-width="3" fill="none" stroke-linecap="round"/>' +
        '<path class="hs-jet" pathLength="100" stroke="#f5c400" stroke-width="1.8" fill="none" stroke-linecap="round"/></g>' +
      '<g class="hs-foam" fill="#fffdf7" stroke="' + INK + '" stroke-width=".5"><circle r="2.2"/><circle r="1.8"/><circle r="1.6"/><circle r="1.3"/></g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: F.length, tip: "Klepej na plameny", label: "Hořící zbrojnice" });
    g.onDone(onDone);
    if (!hotovo) loadSample(b.hra.zvuk);
    var hp = F.map(function () { return hotovo ? 0 : HP; });
    var fires = g.svg.querySelectorAll(".hs-fire");
    var jets = g.svg.querySelectorAll(".hs-jet"), beer = g.svg.querySelector(".hs-beer"), foam = g.svg.querySelector(".hs-foam");
    function out() { return hp.filter(function (x) { return x === 0; }).length; }
    function paint() {
      Array.prototype.forEach.call(fires, function (f, k) {
        f.setAttribute("data-hp", hp[k]);
        var fl = f.querySelector(".hs-fl"); fl.style.transform = hp[k] === HP ? "" : hp[k] ? "scale(.55)" : "scale(0)";
      });
      g.set(out());
    }
    function spray(k) {
      var p = F[k], tx = p[0], ty = p[1] - 8;
      var mx = (NOZ.x + tx) / 2, my = Math.min(NOZ.y, ty) - 30;
      var d = "M" + NOZ.x + " " + NOZ.y + " Q" + f1(mx) + " " + f1(my) + " " + tx + " " + f1(ty);
      Array.prototype.forEach.call(jets, function (j) { j.setAttribute("d", d); });
      restart(beer, "go");
      Array.prototype.forEach.call(foam.children, function (c, i) {
        c.setAttribute("cx", f1(tx - 4 + i * 2.7)); c.setAttribute("cy", f1(ty + 2 - (i % 2) * 3));
      });
      restart(foam, "go");
      // syčení hadice: kus nahrávky b.hra.zvuk, pokaždé odjinud
      if (!sample(b.hra.zvuk, { offset: Math.random() * 2, dur: 0.75, gain: 0.9, fadeOut: 0.25, rate: 0.95 + Math.random() * 0.1 })) SFX.spray();
    }
    F.forEach(function (p, k) {
      var btn = hotspot(p[0], p[1] - 10, 15, 19, "Uhasit plamen " + (k + 1));
      if (hotovo) btn.disabled = true;
      btn.addEventListener("click", function () {
        if (g.finished || hp[k] === 0) return;
        g.hideTip();
        hp[k]--;
        spray(k);
        vibrate(20);
        if (hp[k] === 0) {
          btn.disabled = true;
          setTimeout(function () { SFX.hiss(); restart(fires[k], "puff"); }, 280);
          g.say("Uhašeno " + out() + " z " + F.length + ".");
        }
        setTimeout(paint, 250);
        if (out() === F.length) {
          setTimeout(function () { g.finish(); }, 700);
        }
      });
      g.stage.appendChild(btn);
    });
    paint();
    return g.box;
  };

  // =====================================================================
  // 3) Školka: setři kaši a přemaluj školku na žluto (nápis NA KAŠI ZÁLEŽÍ → NAŠÍ MLÁDEŽI)
  // =====================================================================
  // Dole je dnešní žlutá školka (3-skolka.svg), nahoře bílá s kaší (3-skolka-bila.svg, tools/skolka-kresby.mjs).
  // Kudy hráč přejede prstem, tam se horní vrstva „setře“ a pod ní je žlutá barva i nový nápis.
  HRY.kase = function (b, hotovo, onDone) {
    var P = "ks-", R = 10, HOTOVO = 0.86; // poloměr štětce, kolik fasády stačí
    var BILA = (b.ilustrace && b.ilustrace.predtim) || "img/racice/3-skolka-bila.svg";
    // fasáda školky (obdélníky x0, y0, x1, y1), podle ní se měří, kolik je hotovo
    var ZDI = [[6, 62, 64, 140], [136, 62, 194, 140], [62, 34, 138, 140]];
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Bílá školka zamazaná kaší s nápisem NA KAŠI ZÁLEŽÍ">' +
      defs(P, '<mask id="' + P + 'm" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="150"><rect width="200" height="150" fill="#fff"/>' +
        '<g class="ks-rag" fill="none" stroke="#000" stroke-width="' + (R * 2) + '" stroke-linecap="round" stroke-linejoin="round"></g></mask>') +
      backdrop(b.ilustrace && b.ilustrace.obrazek || "img/racice/3-skolka.svg") +
      '<g class="ks-top" mask="url(#' + P + 'm)">' + backdrop(BILA) + '</g>' +
      '<g class="ks-shine" fill="none" stroke="' + INK + '" stroke-width="1" stroke-linecap="round"></g>' +
      '</svg>';
    var DOTS = 8;
    var g = shell(b, hotovo, { svg: svg, dots: DOTS, tip: "Přejížděj prstem po školce", label: "Školka zamazaná kaší, setři ji a natři tažením prstu" });
    g.onDone(onDone);
    var rag = g.svg.querySelector(".ks-rag"), top = g.svg.querySelector(".ks-top");
    // body na fasádě, které je potřeba přetřít
    var pts = [];
    ZDI.forEach(function (z) {
      for (var x = z[0] + 2; x < z[2]; x += 4) for (var y = z[1] + 2; y < z[3]; y += 4) {
        if (pts.some(function (p) { return Math.abs(p[0] - x) < 2 && Math.abs(p[1] - y) < 2; })) continue;
        pts.push([x, y, false]);
      }
    });
    var hit = 0, step = 0;
    function podil() { return hit / pts.length; }
    if (hotovo) top.style.opacity = 0;

    var line = null, last = null, sndStop = null, sndT = 0;
    function rub(p) {
      pts.forEach(function (sp) {
        if (sp[2]) return;
        var dx = sp[0] - p.x, dy = sp[1] - p.y;
        if (dx * dx + dy * dy < R * R) { sp[2] = true; hit++; }
      });
      var k = Math.min(DOTS, Math.floor(podil() / HOTOVO * DOTS));
      if (k > step) {
        step = k; g.set(k); vibrate(15);
        if (k < DOTS) { SFX.pop(); sparkle(p.x, p.y - 6); g.say("Natřeno " + Math.round(k / DOTS * 100) + " %."); }
      }
      if (podil() >= HOTOVO && !g.finished) {
        top.classList.add("pryc"); // zbytek kaše zmizí sám
        zvuk(false);
        g.finish();
      }
    }
    function sparkle(x, y) {
      var sh = g.svg.querySelector(".ks-shine");
      var gg = document.createElementNS("http://www.w3.org/2000/svg", "g");
      gg.setAttribute("class", "ks-spark");
      gg.setAttribute("transform", "translate(" + f1(x) + " " + f1(y) + ")");
      gg.innerHTML = '<path d="M0 -5 V5 M-5 0 H5 M-3 -3 L3 3 M3 -3 L-3 3"/>';
      sh.appendChild(gg);
      setTimeout(function () { gg.remove(); }, 900);
    }
    // zvuk drhnutí hraje, dokud se prst hýbe (nahrávka b.hra.zvuk, jinak syntetický šum)
    function zvuk(on) {
      clearTimeout(sndT);
      if (!on) { if (sndStop) { sndStop(); sndStop = null; } return; }
      if (!sndStop) {
        var h = sample(b.hra.zvuk, { loop: true, offset: Math.random() * 3, gain: 0.9, fadeIn: 0.06 });
        sndStop = h ? h.stop : null;
        if (!h) SFX.wipe();
      }
      sndT = setTimeout(function () { zvuk(false); }, 180);
    }
    function add(p) {
      if (!line) return;
      if (last) {
        var dx = p.x - last.x, dy = p.y - last.y, dist = Math.sqrt(dx * dx + dy * dy), steps = Math.ceil(dist / 3);
        for (var i = 1; i <= steps; i++) rub({ x: last.x + dx * i / steps, y: last.y + dy * i / steps });
        if (dist > 1.2 && !g.finished) zvuk(true);
      } else rub(p);
      line.setAttribute("points", (line.getAttribute("points") || "") + " " + f1(p.x) + "," + f1(p.y));
      last = p;
    }
    var st = g.stage;
    st.addEventListener("pointerdown", function (e) {
      if (g.finished) return;
      g.hideTip();
      loadSample(b.hra.zvuk);
      try { st.setPointerCapture(e.pointerId); } catch (x) {}
      line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
      rag.appendChild(line); last = null;
      add(pt(g.svg, e));
      e.preventDefault();
    });
    st.addEventListener("pointermove", function (e) { if (line && !g.finished) add(pt(g.svg, e)); });
    function end() { line = null; last = null; zvuk(false); }
    st.addEventListener("pointerup", end);
    st.addEventListener("pointercancel", end);
    if (!hotovo) { st.classList.add("hr-draw"); loadSample(b.hra.zvuk); }
    // bez dotyku a myši (čtečka obrazovky): tlačítko natře další kus fasády
    var kb = E("button", { class: "hr-sr", text: "Natřít další kus školky" });
    kb.addEventListener("click", function () {
      var z = ZDI.filter(function (w) { return pts.some(function (p) { return !p[2] && p[0] > w[0] && p[0] < w[2] && p[1] > w[1] && p[1] < w[3]; }); })[0];
      if (!z) return;
      line = document.createElementNS("http://www.w3.org/2000/svg", "polyline"); rag.appendChild(line); last = null;
      for (var y = z[1]; y <= z[3]; y += 12) { add({ x: z[0], y: y }); add({ x: z[2], y: y + 6 }); }
      end();
    });
    if (!hotovo) g.box.appendChild(kb);
    return g.box;
  };

  // =====================================================================
  // 4) Kříž: zapal svíčku
  // =====================================================================
  HRY.svicka = function (b, hotovo, onDone) {
    var P = "sv-", HOLD = 1600; // jak dlouho držet prst (ms)
    var flame = "M0 0 C-4 -3 -4 -9 0 -18 C4 -9 4 -3 0 0 Z", core = "M0 -1 C-1.8 -3 -1.8 -6 0 -10 C1.8 -6 1.8 -3 0 -1 Z";
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Svíčka ve skleničce u paty památného kříže">' +
      defs(P, '<radialGradient id="' + P + 'glow"><stop offset="0" stop-color="#ffd84a" stop-opacity=".75"/><stop offset=".5" stop-color="#ffd84a" stop-opacity=".25"/><stop offset="1" stop-color="#ffd84a" stop-opacity="0"/></radialGradient>') +
      paper(P) +
      // kopec a obloha jako na kresbě kříže
      ln(P, "M88 110 C120 102 160 100 196 106", 0.8) + ln(P, "M160 18 C163 12 170 12 172 17 C178 15 182 20 178 23 H160 C156 22 157 18 160 18 Z", 0.8) +
      // kříž: dřík a podstavec
      shape(P, "M34 0 H52 V96 H34 Z", "#f9f7f1", 1.8) + '<path d="M34 0 H52 V96 H34 Z" fill="url(#' + P + 'x)" opacity=".5"/>' +
      ln(P, "M40 30 L44 44 L41 56", 0.7) +
      shape(P, "M14 96 H74 V110 H14 Z", "#f9f7f1", 1.8) + shape(P, "M6 110 H86 V139 H6 Z", "#f9f7f1", 1.8) +
      '<path d="M6 110 H86 V139 H6 Z" fill="url(#' + P + 'xx)" opacity=".35"/>' +
      ln(P, "M26 120 H66 M30 126 H62", 0.8) +
      // záře
      '<circle class="sv-glow" cx="130" cy="86" r="46" fill="url(#' + P + 'glow)"/>' +
      // svíčka ve skleničce
      '<path d="M114 138 L112 92 H148 L146 138 Z" fill="#fbf8f0" opacity=".85"/>' +
      shape(P, "M119 137 V104 C119 101 141 101 141 104 V137 Z", "#fffdf7", 1.4) +
      '<path d="M119 104 C119 101 141 101 141 104 C141 107 119 107 119 104 Z" fill="#f1ece0"/>' + ln(P, "M119 104 C119 107 141 107 141 104", 0.9) +
      '<path d="M114 138 L112 92 H148 L146 138 Z" fill="url(#' + P + 'red)" opacity=".28"/>' +
      ln(P, "M114 138 L112 92 M148 92 L146 138 M112 92 C112 89 148 89 148 92 C148 95 112 95 112 92", 1.4) +
      ln(P, "M114 138 C114 141 146 141 146 138", 1.4) + ln(P, "M117 98 L118 128", 0.8, ' opacity=".5"', "#fff") +
      ln(P, "M130 104 C130 101 131 99 130 97", 1.1) +
      // plamen svíčky
      '<g class="sv-flame" transform="translate(130 97)"><g class="sv-fl"><path d="' + flame + '" fill="#ffe9a0"/>' + ln(P, flame, 1.1) +
        '<path d="' + core + '" fill="#f5c400"/></g></g>' +
      // sirka a ukazatel držení
      '<g class="sv-match"><path d="M170 66 L134 94" stroke="#d8b98a" stroke-width="3.2" stroke-linecap="round"/>' + ln(P, "M170 66 L134 94", 0.6) +
        '<circle cx="134" cy="94" r="2.6" fill="#c2341e"/>' +
        '<g class="sv-mf" transform="translate(133 92) rotate(-38)"><path d="' + flame + '" transform="scale(.5)" fill="#ffe9a0" stroke="' + INK + '" stroke-width="1.6"/></g></g>' +
      '<circle class="sv-ring" cx="130" cy="94" r="15" fill="none" stroke="' + INK + '" stroke-width="2.2" stroke-dasharray="94.25" stroke-dashoffset="94.25" transform="rotate(-90 130 94)" stroke-linecap="round"/>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, tip: "Podrž prst na knotu", label: "Svíčka u kříže" });
    g.onDone(onDone);
    if (!hotovo) loadSample(b.hra.zvuk);
    var s = g.svg, ring = s.querySelector(".sv-ring"), btn = hotspot(132, 96, 36, 46, "Zapálit svíčku (podrž)");
    g.stage.appendChild(btn);
    var t0 = 0, raf = 0;
    function lit() { s.classList.add("lit"); btn.disabled = true; }
    if (hotovo) lit();
    function frame() {
      var p = Math.min(1, (Date.now() - t0) / HOLD);
      ring.style.strokeDashoffset = f1(94.25 * (1 - p));
      if (p >= 1) {
        stop(true);
        lit(); SFX.bell(); g.finish();
        return;
      }
      raf = requestAnimationFrame(frame);
    }
    function start(e) {
      if (g.finished || t0) return;
      if (e) e.preventDefault();
      g.hideTip(); g.say("");
      t0 = Date.now(); s.classList.add("holding"); vibrate(15);
      if (!sample(b.hra.zvuk, { gain: 1 })) SFX.match(); // škrtnutí sirky
      raf = requestAnimationFrame(frame);
    }
    function stop(ok) {
      if (!t0) return;
      cancelAnimationFrame(raf);
      var early = ok !== true;
      t0 = 0; s.classList.remove("holding"); ring.style.strokeDashoffset = "94.25";
      if (early && !g.finished) { g.say("Sirka zhasla. Drž prst o chvilku déle."); g.tip("Podrž prst na knotu"); }
    }
    btn.addEventListener("pointerdown", function (e) { try { btn.setPointerCapture(e.pointerId); } catch (x) {} start(e); });
    btn.addEventListener("pointerup", stop);
    btn.addEventListener("pointercancel", stop);
    btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    btn.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && !e.repeat) start(e); });
    btn.addEventListener("keyup", function (e) { if (e.key === " " || e.key === "Enter") stop(); });
    return g.box;
  };

  // =====================================================================
  // 5) Stadion: tleskej do rytmu RA-ČI-CE!
  // =====================================================================
  HRY.tleskani = function (b, hotovo, onDone) {
    var P = "tl-", NEED = b.hra.tlesknuti || 9, BEAT = 60 / (b.hra.tempo || 108), WIN = 0.17;
    var SYL = [["RA", 26], ["ČI", 50], ["CE!", 76]], SLOT = [26, 50, 74];
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Fotbalový stadion, amplion a tabule s pokřikem RA-ČI-CE">' +
      defs(P) + backdrop("img/racice/5-stadion.svg") +
      // tabule s pokřikem nad brankou
      '<g class="tl-board">' + shape(P, "M6 6 H96 V56 H6 Z", "#fffdf7", 1.6) +
      SYL.map(function (s, i) {
        return '<text class="tl-syl" data-i="' + i + '" x="' + s[1] + '" y="25" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="14" fill="' + INK + '">' + s[0] + '</text>';
      }).join("") +
      SLOT.map(function (x, i) {
        return '<g class="tl-slot" data-i="' + i + '" transform="translate(' + x + ' 43)">' +
          '<circle class="tl-ring" r="18" fill="none" stroke="#c2341e" stroke-width="1.6"/>' +
          '<circle class="tl-pad" r="8.5" fill="#fff" stroke="' + INK + '" stroke-width="1.4"/>' +
          // dvě tleskající dlaně
          '<g transform="rotate(-24)"><path d="M-1 4.5 C-5 4 -5.6 -1 -4.6 -5.2 C-4.2 -6.4 -2.6 -6.2 -2.5 -5 L-1 -1.5 Z" fill="#f6e2da" stroke="' + INK + '" stroke-width=".8" stroke-linejoin="round"/></g>' +
          '<g transform="rotate(24)"><path d="M1 4.5 C5 4 5.6 -1 4.6 -5.2 C4.2 -6.4 2.6 -6.2 2.5 -5 L1 -1.5 Z" fill="#f6e2da" stroke="' + INK + '" stroke-width=".8" stroke-linejoin="round"/></g>' +
          '<path d="M-6.5 -5 L-8 -7 M6.5 -5 L8 -7 M0 -6.5 V-8.5" stroke="' + INK + '" stroke-width=".7" stroke-linecap="round"/>' +
          '</g>';
      }).join("") + '</g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: NEED, label: "Tleskání do rytmu" });
    g.onDone(onDone);
    var s = g.svg, syl = s.querySelectorAll(".tl-syl"), slots = s.querySelectorAll(".tl-slot");
    var hits = hotovo ? NEED : 0, running = false, t0 = 0, events = [], scheduledTo = 0, bar = 0;
    var startBtn = E("button", { class: "btn btn-primary hr-start", text: "▶ Začít tleskat" });
    var pad = E("button", { class: "hr-hot hr-pad", "aria-label": "Tlesk", hidden: "" });
    g.stage.appendChild(pad);
    if (!hotovo) g.stage.appendChild(startBtn);
    else s.classList.add("all");
    g.set(hits);

    var perf = { t0: performance.now() / 1000 };
    function now() { var c = AC; return c ? c.currentTime : performance.now() / 1000 - perf.t0; }
    // takt = 8 dob: RA ČI CE · tlesk tlesk tlesk ·
    function scheduleBar(start, k) {
      [0, 1, 2].forEach(function (i) { events.push({ t: start + i * BEAT, kind: "syl", i: i, bar: k }); if (AC) SFX.drum(start + i * BEAT, i === 2); });
      [4, 5, 6].forEach(function (i, j) {
        events.push({ t: start + i * BEAT, kind: "clap", i: j, bar: k, demo: k === 0 });
        if (AC && k === 0) SFX.clap(start + i * BEAT); // první takt předvede tleskání
      });
    }
    function loop() {
      if (!running) return;
      if (!g.box.isConnected) { running = false; return; }
      var t = now();
      while (scheduledTo < t + 0.4) { scheduleBar(scheduledTo, bar++); scheduledTo += 8 * BEAT; }
      // zvýraznění slabik a přibližující se kroužky
      var cur = Math.floor((t - t0) / BEAT), inBar = ((cur % 8) + 8) % 8, curBar = Math.floor((t - t0) / (8 * BEAT));
      Array.prototype.forEach.call(syl, function (n, i) { n.classList.toggle("on", inBar === i); });
      Array.prototype.forEach.call(slots, function (n, i) {
        var ev = events.find(function (e) { return e.kind === "clap" && e.i === i && e.t > t - WIN && e.t < t + BEAT * 1.2; });
        var ring = n.querySelector(".tl-ring");
        if (ev && !ev.hit) {
          var k = Math.max(0, (ev.t - t) / (BEAT * 1.2));
          ring.setAttribute("r", f1(8 + 12 * k)); ring.style.opacity = ev.t < t ? 0.3 : 1;
        } else ring.style.opacity = 0;
        n.classList.toggle("demo", curBar === 0 && inBar === 4 + i);
      });
      g.say(curBar === 0 ? "Poslouchej… a teď ty!" : "");
      events = events.filter(function (e) { return e.t > t - 1; });
      requestAnimationFrame(loop);
    }
    function start() {
      ac();
      startBtn.remove(); pad.hidden = false;
      running = true;
      t0 = now() + 0.35; scheduledTo = t0; bar = 0; events = [];
      requestAnimationFrame(loop);
      pad.focus({ preventScroll: true });
    }
    startBtn.addEventListener("click", start);
    function tap(e) {
      if (!running || g.finished) return;
      if (e) e.preventDefault();
      var t = now();
      SFX.clap();
      var best = null;
      events.forEach(function (ev) { if (ev.kind === "clap" && !ev.demo && !ev.hit && Math.abs(ev.t - t) < WIN && (!best || Math.abs(ev.t - t) < Math.abs(best.t - t))) best = ev; });
      if (best) {
        best.hit = true; hits++; g.set(hits); vibrate(25);
        var n = slots[best.i]; restart(n, "hit");
        if (hits >= NEED) { running = false; s.classList.add("all"); pad.disabled = true; setTimeout(function () { g.finish(); }, 300); }
      } else {
        g.bump(); vibrate([10, 30, 10]);
      }
    }
    pad.addEventListener("pointerdown", tap);
    pad.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && !e.repeat) tap(e); });
    pad.addEventListener("click", function (e) { e.preventDefault(); });
    return g.box;
  };

  // =====================================================================
  // 6) Sochy: obuj Floriánovi gumáky
  // =====================================================================
  HRY.gumaky = function (b, hotovo, onDone) {
    var P = "gm-";
    var SLOT = [{ x: 91.5, y: 88.5 }, { x: 107, y: 88.5 }];
    var HOME = [{ x: 34, y: 129 }, { x: 166, y: 129 }];
    var boot = "M-5.5 -9.5 H5.5 L5.8 4 C8.6 5 9 9 6 9.8 H-6 C-9 9 -8.6 5 -5.8 4 Z";
    function bootSvg(k, dashed) {
      if (dashed) return '<path d="' + boot + '" fill="none" stroke="#8a847a" stroke-width="1" stroke-dasharray="2 2"/>';
      return '<path d="' + boot + '" fill="#d6d1c6"/><path d="' + boot + '" fill="url(#' + P + 'xx)" opacity=".8"/>' +
        '<path d="M-5.6 -6.5 H5.6 V-4 H-5.6 Z" fill="#f5c400"/>' + ln(P, boot, 1.4) + ln(P, "M-5.6 -6.5 H5.6 M-5.6 -4 H5.6 M-7 6.5 H7", 0.7);
    }
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Socha svatého Floriána bez nohou a dva gumáky na zemi">' +
      defs(P) + backdrop("img/racice/6-florian.svg") +
      // nohy sochy pryč: zakrýt papírem a nakreslit ulomené pahýly
      '<rect x="85.6" y="79.6" width="27.6" height="18.6" fill="#f7f4ec"/>' +
      ln(P, "M86.5 79.5 L88 82 L90 80 L92 83 L94 80.5 L96 82 L97 80", 1.2) + ln(P, "M101.5 80 L103 82.5 L105 80 L107 83 L109 80.5 L111 82 L112.5 80", 1.2) +
      ln(P, "M86.5 79.5 V80.5 M97 80 V79.5 M101.5 80 V79.5 M112.5 80 V79.5", 1.2) +
      ln(P, "M90 92 L91.5 95 M104 93 L106 96.5 M95 96 L96.5 97", 0.7) + // úlomky
      SLOT.map(function (p, k) { return '<g class="gm-slot" data-k="' + k + '" transform="translate(' + p.x + ' ' + p.y + ')">' + bootSvg(k, true) + '</g>'; }).join("") +
      HOME.map(function (p, k) {
        return '<g class="gm-boot" data-k="' + k + '" transform="translate(' + p.x + ' ' + p.y + ')" tabindex="0" role="button" aria-label="' + (k ? "Pravý" : "Levý") + ' gumák">' +
          '<rect x="-15" y="-16" width="30" height="30" fill="transparent"/>' + bootSvg(k) + '</g>';
      }).join("") +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: 2, tipTop: true, tip: "Přetáhni gumáky na sochu", label: "Socha a gumáky" });
    g.onDone(onDone);
    var s = g.svg, boots = s.querySelectorAll(".gm-boot"), slots = s.querySelectorAll(".gm-slot");
    var pos = HOME.map(function (p) { return { x: p.x, y: p.y }; }), filled = [null, null], placed = [false, false];
    function put(k, p) { pos[k] = p; boots[k].setAttribute("transform", "translate(" + f1(p.x) + " " + f1(p.y) + ")"); }
    function count() { return placed.filter(Boolean).length; }
    function snap(k, si) {
      filled[si] = k; placed[k] = true;
      boots[k].classList.add("on"); slots[si].style.opacity = 0;
      animate(k, SLOT[si]);
      g.set(count()); SFX.pop(); vibrate(30);
      g.say(count() < 2 ? "Jedna noha je obutá." : "");
      if (count() === 2) setTimeout(function () { s.classList.add("all"); g.finish(); }, 350);
    }
    function animate(k, to) {
      var from = { x: pos[k].x, y: pos[k].y }, t0 = performance.now(), dur = reduced ? 1 : 260;
      (function step() {
        var p = Math.min(1, (performance.now() - t0) / dur), e = 1 - Math.pow(1 - p, 3);
        put(k, { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - Math.sin(p * Math.PI) * 10 * (dur > 1 ? 1 : 0) });
        if (p < 1) requestAnimationFrame(step);
      })();
    }
    function freeSlot(p) {
      var best = -1, bd = 1e9;
      SLOT.forEach(function (sl, i) { if (filled[i] !== null) return; var d = Math.hypot(sl.x - p.x, sl.y - p.y); if (d < bd) { bd = d; best = i; } });
      return { i: best, d: bd };
    }
    if (hotovo) { [0, 1].forEach(function (k) { filled[k] = k; placed[k] = true; put(k, SLOT[k]); boots[k].classList.add("on"); slots[k].style.opacity = 0; }); s.classList.add("all"); }
    Array.prototype.forEach.call(boots, function (bt, k) {
      var drag = null;
      bt.addEventListener("pointerdown", function (e) {
        if (g.finished || placed[k]) return;
        e.preventDefault(); g.hideTip();
        try { bt.setPointerCapture(e.pointerId); } catch (x) {}
        var p = pt(s, e);
        drag = { dx: pos[k].x - p.x, dy: pos[k].y - p.y, moved: 0, start: p };
        bt.classList.add("lift"); SFX.whoosh();
      });
      bt.addEventListener("pointermove", function (e) {
        if (!drag) return;
        var p = pt(s, e);
        drag.moved = Math.max(drag.moved, Math.hypot(p.x - drag.start.x, p.y - drag.start.y));
        put(k, { x: p.x + drag.dx, y: p.y + drag.dy });
      });
      function up() {
        if (!drag) return;
        var moved = drag.moved; drag = null; bt.classList.remove("lift");
        var f = freeSlot(pos[k]);
        // klepnutí bez tažení gumák rovnou obuje (pro malé prsty a čtečky obrazovky)
        if (moved < 3 || f.d < 16) snap(k, f.i);
        else { animate(k, HOME[k]); vibrate(10); }
      }
      bt.addEventListener("pointerup", up);
      bt.addEventListener("pointercancel", up);
      bt.addEventListener("keydown", function (e) {
        if ((e.key === "Enter" || e.key === " ") && !placed[k] && !g.finished) { e.preventDefault(); snap(k, freeSlot(pos[k]).i); }
      });
    });
    g.stage.classList.add("hr-draw");
    return g.box;
  };

  // =====================================================================
  // 7) Sokolovna: udrž Aloise Hudce na kruzích
  // =====================================================================
  HRY.kruhy = function (b, hotovo, onDone) {
    var P = "kr-", NEED = b.hra.sekund || 6, ZONE = 7, PIV = { x: 100, y: -20 };
    var bars = function (x) {
      var d = "M" + x + " 14 V138 M" + (x + 16) + " 14 V138";
      for (var y = 22; y < 136; y += 9) d += " M" + x + " " + y + " H" + (x + 16);
      return ln(P, d, 0.9, ' opacity=".55"');
    };
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gymnasta Alois Hudec drží kříž na kruzích v sokolovně">' +
      defs(P) + paper(P, false) +
      bars(6) + bars(178) +
      // podlaha a žíněnka se žlutým pruhem „v klidu“
      ln(P, "M0 138 H200", 1) +
      shape(P, "M58 129 H142 L146 138 H54 Z", "#f1ece0", 1.3) + '<path d="M58 129 H142 L146 138 H54 Z" fill="url(#' + P + 'x)" opacity=".35"/>' +
      '<path class="kr-zone" d="M' + f1(100 - 137 * Math.sin(ZONE * Math.PI / 180)) + ' 129 H' + f1(100 + 137 * Math.sin(ZONE * Math.PI / 180)) + ' L' + f1(101 + 137 * Math.sin(ZONE * Math.PI / 180)) + ' 133 H' + f1(99 - 137 * Math.sin(ZONE * Math.PI / 180)) + ' Z" fill="url(#' + P + 'yel)"/>' +
      ln(P, "M100 124 V136", 1, ' stroke-dasharray="2 2"') +
      ln(P, "M30 3 H170", 2.2) +
      '<g class="kr-man">' +
        ln(P, "M72 3 L72 42 M128 3 L128 42", 1.2) +
        '<circle cx="72" cy="48" r="6" fill="none" stroke="' + INK + '" stroke-width="2.2" filter="url(#' + P + 'w1)"/>' +
        '<circle cx="128" cy="48" r="6" fill="none" stroke="' + INK + '" stroke-width="2.2" filter="url(#' + P + 'w1)"/>' +
        ln(P, "M73 51 C80 52 88 52.5 94 53 M127 51 C120 52 112 52.5 106 53", 2.6) +
        shape(P, "M93.5 52 H106.5 L104.5 81 H95.5 Z", "#fff8d6", 1.6) + '<path d="M93.5 52 H106.5 L104.5 81 H95.5 Z" fill="url(#' + P + 'yel)" opacity=".7"/>' +
        ln(P, "M96 81 C96.5 92 97.5 104 98 113 M104 81 C103.5 92 102.5 104 102 113 M100 84 V112", 1.6) +
        ln(P, "M98 113 L99.4 119 M102 113 L100.6 119", 1.6) +
        shape(P, "M100 34.5 C104 34.5 106.5 37.5 106.5 41.5 C106.5 45.5 104 48.5 100 48.5 C96 48.5 93.5 45.5 93.5 41.5 C93.5 37.5 96 34.5 100 34.5 Z", "#fffdf7", 1.5) +
        ln(P, "M94 39 C95 35 99 33.5 103 34.5 C105 35 106 37 106.4 39", 1.8) +
        ln(P, "M98 44.5 C99.3 45.4 100.7 45.4 102 44.5", 0.8) +
        '<text x="100" y="69" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="5" fill="' + INK + '">S</text>' +
      '</g>' +
      '<g class="kr-sweat" fill="#9fc3ee" stroke="' + INK + '" stroke-width=".5"><path d="M110 36 C112 39 112 41 110 41 C108 41 108 39 110 36 Z"/><path d="M89 38 C91 41 91 43 89 43 C87 43 87 41 89 38 Z"/></g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: NEED, tip: "Klepni a začni", label: "Kruhy: klepnutím vlevo nebo vpravo vracíš gymnastu do klidu" });
    g.onDone(onDone);
    var s = g.svg, man = s.querySelector(".kr-man");
    var a = 0, v = 0, push = 0, pushT = 0, still = hotovo ? NEED : 0, running = false, last = 0, lastSec = 0;
    function draw() {
      man.setAttribute("transform", "rotate(" + f1(a) + " " + PIV.x + " " + PIV.y + ")");
      s.classList.toggle("calm", Math.abs(a) < ZONE);
      s.classList.toggle("wobble", Math.abs(a) > 18);
    }
    function loop(ts) {
      if (!running) return;
      if (!g.box.isConnected) { running = false; return; }
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (ts > pushT) { push = (Math.random() - 0.5) * 70; pushT = ts + 500 + Math.random() * 600; }
      v += (a * 1.4 + push) * dt;
      v *= 1 - 0.6 * dt;
      a += v * dt;
      if (a > 32) { a = 32; v = -Math.abs(v) * 0.3; }
      if (a < -32) { a = -32; v = Math.abs(v) * 0.3; }
      if (Math.abs(a) < ZONE) {
        still += dt;
        var sec = Math.floor(still);
        if (sec > lastSec) { lastSec = sec; SFX.tick(); g.set(Math.min(sec, NEED)); }
      }
      g.say(Math.abs(a) < ZONE ? "Drží! " + Math.min(NEED, Math.floor(still)) + " z " + NEED + " s" : a > 0 ? "Houpe se doleva, klepni vlevo!" : "Houpe se doprava, klepni vpravo!");
      draw();
      if (still >= NEED) { running = false; a = 0; v = 0; draw(); g.set(NEED); s.classList.add("all"); g.finish(); return; }
      requestAnimationFrame(loop);
    }
    var left = hotspot(50, 75, 50, 100, "Postrčit doprava (klepni vlevo)");
    var right = hotspot(150, 75, 50, 100, "Postrčit doleva (klepni vpravo)");
    // levá polovina: nohy se houpou doleva (a > 0) → klepnutí vlevo je vrátí doprava (a klesá)
    function nudge(dir, e) {
      if (e) e.preventDefault();
      if (g.finished) return;
      if (!running) { running = true; g.hideTip(); last = performance.now(); v = (Math.random() < 0.5 ? -1 : 1) * 6; requestAnimationFrame(loop); return; }
      v += dir * 15; SFX.whoosh(); vibrate(12);
    }
    left.addEventListener("pointerdown", function (e) { nudge(-1, e); });
    right.addEventListener("pointerdown", function (e) { nudge(1, e); });
    [left, right].forEach(function (bt, i) {
      bt.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && !e.repeat) nudge(i ? 1 : -1, e); });
      bt.addEventListener("click", function (e) { e.preventDefault(); });
      if (hotovo) bt.disabled = true;
      g.stage.appendChild(bt);
    });
    g.box.addEventListener("keydown", function (e) {
      if (e.key === "ArrowLeft") nudge(-1, e); else if (e.key === "ArrowRight") nudge(1, e);
    });
    if (hotovo) s.classList.add("all");
    g.set(Math.floor(still));
    draw();
    return g.box;
  };

  // =====================================================================
  // 8) Úřad: orazítkuj a podepiš výnos
  // =====================================================================
  HRY.vynos = function (b, hotovo, onDone) {
    var P = "vy-", COPIES = 3, SIGN = 70; // délka podpisu v jednotkách kresby
    var ST = { x: 74, y: 112 };
    function sheet(k) {
      var rot = [-2.2, 1.6, 0][k];
      var lines = "";
      [56, 62, 68, 74, 80, 86].forEach(function (y, i) { lines += "M48 " + y + " H" + (i === 5 ? 110 : 150 - (i % 2) * 8) + " "; });
      return '<g class="vy-sheet" data-k="' + k + '" transform="rotate(' + rot + ' 100 75)">' +
        shape(P, "M38 6 H162 V144 H38 Z", "#fffdf7", 1.3) +
        '<text x="156" y="14" text-anchor="end" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4.2" fill="#554c40">' + (k === COPIES - 1 ? "Originál" : "Vyhotovení " + (k + 1) + "/" + COPIES) + '</text>' +
        '<text x="100" y="24" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="13" letter-spacing="1.5" fill="' + INK + '">VÝNOS</text>' +
        '<text x="100" y="32" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4.4" fill="' + INK + '">Okresního národního výboru ve Vyškově</text>' +
        '<text x="100" y="44" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="6" fill="' + INK + '">o sloučení obcí Račice a Pístovice</text>' +
        ln(P, lines, 0.8, ' opacity=".45"') +
        '<circle cx="' + ST.x + '" cy="' + ST.y + '" r="15" fill="none" stroke="#8a847a" stroke-width=".8" stroke-dasharray="2 2"/>' +
        '<text x="' + ST.x + '" y="' + (ST.y + 1.6) + '" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4.6" fill="#8a847a">M. P.</text>' +
        (k === COPIES - 1 ? ln(P, "M104 124 H154", 0.9) + '<text x="129" y="130" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4" fill="#554c40">předseda ONV</text>' : "") +
        // otisk razítka (ukáže se po klepnutí)
        '<g class="vy-imprint" transform="translate(' + ST.x + ' ' + ST.y + ') rotate(' + [-14, 9, -6][k] + ')">' +
          '<path id="' + P + 'c' + k + '" d="M-10 0 A10 10 0 1 1 10 0 A10 10 0 1 1 -10 0" fill="none"/>' +
          '<circle r="13.4" fill="none" stroke="#c2341e" stroke-width="1.5"/><circle r="8.2" fill="none" stroke="#c2341e" stroke-width=".7"/>' +
          '<text font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="3.5" fill="#c2341e" letter-spacing=".3"><textPath href="#' + P + 'c' + k + '">MNV V RAČICÍCH ★ OKRES VYŠKOV ★</textPath></text>' +
          '<text y="2" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="5.6" fill="#c2341e">1960</text>' +
        '</g>' +
      '</g>';
    }
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Výnos o sloučení obcí na stole, razítko a místo pro podpis">' +
      defs(P) +
      '<rect width="200" height="150" fill="#eadcc0"/><rect width="200" height="150" fill="url(#' + P + 'x)" opacity=".18"/><rect width="200" height="150" filter="url(#' + P + 'paper)"/>' +
      // tři vyhotovení: první leží nahoře, originál dospod
      [2, 1, 0].map(sheet).join("") +
      // razítko na stole
      '<g class="vy-stamp" transform="translate(182 116)">' +
        shape(P, "M-11 6 H11 V12 H-11 Z", "#d9cfbd", 1.3) + '<path d="M-11 10 H11 V12 H-11 Z" fill="#c2341e"/>' +
        shape(P, "M-3.5 6 V-6 H3.5 V6 Z", "#e9e5db", 1.2) +
        shape(P, "M0 -16 C5 -16 7 -12 7 -9 C7 -6 4 -5 0 -5 C-4 -5 -7 -6 -7 -9 C-7 -12 -5 -16 0 -16 Z", "#a8643a", 1.3) +
      '</g>' +
      '<path class="vy-ink" fill="none" stroke="#1f3f8f" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: COPIES + 1, tip: "Klepni na M. P.", label: "Výnos k orazítkování a podpisu" });
    g.onDone(onDone);
    var s = g.svg, sheets = s.querySelectorAll(".vy-sheet"), ink = s.querySelector(".vy-ink");
    // sheets[0] = originál (vykreslen první, tedy dospod), sheets[2] = první vyhotovení
    var stamped = 0, inkD = "", inkLen = 0, drawing = null;
    var btn = hotspot(ST.x, ST.y, 22, 28, "Orazítkovat výnos");
    g.stage.appendChild(btn);
    if (hotovo) {
      Array.prototype.forEach.call(sheets, function (sh, i) { sh.classList.add("stamped"); if (i > 0) sh.classList.add("gone"); });
      ink.setAttribute("d", "M110 121 C112 112 116 112 115 121 C114 127 118 113 122 117 C124 120 126 112 130 118 C133 123 136 114 140 119 L150 117");
      btn.disabled = true; btn.hidden = true;
    }
    btn.addEventListener("click", function () {
      if (g.finished || stamped >= COPIES) return;
      g.hideTip();
      var sh = sheets[COPIES - 1 - stamped];
      sh.classList.add("stamped"); restart(sh.querySelector(".vy-imprint"), "pop");
      s.querySelector(".vy-stamp").classList.add("used");
      SFX.thump(); vibrate(40); g.bump();
      stamped++; g.set(stamped);
      if (stamped < COPIES) {
        g.say("Orazítkováno " + stamped + " z " + COPIES + ".");
        setTimeout(function () { sh.classList.add("gone"); SFX.slide(); }, 550);
      } else {
        btn.hidden = true;
        g.say("Ještě podpis na čáru.");
        setTimeout(function () { g.tip("Podepiš se prstem na čáru"); g.stage.classList.add("hr-draw", "vy-sign"); }, 400);
      }
    });
    var st = g.stage, lastP = null, lastSnd = 0;
    st.addEventListener("pointerdown", function (e) {
      if (g.finished || stamped < COPIES) return;
      var p = pt(s, e);
      if (p.y < 92 || p.x < 40 || p.x > 165) return; // podpis jen dole na listu
      e.preventDefault(); g.hideTip();
      try { st.setPointerCapture(e.pointerId); } catch (x) {}
      drawing = true; lastP = p; inkD += "M" + f1(p.x) + " " + f1(p.y) + " "; ink.setAttribute("d", inkD);
    });
    st.addEventListener("pointermove", function (e) {
      if (!drawing) return;
      var p = pt(s, e), d = Math.hypot(p.x - lastP.x, p.y - lastP.y);
      if (d < 0.8) return;
      inkLen += d; lastP = p; inkD += "L" + f1(p.x) + " " + f1(p.y) + " "; ink.setAttribute("d", inkD);
      var now = Date.now(); if (now - lastSnd > 90) { SFX.pen(); lastSnd = now; }
    });
    function up() {
      if (!drawing) return; drawing = false;
      if (inkLen >= SIGN) { g.set(COPIES + 1); st.classList.remove("hr-draw"); g.finish(); }
      else g.say("To je spíš parafa. Podepiš se celým jménem.");
    }
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    // bez dotyku: podpis jedním tlačítkem
    var kb = E("button", { class: "hr-sr", text: "Podepsat výnos" });
    kb.addEventListener("click", function () {
      if (g.finished || stamped < COPIES) return;
      ink.setAttribute("d", "M110 121 C112 112 116 112 115 121 C114 127 118 113 122 117 C124 120 126 112 130 118 C133 123 136 114 140 119 L150 117");
      g.finish();
    });
    if (!hotovo) g.box.appendChild(kb);
    return g.box;
  };
})();
