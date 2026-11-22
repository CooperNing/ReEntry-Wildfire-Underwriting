"""Train the structure vulnerability model on CAL FIRE damage inspections (DINS), 2013-2025.

Target: P(home destroyed | wildfire reached the home), single-family and mobile homes.
Data:   only homes whose 7 construction features were actually observed. Destroyed homes are far
        more often coded "Unknown" (inspectors cannot see the eaves of a burned house), so "Unknown"
        leaks the outcome; it is dropped in training and marginalised at scoring time.
Model:  logistic regression on construction features + neighbor spacing + build era,
        with a fixed effect per fire (fires differ in wind and intensity).
        Scoring uses the count-weighted average fire, so a new home is scored
        "as if an average destructive California fire reached it".
Checks: leave-fires-out cross validation (GroupKFold by fire) vs gradient boosting.

Outputs: data/processed/model.json, data/processed/model_report.json,
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, roc_auc_score
from sklearn.model_selection import GroupKFold
from sklearn.neighbors import BallTree
import statsmodels.api as sm

ROOT = Path(__file__).resolve().parents[1]
RAW, OUT = ROOT / "data/raw", ROOT / "data/processed"

# ---------- feature mapping (raw DINS labels -> app levels) ----------
def m_roof(v):
    v = str(v).strip()
    return {"Asphalt": "asphalt", "Tile": "tile", "Concrete": "tile", "Concrete Slab": "tile",
            "Metal": "metal", "Fire Resistant": "rated_other", "Wood": "wood", "Combustible": "wood",
            "Other": "other"}.get(v, "unknown")

def m_eaves(v):
    v = str(v).strip()
    return {"Enclosed": "enclosed", "Unenclosed": "open", "No Eaves": "none"}.get(v, "unknown")

def m_vents(v):
    v = str(v).strip()
    return {'Mesh Screen <= 1/8"': "fine", 'Mesh Screen > 1/8"': "coarse", "Unscreened": "unscreened",
            "No Vents": "none", "Screened": "screened_unspecified"}.get(v, "unknown")

def m_siding(v):
    v = str(v).strip()
    if v in ("Stucco Brick Cement", "Stucco/Brick/Cement", "Fire Resistant", "Metal"):
        return "noncombustible"
    if v == "Ignition Resistant":
        return "ignition_resistant"
    if v in ("Wood", "Combustible", "Vinyl"):
        return "combustible"
    return "unknown"

def m_window(v):
    v = str(v).strip()
    return {"Multi Pane": "multi", "Single Pane": "single", "No Windows": "multi"}.get(v, "unknown")

def m_deck(v):
    v = str(v).strip()
    return {"No Deck/Porch": "none", "Wood": "wood", "Composite": "composite",
            "Masonry/Concrete": "masonry", "Metal": "masonry"}.get(v, "unknown")

def m_fence(v):
    v = str(v).strip()
    return {"No Fence": "none", "Non Combustible": "noncombustible", "Combustible": "combustible"}.get(v, "unknown")

def m_outbuilding(v):
    v = str(v).strip()
    return {"<30'": "lt30", "30-50'": "30to50", "30": "30to50", ">50'": "gt50", "50": "gt50"}.get(v, "none_or_unknown")

def m_type(v):
    v = str(v)
    if "Mobile Home" in v:
        return "mobile"
    if "Multi Story" in v:
        return "multi_story"
    return "single_story"

def m_era(y):
    try:
        y = int(y)
    except (TypeError, ValueError):
        return "unknown"
    if y < 1850 or y > 2026:
        return "unknown"
    if y < 1950: return "pre1950"
    if y < 1980: return "1950_1979"
    if y < 2008: return "1980_2007"
    return "2008_plus"   # California Chapter 7A wildfire building code era

def m_gap(d):
    if np.isnan(d): return "unknown"
    if d < 10: return "lt10m"
    if d < 20: return "10to20m"
    if d < 40: return "20to40m"
    return "gt40m"

FEATURES = {
    "roof": ("Roof covering", m_roof, "ROOFCONSTRUCTION"),
    "eaves": ("Eaves", m_eaves, "EAVES"),
    "vents": ("Attic / foundation vents", m_vents, "VENTSCREEN"),
    "siding": ("Exterior siding", m_siding, "EXTERIORSIDING"),
    "windows": ("Windows", m_window, "WINDOWPANE"),
    "deck": ("Elevated deck", m_deck, "DECKPORCHELEVATED"),
    "fence": ("Fence attached to house", m_fence, "FENCEATTACHEDTOSTRUCTURE"),
    "outbuilding": ("Nearest outbuilding", m_outbuilding, "UTILITYMISCSTRUCTUREDISTANCE"),
    "type": ("Structure type", m_type, "STRUCTURETYPE"),
    "era": ("Year built", m_era, "YEARBUILT"),
    "gap": ("Distance to nearest other home", m_gap, None),
}
# reference level per feature = the "typical" pre-mitigation home, so coefficients read as changes from it
REFERENCE = {"roof": "asphalt", "eaves": "open", "vents": "coarse", "siding": "noncombustible",
             "windows": "single", "deck": "none", "fence": "none", "outbuilding": "none_or_unknown",
             "type": "single_story", "era": "1950_1979", "gap": "10to20m"}


def load():
    d = pd.read_csv(RAW / "dins/statewide.csv", low_memory=False)
    d = d[d["STRUCTURECATEGORY"] == "Single Residence"]
    d = d[~d["STRUCTURETYPE"].astype(str).str.contains("Motor Home")]
    d = d[d["DAMAGE"].notna() & (d["DAMAGE"] != "Inaccessible")]
    d = d[d["LATITUDE"].between(32, 42.1) & d["LONGITUDE"].between(-124.5, -114)]
    d["destroyed"] = d["DAMAGE"].str.startswith("Destroyed").astype(int)
    d["fire"] = d["INCIDENTNAME"].astype(str).str.strip() + " " + \
        pd.to_datetime(d["INCIDENTSTARTDATE"], unit="ms", errors="coerce").dt.year.astype("Int64").astype(str)
    return d.reset_index(drop=True)


def nearest_home_gap(d):
    """Distance (m) to nearest other inspected home in the same fire."""
    gap = np.full(len(d), np.nan)
    R = 6_371_000
    for _, idx in d.groupby("fire").groups.items():
        idx = np.asarray(idx)
        if len(idx) < 2:
            continue
        xy = np.radians(d.loc[idx, ["LATITUDE", "LONGITUDE"]].to_numpy())
        dist, _ = BallTree(xy, metric="haversine").query(xy, k=2)
        g = dist[:, 1] * R
        g[g < 1] = np.nan       # duplicate coordinates (parcel centroid shared) -> unknown
        gap[idx] = g
    return gap


def design(df, levels):
    cols = []
    for f, lv in levels.items():
        for l in lv:
            if l != REFERENCE[f]:
                cols.append((f, l))
    X = np.zeros((len(df), len(cols)), dtype=np.float32)
    for j, (f, l) in enumerate(cols):
        X[:, j] = (df[f].to_numpy() == l)
    return X, cols


def main():
    d = load()
    d["gap_m"] = nearest_home_gap(d)
    for f, (_, fn, raw) in FEATURES.items():
        d[f] = d["gap_m"].map(fn) if f == "gap" else d[raw].map(fn)
    # keep fires with enough homes and some of each outcome, otherwise the fire effect is unidentified
    fs = d.groupby("fire")["destroyed"].agg(["size", "mean"])
    keep = fs[(fs["size"] >= 30) & fs["mean"].between(0.02, 0.98)].index
    d = d[d["fire"].isin(keep)].reset_index(drop=True)
    n_all = len(d)
    observed = ["roof", "eaves", "vents", "siding", "windows", "deck", "fence"]
    # --- leakage demo: what happens if "unknown" is kept as a level ---
    leak = {f: {"unknown_destroyed": round(float(d.loc[d[f] == "unknown", "destroyed"].mean()), 3),
                "observed_destroyed": round(float(d.loc[d[f] != "unknown", "destroyed"].mean()), 3),
                "unknown_share": round(float((d[f] == "unknown").mean()), 3)} for f in observed}
    lv_all = {f: sorted(d[f].unique()) for f in FEATURES}
    REF_SAVE = dict(REFERENCE)
    X_leak, _ = design(d, lv_all)
    p_leak = np.zeros(len(d))
    for tr, te in GroupKFold(n_splits=5).split(X_leak, d["destroyed"], d["fire"]):
        p_leak[te] = LogisticRegression(C=1.0, max_iter=2000).fit(X_leak[tr], d["destroyed"].to_numpy()[tr]).predict_proba(X_leak[te])[:, 1]
    leaky_auc = float(roc_auc_score(d["destroyed"], p_leak))
    print(f"leaky model (unknown kept) pooled AUC on held-out fires: {leaky_auc:.3f}")
    d = d[(d[observed] != "unknown").all(axis=1)].reset_index(drop=True)
    fs = d.groupby("fire")["destroyed"].agg(["size", "mean"])
    keep = fs[(fs["size"] >= 30) & fs["mean"].between(0.02, 0.98)].index
    d = d[d["fire"].isin(keep)].reset_index(drop=True)
    print(f"complete-case filter: {n_all:,} -> {len(d):,} homes")
    print(f"training rows: {len(d):,} homes, {d.fire.nunique()} fires, destroyed {d.destroyed.mean():.1%}")

    levels = {f: sorted(d[f].unique()) for f in FEATURES}
    Xf, cols = design(d, levels)
    fires = sorted(d["fire"].unique())
    F = (d["fire"].to_numpy()[:, None] == np.array(fires)[None, :]).astype(np.float32)
    y = d["destroyed"].to_numpy()

    # ---------- cross-validation: hold out whole fires ----------
    gkf = GroupKFold(n_splits=5)
    p_lr, p_gb = np.zeros(len(d)), np.zeros(len(d))
    for tr, te in gkf.split(Xf, y, d["fire"]):
        # held-out fires have no fixed effect: train features-only intercept model for honest scoring
        lr = LogisticRegression(C=1.0, max_iter=2000).fit(Xf[tr], y[tr])
        p_lr[te] = lr.predict_proba(Xf[te])[:, 1]
        gb = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.06, max_leaf_nodes=31).fit(Xf[tr], y[tr])
        p_gb[te] = gb.predict_proba(Xf[te])[:, 1]
    # within-fire ranking is what an underwriter uses: AUC computed inside each fire, then size-weighted
    def within_auc(p):
        s, w = 0, 0
        for _, g in d.assign(p=p).groupby("fire"):
            if g.destroyed.nunique() == 2 and len(g) >= 100:
                s += roc_auc_score(g.destroyed, g.p) * len(g); w += len(g)
        return s / w
    cv = {
        "logistic_pooled_auc": roc_auc_score(y, p_lr), "gbm_pooled_auc": roc_auc_score(y, p_gb),
        "logistic_within_fire_auc": within_auc(p_lr), "gbm_within_fire_auc": within_auc(p_gb),
        "logistic_brier": brier_score_loss(y, p_lr),
    }
    print({k: round(v, 3) for k, v in cv.items()})

    # ---------- final model with fire fixed effects ----------
    X = np.hstack([Xf, F]).astype(float)
    res = sm.GLM(y, X, family=sm.families.Binomial()).fit()
    beta, se = np.asarray(res.params), np.asarray(res.bse)
    b_feat, b_fire = beta[: len(cols)], beta[len(cols):]
    se_feat = se[: len(cols)]
    w = F.sum(0) / F.sum()
    avg_fire = float((b_fire * w).sum())   # logit offset of the count-weighted average fire

    def score(rows):
        Xr, _ = design(rows, levels)
        return 1 / (1 + np.exp(-(avg_fire + Xr @ b_feat)))
    d["p_avg_fire"] = score(d)
    ref_home = pd.DataFrame([REFERENCE])
    p_ref = float(score(ref_home)[0])
    p_mean = float(d["p_avg_fire"].mean())

    # calibration by decile (in-sample, average fire vs observed)
    d["dec"] = pd.qcut(d["p_avg_fire"].rank(method="first"), 10, labels=False)
    calib = d.groupby("dec").agg(pred=("p_avg_fire", "mean"), obs=("destroyed", "mean"), n=("destroyed", "size")).reset_index()

    coefs = {}
    for (f, l), b, s_ in zip(cols, b_feat, se_feat):
        n = int((d[f] == l).sum())
        coefs.setdefault(f, {})[l] = {"b": round(float(b), 4), "or": round(float(np.exp(b)), 3),
                                      "or_lo": round(float(np.exp(b - 1.96 * s_)), 3), "or_hi": round(float(np.exp(b + 1.96 * s_)), 3),
                                      "n": n, "share": round(n / len(d), 4),
                                      "destroyed_rate": round(float(d.loc[d[f] == l, "destroyed"].mean()), 3)}
    for f in FEATURES:
        r = REFERENCE[f]
        coefs.setdefault(f, {})[r] = {"b": 0.0, "or": 1.0, "or_lo": 1.0, "or_hi": 1.0, "n": int((d[f] == r).sum()),
                                      "share": round(int((d[f] == r).sum()) / len(d), 4),
                                      "destroyed_rate": round(float(d.loc[d[f] == r, "destroyed"].mean()), 3)}

    # Features whose post-fire coding is biased by what survives to be seen are kept as controls
    # but NOT used for scoring: a burned wood fence or deck is usually recorded as "none", and
    # siding of a collapsed house is inferred from remnants. Spacing uses parcel centroids.
    NOT_CREDIBLE = {
        "siding": "Post-fire coding bias: combustible siding burns away and is under-recorded on destroyed homes.",
        "deck": "Post-fire coding bias: burned wood decks are often recorded as 'no deck'.",
        "fence": "Post-fire coding bias: burned wood fences are often recorded as 'no fence'.",
        "gap": "Coordinates are parcel centroids, so spacing is too coarse to measure.",
    }
    score_feats = [f for f in FEATURES if f not in NOT_CREDIBLE]
    col_idx = {c: j for j, c in enumerate(cols)}
    def app_logit_wo_intercept(rows):
        z = np.zeros(len(rows))
        for f in score_feats:
            for l in levels[f]:
                if (f, l) in col_idx:
                    z += (rows[f].to_numpy() == l) * b_feat[col_idx[(f, l)]]
        return z
    z0 = app_logit_wo_intercept(d)
    # choose the app intercept so the average inspected home matches the average-fire mean
    lo, hi = -10.0, 10.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if (1 / (1 + np.exp(-(mid + z0)))).mean() > p_mean: hi = mid
        else: lo = mid
    app_intercept = (lo + hi) / 2
    for f in FEATURES:
        for l, v in coefs[f].items():
            v["credible"] = f not in NOT_CREDIBLE
            # evidence label for the UI: significant and protective vs. not
            v["evidence"] = ("not_measurable" if f in NOT_CREDIBLE else
                             "reference" if l == REFERENCE[f] else
                             "significant" if (v["or_hi"] < 1 or v["or_lo"] > 1) else "not_significant")

    model = {
        "version": "2026-11-21",
        "target": "P(destroyed | wildfire reaches home), average California fire 2013-2025",
        "intercept_fit": round(avg_fire, 4),
        "intercept": round(app_intercept, 4),
        "reference_home": REFERENCE,
        "p_reference_home": round(p_ref, 4),
        "p_mean_inspected_home": round(p_mean, 4),
        "score_features": score_feats,
        "not_credible": NOT_CREDIBLE,
        "features": {f: {"label": FEATURES[f][0], "levels": coefs[f]} for f in FEATURES},
    }
    (OUT / "model.json").write_text(json.dumps(model, indent=1))

    fire_tbl = (d.groupby("fire").agg(homes=("destroyed", "size"), destroyed=("destroyed", "mean"))
                  .sort_values("homes", ascending=False).reset_index())
    report = {
        "rows": int(len(d)), "fires": int(d.fire.nunique()), "destroyed_rate": round(float(y.mean()), 4),
        "cv": {k: round(float(v), 4) for k, v in cv.items()},
        "rows_before_complete_case": int(n_all),
        "leakage": {"pooled_auc_with_unknown": round(leaky_auc, 4), "by_feature": leak},
        "calibration": calib.round(4).to_dict(orient="records"),
        "top_fires": fire_tbl.head(15).round(4).to_dict(orient="records"),
        "years": sorted(set(int(s[-4:]) for s in d.fire if s[-4:].isdigit())),
    }
    (OUT / "model_report.json").write_text(json.dumps(report, indent=1))
    print(f"p(reference home)={p_ref:.3f}  mean={p_mean:.3f}")
    for f in FEATURES:
        print(f, {l: f'{v["or"]} [{v["or_lo"]}-{v["or_hi"]}] n={v["n"]}' for l, v in sorted(coefs[f].items(), key=lambda kv: kv[1]["or"])})



if __name__ == "__main__":
    main()
