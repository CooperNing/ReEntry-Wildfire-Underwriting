/* eslint-disable @typescript-eslint/no-explicit-any */
// Quick distribution check of decisions on the demo applicant pool (no server-only import).
import apps from "../data/applicants.json";
import tracts from "../data/tract_hazard.json";
import { underwrite, DEFAULT_ASSUMPTIONS } from "../lib/pricing";
import { eraFromYear } from "../lib/model";
const T = tracts as any;
const res = { accept: 0, conditional: 0, decline: 0 } as Record<string, number>;
let prem = 0, eal = 0; const per1k: number[] = []; const vul: number[] = [];
for (const r of apps as any[]) {
  const home = { roof: r.roof, eaves: r.eaves, vents: r.vents, siding: r.siding, windows: r.windows, deck: r.deck, fence: r.fence, outbuilding: r.outbuilding, type: r.type, era: r.era ?? eraFromYear(r.year_built) };
  const t = T[r.tract];
  const d = underwrite(home, { tract: r.tract, lossRate: t?.wf_loss_rate ?? 0, riskScore: null, rating: null }, r.sqft, DEFAULT_ASSUMPTIONS);
  res[d.decision]++; per1k.push(d.before.wildfirePer1k); vul.push(d.before.vulnerability);
  if (d.decision !== "decline") { prem += d.after.premium; eal += d.after.wildfireEAL; }
}
const q = (a: number[], p: number) => a.slice().sort((x, y) => x - y)[Math.floor(p * (a.length - 1))].toFixed(2);
console.log(res, "premium", Math.round(prem), "wf EAL", Math.round(eal));
console.log("wf per1k p10/50/90", q(per1k, .1), q(per1k, .5), q(per1k, .9), " vulnerability p10/50/90", q(vul, .1), q(vul, .5), q(vul, .9));
