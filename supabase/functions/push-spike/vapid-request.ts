/**
 * Encrypts one payload for one subscription and signs it with VAPID, using
 * the reference Node library web-push — pinned, and only its pure
 * `generateRequestDetails` (RFC 8291 aes128gcm + RFC 8292 VAPID). Sending is
 * done with fetch by the handler, not by web-push's own HTTP client.
 *
 * Verified to run on Deno 2.0.0, 2.1.4 and 2.9.6 (the Supabase Edge Runtime is
 * a Deno 2 build). This is the only file that touches the library or the VAPID
 * private key, and the key is never logged or returned.
 */
import webpush from 'npm:web-push@3.6.7';
import type { PushRequest, PushSubscriptionInput } from './handler.ts';

export interface VapidConfig {
  /** mailto: address or https: URL the push service can contact. */
  subject: string;
  publicKey: string;
  privateKey: string;
}

/** Seconds a push service may hold an undelivered message. */
const SPIKE_TTL_SECONDS = 60;

export function createVapidRequestBuilder(vapid: VapidConfig) {
  return (subscription: PushSubscriptionInput, payload: string): PushRequest => {
    const details = webpush.generateRequestDetails(subscription, payload, {
      vapidDetails: vapid,
      TTL: SPIKE_TTL_SECONDS,
      contentEncoding: 'aes128gcm',
      urgency: 'normal'
    });
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(details.headers)) {
      // fetch computes Content-Length from the body itself.
      if (name.toLowerCase() !== 'content-length') headers[name] = String(value);
    }
    return { endpoint: details.endpoint, headers, body: new Uint8Array(details.body) };
  };
}
