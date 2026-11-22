"use client";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { useCssVars } from "@/lib/useCssVars";

const LeafletMap = dynamic(() => import("@/components/LeafletMap"), { ssr: false, loading: () => <div className="h-[420px] card grid place-items-center text-muted text-sm">Loading map…</div> });

export type MarketRow = {
  zip: string; city: string; county: string; lat: number; lon: number;
  fair: number; total: number; share: number; nonrenew: number | null; newChange: number | null;
  wfPer1k: number; risk: number | null; value: number | null; destroyed: number;
  distressed: boolean; undermarketed: boolean;
};

export const BANDS = [
  { key: "low", label: "Low", max: 0.1, desc: "< $0.10 per $1K", varName: "hz-1" },
  { key: "moderate", label: "Moderate", max: 0.5, desc: "$0.10–0.50", varName: "hz-2" },
  { key: "high", label: "High", max: 2, desc: "$0.50–2.00", varName: "hz-3" },
  { key: "severe", label: "Severe", max: Infinity, desc: "> $2.00", varName: "hz-4" },
] as const;
const band = (v: number) => BANDS.find((b) => v < b.max)!;

type SortKey = "fair" | "share" | "wfPer1k" | "nonrenew" | "value";
const fmt = (n: number) => n.toLocaleString("en-US");

