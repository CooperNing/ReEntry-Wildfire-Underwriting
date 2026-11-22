"""Build ZIP-level market table and tract-level hazard table.

Inputs (data/raw):
  cdi/fair_vs_voluntary_zip_2022.pdf        FAIR Plan vs voluntary dwelling units by ZIP, 2022
  cdi/new_renew_nonrenew_zip_2020_2023.xlsx  voluntary market new / renewed / non-renewed by ZIP
  nri/nri_wildfire_tracts_CA.csv             FEMA National Risk Index wildfire fields by tract
  census/zcta_tract_rel.txt                  ZCTA-to-tract relationship (land-area overlap)
  census/2020_Gaz_zcta_national.txt          ZCTA centroids
  zillow/zhvi_zip.csv                        typical home value by ZIP
  cdi/distressed_list.pdf                    CDI distressed counties + undermarketed ZIPs (Mar 2025)
  dins/statewide.csv                         CAL FIRE damage inspections 2013-2025

Outputs (data/processed):
  zip_market.csv / .json
  tract_hazard.json
"""
import json, re
from itertools import combinations
from pathlib import Path

import numpy as np
import pandas as pd
import pdfplumber

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "data/raw", ROOT / "data/processed"
OUT.mkdir(parents=True, exist_ok=True)


# ---------- CDI FAIR Plan share (PDF) ----------
ROW = re.compile(r"^([A-Z][A-Z .]+?) (9\d{4}) (.+?) ([\d, \-]+?) ([\d.]+)%$")

def _num(s):
    s = s.replace(" ", "")
    if s == "-":
        return 0
    if not re.fullmatch(r"\d{1,3}(,\d{3})*", s):
        return None
    return int(s.replace(",", ""))

def _split_counts(blob, pct):
    """blob holds two numbers that may contain stray spaces; pick the split matching pct."""
    toks = blob.split()
    best = None
    for i in range(1, len(toks)):
        a, b = _num(" ".join(toks[:i])), _num(" ".join(toks[i:]))
        if a is None or b is None:
            continue
        share = 100 * b / (a + b) if a + b else 0
        err = abs(share - pct)
        if best is None or err < best[0]:
            best = (err, a, b)
    return best

def parse_fair_pdf():
    rows, bad = [], 0
    with pdfplumber.open(RAW / "cdi/fair_vs_voluntary_zip_2022.pdf") as pdf:
        for page in pdf.pages:
            for line in (page.extract_text() or "").splitlines():
                m = ROW.match(line.strip())
                if not m:
                    continue
                county, zipc, city, blob, pct = m.groups()
                # city may have swallowed the first number when it starts with digits; move digits back
                cm = re.match(r"^(.*?[A-Za-z.)])\s+([\d ,]+)$", city)
                if cm:
                    city, blob = cm.group(1), cm.group(2) + " " + blob
                res = _split_counts(blob, float(pct))
                if res is None or res[0] > 0.15:
                    bad += 1
                    continue
                _, vol, fair = res
                rows.append(dict(zip=zipc, county=county.title(), city=city,
                                 units_voluntary=vol, units_fair=fair, fair_share_2022=float(pct) / 100))
    df = pd.DataFrame(rows).drop_duplicates("zip")
    print(f"FAIR PDF: {len(df)} ZIPs parsed, {bad} rows skipped")
    return df


# ---------- CDI new / renew / non-renew ----------
def parse_nonrenew():
    d = pd.read_excel(RAW / "cdi/new_renew_nonrenew_zip_2020_2023.xlsx")
    d.columns = ["county", "zip", "year", "new", "renewed", "nonrenewed"]
    d["zip"] = d["zip"].astype(str).str.zfill(5)
    p = d.pivot_table(index="zip", columns="year", values=["new", "renewed", "nonrenewed"], aggfunc="sum")
    p.columns = [f"{a}_{b}" for a, b in p.columns]
    p = p.reset_index()
    for y in (2020, 2023):
        base = p[f"renewed_{y}"] + p[f"nonrenewed_{y}"]
        p[f"nonrenew_rate_{y}"] = np.where(base > 0, p[f"nonrenewed_{y}"] / base, np.nan)
    p["new_policy_change_20_23"] = np.where(p["new_2020"] > 0, p["new_2023"] / p["new_2020"] - 1, np.nan)
    keep = ["zip", "new_2020", "new_2023", "renewed_2023", "nonrenewed_2023",
            "nonrenew_rate_2020", "nonrenew_rate_2023", "new_policy_change_20_23"]
    print(f"CDI non-renewal: {len(p)} ZIPs")
    return p[keep]


# ---------- FEMA NRI tracts -> hazard + ZIP aggregate ----------
def tract_hazard():
    t = pd.read_csv(RAW / "nri/nri_wildfire_tracts_CA.csv", dtype={"TRACTFIPS": str})
    t["TRACTFIPS"] = t["TRACTFIPS"].str.zfill(11)
    # expected annual building loss per $ of building value in the tract
    t["wf_loss_rate"] = np.where(t["BUILDVALUE"] > 0, t["WFIR_EALB"] / t["BUILDVALUE"], 0.0)
    t["wf_freq"] = t["WFIR_AFREQ"].fillna(0)
    t["wf_risk_score"] = t["WFIR_RISKS"].fillna(0)  # national percentile-style score 0-100
    out = t[["TRACTFIPS", "COUNTY", "wf_loss_rate", "wf_freq", "wf_risk_score", "WFIR_RISKR", "BUILDVALUE"]]
    out.columns = ["tract", "county", "wf_loss_rate", "wf_freq", "wf_risk_score", "wf_rating", "build_value"]
    out = out.copy()
    out["wf_rating"] = out["wf_rating"].fillna("Not Applicable")
    print(f"NRI: {len(out)} tracts; median loss rate {out.wf_loss_rate.median():.2e}")
    return out

