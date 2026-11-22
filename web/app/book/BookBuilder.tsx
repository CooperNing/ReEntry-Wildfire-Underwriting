"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import AssumptionsPanel from "@/components/AssumptionsPanel";
import { DECISION_META, DecisionBadge, DecisionKind, Metric } from "@/components/ui";
import type { Applicant } from "@/lib/data";
import { FEATURE_LABEL, labelOf } from "@/lib/model";
import { DEFAULT_ASSUMPTIONS, underwrite, usd, usdK } from "@/lib/pricing";
import { useCssVars } from "@/lib/useCssVars";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false, loading: () => <div className="h-[380px] card grid place-items-center text-muted text-sm">Loading map…</div> });

const KINDS: DecisionKind[] = ["accept", "conditional", "decline"];
const BIN_EDGES = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, Infinity];
const binLabel = (i: number) => (BIN_EDGES[i + 1] === Infinity ? `$${BIN_EDGES[i]}+` : `$${BIN_EDGES[i]}–${BIN_EDGES[i + 1]}`);

function CityCredit({ written }: { written: Applicant[] }) {
  const by = new Map<string, { n: number; distressed: number }>();
  written.forEach((x) => { const e = by.get(x.city) ?? { n: 0, distressed: 0 }; e.n++; if (x.distressed) e.distressed++; by.set(x.city, e); });
  const list = [...by.entries()].sort((p, q) => q[1].n - p[1].n).slice(0, 6);
  return (
    <ul className="mt-3 text-sm space-y-1">
      {list.map(([city, e]) => (
        <li key={city} className="flex justify-between gap-2">
          <span>{city}</span>
          <span className={`num ${e.distressed ? "text-ember" : "text-muted"}`}>{e.distressed ? `${e.distressed} of ${e.n} count` : `${e.n} written · not on the list`}</span>
        </li>
      ))}
    </ul>
  );
}

