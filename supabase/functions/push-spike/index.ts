/**
 * push-spike — the Deno entry point. Development verification only; see
 * handler.ts for what it can and cannot do, and delete it after the spike.
 *
 * Secrets (Supabase function secrets, never in client code or the repo):
 *   VAPID_PUBLIC_KEY   the only one that may ever be shared with browsers
 *   VAPID_PRIVATE_KEY  signing key; read here, handed to the builder, never logged
 *   VAPID_SUBJECT      mailto: contact for push services
 *   PUSH_SPIKE_SECRET  the caller must send it in x-ima-spike-secret;
 *                      unset = the function answers 503 and sends nothing
 *
 * No service-role key is read: this function touches no table.
 */
import { handlePushSpikeRequest, type PushSpikeLogEvent } from './handler.ts';
import { createVapidRequestBuilder } from './vapid-request.ts';

const secret = Deno.env.get('PUSH_SPIKE_SECRET');
const vapid = {
  subject: Deno.env.get('VAPID_SUBJECT') ?? '',
  publicKey: Deno.env.get('VAPID_PUBLIC_KEY') ?? '',
  privateKey: Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
};

// Built lazily: a missing VAPID secret must not crash the worker at boot,
// and the handler turns a builder failure into a plain 500.
const buildRequest = (...args: Parameters<ReturnType<typeof createVapidRequestBuilder>>) =>
  createVapidRequestBuilder(vapid)(...args);

/** Outcome and status codes only: no headers, no endpoint, no keys. */
function log(event: PushSpikeLogEvent): void {
  console.log(`push-spike ${event.status} ${event.outcome}${event.pushServiceStatus ? ` push=${event.pushServiceStatus}` : ''}`);
}

Deno.serve((request: Request) => handlePushSpikeRequest(request, { secret, buildRequest, fetchImpl: fetch, log }));
