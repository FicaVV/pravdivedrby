#!/usr/bin/env python3
"""Barevné akcenty v kresbách stanovišť (img/racice/*.svg).

Kresby jsou tužka + žlutá pastelka. Tenhle skript k nim přidá dvě další „pastelky“:
hasičskou červenou (hadice, přilba, dveře, prapor) a modrou (voda, kýbl, auto, stan).
Nápisy zůstávají černé. Barva se přidává jako šrafa přes existující tvar (stejná cesta,
výplň vzorkem), čáry se jen přebarví. Spouští se jednou: python3 tools/barvy-kreseb.py
(podruhé soubor přeskočí).
"""
import re
from pathlib import Path

D = Path(__file__).resolve().parent.parent / "img/racice"
INK, RED, BLUE = "#2f2c28", "#c2341e", "#4f86c6"

# soubor: seznam operací
#  ("srafa", začátek cesty, barva, průhlednost[, které výskyty])  šrafa přes tvar
#  ("cara", začátek cesty, barva, násobek tloušťky)              přebarvit čáru
#  ("vypln", začátek cesty, barva)                                plná výplň místo dosavadní
#  ("text", stará barva)                                          nápis na černo
PLAN = {
    "1-koza.svg": [("cara", "M46 90 C50 94 54 98 57 100", RED, 1.8)],
    "1-dojeni-koza.svg": [("cara", "M58 72 C62 76 66 78 71 78", RED, 1.8)],
    "2-zbrojnice.svg": [("cara", "M80 140 C84 130 110 136 130 132", RED, 2.2),
                        ("srafa", "M40 140 V104 Q66 86 92 104 V140Z", RED, .7)],
    "3-kybl.svg": [("srafa", "M52 98 L126 82", BLUE, .85), ("srafa", "M120 76 C134 74", BLUE, .85)],
    "3-skolka.svg": [("text", "#b5402c"), ("srafa", "M78 104 H96 V140 H78Z", RED, .7)],
    "3-skolka-bila.svg": [("text", "#b5402c")],
    "4-kriz.svg": [("srafa", "M134 136 h8 v-12 h-8Z", RED, .9), ("srafa", "M150 100 C150 92", BLUE, .5)],
    "5-amplion.svg": [("srafa", "M26 140 V60 H34 V140Z", RED, .8)],
    "5-stadion.svg": [("srafa", "M152 140 V30 H160 V140Z", RED, .8), ("cara", "M10 140 V60 H84 V140", RED, 1.3),
                      ("cara", "M58 72 C62 76 66 78 71 78", RED, 1.8)],
    "6-florian.svg": [("srafa", "M123 6 L138 10", RED, .9), ("srafa", "M72 40 H84 L82 50 H74Z", BLUE, .85),
                      ("vypln", "M93 15 C93 8 107 8 107 15Z", RED), ("cara", "M74 50 C72 54 74 58 76 60", BLUE, 1.6)],
    "6-moskvic.svg": [("srafa", "M40 118 C44 104", BLUE, .7)],
    "7-sokolovna.svg": [("srafa", "M140 92 H166 V128 H140Z", RED, .75)],
    "7-stany.svg": [("srafa", "M20 140 L60 76 L100 140Z", BLUE, .7)],
    "8-kocarky.svg": [("srafa", "M0 100 C0 116 12 124 28 124", [BLUE, RED, BLUE], .7)],
    "8-urad.svg": [("vypln", "M176 44 H198 V56 H176Z", RED), ("vypln", "M176 32 L188 44 L176 56Z", "#2f5fa3")],
}

def run(name, ops):
    f = D / name
    s = f.read_text()
    if "data-barvy" in s:
        print("přeskočeno (už obarvené):", name); return
    pre = re.search(r'id="([^"]*?)yel"', s).group(1)
    pats = "".join(f'<pattern id="{pre}c{k}" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate({r})"><path d="M0 0 V3" stroke="{c}" stroke-width="1.15"/></pattern>'
                   for k, c, r in (("r", RED, -35), ("b", BLUE, 25)))
    s = s.replace("</defs>", pats + "</defs>", 1)
    for op in ops:
        kind = op[0]
        if kind == "text":
            n = s.count(f'fill="{op[1]}"'); assert n, (name, op)
            s = s.replace(f'fill="{op[1]}"', f'fill="{INK}"'); continue
        rx = re.compile(r'<path d="(' + re.escape(op[1]) + r'[^"]*)"([^>]*)/>')
        hits = list(rx.finditer(s)); assert hits, (name, op)
        if kind == "cara":
            def rec(m):
                a = m.group(2)
                if f'stroke="{INK}"' not in a: return m.group(0)
                a = a.replace(f'stroke="{INK}"', f'stroke="{op[2]}"')
                a = re.sub(r'stroke-width="([\d.]+)"', lambda w: f'stroke-width="{float(w.group(1)) * op[3]:.2f}"', a)
                return f'<path d="{m.group(1)}"{a}/>'
            s = rx.sub(rec, s)
        elif kind == "vypln":
            m = hits[0]
            a = re.sub(r'fill="[^"]*"', f'fill="{op[2]}"', m.group(2), count=1)
            s = s[:m.start()] + f'<path d="{m.group(1)}"{a}/>' + s[m.end():]
        elif kind == "srafa":
            barvy = op[2] if isinstance(op[2], list) else [op[2]]
            # šrafa za každý výskyt tvaru s výplní (ne za obrysové čáry)
            vypln = [m for m in hits if 'fill="none"' not in m.group(2)]
            vypln = vypln[:len(barvy)]
            for m, c in reversed(list(zip(vypln, barvy))):
                pid = pre + ("cr" if c == RED else "cb")
                add = f'<path d="{m.group(1)}" fill="url(#{pid})" opacity="{op[3]}"/>'
                s = s[:m.end()] + add + s[m.end():]
    s = s.replace("<svg ", '<svg data-barvy="1" ', 1)
    f.write_text(s)
    print("obarveno:", name)

for name, ops in PLAN.items():
    run(name, ops)
