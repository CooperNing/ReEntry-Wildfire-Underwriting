"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import AssumptionsPanel from "@/components/AssumptionsPanel";
import { DecisionBadge, Metric, MiniMarkdown, Pill, Section } from "@/components/ui";
import {
  CHOICES, coefficient, DEFAULT_HOME, eraFromYear, FEATURE_LABEL, FeatureKey, Home, labelOf, MODEL, score,
} from "@/lib/model";
import { DEFAULT_ASSUMPTIONS, Hazard, pct, underwrite, usd, usdK } from "@/lib/pricing";

type Lookup = {
  matched: string; lat: number; lon: number; tract: string | null; zip: string | null;
  hazard: Hazard;
  zone: { status: string; level: string | null; area: string | null };
  firesWithin1km: { year: number; name: string; acres: number }[];
  firesStatus: string;
  market: { city: string; county: string; fair_share_2022: number; units_fair: number; nonrenew_rate_2023: number | null; distressed: boolean; undermarketed_zip: boolean; home_value: number | null } | null;
};

type FieldX = { value: string; quote: string; page: number | null };
type Extraction = {
  is_property_document: boolean; document_type: string;
  roof: FieldX; eaves: FieldX; vents: FieldX; windows: FieldX; siding: FieldX; deck: FieldX; fence: FieldX; outbuilding: FieldX; type: FieldX;
  year_built: { value: number | null; quote: string; page: number | null };
  sqft: { value: number | null; quote: string; page: number | null };
  other_mitigation: { item: string; quote: string }[];
  conflicts: string[];
};

const EXAMPLES = [
  { label: "Altadena", address: "600 E Mariposa St, Altadena, CA 91001" },
  { label: "Pacific Palisades", address: "861 Alma Real Dr, Pacific Palisades, CA 90272" },
  { label: "Paradise", address: "5555 Skyway, Paradise, CA 95969" },
  { label: "South LA", address: "3911 S Figueroa St, Los Angeles, CA 90037" },
];
const SAMPLES = [
  { id: "inspection", label: "Mitigation inspection report", file: "inspection_altadena.pdf" },
  { id: "application", label: "Agent application", file: "application_palisades.pdf" },
  { id: "nonrenewal", label: "Non-renewal letter (not a property doc)", file: "nonrenewal_letter.pdf" },
];
const FORM_FEATURES: FeatureKey[] = ["roof", "eaves", "vents", "windows", "outbuilding", "type", "siding", "deck", "fence"];

