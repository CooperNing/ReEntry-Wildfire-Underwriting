// Address -> location, census tract, wildfire hazard, CAL FIRE hazard zone, nearby fire history, ZIP market.
import { tractHazard, zipInfo } from "@/lib/data";

const CENSUS = "https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress";
const FHSZ = "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/fhsz24_1/FeatureServer/0/query";
const PERIMETERS = "https://services1.arcgis.com/jUJYIo9tSA7EHvfZ/arcgis/rest/services/California_Historic_Fire_Perimeters/FeatureServer/0/query";

async function getJson(url: string, ms = 12000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} from ${new URL(url).host}`);
  return r.json();
}

const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());

function pointQuery(base: string, lon: number, lat: number, extra: Record<string, string>) {
  const p = new URLSearchParams({
    geometry: `${lon},${lat}`, geometryType: "esriGeometryPoint", inSR: "4326",
    spatialRel: "esriSpatialRelIntersects", returnGeometry: "false", f: "json", ...extra,
  });
  return `${base}?${p}`;
}

export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) return Response.json({ error: "Enter an address." }, { status: 400 });

  const q = new URLSearchParams({
    address, benchmark: "Public_AR_Current", vintage: "Census2020_Current", layers: "Census Tracts", format: "json",
  });
  let geo;
  try {
    geo = await getJson(`${CENSUS}?${q}`, 15000);
  } catch {
    return Response.json({ error: "The Census geocoder did not respond. Try again in a moment." }, { status: 502 });
  }
  const m = geo?.result?.addressMatches?.[0];
  if (!m) return Response.json({ error: "No match for that address. Include city and ZIP." }, { status: 404 });
  const lon: number = m.coordinates.x, lat: number = m.coordinates.y;
  const tractRow = m.geographies?.["Census Tracts"]?.[0];
  const tract: string | null = tractRow?.GEOID ?? null;
  const zip: string | null = m.addressComponents?.zip ?? null;
  if (m.addressComponents?.state !== "CA") {
    return Response.json({ error: "Only California addresses are covered." }, { status: 400 });
  }

  const [fhsz, fires] = await Promise.allSettled([
    getJson(pointQuery(FHSZ, lon, lat, { outFields: "SRA,FHSZ_Description" })),
    getJson(pointQuery(PERIMETERS, lon, lat, {
      outFields: "YEAR_,FIRE_NAME,GIS_ACRES", distance: "1000", units: "esriSRUnit_Meter", orderByFields: "YEAR_ DESC",
    })),
  ]);

  const zone = fhsz.status === "fulfilled"
    ? (fhsz.value.features?.[0]?.attributes
        ? { status: "ok", level: fhsz.value.features[0].attributes.FHSZ_Description as string, area: fhsz.value.features[0].attributes.SRA as string }
        : { status: "ok", level: null, area: null })
    : { status: "unavailable", level: null, area: null };

  type Fire = { year: number; name: string; acres: number };
  const fireList: Fire[] = fires.status === "fulfilled"
    ? (fires.value.features ?? [])
        .map((f: { attributes: { YEAR_: number; FIRE_NAME: string | null; GIS_ACRES: number } }) => ({
          year: f.attributes.YEAR_, name: titleCase((f.attributes.FIRE_NAME ?? "Unnamed").trim()), acres: Math.round(f.attributes.GIS_ACRES ?? 0),
        }))
        .filter((f: Fire) => f.year >= 1950)
    : [];

  return Response.json({
    matched: m.matchedAddress as string,
    lat, lon, tract, zip,
    hazard: tractHazard(tract),
    zone,
    firesWithin1km: fireList,
    firesStatus: fires.status === "fulfilled" ? "ok" : "unavailable",
    market: zipInfo(zip),
  });
}