export default function MarketView({ rows }: { rows: MarketRow[] }) {
  const c = useCssVars(["hz-1", "hz-2", "hz-3", "hz-4", "grid", "muted", "ink", "surface"] as const);
  const counties = useMemo(() => Array.from(new Set(rows.map((r) => r.county))).sort(), [rows]);
  const [county, setCounty] = useState("All");
  const [distressedOnly, setDistressedOnly] = useState(false);
  const [bands, setBands] = useState<Set<string>>(new Set(BANDS.map((b) => b.key)));
  const [minFair, setMinFair] = useState(100);
  const [sort, setSort] = useState<SortKey>("fair");
  const [share, setShare] = useState(3);           // insurer statewide market share, %
  const [current, setCurrent] = useState(0);       // current policies in distressed areas

  const view = useMemo(() => rows.filter((r) =>
    (county === "All" || r.county === county) && (!distressedOnly || r.distressed) &&
    bands.has(band(r.wfPer1k).key) && r.fair >= minFair), [rows, county, distressedOnly, bands, minFair]);

  const totals = useMemo(() => {
    const fair = view.reduce((s, r) => s + r.fair, 0);
    const byBand = BANDS.map((b) => ({ ...b, fair: view.filter((r) => band(r.wfPer1k).key === b.key).reduce((s, r) => s + r.fair, 0) }));
    return { fair, byBand, zips: view.length };
  }, [view]);

  const distressedUnits = useMemo(() => rows.filter((r) => r.distressed).reduce((s, r) => s + r.total, 0), [rows]);
  const distressedFair = useMemo(() => rows.filter((r) => r.distressed).reduce((s, r) => s + r.fair, 0), [rows]);
  const target = Math.round(0.85 * (share / 100) * distressedUnits);
  const gap = Math.max(0, target - current);

  const sorted = useMemo(() => [...view].sort((a, b) => ((b[sort] ?? -1) as number) - ((a[sort] ?? -1) as number)).slice(0, 60), [view, sort]);
  const color = (r: MarketRow) => c[band(r.wfPer1k).varName];
  const maxFair = Math.max(1, ...view.map((r) => r.fair));
  const points = view.map((r) => ({
    id: r.zip, lat: r.lat, lon: r.lon, color: color(r), radius: 3 + 14 * Math.sqrt(r.fair / maxFair),
    label: `${r.zip} ${r.city}: ${fmt(r.fair)} FAIR homes (${(r.share * 100).toFixed(1)}%), wildfire $${r.wfPer1k.toFixed(2)}/1K${r.distressed ? " · distressed" : ""}`,
  }));

  return (
    <div className="space-y-5">
      {/* filters: one row above the charts */}
      <div className="card p-3 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
        <label className="flex items-center gap-2">County
          <select value={county} onChange={(e) => setCounty(e.target.value)}>
            <option>All</option>{counties.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={distressedOnly} onChange={(e) => setDistressedOnly(e.target.checked)} />
          CDI distressed only
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Wildfire loss band">
          <span className="text-muted mr-1">Wildfire loss</span>
          {BANDS.map((b) => {
            const on = bands.has(b.key);
            return (
              <button key={b.key} onClick={() => { const n = new Set(bands); if (on) n.delete(b.key); else n.add(b.key); setBands(n); }}
                className={`px-2 py-1 rounded-md border text-xs flex items-center gap-1.5 ${on ? "border-ink/30 bg-surface-2" : "border-line text-muted opacity-60"}`}
                aria-pressed={on} title={b.desc}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c[b.varName] }} />{b.label}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2">Min FAIR homes
          <input type="number" min={0} step={50} value={minFair} onChange={(e) => setMinFair(Number(e.target.value) || 0)} className="w-24" />
        </label>
        <span className="ml-auto text-muted num">{fmt(totals.zips)} ZIPs · {fmt(totals.fair)} FAIR homes</span>
      </div>

      <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="space-y-2">
          <LeafletMap points={points} fitKey={`${county}|${distressedOnly}|${[...bands].join()}|${minFair}`} dark={c.dark} />
          <p className="text-xs text-muted">Circle area = FAIR Plan homes in the ZIP. Color = FEMA wildfire loss band.</p>
        </div>
        <div className="space-y-5">
          <div className="card p-4">
            <h2 className="font-semibold">Your 85% commitment</h2>
            <p className="text-xs text-muted mt-1">Insurers using a catastrophe model must write at least 85% of their statewide market share in distressed areas (10 CCR §2644.4.8). Distressed areas hold {fmt(distressedUnits)} insured homes in this data, {fmt(distressedFair)} of them on the FAIR Plan.</p>
            <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
              <label className="space-y-1"><span className="label block">Statewide share %</span>
                <input type="number" min={0.1} max={30} step={0.1} value={share} onChange={(e) => setShare(Number(e.target.value) || 0)} className="w-full" /></label>
              <label className="space-y-1"><span className="label block">Policies there today</span>
                <input type="number" min={0} step={500} value={current} onChange={(e) => setCurrent(Number(e.target.value) || 0)} className="w-full" /></label>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><div className="label">Required</div><div className="text-xl font-semibold num">{fmt(target)}</div></div>
              <div><div className="label">Gap to close</div><div className="text-xl font-semibold num text-ember">{fmt(gap)}</div></div>
            </div>
            <p className="text-xs text-muted mt-2">That gap is {distressedFair ? ((gap / distressedFair) * 100).toFixed(1) : 0}% of all FAIR Plan homes in distressed areas.</p>
          </div>
          <div className="card p-4">
            <h2 className="font-semibold">FAIR Plan homes by wildfire loss band</h2>
            <div className="mt-3 space-y-2">
              {totals.byBand.map((b) => (
                <div key={b.key} className="text-sm">
                  <div className="flex justify-between"><span>{b.label} <span className="text-muted text-xs">{b.desc}</span></span><span className="num">{fmt(b.fair)}</span></div>
                  <div className="h-2 rounded-sm bg-surface-2 mt-1"><div className="h-2 rounded-sm" style={{ width: `${(b.fair / Math.max(1, totals.fair)) * 100}%`, background: c[b.varName] }} /></div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted mt-3">Low-band ZIPs are FAIR Plan homes that left the voluntary market for reasons other than wildfire: the cheapest re-entries.</p>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <h2 className="font-semibold">FAIR Plan share vs. wildfire loss</h2>
        <p className="text-xs text-muted">Each dot is a ZIP; size = FAIR Plan homes. Top-left: many FAIR homes, little modeled wildfire loss. Wildfire loss axis is logarithmic (values below $0.01 shown at $0.01).</p>
        <div className="h-[340px] mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 16, bottom: 28, left: 8 }}>
              <CartesianGrid stroke={c.grid} />
              <XAxis type="number" dataKey="x" scale="log" domain={[0.01, 20]} ticks={[0.01, 0.1, 1, 10]} allowDataOverflow
                tickFormatter={(v: number) => `$${v}`} stroke={c.muted} fontSize={12}
                label={{ value: "Wildfire expected loss per $1,000 of building value (FEMA)", position: "bottom", offset: 10, fill: c.muted, fontSize: 12 }} />
              <YAxis type="number" dataKey="y" tickFormatter={(v: number) => `${v}%`} stroke={c.muted} fontSize={12}
                label={{ value: "FAIR Plan share", angle: -90, position: "insideLeft", fill: c.muted, fontSize: 12 }} />
              <ZAxis type="number" dataKey="z" range={[12, 500]} />
              <Tooltip cursor={false} content={({ payload }) => {
                const r = payload?.[0]?.payload as (MarketRow & { x: number }) | undefined;
                if (!r) return null;
                return (
                  <div className="card px-3 py-2 text-xs shadow-sm">
                    <div className="font-semibold">{r.zip} {r.city}</div>
                    <div className="num">{fmt(r.fair)} FAIR homes · {(r.share * 100).toFixed(1)}%</div>
                    <div className="num">Wildfire ${r.wfPer1k.toFixed(2)} per $1K</div>
                    {r.distressed && <div className="text-ember">CDI distressed</div>}
                  </div>
                );
              }} />
              {BANDS.map((b) => (
                <Scatter key={b.key} name={b.label}
                  data={view.filter((r) => band(r.wfPer1k).key === b.key).map((r) => ({ ...r, x: Math.max(0.01, r.wfPer1k), y: +(r.share * 100).toFixed(1), z: r.fair }))}
                  fill={c[b.varName]} fillOpacity={0.7} stroke={c.surface} strokeWidth={1} isAnimationActive={false} />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-muted mt-1" aria-label="Legend">
          {BANDS.map((b) => <span key={b.key} className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c[b.varName] }} />{b.label} ({b.desc})</span>)}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <div className="p-4 pb-2 flex items-center gap-3">
          <h2 className="font-semibold">ZIP codes</h2>
          <span className="text-xs text-muted">Top 60 in view, sorted by {({ fair: "FAIR homes", share: "FAIR share", wfPer1k: "wildfire loss", nonrenew: "non-renewal rate", value: "home value" } as const)[sort]}. Click a column to sort.</span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-muted border-b border-line">
            <tr>
              <th className="px-4 py-2 font-medium">ZIP</th><th className="px-2 py-2 font-medium">City</th><th className="px-2 py-2 font-medium">County</th>
              {([["fair", "FAIR homes"], ["share", "FAIR share"], ["nonrenew", "Non-renewal 2023"], ["wfPer1k", "Wildfire $/1K"], ["value", "Home value"]] as [SortKey, string][]).map(([k, l]) => (
                <th key={k} className="px-2 py-2 font-medium text-right">
                  <button onClick={() => setSort(k)} className={sort === k ? "text-ink underline underline-offset-4" : "hover:text-ink"}>{l}</button>
                </th>
              ))}
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.zip} className="border-b border-line last:border-0">
                <td className="px-4 py-2 num">{r.zip}</td><td className="px-2 py-2">{r.city}</td><td className="px-2 py-2 text-muted">{r.county}</td>
                <td className="px-2 py-2 text-right num">{fmt(r.fair)}</td>
                <td className="px-2 py-2 text-right num">{(r.share * 100).toFixed(1)}%</td>
                <td className="px-2 py-2 text-right num">{r.nonrenew == null ? "–" : `${(r.nonrenew * 100).toFixed(1)}%`}</td>
                <td className="px-2 py-2 text-right num"><span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: color(r) }} />${r.wfPer1k.toFixed(2)}</td>
                <td className="px-2 py-2 text-right num">{r.value ? `$${Math.round(r.value / 1000)}K` : "–"}</td>
                <td className="px-4 py-2">{r.distressed && <span className="text-xs px-1.5 py-0.5 rounded bg-ember-soft text-ember">{r.undermarketed ? "Undermarketed ZIP" : "Distressed county"}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
