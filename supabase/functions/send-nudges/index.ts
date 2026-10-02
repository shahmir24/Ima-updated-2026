/**
 * send-nudges — the Deno entry point. Wiring only; the whole run is in
 * handler.ts, which is unit tested.
 *
 * Who can run it: only a caller presenting the SERVICE ROLE key as its bearer
 * token (a scheduler, later). Gateway JWT verification stays on in
 * config.toml, and the handler then compares the token with the service-role
 * key itself, so the anon key and user sessions are refused. There are no CORS
 * headers: no browser page can call it.
 *
 * Secrets (Supabase function secrets / injected by the Edge Runtime):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   injected by the runtime
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * Any of them missing or malformed: the function answers 503 and claims
 * nothing. None of them is ever logged or returned.
 */
import { handleSendNudgesRequest, NUDGE_TOPIC, NUDGE_TTL_SECONDS, type SendNudgesLogEvent } from './handler.ts';
import { createPostgrestNudgeStore } from './store.ts';
import { createVapidRequestBuilder } from '../_shared/web-push.ts';
import { isVapidConfigValid } from '../_shared/push-subscription.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const vapid = {
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
};

const configured = isVapidConfigValid(vapid) && /^https:\/\/\S+$/.test(supabaseUrl);

const store = createPostgrestNudgeStore({ supabaseUrl, serviceRoleKey: serviceRoleKey ?? '' });
const buildRequest = createVapidRequestBuilder(vapid, { ttlSeconds: NUDGE_TTL_SECONDS, topic: NUDGE_TOPIC, urgency: 'normal' });

/** Outcome and counts only: no user, task, endpoint, header or key. */
function log(event: SendNudgesLogEvent): void {
  const counts =
    event.claimed === undefined
      ? ''
      : ` claimed=${event.claimed} sent=${event.sent} no_devices=${event.noDevices} failed=${event.failed}`;
  console.log(`send-nudges ${event.status} ${event.outcome}${counts}`);
}

Deno.serve((request: Request) =>
  handleSendNudgesRequest(request, { serviceRoleKey, configured, store, buildRequest, fetchImpl: fetch, log })
);
