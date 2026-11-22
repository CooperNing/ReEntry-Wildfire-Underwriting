// Pricing and underwriting decision. Every number that is a business assumption lives in
// Assumptions so the UI can show and change it.
import { FeatureKey, Home, MODEL, score } from "./model";

export type Assumptions = {
  costPerSqft: number;        // rebuild cost, $ per sq ft (Coverage A = sqft x this)
  uplift: number;             // forward-looking multiplier on FEMA's historical wildfire loss rate
  floorRatePer1k: number;     // minimum wildfire loss cost, $ per $1,000 of Coverage A
  catLoad: number;            // reinsurance / catastrophe capital load on wildfire expected loss
  basePer1k: number;          // non-wildfire perils loss cost, $ per $1,000 (from filed rates)
  expenseRatio: number;       // acquisition + admin + profit, share of premium
  maxWildfirePer1k: number;   // appetite: highest wildfire loss cost we will write, $ per $1,000
  declineMobile: boolean;
  declineWoodRoof: boolean;
};

export const DEFAULT_ASSUMPTIONS: Assumptions = {
  costPerSqft: 550,
  uplift: 2.0,
  floorRatePer1k: 0.3,
  catLoad: 0.6,
  basePer1k: 1.1,
  expenseRatio: 0.3,
  maxWildfirePer1k: 2.0,
  declineMobile: true,
  declineWoodRoof: true,
};

export const ASSUMPTION_INFO: Record<keyof Assumptions, string> = {
  costPerSqft: "Rebuild cost per square foot used to set Coverage A. LA post-2025 contractor quotes commonly run $400–$700.",
  uplift: "FEMA's National Risk Index is built from historical losses and misses urban conflagration. Under the Sustainable Insurance Strategy an insurer may price with a forward-looking catastrophe model; this multiplier stands in for that model.",
  floorRatePer1k: "Some tracts that burned in 2025 show zero wildfire loss in FEMA data. The floor keeps every home inside a burned footprint from pricing at zero.",
  catLoad: "Load on wildfire expected loss for reinsurance and catastrophe capital (correlated losses).",
  basePer1k: "Expected loss from fire (non-wildfire), water, theft and liability, per $1,000 of Coverage A. Replace with your filed base rate.",
  expenseRatio: "Commission, admin and profit as a share of premium.",
  maxWildfirePer1k: "Appetite. Homes whose wildfire loss cost is above this are written only if required mitigation brings them under it.",
  declineMobile: "Mobile and manufactured homes have 3.2x the odds of destruction in the inspection data.",
  declineWoodRoof: "Wood shake roofs have 2.4x the odds of destruction and are a common carrier exclusion.",
};

export type Hazard = {
  tract: string | null;
  lossRate: number;          // FEMA NRI expected annual building loss per $ of building value
  riskScore: number | null;  // NRI wildfire risk score (0–100, national percentile)
  rating: string | null;
};

export type Quote = {
  p: number;                 // P(destroyed | fire reaches)
  vulnerability: number;     // vs. average inspected home
  coverageA: number;
  hazardPer1k: number;       // area wildfire loss cost per $1k for an average home, after uplift/floor
  floorApplied: boolean;
  wildfirePer1k: number;     // this home's wildfire loss cost per $1k
  wildfireEAL: number;       // $ per year
  basePremiumLoss: number;   // non-wildfire expected loss, $ per year
  premium: number;           // technical premium, $ per year
};

export function quote(home: Home, hazard: Hazard, sqft: number, a: Assumptions): Quote {
  const { p } = score(home);
  const vulnerability = p / MODEL.pAverageHome;
  const coverageA = Math.round(sqft * a.costPerSqft);
  const raw = hazard.lossRate * 1000 * a.uplift;
  const floorApplied = raw < a.floorRatePer1k;
  const hazardPer1k = Math.max(raw, a.floorRatePer1k);
  const wildfirePer1k = hazardPer1k * vulnerability;
  const wildfireEAL = (wildfirePer1k * coverageA) / 1000;
  const basePremiumLoss = (a.basePer1k * coverageA) / 1000;
  const premium = (wildfireEAL * (1 + a.catLoad) + basePremiumLoss) / (1 - a.expenseRatio);
  return { p, vulnerability, coverageA, hazardPer1k, floorApplied, wildfirePer1k, wildfireEAL, basePremiumLoss, premium };
}

export type Mitigation = {
  id: string;
  feature: FeatureKey;
  to: string;
  title: string;
  why: string;
  costLow: number;
  costHigh: number;
  applies: (h: Home) => boolean;
};

