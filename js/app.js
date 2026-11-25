/* Pravdivé drby – prototyp herní logiky (vanilla JS, bez build kroku). */
(function () {
  "use strict";

  var OBEC = window.PD_OBCE[0];
  var IN_ARTIFACT = !!window.PD_ARTIFACT;
  var KEY = "pd:v1:" + OBEC.id;
  var LETTERS = ["A", "B", "C", "D"];

  // ---------- úložiště (guest-first, jen v telefonu) ----------
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; }
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* soukromé okno apod. */ }
  }
  var state = Object.assign({ idx: 0, done: {}, sim: IN_ARTIFACT, edit: false, coords: {}, rating: 0, navrhy: [], finished: false, mapFull: false }, load() || {});
  if (IN_ARTIFACT) state.sim = true;

  // přenést ručně doladěné souřadnice
  OBEC.body.forEach(function (b) { if (state.coords[b.id]) b.pozice = state.coords[b.id]; });

  // ---------- pomocné ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function toast(msg, ms) {
    var t = $("#toast"); t.textContent = msg; t.hidden = false;
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.hidden = true; }, ms || 2600);
  }
  var R = 6371000, rad = Math.PI / 180;
  function distance(a, b) {
    var dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function bearing(a, b) {
    var y = Math.sin((b[1] - a[1]) * rad) * Math.cos(b[0] * rad);
    var x = Math.cos(a[0] * rad) * Math.sin(b[0] * rad) - Math.sin(a[0] * rad) * Math.cos(b[0] * rad) * Math.cos((b[1] - a[1]) * rad);
    return (Math.atan2(y, x) / rad + 360) % 360;
  }
  var DIRS = ["S", "SV", "V", "JV", "J", "JZ", "Z", "SZ"];
  var DIR_WORDS = { S: "na sever", SV: "na severovýchod", V: "na východ", JV: "na jihovýchod", J: "na jih", JZ: "na jihozápad", Z: "na západ", SZ: "na severozápad" };
  function fmtDist(m) {
    if (m >= 1000) return (m / 1000).toFixed(1).replace(".", ",") + "<small>km</small>";
    return Math.round(m) + "<small>m</small>";
  }
  function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
  function current() { return OBEC.body[state.idx] || null; }
  function doneCount() { return Object.keys(state.done).length; }

  // ---------- úvod ----------
  function renderHome() {
    var card = $("#obec-card");
    card.querySelectorAll("[data-f]").forEach(function (n) {
      var f = n.getAttribute("data-f");
      n.textContent = f === "pocet" ? OBEC.body.length : OBEC[f];
    });
    var pl = $("#home-progress"); pl.innerHTML = "";
    OBEC.body.forEach(function (b) { pl.appendChild(el("i", { class: state.done[b.id] ? "on" : "" })); });
    var n = doneCount();
    $("#btn-start").textContent = state.finished ? "Přečíst dopsanou kroniku" : n ? "Pokračovat (" + n + "/" + OBEC.body.length + ")" : "Vyrazit na náves";
    $("#btn-reset").hidden = !n;
    // poprvé: návod rozbalený nahoře; kdo už hrál, má nahoře okruh a návod sbalený
    var back = n > 0 || state.finished;
    $("#home").classList.toggle("returning", back);
    if (back) $("#how").removeAttribute("open");
    $("#reset-confirm").hidden = true;
  }

  function show(id) {
    ["home", "play"].forEach(function (s) { $("#" + s).hidden = s !== id; });
    if (id === "play") {
      var first = !map; initMap();
      setMapFull(state.mapFull, true);
      setTimeout(function () { map.invalidateSize(); if (first) fitRoute(); placeMapToggle(); }, 50);
      startGeo(); update();
    }
  }

  // ---------- mapa ----------
  var map, meMarker, accCircle, pins = {}, routeLine, tileOk = 0, tileErr = 0, schematic = false;
  function initMap() {
    if (map) return;
    map = L.map("map", { zoomControl: false, attributionControl: true }).setView(OBEC.stred, 16);
    if (!window.PD_NO_TILES) {
      var tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© přispěvatelé OpenStreetMap"
      }).addTo(map);
      tiles.on("tileload", function () { tileOk++; });
      tiles.on("tileerror", function () { tileErr++; if (tileErr > 4 && !tileOk) goSchematic(); });
    } else goSchematic();
    routeLine = L.polyline([], { color: "#142019", weight: 3, dashArray: "6 8", opacity: .55 }).addTo(map);
    OBEC.body.forEach(function (b, i) {
      var m = L.marker(b.pozice, { icon: pinIcon(b, i), keyboard: true, title: b.nazev }).addTo(map);
      m.on("click", function () { onPinClick(i); });
      m.on("dragend", function () {
        var p = m.getLatLng(); b.pozice = [+p.lat.toFixed(6), +p.lng.toFixed(6)];
        state.coords[b.id] = b.pozice; save(); drawRoute(); update(); renderCoords();
      });
      pins[b.id] = m;
    });
    drawRoute();
    map.on("click", function (e) {
      if (!state.sim || state.edit) return;
      setSim([e.latlng.lat, e.latlng.lng]);
    });
    fitRoute();
  }
  function fitRoute() {
    map.fitBounds(OBEC.body.map(function (b) { return b.pozice; }), { paddingTopLeft: [24, 90], paddingBottomRight: [24, 40] });
  }
  function goSchematic() {
    if (schematic) return; schematic = true;
    $("#map").classList.add("schematic");
    $("#map-badge").hidden = false;
    refreshPins();
  }
  function drawRoute() { routeLine.setLatLngs(OBEC.body.map(function (b) { return b.pozice; })); }
  function pinIcon(b, i) {
    var cls = state.done[b.id] ? "done" : i === state.idx ? "current" : "future";
    if (state.edit) cls += " draggable";
    var size = i === state.idx && !state.done[b.id] ? 42 : 34;
    return L.divIcon({ className: "", html: '<div class="pin ' + cls + '">' + (state.done[b.id] ? "✓" : b.id) + "</div>", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
  }
  function refreshPins() {
    $("#edit-bar").hidden = !state.edit;
    if (!map) return;
    OBEC.body.forEach(function (b, i) {
      var m = pins[b.id];
      if (!m) return; // značky ještě nevznikly (schematická mapa se zapne dřív)
      m.setIcon(pinIcon(b, i));
      // aktuální cíl vždy navrchu, ať ho nepřekryje sousední značka
      m.setZIndexOffset(i === state.idx && !state.done[b.id] ? 600 : state.done[b.id] ? 300 : 0);
      if (state.edit) m.dragging.enable(); else m.dragging.disable();
      m.unbindTooltip();
      if (state.edit || (schematic && i === state.idx)) m.bindTooltip(b.id + " " + b.nazev, { permanent: true, direction: "right", offset: [18, 0] });
    });
  }
  function onPinClick(i) {
    var b = OBEC.body[i];
    if (state.edit) { toast("Je zapnutý Režim úprav bodů, značky se teď jen přetahují. Vypneš ho nahoře tlačítkem Hotovo.", 4000); return; }
    if (state.done[b.id]) openStop(i);
    else if (i === state.idx) toast("Sem míříš: " + b.nazev);
    else toast(b.id + ". " + b.nazev + " – na řadu přijde později");
  }

  // ---------- poloha: GPS / simulace ----------
  var pos = null, gpsWatch = null, gpsState = "wait", lastAuto = -1;
  function startGeo() {
    $("#sim-panel").hidden = !state.sim;
    if (state.sim) {
      stopGps();
      if (!pos || pos.src !== "sim") {
        var t = current() ? current().pozice : OBEC.stred;
        setSim([t[0] - 0.0011, t[1] - 0.0012]);
      }
      return;
    }
    if (gpsWatch !== null) return;
    if (!("geolocation" in navigator)) { gpsFail("Tenhle prohlížeč polohu neumí. Zapni simulaci v nastavení."); return; }
    gpsState = "wait"; renderGps();
    try {
      gpsWatch = navigator.geolocation.watchPosition(function (p) {
        pos = { ll: [p.coords.latitude, p.coords.longitude], acc: p.coords.accuracy, src: "gps" };
        gpsState = p.coords.accuracy > 60 ? "weak" : "ok";
        renderGps(); drawMe(); update();
      }, function (err) {
        gpsFail(err.code === 1 ? "Poloha je zakázaná. Povol ji v prohlížeči, nebo zapni simulaci." : "GPS teď nechytá. Zkus to venku, nebo použij „Jsem tady“.");
      }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 });
    } catch (e) { gpsFail("Polohu se nepodařilo zjistit."); }
  }
  function stopGps() {
    if (gpsWatch !== null) { try { navigator.geolocation.clearWatch(gpsWatch); } catch (e) {} gpsWatch = null; }
  }
  function gpsFail(msg) { gpsState = "bad"; gpsMsg = msg; renderGps(); update(); }
  var gpsMsg = "";
  function renderGps() {
    var dot = $("#gps-dot"), txt = $("#gps-text");
    dot.className = "dot";
    if (state.sim) { dot.classList.add("sim"); txt.textContent = "Simulace: klepni do mapy, kam chceš jít"; return; }
    if (gpsState === "ok") { dot.classList.add("ok"); txt.textContent = "GPS ±" + Math.round(pos.acc) + " m"; }
    else if (gpsState === "weak") { dot.classList.add("bad"); txt.textContent = "Slabý signál GPS ±" + Math.round(pos.acc) + " m"; }
    else if (gpsState === "bad") { dot.classList.add("bad"); txt.textContent = gpsMsg; }
    else txt.textContent = "Hledám satelity…";
  }
  function setSim(ll) {
    pos = { ll: ll, acc: 5, src: "sim" };
    renderGps(); drawMe(); update();
  }
  function drawMe() {
    if (!map || !pos) return;
    var icon = L.divIcon({ className: "", html: '<div class="me' + (pos.src === "sim" ? " sim" : "") + '"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
    if (!meMarker) {
      meMarker = L.marker(pos.ll, { icon: icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
      accCircle = L.circle(pos.ll, { radius: pos.acc, color: "#1f5fbf", weight: 1, fillOpacity: .08 }).addTo(map);
    } else { meMarker.setLatLng(pos.ll); meMarker.setIcon(icon); accCircle.setLatLng(pos.ll); accCircle.setRadius(pos.acc); }
  }

  // ---------- mapa přes celý displej (volitelně) ----------
  function setMapFull(on, quiet) {
    state.mapFull = !!on; if (!quiet) save();
    $("#play").classList.toggle("map-full", state.mapFull);
    $("#btn-mapfull").setAttribute("aria-pressed", state.mapFull ? "true" : "false");
    $("#mapfull-lbl").textContent = state.mapFull ? "Zmenšit" : "Celá mapa";
    if (map) setTimeout(function () { map.invalidateSize(); placeMapToggle(); }, 30);
    placeMapToggle();
  }
  // tlačítko sedí kousek nad horní hranou radaru, ať je radar velký nebo plovoucí
  function placeMapToggle() {
    var play = $("#play"), radar = $(".radar");
    if (play.hidden) return;
    var gap = play.getBoundingClientRect().bottom - radar.getBoundingClientRect().top;
    play.style.setProperty("--toggle-bottom", Math.round(gap + 12) + "px");
  }
  window.addEventListener("resize", placeMapToggle);

  // ---------- radar ----------
  function update() {
    var b = current();
    if (!b) {
      $("#target-num").textContent = "Okruh dokončen";
      placeMapToggle();
      $("#target-name").textContent = "Kronika je dopsaná";
      $("#dist-num").innerHTML = "✓"; $("#dist-lbl").textContent = "Všech " + OBEC.body.length + " stanovišť máš za sebou.";
      $("#btn-open").hidden = false; $("#btn-open").textContent = "Závěrečná stránka";
      $("#btn-here").hidden = true;
      return;
    }
    $("#btn-here").hidden = false;
    $("#target-num").innerHTML = "Zápis <b>" + b.id + " / " + OBEC.body.length + "</b>";
    $("#target-name").textContent = b.nazev;
    var heat = $("#heat").children, level = 0;
    if (!pos) {
      $("#dist-num").textContent = "–";
      $("#dist-lbl").textContent = gpsState === "bad" ? "Bez polohy. Mapa ti ukáže, kam jít." : "Hledám polohu…";
    } else {
      var d = distance(pos.ll, b.pozice), br = bearing(pos.ll, b.pozice);
      var dir = DIRS[Math.round(br / 45) % 8];
      var reach = OBEC.radius + Math.min(pos.acc || 0, 40);
      $("#dist-num").innerHTML = fmtDist(d);
      $("#arrow").style.transform = "rotate(" + br + "deg)";
      var lbl = d > 400 ? "Ještě kus cesty" : d > 150 ? "Přihřívá se" : d > 60 ? "Už jsi blízko" : d > reach ? "Skoro tam!" : "Jsi na místě!";
      $("#dist-lbl").textContent = lbl + (d > reach ? ", " + DIR_WORDS[dir] : "");
      level = d > 600 ? 1 : d > 300 ? 2 : d > 120 ? 3 : d > reach ? 4 : 5;
      var arrived = d <= reach;
      $("#btn-open").hidden = !arrived;
      $("#btn-open").textContent = "Otevřít stanoviště";
      if (arrived && lastAuto !== state.idx && $("#stop").hidden) {
        lastAuto = state.idx; vibrate([120, 60, 120]); openStop(state.idx);
      }
    }
    for (var i = 0; i < heat.length; i++) {
      heat[i].className = i < level ? "on" + (level === 5 ? " hot" : "") : "";
    }
    placeMapToggle();
  }

  // ---------- předčítání ----------
  // 1) Namluvené MP3 (audio/audio.js, vygenerované přes tools/namluvit.mjs) – stejný přirozený hlas všude, i offline.
  // 2) Jinak hlas prohlížeče: vybíráme nejlepší dostupný český (Natural/Google/vylepšený), ne první v seznamu.
  var hasTTS = "speechSynthesis" in window;
  var AUDIO = window.PD_AUDIO || { files: {} };
  var ttsBtn = null, player = null, playing = false, gen = 0;
  var bgPlayer = null; // zvukový podklad pod předčítáním (např. zvony u kříže)
  var REC = "nahravka"; // hodnota state.voice pro namluveného vypravěče
  if (state.voice === undefined) state.voice = "";
  if (!state.rate) state.rate = 1;

  // stejný hash jako v tools/namluvit.mjs (FNV-1a 32 bit nad normalizovaným textem)
  function norm(t) { return String(t).replace(/\s+/g, " ").trim(); }
  function textKey(t) {
    var s = norm(t), h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return ("0000000" + h.toString(16)).slice(-8);
  }
  function recordingsFor(segs) {
    var out = [];
    for (var i = 0; i < segs.length; i++) { var f = AUDIO.files[textKey(segs[i])]; if (!f) return null; out.push(f); }
    return out.length ? out : null;
  }
  function hasRecordings() { return Object.keys(AUDIO.files || {}).length > 0; }

  // Úseky k předčítání. Stejné texty skládá tools/namluvit.mjs, jinak by se nenašly nahrávky.
  // Sloka/možnost může být text, nebo pole řádků.
  function lines(x) { return [].concat(x).join(" "); }
  function prayerSegs(b) { return b.modlitba.concat(b.modlitbaKonec || []).map(lines); }
  function questionSegs(b) {
    return (b.predOtazkou ? [b.predOtazkou] : []).concat([b.otazka],
      b.moznosti.map(function (m, k) { return "Možnost " + LETTERS[k] + ". " + lines(m); }));
  }

  var voices = [];
  function csVoices() {
    return voices.filter(function (v) { return /^cs\b|^cs[-_]/i.test(v.lang); });
  }
  // čím vyšší skóre, tím přirozenější hlas
  function voiceScore(v) {
    var n = v.name, s = 0;
    if (/natural|neural|online/i.test(n)) s += 50;          // Edge: „Microsoft Antonín Online (Natural)“
    if (/premium|enhanced|vylepšen|siri/i.test(n)) s += 40; // iPhone/Mac: stažené vylepšené hlasy
    if (/google/i.test(n)) s += 30;                         // Chrome / Android
    if (/espeak|compact/i.test(n)) s -= 40;
    if (!v.localService) s += 5;
    return s;
  }
  function bestVoice() { return csVoices().slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); })[0] || null; }
  function chosenVoice() {
    if (state.voice && state.voice !== REC) {
      var v = csVoices().filter(function (x) { return x.voiceURI === state.voice; })[0];
      if (v) return v;
    }
    return bestVoice();
  }
  function loadVoices() { if (hasTTS) voices = window.speechSynthesis.getVoices() || []; }
  if (hasTTS) {
    loadVoices();
    // Chrome hlasy načítá se zpožděním – bez tohohle první přehrání mluvilo výchozím hlasem
    window.speechSynthesis.addEventListener && window.speechSynthesis.addEventListener("voiceschanged", function () {
      loadVoices(); if (!$("#settings").hidden) renderVoiceSelect();
    });
  }
  function canSpeak() { return hasTTS || hasRecordings(); }

  // segs = pole odstavců; o.bg = { src, uvod } – podklad, hlas nastoupí po `uvod` sekundách;
  // o.gap = pauza mezi úseky v sekundách (sloky modlitby, možnosti odpovědi)
  function speak(segs, btn, o) {
    o = o || {};
    var bg = o.bg, gap = (o.gap || 0) * 1000;
    if (playing) { var same = btn === ttsBtn; stopSpeak(); if (same) return; }
    ttsBtn = btn; gen++;
    var rec = state.voice === REC || state.voice === "" ? recordingsFor(segs) : null;
    if (!rec && !hasTTS) return;
    var my = gen, delay = bg ? (bg.uvod || 0) * 1000 : 0;
    var start = function () {
      if (my !== gen) return;
      if (rec) playFiles(rec, !!delay, gap); else if (gap) speakSegs(segs, gap); else speakTTS(segs.join(" "));
    };
    if (bg) startBg(bg.src);
    if (delay) {
      // iPhone pustí zvuk jen z klepnutí: přehrávač/hlas „odemknout“ hned teď, hrát začnou až po úvodu
      if (rec) {
        var pl = player = new Audio(rec[0]); pl.preload = "auto"; pl.muted = true;
        var pp = pl.play(); if (pp && pp.then) pp.then(function () { if (pl.muted) { pl.pause(); pl.muted = false; } }, function () { pl.muted = false; });
      }
      else { var u = new SpeechSynthesisUtterance(" "); u.volume = 0; window.speechSynthesis.speak(u); }
      setTimeout(start, delay);
    } else start();
    playing = true; setTtsBtn(true);
  }
  function startBg(src) {
    stopBg(true);
    bgPlayer = new Audio(src); bgPlayer.preload = "auto"; bgPlayer.volume = 1;
    var p = bgPlayer.play(); if (p && p.catch) p.catch(function () {});
  }
  // ztlumit a zastavit podklad (na iPhonu hlasitost nejde měnit, tam se jen zastaví)
  function stopBg(now) {
    var a = bgPlayer; bgPlayer = null;
    if (!a) return;
    if (now || a.paused) { a.pause(); return; }
    var v = 1, iv = setInterval(function () {
      v -= 0.05;
      if (v <= 0 || a.paused) { clearInterval(iv); a.pause(); return; }
      try { a.volume = v; } catch (e) { /* jen pro čtení */ }
    }, 120);
  }
  function playFiles(files, keep, gap) {
    var i = 0, my = gen;
    if (!keep || !player) player = new Audio();
    player.preload = "auto";
    var next = function () {
      if (!player || my !== gen) return;
      if (i >= files.length) { done(my); return; }
      player.muted = false; player.src = files[i++]; player.playbackRate = state.rate;
      var p = player.play(); if (p && p.catch) p.catch(function () { done(my); });
    };
    player.addEventListener("ended", function () { if (gap && i < files.length) setTimeout(next, gap); else next(); });
    player.addEventListener("error", next);
    next();
  }
  function speakTTS(text, onEnd, keep) {
    var synth = window.speechSynthesis, voice = chosenVoice(), my = gen;
    if (!keep) synth.cancel();
    // Chrome utíná dlouhé promluvy – posíláme po větách
    var parts = text.match(/[^.!?…]+[.!?…“"]*\s*/g) || [text];
    parts.forEach(function (p, i) {
      var u = new SpeechSynthesisUtterance(p.trim());
      u.lang = voice ? voice.lang : "cs-CZ"; u.rate = state.rate * 0.95; u.pitch = 1;
      if (voice) u.voice = voice;
      if (i === parts.length - 1) u.onend = u.onerror = function () { if (my !== gen) return; if (onEnd) onEnd(); else done(my); };
      synth.speak(u);
    });
  }
  // hlas telefonu po úsecích s pauzou mezi nimi
  function speakSegs(segs, gap) {
    var i = 0, my = gen;
    var next = function () {
      if (my !== gen) return;
      if (i >= segs.length) { done(my); return; }
      var last = i === segs.length - 1;
      speakTTS(segs[i], last ? null : function () { setTimeout(next, gap); }, i++ > 0);
    };
    next();
  }
  function done(my) { if (my !== gen) return; playing = false; if (player) { player.pause(); player = null; } stopBg(); setTtsBtn(false); }
  function stopSpeak() {
    gen++;
    if (hasTTS) window.speechSynthesis.cancel();
    if (player) { player.pause(); player.removeAttribute("src"); player = null; }
    stopBg();
    playing = false; setTtsBtn(false);
  }
  function setTtsBtn(on) {
    if (!ttsBtn) return;
    if (ttsBtn.classList.contains("icon-btn")) {
      ttsBtn.classList.toggle("on", on);
      ttsBtn.setAttribute("aria-label", on ? "Zastavit předčítání" : ttsBtn.getAttribute("data-label"));
      return;
    }
    ttsBtn.textContent = on ? "■ Zastavit" : ttsBtn.getAttribute("data-label");
  }
  function ttsButton(label, getSegs, primary, opts) {
    var b = el("button", { class: "btn btn-small" + (primary ? " btn-primary" : ""), "data-label": label, text: label });
    b.addEventListener("click", function () { speak(getSegs(), b, opts); });
    if (!canSpeak()) b.hidden = true;
    return b;
  }

  // ---------- stanoviště ----------
  function sheetHead(title, onClose, extra) {
    return el("div", { class: "sheet-head" }, [
      el("button", { class: "icon-btn", "aria-label": "Zavřít", onclick: onClose, html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' }),
      el("h2", { text: title }), extra || null
    ]);
  }
  function closeSheet(id) { stopSpeak(); $("#" + id).hidden = true; update(); }

  function openStop(i) {
    var b = OBEC.body[i], rec = state.done[b.id];
    var sheet = $("#stop"); sheet.innerHTML = ""; sheet.hidden = false; sheet.scrollTop = 0;
    sheet.appendChild(stopHero(b));
    var body = el("div", { class: "sheet-body" });
    var num = el("div", { class: "stop-num" }, [el("b", { text: "Zápis " + b.id }), b.adresa || null]);
    body.appendChild(el("div", {}, [num, el("h2", { class: "stop-title", text: b.nazev })]));
    var ilu = b.ilustrace || {};
    if (ilu.obrazek) body.appendChild(kresba(ilu.obrazek, ilu.popis, "ilu ilu-hlavni"));
    var story = el("div", { class: "story" });
    b.text.forEach(function (t, i) {
      story.appendChild(el("p", { text: t }));
      (ilu.mezi || []).forEach(function (m) { if (m.po === i) story.appendChild(kresba(m.src, m.popis, "ilu ilu-mezi")); });
    });
    body.appendChild(story);

    if (b.modlitba) {
      var pr = el("div", { class: "prayer" });
      pr.innerHTML = b.modlitba.map(function (sl) { return "<p>" + [].concat(sl).map(esc).join("<br>") + "</p>"; }).join("") +
        '<span class="cut">…zbytek přepisu se tady na místě nedochoval.</span>';
      body.appendChild(el("div", { class: "tts-row" }, [ttsButton("▶ Přehrát nahrávku modlitby", function () { return prayerSegs(b); }, true, { bg: b.podklad, gap: 1.4 })]));
      body.appendChild(pr);
    }
    if (b.hymna) body.appendChild(hymnBox(b.hymna, !b.otazka || !!rec));

    if (b.hra && b.hra.typ === "dojeni" && !b.otazka) {
      // minihra místo otázky: po podojení se kapitola zapíše a ukáže se tlačítko dál
      var dalsi = el("div");
      body.appendChild(dojeni(b, !!rec, function () {
        markDone(b, { ok: true });
        dalsi.appendChild(nextButton(b, i, true));
        setTimeout(function () { dalsi.scrollIntoView({ behavior: "smooth", block: "center" }); }, 900);
      }));
      if (rec) dalsi.appendChild(nextButton(b, i, true));
      body.appendChild(dalsi);
    }
    else if (b.otazka) body.appendChild(task(b, i, rec));
    else {
      var box = el("div", { class: "task" });
      if (b.konec) {
        box.appendChild(el("span", { class: "kicker", text: "Poslední kapitola" }));
        box.appendChild(el("p", { text: "Tímhle je kronika kompletní. Zbývá ji podepsat a zapsat." }));
        box.appendChild(el("button", { class: "btn btn-primary btn-block", text: rec ? "Otevřít závěrečnou stránku" : "Zapsat poslední kapitolu", onclick: function () { markDone(b, { ok: true }); closeSheet("stop"); openFinale(); } }));
      } else {
        box.appendChild(el("span", { class: "kicker", text: "Úkol" }));
        box.appendChild(el("p", { text: b.poznamka || "Tady žádný úkol není, jen si to užij." }));
        box.appendChild(nextButton(b, i, !!rec));
      }
      body.appendChild(box);
    }
    sheet.appendChild(body);
  }
  // Kresba tužkou (img/<obec>/*.svg). V jednosouborové ukázce jsou kresby vložené jako data URI v PD_IMG.
  function kresba(src, popis, cls) {
    var url = (window.PD_IMG && window.PD_IMG[src]) || src;
    return el("figure", { class: cls }, [el("img", { src: url, alt: popis || "", loading: "lazy", decoding: "async" })]);
  }
  // Fotka místa (b.foto = { src, popis, autor }); bez fotky se ukáže jen lišta s tlačítky.
  function stopHero(b) {
    var hero = el("div", { class: "stop-hero" });
    var f = b.foto && (typeof b.foto === "string" ? { src: b.foto } : b.foto);
    if (f && f.src) {
      hero.appendChild(el("img", { src: f.src, alt: f.popis || b.nazev, loading: "lazy", decoding: "async" }));
      if (f.autor) hero.appendChild(el("span", { class: "credit", text: "Foto: " + f.autor }));
    } else {
      // zatím bez fotek: nahoře jen tlačítka zpět a předčítání, žádný obrázek
      hero.classList.add("no-photo");
    }
    var tts = el("button", { class: "icon-btn tts", "aria-label": "Přečíst nahlas", "data-label": "Přečíst nahlas",
      html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>' });
    tts.addEventListener("click", function () { speak(b.text, tts); });
    if (!canSpeak()) tts.hidden = true;
    hero.appendChild(el("div", { class: "hero-btns" }, [
      el("button", { class: "icon-btn", "aria-label": "Zpět na mapu", onclick: function () { closeSheet("stop"); },
        html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' }),
      tts
    ]));
    return hero;
  }
  // Nahrávka u stanoviště (b.hymna = { src, nazev, popis, text: [sloky] }). Hraje offline ze sw.js cache.
  function hymnBox(h, showText) {
    var box = el("div", { class: "hymn" });
    box.appendChild(el("span", { class: "kicker", text: "Klubová hymna" }));
    if (h.nazev) box.appendChild(el("h3", { text: "„" + h.nazev + "“" }));
    if (h.popis) box.appendChild(el("p", { text: h.popis }));
    var a = el("audio", { controls: "", preload: "none", src: h.src });
    a.addEventListener("play", stopSpeak);
    box.appendChild(a);
    if (h.text && h.text.length) {
      var lyr = el("div", { class: "lyrics", hidden: "" });
      h.text.forEach(function (sloka) { lyr.appendChild(el("p", { html: [].concat(sloka).map(esc).join("<br>") })); });
      // text prozrazuje odpověď úkolu, proto se tlačítko ukáže až po vyřešení
      var t = el("button", { class: "btn btn-small lyrics-btn", text: "Zobrazit text hymny" });
      if (!showText) t.hidden = true;
      t.addEventListener("click", function () { lyr.hidden = !lyr.hidden; t.textContent = lyr.hidden ? "Zobrazit text hymny" : "Skrýt text hymny"; });
      box.appendChild(t); box.appendChild(lyr);
    }
    return box;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  // ---------- minihra: dojení kozy (b.hra = { typ: "dojeni", ... }) ----------
  // Kresba je vložená přímo tady (tužka + žlutá jako ostatní kresby), ať jde animovat a funguje offline.
  function dojeniSvg() {
    var P = "dj-", ink = "#2f2c28";
    function line(d, w, extra) {
      return '<path d="' + d + '" fill="none" stroke="' + ink + '" stroke-width="' + w + '" stroke-linecap="round" stroke-linejoin="round" filter="url(#' + P + 'w1)"' + (extra || "") + '/>' +
        '<path d="' + d + '" fill="none" stroke="' + ink + '" stroke-width="' + (w * 0.6).toFixed(2) + '" opacity=".35" stroke-linecap="round" stroke-linejoin="round" filter="url(#' + P + 'w2)"/>';
    }
    function shape(d, fill, w) {
      return '<path d="' + d + '" fill="' + fill + '" stroke="none"/>' + line(d, w || 1.5);
    }
    var body = "M-6 8 C30 2 80 4 120 6 C150 7 180 6 206 10 V58 C190 60 176 58 168 62 C150 70 132 66 112 66 C92 66 74 70 56 64 C44 60 26 62 -6 60 Z";
    var frontLeg = "M30 60 C29 80 30 104 28 128 L27 140 L38 140 L39 128 C41 106 42 84 44 62";
    var hindLeg = "M160 62 C168 78 170 92 164 104 C160 112 160 122 161 132 L160 140 L171 140 L171 132 C172 120 174 110 178 100 C184 86 184 72 182 58";
    var udder = "M88 62 C86 72 88 84 96 90 C104 95 120 95 128 90 C136 84 138 72 136 62 Z";
    var teatL = "M98 89 C97 95 98 101 101 104 C104 104 106 101 106 94";
    var teatR = "M118 94 C118 101 120 104 123 104 C126 101 127 95 126 89";
    var bucket = "M80 120 L144 120 L138 146 L86 146 Z";
    return '<svg class="dj-svg" viewBox="0 0 200 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Koza s nateklým vemenem a prázdné vědro pod ní">' +
      '<defs>' +
      '<filter id="' + P + 'w1"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.4"/></filter>' +
      '<filter id="' + P + 'w2"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="1.8"/></filter>' +
      '<filter id="' + P + 'paper"><feTurbulence baseFrequency=".8" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .38  0 0 0 0 .33  0 0 0 .07 0"/></filter>' +
      '<pattern id="' + P + 'x" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0 V4" stroke="#55514a" stroke-width=".6"/></pattern>' +
      '<pattern id="' + P + 'x2" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-42)"><path d="M0 0 V4" stroke="#55514a" stroke-width=".55"/></pattern>' +
      '<pattern id="' + P + 'yel" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 0 V3" stroke="#f0b800" stroke-width="1.5"/></pattern>' +
      '<pattern id="' + P + 'red" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)"><path d="M0 0 V3" stroke="#c2341e" stroke-width=".9"/></pattern>' +
      '<clipPath id="' + P + 'in"><path d="M82 121 L142 121 L136.6 144.5 L87.4 144.5 Z"/></clipPath>' +
      '</defs>' +
      '<rect width="200" height="150" fill="#f7f4ec"/><rect width="200" height="150" filter="url(#' + P + 'paper)"/>' +
      // plot v pozadí a tráva
      '<g opacity=".45">' + line("M0 76 H200 M0 92 H200 M8 70 V140 M62 70 V140 M150 70 V140 M194 70 V140", 0.6) + '</g>' +
      '<path d="M0 134 C50 128 150 128 200 134 V150 H0Z" fill="url(#' + P + 'yel)" opacity=".55" filter="url(#' + P + 'w2)"/>' +
      line("M4 140 L8 132 L11 140 M186 141 L190 133 L193 141 M56 141 L59 134 L62 141", 0.8) +
      // nohy a tělo (strakatá koza: šrafované skvrny)
      shape(frontLeg + " Z", "#fbf9f3", 1.5) + shape(hindLeg + " Z", "#fbf9f3", 1.5) +
      '<path d="M163 64 C170 80 170 94 165 106 L175 104 C182 88 182 72 180 60Z" fill="url(#' + P + 'x)" opacity=".7"/>' +
      shape(body, "#fbf9f3", 1.6) +
      '<path d="M10 14 C30 10 52 14 58 28 C60 44 40 54 20 50 C8 46 4 30 10 14Z" fill="url(#' + P + 'x)" opacity=".8" filter="url(#' + P + 'w2)"/>' +
      '<path d="M10 14 C30 10 52 14 58 28 C60 44 40 54 20 50 C8 46 4 30 10 14Z" fill="url(#' + P + 'x2)" opacity=".6" filter="url(#' + P + 'w2)"/>' +
      '<path d="M140 10 C160 8 176 14 180 26 C182 40 168 48 152 44 C138 40 132 22 140 10Z" fill="url(#' + P + 'x)" opacity=".8" filter="url(#' + P + 'w2)"/>' +
      line("M70 22 C74 34 72 46 66 56 M150 52 C156 56 164 58 170 58", 0.7) +
      // vemeno (nateklé, při dojení splaskne)
      '<g class="dj-udder" style="transform-origin:112px 62px">' +
        '<path class="dj-teat" d="' + teatL + ' Z" fill="#f6e2da"/>' + line(teatL, 1.4) +
        '<path class="dj-teat" d="' + teatR + ' Z" fill="#f6e2da"/>' + line(teatR, 1.4) +
        '<path d="' + udder + '" fill="#f6e2da"/>' +
        '<path class="dj-sore" d="' + udder + '" fill="url(#' + P + 'red)" opacity=".55"/>' +
        line(udder.replace(/ Z$/, ""), 1.6) +
        line("M112 70 C111 78 112 84 113 90", 0.6) +
      '</g>' +
      // bolest: cikcak čárky kolem vemene
      '<g class="dj-pain" fill="none" stroke="#c2341e" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M76 70 L71 68 L74 74 L68 73"/><path d="M148 70 L153 68 L150 74 L156 73"/><path d="M82 86 L76 88"/><path d="M142 86 L148 88"/>' +
      '</g>' +
      // vědro s mlékem
            '<path d="' + bucket + '" fill="#e9e5db"/>' +
      '<g clip-path="url(#' + P + 'in)"><g class="dj-milk" style="transform:translateY(26px)">' +
        '<rect x="70" y="120" width="84" height="32" fill="#fffdf7"/>' +
        '<path d="M80 120.5 C96 118.5 128 118.5 144 120.5" fill="none" stroke="' + ink + '" stroke-width=".8" opacity=".6"/>' +
      '</g></g>' +
      '<path d="M86 146 L138 146 L140 138 L84 138 Z" fill="url(#' + P + 'x)" opacity=".45"/>' +
      line(bucket.replace(/ Z$/, "") + " Z", 1.6) + line("M82 128 L142 128 M84 138 L140 138", 0.8) +
      line("M80 120 C96 123 128 123 144 120", 0.9) +
'' +
      // proud mléka (střídavě z levého a pravého struku)
      '<g class="dj-stream dj-l"><path d="M101.5 113 L102 121" stroke="' + ink + '" stroke-width="3.6" stroke-linecap="round" fill="none" opacity=".55"/><path d="M101.5 113 L102 121" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/></g>' +
      '<g class="dj-stream dj-r"><path d="M122.5 113 L122 121" stroke="' + ink + '" stroke-width="3.6" stroke-linecap="round" fill="none" opacity=".55"/><path d="M122.5 113 L122 121" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/></g>' +
      // ucho vědra sklopené dopředu
      '<path d="M81 124 C84 141 140 141 143 124" fill="none" stroke="' + ink + '" stroke-width="1.2" filter="url(#' + P + 'w1)"/>' +
      // spokojené zamečení
      '<g class="dj-mee"><path d="M150 108 C150 100 186 100 186 108 C186 116 172 116 166 116 L160 122 L161 116 C154 116 150 114 150 108Z" fill="#fff" stroke="' + ink + '" stroke-width="1.2" filter="url(#' + P + 'w1)"/>' +
        '<text x="168" y="111" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="9" fill="' + ink + '">Méé!</text></g>' +
      '</svg>';
  }

  // krátké „čvrk“ mléka do vědra a na konci zamečení, syntetizované (bez souboru, funguje offline)
  var djAudio = null;
  function djCtx() {
    try { djAudio = djAudio || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { djAudio = null; }
    if (djAudio && djAudio.state === "suspended") djAudio.resume();
    return djAudio;
  }
  function djSquirt(level) {
    var c = djCtx(); if (!c) return;
    var t = c.currentTime, len = 0.32, buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (var k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
    var src = c.createBufferSource(); src.buffer = buf;
    var bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 6;
    // čím plnější vědro, tím vyšší tón
    bp.frequency.setValueAtTime(1800 + level * 250, t); bp.frequency.exponentialRampToValueAtTime(700 + level * 200, t + len);
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(t); src.stop(t + len);
  }
  function djBleat() {
    var c = djCtx(); if (!c) return;
    var t = c.currentTime, len = 0.9;
    var o = c.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(470, t + 0.25); o.frequency.linearRampToValueAtTime(380, t + len);
    var lfo = c.createOscillator(); lfo.frequency.value = 28; var lg = c.createGain(); lg.gain.value = 0.45;
    var am = c.createGain(); am.gain.value = 0.55; lfo.connect(lg); lg.connect(am.gain);
    var f = c.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 1100; f.Q.value = 1.4;
    var g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.06); g.gain.setValueAtTime(0.35, t + len - 0.25); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(am); am.connect(f); f.connect(g); g.connect(c.destination);
    o.start(t); lfo.start(t); o.stop(t + len); lfo.stop(t + len);
  }

  // onDone se zavolá po posledním podojení (ne při znovuotevření hotového stanoviště)
  function dojeni(b, hotovo, onDone) {
    var h = b.hra, need = h.klepnuti || 5, n = hotovo ? need : 0;
    var box = el("div", { class: "hra" });
    box.appendChild(el("span", { class: "kicker", text: h.kicker || "Úkol" }));
    box.appendChild(el("h3", { text: h.nadpis }));
    box.appendChild(el("p", { text: h.zadani }));
    var stage = el("div", { class: "dj-stage", html: dojeniSvg() });
    var tap = el("button", { class: "dj-tap", "aria-label": "Podojit kozu" });
    stage.appendChild(tap);
    var tip = el("span", { class: "dj-tip", text: "Klepni na vemeno" });
    stage.appendChild(tip);
    box.appendChild(stage);
    var dots = el("div", { class: "dj-dots", "aria-hidden": "true" });
    for (var k = 0; k < need; k++) dots.appendChild(el("i"));
    box.appendChild(dots);
    var live = el("p", { class: "dj-count", "aria-live": "polite" });
    box.appendChild(live);
    var fb = el("div", { class: "feedback ok", hidden: "", text: h.hotovo });
    box.appendChild(fb);
    var svg = stage.querySelector("svg");

    function paint() {
      var p = n / need;
      svg.querySelector(".dj-milk").style.transform = "translateY(" + (26 - 22 * p).toFixed(1) + "px)";
      svg.querySelector(".dj-udder").style.transform = "scale(" + (1.22 - 0.22 * p).toFixed(3) + ")";
      svg.querySelector(".dj-sore").style.opacity = (0.55 * (1 - p)).toFixed(2);
      svg.querySelector(".dj-pain").style.opacity = n >= need ? 0 : (1 - 0.8 * p).toFixed(2);
      Array.prototype.forEach.call(dots.children, function (d, k) { d.className = k < n ? "on" : ""; });
      live.textContent = n >= need ? "" : n ? "Podojeno " + n + " z " + need + "." : "";
      if (n >= need) { box.classList.add("done"); tap.disabled = true; tip.hidden = true; fb.hidden = false; }
    }
    tap.addEventListener("click", function () {
      if (n >= need) return;
      n++;
      var s = svg.querySelector(n % 2 ? ".dj-l" : ".dj-r");
      // proud začíná u špičky struku (vemeno se zmenšuje) a končí ve vědru
      var tipY = (62 + 42 * (1.22 - 0.22 * (n - 1) / need) + 1).toFixed(1), x = n % 2 ? 101.5 : 122.5;
      Array.prototype.forEach.call(s.querySelectorAll("path"), function (pa) { pa.setAttribute("d", "M" + x + " " + tipY + " L" + (x + (n % 2 ? 0.8 : -0.8)) + " 124"); });
      s.classList.remove("go"); void s.getBBox(); s.classList.add("go");
      stage.classList.remove("bump"); void stage.offsetWidth; stage.classList.add("bump");
      tip.hidden = true;
      djSquirt(n); vibrate(n >= need ? [30, 60, 30, 60, 90] : 25);
      paint();
      if (n >= need) {
        setTimeout(function () { svg.classList.add("mee"); djBleat(); }, 450);
        if (onDone) setTimeout(onDone, 900);
      }
    });
    if (hotovo) svg.classList.add("mee");
    paint();
    return box;
  }

  function task(b, i, rec) {
    var box = el("div", { class: "task" });
    box.appendChild(el("span", { class: "kicker", text: "Úkol v terénu" }));
    // úvod k úkolu patří přímo k otázce, proto je ve stejném rámečku
    if (b.predOtazkou) box.appendChild(el("p", { class: "task-lead", text: b.predOtazkou }));
    box.appendChild(el("h3", { text: b.otazka }));
    box.appendChild(el("div", { class: "tts-row" }, [ttsButton("▶ Přečíst otázku a možnosti", function () { return questionSegs(b); }, false, { gap: 0.7 })]));
    var opts = el("div", { class: "options" });
    var fb = el("div", { class: "feedback", hidden: "" });
    var tools = el("div", { class: "task-tools" });
    var hint = el("div", { class: "hint", hidden: "", text: "Nápověda: " + b.napoveda });
    var next = el("div");
    var solved = !!rec;

    function finish(choice, revealed) {
      solved = true;
      Array.prototype.forEach.call(opts.children, function (o, k) {
        o.disabled = true;
        if (b.answer === null ? k === choice : k === b.answer) o.classList.add("right");
      });
      tools.hidden = true;
      var lb = $("#stop .lyrics-btn"); if (lb) lb.hidden = false;
      fb.hidden = false;
      if (b.answer === null) { fb.className = "feedback info"; fb.textContent = "Zapsáno! Tuhle odpověď zatím ověřujeme v terénu, takže ti ji uznáváme. Zapiš si, co na místě opravdu vidíš."; }
      else if (revealed) { fb.className = "feedback info"; fb.textContent = "Správně je " + LETTERS[b.answer] + ") " + lines(b.moznosti[b.answer]).replace(/\.$/, "") + ". Nevadí, kronika se dopisuje i tak."; }
      else { fb.className = "feedback ok"; fb.textContent = "Přesně tak! Kapitola se zapisuje do kroniky."; }
      if (!rec) markDone(b, { ok: !revealed, choice: choice, revealed: !!revealed });
      next.innerHTML = ""; next.appendChild(nextButton(b, i, true));
      vibrate(80);
    }

    b.moznosti.forEach(function (m, k) {
      // možnost jako sloka (pole řádků) se vypíše po řádcích
      var o = el("button", { class: "opt" + (Array.isArray(m) ? " verse" : "") }, [el("span", { class: "letter", text: LETTERS[k] }), el("span", { html: [].concat(m).map(esc).join("<br>") })]);
      o.addEventListener("click", function () {
        if (solved) return;
        if (b.answer === null || k === b.answer) return finish(k, false);
        o.classList.add("wrong"); o.disabled = true;
        fb.hidden = false; fb.className = "feedback no"; fb.textContent = "Tohle nesedí. Zkus to znovu, nebo si vezmi nápovědu.";
        vibrate(40);
      });
      opts.appendChild(o);
    });
    tools.appendChild(el("button", { class: "btn btn-small", text: "Nápověda", onclick: function () { hint.hidden = false; } }));
    tools.appendChild(el("button", { class: "btn btn-small btn-ghost", text: "Prozradit odpověď", onclick: function () { finish(b.answer === null ? -1 : b.answer, true); } }));
    box.appendChild(opts); box.appendChild(hint); box.appendChild(fb); box.appendChild(tools); box.appendChild(next);

    if (rec) { // znovu otevřené hotové stanoviště
      Array.prototype.forEach.call(opts.children, function (o, k) {
        o.disabled = true;
        if ((b.answer === null ? rec.choice : b.answer) === k) o.classList.add("right");
      });
      tools.hidden = true;
      fb.hidden = false; fb.className = "feedback ok"; fb.textContent = "Tuhle kapitolu už máš v kronice.";
      next.appendChild(nextButton(b, i, true));
    }
    return box;
  }

  function nextButton(b, i, done) {
    var last = i === OBEC.body.length - 1;
    return el("button", {
      class: "btn btn-primary btn-block",
      text: done ? (current() ? "Na další stanoviště" : "Závěrečná stránka") : "Pokračovat na další stanoviště",
      onclick: function () {
        if (!state.done[b.id]) markDone(b, { ok: true });
        closeSheet("stop");
        if (!current()) openFinale();
        else { toast("Další zastávka: " + current().nazev); if (map) map.panTo(current().pozice); }
      }
    });
  }

  function markDone(b, rec) {
    rec.at = Date.now();
    state.done[b.id] = rec;
    var nextIdx = OBEC.body.findIndex(function (x) { return !state.done[x.id]; });
    state.idx = nextIdx === -1 ? OBEC.body.length : nextIdx;
    if (nextIdx === -1) state.finished = true;
    save(); refreshPins(); renderHome();
  }

  // ---------- kronika ----------
  var ICO_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#16130f"/><path d="M7 12l3.5 3.5L17 9" fill="none" stroke="#f5c400" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICO_LOCK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
  function openChronicle() {
    var sheet = $("#chronicle"); sheet.innerHTML = ""; sheet.hidden = false; sheet.scrollTop = 0;
    sheet.appendChild(sheetHead("Neoficiální kronika", function () { closeSheet("chronicle"); }));
    var body = el("div", { class: "sheet-body chronicle" });
    var nxt = current();
    body.appendChild(el("h2", { class: "obec-title", text: OBEC.nazev }));
    var pl = el("div", { class: "progress-line", "aria-hidden": "true" });
    OBEC.body.forEach(function (b) { pl.appendChild(el("i", { class: state.done[b.id] ? "on" : nxt && b.id === nxt.id ? "next" : "" })); });
    body.appendChild(pl);
    body.appendChild(el("p", { class: "ch-meta", text: "Dopsáno " + doneCount() + " z " + OBEC.body.length + " kapitol" }));
    var all = [], ttsSlot = el("div", { class: "tts-row" });
    body.appendChild(ttsSlot);
    var locked = el("div", { class: "ch-locked" });
    OBEC.body.forEach(function (b, i) {
      if (state.done[b.id]) {
        var h = el("h3", {}, [el("span", { text: b.id + " · " + b.nazev })]);
        h.insertAdjacentHTML("beforeend", ICO_CHECK);
        var card = el("section", { class: "ch-card done" }, [h]);
        // odměna: kresba stanoviště „vlepená“ do kroniky jako fotka s popiskem
        if (b.ilustrace && b.ilustrace.obrazek) {
          var pol = kresba(b.ilustrace.obrazek, b.ilustrace.popis, "ch-foto");
          if (b.ilustrace.popis) pol.appendChild(el("figcaption", { text: b.ilustrace.popis }));
          card.appendChild(pol);
        }
        b.text.forEach(function (t) { card.appendChild(el("p", { text: t })); });
        if (b.id !== 4) all = all.concat(b.text);
        body.appendChild(card);
      } else if (nxt && b.id === nxt.id) {
        body.appendChild(el("section", { class: "ch-card next" }, [
          el("div", {}, [el("small", { text: "Na řadě · odkryješ na místě" }), el("h3", { text: b.id + " · " + b.nazev })]),
          el("button", { class: "btn btn-small", text: "Na mapě", onclick: function () {
            closeSheet("chronicle"); if ($("#play").hidden) show("play"); if (map) map.panTo(b.pozice);
          } })
        ]));
      } else {
        var row = el("div", {}, [el("span", { text: b.id + " · " + b.nazev })]);
        row.insertAdjacentHTML("afterbegin", ICO_LOCK);
        locked.appendChild(row);
      }
    });
    if (locked.children.length) body.appendChild(locked);
    if (all.length) ttsSlot.appendChild(ttsButton("▶ Přečíst kroniku nahlas", function () { return all; }));
    else ttsSlot.remove();
    sheet.appendChild(body);
  }

  // ---------- finále ----------
  function openFinale() {
    var sheet = $("#finale"); sheet.innerHTML = ""; sheet.hidden = false; sheet.scrollTop = 0;
    sheet.appendChild(sheetHead("Konec okruhu", function () { closeSheet("finale"); }));
    var body = el("div", { class: "sheet-body" });
    var good = Object.keys(state.done).filter(function (k) { return state.done[k].ok; }).length;
    body.appendChild(el("div", { class: "finale-hero" }, [
      el("h2", { text: "Kronika je dopsaná" }),
      el("p", { text: "Prošli jste celý okruh " + OBEC.nazev + ". Bez nápovědy jste zvládli " + good + " z " + OBEC.body.length + " stanovišť. Teď už víte, proč jsou od roku 1960 obě obce jednou." })
    ]));
    body.appendChild(el("h3", { text: "A teď vážně: co je pravda" }));
    var ul = el("ul", { class: "fact-list" });
    OBEC.fakta.forEach(function (f) { ul.appendChild(el("li", { text: f })); });
    body.appendChild(ul);
    body.appendChild(el("p", { class: "draft-note", text: "Pracovní verze faktické stránky, obsah se ještě doplní." }));
    body.appendChild(el("button", { class: "btn btn-block", text: "Přečíst celou kroniku", onclick: function () { closeSheet("finale"); openChronicle(); } }));

    body.appendChild(el("h3", { text: "Jak se vám okruh líbil?" }));
    var stars = el("div", { class: "stars", role: "group", "aria-label": "Hodnocení" });
    for (var s = 1; s <= 5; s++) (function (n) {
      stars.appendChild(el("button", { class: n <= state.rating ? "on" : "", "aria-label": n + " z 5", text: "★", onclick: function () {
        state.rating = n; save();
        Array.prototype.forEach.call(stars.children, function (c, k) { c.className = k < n ? "on" : ""; });
        toast("Díky za hodnocení!");
      } }));
    })(s);
    body.appendChild(stars);

    body.appendChild(el("h3", { text: "Navrhněte další obec" }));
    var form = el("form", { class: "form" });
    form.innerHTML = '<label for="nv-obec">Obec</label><input id="nv-obec" required placeholder="např. Horní Dolní">' +
      '<label for="nv-drb">Co se tam šušká?</label><textarea id="nv-drb" placeholder="Historka, kterou znáte z hospody nebo přes plot"></textarea>' +
      '<label for="nv-mail">E-mail (nepovinný)</label><input id="nv-mail" type="email" placeholder="ozveme se, až okruh vznikne">' +
      '<button class="btn btn-primary" type="submit">Odeslat návrh</button>' +
      '<p class="draft-note">V prototypu se návrh uloží jen v telefonu. Odesílání na server přidáme s backendem.</p>';
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      state.navrhy.push({ obec: $("#nv-obec").value, drb: $("#nv-drb").value, mail: $("#nv-mail").value, at: Date.now() });
      save(); form.reset(); toast("Návrh uložený. Díky!");
    });
    body.appendChild(form);
    body.appendChild(el("button", { class: "btn btn-ghost", text: "Zpět na úvod", onclick: function () { closeSheet("finale"); show("home"); renderHome(); } }));
    sheet.appendChild(body);
  }

  // ---------- nastavení ----------
  function sw(id, checked, onChange) {
    var w = el("label", { class: "switch" });
    var inp = el("input", { type: "checkbox", id: id }); inp.checked = checked;
    inp.addEventListener("change", function () { onChange(inp.checked); });
    w.appendChild(inp); w.appendChild(el("span")); return w;
  }
  function renderCoords() {
    var pre = $("#coords-out"); if (!pre) return;
    pre.textContent = JSON.stringify(OBEC.body.map(function (b) { return { id: b.id, nazev: b.nazev, pozice: b.pozice }; }), null, 1);
  }
  // ---------- nastavení předčítání ----------
  var SAMPLE = "V obecní kronice Račic dnes nalistujeme paměti z léta roku 1958.";
  function voiceSettings() {
    var sel = el("select", { id: "set-voice", class: "select" });
    sel.addEventListener("change", function () { state.voice = sel.value; save(); stopSpeak(); renderVoiceNote(); });
    var rate = el("input", { type: "range", id: "set-rate", min: "0.7", max: "1.3", step: "0.05", value: String(state.rate) });
    var rateOut = el("span", { class: "rate-out", text: fmtRate(state.rate) });
    rate.addEventListener("input", function () { state.rate = parseFloat(rate.value) || 1; rateOut.textContent = fmtRate(state.rate); save(); });
    var test = el("button", { class: "btn btn-small", "data-label": "▶ Vyzkoušet", text: "▶ Vyzkoušet" });
    test.addEventListener("click", function () {
      var first = OBEC.body[0].text[0];
      speak(recordingsFor([first]) && (state.voice === REC || state.voice === "") ? [first] : [SAMPLE], test);
    });
    var box = el("div", { class: "setting setting-col" }, [
      el("div", {}, [el("strong", { text: "Hlas předčítání" }), el("p", { id: "voice-note" })]),
      el("label", { class: "field" }, [el("span", { text: "Hlas" }), sel]),
      el("label", { class: "field" }, [el("span", {}, ["Rychlost ", rateOut]), rate]),
      el("div", { class: "task-tools" }, [test])
    ]);
    setTimeout(function () { renderVoiceSelect(); }, 0);
    return box;
  }
  function fmtRate(r) { return Math.abs(r - 1) < 0.01 ? "normální" : (r < 1 ? "pomalejší" : "rychlejší") + " (" + r.toFixed(2).replace(".", ",") + "×)"; }
  function renderVoiceSelect() {
    var sel = $("#set-voice"); if (!sel) return;
    sel.innerHTML = "";
    sel.appendChild(el("option", { value: "", text: "Automaticky (nejpřirozenější dostupný)" }));
    if (hasRecordings()) sel.appendChild(el("option", { value: REC, text: "Namluvený vypravěč (stejný na všech telefonech)" }));
    csVoices().slice().sort(function (a, b) { return voiceScore(b) - voiceScore(a); }).forEach(function (v) {
      sel.appendChild(el("option", { value: v.voiceURI, text: v.name.replace(/^Microsoft |^Google /, "") + (v.localService ? "" : " · online") }));
    });
    sel.value = state.voice;
    if (sel.value !== state.voice) sel.value = "";
    renderVoiceNote();
  }
  function renderVoiceNote() {
    var p = $("#voice-note"); if (!p) return;
    var useRec = hasRecordings() && (state.voice === REC || state.voice === "");
    var v = chosenVoice();
    if (useRec) p.textContent = "Příběhy čte namluvený vypravěč, funguje i bez signálu. Kde nahrávka chybí, přečte ji hlas telefonu.";
    else if (!v) p.textContent = "Telefon nemá žádný český hlas. Přidej ho v nastavení telefonu: Android → Převod textu na řeč, iPhone → Zpřístupnění → Předčítaný obsah → Hlasy → Čeština.";
    else p.textContent = "Teď čte: " + v.name + ". " + (/iphone|ipad|mac/i.test(navigator.userAgent) ? "Na iPhonu zní nejlépe vylepšená Zuzana: Nastavení → Zpřístupnění → Předčítaný obsah → Hlasy → Čeština." : "Hlas vybírá telefon, jiné telefony mohou znít jinak.");
  }

  function openSettings() {
    var sheet = $("#settings"); sheet.innerHTML = ""; sheet.hidden = false;
    sheet.appendChild(sheetHead("Nastavení", function () { closeSheet("settings"); }));
    var body = el("div", { class: "sheet-body" });
    if (canSpeak()) body.appendChild(voiceSettings());
    body.appendChild(el("div", { class: "setting" }, [
      el("div", {}, [el("strong", { text: "Simulace polohy" }), el("p", { text: IN_ARTIFACT ? "V této ukázce je zapnutá vždy, protože stránka nemá přístup k GPS." : "Pro zkoušení doma. Poloha se nastaví klepnutím do mapy nebo tlačítkem „Krok k cíli“." })]),
      sw("set-sim", state.sim, function (v) {
        if (IN_ARTIFACT && !v) { $("#set-sim").checked = true; toast("V ukázce GPS nejde. Vyzkoušej nainstalovanou verzi."); return; }
        state.sim = v; save(); pos = null; startGeo(); update();
      })
    ]));
    body.appendChild(el("div", { class: "setting" }, [
      el("div", {}, [el("strong", { text: "Režim úprav bodů" }), el("p", { text: "Pro autory trasy. Značky na mapě jdou přetáhnout na správné místo. Souřadnice si pak zkopírujte níže." })]),
      sw("set-edit", state.edit, function (v) { state.edit = v; save(); refreshPins(); if (v) { closeSheet("settings"); show("play"); toast("Přetáhni značky na správná místa"); } })
    ]));
    var pre = el("pre", { class: "coords", id: "coords-out" });
    body.appendChild(el("h3", { text: "Souřadnice stanovišť" }));
    body.appendChild(el("p", { class: "draft-note", text: "Body 1–4, 7 a 8 jsou zatím umístěné odhadem. Přesné jsou jen stadion a sochy." }));
    body.appendChild(pre);
    body.appendChild(el("button", { class: "btn btn-small", text: "Zkopírovat souřadnice", onclick: function () {
      var txt = pre.textContent;
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(function () { toast("Zkopírováno"); }, selectPre);
      else selectPre();
      function selectPre() { var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Označeno, zkopíruj ručně"); }
    } }));
    var confirmBox = el("div", { hidden: "" }, [
      el("p", { text: "Opravdu smazat postup? Kronika se zase zamkne." }),
      el("div", { class: "task-tools" }, [
        el("button", { class: "btn btn-small", text: "Ano, smazat", onclick: resetProgress }),
        el("button", { class: "btn btn-small btn-ghost", text: "Nechat být", onclick: function () { confirmBox.hidden = true; } })
      ])
    ]);
    body.appendChild(el("h3", { text: "Postup" }));
    body.appendChild(el("button", { class: "btn btn-small", text: "Smazat postup v tomto telefonu", onclick: function () { confirmBox.hidden = false; } }));
    body.appendChild(confirmBox);
    body.appendChild(el("p", { class: "draft-note", text: "Prototyp 0.1 · mapa © přispěvatelé OpenStreetMap" }));
    sheet.appendChild(body);
    renderCoords();
  }
  function resetProgress() {
    state.idx = 0; state.done = {}; state.finished = false; lastAuto = -1; save();
    refreshPins(); renderHome(); closeSheet("settings"); pos = null; if (!$("#play").hidden) startGeo();
    toast(state.edit ? "Postup smazán. Pozor, Režim úprav bodů je pořád zapnutý." : "Postup smazán");
  }

  // ---------- události ----------
  $("#btn-start").addEventListener("click", function () { show("play"); if (state.finished) openChronicle(); });
  $("#btn-reset").addEventListener("click", function () { $("#reset-confirm").hidden = false; $("#reset-yes").focus(); });
  $("#reset-yes").addEventListener("click", resetProgress);
  $("#reset-no").addEventListener("click", function () { $("#reset-confirm").hidden = true; });
  $("#edit-bar").addEventListener("click", function () {
    state.edit = false; save(); refreshPins();
    var s = $("#set-edit"); if (s) s.checked = false;
    toast("Režim úprav vypnutý, značky jdou zase otevírat");
  });
  $("#btn-settings-home").addEventListener("click", openSettings);
  $("#btn-home").addEventListener("click", function () { show("home"); renderHome(); });
  $("#btn-chronicle").addEventListener("click", openChronicle);
  $("#btn-settings").addEventListener("click", openSettings);
  $("#btn-mapfull").addEventListener("click", function () { setMapFull(!state.mapFull); });
  $("#btn-open").addEventListener("click", function () { if (current()) openStop(state.idx); else openFinale(); });
  $("#btn-here").addEventListener("click", function () { if (current()) { lastAuto = state.idx; openStop(state.idx); } });
  $("#sim-step").addEventListener("click", function () {
    var b = current(); if (!b || !pos) return;
    var d = distance(pos.ll, b.pozice), f = Math.min(1, 25 / Math.max(d, 1));
    setSim([pos.ll[0] + (b.pozice[0] - pos.ll[0]) * f, pos.ll[1] + (b.pozice[1] - pos.ll[1]) * f]);
  });
  $("#sim-jump").addEventListener("click", function () {
    var b = current(); if (!b) return;
    setSim([b.pozice[0] + 0.00008, b.pozice[1] + 0.00005]);
  });
  // Pro testy: window.PD.setSim([lat,lng])
  window.PD = { setSim: setSim, state: state, obec: OBEC };

  renderHome();
  refreshPins();
})();
