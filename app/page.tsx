import { cookies } from "next/headers";
import Scanner from "@/components/Scanner";
import { SESSION_COOKIE, isValidSessionToken } from "@/lib/session";

// The unlock state depends on a cookie, so this must render per request.
export const dynamic = "force-dynamic";

export default async function Home() {
  const secret = process.env.SESSION_SECRET;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  // Checked here rather than in the browser because the cookie is httpOnly and
  // deliberately unreadable by client script. Failing closed on a missing
  // secret just means the passcode screen shows; /api/unlock reports the real
  // misconfiguration.
  const unlocked = secret ? await isValidSessionToken(secret, token) : false;

  return <Scanner unlocked={unlocked} />;
}
