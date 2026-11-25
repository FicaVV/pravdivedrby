# Výřez OpenStreetMap pro kreslenou mapu

`racice-osm.json` © přispěvatelé OpenStreetMap, licence ODbL 1.0 (https://www.openstreetmap.org/copyright).

Staženo z `https://api.openstreetmap.org/api/0.6/map.json?bbox=16.8655,49.2725,16.8860,49.2860`
(listopad 2026) a zúžené na cesty, budovy, vodu, plochy a body zájmu: pole objektů
`{ id, t: {tagy}, g: [[lat, lng], …] }` (u bodů `n: 1`).

Nový výřez: stáhnout stejnou adresu (případně s jiným bbox), převést do tohoto tvaru
a spustit `python3 tools/kreslena-mapa.py`.
