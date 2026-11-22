"""Download CAL FIRE Damage Inspection (DINS) records from public ArcGIS services.

Sources
- Statewide master (2013-2024 fires): POSTFIRE_MASTER_DATA_SHARE
- 2025 Eaton and Palisades data-share views (full construction fields)
Writes one CSV per source into data/raw/dins/.
"""
import csv, json, sys, time, urllib.parse, urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data" / "raw" / "dins"
OUT.mkdir(parents=True, exist_ok=True)

SOURCES = {
    "statewide": "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/POSTFIRE_MASTER_DATA_SHARE/FeatureServer/0",
    "eaton_2025": "https://services3.arcgis.com/Oy2JTCD10wkoelxS/arcgis/rest/services/DINS_2025_Eaton_Data_Share_View/FeatureServer/0",
    "palisades_2025": "https://services3.arcgis.com/Oy2JTCD10wkoelxS/arcgis/rest/services/DINS_2025_Palisades_Data_Share_View/FeatureServer/0",
}

def get(url, params):
    q = url + "/query?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(q, timeout=120) as r:
                d = json.load(r)
            if "error" in d:
                raise RuntimeError(d["error"])
            return d
        except Exception as e:  # retry transient failures
            print("  retry", attempt + 1, e, file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise SystemExit(f"failed: {q}")

def fetch(name, url):
    total = get(url, {"where": "1=1", "returnCountOnly": "true", "f": "json"})["count"]
    meta = json.load(urllib.request.urlopen(url + "?f=json", timeout=60))
    page = min(meta.get("maxRecordCount", 2000), 2000)
    fields = [f["name"] for f in meta["fields"]]
    path = OUT / f"{name}.csv"
    n = 0
    with path.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for offset in range(0, total, page):
            d = get(url, {"where": "1=1", "outFields": "*", "returnGeometry": "false",
                          "orderByFields": fields[0], "resultOffset": offset,
                          "resultRecordCount": page, "f": "json"})
            for feat in d["features"]:
                w.writerow(feat["attributes"]); n += 1
            print(f"{name}: {n}/{total}", flush=True)
    print(f"wrote {path} ({n} rows)")

if __name__ == "__main__":
    for name in (sys.argv[1:] or SOURCES):
        fetch(name, SOURCES[name])
