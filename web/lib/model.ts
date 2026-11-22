// Structure vulnerability model: P(home destroyed | an average California wildfire reaches it).
// Coefficients come from scripts/train_model.py (CAL FIRE damage inspections 2013–2025).
import model from "@/data/model.json";

export type FeatureKey =
  | "roof" | "eaves" | "vents" | "windows" | "siding" | "deck" | "fence" | "outbuilding" | "type" | "era";

export type Home = Record<FeatureKey, string>;

type LevelStats = {
  b: number; or: number; or_lo: number; or_hi: number; n: number; share: number;
  destroyed_rate: number; credible: boolean; evidence: string;
};
type FeatureStats = { label: string; levels: Record<string, LevelStats> };

const FEATURES = model.features as unknown as Record<string, FeatureStats>;
const SCORE_FEATURES = model.score_features as FeatureKey[];

export const MODEL = {
  intercept: model.intercept,
  pAverageHome: model.p_mean_inspected_home,
  scoreFeatures: SCORE_FEATURES,
  notCredible: model.not_credible as Record<string, string>,
  features: FEATURES,
};

/** Choices shown in the UI, in display order. "unknown" is marginalised, never learned. */
export const CHOICES: Record<FeatureKey, { value: string; label: string }[]> = {
  roof: [
    { value: "tile", label: "Tile / concrete" },
    { value: "metal", label: "Metal" },
    { value: "asphalt", label: "Asphalt shingle" },
    { value: "wood", label: "Wood shake" },
    { value: "other", label: "Other" },
    { value: "unknown", label: "Not known" },
  ],
  eaves: [
    { value: "enclosed", label: "Enclosed (boxed)" },
    { value: "open", label: "Open (rafters visible)" },
    { value: "none", label: "No eaves" },
    { value: "unknown", label: "Not known" },
  ],
  vents: [
    { value: "fine", label: "Mesh ≤ 1/8 in (ember-resistant)" },
    { value: "coarse", label: "Mesh > 1/8 in" },
    { value: "unscreened", label: "No screen" },
    { value: "none", label: "No vents" },
    { value: "unknown", label: "Not known" },
  ],
  windows: [
    { value: "multi", label: "Multi-pane" },
    { value: "single", label: "Single-pane" },
    { value: "unknown", label: "Not known" },
  ],
  siding: [
    { value: "noncombustible", label: "Stucco / brick / fiber cement" },
    { value: "ignition_resistant", label: "Ignition-resistant" },
    { value: "combustible", label: "Wood / vinyl" },
    { value: "unknown", label: "Not known" },
  ],
  deck: [
    { value: "none", label: "No elevated deck" },
    { value: "masonry", label: "Masonry / concrete" },
    { value: "composite", label: "Composite" },
    { value: "wood", label: "Wood" },
    { value: "unknown", label: "Not known" },
  ],
  fence: [
    { value: "none", label: "No fence attached" },
    { value: "noncombustible", label: "Metal / masonry" },
    { value: "combustible", label: "Wood / vinyl" },
    { value: "unknown", label: "Not known" },
  ],
  outbuilding: [
    { value: "none_or_unknown", label: "None" },
    { value: "lt30", label: "Under 30 ft" },
    { value: "30to50", label: "30–50 ft" },
    { value: "gt50", label: "Over 50 ft" },
  ],
  type: [
    { value: "single_story", label: "Single-story" },
    { value: "multi_story", label: "Multi-story" },
    { value: "mobile", label: "Mobile / manufactured" },
  ],
  era: [
    { value: "2008_plus", label: "2008 or later (Chapter 7A code)" },
    { value: "1980_2007", label: "1980–2007" },
    { value: "1950_1979", label: "1950–1979" },
    { value: "pre1950", label: "Before 1950" },
    { value: "unknown", label: "Not known" },
  ],
};

export const FEATURE_LABEL: Record<FeatureKey, string> = {
  roof: "Roof covering", eaves: "Eaves", vents: "Attic / foundation vents", windows: "Windows",
  siding: "Exterior walls", deck: "Elevated deck", fence: "Fence touching house",
  outbuilding: "Nearest shed / outbuilding", type: "Structure type", era: "Year built",
};

export function labelOf(f: FeatureKey, v: string): string {
  return CHOICES[f].find((c) => c.value === v)?.label ?? v;
}

export function eraFromYear(y: number | null | undefined): string {
  if (!y || y < 1850 || y > 2026) return "unknown";
  if (y < 1950) return "pre1950";
  if (y < 1980) return "1950_1979";
  if (y < 2008) return "1980_2007";
  return "2008_plus";
}

/** Coefficient used for a feature value. Unknown -> share-weighted average of observed levels. */
export function coefficient(f: FeatureKey, v: string): number {
  const levels = FEATURES[f]?.levels;
  if (!levels) return 0;
  const lv = levels[v];
  if (lv && v !== "unknown") return lv.b;
  let s = 0, w = 0;
  for (const [k, l] of Object.entries(levels)) {
    if (k === "unknown") continue;
    s += l.b * l.share; w += l.share;
  }
  return w > 0 ? s / w : 0;
}

export type Contribution = { feature: FeatureKey; value: string; b: number; evidence: string };

export function score(home: Home): { p: number; logit: number; contributions: Contribution[] } {
  let z = MODEL.intercept;
  const contributions: Contribution[] = [];
  for (const f of SCORE_FEATURES) {
    const v = home[f] ?? "unknown";
    const b = coefficient(f, v);
    z += b;
    const ev = v === "unknown" ? "unknown" : FEATURES[f]?.levels[v]?.evidence ?? "unknown";
    contributions.push({ feature: f, value: v, b, evidence: ev });
  }
  return { p: 1 / (1 + Math.exp(-z)), logit: z, contributions };
}

/** How much more (or less) vulnerable than the average inspected home. */
export function vulnerability(home: Home): number {
  return score(home).p / MODEL.pAverageHome;
}

export const DEFAULT_HOME: Home = {
  roof: "asphalt", eaves: "open", vents: "coarse", windows: "single", siding: "noncombustible",
  deck: "none", fence: "none", outbuilding: "none_or_unknown", type: "single_story", era: "1950_1979",
};
