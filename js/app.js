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
    if (!map) return;
    OBEC.body.forEach(function (b, i) {
      var m = pins[b.id];
      if (!m) return; // značky ještě nevznikly (schematická mapa se zapne dřív)
      m.setIcon(pinIcon(b, i));
      if (state.edit) m.dragging.enable(); else m.dragging.disable();
      m.unbindTooltip();
      if (state.edit || (schematic && i === state.idx)) m.bindTooltip(b.id + " " + b.nazev, { permanent: true, direction: "right", offset: [18, 0] });
    });
  }
  function onPinClick(i) {
    if (state.edit) return;
    var b = OBEC.body[i];
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

  // segs = pole odstavců
  function speak(segs, btn) {
    if (playing) { var same = btn === ttsBtn; stopSpeak(); if (same) return; }
    ttsBtn = btn; gen++;
    var rec = state.voice === REC || state.voice === "" ? recordingsFor(segs) : null;
    if (rec) playFiles(rec); else if (hasTTS) speakTTS(segs.join(" "));
    else return;
    playing = true; setTtsBtn(true);
  }
  function playFiles(files) {
    var i = 0, my = gen;
    player = new Audio();
    player.preload = "auto";
    var next = function () {
      if (!player || my !== gen) return;
      if (i >= files.length) { done(my); return; }
      player.src = files[i++]; player.playbackRate = state.rate;
      var p = player.play(); if (p && p.catch) p.catch(function () { done(my); });
    };
    player.addEventListener("ended", next);
    player.addEventListener("error", next);
    next();
  }
  function speakTTS(text) {
    var synth = window.speechSynthesis, voice = chosenVoice(), my = gen;
    synth.cancel();
    // Chrome utíná dlouhé promluvy – posíláme po větách
    var parts = text.match(/[^.!?…]+[.!?…“"]*\s*/g) || [text];
    parts.forEach(function (p, i) {
      var u = new SpeechSynthesisUtterance(p.trim());
      u.lang = voice ? voice.lang : "cs-CZ"; u.rate = state.rate * 0.95; u.pitch = 1;
      if (voice) u.voice = voice;
      if (i === parts.length - 1) u.onend = u.onerror = function () { done(my); };
      synth.speak(u);
    });
  }
  function done(my) { if (my !== gen) return; playing = false; if (player) { player.pause(); player = null; } setTtsBtn(false); }
  function stopSpeak() {
    gen++;
    if (hasTTS) window.speechSynthesis.cancel();
    if (player) { player.pause(); player.removeAttribute("src"); player = null; }
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
  function ttsButton(label, getSegs, primary) {
    var b = el("button", { class: "btn btn-small" + (primary ? " btn-primary" : ""), "data-label": label, text: label });
    b.addEventListener("click", function () { speak(getSegs(), b); });
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
    var story = el("div", { class: "story" });
    b.text.forEach(function (t) { story.appendChild(el("p", { text: t })); });
    body.appendChild(story);

    if (b.modlitba) {
      var pr = el("div", { class: "prayer" });
      pr.innerHTML = b.modlitba.map(esc).join("<br>") + '<span class="cut">…zbytek přepisu se tady na místě nedochoval.</span>';
      body.appendChild(el("div", { class: "tts-row" }, [ttsButton("▶ Přehrát nahrávku modlitby", function () { return [b.modlitba.concat(b.modlitbaKonec).join(" ")]; }, true)]));
      body.appendChild(pr);
    }
    if (b.predOtazkou) body.appendChild(el("blockquote", { class: "quote", text: b.predOtazkou }));

    if (b.otazka) body.appendChild(task(b, i, rec));
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
  // Fotka místa (b.foto = { src, popis, autor }), jinak neutrální obrázek.
  function stopHero(b) {
    var hero = el("div", { class: "stop-hero" });
    var f = b.foto && (typeof b.foto === "string" ? { src: b.foto } : b.foto);
    if (f && f.src) {
      hero.appendChild(el("img", { src: f.src, alt: f.popis || b.nazev, loading: "lazy", decoding: "async" }));
      if (f.autor) hero.appendChild(el("span", { class: "credit", text: "Foto: " + f.autor }));
    } else {
      hero.appendChild(el("div", { class: "ph", "aria-hidden": "true", html: '<svg viewBox="0 0 64 64" fill="none" stroke="#16130f" stroke-width="2.5" stroke-linejoin="round"><path d="M8 54h48"/><path d="M14 54V30L32 16l18 14v24"/><rect x="27" y="38" width="10" height="16"/><rect x="18" y="34" width="7" height="7"/><rect x="39" y="34" width="7" height="7"/></svg>' }));
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
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function task(b, i, rec) {
    var box = el("div", { class: "task" });
    box.appendChild(el("span", { class: "kicker", text: "Úkol v terénu" }));
    box.appendChild(el("h3", { text: b.otazka }));
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
      fb.hidden = false;
      if (b.answer === null) { fb.className = "feedback info"; fb.textContent = "Zapsáno! Tuhle odpověď zatím ověřujeme v terénu, takže ti ji uznáváme. Zapiš si, co na místě opravdu vidíš."; }
      else if (revealed) { fb.className = "feedback info"; fb.textContent = "Správně je " + LETTERS[b.answer] + ") " + b.moznosti[b.answer].replace(/\.$/, "") + ". Nevadí, kronika se dopisuje i tak."; }
      else { fb.className = "feedback ok"; fb.textContent = "Přesně tak! Kapitola se zapisuje do kroniky."; }
      if (!rec) markDone(b, { ok: !revealed, choice: choice, revealed: !!revealed });
      next.innerHTML = ""; next.appendChild(nextButton(b, i, true));
      vibrate(80);
    }

    b.moznosti.forEach(function (m, k) {
      var o = el("button", { class: "opt" }, [el("span", { class: "letter", text: LETTERS[k] }), el("span", { text: m })]);
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
    toast("Postup smazán");
  }

  // ---------- události ----------
  $("#btn-start").addEventListener("click", function () { show("play"); if (state.finished) openChronicle(); });
  $("#btn-reset").addEventListener("click", function () { openSettings(); });
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
})();
