import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/session";

/**
 * Gates the two routes that cost money or write data. Without this, anyone who
 * finds the deployment URL could spend the Gemini quota and append rows to the
 * Sheet.
 *
 * /api/unlock is deliberately not matched — it is how you get a session.
 */
export const config = {
  matcher: ["/api/scan", "/api/submit"],
};

export async function proxy(request: NextRequest) {
  const secret = process.env.SESSION_SECRET;

  // Fail closed. A deployment missing its secret must not serve an open API.
  if (!secret) {
    return NextResponse.json(
      { error: "Server is not configured." },
      { status: 500 },
    );
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!(await isValidSessionToken(secret, token))) {
    return NextResponse.json({ error: "Locked." }, { status: 401 });
  }

  return NextResponse.next();
}
