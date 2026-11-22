// Write an underwriting memo from numbers the app already computed. Streams plain text.
import Anthropic from "@anthropic-ai/sdk";

export const maxDuration = 120;

const SYSTEM = `You are a senior homeowners underwriter at a California insurer writing a file memo for a referral.

You receive a JSON case file computed by the underwriting tool. Write the memo from that file only.
- Every number in the memo must appear in the case file. Do not compute new figures and do not invent costs, discounts, rates or facts about the property.
- If something an underwriter would want is missing from the file, say it is missing.
- Structure, with these exact headings: Recommendation, Location and hazard, Construction, Pricing, Conditions to bind, Open questions.
- Plain English, short paragraphs or bullets, under 350 words. No preamble before the first heading. Markdown headings with ##.
- The vulnerability model is statistical (CAL FIRE damage inspections); describe its outputs as estimates, not certainties.`;

export async function POST(request: Request) {
  let caseFile: unknown;
  try {
    caseFile = await request.json();
  } catch {
    return Response.json({ error: "Bad request." }, { status: 400 });
  }
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: "claude-opus-5-5",
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium" },
    system: SYSTEM,
    messages: [{ role: "user", content: `Case file:\n\n${JSON.stringify(caseFile, null, 2)}` }],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") controller.enqueue(encoder.encode("\n\n[The model declined to write this memo.]"));
      } catch (error) {
        const msg =
          error instanceof Anthropic.AuthenticationError ? "No valid Anthropic API key on the server (set ANTHROPIC_API_KEY)."
          : error instanceof Anthropic.RateLimitError ? "Rate limited by the Claude API. Try again shortly."
          : error instanceof Anthropic.APIError ? `Claude API error ${error.status}.`
          : error instanceof Error && /api key|apiKey|authentication/i.test(error.message) ? "No Anthropic API key on the server (set ANTHROPIC_API_KEY)."
          : "Memo generation failed.";
        controller.enqueue(encoder.encode(`\n\n[${msg}]`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
