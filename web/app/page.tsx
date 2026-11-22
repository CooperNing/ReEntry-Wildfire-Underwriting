import Link from "next/link";
import { ZIPS } from "@/lib/data";
import report from "@/data/model_report.json";

const fmt = (n: number) => n.toLocaleString("en-US");

export default function Home() {
  const fair = ZIPS.reduce((s, z) => s + z.units_fair, 0);
  const fairDistressed = ZIPS.filter((z) => z.distressed).reduce((s, z) => s + z.units_fair, 0);
  const lowHazard = ZIPS.filter((z) => (z.wf_loss_rate ?? 0) * 1000 < 0.1).reduce((s, z) => s + z.units_fair, 0);

  return (
    <div className="space-y-10">
      <section className="grid lg:grid-cols-[1.3fr_1fr] gap-8 items-end pt-4">
        <div>
          <p className="label text-ember! mb-3">For California home insurers</p>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]">
            Find the FAIR Plan homes you can write profitably.
          </h1>
          <p className="mt-4 text-lg text-muted max-w-2xl">
            Under California&apos;s Sustainable Insurance Strategy, insurers that price with catastrophe models must write at
            least 85% of their statewide share in wildfire-distressed areas. ReEntry shows where those homes are, scores each
            one against CAL FIRE damage inspections from {report.fires} fires ({report.years[0]}–{report.years[report.years.length - 1]}),
            and turns mitigation into a condition you can bind on.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/underwrite" className="px-4 py-2 rounded-lg bg-ember text-white font-medium">Underwrite a home</Link>
            <Link href="/book" className="px-4 py-2 rounded-lg border border-line bg-surface font-medium">Build a book from 1,200 applicants</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat value={fmt(fair)} label="homes on the FAIR Plan (CDI, 2022)" />
          <Stat value={fmt(fairDistressed)} label="of them in CDI distressed areas, where commitments count" />
          <Stat value={fmt(lowHazard)} label="in ZIPs with almost no modeled wildfire loss" accent />
          <Stat value={fmt(report.rows)} label={`inspected homes from ${report.fires} fires train the vulnerability model`} />
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-4">
        <Tool href="/market" step="1" title="Market"
          text="Every California ZIP: FAIR Plan share, non-renewal trend, FEMA wildfire loss, home values and CDI distressed status. Size your 85% commitment and see where the easy and hard re-entries are." />
        <Tool href="/underwrite" step="2" title="Underwrite a home"
          text="Address lookup against CAL FIRE hazard zones and fire history. AI reads the inspection report and quotes the line behind every feature. Get a technical premium, a decision, and the cheapest mitigation that makes the home writable." />
        <Tool href="/book" step="3" title="Build a book"
          text="Run 1,200 real homes that survived the 2025 Eaton and Palisades fires through your appetite. See premium, expected loss, how much rides on one repeat fire, and how many policies count toward the commitment." />
      </section>

      <section className="card p-6 grid md:grid-cols-2 gap-6">
        <div>
          <h2 className="font-semibold text-lg">What the data says</h2>
          <ul className="mt-3 space-y-3 text-sm">
            <li><b>Construction matters inside the same fire.</b> Holding the fire fixed, tile roofs cut the odds of destruction by about 45%, enclosed eaves by 36%, 1/8-inch vents by 43%, multi-pane windows by 47%. Homes built under the 2008 wildfire code: 45% lower.</li>
            <li><b>The FAIR Plan is not only a wildfire problem.</b> Large FAIR Plan populations sit in ZIPs where FEMA models almost no wildfire loss. Those are the cheapest homes to win back.</li>
            <li><b>Historical hazard maps missed 2025.</b> Many homes inside the Eaton fire sit outside any mapped hazard zone and in tracts FEMA scores near zero. ReEntry floors and flags them.</li>
          </ul>
        </div>
        <div>
          <h2 className="font-semibold text-lg">How it is built</h2>
          <ul className="mt-3 space-y-3 text-sm text-muted">
            <li><b className="text-ink">Vulnerability:</b> logistic regression with a fixed effect per fire, trained on CAL FIRE inspections where every feature was actually observed (unknowns leak the outcome and are excluded). Validated by holding out whole fires.</li>
            <li><b className="text-ink">Hazard:</b> FEMA National Risk Index wildfire loss by census tract, with a forward-looking uplift and a floor you control.</li>
            <li><b className="text-ink">AI:</b> Claude reads inspection reports and applications into the model&apos;s fields with a verbatim quote for each, and drafts the referral memo from the computed numbers only.</li>
          </ul>
          <Link href="/model" className="inline-block mt-4 text-sm text-ember font-medium">Read the model card →</Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "bg-ember-soft! border-transparent!" : ""}`}>
      <div className={`text-2xl font-semibold num ${accent ? "text-ember" : ""}`}>{value}</div>
      <div className="text-xs text-muted mt-1 leading-snug">{label}</div>
    </div>
  );
}

function Tool({ href, step, title, text }: { href: string; step: string; title: string; text: string }) {
  return (
    <Link href={href} className="card p-5 hover:border-ember transition-colors block">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-ember-soft text-ember text-xs font-semibold grid place-items-center">{step}</span>
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm text-muted mt-2">{text}</p>
    </Link>
  );
}