// Retrofit cost ranges are rough planning figures (assumptions), to be replaced by vendor quotes.
export const MITIGATIONS: Mitigation[] = [
  {
    id: "vents", feature: "vents", to: "fine", title: "Ember-resistant vents (1/8 in mesh)",
    why: "Embers enter attics through coarse or unscreened vents.",
    costLow: 500, costHigh: 3000,
    applies: (h) => ["coarse", "unscreened", "unknown"].includes(h.vents),
  },
  {
    id: "eaves", feature: "eaves", to: "enclosed", title: "Enclose open eaves",
    why: "Open eaves trap heat and embers under the roofline.",
    costLow: 3000, costHigh: 12000,
    applies: (h) => ["open", "unknown"].includes(h.eaves),
  },
  {
    id: "windows", feature: "windows", to: "multi", title: "Multi-pane (tempered) windows",
    why: "Single-pane glass breaks from radiant heat and lets fire inside.",
    costLow: 8000, costHigh: 30000,
    applies: (h) => ["single", "unknown"].includes(h.windows),
  },
  {
    id: "outbuilding", feature: "outbuilding", to: "none_or_unknown", title: "Remove or relocate shed beyond 50 ft",
    why: "A burning shed next to the house acts as a second ignition source.",
    costLow: 1000, costHigh: 8000,
    applies: (h) => ["lt30", "30to50", "gt50"].includes(h.outbuilding),
  },
  {
    id: "roof", feature: "roof", to: "tile", title: "Class A tile / concrete roof",
    why: "The roof is the largest surface embers land on.",
    costLow: 25000, costHigh: 60000,
    applies: (h) => ["asphalt", "wood", "other", "unknown"].includes(h.roof),
  },
];

export type Decision = {
  decision: "accept" | "conditional" | "decline";
  reasons: string[];
  conditions: { m: Mitigation; per1kAfter: number; premiumAfter: number; pAfter: number }[];
  before: Quote;
  after: Quote;
};

export function underwrite(home: Home, hazard: Hazard, sqft: number, a: Assumptions): Decision {
  const before = quote(home, hazard, sqft, a);
  const reasons: string[] = [];
  if (a.declineMobile && home.type === "mobile") reasons.push("Mobile / manufactured home (outside appetite).");
  if (a.declineWoodRoof && home.roof === "wood") {
    // wood roof is curable: replacing it is a condition, not a hard decline
  }
  if (reasons.length) return { decision: "decline", reasons, conditions: [], before, after: before };

  const mustFix = a.declineWoodRoof && home.roof === "wood";
  if (before.wildfirePer1k <= a.maxWildfirePer1k && !mustFix) {
    return { decision: "accept", reasons: ["Wildfire loss cost within appetite."], conditions: [], before, after: before };
  }

  // Greedy: pick the mitigation with the largest risk reduction per dollar until under appetite.
  let cur: Home = { ...home };
  let curQ = before;
  const conditions: Decision["conditions"] = [];
  const used = new Set<string>();
  if (mustFix) {
    const roof = MITIGATIONS.find((m) => m.id === "roof")!;
    cur = { ...cur, roof: roof.to };
    curQ = quote(cur, hazard, sqft, a);
    conditions.push({ m: roof, per1kAfter: curQ.wildfirePer1k, premiumAfter: curQ.premium, pAfter: curQ.p });
    used.add("roof");
  }
  while (curQ.wildfirePer1k > a.maxWildfirePer1k) {
    let best: { m: Mitigation; q: Quote; h: Home; value: number } | null = null;
    for (const m of MITIGATIONS) {
      if (used.has(m.id) || !m.applies(cur)) continue;
      const h = { ...cur, [m.feature]: m.to } as Home;
      const q = quote(h, hazard, sqft, a);
      const gain = curQ.wildfireEAL - q.wildfireEAL;
      if (gain <= 0) continue;
      const value = gain / ((m.costLow + m.costHigh) / 2);
      if (!best || value > best.value) best = { m, q, h, value };
    }
    if (!best) break;
    used.add(best.m.id);
    cur = best.h;
    curQ = best.q;
    conditions.push({ m: best.m, per1kAfter: curQ.wildfirePer1k, premiumAfter: curQ.premium, pAfter: curQ.p });
  }
  if (curQ.wildfirePer1k <= a.maxWildfirePer1k) {
    return {
      decision: "conditional",
      reasons: [mustFix ? "Wood shake roof must be replaced before binding." : "Above appetite as-is; within appetite after required mitigation."],
      conditions, before, after: curQ,
    };
  }
  return {
    decision: "decline",
    reasons: ["Wildfire loss cost stays above appetite even after every available mitigation."],
    conditions, before, after: curQ,
  };
}

export const usd = (n: number, digits = 0) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits });
export const usdK = (n: number) =>
  Math.abs(n) >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : Math.abs(n) >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : Math.abs(n) >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;
