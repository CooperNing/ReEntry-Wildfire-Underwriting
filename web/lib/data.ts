// Server-side data access (large JSON stays on the server; pages pass trimmed slices to the client).
import "server-only";
import tracts from "@/data/tract_hazard.json";
import zips from "@/data/zip_market.json";
import applicantsRaw from "@/data/applicants.json";
import { eraFromYear, Home } from "./model";
import type { Hazard } from "./pricing";

type TractRow = { county: string; wf_loss_rate: number; wf_freq: number; wf_risk_score: number; wf_rating: string };
const TRACTS = tracts as unknown as Record<string, TractRow>;

export type ZipRow = {
  zip: string; county: string; city: string;
  units_voluntary: number; units_fair: number; units_total: number; fair_share_2022: number;
  nonrenew_rate_2020: number | null; nonrenew_rate_2023: number | null;
  new_2020: number | null; new_2023: number | null; new_policy_change_20_23: number | null;
  wf_loss_rate: number | null; wf_risk_score: number | null; wf_risk_score_max: number | null;
  lat: number | null; lon: number | null; home_value: number | null;
  homes_inspected: number; homes_destroyed: number;
  undermarketed_zip: boolean; distressed_county: boolean; distressed: boolean;
};
export const ZIPS = zips as unknown as ZipRow[];
const ZIP_INDEX = new Map(ZIPS.map((z) => [z.zip, z]));

export function tractHazard(tract: string | null | undefined): Hazard {
  const t = tract ? TRACTS[tract] : undefined;
  return {
    tract: tract ?? null,
    lossRate: t?.wf_loss_rate ?? 0,
    riskScore: t?.wf_risk_score ?? null,
    rating: t?.wf_rating ?? null,
  };
}

export function zipInfo(zip: string | null | undefined): ZipRow | null {
  return zip ? ZIP_INDEX.get(zip) ?? null : null;
}

export type Applicant = {
  id: string; fire: string; zip: string; city: string; lat: number; lon: number;
  sqft: number; yearBuilt: number | null; home: Home; hazard: Hazard; distressed: boolean;
};

type RawApp = {
  id: string; fire: string; zip: string; city: string; tract: string; lat: number; lon: number;
  sqft: number; year_built: number | null; roof: string; eaves: string; vents: string; siding: string;
  windows: string; deck: string; fence: string; outbuilding: string; type: string; era: string;
};

export function applicants(): Applicant[] {
  return (applicantsRaw as unknown as RawApp[]).map((r) => ({
    id: r.id, fire: r.fire, zip: r.zip, city: r.city, lat: r.lat, lon: r.lon, sqft: r.sqft,
    yearBuilt: r.year_built,
    home: {
      roof: r.roof, eaves: r.eaves, vents: r.vents, siding: r.siding, windows: r.windows, deck: r.deck,
      fence: r.fence, outbuilding: r.outbuilding, type: r.type, era: r.era ?? eraFromYear(r.year_built),
    },
    hazard: tractHazard(r.tract),
    distressed: zipInfo(r.zip)?.distressed ?? false,
  }));
}
