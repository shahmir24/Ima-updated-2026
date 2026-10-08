/**
 * transcribe-capture — the Deno entry point. Wiring only; the lifecycle is in
 * handler.ts, which is unit tested.
 *
 * Environment (Supabase function secrets / injected by the Edge Runtime):
 *   SUPABASE_URL, SUPABASE_ANON_KEY   injected; used only to verify the session
 *   IMA_ALLOWED_ORIGINS               the same allow-list ai-breakdown uses
 *   AI_TRANSCRIBE_PROVIDER            'stub' (default when unset) or 'openai'
 *   AI_TRANSCRIBE_MODEL               optional model override
 *   OPENAI_API_KEY                    read only to hand to the provider; never
 *                                     logged, returned or sent to the browser
 *
 * SUPABASE_SERVICE_ROLE_KEY is deliberately never read: this function touches
 * no table. Gateway JWT verification stays on (config.toml).
 */
import { handleTranscribeRequest, type TranscribeLogEvent } from './handler.ts';
import { createSupabaseUserResolver } from '../_shared/auth.ts';
import { resolveAllowedOrigins } from '../_shared/http.ts';
import { createTranscribeProvider } from '../_shared/transcribe-provider.ts';

const resolveUser = createSupabaseUserResolver({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  anonKey: Deno.env.get('SUPABASE_ANON_KEY') ?? ''
});
const allowedOrigins = resolveAllowedOrigins(Deno.env.get('IMA_ALLOWED_ORIGINS'));
const provider = createTranscribeProvider({
  mode: Deno.env.get('AI_TRANSCRIBE_PROVIDER'),
  apiKey: Deno.env.get('OPENAI_API_KEY'),
  model: Deno.env.get('AI_TRANSCRIBE_MODEL')
});

/** Counts and codes only. Never audio, a transcript, a header or a token. */
function log(event: TranscribeLogEvent): void {
  const counts =
    (event.audioBytes === undefined ? '' : ` audio_bytes=${event.audioBytes}`) +
    (event.transcriptChars === undefined ? '' : ` transcript_chars=${event.transcriptChars}`);
  console.log(`transcribe-capture ${event.method} ${event.status} ${event.outcome} ${event.durationMs}ms${counts}`);
}

Deno.serve((request: Request) => handleTranscribeRequest(request, { resolveUser, allowedOrigins, provider, log }));
