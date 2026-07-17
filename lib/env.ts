/**
 * Reads a required server-side environment variable.
 *
 * Throws rather than falling back to a default: a missing GEMINI_API_KEY or
 * SESSION_SECRET should fail the request loudly at the boundary, not surface
 * later as a confusing 500 or, worse, an unlocked app.
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Set it in .env.local for local dev, or in the Vercel project settings.`,
    );
  }
  return value;
}
