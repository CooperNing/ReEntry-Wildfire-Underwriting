import { ZIPS } from "@/lib/data";
import MarketView, { type MarketRow } from "./MarketView";

export const metadata = { title: "Market · ReEntry" };

export default function MarketPage() {
  const rows: MarketRow[] = ZIPS.filter((z) => z.lat != null && z.lon != null).map((z) => ({
    zip: z.zip, city: z.city, county: z.county, lat: z.lat!, lon: z.lon!,
    fair: z.units_fair, total: z.units_total, share: z.fair_share_2022,
    nonrenew: z.nonrenew_rate_2023, newChange: z.new_policy_change_20_23,
    wfPer1k: (z.wf_loss_rate ?? 0) * 1000, risk: z.wf_risk_score,
    value: z.home_value, destroyed: z.homes_destroyed,
    distressed: z.distressed, undermarketed: z.undermarketed_zip,
  }));
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Where the FAIR Plan homes are</h1>
        <p className="text-muted mt-1 max-w-3xl">
          {rows.length.toLocaleString()} California ZIP codes. FAIR Plan counts are dwelling units insured in 2022 (CDI). Wildfire loss
          is FEMA&apos;s expected annual building loss per $1,000 of building value, before any uplift. Distressed status is the CDI
          list of March 6, 2025: undermarketed ZIPs plus distressed counties.
        </p>
      </header>
      <MarketView rows={rows} />
    </div>
  );
}
