/**
 * ai-breakdown — the Deno entry point.
 *
 * Deliberately almost empty: the whole lifecycle is in handler.ts, which has
 * no runtime bindings and is unit tested. This file's only job is to wire the
 * real dependencies in, which is also why there is no branch in it. There is
 * no test mode, no debug flag and no way for a request to choose a different
 * user resolver.
 *
 * SUPABASE_URL and SUPABASE_ANON_KEY are injected by the Edge Runtime.
 * SUPABASE_SERVICE_ROLE_KEY is deliberately never read: this function touches
 * no table. OPENAI_API_KEY is deliberately never read either — no provider is
 * involved until step 4.
 */
import { handleBreakdownRequest, type BreakdownLogEvent } from './handler.ts';
import { createSupabaseUserResolver } from '../_shared/auth.ts';
import { resolveAllowedOrigins } from '../_shared/http.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const allowedOrigins = resolveAllowedOrigins(Deno.env.get('IMA_ALLOWED_ORIGINS'));

const resolveUser = createSupabaseUserResolver({ supabaseUrl, anonKey });

/** Counts and codes only. No headers, no token, no body, no task text. */
function log(event: BreakdownLogEvent): void {
  console.log(
    `ai-breakdown ${event.method} ${event.status} ${event.outcome} ${event.durationMs}ms`
  );
}

Deno.serve((request: Request) =>
  handleBreakdownRequest(request, { resolveUser, allowedOrigins, log })
);
