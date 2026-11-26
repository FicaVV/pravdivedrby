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
    gauge.innerHTML = '<rect x="178" y="10" width="12" height="44" rx="2" fill="#fffdf7"/>' +
      '<rect class="hs-level" x="178" y="10" width="12" height="44" rx="2" fill="#f5c400"/>' +
      ln(P, "M178 10 H190 V54 H178 Z", 1.2) +
      '<text x="184" y="62" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="6" fill="' + INK + '">PIVO</text>';
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
      level.setAttribute("y", f1(10 + 44 * (1 - r))); level.setAttribute("height", f1(44 * r));
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
      var btn = hotspot(p[0], p[1] - 10, 15, 19, "Uhasit plamen " + (k + 1));
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
      // krabička sirek se škrtátkem
      '<g class="sv-box">' + shape(P, "M150 120 H192 V140 H150 Z", "#e9e5db", 1.4) +
        '<path d="M150 114 H192 V120 H150 Z" fill="#8a5a3a"/>' + ln(P, "M150 114 H192 V120 H150 Z", 1.1) +
        ln(P, "M153 116 L157 118 M160 116 L164 118 M167 116 L171 118 M174 116 L178 118 M181 116 L185 118", 0.6, ' opacity=".6"', "#fff") +
        '<g class="sv-left"></g></g>' +
      // vítr: čárky zleva
      '<g class="sv-wind" fill="none" stroke="' + INK + '" stroke-width="1.2" stroke-linecap="round">' +
        '<path d="M60 40 C80 36 96 44 116 38"/><path d="M70 58 C92 54 104 62 126 56"/><path d="M56 76 C74 72 86 80 104 74"/>' +
        '<path d="M110 30 C114 26 118 30 115 33" /></g>' +
      // sirka v ruce: hlavička je v počátku, dřívko vede dolů doprava k prstu
      '<g class="sv-match" transform="translate(-50 -50)"><g class="sv-stick">' +
        '<path d="M0 0 L22 18" stroke="#d8b98a" stroke-width="3.2" stroke-linecap="round"/>' + ln(P, "M0 0 L22 18", 0.6) +
        '<path class="sv-char" d="M0 0 L22 18" stroke="#3a3230" stroke-width="3.3" stroke-linecap="round" pathLength="100" stroke-dasharray="0 100"/>' +
        '<circle class="sv-head" cx="0" cy="0" r="2.6" fill="#c2341e"/></g>' +
        '<g class="sv-mf" transform="translate(-1 -2) rotate(-38)"><path d="' + flame + '" transform="scale(.55)" fill="#ffe9a0" stroke="' + INK + '" stroke-width="1.6"/></g></g>' +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, tip: "Vezmi sirku a škrtni o krabičku", label: "Svíčka u kříže a krabička sirek" });
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
    var P = "am-", GRAV = 250, K = 3.6, VMAX = 330, HAND = { x: 100, y: 132 }, HITR = 12;
    // x, y = vršek sloupu, d = kam míří trychtýř (1 doprava, -1 doleva)
    var AMP = [{ x: 28, y: 56, d: 1 }, { x: 122, y: 42, d: -1 }, { x: 178, y: 66, d: -1 }];
    AMP.forEach(function (a) { a.cx = a.x + a.d * 15; a.cy = a.y; });
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
          '<g transform="translate(' + a.x + ' ' + a.y + ') scale(' + a.d + ' 1)"><g class="am-horn">' +
            shape(P, horn, "#f9f7f1", 1.5) + ln(P, mouth, 1.2) +
            '<g class="am-dent">' + ln(P, "M20 -6 L16.5 -1.5 L20.5 1 L17 5.5", 1.1) + ln(P, "M7 -5 L10 -3.4 M8 3.6 L11 4.6", 0.8) + '</g>' +
          '</g></g>' +
          '<g class="am-notes" transform="translate(' + (a.x + a.d * 34) + ' ' + (a.y - 8) + ')">' +
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
  // 6) Sochy: odlij gumáky ze sádry a obuj je Floriánovi
  // =====================================================================
  // Fáze 1: držením prstu teče sádra do formy z gumáku, pustit se musí u rysky (sádra chvilku dotéká).
  // Fáze 2: hotové odlitky přetáhne na sochu.
  HRY.gumaky = function (b, hotovo, onDone) {
    var P = "gm-";
    var SLOT = [{ x: 91.5, y: 88.5 }, { x: 107, y: 88.5 }];
    var HOME = [{ x: 34, y: 129 }, { x: 166, y: 129 }];
    var boot = "M-5.5 -9.5 H5.5 L5.8 4 C8.6 5 9 9 6 9.8 H-6 C-9 9 -8.6 5 -5.8 4 Z";
    function bootSvg(k, dashed) {
      if (dashed) return '<path d="' + boot + '" fill="none" stroke="#8a847a" stroke-width="1" stroke-dasharray="2 2"/>';
      return '<path d="' + boot + '" fill="#f1eee6"/><path d="' + boot + '" fill="url(#' + P + 'xx)" opacity=".35"/>' +
        '<path d="M-5.6 -6.5 H5.6 V-4 H-5.6 Z" fill="#f5c400"/>' + ln(P, boot, 1.4) + ln(P, "M-5.6 -6.5 H5.6 M-5.6 -4 H5.6 M-7 6.5 H7", 0.7);
    }
    // ---- fáze 1: dvě formy ----
    var MS = 3.6, MY = 97, TOP = MY - 9.5 * MS, BOT = MY + 9.8 * MS, MH = BOT - TOP; // forma = gumák zvětšený 3,6×
    var MX = [62, 138], RYSKA = 0.88, OK_LO = 0.8, OK_HI = 0.96, RATE = 0.42, LAG = 0.22;
    function lvlY(l) { return BOT - Math.min(l, 1) * MH; }
    var cast = '<g class="gm-cast">' + paper(P) +
      '<text x="8" y="13" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="7" fill="' + INK + '">Dílna keramičky</text>' +
      MX.map(function (x, k) {
        var tb = "translate(" + x + " " + MY + ") scale(" + MS + ")";
        return '<g class="gm-mold" data-k="' + k + '">' +
          '<clipPath id="' + P + 'clip' + k + '"><path d="' + boot + '" transform="' + tb + '"/></clipPath>' +
          '<path d="' + boot + '" transform="' + tb + '" fill="#d6d1c6"/>' +
          '<g clip-path="url(#' + P + 'clip' + k + ')"><rect class="gm-fill" x="' + (x - 40) + '" y="' + BOT + '" width="80" height="0" fill="#fbfaf5"/>' +
            '<path class="gm-surf" d="" fill="none" stroke="' + INK + '" stroke-width=".8" opacity=".6"/></g>' +
          '<path d="' + boot + '" transform="' + tb + '" fill="none" stroke="' + INK + '" stroke-width=".45" stroke-linejoin="round" filter="url(#' + P + 'w1)"/>' +
          // ryska
          '<path d="M' + (x - 23) + ' ' + f1(lvlY(RYSKA)) + ' H' + (x + 23) + '" stroke="#c2341e" stroke-width="1.1" stroke-dasharray="3 2"/>' +
          '<text x="' + (x + 25) + '" y="' + f1(lvlY(RYSKA) + 1.6) + '" font-family="Atkinson Hyperlegible Next, sans-serif" font-size="4.6" fill="#c2341e">po rysku</text>' +
          '<g class="gm-spill" fill="#fbfaf5" stroke="' + INK + '" stroke-width=".7"><path d="M' + (x - 20) + ' ' + f1(TOP) + ' C' + (x - 26) + ' ' + f1(TOP + 10) + ' ' + (x - 24) + ' ' + f1(TOP + 30) + ' ' + (x - 22) + ' ' + f1(TOP + 34) + ' C' + (x - 19) + ' ' + f1(TOP + 24) + ' ' + (x - 18) + ' ' + f1(TOP + 8) + ' ' + (x - 20) + ' ' + f1(TOP) + ' Z"/>' +
            '<path d="M' + (x + 20) + ' ' + f1(TOP) + ' C' + (x + 25) + ' ' + f1(TOP + 8) + ' ' + (x + 24) + ' ' + f1(TOP + 20) + ' ' + (x + 22) + ' ' + f1(TOP + 24) + ' C' + (x + 20) + ' ' + f1(TOP + 16) + ' ' + (x + 19) + ' ' + f1(TOP + 6) + ' ' + (x + 20) + ' ' + f1(TOP) + ' Z"/></g>' +
          '<g class="gm-check" transform="translate(' + x + ' ' + f1(TOP - 8) + ')">' + ln(P, "M-5 0 L-1.5 3.5 L5.5 -4", 1.8, "", "#2f7d32") + '</g>' +
        '</g>';
      }).join("") +
      // kbelík se sádrou a proud
      '<path class="gm-stream" d="" fill="none" stroke="' + INK + '" stroke-width="3.6" stroke-linecap="round"/>' +
      '<path class="gm-stream2" d="" fill="none" stroke="#fbfaf5" stroke-width="2.2" stroke-linecap="round"/>' +
      '<g class="gm-bucket" transform="translate(' + (MX[0] + 16) + ' 30)"><g class="gm-tilt">' +
        shape(P, "M-9 -9 H9 L7 9 H-7 Z", "#e9e5db", 1.4) + '<path d="M-8.5 -8 H8.5 L8.2 -6 H-8.2 Z" fill="#fbfaf5"/>' +
        ln(P, "M-9 -9 C-9 -19 9 -19 9 -9", 0.9) +
        '<text y="3.4" text-anchor="middle" font-family="Atkinson Hyperlegible Next, sans-serif" font-weight="700" font-size="4.4" fill="' + INK + '">SÁDRA</text>' +
      '</g></g>' +
      '</g>';
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Formy z gumáků, kbelík se sádrou a socha svatého Floriána bez nohou">' +
      defs(P) + backdrop("img/racice/6-florian.svg") +
      // nohy sochy pryč: zakrýt papírem a nakreslit ulomené pahýly
      '<rect x="85.6" y="79.6" width="27.6" height="18.6" fill="#f7f4ec"/>' +
      ln(P, "M86.5 79.5 L88 82 L90 80 L92 83 L94 80.5 L96 82 L97 80", 1.2) + ln(P, "M101.5 80 L103 82.5 L105 80 L107 83 L109 80.5 L111 82 L112.5 80", 1.2) +
      ln(P, "M86.5 79.5 V80.5 M97 80 V79.5 M101.5 80 V79.5 M112.5 80 V79.5", 1.2) +
      ln(P, "M90 92 L91.5 95 M104 93 L106 96.5 M95 96 L96.5 97", 0.7) + // úlomky
      SLOT.map(function (p, k) { return '<g class="gm-slot" data-k="' + k + '" transform="translate(' + p.x + ' ' + p.y + ')">' + bootSvg(k, true) + '</g>'; }).join("") +
      HOME.map(function (p, k) {
        return '<g class="gm-boot" data-k="' + k + '" transform="translate(' + p.x + ' ' + p.y + ')" tabindex="0" role="button" aria-label="' + (k ? "Pravý" : "Levý") + ' sádrový gumák">' +
          '<rect x="-15" y="-16" width="30" height="30" fill="transparent"/>' + bootSvg(k) + '</g>';
      }).join("") +
      (hotovo ? "" : cast) +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: 4, tipTop: true, tip: hotovo ? "" : "Drž prst a lij sádru", label: "Odlévání sádrových gumáků a socha svatého Floriána" });
    g.onDone(onDone);
    var s = g.svg, boots = s.querySelectorAll(".gm-boot"), slots = s.querySelectorAll(".gm-slot");
    var pos = HOME.map(function (p) { return { x: p.x, y: p.y }; }), filled = [null, null], placed = [false, false];
    var phase = hotovo ? 2 : 1;
    var tipEl = g.stage.querySelector(".hr-tip");
    if (!hotovo) { s.classList.add("gm-p1"); if (tipEl) tipEl.classList.remove("hr-tip-top"); }

    // ---- fáze 1 ----
    var molds = s.querySelectorAll(".gm-mold"), bucket = s.querySelector(".gm-bucket");
    var stream = s.querySelector(".gm-stream"), stream2 = s.querySelector(".gm-stream2");
    var cur = 0, lvl = 0, pouring = false, tail = 0, busy = false, pressed = false, raf = 0, last = 0, lastSnd = 0;
    // po krátké pauze (posun kbelíku, vylití formy) začne lít, pokud hráč pořád drží prst
    function unbusy() { busy = false; if (pressed) startPour(); }
    function drawMold() {
      var m = molds[cur]; if (!m) return;
      var y = lvlY(lvl), x = MX[cur];
      var r = m.querySelector(".gm-fill"); r.setAttribute("y", f1(y)); r.setAttribute("height", f1(BOT - y + 1));
      m.querySelector(".gm-surf").setAttribute("d", lvl > 0.02 ? "M" + (x - 30) + " " + f1(y) + " C" + (x - 10) + " " + f1(y - 1.2) + " " + (x + 10) + " " + f1(y + 1.2) + " " + (x + 30) + " " + f1(y) : "");
      var on = pouring || tail > 0;
      var d = on ? "M" + (x + 8) + " 26 C" + (x + 3) + " 30 " + (x + 1) + " 36 " + (x + 1) + " " + f1(y) : "";
      stream.setAttribute("d", d); stream2.setAttribute("d", d);
      s.classList.toggle("gm-pour", on);
    }
    function frame(ts) {
      var dt = Math.min(0.05, (ts - last) / 1000); last = ts;
      if (!g.box.isConnected) return;
      if (pouring) lvl += RATE * dt;
      else if (tail > 0) { var h = Math.min(tail, dt); lvl += RATE * h; tail -= dt; }
      var now = Date.now();
      if ((pouring || tail > 0) && now - lastSnd > 110) { noise({ f: 500 + lvl * 900, q: 1.5, dur: 0.12, gain: 0.08, att: 0.02 }); lastSnd = now; }
      if (lvl > 1.02) { overflow(); return; }
      drawMold();
      if (!pouring && tail <= 0) { settle(); return; }
      raf = requestAnimationFrame(frame);
    }
    function startPour(e) {
      if (phase !== 1 || busy || pouring) return;
      if (e) e.preventDefault();
      ac(); g.hideTip(); g.say("");
      pouring = true; tail = 0; last = performance.now();
      cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
    }
    function stopPour() {
      if (!pouring) return;
      pouring = false; tail = LAG; // sádra ještě chvilku dotéká
    }
    function settle() {
      s.classList.remove("gm-pour");
      if (lvl >= OK_LO && lvl <= OK_HI) {
        busy = true;
        var m = molds[cur]; m.classList.add("ok"); SFX.pop(); vibrate(30); g.set(cur + 1);
        cur++; lvl = 0;
        if (cur < MX.length) {
          g.say("Přesně po rysku! Teď druhý gumák.");
          bucket.setAttribute("transform", "translate(" + (MX[cur] + 16) + " 30)");
          setTimeout(unbusy, 300);
        } else {
          g.say("Odlitky ztuhly. Teď je nasaď Floriánovi.");
          setTimeout(toPhase2, 1100);
        }
      } else if (lvl > OK_HI) {
        g.say("Až po okraj, to by praskalo. Keramička formu vylila, zkus to znovu.");
        reset();
      } else if (lvl > 0.05) {
        g.say("Ještě kousek, dolej až k rysce.");
      }
    }
    function overflow() {
      pouring = false; tail = 0; drawMold();
      var m = molds[cur]; restart(m, "spill"); SFX.slide(); vibrate([20, 40, 20]); g.bump();
      g.say("Přeteklo! Keramička formu vylila. Pusť prst dřív, sádra ještě chvilku dotéká.");
      reset();
    }
    function reset() {
      busy = true; s.classList.remove("gm-pour"); stream.setAttribute("d", ""); stream2.setAttribute("d", "");
      setTimeout(function () { lvl = 0; drawMold(); molds[cur].classList.remove("spill"); pressed = false; unbusy(); g.tip("Drž prst a lij sádru"); }, 1300);
    }
    function toPhase2() {
      phase = 2; busy = false;
      var c = s.querySelector(".gm-cast"); if (c) c.classList.add("pryc");
      s.classList.remove("gm-p1");
      g.say(""); if (tipEl) tipEl.classList.add("hr-tip-top"); g.tip("Přetáhni gumáky na sochu");
      g.stage.classList.add("hr-draw");
      setTimeout(function () { if (c) c.remove(); }, 700);
    }
    if (phase === 1) {
      var st = g.stage;
      st.addEventListener("pointerdown", function (e) { if (phase !== 1) return; e.preventDefault(); pressed = true; try { st.setPointerCapture(e.pointerId); } catch (x) {} startPour(e); });
      st.addEventListener("pointerup", function () { pressed = false; if (phase === 1) stopPour(); });
      st.addEventListener("pointercancel", function () { pressed = false; if (phase === 1) stopPour(); });
      st.addEventListener("contextmenu", function (e) { if (phase === 1) e.preventDefault(); });
      var kb = E("button", { class: "hr-sr", text: "Lít sádru (podrž)" });
      kb.addEventListener("keydown", function (e) { if ((e.key === " " || e.key === "Enter") && !e.repeat) startPour(e); });
      kb.addEventListener("keyup", function (e) { if (e.key === " " || e.key === "Enter") stopPour(); });
      g.box.appendChild(kb);
      drawMold();
    }

    // ---- fáze 2: obout sochu ----
    function put(k, p) { pos[k] = p; boots[k].setAttribute("transform", "translate(" + f1(p.x) + " " + f1(p.y) + ")"); }
    function count() { return placed.filter(Boolean).length; }
    function snap(k, si) {
      filled[si] = k; placed[k] = true;
      boots[k].classList.add("on"); slots[si].style.opacity = 0;
      animate(k, SLOT[si]);
      g.set(2 + count()); SFX.pop(); vibrate(30);
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
        if (phase !== 2 || g.finished || placed[k]) return;
        e.preventDefault(); e.stopPropagation(); g.hideTip();
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
        if ((e.key === "Enter" || e.key === " ") && phase === 2 && !placed[k] && !g.finished) { e.preventDefault(); snap(k, freeSlot(pos[k]).i); }
      });
    });
    if (hotovo) g.stage.classList.add("hr-draw");
    return g.box;
  };

  // =====================================================================
  // 7) Sokolovna: udrž Aloise Hudce na kruzích
  // =====================================================================
  // Klepnutí na stranu: z kraje vyjede hlava (vlevo soused, vpravo babička) a gymnastu sfoukne zpátky.
  // Hlava na straně, kam se houpe, vykukuje jako nápověda.
  HRY.kruhy = function (b, hotovo, onDone) {
    var P = "kr-", NEED = b.hra.sekund || 6, ZONE = 7, PIV = { x: 100, y: -20 };
    var bars = function (x) {
      var d = "M" + x + " 14 V138 M" + (x + 16) + " 14 V138";
      for (var y = 22; y < 136; y += 9) d += " M" + x + " " + y + " H" + (x + 16);
      return ln(P, d, 0.9, ' opacity=".55"');
    };
    // hlava, která fouká doprava (vlevo stojící); pravá je zrcadlová
    function head(side) {
      var r = side > 0, hat = r
        ? shape(P, "M-12 -2 C-13 -14 -2 -17 6 -13 C11 -10 12 -5 11 -1 C6 -6 -4 -8 -12 -2 Z", "#f6dcc9", 1.3) + '<path d="M-12 -2 C-13 -14 -2 -17 6 -13 C11 -10 12 -5 11 -1 C6 -6 -4 -8 -12 -2 Z" fill="url(#' + P + 'red)" opacity=".8"/>' + ln(P, "M-12 -2 L-15 8 M-12 -2 L-9 9", 1.1)
        : shape(P, "M-11 -5 C-11 -13 9 -13 10 -5 Z", "#d6d1c6", 1.3) + ln(P, "M-11 -5 H15", 1.6);
      return '<g class="kr-head" data-s="' + side + '" transform="translate(' + (r ? 190 : 10) + ' 80) scale(' + (r ? -1.2 : 1.2) + ' 1.2)"><g class="kr-slide">' +
        '<g class="kr-air">' + ln(P, "M15 -1 C24 -5 30 3 40 -1 M15 3 C26 1 32 9 44 5 M16 -5 C24 -10 30 -3 38 -7", 1, "", "#2f6fb5") + '</g>' +
        '<g class="kr-face">' +
          shape(P, "M0 -11 C7 -11 11 -6 11 0 C11 7 7 11 0 11 C-7 11 -11 7 -11 0 C-11 -6 -7 -11 0 -11 Z", "#fffdf7", 1.4) +
          '<circle cx="3" cy="-3" r="1.1" fill="' + INK + '"/><circle cx="8" cy="-3" r="1.1" fill="' + INK + '"/>' +
          '<circle class="kr-cheek" cx="7" cy="4" r="3" fill="#f6c9b8"/>' +
          '<circle class="kr-mouth" cx="11.5" cy="2.5" r="1.4" fill="none" stroke="' + INK + '" stroke-width="1"/>' +
          (r ? "" : ln(P, "M2 6.5 C5 7.5 8 7.5 10 6.2", 0.8)) + // knír
          hat +
        '</g>' +
        '<circle class="kr-ping" cx="0" cy="0" r="14" fill="none" stroke="#f0b800" stroke-width="1.6"/>' +
      '</g></g>';
    }
    var svg = '<svg viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gymnasta Alois Hudec drží kříž na kruzích v sokolovně, po stranách soused a babička">' +
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
      head(-1) + head(1) +
      '</svg>';
    var g = shell(b, hotovo, { svg: svg, dots: NEED, tip: "Klepni a začni", label: "Kruhy: klepnutím vlevo nebo vpravo sfoukneš gymnastu zpátky do klidu" });
    g.onDone(onDone);
    var s = g.svg, man = s.querySelector(".kr-man"), heads = s.querySelectorAll(".kr-head");
    var a = 0, v = 0, push = 0, pushT = 0, still = hotovo ? NEED : 0, running = false, last = 0, lastSec = 0;
    function draw() {
      man.setAttribute("transform", "rotate(" + f1(a) + " " + PIV.x + " " + PIV.y + ")");
      s.classList.toggle("calm", Math.abs(a) < ZONE);
      s.classList.toggle("wobble", Math.abs(a) > 18);
      // nápověda: vykukuje hlava na straně, kam se gymnasta houpe (a > 0 = nohy vlevo)
      var hint = running && Math.abs(a) >= ZONE ? (a > 0 ? 0 : 1) : -1;
      heads[0].classList.toggle("peek", hint === 0);
      heads[1].classList.toggle("peek", hint === 1);
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
      g.say(Math.abs(a) < ZONE ? "Drží! " + Math.min(NEED, Math.floor(still)) + " z " + NEED + " s" : a > 0 ? "Houpe se doleva: klepni vlevo, soused ho sfoukne zpátky." : "Houpe se doprava: klepni vpravo, babička ho sfoukne zpátky.");
      draw();
      if (still >= NEED) { running = false; a = 0; v = 0; draw(); g.set(NEED); s.classList.add("all"); g.finish(); return; }
      requestAnimationFrame(loop);
    }
    var left = hotspot(50, 75, 50, 100, "Soused zleva foukne (klepni vlevo)");
    var right = hotspot(150, 75, 50, 100, "Babička zprava foukne (klepni vpravo)");
    // levá polovina: nohy se houpou doleva (a > 0) → foukne soused zleva a vrátí je doprava (a klesá)
    function nudge(dir, e) {
      if (e) e.preventDefault();
      if (g.finished) return;
      if (!running) { running = true; g.hideTip(); last = performance.now(); v = (Math.random() < 0.5 ? -1 : 1) * 6; requestAnimationFrame(loop); return; }
      v += dir * 15; vibrate(12);
      noise({ f: 450, to: 900, q: 0.6, dur: 0.38, gain: 0.2, att: 0.04 }); // fouknutí
      restart(heads[dir < 0 ? 0 : 1], "blow");
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
