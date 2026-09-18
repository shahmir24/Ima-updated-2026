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
 * IMA_ALLOWED_ORIGINS is a comma-separated list of exact origins, each of which
 * may contain one `*` inside the hostname for Vercel preview deployments — they
 * get a fresh hostname per push and can otherwise never be allow-listed. The
 * value this project deploys with is:
 *
 *   https://ima-updated-2026.vercel.app,https://ima-updated-2026-*.vercel.app
 *
 * Note what that is NOT: `https://*.vercel.app` would admit every site on
 * vercel.app, strangers' included. Anchoring the wildcard between the project
 * name and the suffix keeps it to hostnames Vercel only mints for this project.
 */
export function resolveAllowedOrigins(configured: string | null | undefined): string[] {
  const extra = (configured ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return [...DEFAULT_ALLOWED_ORIGINS, ...extra];
}

const HTTPS = 'https://';

/**
 * Matches an origin against one `https://<before>*<after>` entry.
 *
 * The `*` stands for one or more host characters with NO DOT among them, so it
 * can never span a label boundary. That single rule is what stops the usual
 * tricks:
 *
 *   entry   https://ima-updated-2026-*.vercel.app
 *   yes     https://ima-updated-2026-abc123-acme.vercel.app   (preview build)
 *   yes     https://ima-updated-2026-git-my-branch.vercel.app (branch build)
 *   no      https://ima-updated-2026-x.evil.vercel.app        (* would span a dot)
 *   no      https://ima-updated-2026.vercel.app.evil.com      (wrong suffix)
 *   no      https://evil.com/.vercel.app                      (not a bare origin)
 *   no      https://someone-elses-project.vercel.app          (wrong prefix)
 *   no      http://ima-updated-2026-abc.vercel.app            (not https)
 *
 * Narrowing further is possible without a code change: Vercel puts the account
 * or team slug in the last label before .vercel.app, so an entry of
 * `https://ima-updated-2026-*-<scope>.vercel.app` also fits this one-star form.
 */
function matchesWildcard(origin: string, entry: string): boolean {
  if (!entry.startsWith(HTTPS)) return false;

  const star = entry.indexOf('*');
  if (star === -1) return false;
  // Exactly one wildcard. Belt and braces: an origin can never contain a `*`
  // once the host check below has run, so a two-star entry would match nothing
  // anyway. Refusing the malformed entry outright is clearer than relying on
  // that, and it keeps the two rules independent.
  if (entry.indexOf('*', star + 1) !== -1) return false;

  const before = entry.slice(0, star);
  const after = entry.slice(star + 1);
  // The entry must stay anchored on the right by at least one real label, or
  // `https://x*` would match any https origin at all.
  if (!after.includes('.')) return false;

  // A bare origin only: scheme plus host. Anything carrying a path, a port, a
  // query or credentials is refused before the prefix/suffix test, so a string
  // like `https://evil.com/.vercel.app` cannot reach it.
  if (!/^[a-z0-9.-]+$/.test(origin.slice(HTTPS.length))) return false;

  // `before` begins with https:// because the entry does, so matching it also
  // proves the origin's scheme — there is no separate check for that.
  if (!origin.startsWith(before) || !origin.endsWith(after)) return false;
  // A non-empty middle, and one that cannot overlap the two anchors.
  if (origin.length <= before.length + after.length) return false;

  const middle = origin.slice(before.length, origin.length - after.length);
  return !middle.includes('.');
}

/** Exact match, or one `https://<before>*<after>` wildcard entry. */
export function isOriginAllowed(origin: string, allowed: readonly string[]): boolean {
  for (const entry of allowed) {
    if (entry === origin) return true;
    if (matchesWildcard(origin, entry)) return true;
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