export default function UnderwriteDesk() {
  const [address, setAddress] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [lookupErr, setLookupErr] = useState<string | null>(null);
  const [looking, setLooking] = useState(false);

  const [home, setHome] = useState<Home>(DEFAULT_HOME);
  const [yearBuilt, setYearBuilt] = useState<number | null>(1955);
  const [sqft, setSqft] = useState(1800);
  const [extraction, setExtraction] = useState<(Extraction & { file: string }) | null>(null);
  const [extracting, setExtracting] = useState<string | null>(null);
  const [extractErr, setExtractErr] = useState<string | null>(null);

  const [a, setA] = useState(DEFAULT_ASSUMPTIONS);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [memo, setMemo] = useState("");
  const [memoBusy, setMemoBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fullHome: Home = { ...home, era: eraFromYear(yearBuilt) };
  const hazard: Hazard | null = lookup?.hazard ?? null;
  const result = useMemo(() => (hazard ? underwrite(fullHome, hazard, sqft, a) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hazard, JSON.stringify(fullHome), sqft, a]);
  const sc = score(fullHome);

  async function runLookup(addr: string) {
    setAddress(addr); setLooking(true); setLookupErr(null); setMemo("");
    try {
      const r = await fetch(`/api/lookup?address=${encodeURIComponent(addr)}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Lookup failed");
      setLookup(j);
    } catch (e) {
      setLookupErr(e instanceof Error ? e.message : "Lookup failed"); setLookup(null);
    } finally { setLooking(false); }
  }

  // Shareable demo links: /underwrite?address=... runs the lookup on load.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("address");
    if (q) void Promise.resolve().then(() => runLookup(q));
  }, []);

  async function runExtract(body: FormData | { sample: string }, tag: string) {
    setExtracting(tag); setExtractErr(null); setMemo("");
    try {
      const r = body instanceof FormData
        ? await fetch("/api/extract", { method: "POST", body })
        : await fetch("/api/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Extraction failed");
      const x = j.extraction as Extraction;
      setExtraction({ ...x, file: j.file });
      if (x.is_property_document) {
        const next = { ...home };
        for (const f of FORM_FEATURES) {
          const v = (x[f as keyof Extraction] as FieldX).value;
          next[f] = f === "type" && v === "unknown" ? home.type : v;
        }
        setHome(next);
        if (x.year_built.value) setYearBuilt(x.year_built.value);
        if (x.sqft.value) setSqft(x.sqft.value);
      }
    } catch (e) {
      setExtractErr(e instanceof Error ? e.message : "Extraction failed");
    } finally { setExtracting(null); }
  }

  async function runMemo() {
    if (!result || !lookup) return;
    setMemoBusy(true); setMemo("");
    const caseFile = {
      property: { address: lookup.matched, zip: lookup.zip, census_tract: lookup.tract, year_built: yearBuilt, living_area_sqft: sqft },
      location_hazard: {
        fema_wildfire_loss_per_1000_building_value: +(lookup.hazard.lossRate * 1000).toFixed(3),
        fema_wildfire_risk_rating: lookup.hazard.rating,
        calfire_hazard_zone: lookup.zone.status === "ok" ? (lookup.zone.level ?? "outside mapped zones") : "lookup unavailable",
        fires_within_1km_since_1950: lookup.firesWithin1km,
        zip_market: lookup.market && {
          fair_plan_share_2022: pct(lookup.market.fair_share_2022, 1), fair_plan_homes: lookup.market.units_fair,
          nonrenewal_rate_2023: lookup.market.nonrenew_rate_2023 == null ? null : pct(lookup.market.nonrenew_rate_2023, 1),
          cdi_distressed_area: lookup.market.distressed,
        },
      },
      construction: Object.fromEntries([...FORM_FEATURES, "era" as FeatureKey].map((f) => [FEATURE_LABEL[f], {
        value: labelOf(f, fullHome[f]),
        scored_by_model: MODEL.scoreFeatures.includes(f),
        source_quote: extraction?.is_property_document ? ((extraction[f as keyof Extraction] as FieldX | undefined)?.quote || null) : null,
      }])),
      other_mitigation_from_documents: extraction?.is_property_document ? extraction.other_mitigation : [],
      model_output: {
        chance_destroyed_if_fire_reaches: pct(result.before.p, 0),
        average_inspected_home: pct(MODEL.pAverageHome, 0),
        vulnerability_vs_average: `${result.before.vulnerability.toFixed(2)}x`,
      },
      pricing_as_is: {
        coverage_a: usd(result.before.coverageA), wildfire_loss_cost_per_1000: `$${result.before.wildfirePer1k.toFixed(2)}`,
        wildfire_expected_annual_loss: usd(result.before.wildfireEAL), technical_premium: usd(result.before.premium),
        hazard_floor_applied: result.before.floorApplied,
      },
      appetite_max_wildfire_loss_cost_per_1000: `$${a.maxWildfirePer1k.toFixed(2)}`,
      decision: result.decision, decision_reasons: result.reasons,
      conditions_to_bind: result.conditions.map((c) => ({
        mitigation: c.m.title, estimated_cost: `${usdK(c.m.costLow)}–${usdK(c.m.costHigh)}`,
        wildfire_loss_cost_per_1000_after: `$${c.per1kAfter.toFixed(2)}`, technical_premium_after: usd(c.premiumAfter),
      })),
      pricing_assumptions: a,
    };
    try {
      const r = await fetch("/api/memo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(caseFile) });
      if (!r.body) throw new Error("No response");
      const reader = r.body.getReader(); const dec = new TextDecoder();
      let acc = "";
      for (;;) { const { done, value } = await reader.read(); if (done) break; acc += dec.decode(value, { stream: true }); setMemo(acc); }
    } catch {
      setMemo("[Memo request failed.]");
    } finally { setMemoBusy(false); }
  }

  const flags: string[] = [];
  if (lookup) {
    const recent = lookup.firesWithin1km.filter((f) => f.year >= 2017);
    if (recent.length && lookup.hazard.lossRate * 1000 < 0.1) flags.push(`FEMA models near-zero wildfire loss here, yet the ${recent[0].year} ${recent[0].name} fire burned within 1 km. Historical hazard likely understates this location.`);
    if (lookup.zone.status === "ok" && !lookup.zone.level && recent.length) flags.push("Outside any mapped CAL FIRE hazard zone, but inside or next to a recent fire perimeter.");
    if (lookup.zone.status !== "ok") flags.push("CAL FIRE hazard zone lookup was unavailable; check the zone manually.");
    if (result?.before.floorApplied) flags.push("Hazard floor applied: the tract's modeled loss is below your floor.");
  }

  return (
    <div className="grid lg:grid-cols-[1fr_420px] gap-5 items-start">
      <div className="space-y-5">
        <Section n="1" title="Location">
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (address.trim()) runLookup(address.trim()); }}>
            <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, CA ZIP" className="flex-1" aria-label="Address" />
            <button className="px-4 py-1.5 rounded-lg bg-ember text-white font-medium disabled:opacity-50" disabled={looking}>{looking ? "Looking up…" : "Look up"}</button>
          </form>
          <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted items-center">
            Try an area:
            {EXAMPLES.map((e) => <button key={e.label} className="underline underline-offset-2 hover:text-ink" onClick={() => runLookup(e.address)}>{e.label}</button>)}
            <span className="text-muted/80">(public landmark addresses)</span>
          </div>
          {lookupErr && <p className="mt-3 text-sm text-decline">{lookupErr}</p>}
          {lookup && (
            <div className="mt-4 space-y-3">
              <div className="text-sm"><span className="text-muted">Matched:</span> {lookup.matched} <span className="text-muted">· tract {lookup.tract ?? "?"}</span></div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <Metric label="FEMA wildfire loss" value={`$${(lookup.hazard.lossRate * 1000).toFixed(2)}`} sub={`per $1K · ${lookup.hazard.rating ?? "n/a"}`} />
                <Metric label="CAL FIRE zone" value={lookup.zone.status !== "ok" ? "Unavailable" : lookup.zone.level ?? "None"} sub={lookup.zone.area ? `${lookup.zone.area} area` : lookup.zone.status === "ok" ? "outside mapped zones" : ""} />
                <Metric label="FAIR Plan share (ZIP)" value={lookup.market ? pct(lookup.market.fair_share_2022, 1) : "–"} sub={lookup.market ? `${lookup.market.units_fair.toLocaleString()} homes, 2022` : ""} />
                <Metric label="Non-renewals (ZIP)" value={lookup.market?.nonrenew_rate_2023 != null ? pct(lookup.market.nonrenew_rate_2023, 1) : "–"} sub="voluntary market, 2023" />
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                {lookup.market?.distressed && <Pill tone="ember">CDI distressed area · counts toward 85% commitment</Pill>}
                {lookup.firesStatus !== "ok" && <Pill>Fire history unavailable</Pill>}
                {lookup.firesWithin1km.slice(0, 5).map((f, i) => <Pill key={i}>{f.year} {f.name} fire · {f.acres.toLocaleString()} ac · within 1 km</Pill>)}
                {lookup.firesStatus === "ok" && !lookup.firesWithin1km.length && <Pill>No recorded fire within 1 km since 1950</Pill>}
              </div>
              {flags.map((f, i) => <p key={i} className="text-sm bg-cond-soft text-cond rounded-lg px-3 py-2">⚑ {f}</p>)}
            </div>
          )}
        </Section>

        <Section n="2" title="Construction" aside={<span className="text-xs text-muted">Fill by hand, or let AI read a document</span>}>
          <div className="rounded-lg border border-dashed border-line p-3 bg-surface-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Read a document</span>
              <button className="px-3 py-1 rounded-md border border-line bg-surface disabled:opacity-50" disabled={!!extracting}
                onClick={() => fileRef.current?.click()}>{extracting === "upload" ? "Reading…" : "Upload PDF"}</button>
              <input ref={fileRef} type="file" accept="application/pdf" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.append("file", f); runExtract(fd, "upload"); } e.target.value = ""; }} />
              <span className="text-muted text-xs">or a fictional sample:</span>
              {SAMPLES.map((s) => (
                <span key={s.id} className="inline-flex items-center gap-1">
                  <button className="px-2 py-1 rounded-md bg-surface border border-line text-xs disabled:opacity-50" disabled={!!extracting}
                    onClick={() => runExtract({ sample: s.id }, s.id)}>{extracting === s.id ? "Reading…" : s.label}</button>
                  <a href={`/samples/${s.file}`} target="_blank" className="text-xs text-muted underline" title="Open the PDF">pdf</a>
                </span>
              ))}
            </div>
            <p className="text-xs text-muted mt-2">Claude reads the PDF into the fields below and quotes the line behind each value. Nothing is stored.</p>
            {extractErr && <p className="text-sm text-decline mt-2">{extractErr}</p>}
            {extraction && (
              <div className="mt-3 text-sm">
                {extraction.is_property_document ? (
                  <p><b>{extraction.file}</b> read as <i>{extraction.document_type}</i>. Fields updated; hover a quote mark to see the source line.</p>
                ) : (
                  <p className="text-cond"><b>{extraction.file}</b> is a {extraction.document_type}, not a description of the home. Nothing was filled in.</p>
                )}
                {extraction.is_property_document && extraction.other_mitigation.length > 0 && (
                  <div className="mt-2"><span className="label">Also in the document (not priced)</span>
                    <ul className="list-disc pl-5 text-xs text-muted mt-1">{extraction.other_mitigation.map((m, i) => <li key={i}>{m.item} <span className="italic">“{m.quote}”</span></li>)}</ul></div>
                )}
                {extraction.conflicts.length > 0 && <p className="text-xs text-cond mt-2">Check: {extraction.conflicts.join(" · ")}</p>}
              </div>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-x-5 gap-y-3 mt-4">
            {FORM_FEATURES.map((f) => {
              const q = extraction?.is_property_document ? (extraction[f as keyof Extraction] as FieldX | undefined) : undefined;
              const scored = MODEL.scoreFeatures.includes(f);
              return (
                <label key={f} className="block text-sm">
                  <span className="flex items-center gap-1.5 mb-1">
                    {FEATURE_LABEL[f]}
                    {!scored && <span className="text-[10px] text-muted border border-line rounded px-1" title={MODEL.notCredible[f]}>recorded, not priced</span>}
                    {q?.quote && <span className="text-info cursor-help text-xs" title={`p.${q.page ?? "?"}: “${q.quote}”`}>❝ source</span>}
                  </span>
                  <select className="w-full" value={home[f]} onChange={(e) => setHome({ ...home, [f]: e.target.value })}>
                    {CHOICES[f].map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </label>
              );
            })}
            <label className="block text-sm"><span className="block mb-1">Year built {extraction?.is_property_document && extraction.year_built.quote && <span className="text-info text-xs cursor-help" title={`“${extraction.year_built.quote}”`}>❝ source</span>}</span>
              <input type="number" className="w-full" value={yearBuilt ?? ""} min={1850} max={2026} onChange={(e) => setYearBuilt(e.target.value ? Number(e.target.value) : null)} /></label>
            <label className="block text-sm"><span className="block mb-1">Living area, sq ft {extraction?.is_property_document && extraction.sqft.quote && <span className="text-info text-xs cursor-help" title={`“${extraction.sqft.quote}”`}>❝ source</span>}</span>
              <input type="number" className="w-full" value={sqft} min={300} max={15000} step={50} onChange={(e) => setSqft(Number(e.target.value) || 0)} /></label>
          </div>
        </Section>

        <Section title="Pricing assumptions" aside={<button className="text-sm text-ember" onClick={() => setShowAssumptions(!showAssumptions)}>{showAssumptions ? "Hide" : "Show"}</button>}>
          {showAssumptions ? <AssumptionsPanel a={a} onChange={setA} /> :
            <p className="text-sm text-muted">Appetite ${a.maxWildfirePer1k.toFixed(2)} per $1K · uplift {a.uplift}× on FEMA · floor ${a.floorRatePer1k.toFixed(2)} · cat load {Math.round(a.catLoad * 100)}% · expenses {Math.round(a.expenseRatio * 100)}% · rebuild ${a.costPerSqft}/sq ft</p>}
        </Section>
      </div>

      {/* result panel */}
      <div className="lg:sticky lg:top-4 space-y-4">
        <div className="card p-5">
          <div className="label mb-2">Decision</div>
          {!result ? (
            <p className="text-sm text-muted">Look up an address to price this home. Construction changes update the result instantly.</p>
          ) : (
            <div className="space-y-4">
              <DecisionBadge d={result.decision} large />
              <ul className="text-sm text-muted">{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
              <div className="grid grid-cols-2 gap-4">
                <Metric label="Technical premium" value={usd(result.before.premium)} sub="per year, as-is" />
                <Metric label="Coverage A" value={usdK(result.before.coverageA)} sub={`${sqft.toLocaleString()} sq ft × $${a.costPerSqft}`} />
                <Metric label="Wildfire loss cost" value={`$${result.before.wildfirePer1k.toFixed(2)}`} sub={`per $1K · appetite $${a.maxWildfirePer1k.toFixed(2)}`}
                  tone={result.before.wildfirePer1k > a.maxWildfirePer1k ? "decline" : "accept"} />
                <Metric label="Wildfire expected loss" value={usd(result.before.wildfireEAL)} sub="per year" />
              </div>
              <AppetiteBar value={result.before.wildfirePer1k} after={result.conditions.length ? result.after.wildfirePer1k : null} max={a.maxWildfirePer1k} />
            </div>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-baseline justify-between">
            <div className="label">If a fire reaches this home</div>
            <span className="text-xs text-muted">average inspected home: {pct(MODEL.pAverageHome)}</span>
          </div>
          <div className="text-3xl font-semibold num mt-1">{pct(sc.p)} <span className="text-base font-normal text-muted">chance it is destroyed</span></div>
          <div className="mt-3 space-y-1.5">
            {sc.contributions.map((c) => {
              const rel = Math.exp(c.b - coefficient(c.feature, "unknown"));
              const worse = rel > 1.02, better = rel < 0.98;
              return (
                <div key={c.feature} className="flex items-center gap-2 text-sm">
                  <span className="w-32 shrink-0 text-muted">{FEATURE_LABEL[c.feature]}</span>
                  <span className="flex-1 truncate">{labelOf(c.feature, c.value)}</span>
                  <span className={`num text-xs w-24 text-right ${worse ? "text-decline" : better ? "text-accept" : "text-muted"}`}>
                    {c.value === "unknown" ? "avg (unknown)" : `${worse ? "▲" : better ? "▼" : "·"} odds ×${rel.toFixed(2)}`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted mt-2">Odds relative to the average inspected home, holding the fire fixed. Walls, decks and fences are recorded but not priced: post-fire inspections can&apos;t measure them reliably.</p>
        </div>

        {result && result.conditions.length > 0 && (
          <div className="card p-5">
            <div className="label mb-2">{result.decision === "decline" ? "Best available mitigation (still above appetite)" : "Conditions to bind"}</div>
            <ol className="space-y-3">
              {result.conditions.map((c, i) => (
                <li key={c.m.id} className="text-sm">
                  <div className="flex justify-between gap-2"><span className="font-medium">{i + 1}. {c.m.title}</span><span className="num text-muted">{usdK(c.m.costLow)}–{usdK(c.m.costHigh)}</span></div>
                  <div className="text-xs text-muted">{c.m.why} After: ${c.per1kAfter.toFixed(2)}/1K, premium {usd(c.premiumAfter)}, destroyed-if-reached {pct(c.pAfter)}.</div>
                </li>
              ))}
            </ol>
            <p className="text-xs text-muted mt-3">Picked by risk reduction per retrofit dollar. Cost ranges are planning assumptions, not quotes.</p>
          </div>
        )}

        {result && (
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <div className="label">Referral memo</div>
              <button className="text-sm px-3 py-1 rounded-md bg-ember text-white disabled:opacity-50" onClick={runMemo} disabled={memoBusy}>{memoBusy ? "Writing…" : memo ? "Rewrite" : "Draft with AI"}</button>
            </div>
            {memo ? <div className="mt-3"><MiniMarkdown text={memo} /></div> :
              <p className="text-xs text-muted mt-2">Claude drafts the file memo from the numbers on this page only; it is told not to add figures.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function AppetiteBar({ value, after, max }: { value: number; after: number | null; max: number }) {
  const top = Math.max(max * 2, value * 1.1, 1);
  const x = (v: number) => `${Math.min(100, (v / top) * 100)}%`;
  return (
    <div>
      <div className="relative h-2.5 rounded-sm bg-surface-2 border border-line">
        <div className="absolute inset-y-0 left-0 rounded-sm bg-accept-soft" style={{ width: x(max) }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-ink/60" style={{ left: x(max) }} title="appetite" />
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-surface" style={{ left: x(value), background: value > max ? "var(--st-crit)" : "var(--st-good)" }} />
        {after != null && <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-surface" style={{ left: x(after), background: "var(--st-good)" }} />}
      </div>
      <div className="flex justify-between text-[11px] text-muted mt-1"><span>$0</span><span>appetite ${max.toFixed(2)}</span><span>${top.toFixed(2)}</span></div>
      {after != null && <p className="text-[11px] text-muted">● as-is ${value.toFixed(2)} → after conditions ${after.toFixed(2)}</p>}
    </div>
  );
}
