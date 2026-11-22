// Read an inspection report / application PDF and extract the construction features the model uses.
// Every value must come with a verbatim quote from the document, so the underwriter can check it.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const maxDuration = 120;

const SAMPLES: Record<string, string> = {
  inspection: "inspection_altadena.pdf",
  application: "application_palisades.pdf",
  nonrenewal: "nonrenewal_letter.pdf",
};

const field = <T extends [string, ...string[]]>(values: T) =>
  z.object({
    value: z.enum(values),
    quote: z.string().describe("Exact words copied from the document that support the value. Empty string if the value is unknown."),
    page: z.number().int().nullable().describe("1-based page number of the quote, or null."),
  });

const Extraction = z.object({
  is_property_document: z.boolean().describe("True only if the document describes the physical construction of a home."),
  document_type: z.string().describe("Short description, e.g. 'mitigation inspection report'."),
  roof: field(["tile", "metal", "asphalt", "wood", "other", "unknown"]),
  eaves: field(["enclosed", "open", "none", "unknown"]),
  vents: field(["fine", "coarse", "unscreened", "none", "unknown"]),
  windows: field(["multi", "single", "unknown"]),
  siding: field(["noncombustible", "ignition_resistant", "combustible", "unknown"]),
  deck: field(["none", "masonry", "composite", "wood", "unknown"]),
  fence: field(["none", "noncombustible", "combustible", "unknown"]),
  outbuilding: field(["none_or_unknown", "lt30", "30to50", "gt50"]),
  type: field(["single_story", "multi_story", "mobile", "unknown"]),
  year_built: z.object({ value: z.number().int().nullable(), quote: z.string(), page: z.number().int().nullable() }),
  sqft: z.object({ value: z.number().int().nullable(), quote: z.string(), page: z.number().int().nullable() }),
  other_mitigation: z.array(z.object({ item: z.string(), quote: z.string() }))
    .describe("Mitigation facts the model does not score (defensible space, Zone 0, Firewise site, gutter guards...)."),
  conflicts: z.array(z.string()).describe("Places where the document contradicts itself or is ambiguous."),
});

const SYSTEM = `You read documents for a property insurance underwriter and fill a fixed form about a home's wildfire construction features.

Rules:
- Use only what the document states. Never infer from region, era or typical construction. If a feature is not stated, the value is "unknown" (for outbuilding use "none_or_unknown") and the quote is "".
- Every non-unknown value needs a quote copied word for word from the document.
- Mapping: concrete or clay tile -> tile. Composition / asphalt shingle -> asphalt. Wood shake or shingle -> wood.
  Boxed soffits -> enclosed eaves. Exposed rafter tails -> open.
  Vent mesh of 1/8 inch or finer, or vents sold as ember- and flame-resistant -> fine. Mesh larger than 1/8 inch -> coarse.
  Dual-, double- or multi-pane glass -> multi. If windows are mixed, use the condition of most windows.
  Stucco, cement plaster, brick, fiber cement, metal walls -> noncombustible. Wood or vinyl siding -> combustible.
  Elevated deck material -> deck; a patio at grade is not an elevated deck.
  Fence: the part of the fence that touches the house decides (metal gate at the house -> noncombustible).
  Outbuilding: distance from the house to the nearest shed/garage/outbuilding; none stated -> none_or_unknown.
  Stories: 1 -> single_story, 2+ -> multi_story; mobile or manufactured home -> mobile.
- If the document is not about a home's physical construction (a letter, a bill), set is_property_document to false and every field to unknown.`;

export async function POST(request: Request) {
  let pdf: Buffer;
  let name: string;
  const ct = request.headers.get("content-type") ?? "";
  try {
    if (ct.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) return Response.json({ error: "No file uploaded." }, { status: 400 });
      if (file.type !== "application/pdf") return Response.json({ error: "Upload a PDF." }, { status: 400 });
      if (file.size > 15 * 1024 * 1024) return Response.json({ error: "PDF is larger than 15 MB." }, { status: 400 });
      pdf = Buffer.from(await file.arrayBuffer());
      name = file.name;
    } else {
      const { sample } = (await request.json()) as { sample?: string };
      const fname = sample ? SAMPLES[sample] : undefined;
      if (!fname) return Response.json({ error: "Unknown sample." }, { status: 400 });
      pdf = await readFile(path.join(process.cwd(), "public", "samples", fname));
      name = fname;
    }
  } catch {
    return Response.json({ error: "Could not read the upload." }, { status: 400 });
  }

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: betaZodOutputFormat(Extraction) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
            { type: "text", text: "Fill the form for this document." },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") {
      return Response.json({ error: "The model declined to read this document." }, { status: 422 });
    }
    if (!response.parsed_output) {
      return Response.json({ error: "The model's answer could not be parsed. Try again." }, { status: 502 });
    }
    return Response.json({ file: name, model: response.model, extraction: response.parsed_output });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "No valid Anthropic API key on the server (set ANTHROPIC_API_KEY)." }, { status: 503 });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json({ error: "Rate limited by the Claude API. Try again shortly." }, { status: 429 });
    }
    if (error instanceof Anthropic.BadRequestError) {
      return Response.json({ error: `Claude API rejected the request: ${error.message}` }, { status: 400 });
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json({ error: `Claude API error ${error.status}` }, { status: 502 });
    }
    if (error instanceof Error && /api key|apiKey|authentication/i.test(error.message)) {
      return Response.json({ error: "No Anthropic API key on the server (set ANTHROPIC_API_KEY)." }, { status: 503 });
    }
    throw error;
  }
}
