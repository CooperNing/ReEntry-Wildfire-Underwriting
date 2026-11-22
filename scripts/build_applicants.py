"""Demo application pool for the book builder.

Real homes that SURVIVED the 2025 Eaton and Palisades fires (CAL FIRE inspections), joined to
LA County assessor floor area and to census tracts. These are exactly the homes now shopping
for coverage after being pushed to the FAIR Plan. Street addresses are dropped and coordinates
rounded to ~100 m.
"""
import json
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

import train_model as T

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "data/raw", ROOT / "data/processed"


def main():
    d = T.load()
    for f, (_, fn, raw) in T.FEATURES.items():
        d[f] = "unknown" if raw is None else d[raw].map(fn)
    d = d[d["fire"].isin(["Eaton 2025", "Palisades 2025"]) & (d["destroyed"] == 0)]

    parcels = pd.read_csv(RAW / "la_parcels/parcels_2025_fires.csv", dtype=str)
    parcels["apn"] = parcels["AIN_1"].fillna(parcels["APN_1"]).str.replace("-", "").str.strip()
    parcels["sqft"] = pd.to_numeric(parcels["SQFTmain1"], errors="coerce")
    parcels = parcels.dropna(subset=["apn"]).drop_duplicates("apn")[["apn", "sqft", "UseType"]]
    d["apn"] = d["APN"].astype(str).str.replace("-", "").str.strip()
    d = d.merge(parcels, on="apn", how="inner")
    d = d[d["sqft"].between(400, 12000)]
    print(f"survivors with floor area: {len(d):,}")

    tracts = gpd.read_file(f"zip://{RAW / 'census/tracts/tl_2020_06_tract.zip'}")[["GEOID", "geometry"]]
    pts = gpd.GeoDataFrame(d, geometry=gpd.points_from_xy(d["LONGITUDE"], d["LATITUDE"]), crs="EPSG:4326").to_crs(tracts.crs)
    d = gpd.sjoin(pts, tracts, how="left", predicate="within").rename(columns={"GEOID": "tract"})

    d = d.sample(n=min(1200, len(d)), random_state=11)
    zipc = pd.to_numeric(d["ZIPCODE"], errors="coerce").fillna(0).astype(int).astype(str).str.zfill(5)
    apps = pd.DataFrame({
        "id": [f"APP-{i:04d}" for i in range(1, len(d) + 1)],
        "fire": d["fire"].str.replace(" 2025", "").to_numpy(),
        "zip": zipc.to_numpy(),
        "city": d["CITY"].astype(str).str.title().to_numpy(),
        "tract": d["tract"].to_numpy(),
        "lat": d["LATITUDE"].round(3).to_numpy(), "lon": d["LONGITUDE"].round(3).to_numpy(),
        "sqft": d["sqft"].round(0).astype(int).to_numpy(),
        "year_built": pd.to_numeric(d["YEARBUILT"], errors="coerce").where(lambda s: s.between(1850, 2026)).to_numpy(),
        **{f: d[f].to_numpy() for f in T.FEATURES if f != "gap"},
    })
    (OUT / "applicants.json").write_text(apps.replace({np.nan: None}).to_json(orient="records"))
    print(apps.groupby("fire").size().to_dict(), apps.city.value_counts().head(6).to_dict())
    print("missing tract:", apps.tract.isna().sum())


if __name__ == "__main__":
    main()
