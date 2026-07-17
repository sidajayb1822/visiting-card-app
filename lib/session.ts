/**
 * Signed session cookie for the passcode gate.
 *
 * Built on Web Crypto rather than node:crypto so the same code runs in both the
 * Edge middleware and the Node route handlers.
 *
 * The cookie is `<expiry-ms>.<hmac>`. It carries no secret — forging one means
 * forging the HMAC — so it is safe to hand to the browser.
 */

export const SESSION_COOKIE = "cs_session";

/** How long an unlock lasts before the passcode is asked for again. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function hmac(secret: string, message: string): Promise<string> {
  const key = await importKey(secret);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toBase64Url(signature);
}

/**
 * Compares two strings in time independent of how far they match, so a caller
 * cannot discover the expected value one character at a time.
 */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function createSessionToken(secret: string): Promise<string> {
  const expiry = String(Date.now() + SESSION_TTL_MS);
  return `${expiry}.${await hmac(secret, expiry)}`;
}

export async function isValidSessionToken(
  secret: string,
  token: string | undefined,
): Promise<boolean> {
  if (!token) return false;

  const separator = token.indexOf(".");
  if (separator === -1) return false;

  const expiry = token.slice(0, separator);
  const signature = token.slice(separator + 1);

  if (!/^\d+$/.test(expiry)) return false;
  if (!safeEqual(signature, await hmac(secret, expiry))) return false;

  return Number(expiry) > Date.now();
}
