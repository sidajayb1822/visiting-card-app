import { NextResponse } from "next/server";
import { requireEnv } from "@/lib/env";
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  safeEqual,
} from "@/lib/session";

/** Trades the passcode for a signed session cookie. */
export async function POST(request: Request) {
  let passcode: unknown;
  try {
    ({ passcode } = await request.json());
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  if (typeof passcode !== "string" || passcode.length === 0) {
    return NextResponse.json({ error: "Enter the passcode." }, { status: 400 });
  }

  let expected: string;
  let secret: string;
  try {
    expected = requireEnv("APP_PASSCODE");
    secret = requireEnv("SESSION_SECRET");
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Server is not configured." },
      { status: 500 },
    );
  }

  if (!safeEqual(passcode, expected)) {
    return NextResponse.json({ error: "Wrong passcode." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(secret),
    httpOnly: true, // keeps the cookie out of reach of any script on the page
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  });
  return response;
}
