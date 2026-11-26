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
  // (hra může mít přiblížený viewBox, pak se přepočítá podle něj)
  function pt(svg, e) {
    var r = svg.getBoundingClientRect(), v = svg.viewBox && svg.viewBox.baseVal;
    if (!v || !v.width) v = { x: 0, y: 0, width: 200, height: 150 };
    return { x: v.x + (e.clientX - r.left) / r.width * v.width, y: v.y + (e.clientY - r.top) / r.height * v.height };
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
    return { src: s, gain: gn, stop: function () {
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
  // vb = viewBox hry [x, y, šířka, výška], když je přiblížená
  function hotspot(x, y, w, h, label, vb) {
    vb = vb || [0, 0, 200, 150];
    return E("button", { class: "hr-hot", "aria-label": label,
      style: "left:" + f1((x - vb[0]) / vb[2] * 100) + "%;top:" + f1((y - vb[1]) / vb[3] * 100) + "%;width:" + w + "%;height:" + h + "%" });
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
    var VB = [20, 40, 150, 112.5]; // přiblížení na zbrojnici, ať se na telefonu líp trefuje
    var svg = '<svg viewBox="' + VB.join(" ") + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Hořící hasičská zbrojnice a sud piva s hadicí">' +
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
    var g = shell(b, hotovo, { svg: svg, tip: "Klepej na plameny", label: "Hořící zbrojnice" });
    g.onDone(onDone);
    if (!hotovo) loadSample(b.hra.zvuk);
    // Na začátku hoří čtyři místa. Plamen, který nikdo nehasí, po chvíli přeskočí na sousední okno
    // a přiškrcený plamen se zase rozhoří. Piva je v sudu omezeně; když dojde, hostinský přivalí nový sud.
    var BEER = 16, SPREAD = 3000, REGROW = 2600;
    var beerLeft = BEER, started = false, refilling = false, timer = null, lastHit = F.map(function () { return 0; });
    var hp = F.map(function (p, k) { return hotovo ? 0 : (k === 0 || k === 2 || k === 3 || k === 5) ? HP : 0; });
    var fires = g.svg.querySelectorAll(".hs-fire");
    var jets = g.svg.querySelectorAll(".hs-jet"), beer = g.svg.querySelector(".hs-beer"), foam = g.svg.querySelector(".hs-foam");
    // ukazatel piva v sudu (vpravo nahoře)
    var gauge = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gauge.setAttribute("class", "hs-gauge");
    gauge.innerHTML = '<rect x="154" y="44" width="10" height="34" rx="2" fill="#fffdf7"/>' +
      '<rect class="hs-level" x="154" y="44" width="10" height="34" rx="2" fill="#f5c400"/>' +
      ln(P, "M154 44 H164 V78 H154 Z", 1.1) +
      '<text x="159" y="85" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="5.4" fill="' + INK + '">PIVO</text>';
    g.svg.appendChild(gauge);
    var level = gauge.querySelector(".hs-level");
    function burning() { return hp.filter(function (x) { return x > 0; }).length; }
    function mist(n) { return n === 1 ? "jedno místo" : n + (n < 5 ? " místa" : " míst"); }
    function paint() {
      Array.prototype.forEach.call(fires, function (f, k) {
        f.setAttribute("data-hp", hp[k]);
        var fl = f.querySelector(".hs-fl"); fl.style.transform = hp[k] === HP ? "" : hp[k] ? "scale(.55)" : "scale(0)";
        btns[k].disabled = g.finished || hp[k] === 0;
      });
      var r = beerLeft / BEER;
      level.setAttribute("y", f1(44 + 34 * (1 - r))); level.setAttribute("height", f1(34 * r));
      gauge.classList.toggle("low", beerLeft <= 3);
    }
    function sprayTo(tx, ty) {
      var mx = (NOZ.x + tx) / 2, my = Math.min(NOZ.y, ty) - 30;
      var d = "M" + NOZ.x + " " + NOZ.y + " Q" + f1(mx) + " " + f1(my) + " " + f1(tx) + " " + f1(ty);
      Array.prototype.forEach.call(jets, function (j) { j.setAttribute("d", d); });
      restart(beer, "go");
      Array.prototype.forEach.call(foam.children, function (c, i) {
        c.setAttribute("cx", f1(tx - 4 + i * 2.7)); c.setAttribute("cy", f1(ty + 2 - (i % 2) * 3));
      });
      restart(foam, "go");
      // syčení hadice: kus nahrávky b.hra.zvuk, pokaždé odjinud
      if (!sample(b.hra.zvuk, { offset: Math.random() * 2, dur: 0.75, gain: 0.9, fadeOut: 0.25, rate: 0.95 + Math.random() * 0.1 })) SFX.spray();
    }
    // stříknutí stojí pivo; vrací false, když je sud prázdný
    function useBeer() {
      if (refilling) { g.say("Hostinský teprve valí nový sud…"); g.bump(); return false; }
      beerLeft--;
      if (beerLeft <= 0) {
        refilling = true;
        g.say("Sud je prázdný! Hostinský valí nový, a oheň zatím nečeká.");
        setTimeout(function () { refilling = false; beerLeft = BEER; paint(); if (!g.finished) g.say("Nový sud je napíchnutý. Šetři pivem!"); }, 2600);
      }
      return true;
    }
    function start() {
      if (started || hotovo) return;
      started = true;
      timer = setInterval(tick, 400);
    }
    var lastSpread = 0;
    function tick() {
      if (g.finished || !g.box.isConnected) { clearInterval(timer); return; }
      var now = performance.now(); if (!lastSpread) lastSpread = now;
      // přiškrcený plamen se po chvíli znovu rozhoří
      hp.forEach(function (x, k) { if (x > 0 && x < HP && now - lastHit[k] > REGROW) { hp[k] = HP; paint(); } });
      if (now - lastSpread < SPREAD) return;
      lastSpread = now;
      // plamen přeskočí na nejbližší nehořící místo
      var cand = [];
      hp.forEach(function (x, k) {
        if (x !== HP) return;
        F.forEach(function (q, j) { if (hp[j] === 0 && Math.hypot(q[0] - F[k][0], q[1] - F[k][1]) < 45) cand.push(j); });
      });
      if (!cand.length) return;
      var j = cand[Math.floor(Math.random() * cand.length)];
      hp[j] = HP; lastHit[j] = now;
      restart(fires[j], "puff");
      noise({ f: 300, to: 900, q: 0.7, dur: 0.4, gain: 0.12, att: 0.05 }); // vzplanutí
      g.say("Oheň přeskočil! Hoří už " + mist(burning()) + ".");
      paint();
    }
    var btns = F.map(function (p, k) {
      var btn = hotspot(p[0], p[1] - 10, 18, 22, "Uhasit plamen " + (k + 1), VB);
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (g.finished || hp[k] === 0) return;
        g.hideTip(); start();
        if (!useBeer()) { paint(); return; }
        hp[k]--; lastHit[k] = performance.now();
        sprayTo(p[0], p[1] - 8);
        vibrate(20);
        if (hp[k] === 0) {
          setTimeout(function () { SFX.hiss(); restart(fires[k], "puff"); }, 280);
          g.say(burning() ? "Uhašeno! Ještě hoří " + mist(burning()) + "." : "");
        }
        setTimeout(paint, 250);
        if (!burning()) {
          g.finished = true; clearInterval(timer);
          setTimeout(function () { g.finish(); }, 700);
        }
      });
      g.stage.appendChild(btn);
      return btn;
    });
    // stříknutí vedle stojí taky pivo
    g.stage.addEventListener("click", function (e) {
      if (g.finished || hotovo || e.target.closest(".hr-hot, .hr-sr")) return;
      var p = pt(g.svg, e);
      if (p.x > 140) return;
      g.hideTip(); start();
      if (!useBeer()) { paint(); return; }
      sprayTo(p.x, p.y);
      paint();
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
      '<g class="ks-splats"></g>' +
      // kluk v období vzdoru s kýblem kaše; vykoukne zespodu a hází
      '<g class="ks-kid" transform="translate(-40 0)"><g class="ks-kid-in">' +
        shape(P, "M-7 0 C-7 -10 -5 -16 0 -16 C5 -16 7 -10 7 0 Z", "#9fc3ee", 1.3) +
        '<circle cx="0" cy="-21" r="6.2" fill="#f6e2da"/>' + ln(P, "M-6.2 -21 A6.2 6.2 0 1 0 6.2 -21 A6.2 6.2 0 1 0 -6.2 -21", 1.3) +
        ln(P, "M-5.5 -24 C-3 -29 3 -29 5.8 -24 M-3 -27 L-1 -24 M1 -27.5 L2.5 -24", 1.1) +
        ln(P, "M-2.4 -21.5 L-1.2 -20.6 M2.4 -21.5 L1.2 -20.6 M-2 -17.8 C-1 -18.8 1 -18.8 2 -17.8", 0.9) +
        '<g class="ks-arm">' + ln(P, "M5 -13 L11 -22", 1.6) + '<path d="M8 -27 C8 -31 15 -31 15 -27 L14 -22 L9 -22 Z" fill="#e9e5db"/>' + ln(P, "M8 -27 C8 -31 15 -31 15 -27 L14 -22 L9 -22 Z", 1.1) + '</g>' +
        ln(P, "M-5 -13 L-9 -6", 1.6) +
      '</g></g>' +
      '<g class="ks-fly"><circle r="3" fill="#f3e3b0"/>' + ln(P, "M-3 0 A3 3 0 1 0 3 0 A3 3 0 1 0 -3 0", 0.8) + '</g>' +
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

    // ---- kluk s kýblem: znovu hází kaši na natřená místa, klepnutí na něj ho na chvíli uklidní ----
    var NS = "http://www.w3.org/2000/svg", KIDX = [24, 100, 176], KR = 7;
    var kid = g.svg.querySelector(".ks-kid"), fly = g.svg.querySelector(".ks-fly"), splatG = g.svg.querySelector(".ks-splats");
    var splats = [], kidAt = null, kidUntil = 0, calmUntil = 0, nextThrow = 0, kidTimer = null, painting = false;
    function kidShow(x) {
      kidAt = x; kid.setAttribute("transform", "translate(" + x + " 150)");
      restart(kid, "up");
    }
    function kidHide() { kid.classList.remove("up"); kidAt = null; }
    function blob(cx, cy, seed) {
      var r = rng(seed), d = "";
      for (var i = 0; i < 9; i++) {
        var a = i / 9 * Math.PI * 2, rr = KR * (0.65 + r() * 0.55);
        d += (i ? " L" : "M") + f1(cx + Math.cos(a) * rr) + " " + f1(cy + Math.sin(a) * rr * 0.85);
      }
      return d + " Z";
    }
    function splat(tx, ty) {
      var gg = document.createElementNS(NS, "g"), d = blob(tx, ty, Math.floor(tx * 31 + ty * 7));
      gg.setAttribute("class", "ks-splat");
      gg.innerHTML = '<path d="' + d + '" fill="#f3e3b0"/>' + ln(P, d, 1) + '<circle cx="' + f1(tx + KR + 2) + '" cy="' + f1(ty - 3) + '" r="1.4" fill="#f3e3b0" stroke="' + INK + '" stroke-width=".6"/>';
      splatG.appendChild(gg);
      var mine = pts.filter(function (sp) { return Math.hypot(sp[0] - tx, sp[1] - ty) < KR + 1; });
      mine.forEach(function (sp) { if (sp[2]) { sp[2] = false; hit--; } });
      splats.push({ el: gg, pts: mine });
      SFX.pop(); vibrate([15, 30, 15]);
      g.say("Plesk! Kluk zase hází kaši. Klepni na něj, ať dá pokoj.");
      paintSteps();
    }
    function throwAt() {
      var cand = pts.filter(function (sp) { return sp[2] && !splats.some(function (q) { return q.pts.indexOf(sp) >= 0; }); });
      if (!cand.length || kidAt === null) return;
      var t = cand[Math.floor(Math.random() * cand.length)], from = { x: kidAt + 12, y: 120 }, t0 = performance.now();
      restart(kid, "throw");
      fly.style.opacity = 1;
      (function stp() {
        var q = Math.min(1, (performance.now() - t0) / 450);
        var x = from.x + (t[0] - from.x) * q, y = from.y + (t[1] - from.y) * q - Math.sin(q * Math.PI) * 30;
        fly.setAttribute("transform", "translate(" + f1(x) + " " + f1(y) + ")");
        if (q < 1 && !g.finished) requestAnimationFrame(stp);
        else { fly.style.opacity = 0; if (!g.finished) splat(t[0], t[1]); }
      })();
    }
    function kidTick() {
      if (g.finished || !g.box.isConnected) { clearInterval(kidTimer); kidHide(); return; }
      var now = performance.now();
      if (now < calmUntil || podil() < 0.15) return;
      if (kidAt === null && now > nextThrow) { kidShow(KIDX[Math.floor(Math.random() * KIDX.length)]); kidUntil = now + 2600; setTimeout(function () { if (kidAt !== null && splats.length < 4) throwAt(); }, 700); return; }
      if (kidAt !== null && now > kidUntil) { kidHide(); nextThrow = now + 1800 + Math.random() * 1600; }
    }
    function calm() {
      kidHide(); calmUntil = performance.now() + 6000;
      SFX.pop(); vibrate(20);
      g.say("Kluk se uklidnil. Chvíli bude pokoj.");
    }
    function paintSteps() {
      var k = Math.min(DOTS, Math.floor(podil() / HOTOVO * DOTS));
      if (k < step) { step = k; g.set(k); }
    }
    function cleanSplats() {
      splats = splats.filter(function (q) {
        var done = q.pts.filter(function (sp) { return sp[2]; }).length >= q.pts.length * 0.8;
        if (done) { q.el.classList.add("pryc"); setTimeout(function () { q.el.remove(); }, 400); }
        return !done;
      });
    }

    var line = null, last = null, sndStop = null, sndT = 0;
    function rub(p) {
      pts.forEach(function (sp) {
        if (sp[2]) return;
        var dx = sp[0] - p.x, dy = sp[1] - p.y;
        if (dx * dx + dy * dy < R * R) { sp[2] = true; hit++; }
      });
      if (splats.length) cleanSplats();
      var k = Math.min(DOTS, Math.floor(podil() / HOTOVO * DOTS));
      if (k > step) {
        step = k; g.set(k); vibrate(15);
        if (k < DOTS) { SFX.pop(); sparkle(p.x, p.y - 6); g.say("Natřeno " + Math.round(k / DOTS * 100) + " %."); }
      }
      if (podil() >= HOTOVO && !splats.length && !g.finished) {
        top.classList.add("pryc"); // zbytek kaše zmizí sám
        zvuk(false); clearInterval(kidTimer); kidHide();
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
      var p0 = pt(g.svg, e);
      if (kidAt !== null && Math.abs(p0.x - kidAt) < 18 && p0.y > 112) { e.preventDefault(); calm(); return; }
      if (!kidTimer && !hotovo) kidTimer = setInterval(kidTick, 300);
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
    var P = "sv-";
    var flame = "M0 0 C-4 -3 -4 -9 0 -18 C4 -9 4 -3 0 0 Z", core = "M0 -1 C-1.8 -3 -1.8 -6 0 -10 C1.8 -6 1.8 -3 0 -1 Z";
    // přiblížení na svíčku a krabičku sirek (kříž je vlevo jen kousek vidět)
    var svg = '<svg viewBox="84 60 116 87" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Svíčka ve skleničce u paty památného kříže">' +
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
      // krabička sirek se škrtátkem
      '<g class="sv-box">' + shape(P, "M150 120 H192 V140 H150 Z", "#e9e5db", 1.4) +
        '<path d="M150 114 H192 V120 H150 Z" fill="#8a5a3a"/>' + ln(P, "M150 114 H192 V120 H150 Z", 1.1) +
        ln(P, "M153 116 L157 118 M160 116 L164 118 M167 116 L171 118 M174 116 L178 118 M181 116 L185 118", 0.6, ' opacity=".6"', "#fff") +
        '<g class="sv-left"></g></g>' +
      // vítr: čárky zleva
      '<g transform="translate(30 32)"><g class="sv-wind" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round">' +
        '<path d="M60 40 C80 36 96 44 116 38"/><path d="M70 58 C92 54 104 62 126 56"/><path d="M56 76 C74 72 86 80 104 74"/>' +
        '<path d="M110 30 C114 26 118 30 115 33" /></g></g>' +
      // sirka v ruce: hlavička je v počátku, dřívko vede dolů doprava k prstu
      '<g class="sv-match" transform="translate(-50 -50)"><g class="sv-stick">' +
        '<path d="M0 0 L22 18" stroke="#d8b98a" stroke-width="3.2" stroke-linecap="round"/>' + ln(P, "M0 0 L22 18", 0.6) +
        '<path class="sv-char" d="M0 0 L22 18" stroke="#3a3230" stroke-width="3.3" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>' +
        '<circle class="sv-head" cx="0" cy="0" r="2.6" fill="#c2341e"/></g>' +
        '<g class="sv-mf" transform="translate(-1 -2) rotate(-38)"><path d="' + flame + '" transform="scale(.55)" fill="#ffe9a0" stroke="' + INK + '" stroke-width="1.6"/></g></g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, tipTop: true, tip: "Vezmi sirku a škrtni o krabičku", label: "Svíčka u kříže a krabička sirek" });
    g.onDone(onDone);
    if (!hotovo) loadSample(b.hra.zvuk);
    // Sirku vezmeš prstem, škrtneš švihem přes hnědé škrtátko a hořící doneseš ke knotu.
    // Sirka dohoří za BURN ms. Když zafouká vítr (předem se objeví čárky), zhasne, pokud není ve skleničce.
    var BURN = 7000, WICK = { x: 130, y: 97 }, GLASS = [111, 89, 149, 140], STRIP = [148, 110, 194, 122], OFF = { x: -20, y: -17 };
    var s = g.svg, match = s.querySelector(".sv-match"), char = s.querySelector(".sv-char"), wind = s.querySelector(".sv-wind"), left = s.querySelector(".sv-left");
    var MATCHES = 4, have = MATCHES, holding = false, burning = false, burnT0 = 0, lastP = null, lastT = 0, raf = 0, nextGust = 0, gustPhase = 0, gustT = 0;
    function drawLeft() {
      var h = "";
      for (var i = 0; i < have; i++) h += '<path d="M' + (156 + i * 8) + ' 125 V137" stroke="#d8b98a" stroke-width="2.6" stroke-linecap="round"/><circle cx="' + (156 + i * 8) + '" cy="124" r="1.8" fill="#c2341e"/>';
      left.innerHTML = h;
    }
    function lit() { s.classList.add("lit"); match.style.opacity = 0; }
    if (hotovo) lit(); else drawLeft();
    function place(p) { match.setAttribute("transform", "translate(" + f1(p.x + OFF.x) + " " + f1(p.y + OFF.y) + ")"); }
    function head(p) { return { x: p.x + OFF.x, y: p.y + OFF.y }; }
    function inGlass(q) { return q.x > GLASS[0] && q.x < GLASS[2] && q.y > GLASS[1] && q.y < GLASS[3]; }
    function out(msg) {
      burning = false; holding = false; cancelAnimationFrame(raf);
      s.classList.remove("holding", "burning"); wind.classList.remove("warn", "on");
      match.style.opacity = 0; char.setAttribute("stroke-dasharray", "0 100");
      if (!have) { have = MATCHES; setTimeout(function () { if (!g.finished) { drawLeft(); g.say("Sirky došly, ale kostelník ti podal novou krabičku."); } }, 900); }
      g.say(msg); g.tip("Vezmi další sirku");
      vibrate([20, 40, 20]);
    }
    function frame() {
      if (!burning || g.finished) return;
      var now = performance.now(), q = Math.min(1, (now - burnT0) / BURN);
      char.setAttribute("stroke-dasharray", f1(q * 100) + " 100");
      s.querySelector(".sv-mf").style.transform = "scale(" + f1(1 - q * 0.45) + ")";
      if (q >= 1) { out("Sirka dohořela a spálila prsty. Au! Příště rychleji."); return; }
      // poryvy větru: varování, foukání, klid
      if (gustPhase === 0 && now > nextGust) { gustPhase = 1; gustT = now; wind.classList.add("warn"); g.say("Zvedá se vítr!"); }
      else if (gustPhase === 1 && now - gustT > 900) { gustPhase = 2; gustT = now; wind.classList.remove("warn"); wind.classList.add("on"); noise({ f: 500, to: 300, q: 0.4, dur: 1.1, gain: 0.18, att: 0.2 }); }
      else if (gustPhase === 2) {
        if (lastP && !inGlass(head(lastP))) { out("Fouklo a sirka zhasla. Při větru ji schovej do skleničky."); return; }
        if (now - gustT > 1100) { gustPhase = 0; wind.classList.remove("on"); nextGust = now + 2600 + Math.random() * 1600; g.say(""); }
      }
      raf = requestAnimationFrame(frame);
    }
    function ignite() {
      burning = true; burnT0 = performance.now(); gustPhase = 0; nextGust = burnT0 + 1500 + Math.random() * 1000;
      s.classList.add("burning"); s.querySelector(".sv-mf").style.transform = "";
      if (!sample(b.hra.zvuk, { gain: 1 })) SFX.match();
      vibrate(25); g.say("Hoří! Teď ke knotu."); g.hideTip();
      raf = requestAnimationFrame(frame);
    }
    function done() {
      burning = false; cancelAnimationFrame(raf); wind.classList.remove("warn", "on");
      lit(); SFX.bell(); g.finish();
    }
    var st = g.stage;
    st.addEventListener("pointerdown", function (e) {
      if (g.finished || holding) return;
      e.preventDefault(); ac();
      try { st.setPointerCapture(e.pointerId); } catch (x) {}
      var p = pt(s, e);
      holding = true; have--; drawLeft();
      g.hideTip(); g.say("Škrtni švihem přes hnědé škrtátko.");
      s.classList.add("holding"); match.style.opacity = 1; char.setAttribute("stroke-dasharray", "0 100");
      lastP = p; lastT = performance.now(); place(p);
    });
    st.addEventListener("pointermove", function (e) {
      if (!holding || g.finished) return;
      var p = pt(s, e), now = performance.now(), hd = head(p), dt = Math.max(1, now - lastT);
      var v = Math.hypot(p.x - lastP.x, p.y - lastP.y) / dt;
      place(p);
      if (!burning && hd.x > STRIP[0] && hd.x < STRIP[2] && hd.y > STRIP[1] && hd.y < STRIP[3]) {
        if (v > 0.12) ignite(); else if (Math.random() < 0.08) SFX.wipe();
      }
      if (burning && Math.hypot(hd.x - WICK.x, hd.y - WICK.y) < 7) done();
      lastP = p; lastT = now;
    });
    function up() {
      if (!holding || g.finished) return;
      if (burning) out("Sirka spadla do trávy a zhasla.");
      else { holding = false; have++; drawLeft(); s.classList.remove("holding"); match.style.opacity = 0; g.say(""); g.tip("Vezmi sirku a škrtni o krabičku"); }
    }
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    if (!hotovo) st.classList.add("hr-draw");
    // bez dotyku: tlačítko svíčku rovnou zapálí
    var kb = E("button", { class: "hr-sr", text: "Škrtnout sirkou a zapálit svíčku" });
    kb.addEventListener("click", function () { if (!g.finished) { if (!sample(b.hra.zvuk, { gain: 1 })) SFX.match(); done(); } });
    if (!hotovo) g.box.appendChild(kb);
    return g.box;
  };

  // =====================================================================
  // 5) Stadion: umlč ampliony kamenem
  // =====================================================================
  // Švihnutí prstem hodí kámen: směr a síla podle švihu, letí po oblouku. Z amplionů hraje hymna
  // (b.hra.zvuk), každý zásah ji ztiší a rozladí, po posledním amplionu je ticho.
  HRY.amplion = function (b, hotovo, onDone) {
    var P = "am-", GRAV = 250, K = 3.6, VMAX = 330, HAND = { x: 100, y: 132 }, HITR = 17, HS = 1.35; // HS = zvětšení trychtýřů
    // x, y = vršek sloupu, d = kam míří trychtýř (1 doprava, -1 doleva)
    var AMP = [{ x: 28, y: 56, d: 1 }, { x: 122, y: 42, d: -1 }, { x: 178, y: 66, d: -1 }];
    AMP.forEach(function (a) { a.cx = a.x + a.d * 15 * HS; a.cy = a.y; });
    var horn = "M0 -2.6 L18 -9.5 C24 -9.5 26.5 -5 26.5 0 C26.5 5 24 9.5 18 9.5 L0 2.6 Z";
    var mouth = "M18 -9.5 C14.5 -9.5 13.5 -5 13.5 0 C13.5 5 14.5 9.5 18 9.5";
    var note = "M0 0 C0 -2 3.4 -2 3.4 0 C3.4 2 0 2 0 0 Z M3.2 -.2 V-8 L6.6 -6.4";
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tři ampliony na sloupech u fotbalového hřiště, z nich hraje hymna">' +
      defs(P) + paper(P) +
      // branka v pozadí
      ln(P, "M40 140 V100 H108 V140", 1.3) + ln(P, "M48 100 V140 M58 100 V140 M68 100 V140 M78 100 V140 M88 100 V140 M98 100 V140 M40 110 H108 M40 120 H108 M40 130 H108", 0.5, ' opacity=".4"') +
      AMP.map(function (a, k) {
        return '<g class="am-amp" data-k="' + k + '">' +
          shape(P, "M" + (a.x - 1.6) + " " + a.y + " H" + (a.x + 1.6) + " V140 H" + (a.x - 1.6) + " Z", "#e9e5db", 1.3) +
          '<g transform="translate(' + a.x + ' ' + a.y + ') scale(' + (a.d * HS) + ' ' + HS + ')"><g class="am-horn">' +
            shape(P, horn, "#f9f7f1", 1.5) + ln(P, mouth, 1.2) +
            '<g class="am-dent">' + ln(P, "M20 -6 L16.5 -1.5 L20.5 1 L17 5.5", 1.1) + ln(P, "M7 -5 L10 -3.4 M8 3.6 L11 4.6", 0.8) + '</g>' +
          '</g></g>' +
          '<g class="am-notes" transform="translate(' + (a.x + a.d * 42) + ' ' + (a.y - 10) + ')">' +
            '<path class="am-note" d="' + note + '" fill="none" stroke="' + INK + '" stroke-width="1.1" stroke-linecap="round"/>' +
            '<path class="am-note" d="' + note + '" transform="translate(' + (a.d * 6) + ' 6)" fill="none" stroke="' + INK + '" stroke-width="1.1" stroke-linecap="round"/>' +
          '</g>' +
          '<g class="am-bonk" transform="translate(' + a.cx + ' ' + a.cy + ')">' + ln(P, "M-13 -9 L-8 -5 M13 -9 L8 -5 M0 -15 V-10 M-14 4 L-9 3 M14 4 L9 3", 1.2) + '</g>' +
        '</g>';
      }).join("") +
      // hromádka kamenů a kámen v ruce
      shape(P, "M84 140 C84 135 92 134 94 138 C96 133 104 134 104 140 Z", "#d6d1c6", 1.1) +
      '<g class="am-aim"></g>' +
      '<g class="am-stone" transform="translate(' + HAND.x + ' ' + HAND.y + ')">' + shape(P, "M-3.6 0 C-3.6 -3 -1 -3.8 .6 -3.6 C3.4 -3.2 3.8 -1 3.6 .6 C3.2 3.2 1 3.6 -.8 3.6 C-3 3.4 -3.6 1.8 -3.6 0 Z", "#bdb6a8", 1) + '</g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: AMP.length, tipTop: true, tip: "Táhni prstem nahoru a pusť", label: "Ampliony u hřiště: švihnutím prstu hodíš kámen" });
    g.onDone(onDone);
    var s = g.svg, amps = s.querySelectorAll(".am-amp"), stone = s.querySelector(".am-stone"), aim = s.querySelector(".am-aim");
    var hit = AMP.map(function () { return !!hotovo; }), hits = hotovo ? AMP.length : 0;
    var music = null, synth = 0, flying = null, drag = null;
    if (hotovo) { Array.prototype.forEach.call(amps, function (n) { n.classList.add("hit"); }); s.classList.add("all"); }
    else loadSample(b.hra.zvuk);
    g.set(hits);

    // ---- hymna z amplionů ----
    var GAIN = [0.6, 0.38, 0.2], RATE = [1, 0.93, 0.84];
    function playMusic() {
      if (music || synth || g.finished) return;
      music = sample(b.hra.zvuk, { gain: GAIN[0], loop: true, offset: 2, fadeIn: 0.4 });
      if (music) { watch(); return; }
      // nahrávka ještě není: zkus to znovu, po chvíli hraj aspoň bubny RA-ČI-CE
      var tries = 0;
      (function retry() {
        if (music || synth || g.finished || !g.box.isConnected) return;
        music = sample(b.hra.zvuk, { gain: GAIN[Math.min(hits, 2)], loop: true, offset: 2, fadeIn: 0.4 });
        if (music) { tune(); watch(); return; }
        if (++tries < 12) { setTimeout(retry, 150); return; }
        synth = setInterval(function () {
          if (g.finished || !g.box.isConnected) { clearInterval(synth); return; }
          var c = ac(); if (!c) return; var t = c.currentTime + 0.02, beat = 0.28 / RATE[Math.min(hits, 2)];
          [0, 1, 2].forEach(function (i) { SFX.drum(t + i * beat, i === 2); });
        }, 1700);
      })();
    }
    // čím víc zásahů, tím tišší, pomalejší a rozladěnější
    function tune() {
      if (!music || !music.src) return;
      var c = ac(), t = c.currentTime, k = Math.min(hits, 2);
      try {
        music.gain.gain.cancelScheduledValues(t); music.gain.gain.setTargetAtTime(GAIN[k], t, 0.15);
        music.src.playbackRate.setTargetAtTime(RATE[k], t, 0.2);
        if (k > 0) {
          if (!music.lfo) {
            music.lfo = c.createOscillator(); music.lfoG = c.createGain();
            music.lfo.frequency.value = 5.5; music.lfo.connect(music.lfoG); music.lfoG.connect(music.src.playbackRate); music.lfo.start();
          }
          music.lfoG.gain.setTargetAtTime(k * 0.025, t, 0.2);
        }
      } catch (e) {}
    }
    function stopMusic(windDown) {
      if (synth) { clearInterval(synth); synth = 0; }
      if (!music) return;
      var m = music; music = null;
      try {
        if (windDown && m.src) {
          var c = ac(), t = c.currentTime;
          m.src.playbackRate.cancelScheduledValues(t); m.src.playbackRate.setValueAtTime(m.src.playbackRate.value, t);
          m.src.playbackRate.linearRampToValueAtTime(0.25, t + 0.9);
          setTimeout(function () { m.stop(); if (m.lfo) m.lfo.stop(); }, 850);
        } else { m.stop(); if (m.lfo) m.lfo.stop(); }
      } catch (e) {}
    }
    function watch() {
      var iv = setInterval(function () {
        if (!music) { clearInterval(iv); return; }
        if (!g.box.isConnected || document.hidden) { stopMusic(); clearInterval(iv); }
      }, 400);
    }

    // ---- házení ----
    function vel(d) {
      var vx = d.x * K, vy = d.y * K, m = Math.hypot(vx, vy);
      if (m > VMAX) { vx *= VMAX / m; vy *= VMAX / m; }
      return { x: vx, y: vy };
    }
    function showAim(v) {
      var h = "";
      for (var i = 1; i <= 7; i++) {
        var t = i * 0.055, x = HAND.x + v.x * t, y = HAND.y + v.y * t + GRAV * t * t / 2;
        h += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="' + f1(1.8 - i * 0.12) + '" fill="' + INK + '" opacity="' + f1(0.85 - i * 0.08) + '"/>';
      }
      aim.innerHTML = h;
    }
    function bonk(k) {
      hit[k] = true; hits++; g.set(hits);
      var n = amps[k]; n.classList.add("hit"); restart(n, "bonk");
      SFX.thump(); tone({ f: 880, to: 300, dur: 0.35, gain: 0.18, type: "square" }); vibrate(40); g.bump();
      tune();
      if (hits < AMP.length) g.say(hits === 1 ? "Trefa! Hymna trochu zeslábla. Ještě dva." : "Už jen jeden amplion a bude klid.");
      else {
        stopMusic(true); g.say("");
        setTimeout(function () { s.classList.add("all"); g.finish(); }, 900);
      }
    }
    function throwStone(v) {
      var p = { x: HAND.x, y: HAND.y }, last = performance.now();
      flying = true; SFX.whoosh(); g.hideTip();
      (function step(ts) {
        if (!g.box.isConnected) return;
        var dt = Math.min(0.04, (ts - last) / 1000); last = ts;
        // po malých krocích, ať rychlý kámen amplion nepřeskočí
        for (var i = 0; i < 4; i++) {
          var h = dt / 4;
          v.y += GRAV * h; p.x += v.x * h; p.y += v.y * h;
          for (var k = 0; k < AMP.length; k++) {
            if (!hit[k] && Math.hypot(p.x - AMP[k].cx, p.y - AMP[k].cy) < HITR) { bonk(k); return land(); }
          }
        }
        stone.setAttribute("transform", "translate(" + f1(p.x) + " " + f1(p.y) + ") rotate(" + f1(p.x * 6) + ")");
        if (p.y > 146 || p.x < -10 || p.x > 210) {
          if (p.y > 140) tone({ f: 180, to: 90, dur: 0.08, gain: 0.25, type: "triangle" });
          if (!g.finished) g.say(v.y < 0 || p.y < 60 ? "Vedle. Zamiř víc k amplionu." : "Krátký hod. Táhni prstem dál.");
          return land();
        }
        requestAnimationFrame(step);
      })(last);
    }
    function land() {
      flying = false;
      stone.setAttribute("transform", "translate(" + HAND.x + " " + HAND.y + ")");
      if (!g.finished) restart(stone, "new");
    }
    var st = g.stage;
    st.classList.add("hr-draw");
    st.addEventListener("pointerdown", function (e) {
      if (g.finished || flying) return;
      e.preventDefault(); ac(); playMusic();
      try { st.setPointerCapture(e.pointerId); } catch (x) {}
      var p = pt(s, e);
      drag = { s: p, hist: [{ p: p, t: performance.now() }] };
    });
    st.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = pt(s, e), now = performance.now();
      drag.hist.push({ p: p, t: now });
      while (drag.hist.length > 2 && now - drag.hist[0].t > 140) drag.hist.shift();
      var d = { x: p.x - drag.s.x, y: p.y - drag.s.y };
      if (Math.hypot(d.x, d.y) > 6) showAim(vel(d));
    });
    function up(e) {
      if (!drag) return;
      var p = e && e.clientX != null ? pt(s, e) : drag.hist[drag.hist.length - 1].p;
      var d = { x: p.x - drag.s.x, y: p.y - drag.s.y };
      drag = null; aim.innerHTML = "";
      if (g.finished) return;
      if (d.y > -6 || Math.hypot(d.x, d.y) < 10) { g.say("Táhni prstem nahoru, směrem k amplionu, a pusť."); return; }
      throwStone(vel(d));
    }
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", function () { drag = null; aim.innerHTML = ""; });
    // bez dotyku: tlačítko trefí další amplion
    var kb = E("button", { class: "hr-sr", text: "Hodit kámen na další amplion" });
    kb.addEventListener("click", function () {
      if (g.finished || flying) return;
      ac(); playMusic();
      var k = hit.indexOf(false); if (k >= 0) bonk(k);
    });
    if (!hotovo) g.box.appendChild(kb);
    return g.box;
  };

  // =====================================================================
  // 6) Sochy: slep sádrový gumák z rozbitých kusů
  // =====================================================================
  // Keramičce praskla forma a odlitek vysoké gumové boty se rozpadl na 9 kusů (rozstříhaný obrázek).
  // Kusy se táhnou prstem na obrys boty; neotáčejí se. Kus zapadne, jen když je u svého místa.
  HRY.gumaky = function (b, hotovo, onDone) {
    var P = "gm-", NS = "http://www.w3.org/2000/svg", SNAP = 9, TS = 0.62; // TS = zmenšení kusů v hromádce
    // mřížka řezů přes botu: sloupce a řádky (okraje s rezervou), prázdné buňky (nad špičkou) se vynechají
    var XS = [94, 128, 158, 194], YS = [6, 40, 74, 108, 148];
    var CELLS = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3], [2, 3]];
    var bootOut = "M103 15 C103 9 149 9 149 15 L147 100 C147 106 151 110 158 112 C174 116 187 123 188 134 L188 141 C188 144 186 146 183 146 L107 146 C104 146 102 144 102 141 L101 118 Z";
    var art =
      '<path d="' + bootOut + '" fill="#e9e5db"/>' +
      '<path d="M134 16 L132 100 C132 108 140 116 152 119 C168 123 182 128 186 136 L186 141 H150 C140 138 132 128 128 112 L126 16 Z" fill="url(#' + P + 'xx)" opacity=".35"/>' +
      // horní lem, žlutý pruh, poutko
      '<path d="M103 15 C103 21 149 21 149 15 L149 24 C149 29 103 29 103 24 Z" fill="#f5c400"/>' +
      ln(P, "M103 15 C103 21 149 21 149 15 M103 24 C103 29 149 29 149 24", 1.1) +
      ln(P, "M103 15 C103 9 149 9 149 15", 1.2) + '<path d="M106 13.5 C112 11 140 11 146 13.5" fill="none" stroke="#8a847a" stroke-width=".8"/>' +
      ln(P, "M110 30 V40 M110 40 C112 43 115 43 117 40 V30", 0.9) +
      // výztuha kotníku a nártu
      ln(P, "M102 100 C112 96 132 96 146 101", 0.9) + ln(P, "M146 101 C150 108 156 112 166 114", 0.9, ' opacity=".7"') +
      ln(P, "M114 58 L113 90", 0.7, ' opacity=".5"', "#fff") + ln(P, "M120 40 L119 92", 0.6, ' opacity=".35"', "#fff") +
      // podrážka s dezénem a podpatkem
      '<path d="M102 134 H188 V141 C188 144 186 146 183 146 H107 C104 146 102 144 102 141 Z" fill="#3a3632"/>' +
      ln(P, "M108 140 H112 M118 140 H122 M128 140 H132 M140 140 H144 M152 140 H156 M164 140 H168 M176 140 H180", 1, "", "#8a847a") +
      ln(P, "M132 134 V146", 1, "", "#16130f") +
      ln(P, bootOut, 1.6);
    // vlnitý řez (v rozích přesně na mřížce, ať na sebe kusy navazují)
    function wave(a0, a1, base, k, vert) {
      var pts = [], n = 8;
      for (var i = 0; i <= n; i++) {
        var t = i / n, a = a0 + (a1 - a0) * t, o = 2.2 * Math.sin(Math.PI * t) * Math.sin(a * 0.33 + k * 1.7);
        pts.push(vert ? [base + o, a] : [a, base + o]);
      }
      return pts;
    }
    function cellPoly(c, r) {
      var x0 = XS[c], x1 = XS[c + 1], y0 = YS[r], y1 = YS[r + 1];
      var top = r === 0 ? [[x0, y0], [x1, y0]] : wave(x0, x1, y0, r * 7 + c, false);
      var right = c === XS.length - 2 ? [[x1, y0], [x1, y1]] : wave(y0, y1, x1, c * 5 + r + 30, true);
      var bot = r === YS.length - 2 ? [[x1, y1], [x0, y1]] : wave(x0, x1, y1, (r + 1) * 7 + c, false).reverse();
      var left = c === 0 ? [[x0, y1], [x0, y0]] : wave(y0, y1, x0, (c - 1) * 5 + r + 30, true).reverse();
      return "M" + top.concat(right, bot, left).map(function (p) { return f1(p[0]) + " " + f1(p[1]); }).join(" L") + " Z";
    }
    var PCS = CELLS.map(function (cr, i) {
      return { c: cr[0], r: cr[1], cx: (XS[cr[0]] + XS[cr[0] + 1]) / 2, cy: (YS[cr[1]] + YS[cr[1] + 1]) / 2,
        hw: (XS[cr[0] + 1] - XS[cr[0]]) / 2, hh: (YS[cr[1] + 1] - YS[cr[1]]) / 2, d: cellPoly(cr[0], cr[1]) };
    });
    // hromádka vlevo: 3 × 3, zamíchané
    var SPOT = [[18, 26], [48, 30], [78, 24], [20, 74], [50, 78], [80, 72], [18, 122], [48, 126], [78, 120]];
    var MIX = [4, 8, 1, 6, 0, 3, 7, 2, 5];
    var defsX = '<g id="' + P + 'bota">' + art + '</g><clipPath id="' + P + 'tvar"><path d="' + bootOut + '"/></clipPath>' + PCS.map(function (p, i) { return '<clipPath id="' + P + 'c' + i + '"><path d="' + p.d + '"/></clipPath>'; }).join("");
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Rozbitý sádrový odlitek vysoké gumové boty, kusy se skládají na obrys">' +
      defs(P, defsX) + paper(P, false) +
      '<text x="48" y="146" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="5.4" fill="#8a847a">kusy odlitku</text>' +
      ln(P, "M94 4 V146", 0.7, ' stroke-dasharray="2 3" opacity=".5"') +
      // obrys boty, kam se kusy skládají
      '<path class="gm-ghost" d="' + bootOut + '" fill="#fbfaf5" stroke="#8a847a" stroke-width="1" stroke-dasharray="2.4 1.8"/>' +
      '<g class="gm-pcs">' + PCS.map(function (p, i) {
        return '<g class="gm-pc" data-i="' + i + '"><g clip-path="url(#' + P + 'c' + i + ')"><use href="#' + P + 'bota"/></g>' +
          '<path class="gm-cut" d="' + p.d + '" fill="none" stroke="#8a847a" stroke-width=".7" clip-path="url(#' + P + 'tvar)"/></g>';
      }).join("") + '</g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: PCS.length, tip: "Táhni kusy na obrys boty", label: "Skládání rozbitého sádrového gumáku" });
    g.onDone(onDone);
    var s = g.svg, layer = s.querySelector(".gm-pcs"), els = s.querySelectorAll(".gm-pc"), st = g.stage;
    var q = PCS.map(function (p, i) { var h = SPOT[MIX.indexOf(i)]; return hotovo ? { x: p.cx, y: p.cy, sc: 1, on: true } : { x: h[0], y: h[1], sc: TS, on: false }; });
    function paint(i) {
      var p = PCS[i], o = q[i];
      els[i].setAttribute("transform", "translate(" + f1(o.x) + " " + f1(o.y) + ") scale(" + o.sc + ") translate(" + (-p.cx) + " " + (-p.cy) + ")");
      els[i].classList.toggle("on", o.on);
    }
    function order() {
      PCS.forEach(function (p, i) { if (q[i].on) layer.insertBefore(els[i], layer.firstChild); });
    }
    PCS.forEach(function (p, i) { paint(i); });
    order();
    function placed() { return q.filter(function (o) { return o.on; }).length; }
    g.set(placed());
    if (hotovo) { s.classList.add("all"); return g.box; }

    function hitAt(p) {
      for (var k = layer.children.length - 1; k >= 0; k--) {
        var i = +layer.children[k].getAttribute("data-i"), o = q[i], pc = PCS[i];
        if (o.on) continue;
        if (Math.abs(p.x - o.x) < pc.hw * o.sc + 3 && Math.abs(p.y - o.y) < pc.hh * o.sc + 3) return i;
      }
      return -1;
    }
    function back(i) { var h = SPOT[MIX.indexOf(i)]; q[i].x = h[0]; q[i].y = h[1]; q[i].sc = TS; paint(i); restart(els[i], "back"); }
    function drop(i) {
      var o = q[i], pc = PCS[i];
      if (Math.hypot(o.x - pc.cx, o.y - pc.cy) < SNAP) {
        o.x = pc.cx; o.y = pc.cy; o.on = true; paint(i); order();
        SFX.thump(); vibrate(25); g.set(placed());
        if (placed() === PCS.length) { g.say(""); setTimeout(function () { s.classList.add("all"); g.finish(); }, 400); }
        else g.say(placed() === PCS.length - 1 ? "Poslední kus!" : "");
        return;
      }
      if (o.x > 94) {
        // položený na botu, ale jinam: zkusit, jestli neleží u jiného místa
        var near = PCS.some(function (r, k) { return k !== i && !q[k].on && Math.hypot(o.x - r.cx, o.y - r.cy) < SNAP; });
        g.say(near ? "Tenhle kus patří jinam. Podívej se na tvar okrajů." : "");
        if (near) g.bump();
        back(i);
      } else { o.sc = TS; paint(i); }
    }
    var drag = null;
    st.addEventListener("pointerdown", function (e) {
      if (g.finished) return;
      var p = pt(s, e), i = hitAt(p);
      if (i < 0) return;
      e.preventDefault(); ac(); g.hideTip();
      try { st.setPointerCapture(e.pointerId); } catch (x) {}
      drag = { i: i, dx: q[i].x - p.x, dy: q[i].y - p.y };
      // při zvednutí se kus zvětší na skutečnou velikost (kolem prstu)
      q[i].sc = 1; drag.dx = 0; drag.dy = -6; q[i].x = p.x; q[i].y = p.y - 6; paint(i);
      layer.appendChild(els[i]); els[i].classList.add("lift"); SFX.tick();
    });
    st.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = pt(s, e), o = q[drag.i];
      o.x = Math.max(4, Math.min(196, p.x + drag.dx)); o.y = Math.max(4, Math.min(146, p.y + drag.dy)); paint(drag.i);
    });
    function up() {
      if (!drag) return;
      var d = drag; drag = null; els[d.i].classList.remove("lift");
      drop(d.i);
    }
    st.addEventListener("pointerup", up);
    st.addEventListener("pointercancel", up);
    st.classList.add("hr-draw");
    // bez dotyku: tlačítko přiloží další kus
    var kb = E("button", { class: "hr-sr", text: "Přiložit další kus boty" });
    kb.addEventListener("click", function () {
      var i = q.map(function (o, k) { return k; }).filter(function (k) { return !q[k].on; })[0];
      if (i === undefined) return;
      q[i].x = PCS[i].cx; q[i].y = PCS[i].cy; q[i].sc = 1; drop(i);
    });
    g.box.appendChild(kb);
    return g.box;
  };

  // =====================================================================
  // 7) Sokolovna: sestava na kruzích na přesnost (tachometr) a zlatá medaile z Berlína 1936
  // =====================================================================
  // Ručička tachometru pod obrázkem kmitá sem a tam. Klepnutí ve chvíli, kdy je v zeleném poli,
  // = Hudec předvede další prvek sestavy. Zelené pole je pokaždé jinde, užší a ručička rychlejší.
  // Po posledním prvku (seskok) přijde stupeň vítězů a zlatá medaile z OH v Berlíně 1936.
  HRY.kruhy = function (b, hotovo, onDone) {
    var P = "kr-", ROPE = [{ x: 72, y: 3 }, { x: 128, y: 3 }];
    // pozice těla: h = ruce (kruhy) [L, R], s = ramena, k = boky, n = chodidla [L, R]
    var POSE = {
      vis:   { h: [[88, 50], [112, 50]], s: [100, 60], k: [100, 86], n: [[98, 112], [102, 112]] },
      vzpor: { h: [[88, 74], [112, 74]], s: [100, 54], k: [100, 80], n: [[98, 106], [102, 106]] },
      kriz:  { h: [[68, 62], [132, 62]], s: [100, 62], k: [100, 89], n: [[98, 115], [102, 115]] },
      vznos: { h: [[88, 74], [112, 74]], s: [100, 54], k: [100, 78], n: [[126, 77], [126, 80]] },
      stoj:  { h: [[88, 74], [112, 74]], s: [100, 68], k: [100, 42], n: [[98, 16], [102, 16]] },
      toc:   { h: [[96, 52], [104, 52]], s: [108, 58], k: [133, 60], n: [[158, 60], [158, 64]] },
      dopad: { h: [[84, 64], [116, 64]], s: [100, 80], k: [100, 104], n: [[95, 129], [105, 129]] }
    };
    var PRVKY = [
      { p: "vzpor", t: "Výmyk do vzporu" }, { p: "kriz", t: "Kříž" }, { p: "vznos", t: "Vzpor vznesmo" },
      { p: "stoj", t: "Stoj na rukou" }, { p: "toc", t: "Velký toč" }, { p: "dopad", t: "Seskok s obratem" }
    ];
    var WIDTH = [17, 15, 13, 12, 11, 10], PERIOD = [2.4, 2.2, 2.0, 1.8, 1.6, 1.5]; // pole (± stupně), perioda kmitu (s)
    var bars = function (x) {
      var d = "M" + x + " 14 V138 M" + (x + 16) + " 14 V138";
      for (var y = 22; y < 136; y += 9) d += " M" + x + " " + y + " H" + (x + 16);
      return ln(P, d, 0.9, ' opacity=".55"');
    };
    var wl = 'fill="none" stroke="' + INK + '" stroke-linecap="round" stroke-linejoin="round" filter="url(#' + P + 'w1)"';
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Alois Hudec cvičí sestavu na kruzích v sokolovně">' +
      defs(P) + paper(P, false) + bars(6) + bars(178) +
      ln(P, "M0 138 H200", 1) +
      shape(P, "M58 129 H142 L146 138 H54 Z", "#f1ece0", 1.3) + '<path d="M58 129 H142 L146 138 H54 Z" fill="url(#' + P + 'x)" opacity=".35"/>' +
      ln(P, "M30 3 H170", 2.2) +
      '<path class="kr-ropes" ' + wl + ' stroke-width="1.2"/>' +
      '<path class="kr-legs" ' + wl + ' stroke-width="3"/>' +
      '<path class="kr-torso" fill="#fff8d6" stroke="' + INK + '" stroke-width="1.5" stroke-linejoin="round" filter="url(#' + P + 'w1)"/>' +
      '<path class="kr-arms" ' + wl + ' stroke-width="2.6"/>' +
      '<circle class="kr-head" r="6.6" fill="#fffdf7" stroke="' + INK + '" stroke-width="1.5" filter="url(#' + P + 'w1)"/>' +
      '<circle class="kr-ring kr-r0" r="5.6" fill="none" stroke="' + INK + '" stroke-width="2.2" filter="url(#' + P + 'w1)"/>' +
      '<circle class="kr-ring kr-r1" r="5.6" fill="none" stroke="' + INK + '" stroke-width="2.2" filter="url(#' + P + 'w1)"/>' +
      '<g class="kr-name"><rect x="40" y="10" width="120" height="16" rx="8" fill="' + INK + '"/><text x="100" y="21.4" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="8.4" fill="#f5c400"></text></g>' +
      // stupeň vítězů a zlatá medaile (Berlín 1936)
      '<g class="kr-medal">' +
        '<rect width="200" height="150" fill="#f7f4ec" opacity=".96"/>' +
        '<text x="100" y="17" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="9" fill="' + INK + '">OLYMPIJSKÉ HRY BERLÍN 1936</text>' +
        '<text x="100" y="27" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="6" fill="#554c40">Sportovní gymnastika, kruhy</text>' +
        shape(P, "M76 104 H124 V140 H76 Z", "#f9f7f1", 1.5) + shape(P, "M36 116 H76 V140 H36 Z", "#f9f7f1", 1.4) + shape(P, "M124 122 H164 V140 H124 Z", "#f9f7f1", 1.4) +
        '<text x="100" y="128" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="16" fill="' + INK + '">1</text>' +
        '<text x="56" y="133" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="11" fill="' + INK + '">2</text>' +
        '<text x="144" y="136" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="10" fill="' + INK + '">3</text>' +
        // Hudec na stupni, ruce nahoře
        ln(P, "M96 103 L98 86 M104 103 L102 86", 2.6) + shape(P, "M94 62 H106 L104 86 H96 Z", "#fff8d6", 1.4) +
        '<text x="100" y="77" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="5" fill="' + INK + '">S</text>' +
        ln(P, "M95 64 L86 46 M105 64 L114 46", 2.4) +
        shape(P, "M100 46 C104 46 106.5 49 106.5 53 C106.5 57 104 60 100 60 C96 60 93.5 57 93.5 53 C93.5 49 96 46 100 46 Z", "#fffdf7", 1.4) +
        ln(P, "M97.6 55.6 C99.2 57 100.8 57 102.4 55.6", 0.8) +
        // medaile na stuze
        '<g class="kr-gold">' + ln(P, "M96 62 L100 72 L104 62", 1.2, "", "#c2341e") +
          '<circle cx="100" cy="75" r="4.6" fill="#f5c400" stroke="' + INK + '" stroke-width="1.1"/><text x="100" y="77" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="4.6" fill="' + INK + '">1</text></g>' +
        '<text x="100" y="40" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="7.5" fill="#c2341e">ZLATO: ALOIS HUDEC</text>' +
        // konfety
        '<g class="kr-konf"><rect x="40" y="50" width="3" height="5" fill="#f5c400" transform="rotate(20 41 52)"/><rect x="152" y="58" width="3" height="5" fill="#c2341e" transform="rotate(-25 153 60)"/>' +
          '<rect x="62" y="74" width="3" height="5" fill="#9fc3ee" transform="rotate(40 63 76)"/><rect x="136" y="82" width="3" height="5" fill="#f5c400" transform="rotate(-10 137 84)"/>' +
          '<rect x="28" y="92" width="3" height="5" fill="#c2341e"/><rect x="170" y="96" width="3" height="5" fill="#9fc3ee" transform="rotate(30 171 98)"/></g>' +
      '</g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: PRVKY.length, tip: "Klepni, až bude ručička v zeleném", label: "Kruhy: klepni, když je ručička tachometru v zeleném poli" });
    g.onDone(onDone);
    var s = g.svg, st = g.stage;
    // tachometr pod obrázkem
    var R = 80, CX = 100, CY = 92;
    function arcPt(a, r) { var t = (a - 90) * Math.PI / 180; return [CX + r * Math.cos(t), CY + r * Math.sin(t)]; }
    function arc(a0, a1, r) { var p0 = arcPt(a0, r), p1 = arcPt(a1, r); return "M" + f1(p0[0]) + " " + f1(p0[1]) + " A" + r + " " + r + " 0 0 1 " + f1(p1[0]) + " " + f1(p1[1]); }
    var ticks = ""; for (var a = -90; a <= 90; a += 15) { var t0 = arcPt(a, R - 6), t1 = arcPt(a, R + 2); ticks += "M" + f1(t0[0]) + " " + f1(t0[1]) + " L" + f1(t1[0]) + " " + f1(t1[1]) + " "; }
    var tacho = E("div", { class: "kr-tacho", html:
      '<svg viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
        '<path d="' + arc(-90, 90, R) + '" fill="none" stroke="#e9e5db" stroke-width="16"/>' +
        '<path class="kr-zone" d="" fill="none" stroke="#5cb85c" stroke-width="16"/>' +
        '<path d="' + arc(-90, 90, R + 8) + '" fill="none" stroke="' + INK + '" stroke-width="1.6"/>' +
        '<path d="' + arc(-90, 90, R - 8) + '" fill="none" stroke="' + INK + '" stroke-width="1"/>' +
        '<path d="' + ticks + '" stroke="' + INK + '" stroke-width="1.2"/>' +
        '<g class="kr-needle"><path d="M' + CX + ' ' + CY + ' L' + CX + ' ' + (CY - R - 4) + '" stroke="#c2341e" stroke-width="3.2" stroke-linecap="round"/></g>' +
        '<circle cx="' + CX + '" cy="' + CY + '" r="6" fill="' + INK + '"/>' +
      '</svg>' });
    g.stage.insertAdjacentElement("afterend", tacho);
    var zoneEl = tacho.querySelector(".kr-zone"), needle = tacho.querySelector(".kr-needle");
    var nameEl = s.querySelector(".kr-name"), nameT = nameEl.querySelector("text");

    function lerp(a, c, t) { return a + (c - a) * t; }
    function mix(p, q, t) {
      function pt2(a, c) { return [lerp(a[0], c[0], t), lerp(a[1], c[1], t)]; }
      return { h: [pt2(p.h[0], q.h[0]), pt2(p.h[1], q.h[1])], s: pt2(p.s, q.s), k: pt2(p.k, q.k), n: [pt2(p.n[0], q.n[0]), pt2(p.n[1], q.n[1])] };
    }
    var cur = POSE[hotovo ? "dopad" : "vis"];
    function M(p) { return f1(p[0]) + " " + f1(p[1]); }
    function draw(p) {
      var dx = p.s[0] - p.k[0], dy = p.s[1] - p.k[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
      var head = [p.s[0] + ux * 8.5, p.s[1] + uy * 8.5];
      var free = cur === POSE.dopad;
      // ruce drží kruhy, po seskoku kruhy visí volně
      var ring = free ? [[72, 48], [128, 48]] : p.h;
      s.querySelector(".kr-ropes").setAttribute("d", "M72 3 L" + M([ring[0][0], ring[0][1] - 5.6]) + " M128 3 L" + M([ring[1][0], ring[1][1] - 5.6]));
      s.querySelector(".kr-r0").setAttribute("cx", f1(ring[0][0])); s.querySelector(".kr-r0").setAttribute("cy", f1(ring[0][1]));
      s.querySelector(".kr-r1").setAttribute("cx", f1(ring[1][0])); s.querySelector(".kr-r1").setAttribute("cy", f1(ring[1][1]));
      s.querySelector(".kr-arms").setAttribute("d", "M" + M(p.h[0]) + " L" + M(p.s) + " L" + M(p.h[1]));
      // trup jako lichoběžník kolem osy ramena–boky
      var nx = -uy, ny = ux;
      var tor = [[p.s[0] + nx * 6.5, p.s[1] + ny * 6.5], [p.s[0] - nx * 6.5, p.s[1] - ny * 6.5], [p.k[0] - nx * 4.5, p.k[1] - ny * 4.5], [p.k[0] + nx * 4.5, p.k[1] + ny * 4.5]];
      s.querySelector(".kr-torso").setAttribute("d", "M" + tor.map(M).join(" L") + " Z");
      s.querySelector(".kr-legs").setAttribute("d", "M" + M(p.k) + " L" + M(p.n[0]) + " M" + M(p.k) + " L" + M(p.n[1]));
      var hd = s.querySelector(".kr-head"); hd.setAttribute("cx", f1(head[0])); hd.setAttribute("cy", f1(head[1]));
    }
    var anim = 0;
    function poseTo(name, ms, cb) {
      var from = cur, to = POSE[name], t0 = performance.now(); cur = to;
      cancelAnimationFrame(anim);
      (function stp() {
        var t = Math.min(1, (performance.now() - t0) / (reduced ? 1 : ms)), e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        draw(mix(from, to, e));
        if (t < 1) anim = requestAnimationFrame(stp); else if (cb) cb();
      })();
    }
    draw(cur);
    if (hotovo) { s.classList.add("medal", "all"); tacho.hidden = true; g.set(PRVKY.length); return g.box; }

    var k = 0, zc = 0, ang = -90, ph = 0, last = 0, raf = 0, busy = false, misses = 0;
    function newZone() {
      var w = WIDTH[k];
      do { zc = Math.round(-80 + w + Math.random() * (160 - 2 * w)); } while (Math.abs(zc - ang) < 30);
      zoneEl.setAttribute("d", arc(zc - w, zc + w, R));
    }
    function loop(ts) {
      if (!g.box.isConnected || g.finished) return;
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (!busy) ph += dt * 2 * Math.PI / PERIOD[k];
      ang = Math.sin(ph) * 88;
      needle.setAttribute("transform", "rotate(" + f1(ang) + " " + CX + " " + CY + ")");
      tacho.classList.toggle("in", Math.abs(ang - zc) <= WIDTH[k]);
      raf = requestAnimationFrame(loop);
    }
    function showName(t) { nameT.textContent = t; restart(nameEl, "on"); }
    function hitTap(e) {
      if (e) e.preventDefault();
      if (g.finished || busy) return;
      ac(); g.hideTip();
      if (Math.abs(ang - zc) <= WIDTH[k]) {
        var pr = PRVKY[k]; busy = true; misses = 0;
        tone({ f: 660 + k * 60, dur: 0.12, gain: 0.12, type: "triangle" }); vibrate(30);
        showName(pr.t); g.say(pr.t + "!");
        var last6 = k === PRVKY.length - 1;
        poseTo(pr.p, last6 ? 900 : 600, function () {
          k++; g.set(k);
          if (last6) { SFX.thump(); setTimeout(medal, 900); return; }
          busy = false; newZone();
        });
      } else {
        misses++;
        g.say(misses >= 3 ? "Vedle. Sleduj ručičku a klepni, až vjede do zeleného, ne až když tam je." : "Vedle! Hudec zaváhal.");
        vibrate([10, 30, 10]); restart(tacho, "miss"); noise({ f: 300, q: 0.7, dur: 0.15, gain: 0.15 });
      }
    }
    function medal() {
      tacho.hidden = true; g.say("Olympijské hry v Berlíně 1936: Alois Hudec vyhrál kruhy a získal zlatou medaili!");
      s.classList.add("medal"); SFX.bell();
      setTimeout(function () { s.classList.add("all"); g.finish(); }, 1600);
    }
    st.addEventListener("pointerdown", hitTap);
    tacho.addEventListener("pointerdown", hitTap);
    g.box.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && e.target === kb) hitTap(e); });
    var kb = E("button", { class: "hr-sr", text: "Klepnout (ručička v zeleném)" });
    kb.addEventListener("click", function () { if (!busy && !g.finished) { ang = zc; hitTap(); } });
    g.box.appendChild(kb);
    st.classList.add("hr-draw");
    newZone();
    last = performance.now(); raf = requestAnimationFrame(loop);
    return g.box;
  };

  // =====================================================================
  // 8) Úřad: kočárky do jeslí, nová hranice obce, razítko a podpis
  // =====================================================================
  // Krok 1: kočárky se táhnou (nebo klepne na jesle) do Račic nebo Pístovic, obojí jesle se zaplní.
  // Krok 2: prstem obtáhne jednu hranici kolem obou obcí. Krok 3: orazítkuje a podepíše výnos.
  HRY.vynos = function (b, hotovo, onDone) {
    var P = "vy-", NS = "http://www.w3.org/2000/svg", SIGN = 70;
    var ST = { x: 74, y: 112 };
    var VES = [{ x: 62, y: 66, name: "Račice", n: 8 }, { x: 140, y: 92, name: "Pístovice", n: 7 }];
    var kocarek = function (twins) {
      var body = "M-10 -6 C-10 3 10 3 10 -6 Z", hood = "M-10 -6 C-10 -15 -1 -16 0 -15 V-6 Z";
      var one = function (dx) {
        return '<g transform="translate(' + dx + ' 0)">' + shape(P, body, "#fffdf7", 1.3) + shape(P, hood, "#e9e5db", 1.2) + '<path d="' + hood + '" fill="url(#' + P + 'x)" opacity=".5"/>' +
          '<circle cx="-6" cy="4.5" r="2.8" fill="#fffdf7" stroke="' + INK + '" stroke-width="1.1"/><circle cx="6" cy="4.5" r="2.8" fill="#fffdf7" stroke="' + INK + '" stroke-width="1.1"/></g>';
      };
      return (twins ? one(-10) + one(10) + ln(P, "M20 -6 L23 -11 H26", 1.2) : one(0) + ln(P, "M10 -6 L13 -11 H16", 1.2));
    };
    // ---- krok 1: hlavolam „Pořadník MNV“ ----
    // Budovy (řádky): jesle a školka v každé vsi, místa = okna. v = ves (0 Račice, 1 Pístovice).
    var BUD = [{ name: "Jesle", v: 0, cap: 2, j: true }, { name: "Školka", v: 0, cap: 3, j: false },
               { name: "Jesle", v: 1, cap: 2, j: true }, { name: "Školka", v: 1, cap: 1, j: false }];
    var VCOL = ["#f5c400", "#9fc3ee"], VNAME = ["Račice", "Pístovice"];
    // Děti: f = rodina (písmeno na kartičce), k = kočárek (jinak odrážedlo), v = ves, tw = dvojčata.
    // S pravidlem 5 (každý do své vsi) to vyřešit nejde: račických kočárků je víc než míst v račických jeslích.
    // Bez něj má hlavolam právě jedno řešení (ověřeno vyzkoušením všech rozložení): SOL = řádek pro každé dítě.
    var KIDS = [{ f: "N", k: true, v: 0, tw: true }, { f: "N", k: true, v: 0, tw: true }, { f: "D", k: true, v: 0 }, { f: "S", k: true, v: 1 },
                { f: "N", k: false, v: 0 }, { f: "D", k: false, v: 0 }, { f: "S", k: false, v: 1 }, { f: "V", k: false, v: 1 }];
    var SOL = [2, 2, 0, 0, 3, 1, 1, 1], HOME = [4, 0, 6, 2, 7, 1, 5, 3]; // HOME = pořadí v čekárně
    var ROWY = [16, 42, 68, 94], SLOTX = 98, SLOTW = 25, WAITY = 128;
    var RULES = [
      "Kočárek patří do jeslí, odrážedlo do školky.",
      "Dvojčata (puntíky) jsou pod jednou střechou.",
      "Sourozenci (stejné písmeno) chodí ve stejné vsi.",
      "Novákovi (N) a Dvořákovi (D) se hádají přes plot. Jejich děti nesmí pod jednu střechu.",
      "Každé dítě chodí ve své vsi (barva peřinky)."
    ];
    function kidCard(c) {
      var col = VCOL[c.v], h = '<rect x="-11" y="-11" width="22" height="22" rx="3" fill="' + col + '" opacity=".55"/>';
      if (c.tw) h += '<g fill="' + INK + '" opacity=".35"><circle cx="-6" cy="7" r="1"/><circle cx="-2" cy="8.5" r="1"/><circle cx="3" cy="7.5" r="1"/><circle cx="7" cy="8.5" r="1"/><circle cx="-8" cy="3" r="1"/></g>';
      h += ln(P, "M-11 -8 C-11 -10 -10 -11 -8 -11 H8 C10 -11 11 -10 11 -8 V8 C11 10 10 11 8 11 H-8 C-10 11 -11 10 -11 8 Z", 1.1);
      h += c.k ? '<g transform="translate(2 2) scale(.5)">' + kocarek(false) + '</g>'
               : '<g transform="translate(2 1)">' + ln(P, "M-6 4 H3 L5 -5 M3 -5 H7 M-4 1 H1", 1.2) + '<circle cx="-6" cy="5" r="2.6" fill="#fffdf7" stroke="' + INK + '" stroke-width="1"/><circle cx="5" cy="5" r="2.6" fill="#fffdf7" stroke="' + INK + '" stroke-width="1"/></g>';
      h += '<text x="-9" y="-3.5" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="7.5" fill="' + INK + '">' + c.f + '</text>';
      return h;
    }
    function board() {
      var h = paper(P);
      BUD.forEach(function (bd, r) {
        var y = ROWY[r];
        h += '<rect class="vy-row" data-r="' + r + '" x="2" y="' + (y - 12.5) + '" width="196" height="25" rx="3" fill="' + VCOL[bd.v] + '" opacity=".14"/>' +
          '<rect x="2" y="' + (y - 12.5) + '" width="3" height="25" fill="' + VCOL[bd.v] + '"/>' +
          shape(P, "M9 " + (y + 6) + " V" + (y - 2) + " L15 " + (y - 8) + " L21 " + (y - 2) + " V" + (y + 6) + " Z", "#fffdf7", 0.9) +
          '<text x="25" y="' + (y - 1) + '" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="6.4" fill="' + INK + '">' + bd.name.toUpperCase() + '</text>' +
          '<text x="25" y="' + (y + 6.5) + '" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="5" fill="#554c40">' + VNAME[bd.v] + ' · ' + bd.cap + (bd.cap === 1 ? " místo" : " místa") + '</text>';
        for (var i = 0; i < bd.cap; i++) h += '<rect x="' + (SLOTX + i * SLOTW - 11) + '" y="' + (y - 11) + '" width="22" height="22" rx="3" fill="#fffdf7" stroke="#8a847a" stroke-width=".8" stroke-dasharray="2 1.6"/>';
      });
      h += ln(P, "M4 110 H196", 0.7, ' opacity=".4"') +
        '<text x="100" y="116" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="5" fill="#554c40">ČEKÁRNA MNV</text>' +
        '<g class="vy-kids">' + KIDS.map(function (c, i) { return '<g class="vy-kid" data-i="' + i + '">' + kidCard(c) + '</g>'; }).join("") + '</g>' +
        '<g class="vy-rej" transform="translate(100 62) rotate(-12)"><rect x="-52" y="-12" width="104" height="24" rx="3" fill="none" stroke="#c2341e" stroke-width="2.2"/>' +
          '<text y="6" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="15" letter-spacing="2" fill="#c2341e">ZAMÍTNUTO</text></g>';
      return h;
    }
    function houses(v) {
      var r = rng(v.n * 97), h = "";
      for (var i = 0; i < v.n; i++) {
        var ang = i / v.n * Math.PI * 2 + r(), d = 4 + r() * 12, x = v.x + Math.cos(ang) * d * 1.3, y = v.y + Math.sin(ang) * d * 0.8;
        h += shape(P, "M" + f1(x - 3) + " " + f1(y - 2.5) + " H" + f1(x + 3) + " V" + f1(y + 2.5) + " H" + f1(x - 3) + " Z", i % 3 ? "#e9e5db" : "#f5c400", 0.9);
      }
      return h;
    }
    // výnos (jedno vyhotovení)
    var sheet = '<g class="vy-sheet" transform="rotate(-1.2 100 75)">' +
      shape(P, "M38 6 H162 V144 H38 Z", "#fffdf7", 1.3) +
      '<text x="100" y="24" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="13" letter-spacing="1.5" fill="' + INK + '">VÝNOS</text>' +
      '<text x="100" y="32" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4.4" fill="' + INK + '">Okresního národního výboru ve Vyškově</text>' +
      '<text x="100" y="44" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="6" fill="' + INK + '">o sloučení obcí Račice a Pístovice</text>' +
      ln(P, "M48 56 H150 M48 62 H142 M48 68 H150 M48 74 H142 M48 80 H150 M48 86 H110", 0.8, ' opacity=".45"') +
      '<circle cx="' + ST.x + '" cy="' + ST.y + '" r="15" fill="none" stroke="#8a847a" stroke-width=".8" stroke-dasharray="2 2"/>' +
      '<text x="' + ST.x + '" y="' + (ST.y + 1.6) + '" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4.6" fill="#8a847a">M. P.</text>' +
      ln(P, "M104 124 H154", 0.9) + '<text x="129" y="130" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4" fill="#554c40">předseda ONV</text>' +
      '<g class="vy-imprint" transform="translate(' + ST.x + ' ' + ST.y + ') rotate(-12)">' +
        '<path id="' + P + 'c" d="M-10 0 A10 10 0 1 1 10 0 A10 10 0 1 1 -10 0" fill="none"/>' +
        '<circle r="13.4" fill="none" stroke="#c2341e" stroke-width="1.5"/><circle r="8.2" fill="none" stroke="#c2341e" stroke-width=".7"/>' +
        '<text font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="3.5" fill="#c2341e" letter-spacing=".3"><textPath href="#' + P + 'c">MNV V RAČICÍCH ★ OKRES VYŠKOV ★</textPath></text>' +
        '<text y="2" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="5.6" fill="#c2341e">1960</text>' +
      '</g>' +
    '</g>';
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Jesle v Račicích a Pístovicích, plánek obcí a výnos o sloučení">' +
      defs(P) +
      // krok 1: jesle
      '<g class="vy-sc vy-sc1">' + board() + '</g>' +
      // krok 2: plánek
      '<g class="vy-sc vy-sc2"><rect width="200" height="150" fill="#f3eddc"/><rect width="200" height="150" filter="url(#' + P + 'paper)"/>' +
        '<text x="8" y="12" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="6.5" fill="' + INK + '">Plánek obcí · ONV Vyškov</text>' +
        ln(P, "M0 112 C40 104 70 90 100 82 C130 76 170 70 200 74", 1.2, ' opacity=".7"') + // silnice
        ln(P, "M20 150 C50 130 90 128 120 118 C150 108 180 112 200 104", 2.4, "", "#9fc3ee") + // potok
        '<path class="vy-new-fill" d="" fill="url(#' + P + 'yel)" opacity=".55"/>' +
        VES.map(function (v) {
          return '<g class="vy-old"><ellipse cx="' + v.x + '" cy="' + v.y + '" rx="27" ry="19" fill="none" stroke="#8a847a" stroke-width="1" stroke-dasharray="3 2"/></g>' +
            houses(v) +
            '<text x="' + v.x + '" y="' + (v.y - 27) + '" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="6" fill="' + INK + '">' + v.name + '</text>';
        }).join("") +
        '<path class="vy-line" d="" fill="none" stroke="#c2341e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<text class="vy-new-name" x="100" y="136" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="8" fill="#c2341e">RAČICE-PÍSTOVICE</text>' +
      '</g>' +
      // krok 3: výnos
      '<g class="vy-sc vy-sc3"><rect width="200" height="150" fill="#eadcc0"/><rect width="200" height="150" fill="url(#' + P + 'x)" opacity=".18"/><rect width="200" height="150" filter="url(#' + P + 'paper)"/>' +
        sheet +
        '<g class="vy-stamp" transform="translate(182 116)">' +
          shape(P, "M-11 6 H11 V12 H-11 Z", "#d9cfbd", 1.3) + '<path d="M-11 10 H11 V12 H-11 Z" fill="#c2341e"/>' +
          shape(P, "M-3.5 6 V-6 H3.5 V6 Z", "#e9e5db", 1.2) +
          shape(P, "M0 -16 C5 -16 7 -12 7 -9 C7 -6 4 -5 0 -5 C-4 -5 -7 -6 -7 -9 C-7 -12 -5 -16 0 -16 Z", "#a8643a", 1.3) +
        '</g>' +
        '<path class="vy-ink" fill="none" stroke="#1f3f8f" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: 3, tip: "Vyber dítě a klepni na budovu", label: "Úřední kolečko: rozdělení dětí do jeslí a školek, hranice obce a výnos" });
    g.onDone(onDone);
    var s = g.svg, st = g.stage, step = 0;
    var line = s.querySelector(".vy-line"), ink = s.querySelector(".vy-ink"), sh = s.querySelector(".vy-sheet");
    var SIG = "M110 121 C112 112 116 112 115 121 C114 127 118 113 122 117 C124 120 126 112 130 118 C133 123 136 114 140 119 L150 117";
    function go(k) {
      step = k; s.classList.remove("k1", "k2", "k3"); s.classList.add("k" + k);
      if (tools1) tools1.hidden = k === 3;
      st.classList.toggle("hr-draw", k !== 3);
    }
    var kids = Array.prototype.map.call(s.querySelectorAll(".vy-kid"), function (el) { return el; });
    var row = KIDS.map(function () { return -1; }), sel = -1, drag = null, rejects = 0, judging = false;
    // pravidla pod obrázkem
    var rulesEl = E("ol", { class: "vy-rules" });
    RULES.forEach(function (t, i) { rulesEl.appendChild(E("li", { text: t, "data-r": i })); });
    var submit = E("button", { class: "btn btn-primary btn-block", text: "Předložit komisi", disabled: "" });
    var solveBtn = E("button", { class: "btn btn-ghost btn-block", text: "Komise, poraďte", hidden: "" });
    var tools1 = E("div", { class: "vy-tools" }, [rulesEl, submit, solveBtn]);
    function slotOf(i) {
      var r = row[i]; if (r < 0) return -1;
      var k = 0; for (var j = 0; j < i; j++) if (row[j] === r) k++;
      return k;
    }
    function posOf(i) {
      if (row[i] < 0) { var h = HOME.indexOf(i); return { x: 13 + h * 24.8, y: WAITY + 4 }; }
      return { x: SLOTX + slotOf(i) * SLOTW, y: ROWY[row[i]] };
    }
    function layout(skip) {
      kids.forEach(function (el, i) {
        if (i === skip) return;
        var p = posOf(i); el.setAttribute("transform", "translate(" + f1(p.x) + " " + f1(p.y) + ")");
        el.classList.toggle("sel", i === sel);
      });
      var all = row.every(function (r) { return r >= 0; });
      submit.disabled = !all || judging;
    }
    function count(r) { return row.filter(function (x) { return x === r; }).length; }
    function rowAt(p) {
      if (p.y > 110) return -2; // čekárna
      for (var r = 0; r < ROWY.length; r++) if (Math.abs(p.y - ROWY[r]) <= 13) return r;
      return -3;
    }
    function clearBad() {
      kids.forEach(function (el) { el.classList.remove("bad"); });
      Array.prototype.forEach.call(rulesEl.children, function (li) { li.classList.remove("bad"); });
    }
    function put(i, r) {
      clearBad();
      if (r === -2) { row[i] = -1; sel = -1; layout(); SFX.slide(); return; }
      if (r < 0) { sel = -1; layout(); return; }
      if (row[i] === r) { sel = -1; layout(); return; }
      if (count(r) >= BUD[r].cap) {
        g.say(BUD[r].name + " " + (BUD[r].v ? "v Pístovicích" : "v Račicích") + " je plná. Nejdřív odtud někoho přesuň do čekárny.");
        vibrate([10, 30, 10]); g.bump(); sel = -1; layout(); return;
      }
      row[i] = r; sel = -1; SFX.pop(); vibrate(15); g.say(""); layout();
    }
    function kidAt(p) {
      for (var i = kids.length - 1; i >= 0; i--) { var q = posOf(i); if (Math.abs(p.x - q.x) < 12.5 && Math.abs(p.y - q.y) < 12.5) return i; }
      return -1;
    }
    st.addEventListener("pointerdown", function (e) {
      if (step !== 1 || g.finished || judging) return;
      var p = pt(s, e), i = kidAt(p);
      e.preventDefault(); ac(); g.hideTip();
      if (i >= 0) {
        try { st.setPointerCapture(e.pointerId); } catch (x) {}
        var q = posOf(i);
        drag = { i: i, dx: q.x - p.x, dy: q.y - p.y, start: p, moved: false };
        kids[i].parentNode.appendChild(kids[i]); kids.forEach(function (el, k) { el.classList.toggle("lift", k === i); });
        return;
      }
      if (sel >= 0) put(sel, rowAt(p));
    });
    st.addEventListener("pointermove", function (e) {
      if (!drag) return;
      var p = pt(s, e);
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 3) return;
      drag.moved = true;
      kids[drag.i].setAttribute("transform", "translate(" + f1(p.x + drag.dx) + " " + f1(p.y + drag.dy) + ")");
    });
    function up1(e) {
      if (!drag) return;
      var d = drag; drag = null;
      kids[d.i].classList.remove("lift");
      if (!d.moved) { sel = sel === d.i ? -1 : d.i; if (sel >= 0) { SFX.tick(); g.say("Teď klepni na budovu, kam dítě patří."); } layout(); return; }
      var p = pt(s, e);
      put(d.i, rowAt({ x: p.x + d.dx, y: p.y + d.dy }));
    }
    st.addEventListener("pointerup", up1);
    st.addEventListener("pointercancel", up1);

    // komise: vrátí první porušené pravidlo a děti, kterých se týká
    function check() {
      var n = KIDS.length, i, j;
      for (i = 0; i < n; i++) if (BUD[row[i]].j !== KIDS[i].k) return { r: 0, who: [i] };
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (KIDS[i].tw && KIDS[j].tw && KIDS[i].f === KIDS[j].f && row[i] !== row[j]) return { r: 1, who: [i, j] };
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (KIDS[i].f === KIDS[j].f && BUD[row[i]].v !== BUD[row[j]].v) return { r: 2, who: [i, j] };
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (KIDS[i].f !== KIDS[j].f && /^[ND]$/.test(KIDS[i].f) && /^[ND]$/.test(KIDS[j].f) && row[i] === row[j]) return { r: 3, who: [i, j] };
      var away = []; for (i = 0; i < n; i++) if (BUD[row[i]].v !== KIDS[i].v) away.push(i);
      return away.length ? { r: 4, who: away } : null;
    }
    var WHY = [
      "Kočárek nepatří do školky a odrážedlo do jeslí.",
      "Dvojčata se nesmí rozdělit.",
      "Sourozenci musí chodit ve stejné vsi, maminka nebude běhat mezi vesnicemi.",
      "Novákovi a Dvořákovi pod jednou střechou? To by byla válka!",
      ""
    ];
    submit.addEventListener("click", function () {
      if (step !== 1 || judging || row.some(function (r) { return r < 0; })) return;
      clearBad(); sel = -1; layout();
      var res = check();
      rulesEl.children[res.r].classList.add("bad");
      res.who.forEach(function (i) { kids[i].classList.add("bad"); });
      if (res.r < 4) {
        rejects++;
        restart(s.querySelector(".vy-rej"), "on"); SFX.thump(); vibrate([40, 60, 40]); g.bump();
        g.say("ZAMÍTNUTO. " + WHY[res.r] + (rejects >= 3 ? " Rada komise: pravidlo 5 klidně poruš, ostatní musí platit." : ""));
        if (rejects >= 3) solveBtn.hidden = false;
        return;
      }
      // Pointa: všechno sedí, jen pravidlo 5 ne. Jedna obec na to nestačí.
      judging = true; layout();
      SFX.tick(); vibrate(30);
      g.say("Komise: Jinak všechno sedí. Jenže račické kočárky se do račických jeslí nevejdou, ať je skládáš jakkoli. Jedna obec na to nestačí! Pravidlo 5 zrušíme, ale napřed musí být obě vsi jedna obec.");
      setTimeout(function () {
        rulesEl.children[4].classList.remove("bad"); rulesEl.children[4].classList.add("zrus");
        kids.forEach(function (el) { el.classList.remove("bad"); });
        submit.hidden = true; solveBtn.hidden = true;
      }, 1800);
      setTimeout(toStep2, 5200);
    });
    function solve() { row = SOL.slice(); sel = -1; clearBad(); layout(); SFX.slide(); g.say("Komise děti rozdělila sama. Teď je předlož."); solveBtn.hidden = true; }
    solveBtn.addEventListener("click", solve);

    // ---- krok 2: hranice ----
    var pts = [], drawing2 = false;
    function toStep2() {
      if (step !== 1) return;
      g.set(1); go(2);
      g.say("Obtáhni prstem jednu hranici kolem Račic i Pístovic. Pak už bude jedno, ve které vsi dítě chodí.");
      g.tip("Obtáhni obě vesnice jednou čarou");
    }
    function inside(p, poly) {
      var c = false;
      for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        if (((poly[i].y > p.y) !== (poly[j].y > p.y)) && (p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x)) c = !c;
      }
      return c;
    }
    function pathD(a, close) { return a.map(function (p, i) { return (i ? "L" : "M") + f1(p.x) + " " + f1(p.y); }).join(" ") + (close ? " Z" : ""); }
    st.addEventListener("pointerdown", function (e) {
      if (step !== 2 || g.finished) return;
      e.preventDefault(); g.hideTip(); g.say("");
      try { st.setPointerCapture(e.pointerId); } catch (x) {}
      drawing2 = true; pts = [pt(s, e)]; line.setAttribute("d", pathD(pts));
    });
    st.addEventListener("pointermove", function (e) {
      if (!drawing2) return;
      var p = pt(s, e), l = pts[pts.length - 1];
      if (Math.hypot(p.x - l.x, p.y - l.y) < 1.5) return;
      pts.push(p); line.setAttribute("d", pathD(pts));
      if (pts.length % 4 === 0) SFX.pen();
    });
    function up2() {
      if (!drawing2) return; drawing2 = false;
      var len = 0; for (var i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      var gap = pts.length > 1 ? Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].y - pts[pts.length - 1].y) : 1e9;
      var both = VES.every(function (v) { return inside(v, pts); });
      if (len > 120 && gap < 40 && both) {
        line.setAttribute("d", pathD(pts, true));
        s.querySelector(".vy-new-fill").setAttribute("d", pathD(pts, true));
        s.classList.add("merged"); SFX.pop(); vibrate(30); g.set(2);
        g.say("Hranice platí. Zbývá to orazítkovat.");
        setTimeout(function () { go(3); g.say(""); g.tip("Klepni na M. P."); stampBtn.hidden = false; }, 1500);
        return;
      }
      g.say(len < 120 || gap >= 40 ? "Čára musí obě vesnice obejmout dokola a skončit tam, kde začala." : "Jedna z obcí zůstala venku. Obtáhni obě najednou.");
      vibrate([10, 30, 10]);
      setTimeout(function () { if (step === 2 && !drawing2) line.setAttribute("d", ""); }, 700);
    }
    st.addEventListener("pointerup", up2);
    st.addEventListener("pointercancel", up2);

    // ---- krok 3: razítko a podpis ----
    var stamped = false, inkD = "", inkLen = 0, drawing = false, lastP = null, lastSnd = 0;
    var stampBtn = hotspot(ST.x, ST.y, 22, 28, "Orazítkovat výnos");
    stampBtn.hidden = true; st.appendChild(stampBtn);
    stampBtn.addEventListener("click", function () {
      if (step !== 3 || g.finished || stamped) return;
      g.hideTip(); stamped = true;
      sh.classList.add("stamped"); restart(sh.querySelector(".vy-imprint"), "pop");
      s.querySelector(".vy-stamp").classList.add("used");
      SFX.thump(); vibrate(40); g.bump();
      stampBtn.hidden = true;
      g.say("Ještě podpis na čáru.");
      setTimeout(function () { g.tip("Podepiš se prstem na čáru"); st.classList.add("hr-draw", "vy-sign"); }, 400);
    });
    st.addEventListener("pointerdown", function (e) {
      if (step !== 3 || g.finished || !stamped) return;
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
    function up3() {
      if (!drawing) return; drawing = false;
      if (inkLen >= SIGN) { g.set(3); st.classList.remove("hr-draw"); g.finish(); }
      else g.say("To je spíš parafa. Podepiš se celým jménem.");
    }
    st.addEventListener("pointerup", up3);
    st.addEventListener("pointercancel", up3);

    // bez dotyku: každý krok jedním tlačítkem
    var kb = E("button", { class: "hr-sr", text: "Udělat další úřední krok" });
    kb.addEventListener("click", function () {
      if (g.finished) return;
      if (step === 1) { if (row.some(function (r) { return r < 0; })) solve(); else submit.click(); }
      else if (step === 2) {
        pts = [{ x: 22, y: 60 }, { x: 60, y: 36 }, { x: 120, y: 54 }, { x: 176, y: 80 }, { x: 160, y: 118 }, { x: 100, y: 112 }, { x: 40, y: 92 }];
        drawing2 = true; up2();
      } else if (!stamped) stampBtn.click();
      else { ink.setAttribute("d", SIG); g.set(3); g.finish(); }
    });

    if (hotovo) {
      go(3); sh.classList.add("stamped"); ink.setAttribute("d", SIG); st.classList.remove("hr-draw");
    } else {
      go(1); layout();
      g.box.querySelector(".dj-count").insertAdjacentElement("afterend", tools1);
      g.box.appendChild(kb);
    }
    return g.box;
  };
})();