def zip_hazard(tracts):
    rel = pd.read_csv(RAW / "census/zcta_tract_rel.txt", sep="|", dtype=str,
                      usecols=["GEOID_ZCTA5_20", "GEOID_TRACT_20", "AREALAND_PART"])
    rel = rel[rel["GEOID_TRACT_20"].str.startswith("06")].dropna()
    rel["w"] = rel["AREALAND_PART"].astype(float)
    m = rel.merge(tracts, left_on="GEOID_TRACT_20", right_on="tract")
    # weight by land overlap x building value share so dense parts of a ZIP count more
    m["bv_w"] = m["w"] * m["build_value"] / m.groupby("tract")["w"].transform("sum").replace(0, np.nan)
    g = m.groupby("GEOID_ZCTA5_20")
    z = pd.DataFrame({
        "wf_loss_rate": g.apply(lambda x: np.average(x.wf_loss_rate, weights=x.bv_w) if x.bv_w.sum() > 0 else x.wf_loss_rate.mean(), include_groups=False),
        "wf_risk_score": g.apply(lambda x: np.average(x.wf_risk_score, weights=x.bv_w) if x.bv_w.sum() > 0 else x.wf_risk_score.mean(), include_groups=False),
        "wf_risk_score_max": g["wf_risk_score"].max(),
    }).reset_index().rename(columns={"GEOID_ZCTA5_20": "zip"})
    return z


def centroids():
    g = pd.read_csv(RAW / "census/2020_Gaz_zcta_national.txt", sep="\t", dtype={"GEOID": str})
    g.columns = [c.strip() for c in g.columns]
    return g[["GEOID", "INTPTLAT", "INTPTLONG"]].rename(columns={"GEOID": "zip", "INTPTLAT": "lat", "INTPTLONG": "lon"})


def home_values():
    z = pd.read_csv(RAW / "zillow/zhvi_zip.csv", dtype={"RegionName": str})
    z = z[z["State"] == "CA"]
    last = [c for c in z.columns if re.fullmatch(r"\d{4}-\d{2}-\d{2}", c)][-1]
    out = z[["RegionName", last]].rename(columns={"RegionName": "zip", last: "home_value"})
    out["zip"] = out["zip"].str.zfill(5)
    print(f"Zillow: {len(out)} CA ZIPs, as of {last}")
    return out, last


def fire_history():
    d = pd.read_csv(RAW / "dins/statewide.csv", low_memory=False,
                    usecols=["ZIPCODE", "DAMAGE", "STRUCTURECATEGORY", "INCIDENTSTARTDATE"])
    d = d[d["STRUCTURECATEGORY"].isin(["Single Residence", "Multiple Residence"])]
    d["zip"] = pd.to_numeric(d["ZIPCODE"], errors="coerce").dropna().astype(int).astype(str).str.zfill(5)
    d["destroyed"] = d["DAMAGE"].str.startswith("Destroyed").fillna(False)
    g = d.groupby("zip").agg(homes_inspected=("destroyed", "size"), homes_destroyed=("destroyed", "sum")).reset_index()
    return g


def distressed():
    """CDI list (March 6, 2025): distressed counties + undermarketed ZIP codes (10 CCR 2644.4.8)."""
    with pdfplumber.open(RAW / "cdi/distressed_list.pdf") as pdf:
        pages = [(p.extract_text() or "") for p in pdf.pages]
    counties = set(re.findall(r"^\d+\. ([A-Za-z ]+)$", pages[0], flags=re.M))
    zips = set(re.findall(r"\b9[0-6]\d{3}\b", "\n".join(pages[1:])))
    print(f"CDI distressed: {len(counties)} counties, {len(zips)} undermarketed ZIPs")
    return {c.strip() for c in counties}, zips


def main():
    fair = parse_fair_pdf()
    df = (fair.merge(parse_nonrenew(), on="zip", how="left")
              .merge(zip_hazard(tracts := tract_hazard()), on="zip", how="left")
              .merge(centroids(), on="zip", how="left")
              .merge(home_values()[0], on="zip", how="left")
              .merge(fire_history(), on="zip", how="left"))
    df[["homes_inspected", "homes_destroyed"]] = df[["homes_inspected", "homes_destroyed"]].fillna(0).astype(int)
    df["units_total"] = df["units_voluntary"] + df["units_fair"]
    d_counties, d_zips = distressed()
    df["undermarketed_zip"] = df["zip"].isin(d_zips)
    df["distressed_county"] = df["county"].isin(d_counties)
    df["distressed"] = df["undermarketed_zip"] | df["distressed_county"]
    df = df[df["units_total"] >= 50].copy()
    df.to_csv(OUT / "zip_market.csv", index=False)
    rec = json.loads(df.replace({np.nan: None}).to_json(orient="records", double_precision=6))
    (OUT / "zip_market.json").write_text(json.dumps(rec, separators=(",", ":")))
    th = tracts.drop(columns=["build_value"]).set_index("tract")
    (OUT / "tract_hazard.json").write_text(th.to_json(orient="index", double_precision=6))
    print(f"zip_market: {len(df)} ZIPs; FAIR units {df.units_fair.sum():,}; missing hazard {df.wf_loss_rate.isna().sum()}, "
          f"missing value {df.home_value.isna().sum()}, missing lat {df.lat.isna().sum()}; distressed {df.distressed.sum()} ZIPs holding {df.loc[df.distressed,'units_fair'].sum():,} FAIR units")
    print(df.sort_values("units_fair", ascending=False).head(8)[["zip", "city", "units_fair", "fair_share_2022", "wf_risk_score", "home_value"]].to_string())


if __name__ == "__main__":
    main()
