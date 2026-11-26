#!/usr/bin/env python3
"""
Kreslená mapa okruhu z dat OpenStreetMap  →  data/racice-mapa.js

Vstup:  tools/osm/racice-osm.json  (výřez OSM, API /api/0.6/map, jen potřebné tagy)
        data/racice.js             (souřadnice stanovišť)
Výstup: data/racice-mapa.js        (ulice, domy, voda, pole, trasa mezi stanovišti, popisky)

Data © přispěvatelé OpenStreetMap, licence ODbL 1.0 (https://www.openstreetmap.org/copyright).
Výsledný soubor je odvozená databáze, a proto je pod stejnou licencí ODbL.

Kresba „tužkou“ vzniká už tady: čáry se zhustí a lehce rozvlní (pevné semínko, výstup je
pokaždé stejný), takže prohlížeč kreslí obyčejné cesty bez náročných SVG filtrů.

Spuštění:  python3 tools/kreslena-mapa.py
Nový výřez OSM: viz tools/osm/README.md.
"""
import heapq, json, math, random, re, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RAW = json.loads((ROOT / "tools/osm/racice-osm.json").read_text())
SRC = (ROOT / "data/racice.js").read_text()

# výřez mapy (jih, západ, sever, východ)
S, W, N, E = 49.2728, 16.8660, 49.2858, 16.8858
LAT0 = (S + N) / 2
MX = 111320 * math.cos(math.radians(LAT0))   # metrů na stupeň délky
MY = 110540                                   # metrů na stupeň šířky
rnd = random.Random(1958)

def to_m(p): return ((p[1] - W) * MX, (p[0] - S) * MY)
def to_ll(x, y): return (S + y / MY, W + x / MX)

# ---------- stanoviště z data/racice.js ----------
STOPS = [(int(i), float(a), float(b)) for i, a, b in
         re.findall(r"id:\s*(\d+),[\s\S]*?pozice:\s*\[([\d.]+),\s*([\d.]+)\]", SRC)]
assert len(STOPS) == 8, STOPS

# ---------- ořez na výřez ----------
def inside(p, pad=0.0006):
    return S - pad <= p[0] <= N + pad and W - pad <= p[1] <= E + pad

def clip_line(g):
    out, cur = [], []
    for p in g:
        if inside(p): cur.append(p)
        else:
            if len(cur) > 1: out.append(cur)
            cur = []
    if len(cur) > 1: out.append(cur)
    return out

