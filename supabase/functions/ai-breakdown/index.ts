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
 * no table.
 *
 * OPENAI_API_KEY is read here only to hand to the provider module, which is
 * the one place that uses it. It is never logged, never returned and never
 * reaches the browser. With AI_BREAKDOWN_PROVIDER unset the key is not used
 * at all, because the stub provider never asks for it.
 */
import { handleBreakdownRequest, type BreakdownLogEvent } from './handler.ts';
import { createSupabaseUserResolver } from '../_shared/auth.ts';
import { resolveAllowedOrigins } from '../_shared/http.ts';
import { createStepProvider } from '../_shared/provider.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const allowedOrigins = resolveAllowedOrigins(Deno.env.get('IMA_ALLOWED_ORIGINS'));

const resolveUser = createSupabaseUserResolver({ supabaseUrl, anonKey });

/**
 * Built once at boot. AI_BREAKDOWN_PROVIDER decides: unset or 'stub' keeps the
 * deterministic placeholder steps, 'openai' generates, and anything else
 * becomes a provider that always fails rather than one that quietly stubs.
 * The browser has no say in this and cannot see which is running.
 */
const provider = createStepProvider({
  mode: Deno.env.get('AI_BREAKDOWN_PROVIDER'),
  apiKey: Deno.env.get('OPENAI_API_KEY'),
  model: Deno.env.get('AI_BREAKDOWN_MODEL')
});

/** Counts and codes only. No headers, no token, no body, no task text. */
function log(event: BreakdownLogEvent): void {
  console.log(
    `ai-breakdown ${event.method} ${event.status} ${event.outcome} ${event.durationMs}ms`
  );
}

Deno.serve((request: Request) =>
  handleBreakdownRequest(request, { resolveUser, allowedOrigins, provider, log })
);
