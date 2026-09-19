/**
 * Resolving a Supabase access token to a user.
 *
 * This calls GoTrue's /auth/v1/user directly with fetch rather than pulling in
 * the supabase-js client. Two reasons: it is the entire surface this function
 * needs (no table is read or written), and it keeps the module dependency-free
 * so it type-checks and unit-tests outside Deno like everything else here.
 *
 * The ANON key is used, never the service role. A service-role key bypasses
 * RLS, and a function that touches no table has no business holding one.
 * Verification is done by GoTrue: an expired, forged or revoked token comes
 * back as a non-2xx and is refused.
 */
import type { UserResolver } from '../ai-breakdown/handler.ts';

export interface UserResolverConfig {
  supabaseUrl: string;
  anonKey: string;
  /** Injectable purely so the HTTP call can be exercised in tests. */
  fetchImpl?: typeof fetch;
}

export function createSupabaseUserResolver(config: UserResolverConfig): UserResolver {
  const fetchImpl = config.fetchImpl ?? fetch;
  const endpoint = `${config.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`;

  return async (accessToken: string) => {
    if (!config.supabaseUrl || !config.anonKey) return { ok: false };

    let response: Response;
    try {
      response = await fetchImpl(endpoint, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: config.anonKey
        }
      });
    } catch {
      // A failure to reach the auth service is not a valid session. It is
      // reported as "not authenticated" rather than as a server error, and the
      // cause is deliberately not carried out of this function.
      return { ok: false };
    }

    if (!response.ok) return { ok: false };

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false };
    }

    if (typeof body !== 'object' || body === null) return { ok: false };
    const id = (body as { id?: unknown }).id;
    if (typeof id !== 'string' || id.length === 0) return { ok: false };

    // Only the id is carried forward. Email, metadata and app claims are not
    // needed by this endpoint and are dropped here rather than travelling on.
    return { ok: true, user: { id } };
  };
}