# ---------- rozvlnění ----------
def wobble_line(g, amp=0.9, step=7.0, seed=None):
    """Zhustit po ~step m a posunout kolmo o plynulý šum ±amp m (ruka s tužkou)."""
    r = random.Random(seed) if seed is not None else rnd
    P = [to_m(p) for p in g]
    pts = [P[0]]
    for (x1, y1), (x2, y2) in zip(P, P[1:]):
        L = math.hypot(x2 - x1, y2 - y1)
        n = max(1, int(L // step))
        for k in range(1, n + 1):
            pts.append((x1 + (x2 - x1) * k / n, y1 + (y2 - y1) * k / n))
    # plynulý šum: náhodné kotvy každých ~4 bodů, mezi nimi kosinová interpolace
    anchors = [r.uniform(-amp, amp) for _ in range(len(pts) // 4 + 3)]
    out = []
    for i, (x, y) in enumerate(pts):
        if i == 0 or i == len(pts) - 1: off = 0.0
        else:
            a = i / 4; k = int(a); t = (1 - math.cos((a - k) * math.pi)) / 2
            off = anchors[k] * (1 - t) + anchors[k + 1] * t
        j = max(0, min(len(pts) - 1, i + 1)); h = max(0, i - 1)
        dx, dy = pts[j][0] - pts[h][0], pts[j][1] - pts[h][1]
        L = math.hypot(dx, dy) or 1
        out.append(to_ll(x - dy / L * off, y + dx / L * off))
    return out

def simplify_ring(g, tol):
    """Uzavřený obrys: zjednodušit po polovinách (jinak by DP z kruhu nechal jediný bod)."""
    if g[0] == g[-1]: g = g[:-1]
    if len(g) < 5: return g
    h = len(g) // 2
    return simplify(g[:h + 1], tol)[:-1] + simplify(g[h:] + [g[0]], tol)[:-1]

def wobble_poly(g, amp=0.35):
    P = [to_m(p) for p in g]
    if P[0] == P[-1]: P = P[:-1]
    return [to_ll(x + rnd.uniform(-amp, amp), y + rnd.uniform(-amp, amp)) for x, y in P]

def simplify(g, tol=0.6):
    """Douglas-Peucker v metrech."""
    if len(g) < 3: return g
    P = [to_m(p) for p in g]
    keep = [False] * len(P); keep[0] = keep[-1] = True
    st = [(0, len(P) - 1)]
    while st:
        a, b = st.pop()
        (x1, y1), (x2, y2) = P[a], P[b]
        L = math.hypot(x2 - x1, y2 - y1) or 1e-9
        best, bi = 0, -1
        for i in range(a + 1, b):
            d = abs((x2 - x1) * (y1 - P[i][1]) - (x1 - P[i][0]) * (y2 - y1)) / L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = True; st += [(a, bi), (bi, b)]
    return [g[i] for i in range(len(g)) if keep[i]]

# ---------- třídění prvků ----------
ROAD = {"tertiary": "hlavni", "secondary": "hlavni", "primary": "hlavni", "unclassified": "ulice",
        "residential": "ulice", "living_street": "ulice", "service": "cesta", "track": "cesta",
        "path": "stezka", "footway": "stezka", "cycleway": "stezka", "steps": "stezka", "pedestrian": "stezka"}
ulice, domy, plochy, toky, body = [], [], [], [], []
graph_ways = []
for e in RAW:
    t, g = e["t"], [tuple(p) for p in e["g"]]
    if e.get("n"):
        body.append(e); continue
    hw = t.get("highway")
    if hw in ROAD:
        if t.get("service") in ("parking_aisle",): continue
        graph_ways.append(g)
        for part in clip_line(g):
            ulice.append({"k": ROAD[hw], "g": part})
        continue
    if "building" in t and len(g) >= 4 and inside(g[0], 0):
        domy.append(g); continue
    if t.get("waterway") in ("stream", "river", "ditch", "canal"):
        if t.get("tunnel"): continue
        for part in clip_line(g): toky.append({"g": part, "name": t.get("name")})
        continue
    kind = None
    if t.get("natural") == "water": kind = "voda"
    elif t.get("natural") == "wetland": kind = "mokrad"
    elif t.get("landuse") in ("farmland",): kind = "pole"
    elif t.get("landuse") in ("meadow", "grass") or t.get("natural") == "grassland": kind = "louka"
    elif t.get("landuse") in ("forest",) or t.get("natural") == "wood": kind = "les"
    elif t.get("landuse") == "cemetery": kind = "hrbitov"
    elif t.get("leisure") == "pitch": kind = "hriste"
    elif t.get("leisure") == "playground": kind = "detske"
    elif t.get("landuse") in ("farmyard", "industrial"): kind = "dvur"
    if kind and len(g) >= 4 and e.get("role", "outer") == "outer":
        plochy.append({"k": kind, "g": g, "name": t.get("name"), "sport": t.get("sport")})

# ---------- trasa mezi stanovišti (nejkratší pěší cesta po ulicích) ----------
def key(p): return (round(p[0], 6), round(p[1], 6))
adj = {}
def dist(a, b):
    (x1, y1), (x2, y2) = to_m(a), to_m(b)
    return math.hypot(x2 - x1, y2 - y1)
for g in graph_ways:
    for a, b in zip(g, g[1:]):
        ka, kb = key(a), key(b); d = dist(a, b)
        adj.setdefault(ka, []).append((kb, d)); adj.setdefault(kb, []).append((ka, d))

def snap(p):
    """Napojit bod na nejbližší úsek ulice (vloží nový uzel do grafu)."""
    best = None
    for a in list(adj):
        for b, _ in adj[a]:
            (ax, ay), (bx, by), (px_, py_) = to_m(a), to_m(b), to_m(p)
            vx, vy = bx - ax, by - ay; L2 = vx * vx + vy * vy or 1e-9
            t = max(0, min(1, ((px_ - ax) * vx + (py_ - ay) * vy) / L2))
            qx, qy = ax + t * vx, ay + t * vy
            d = math.hypot(px_ - qx, py_ - qy)
            if best is None or d < best[0]: best = (d, a, b, to_ll(qx, qy))
    d, a, b, q = best
    kq = key(q)
    for x in (a, b):
        dd = dist(q, x)
        adj.setdefault(kq, []).append((x, dd)); adj[x].append((kq, dd))
    kp = key(p)
    if kp != kq:
        adj.setdefault(kp, []).append((kq, d)); adj[kq].append((kp, d))
    return kp, d

def dijkstra(s, t):
    D, prev, pq = {s: 0}, {}, [(0, s)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == t: break
        if d > D.get(u, 1e18): continue
        for v, w in adj.get(u, []):
            nd = d + w
            if nd < D.get(v, 1e18): D[v] = nd; prev[v] = u; heapq.heappush(pq, (nd, v))
    path, u = [t], t
    while u != s: u = prev[u]; path.append(u)
    return path[::-1], D[t]

snapped = [snap((a, b)) for _, a, b in STOPS]
trasa, celkem = [], 0
for (ka, _), (kb, _) in zip(snapped, snapped[1:]):
    p, d = dijkstra(ka, kb)
    celkem += d
    trasa.append([to_ll(*to_m(x)) for x in p])
print("trasa: %.0f m, odbočky ke stanovištím: %s" % (celkem, [round(d) for _, d in snapped]))

# ---------- kódování: [lat0, lng0, dlat, dlng, …] v 1e-5 stupně (~1 m) ----------
def enc(g):
    out, pa, pb = [], 0, 0
    for a, b in g:
        ia, ib = round(a * 1e5), round(b * 1e5)
        out += [ia - pa, ib - pb]; pa, pb = ia, ib
    return out

data = {
    "licence": "Mapová data © přispěvatelé OpenStreetMap (ODbL)",
    "meze": [[S, W], [N, E]],
    "ulice": [{"k": u["k"], "g": enc(wobble_line(simplify(u["g"], 0.4), amp=0.7 if u["k"] == "hlavni" else 0.9))} for u in ulice],
    "domy": [enc(wobble_poly(simplify_ring(g, 0.5))) for g in domy],
    "plochy": [dict({"k": p["k"], "g": enc(wobble_poly(simplify_ring(p["g"], 1.2), 0.8))},
                    **({"n": p["name"]} if p["name"] else {})) for p in plochy],
    "toky": [enc(wobble_line(simplify(t["g"], 0.8), amp=1.2)) for t in toky],
    "trasa": [enc(wobble_line(simplify(l, 0.3), amp=0.5, seed=i)) for i, l in enumerate(trasa)],
    "delka": round(celkem),
}

# popisky v krajině (ruční písmo); souřadnice [lat, lng], r = natočení ve stupních
data["popisky"] = [
    {"t": "pole", "p": [49.2842, 16.8700], "r": -8},
    {"t": "pole", "p": [49.2745, 16.8835], "r": 6},
    {"t": "pole", "p": [49.2852, 16.8830], "r": -4},
    {"t": "louka", "p": [49.2790, 16.8790], "r": -6},
    {"t": "Valcha", "p": [49.2763, 16.8680], "r": 4, "c": "voda"},
    {"t": "Račický potok", "p": [49.2830, 16.8722], "r": -58, "c": "voda"},
    {"t": "hřbitov", "p": [49.2808, 16.8722], "r": -3},
    {"t": "zámek", "p": [49.2747, 16.8690], "r": 0},
]
# kde se v mapě schovává koza (pase se na louce mezi stadionem a křížem)
data["koza"] = [49.2803, 16.8786]
# štítky stanovišť: krátký název a kam od značky vystrčit kartičku (dx, dy v px)
data["stitky"] = {
    "1": {"t": "Hospoda", "d": [64, -30]},
    "2": {"t": "Hasičárna", "d": [-8, -74]},
    "3": {"t": "Školka", "d": [-84, -10]},
    "4": {"t": "Kříž", "d": [-82, 4]},
    "5": {"t": "Stadion", "d": [-84, 26]},
    "6": {"t": "Sochy", "d": [14, -76]},
    "7": {"t": "Sokolovna", "d": [-4, -76]},
    "8": {"t": "Úřad", "d": [-64, 34]},
}

js = ("/* Kreslená mapa okruhu Račice-Pístovice. VYGENEROVÁNO: python3 tools/kreslena-mapa.py, needitovat ručně.\n"
      " * Mapová data © přispěvatelé OpenStreetMap, ODbL 1.0 (https://www.openstreetmap.org/copyright).\n"
      " * Tento soubor je odvozená databáze a šíří se pod stejnou licencí ODbL.\n"
      " * Souřadnice: pole [lat0, lng0, Δlat, Δlng, …] v 1e-5 stupně. */\n"
      "window.PD_MAPA = window.PD_MAPA || {};\nwindow.PD_MAPA[\"racice-pistovice\"] = "
      + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
(ROOT / "data/racice-mapa.js").write_text(js)
print("data/racice-mapa.js", len(js), "B,", len(data["ulice"]), "ulic,", len(data["domy"]), "domů,", len(data["plochy"]), "ploch")
