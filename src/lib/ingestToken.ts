// Apple Watch import tokens. The token is made in the browser and shown once; only its SHA-256 hash is stored
// (ingest_tokens.token_hash). The health-ingest Edge Function hashes the x-ingest-token header the same way.

/** 32 random bytes as base64url without padding (43 characters). */
export function newIngestToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 of the token text, lower-case hex. Must match supabase/functions/health-ingest/parse.ts. */
export async function hashIngestToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The Edge Function URL to paste into the Shortcut, or null when the app has no Supabase URL. */
export function ingestEndpoint(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/health-ingest`;
}
