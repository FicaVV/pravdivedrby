#!/usr/bin/env python3
"""Koza na dojení (img/racice/1-dojeni-koza.svg): hlavu z profilu otočí čelem k hráči.

Odstraní hlavu z profilu (rohy, ucho, oko, bradku, skvrnu na hlavě) a zkrátí obrys těla na krk,
pak nakreslí hlavu zepředu stejným stylem (bílá výplň, dvojitá roztřesená čára tužky).
Spouští se jednou: python3 tools/koza-hlava.py (podruhé už nic nemění).
"""
import re, sys
from pathlib import Path

F = Path(__file__).resolve().parent.parent / "img/racice/1-dojeni-koza.svg"
s = F.read_text()
if "koza-hlava-zepredu" in s:
    sys.exit("hlava už je otočená")

HEAD_OLD = "C64 76 58 68 52 60 C46 62 38 68 32 70 C29 70 26 68 26 65 C26 62 28 60 29 58 C33 52 38 46 44 43 C48 41 51 40 54 40 C62 46 70 58 82 64 Z"
NECK_NEW = "C64 76 60 68 57 58 C58 52 63 50 66 52 C70 56 76 62 82 64 Z"
assert s.count(HEAD_OLD) >= 2
s = s.replace(HEAD_OLD, NECK_NEW)

# prvky hlavy z profilu: smazat všechny cesty s těmito začátky (výplň i obě čáry)
gone = ["M44 43 C48 41", "M34 68 C40 64", "M29 61 c1", "M55 42 C56 33", "M52 41 C52 30", "M53 45 C57 40",
        "M39 50 C41 48", "M50 62 C49 66", "M41.5 49.5", "M33 70 C32 74"]
for g in gone:
    s, n = re.subn(r'(<g clip-path="url\(#djk-sc\)">)?<path d="' + re.escape(g) + r'[^"]*"[^>]*/>(</g>)?', "", s)
    assert n, g

INK = "#2f2c28"
def line(d, w=1.0, fill="none"):
    out = ""
    if fill != "none":
        out += f'<path d="{d}" fill="{fill}"/>'
    out += (f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{w:.2f}" opacity="1" stroke-linecap="round" stroke-linejoin="round" filter="url(#djk-w1)"/>'
            f'<path d="{d}" fill="none" stroke="{INK}" stroke-width="{w*.7:.2f}" opacity="0.35" stroke-linecap="round" stroke-linejoin="round" filter="url(#djk-w2)"/>')
    return out
def mir(d, cx=56):
    """zrcadlí cestu (absolutní souřadnice M/C/L/Z) podle svislé osy x = cx"""
    t = re.findall(r"[MCLZ]|-?\d+(?:\.\d+)?", d)
    out, k = [], 0
    for tok in t:
        if tok in "MCLZ":
            out.append(tok); k = 0
        else:
            v = float(tok)
            if k % 2 == 0: v = 2 * cx - v
            out.append(f"{v:g}"); k += 1
    return " ".join(out)

horn = "M51 34 C50 26 46 19 39 16 C38 18 40 19 42 21 C45 25 47 30 47.5 35 Z"
ear = "M48.5 40 C44 37.5 37 38 32 41.5 C36 45 43 45.5 49 43.5 Z"
head = "M47.5 35 C48 31 64 31 64.5 35 C65.5 43 63.5 51 61.5 57 C60.5 61 58.5 63.5 56 63.5 C53.5 63.5 51.5 61 50.5 57 C48.5 51 46.5 43 47.5 35 Z"
beard = "M53.5 63 C52.5 68 53.5 72.5 56 76 C58.5 72.5 59.5 68 58.5 63 Z"
spot = "M48 36 C52 33 57 33 59 35 C58 40 54 44 50 46 C48.5 43 47.5 39 48 36 Z"

g = '<g class="koza-hlava-zepredu">'
g += line(horn, 1.0, "#b9b3a7") + line(mir(horn), 1.0, "#b9b3a7")
g += line(ear, 1.0, "#f9f7f1") + line(mir(ear), 1.0, "#f9f7f1")
g += line("M37 41.6 C40 41 44 41 47 41.8", .5) + line(mir("M37 41.6 C40 41 44 41 47 41.8"), .5)
g += line(beard, 1.0, "#f9f7f1")
g += line(head, 1.1, "#f9f7f1")
# strakatá skvrna na čele (jako skvrny na těle)
g += f'<clipPath id="djk-hc"><path d="{head}"/></clipPath>'
g += f'<g clip-path="url(#djk-hc)"><path d="{spot}" fill="url(#djk-h2)" opacity=".95"/><path d="{spot}" fill="url(#djk-h1)" opacity=".9"/></g>'
# oči: bílé mandle s vodorovnou kozí zorničkou
for cx in (51.8, 60.2):
    eye = f"M{cx-3:g} 44 C{cx-1.5:g} 42.2 {cx+1.5:g} 42.2 {cx+3:g} 44 C{cx+1.5:g} 45.8 {cx-1.5:g} 45.8 {cx-3:g} 44 Z"
    g += line(eye, .9, "#fffdf7") + f'<path d="M{cx-1.4:g} 43.5 h2.8 v1 h-2.8Z" fill="{INK}"/>'
# nos a pusa
g += line("M53.6 57.5 C53.2 58.6 53.8 59.4 54.6 59.2 M58.4 57.5 C58.8 58.6 58.2 59.4 57.4 59.2", .7)
g += line("M53.8 61.4 C55 62.4 57 62.4 58.2 61.4", .6)
g += line("M56 47 C55.8 51 55.8 54 56 56", .45)
g += "</g>"

# hlavu kreslit až za krk a obojek se zvonkem, ale před trávu
anchor = '<path d="M6 140 C40 139'
assert anchor in s
s = s.replace(anchor, g + anchor, 1)
F.write_text(s)
print("hotovo:", F)
