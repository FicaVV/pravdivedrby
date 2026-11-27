#!/usr/bin/env python3
"""Návrh propracovanější kresby pro zápis 2 (pivovod z hospody do hasičárny) ve 3 barevných variantách.
A = tužka + žlutá (jako teď), B = + hasičská červená, C = + červená a modrá (voda)."""
import sys
INK = "#2f2c28"
V = {
  "a": {"red": "#8a847a", "redh": "#55514a", "blue": "#8a847a", "name": "A – tužka + žlutá"},
  "b": {"red": "#c2341e", "redh": "#c2341e", "blue": "#8a847a", "name": "B – + hasičská červená"},
  "c": {"red": "#c2341e", "redh": "#c2341e", "blue": "#4f86c6", "name": "C – + červená a modrá"},
  # D: kombinace podle Vojty – nápisy černé, červená jen přilba a hadice, voda modrá
  "d": {"red": "#c2341e", "redh": "#55514a", "blue": "#4f86c6", "name": "D – červená přilba a hadice", "cerneNapisy": True},
}
def svg(v):
    c = V[v]; P = "pv" + v + "-"
    napis = INK if (v == "a" or c.get("cerneNapisy")) else c["red"]
    def ln(d, w=1.0, col=INK, extra=""):
        return (f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round" filter="url(#{P}w1)"{extra}/>'
                f'<path d="{d}" fill="none" stroke="{col}" stroke-width="{w*.6:.2f}" opacity=".35" stroke-linecap="round" stroke-linejoin="round" filter="url(#{P}w2)"/>')
    def sh(d, fill, w=1.3, col=INK):
        return f'<path d="{d}" fill="{fill}"/>' + ln(d, w, col)
    def hatch(d, pat, op=1):
        return f'<path d="{d}" fill="url(#{P}{pat})" opacity="{op}"/>'
    def txt(x, y, t, size=6, col=INK, w=900, rot=0, fam="Fraunces, Georgia, serif"):
        return f'<text x="{x}" y="{y}" text-anchor="middle" font-family="{fam}" font-weight="{w}" font-size="{size}" fill="{col}" transform="rotate({rot} {x} {y})">{t}</text>'
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 150"><defs>'
         f'<filter id="{P}w1"><feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.4"/></filter>'
         f'<filter id="{P}w2"><feTurbulence type="fractalNoise" baseFrequency=".06" numOctaves="2" seed="11"/><feDisplacementMap in="SourceGraphic" scale="1.8"/></filter>'
         f'<filter id="{P}paper"><feTurbulence baseFrequency=".8" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 .4  0 0 0 0 .38  0 0 0 0 .33  0 0 0 .07 0"/></filter>'
         f'<pattern id="{P}x" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(38)"><path d="M0 0 V4" stroke="#55514a" stroke-width=".6"/></pattern>'
         f'<pattern id="{P}xx" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-42)"><path d="M0 0 V3" stroke="#55514a" stroke-width=".7"/></pattern>'
         f'<pattern id="{P}yel" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><path d="M0 0 V3" stroke="#f0b800" stroke-width="1.5"/></pattern>'
         f'<pattern id="{P}red" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 0 V3" stroke="{c["redh"]}" stroke-width="1.1"/></pattern>'
         f'<pattern id="{P}blue" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(20)"><path d="M0 0 V3" stroke="{c["blue"]}" stroke-width="1.1"/></pattern>'
         f'<pattern id="{P}brick" width="10" height="6" patternUnits="userSpaceOnUse"><path d="M0 6 H10 M0 3 H10 M3 0 V3 M8 3 V6" fill="none" stroke="#8a847a" stroke-width=".35"/></pattern>'
         '</defs>',
         f'<rect width="200" height="150" fill="#f7f4ec"/><rect width="200" height="150" filter="url(#{P}paper)"/>']
    # tráva a zem
    o.append(f'<path d="M0 136 C50 130 150 130 200 136 V150 H0Z" fill="url(#{P}yel)" opacity=".45" filter="url(#{P}w2)"/>')
    # --- hospoda vlevo ---
    o.append(sh("M-2 46 L40 30 L66 44 V140 H-2 Z", "#f9f7f1", 1.4))
    o.append(hatch("M-2 46 L40 30 L66 44 L66 50 L40 36 L-2 52 Z", "xx", .6))
    o.append(hatch("M2 100 H62 V140 H2 Z", "brick", .7))
    o.append(sh("M6 54 H56 V66 H6 Z", "#fffdf7", 1.1) + txt(31, 62.6, "HOSTINEC", 6.4))
    o.append(sh("M12 72 H38 V96 H12 Z", "#e9e5db", 1.2) + ln("M25 72 V96 M12 84 H38", .8))
    o.append(hatch("M13 73 H24 V83 H13 Z", "x", .5))
    # sud na kozlíku s pípou
    o.append(ln("M14 140 L20 128 M44 140 L38 128 M16 134 H42", 1.1))
    o.append(sh("M14 106 C12 112 12 122 14 128 H44 C46 122 46 112 44 106 Z", "#e6d3b3", 1.3))
    o.append(hatch("M14 106 C12 112 12 122 14 128 H44 C46 122 46 112 44 106 Z", "x", .35))
    o.append(ln("M13.2 110 H44.8 M13 124 H45", 1.2) + ln("M29 106 V128", .5))
    o.append(sh("M44 114 H52 V118 H44 Z", "#c9c3b6", .9) + ln("M50 114 V108 L53 106", 1.1))
    # --- hadice: z pípy do necek, smyčky ve vodě, ven do hasičárny ---
    hose = "M52 116 C58 118 58 132 66 133 C70 133 71 126 74 124"
    o.append(ln(hose, 3.2, c["red"]) + ln(hose, 1.2, "#fff", ' opacity=".5"'))
    # necky s ledovou vodou
    o.append(sh("M68 116 H124 L120 140 H72 Z", "#ebe6da", 1.4))
    o.append(hatch("M69.5 122 H122.5 L120 139 H72 Z", "blue", .8))
    coil = "M74 124 C78 136 84 136 86 126 C88 118 94 118 96 128 C98 138 104 138 106 128 C108 120 114 120 118 124"
    o.append(ln(coil, 3.2, c["red"], ' opacity=".9"'))
    o.append(ln("M69.5 122 C80 120.5 112 123 122.5 122", .9, c["blue"]))
    for x, y, r in ((80, 121), (100, 120.5), (111, 121.5)) if False else ((80, 121, 8), (100, 120.6, -10), (111, 121.6, 14)):
        o.append(f'<g transform="rotate({r} {x} {y})">' + sh(f"M{x-3} {y-3} h6 v6 h-6 Z", "#fffdf7", .8) + '</g>')
    o.append(ln("M66 116 H126", 2))
    # cedulka chlazení
    o.append(ln("M94 116 V104", .9) + sh("M80 96 H108 V105 H80 Z", "#fffdf7", .9) + txt(94, 102.6, "CHLAZENÍ", 4.6))
    hose2 = "M118 124 C122 120 126 122 126 128 C126 136 132 138 138 136 C144 134 140 112 140 104 C140 98 143 96 147 96"
    # --- hasičárna vpravo ---
    o.append(sh("M128 140 V44 L164 28 L202 44 V140 Z", "#f9f7f1", 1.4))
    o.append(hatch("M128 44 L164 28 L202 44 L202 50 L164 34 L128 50 Z", "red" if napis != INK else "xx", .55))
    o.append(sh("M140 50 H190 V62 H140 Z", "#fffdf7", 1.1) + txt(165, 59, "HASIČI", 7.4, napis))
    o.append(sh("M136 140 V82 C136 70 194 70 194 82 V140 Z", "#d9d3c6", 1.3))
    o.append(hatch("M136 140 V82 C136 70 194 70 194 82 V140 Z", "x", .45))
    o.append(ln(hose2, 3.2, c["red"]) + ln(hose2, 1.2, "#fff", ' opacity=".5"'))
    # hasič s přilbou, knírem a půllitrem
    o.append(ln("M160 124 L157 138 M168 124 L171 138", 3, INK))
    o.append(sh("M153 139 H160 V136 H155 Z M168 136 H174 V139 H168 Z", INK, .6))
    o.append(sh("M155 101 C155 98 173 98 173 101 L172 126 H156 Z", "#cfc8b8", 1.3))
    o.append(hatch("M155 101 C155 98 173 98 173 101 L172 126 H156 Z", "red" if napis != INK else "x", .55))
    o.append(ln("M164 100 V126 M157 114 H171", .7))
    o.append(sh("M158 113 H170 V116 H158 Z", "#f5c400", .7))
    o.append(sh("M164 84 C168.5 84 171 87.5 171 91.5 C171 96 168 99 164 99 C160 99 157 96 157 91.5 C157 87.5 159.5 84 164 84 Z", "#fde7d6", 1.2))
    o.append(ln("M161 92 h.1 M167 92 h.1", 1.6) + ln("M159.5 95 C161.5 94 163 94.6 164 95.6 C165 94.6 166.5 94 168.5 95", 1.1))
    o.append(sh("M156 87 C156 78 172 78 172 87 L175 88 C175 89.5 153 89.5 153 88 Z", "#f5c400" if v == "a" else c["red"], 1.2))
    o.append(ln("M164 79 V87", .7))
    # ruka s proudnicí nad půllitrem, druhá drží půllitr
    o.append(ln("M156 103 C152 104 149 100 147 97", 2.6) + sh("M145 94 L150 96 L148 101 L143 99 Z", "#8a847a", .9))
    o.append(ln("M156 110 C151 113 150 116 152 118", 2.6))
    o.append(f'<path d="M146 101 C146 106 147 108 147 111" stroke="#f0b800" stroke-width="1.6" fill="none"/>')
    o.append(sh("M140 110 H152 L151 128 C151 130 141 130 141 128 Z", "#fff8d6", 1.2))
    o.append(hatch("M141 114 H151 L150.4 128 H141.6 Z", "yel", 1))
    o.append(sh("M139 111 C138 106 143 104 146 107 C148 104 154 105 153 110 Z", "#fffdf7", 1))
    o.append(ln("M152 115 C157 115 157 124 151 124", 1.1))
    # nápis nahoře
    o.append(sh("M60 8 H140 L136 15 L140 22 H60 L64 15 Z", "#fffdf7", 1.1))
    o.append(txt(100, 17.6, "PIVOVOD · 1958", 7, napis))
    o.append(txt(100, 28, "největší technické dílo v obci", 4.4, "#554c40", 700, 0, "Atkinson Hyperlegible Next, sans-serif"))
    o.append(ln("M0 140 C40 139 80 141 120 140 C150 139 180 141 200 140", 1))
    o.append('</svg>')
    return "".join(o)
if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    for v in V:
        open(f"{out}/pivovod-{v}.svg", "w").write(svg(v))
    print("ok")
