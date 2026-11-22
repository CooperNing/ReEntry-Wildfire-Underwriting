import report from "@/data/model_report.json";
import { FEATURE_LABEL, FeatureKey, labelOf, MODEL } from "@/lib/model";
import { ForestPlot, CalibrationChart, type ForestRow } from "./ModelCharts";

export const metadata = { title: "Model · ReEntry" };

const LEAK_LABEL: Record<string, string> = { roof: "Roof", eaves: "Eaves", vents: "Vents", siding: "Walls", windows: "Windows", deck: "Deck", fence: "Fence" };

export default function ModelPage() {
  const rows: ForestRow[] = [];
  for (const f of MODEL.scoreFeatures as FeatureKey[]) {
    const ref = Object.entries(MODEL.features[f].levels).find(([, l]) => l.evidence === "reference")?.[0] ?? "";
    for (const [lv, l] of Object.entries(MODEL.features[f].levels)) {
      if (lv === "unknown" || l.evidence === "reference" || lv === "rated_other" || lv === "screened_unspecified") continue;
      rows.push({ id: `${f}:${lv}`, feature: FEATURE_LABEL[f], level: labelOf(f, lv), ref: labelOf(f, ref), or: l.or, lo: l.or_lo, hi: l.or_hi, n: l.n, significant: l.evidence === "significant" });
    }
  }
  const cv = report.cv;
  const leak = report.leakage;

  return (
    <div className="space-y-6 max-w-5xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Model card</h1>
        <p className="text-muted mt-1">
          What a home&apos;s construction does to its chance of being destroyed when a wildfire reaches it, estimated from CAL FIRE
          Damage Inspection (DINS) records for every structure inside {report.fires} California fire perimeters, {report.years[0]}–{report.years[report.years.length - 1]}.
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card k="Training homes" v={report.rows.toLocaleString()} s={`of ${report.rows_before_complete_case.toLocaleString()} inspected single-family and mobile homes`} />
        <Card k="Fires" v={String(report.fires)} s="each with its own fixed effect" />
        <Card k="Destroyed" v={`${Math.round(report.destroyed_rate * 100)}%`} s="of training homes" />
        <Card k="AUC, held-out fires" v={cv.logistic_within_fire_auc.toFixed(2)} s={`within-fire ranking · gradient boosting ${cv.gbm_within_fire_auc.toFixed(2)}`} />
      </div>

      <section className="card p-5 space-y-3">
        <h2 className="font-semibold text-lg">The trap: &quot;unknown&quot; leaks the outcome</h2>
        <p className="text-sm">
          Inspectors record what they can see. On a burned house the eaves and vents are gone, so they write &quot;unknown&quot;; on a
          house nobody needed to walk around, the roof is often left &quot;unknown&quot;. A model that keeps &quot;unknown&quot; as a
          category learns the inspection process, not fire physics. It scores <b>{leak.pooled_auc_with_unknown.toFixed(2)} AUC</b> on
          held-out fires and is useless for a home that has not burned yet. Dropping homes with unobserved features brings it to an
          honest <b>{cv.logistic_pooled_auc.toFixed(2)}</b>.
        </p>
        <div className="overflow-x-auto">
          <table className="text-sm w-full">
            <thead className="text-muted text-left border-b border-line"><tr><th className="py-1.5 pr-4 font-medium">Feature</th><th className="py-1.5 px-2 font-medium text-right">Recorded unknown</th><th className="py-1.5 px-2 font-medium text-right">Destroyed when unknown</th><th className="py-1.5 px-2 font-medium text-right">Destroyed when observed</th></tr></thead>
            <tbody>{Object.entries(leak.by_feature).map(([f, v]) => (
              <tr key={f} className="border-b border-line last:border-0">
                <td className="py-1.5 pr-4">{LEAK_LABEL[f]}</td><td className="py-1.5 px-2 text-right num">{Math.round(v.unknown_share * 100)}%</td>
                <td className="py-1.5 px-2 text-right num font-medium">{Math.round(v.unknown_destroyed * 100)}%</td><td className="py-1.5 px-2 text-right num">{Math.round(v.observed_destroyed * 100)}%</td>
              </tr>))}</tbody>
          </table>
        </div>
        <p className="text-xs text-muted">In the app, &quot;Not known&quot; is scored as the share-weighted average of the observed categories.</p>
      </section>

      <section className="card p-5">
        <h2 className="font-semibold text-lg">Effects used for pricing</h2>
        <p className="text-sm text-muted mt-1">Odds ratio of destruction vs. the reference category, same fire, all other features held fixed. Bars are 95% intervals; log scale. Hollow markers are not statistically significant.</p>
        <ForestPlot rows={rows} />
      </section>

      <section className="card p-5">
        <h2 className="font-semibold text-lg">Recorded but not priced</h2>
        <p className="text-sm text-muted mt-1">These stay in the regression as controls and are shown to underwriters, but they do not move the price. Their fitted effects point the wrong way, which is the signature of the bias described.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {(["siding", "deck", "fence"] as FeatureKey[]).map((f) => {
            const lv = f === "siding" ? "combustible" : f === "deck" ? "wood" : "combustible";
            const l = MODEL.features[f].levels[lv];
            return (
              <li key={f}><b>{FEATURE_LABEL[f]}:</b> {labelOf(f, lv).toLowerCase()} fits at <span className="num">{l.or.toFixed(2)}×</span> odds (looks protective). <span className="text-muted">{MODEL.notCredible[f]}</span></li>
            );
          })}
          <li><b>Distance to the nearest home:</b> <span className="text-muted">{MODEL.notCredible.gap}</span></li>
        </ul>
      </section>

      <section className="grid md:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-semibold">Calibration</h2>
          <p className="text-xs text-muted">Average-fire prediction vs. observed destruction rate, by decile of predicted risk. In-sample; the spread around the diagonal is fire-to-fire severity the model holds at its average.</p>
          <CalibrationChart data={report.calibration.map((r) => ({ pred: r.pred, obs: r.obs, n: r.n }))} />
        </div>
        <div className="card p-5">
          <h2 className="font-semibold">Largest fires in the training set</h2>
          <table className="w-full text-sm mt-2">
            <thead className="text-muted text-left border-b border-line"><tr><th className="py-1 font-medium">Fire</th><th className="py-1 font-medium text-right">Homes</th><th className="py-1 font-medium text-right">Destroyed</th></tr></thead>
            <tbody>{report.top_fires.slice(0, 12).map((f) => (
              <tr key={f.fire} className="border-b border-line last:border-0"><td className="py-1">{f.fire}</td><td className="py-1 text-right num">{f.homes.toLocaleString()}</td><td className="py-1 text-right num">{Math.round(f.destroyed * 100)}%</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      <section className="card p-5 text-sm space-y-2">
        <h2 className="font-semibold text-lg">How a price is built</h2>
        <ol className="list-decimal pl-5 space-y-1.5">
          <li><b>Area hazard</b>: FEMA National Risk Index expected annual wildfire building loss ÷ building value for the census tract, times a forward-looking uplift, with a floor.</li>
          <li><b>Home vulnerability</b>: model probability for this home ÷ probability for the average inspected home ({Math.round(MODEL.pAverageHome * 100)}%).</li>
          <li><b>Wildfire loss cost</b> = area hazard × vulnerability, per $1,000 of Coverage A (floor area × rebuild cost).</li>
          <li><b>Technical premium</b> = (wildfire loss × (1 + cat load) + non-wildfire loss) ÷ (1 − expense ratio).</li>
          <li><b>Decision</b>: accept under appetite; otherwise add mitigations by risk reduction per retrofit dollar until under appetite (conditional), or decline.</li>
        </ol>
      </section>

      <section className="card p-5 text-sm">
        <h2 className="font-semibold text-lg">Limits</h2>
        <ul className="list-disc pl-5 mt-2 space-y-1.5 text-muted">
          <li>DINS covers structures inside fire perimeters only, so the model estimates loss <i>given</i> a fire arrives. Whether a fire arrives comes from FEMA&apos;s tract-level history, which is coarse and backward-looking.</li>
          <li>Keeping only fully observed homes removes many destroyed ones (in Eaton, {Math.round((report.top_fires.find((f) => f.fire.startsWith("Eaton"))?.destroyed ?? 0) * 100)}% of the kept homes were destroyed vs. about half of all inspected). Absolute probabilities are therefore for the average fire in the filtered sample; pricing uses only the <i>relative</i> vulnerability (home ÷ average home), which the per-fire fixed effects protect.</li>
          <li>Within-fire AUC of about {cv.logistic_within_fire_auc.toFixed(2)} means construction separates risk meaningfully but not decisively; wind, spotting and house-to-house spread dominate in urban conflagrations.</li>
          <li>Effects are associations from observational data; homes with better construction may also differ in ways not recorded.</li>
          <li>Defensible space, Zone 0 and community programs are not in DINS in usable form, so they are captured from documents but not priced.</li>
          <li>Retrofit cost ranges and pricing parameters are planning assumptions, not filed rates.</li>
        </ul>
      </section>
    </div>
  );
}

function Card({ k, v, s }: { k: string; v: string; s: string }) {
  return <div className="card p-4"><div className="label">{k}</div><div className="text-2xl font-semibold num mt-1">{v}</div><div className="text-xs text-muted mt-1">{s}</div></div>;
}
