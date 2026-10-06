/**
 * send-nudges — the Deno entry point. Wiring only; the whole run is in
 * handler.ts, which is unit tested.
 *
 * Who can run it — two layers, both required (Supabase Cron):
 *   1. Gateway: verify_jwt = true (config.toml). Authorization must carry a
 *      valid project JWT, or the request never reaches this code.
 *   2. Application: the x-nudge-scheduler-secret header must equal
 *      NUDGE_SCHEDULER_SECRET, compared in constant time. Missing, malformed
 *      or wrong is 401; a missing or short (< 32 chars) secret switches the
 *      function off for everyone (503).
 * A user session or the anon key passes layer 1 and is stopped by layer 2.
 * There are no CORS headers: no browser page can call it.
 *
 * Three credentials, three jobs:
 *   Authorization JWT          satisfies the gateway. Never read here.
 *   NUDGE_SCHEDULER_SECRET     authenticates the scheduler. Nothing else.
 *   SUPABASE_SERVICE_ROLE_KEY  reaches the database, inside the store only.
 *                              Never compared with a request, never returned.
 *
 * Secrets (Supabase function secrets / injected by the Edge Runtime):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   injected by the runtime
 *   NUDGE_SCHEDULER_SECRET                    function secret (>= 32 chars)
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
 * Any of them missing or malformed: the function answers 503 and claims
 * nothing. None of them is ever logged or returned.
 */
import { handleSendNudgesRequest, NUDGE_TOPIC, NUDGE_TTL_SECONDS, type SendNudgesLogEvent } from './handler.ts';
import { createPostgrestNudgeStore } from './store.ts';
import { createVapidRequestBuilder } from '../_shared/web-push.ts';
import { isVapidConfigValid } from '../_shared/push-subscription.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const schedulerSecret = Deno.env.get('NUDGE_SCHEDULER_SECRET');
const vapid = {
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
};

const configured = isVapidConfigValid(vapid) && /^https:\/\/\S+$/.test(supabaseUrl) && serviceRoleKey.trim() !== '';

const store = createPostgrestNudgeStore({ supabaseUrl, serviceRoleKey });
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
  handleSendNudgesRequest(request, { schedulerSecret, configured, store, buildRequest, fetchImpl: fetch, log })
);
