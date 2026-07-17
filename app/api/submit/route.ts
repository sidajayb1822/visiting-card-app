import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import { cardFieldsSchema } from "@/lib/schema";

export const maxDuration = 30;

/**
 * Forwards a reviewed card to the Apps Script web app, which appends it to the
 * Sheet.
 *
 * This hop exists for two reasons: it keeps APPS_SCRIPT_SECRET off the phone,
 * and Apps Script answers with a cross-origin redirect to googleusercontent.com
 * that a browser fetch would refuse on CORS. Server-side, the redirect is
 * followed without complaint.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const result = cardFieldsSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: "Invalid card data." }, { status: 400 });
  }

  let url: string;
  let secret: string;
  try {
    url = requireEnv("APPS_SCRIPT_URL");
    secret = requireEnv("APPS_SCRIPT_SECRET");
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Server is not configured." },
      { status: 500 },
    );
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      // Apps Script rejects a preflight on application/json; text/plain is what
      // it expects, and doPost reads the raw body either way.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ secret, ...result.data }),
      redirect: "follow",
    });
  } catch (error) {
    console.error("Apps Script request failed:", error);
    return NextResponse.json(
      { error: "Couldn't reach the sheet. Try again." },
      { status: 502 },
    );
  }

  const text = await response.text();

  if (!response.ok) {
    console.error("Apps Script returned", response.status, text.slice(0, 300));
    return NextResponse.json(
      { error: "Couldn't save to the sheet. Try again." },
      { status: 502 },
    );
  }

  // Apps Script answers 200 even when doPost throws, so the body is the only
  // reliable signal of what actually happened.
  let payload: { ok?: boolean; error?: string };
  try {
    payload = JSON.parse(text);
  } catch {
    console.error("Apps Script returned non-JSON:", text.slice(0, 300));
    return NextResponse.json(
      {
        error:
          "The sheet script returned an unexpected response. Check its deployment.",
      },
      { status: 502 },
    );
  }

  if (!payload.ok) {
    console.error("Apps Script rejected the write:", payload.error);
    return NextResponse.json(
      { error: "The sheet script rejected the write." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
