/**
 * The small HTTP layer the Body Double AI function needs: an origin allow-list
 * and a JSON reply. Dependency-free and runtime-agnostic, so it can be unit
 * tested outside Deno.
 *
 * Nothing here knows about tasks, models or secrets.
 */

/**
 * Origins that are always allowed. Local development only, deliberately.
 *
 * The deployed origins are NOT baked in: this repository does not record the
 * real Vercel domain (docs/auth-configuration.md still carries a placeholder),
 * and guessing one would either be wrong or quietly widen access. They are
 * supplied at deploy time through IMA_ALLOWED_ORIGINS, which is configuration
 * rather than a secret. The safe failure is a blocked browser call, not an
 * open endpoint.
 */
export const DEFAULT_ALLOWED_ORIGINS: readonly string[] = [
  'http://localhost:8080',
  'http://127.0.0.1:8080'
];

/**
 * Merges the configured origins onto the local defaults.
 *
 * IMA_ALLOWED_ORIGINS is a comma-separated list of exact origins. A single
 * leading-label wildcard is accepted for Vercel preview deployments, which get
 * a fresh hostname per push and can otherwise never be allow-listed:
 *
 *   https://ima.example.com,https://*.vercel.app
 */
export function resolveAllowedOrigins(configured: string | null | undefined): string[] {
  const extra = (configured ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

/**
 * Exact match, or a `https://*.suffix` wildcard.
 *
 * The wildcard is kept deliberately tight: https only, at least one real
 * subdomain label, and a host of nothing but host characters — so a value like
 * `https://evil.com/.vercel.app` or `https://x.vercel.app.evil.com` cannot slip
 * through the suffix test.
 */
export function isOriginAllowed(origin: string, allowed: readonly string[]): boolean {
  for (const entry of allowed) {
    if (entry === origin) return true;

    const WILDCARD = 'https://*.';
    if (!entry.startsWith(WILDCARD)) continue;

    const suffix = entry.slice(WILDCARD.length);
    if (!suffix.includes('.')) continue;
    if (!origin.startsWith('https://')) continue;

    const host = origin.slice('https://'.length);
    if (!/^[a-z0-9.-]+$/.test(host)) continue;
    if (!host.endsWith(`.${suffix}`)) continue;
    // Require something in front of the dot, so `https://.vercel.app` fails.
    if (host.length > suffix.length + 1) return true;
  }
  return false;
}

/**
 * CORS headers for a reply.
 *
 * An unknown or absent Origin gets no Access-Control-Allow-Origin at all —
 * never a wildcard. `Vary: Origin` is always present so a cache cannot serve
 * one origin's allowance to another.
 *
 * No Access-Control-Allow-Credentials: this endpoint authenticates with a
 * bearer token, not a cookie, so it must not ask browsers to send cookies.
 */
export function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && isOriginAllowed(origin, allowed)) {
    headers['Access-Control-Allow-Origin'] = origin;
    // The headers supabase-js attaches to functions.invoke().
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Max-Age'] = '86400';
  }
  return headers;
}

export function jsonResponse(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Content-Type': 'application/json; charset=utf-8',
      // Replies are per-user and per-request; nothing may cache them.
      'Cache-Control': 'no-store'
    }
  });
}