export default function BookBuilder({ apps }: { apps: Applicant[] }) {
  const c = useCssVars(["st-good", "st-warn", "st-crit", "grid", "muted", "surface", "ink"] as const);
  const [a, setA] = useState(DEFAULT_ASSUMPTIONS);
  const [writeConditional, setWriteConditional] = useState(true);
  const [fire, setFire] = useState<"All" | "Eaton" | "Palisades">("All");
  const [selected, setSelected] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  const scored = useMemo(() => apps
    .filter((x) => fire === "All" || x.fire === fire)
    .map((x) => ({ x, d: underwrite(x.home, x.hazard, x.sqft, a) })), [apps, a, fire]);

  const s = useMemo(() => {
    const written = scored.filter(({ d }) => d.decision === "accept" || (writeConditional && d.decision === "conditional"));
    const count = Object.fromEntries(KINDS.map((k) => [k, scored.filter(({ d }) => d.decision === k).length])) as Record<DecisionKind, number>;
    const premium = written.reduce((t, { d }) => t + d.after.premium, 0);
    const wfEAL = written.reduce((t, { d }) => t + d.after.wildfireEAL, 0);
    const baseLoss = written.reduce((t, { d }) => t + d.after.basePremiumLoss, 0);
    const tiv = written.reduce((t, { d }) => t + d.after.coverageA, 0);
    const mitigationSpend = written.reduce((t, { d }) => t + d.conditions.reduce((u, k) => u + (k.m.costLow + k.m.costHigh) / 2, 0), 0);
    const distressed = written.filter(({ x }) => x.distressed).length;
    // repeat-fire scenario: the same fire reaches every written home in its footprint again
    const repeat = ["Eaton", "Palisades"].map((f) => {
      const hs = written.filter(({ x }) => x.fire === f);
      return { fire: f, homes: hs.length, loss: hs.reduce((t, { d }) => t + d.after.coverageA * d.after.p, 0) };
    }).filter((r) => r.homes > 0);
    // concentration: Coverage A in the busiest ~1 km cell
    const cells = new Map<string, number>();
    written.forEach(({ x, d }) => { const k = `${Math.round(x.lat * 100)}|${Math.round(x.lon * 100)}`; cells.set(k, (cells.get(k) ?? 0) + d.after.coverageA); });
    const maxCell = Math.max(0, ...cells.values());
    const hist = BIN_EDGES.slice(0, -1).map((lo, i) => {
      const inBin = scored.filter(({ d }) => d.before.wildfirePer1k >= lo && d.before.wildfirePer1k < BIN_EDGES[i + 1]);
      return { bin: binLabel(i), accept: inBin.filter(({ d }) => d.decision === "accept").length, conditional: inBin.filter(({ d }) => d.decision === "conditional").length, decline: inBin.filter(({ d }) => d.decision === "decline").length };
    });
    return { written, count, premium, wfEAL, baseLoss, tiv, mitigationSpend, distressed, repeat, maxCell, hist };
  }, [scored, writeConditional]);

  const lossRatio = s.premium ? (s.wfEAL + s.baseLoss) / s.premium : 0;
  const color = (k: DecisionKind) => (k === "accept" ? c["st-good"] : k === "conditional" ? c["st-warn"] : c["st-crit"]);
  const points = scored.map(({ x, d }) => ({
    id: x.id, lat: x.lat, lon: x.lon, color: color(d.decision), radius: 4, opacity: 0.75,
    label: `${x.id} · ${x.city} · ${DECISION_META[d.decision].label} · ${usd(d.after.premium)}/yr`,
  }));
  const rows = [...scored].sort((p, q) => q.d.before.wildfirePer1k - p.d.before.wildfirePer1k);
  const PAGE = 15;
  const sel = scored.find(({ x }) => x.id === selected);

  return (
    <div className="grid lg:grid-cols-[300px_1fr] gap-5 items-start">
      <aside className="card p-4 space-y-4 lg:sticky lg:top-4">
        <div>
          <div className="label mb-1">Applicants</div>
          <div className="flex gap-1">
            {(["All", "Eaton", "Palisades"] as const).map((f) => (
              <button key={f} onClick={() => { setFire(f); setPage(0); }} className={`px-2.5 py-1 rounded-md text-sm border ${fire === f ? "border-ember text-ember bg-ember-soft" : "border-line"}`}>{f}</button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={writeConditional} onChange={(e) => setWriteConditional(e.target.checked)} />Write conditional homes once mitigated</label>
        <AssumptionsPanel a={a} onChange={setA} compact />
      </aside>

      <div className="space-y-5 min-w-0">
        <div className="card p-5">
          <div className="flex flex-wrap gap-3 items-center">
            {KINDS.map((k) => <span key={k} className="flex items-center gap-2"><DecisionBadge d={k} /><span className="num font-semibold">{s.count[k].toLocaleString()}</span></span>)}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5 mt-5">
            <Metric label="Policies written" value={s.written.length.toLocaleString()} sub={`${usdK(s.tiv)} Coverage A`} />
            <Metric label="Annual premium" value={usdK(s.premium)} sub={`avg ${usd(s.written.length ? s.premium / s.written.length : 0)}`} />
            <Metric label="Expected loss ratio" value={`${Math.round(lossRatio * 100)}%`} sub={`wildfire ${usdK(s.wfEAL)} + other ${usdK(s.baseLoss)}`} />
            <Metric label="Homeowner retrofit spend" value={usdK(s.mitigationSpend)} sub="midpoint of required conditions" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div className="card p-5">
            <h2 className="font-semibold">If the same fire came back</h2>
            <p className="text-xs text-muted mt-1">The fire reaches every written home in its 2025 footprint; each home is lost with its modeled probability (average-severity fire).</p>
            <div className="mt-3 space-y-3">
              {s.repeat.map((r) => (
                <div key={r.fire} className="flex items-baseline justify-between gap-3">
                  <div><div className="font-medium">{r.fire} repeat</div><div className="text-xs text-muted">{r.homes} written homes</div></div>
                  <div className="text-right"><div className="text-xl font-semibold num text-decline">{usdK(r.loss)}</div>
                    <div className="text-xs text-muted num">{s.premium ? (r.loss / s.premium).toFixed(1) : "–"} years of this book&apos;s premium</div></div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-3">This is the correlation an annual expected-loss view hides, and what the catastrophe load and reinsurance must carry. Busiest ~1 km cell: {usdK(s.maxCell)} of Coverage A.</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold">Commitment credit</h2>
            <div className="text-3xl font-semibold num mt-2">{s.distressed.toLocaleString()} <span className="text-base font-normal text-muted">of {s.written.length.toLocaleString()} written</span></div>
            <p className="text-sm text-muted mt-2">are in CDI distressed areas as listed in March 2025, before these fires.</p>
            <CityCredit written={s.written.map(({ x }) => x)} />
          </div>
        </div>

        <div className="card p-5">
          <h2 className="font-semibold">Applicants by wildfire loss cost, as-is</h2>
          <p className="text-xs text-muted">Dollars per $1,000 of Coverage A per year. The line is your appetite; conditional homes sit right of it and move left once mitigated.</p>
          <div className="h-[260px] mt-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.hist} margin={{ top: 22, right: 8, bottom: 4, left: 0 }} barCategoryGap={4}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="bin" stroke={c.muted} fontSize={11} interval={0} />
                <YAxis stroke={c.muted} fontSize={11} allowDecimals={false} />
                <Tooltip cursor={{ fill: c.grid, opacity: 0.5 }} contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12, color: c.ink }} />
                {KINDS.map((k, i) => (
                  <Bar key={k} dataKey={k} name={DECISION_META[k].label} stackId="d" fill={color(k)} stroke={c.surface} strokeWidth={1}
                    radius={i === KINDS.length - 1 ? [4, 4, 0, 0] : 0} isAnimationActive={false} />
                ))}
                <ReferenceLine x={binLabel(Math.max(0, BIN_EDGES.findIndex((e) => e > a.maxWildfirePer1k) - 1))} stroke={c.ink} strokeDasharray="3 3"
                  label={{ value: `appetite $${a.maxWildfirePer1k.toFixed(2)}`, position: "top", fill: c.muted, fontSize: 11 }} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-4 text-xs text-muted mt-1">{KINDS.map((k) => <span key={k} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: color(k) }} />{DECISION_META[k].icon} {DECISION_META[k].label}</span>)}</div>
        </div>

        <div className="grid xl:grid-cols-[1fr_360px] gap-5">
          <div className="space-y-2">
            <LeafletMap points={points} height={380} fitKey={fire} onSelect={setSelected} dark={c.dark} />
            <p className="text-xs text-muted">Click a dot to see the home. Colors: ✓ accept, ! conditional, ✕ decline.</p>
          </div>
          <div className="card p-4 text-sm">
            {!sel ? <p className="text-muted">Select a home on the map or in the table.</p> : (
              <div className="space-y-2">
                <div className="flex items-center justify-between"><b>{sel.x.id}</b><DecisionBadge d={sel.d.decision} /></div>
                <div className="text-muted">{sel.x.city} {sel.x.zip} · {sel.x.fire} fire survivor · {sel.x.sqft.toLocaleString()} sq ft · built {sel.x.yearBuilt ?? "?"}</div>
                <ul className="text-xs grid grid-cols-2 gap-x-3 gap-y-0.5">
                  {(["roof", "eaves", "vents", "windows", "outbuilding", "type"] as const).map((f) => <li key={f}><span className="text-muted">{FEATURE_LABEL[f]}:</span> {labelOf(f, sel.x.home[f])}</li>)}
                </ul>
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <Metric label="Wildfire $/1K" value={`$${sel.d.before.wildfirePer1k.toFixed(2)}`} />
                  <Metric label="Premium" value={usd(sel.d.after.premium)} />
                </div>
                {sel.d.conditions.length > 0 && <div><div className="label">Conditions</div><ul className="list-disc pl-5 text-xs">{sel.d.conditions.map((k) => <li key={k.m.id}>{k.m.title} ({usdK(k.m.costLow)}–{usdK(k.m.costHigh)})</li>)}</ul></div>}
                <p className="text-xs text-muted">{sel.d.reasons.join(" ")}</p>
              </div>
            )}
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-muted border-b border-line"><tr>
              <th className="px-4 py-2 font-medium">Home</th><th className="px-2 py-2 font-medium">Area</th><th className="px-2 py-2 font-medium">Roof / vents / windows</th>
              <th className="px-2 py-2 font-medium text-right">Wildfire $/1K</th><th className="px-2 py-2 font-medium text-right">Premium</th><th className="px-4 py-2 font-medium">Decision</th>
            </tr></thead>
            <tbody>
              {rows.slice(page * PAGE, page * PAGE + PAGE).map(({ x, d }) => (
                <tr key={x.id} className={`border-b border-line last:border-0 cursor-pointer hover:bg-surface-2 ${selected === x.id ? "bg-surface-2" : ""}`} onClick={() => setSelected(x.id)}>
                  <td className="px-4 py-2 num">{x.id}</td>
                  <td className="px-2 py-2">{x.city} <span className="text-muted">· {x.fire}</span></td>
                  <td className="px-2 py-2 text-muted">{labelOf("roof", x.home.roof)} / {labelOf("vents", x.home.vents)} / {labelOf("windows", x.home.windows)}</td>
                  <td className="px-2 py-2 text-right num">${d.before.wildfirePer1k.toFixed(2)}</td>
                  <td className="px-2 py-2 text-right num">{usd(d.after.premium)}</td>
                  <td className="px-4 py-2"><DecisionBadge d={d.decision} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center justify-between p-3 text-sm text-muted">
            <span>Sorted by wildfire loss cost, highest first · {rows.length.toLocaleString()} homes</span>
            <div className="flex gap-2">
              <button className="px-2 py-1 border border-line rounded disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</button>
              <span className="num">{page + 1} / {Math.ceil(rows.length / PAGE)}</span>
              <button className="px-2 py-1 border border-line rounded disabled:opacity-40" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
