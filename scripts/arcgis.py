"""Tiny helper to page through a public ArcGIS FeatureServer layer into CSV."""
import csv, json, sys, time, urllib.parse, urllib.request
from pathlib import Path

def _get(url, params):
    q = url + "/query?" + urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(q, timeout=120) as r:
                d = json.load(r)
            if "error" in d:
                raise RuntimeError(d["error"])
            return d
        except Exception as e:
            print("  retry", attempt + 1, e, file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise SystemExit(f"failed: {q}")

def layer_to_csv(url, path, where="1=1", out_fields="*", label=None):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    total = _get(url, {"where": where, "returnCountOnly": "true", "f": "json"})["count"]
    meta = json.load(urllib.request.urlopen(url + "?f=json", timeout=60))
    page = min(meta.get("maxRecordCount", 2000), 2000)
    fields = [f["name"] for f in meta["fields"]] if out_fields == "*" else out_fields.split(",")
    oid = next((f["name"] for f in meta["fields"] if f["type"] == "esriFieldTypeOID"), fields[0])
    n = 0
    with path.open("w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields, extrasaction="ignore")
        w.writeheader()
        for offset in range(0, total, page):
            d = _get(url, {"where": where, "outFields": out_fields, "returnGeometry": "false",
                           "orderByFields": oid, "resultOffset": offset,
                           "resultRecordCount": page, "f": "json"})
            for feat in d["features"]:
                w.writerow(feat["attributes"]); n += 1
            print(f"{label or path.name}: {n}/{total}", flush=True)
    print(f"wrote {path} ({n} rows)")
