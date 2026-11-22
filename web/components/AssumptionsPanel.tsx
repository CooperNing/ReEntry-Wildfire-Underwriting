"use client";
import { ASSUMPTION_INFO, Assumptions, DEFAULT_ASSUMPTIONS } from "@/lib/pricing";

type NumKey = Exclude<keyof Assumptions, "declineMobile" | "declineWoodRoof">;
const SLIDERS: { key: NumKey; label: string; min: number; max: number; step: number; fmt: (v: number) => string }[] = [
  { key: "maxWildfirePer1k", label: "Appetite: max wildfire loss cost", min: 0.5, max: 6, step: 0.1, fmt: (v) => `$${v.toFixed(2)} / $1K` },
  { key: "uplift", label: "Forward-looking uplift on FEMA hazard", min: 1, max: 5, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
  { key: "floorRatePer1k", label: "Wildfire loss floor", min: 0, max: 2, step: 0.05, fmt: (v) => `$${v.toFixed(2)} / $1K` },
  { key: "catLoad", label: "Catastrophe / reinsurance load", min: 0, max: 2, step: 0.05, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "basePer1k", label: "Non-wildfire loss cost", min: 0.3, max: 3, step: 0.05, fmt: (v) => `$${v.toFixed(2)} / $1K` },
  { key: "expenseRatio", label: "Expense + profit ratio", min: 0.15, max: 0.45, step: 0.01, fmt: (v) => `${Math.round(v * 100)}%` },
  { key: "costPerSqft", label: "Rebuild cost", min: 250, max: 1000, step: 10, fmt: (v) => `$${v} / sq ft` },
];

export default function AssumptionsPanel({ a, onChange, compact }: { a: Assumptions; onChange: (a: Assumptions) => void; compact?: boolean }) {
  return (
    <div className={`grid gap-x-6 gap-y-4 ${compact ? "" : "sm:grid-cols-2"}`}>
      {SLIDERS.map((s) => (
        <label key={s.key} className="block text-sm" title={ASSUMPTION_INFO[s.key]}>
          <div className="flex justify-between gap-2"><span>{s.label}</span><span className="num font-medium">{s.fmt(a[s.key])}</span></div>
          <input type="range" min={s.min} max={s.max} step={s.step} value={a[s.key]}
            onChange={(e) => onChange({ ...a, [s.key]: Number(e.target.value) })} aria-label={s.label} />
          <p className="text-xs text-muted leading-snug">{ASSUMPTION_INFO[s.key]}</p>
        </label>
      ))}
      <div className="text-sm space-y-2">
        <label className="flex items-center gap-2"><input type="checkbox" checked={a.declineMobile} onChange={(e) => onChange({ ...a, declineMobile: e.target.checked })} />Decline mobile / manufactured homes</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={a.declineWoodRoof} onChange={(e) => onChange({ ...a, declineWoodRoof: e.target.checked })} />Require replacing wood shake roofs</label>
        <button className="text-xs text-ember underline underline-offset-2" onClick={() => onChange(DEFAULT_ASSUMPTIONS)}>Reset to defaults</button>
      </div>
    </div>
  );
}
