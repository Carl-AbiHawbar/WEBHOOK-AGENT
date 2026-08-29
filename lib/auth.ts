/**
 * Shared-password gate.
 *
 * The cookie holds a SHA-256 of the password rather than the password itself, so a
 * stolen cookie does not hand over the password you may have reused elsewhere.
 * Web Crypto is used because this also runs in the proxy's edge runtime.
 */
export const AUTH_COOKIE = "lf_auth";

export async function authToken(password: string): Promise<string> {
  const bytes = new TextEncoder().encode(`lead-finder:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Length-independent comparison, to avoid leaking the token through timing. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
