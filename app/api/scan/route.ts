import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { normalizeCard } from "@/lib/normalize";
import {
  CARD_JSON_SCHEMA,
  CARD_PROMPT,
  EMPTY_CARD,
  cardFieldsSchema,
} from "@/lib/schema";

// Gemini vision on a photo runs a few seconds; the platform default of 10s is
// uncomfortably close to that on a cold start.
export const maxDuration = 30;

/** Rejects oversized payloads before spending a Gemini call on them. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

/** Turns a data URL or bare base64 string into raw base64. */
function stripDataUrlPrefix(image: string): string {
  const comma = image.indexOf(",");
  return image.startsWith("data:") && comma !== -1 ? image.slice(comma + 1) : image;
}

/** "45 seconds", "4 minutes", "2 hours" — whichever reads naturally. */
function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const hours = Math.round(minutes / 60);
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Maps an upstream Gemini failure to something the person holding the phone can
 * act on.
 *
 * A single "Couldn't read that card" for every cause is untriageable: a dead API
 * key, an exhausted quota and a blurry photo need completely different
 * responses, and only one of them is the user's to fix.
 *
 * The classification reads `body` as well as `message`, because the SDK puts the
 * useful text only in `body`: a revoked key surfaces as a *400* whose message is
 * the useless "400 API error occurred", with "API key not valid" buried in the
 * body. Keying off the status alone would misfile it as a generic failure.
 *
 * The upstream text is never forwarded to the browser — it can echo the key.
 */
function describeGeminiError(error: unknown): { message: string; status: number } {
  const parts: string[] = [];
  if (error instanceof Error) parts.push(error.message);

  const raw = error as { status?: unknown; statusCode?: unknown; body?: unknown };
  if (typeof raw?.body === "string") parts.push(raw.body);
  else if (raw?.body) parts.push(JSON.stringify(raw.body));

  const haystack = parts.join(" ");
  const status =
    typeof raw?.status === "number"
      ? raw.status
      : typeof raw?.statusCode === "number"
        ? raw.statusCode
        : undefined;

  if (status === 429 || /quota|rate.?limit|RESOURCE_EXHAUSTED/i.test(haystack)) {
    // Gemini reports how long to wait ("Please retry in 44.58s"). Report that
    // figure and nothing more: the free tier has both a per-minute and a longer
    // limit, and naming the wrong one sends the user to wait out a window that
    // was never going to clear. The delay itself is the only honest signal.
    const retry = haystack.match(/retry in ([\d.]+)s/i);
    const seconds = retry ? Math.ceil(Number(retry[1])) : null;

    if (seconds === null) {
      return {
        message:
          "Gemini's rate limit has been reached. Wait a little and try again — or enable billing to remove the free-tier cap.",
        status: 429,
      };
    }

    // A wait beyond a minute cannot be the per-minute cap, so retrying is not
    // the answer and the message should not imply it is.
    const longWait = seconds > 90;
    return {
      message: `Gemini's rate limit has been reached — it says to retry in ${formatWait(seconds)}.${
        longWait ? " A wait this long means a daily cap, so enable billing to keep scanning today." : ""
      }`,
      status: 429,
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    /API[_ ]KEY[_ ]INVALID|API key not valid|permission denied|unauthenticated/i.test(
      haystack,
    )
  ) {
    return {
      message:
        "The server's Gemini key is missing, invalid or revoked. Check GEMINI_API_KEY in the Vercel settings.",
      status: 502,
    };
  }

  // Gemini's own 5xx. Blaming the photo here sends the user to retake a
  // perfectly good card for an outage they cannot do anything about.
  if (
    status === 500 ||
    status === 503 ||
    /internal error|INTERNAL|UNAVAILABLE|overloaded/i.test(haystack)
  ) {
    return {
      message: "Gemini had a problem at its end, not with your photo. Try again.",
      status: 502,
    };
  }

  return { message: "Couldn't read that card. Try again.", status: 502 };
}

export async function POST(request: Request) {
  let image: unknown;
  try {
    ({ image } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (typeof image !== "string" || image.length === 0) {
    return NextResponse.json({ error: "No image supplied." }, { status: 400 });
  }

  const base64 = stripDataUrlPrefix(image);

  // base64 inflates bytes by ~4/3; compare against the encoded length.
  if (base64.length * 0.75 > MAX_IMAGE_BYTES) {
    return NextResponse.json(
      { error: "That photo is too large. Try again." },
      { status: 413 },
    );
  }

  let apiKey: string;
  try {
    apiKey = requireEnv("GEMINI_API_KEY");
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Server is not configured." },
      { status: 500 },
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  let rawOutput: string | undefined;
  try {
    const interaction = await ai.interactions.create({
      model: "gemini-3.5-flash",
      input: [
        { type: "text", text: CARD_PROMPT },
        { type: "image", data: base64, mime_type: "image/jpeg" },
      ],
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: CARD_JSON_SCHEMA,
      },
      generation_config: {
        // Gemini 3 thinks before answering by default, which buys nothing when
        // the task is transcription — there is no reasoning to do, only text to
        // read. Measured on a sample card: 5.2s -> 4.1s, with identical output.
        thinking_level: "minimal",
      },
    });
    rawOutput = interaction.output_text;
  } catch (error) {
    console.error("Gemini request failed:", error);
    const { message, status } = describeGeminiError(error);
    return NextResponse.json({ error: message }, { status });
  }

  if (!rawOutput) {
    console.error("Gemini returned no text output.");
    return NextResponse.json(
      { error: "Couldn't read that card. Try again." },
      { status: 502 },
    );
  }

  // The schema makes malformed output unlikely, not impossible. Validate so a
  // surprise surfaces as a clean error rather than a broken form.
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOutput);
  } catch {
    console.error("Gemini output was not JSON:", rawOutput.slice(0, 200));
    return NextResponse.json(
      { error: "Couldn't read that card. Try again." },
      { status: 502 },
    );
  }

  const result = cardFieldsSchema.safeParse(parsed);
  if (!result.success) {
    console.error("Gemini output did not match schema:", result.error.issues);
    return NextResponse.json(
      { error: "Couldn't read that card. Try again." },
      { status: 502 },
    );
  }

  const fields = normalizeCard(result.data);
  const foundSomething = Object.values(fields).some((v) => v !== "");

  return NextResponse.json({
    fields: foundSomething ? fields : EMPTY_CARD,
    // Lets the UI say "nothing readable here" instead of showing a blank form
    // that looks like a bug.
    empty: !foundSomething,
  });
}
