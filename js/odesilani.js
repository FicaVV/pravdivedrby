/* Odesílání hodnocení, návrhů obcí a anonymních statistik.
 *
 * Soukromí:
 *  - žádné cookies, žádný identifikátor zařízení ani hráče, žádná přesná časová razítka
 *    (jen den), žádné souřadnice. Každá položka stojí sama za sebe.
 *  - server (Google Apps Script) IP adresu hráče vůbec nevidí.
 *  - statistiky jdou vypnout v Nastavení; při zapnutém Global Privacy Control
 *    jsou ve výchozím stavu vypnuté. Hodnocení a návrh odešle hráč sám tlačítkem.
 *
 * Offline: všechno jde nejdřív do fronty v telefonu (localStorage) a odešle se,
 * jakmile je signál (při startu, po návratu připojení a při odchodu ze stránky).
 */
(function () {
  "use strict";

  var CFG = window.PD_CONFIG || {};
  var ENDPOINT = (CFG.endpoint || "").trim();
  var KEY = "pd:odesilani";
  var MAX_QUEUE = 300;      // víc položek se nedrží, nejstarší statistiky se zahodí
  var VERSION = CFG.verze || "";

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  var st = load();
  if (!Array.isArray(st.fronta)) st.fronta = [];
  if (typeof st.statistiky !== "boolean") st.statistiky = !navigator.globalPrivacyControl;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* soukromé okno */ }
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function clip(s, n) { return String(s == null ? "" : s).slice(0, n); }

  function push(item) {
    item.den = today();
    st.seq = (st.seq || 0) + 1;
    item.q = st.seq;          // jen pořadí ve frontě tohoto telefonu, na server nejde
    st.fronta.push(item);
    if (st.fronta.length > MAX_QUEUE) {
      // zahodit nejstarší statistiky, hodnocení a návrhy držet
      var i = st.fronta.findIndex(function (x) { return x.typ === "udalost"; });
      st.fronta.splice(i === -1 ? 0 : i, 1);
    }
    save();
    schedule(1500);
  }

  var sending = false, timer = null;
  function schedule(ms) {
    if (!ENDPOINT) return;
    clearTimeout(timer);
    timer = setTimeout(flush, ms);
  }

  function flush() {
    if (!ENDPOINT || sending || !st.fronta.length) return Promise.resolve(false);
    if (navigator.onLine === false) return Promise.resolve(false);
    sending = true;
    var batch = st.fronta.slice(0, 50);
    var sent = {};
    batch.forEach(function (x) { sent[x.q] = 1; });
    var body = JSON.stringify({ v: 1, verze: VERSION, polozky: batch.map(function (x) {
      var o = {}; Object.keys(x).forEach(function (k) { if (k !== "q") o[k] = x[k]; }); return o;
    }) });
    // text/plain = „jednoduchý“ požadavek bez CORS preflightu; no-cors, protože
    // Apps Script odpovídá přesměrováním. Vyřešený fetch = data dorazila na server.
    return fetch(ENDPOINT, { method: "POST", mode: "no-cors", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: body, keepalive: body.length < 60000 })
      .then(function () {
        st.fronta = st.fronta.filter(function (x) { return !sent[x.q]; });
        save(); sending = false;
        if (st.fronta.length) schedule(500);
        return true;
      }, function () { sending = false; schedule(60000); return false; });
  }

  window.addEventListener("online", function () { schedule(1000); });
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  schedule(3000);

  window.PD_SEND = {
    aktivni: !!ENDPOINT,
    /** Anonymní událost hry (start, stanoviště, konec). */
    udalost: function (obec, nazev, data) {
      if (!st.statistiky) return;
      var it = { typ: "udalost", obec: clip(obec, 40), nazev: clip(nazev, 40) };
      Object.keys(data || {}).forEach(function (k) {
        var v = data[k];
        if (typeof v === "number" || typeof v === "boolean") it[k] = v;
        else if (v != null) it[k] = clip(v, 40);
      });
      push(it);
    },
    /** Hodnocení okruhu 1–5 hvězd. Další změna během pár vteřin přepíše předchozí, ať se neposílá každé klepnutí. */
    hodnoceni: function (obec, hvezdy) {
      var last = st.fronta[st.fronta.length - 1];
      if (!sending && last && last.typ === "hodnoceni" && last.obec === obec) st.fronta.pop();
      push({ typ: "hodnoceni", obec: clip(obec, 40), hvezdy: Math.max(1, Math.min(5, hvezdy | 0)) });
      schedule(5000);
    },
    /** Návrh další obce od hráče. */
    navrh: function (obec, data) {
      push({ typ: "navrh", obec: clip(obec, 40), navrhObec: clip(data.obec, 120), drb: clip(data.drb, 2000), mail: clip(data.mail, 120) });
    },
    statistiky: function (on) {
      if (on === undefined) return st.statistiky;
      st.statistiky = !!on;
      if (!on) st.fronta = st.fronta.filter(function (x) { return x.typ !== "udalost"; });
      save();
    },
    cekajici: function () { return st.fronta.length; },
    odeslat: flush
  };
})();
