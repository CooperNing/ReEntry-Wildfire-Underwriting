"use client";
import { useState } from "react";
import { CartesianGrid, Line, ResponsiveContainer, Scatter, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import { useCssVars } from "@/lib/useCssVars";

export type ForestRow = { id: string; feature: string; level: string; ref: string; or: number; lo: number; hi: number; n: number; significant: boolean };

/** Hand-drawn SVG forest plot (log scale), with per-row hover. */
export function ForestPlot({ rows }: { rows: ForestRow[] }) {
  const c = useCssVars(["ink", "muted", "grid", "accept", "decline", "line"] as const);
  const [hover, setHover] = useState<string | null>(null);
  const W = 760, rowH = 26, left = 360, right = 70, top = 24;
  const H = top + rows.length * rowH + 10;
  const lo = 0.15, hi = 4.5;
  // rounded so server and client render identical attributes (no hydration mismatch)
  const x = (v: number) => Math.round((left + ((Math.log(Math.min(hi, Math.max(lo, v))) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * (W - left - right)) * 10) / 10;
  const ticks = [0.25, 0.5, 1, 2, 4];
  return (
    <div className="overflow-x-auto mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[620px]" role="img" aria-label="Odds ratios with 95% confidence intervals">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x(t)} x2={x(t)} y1={top - 6} y2={H - 6} stroke={t === 1 ? c.muted : c.grid} strokeDasharray={t === 1 ? "4 3" : undefined} />
            <text x={x(t)} y={top - 10} textAnchor="middle" fontSize={11} fill={c.muted}>{t}×</text>
          </g>
        ))}
        <text x={x(0.5)} y={H - 0} fontSize={10} fill={c.muted} textAnchor="middle">← lower odds of destruction</text>
        <text x={x(2)} y={H - 0} fontSize={10} fill={c.muted} textAnchor="middle">higher →</text>
        {rows.map((r, i) => {
          const y = top + i * rowH + rowH / 2;
          const showFeature = i === 0 || rows[i - 1].feature !== r.feature;
          const col = r.or < 1 ? c.accept : c.decline;
          const on = hover === r.id;
          return (
            <g key={r.id} onMouseEnter={() => setHover(r.id)} onMouseLeave={() => setHover(null)}>
              <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill={on ? c.grid : "transparent"} opacity={0.5} />
              {showFeature && <text x={0} y={y + 4} fontSize={12} fontWeight={600} fill={c.ink}>{r.feature}</text>}
              <text x={175} y={y + 4} fontSize={12} fill={c.ink}>{r.level}</text>
              <line x1={x(r.lo)} x2={x(r.hi)} y1={y} y2={y} stroke={col} strokeWidth={2} strokeLinecap="round" />
              <circle cx={x(r.or)} cy={y} r={5} fill={r.significant ? col : "transparent"} stroke={col} strokeWidth={2} />
              <text x={W - right + 8} y={y + 4} fontSize={11} fill={on ? c.ink : c.muted} className="num">{r.or.toFixed(2)}×</text>
              {on && (
                <text x={left} y={y - 8} fontSize={10} fill={c.muted}>vs {r.ref} · 95% CI {r.lo.toFixed(2)}–{r.hi.toFixed(2)} · n={r.n.toLocaleString()}</text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function CalibrationChart({ data }: { data: { pred: number; obs: number; n: number }[] }) {
  const c = useCssVars(["ink", "muted", "grid", "ember", "surface"] as const);
  const pts = data.map((d) => ({ pred: +(d.pred * 100).toFixed(1), obs: +(d.obs * 100).toFixed(1), n: d.n }));
  return (
    <div className="h-[260px] mt-2">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={pts} margin={{ top: 8, right: 12, bottom: 22, left: 0 }}>
          <CartesianGrid stroke={c.grid} />
          <XAxis type="number" dataKey="pred" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke={c.muted} fontSize={11}
            label={{ value: "Predicted", position: "bottom", offset: 4, fill: c.muted, fontSize: 11 }} />
          <YAxis type="number" dataKey="obs" domain={[0, 100]} tickFormatter={(v) => `${v}%`} stroke={c.muted} fontSize={11} />
          <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background: c.surface, border: `1px solid ${c.grid}`, borderRadius: 8, fontSize: 12, color: c.ink }} />
          <Line type="linear" data={[{ pred: 0, obs: 0 }, { pred: 100, obs: 100 }]} dataKey="obs" stroke={c.muted} strokeDasharray="4 3" dot={false} isAnimationActive={false} legendType="none" name="perfect" />
          <Scatter dataKey="obs" fill={c.ember} name="observed" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

