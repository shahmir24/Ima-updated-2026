/**
 * The encrypted, VAPID-signed Web Push request for the gentle-nudge sender.
 *
 * The approach is the one push-spike proved end to end: the pinned reference
 * library web-push, used ONLY for its pure generateRequestDetails (RFC 8291
 * aes128gcm + RFC 8292 VAPID); the request itself is sent with fetch by the
 * caller. push-spike keeps its own copy until it is retired.
 *
 * This is the only module that touches the VAPID private key. It is never
 * logged, returned or put in an error message.
 */
import webpush from 'npm:web-push@3.6.7';
import type { PushRequestBuilder, PushRequestOptions, VapidConfig } from './push-subscription.ts';

export type { PushRequest, PushRequestBuilder, PushRequestOptions, PushTarget, VapidConfig } from './push-subscription.ts';
export { isKnownPushService, isVapidConfigValid, toPushTarget } from './push-subscription.ts';

export function createVapidRequestBuilder(vapid: VapidConfig, options: PushRequestOptions): PushRequestBuilder {
  const vapidDetails = { subject: vapid.subject.trim(), publicKey: vapid.publicKey.trim(), privateKey: vapid.privateKey.trim() };
  return (target, payload) => {
    const details = webpush.generateRequestDetails(target, payload, {
      vapidDetails,
      TTL: options.ttlSeconds,
      contentEncoding: 'aes128gcm',
      urgency: options.urgency ?? 'normal',
      ...(options.topic ? { topic: options.topic } : {})
    });
    const headers: Record<string, string> = {};
    for (const [name, value] of Object.entries(details.headers)) {
      // fetch computes Content-Length from the body itself.
      if (name.toLowerCase() !== 'content-length') headers[name] = String(value);
    }
    return { endpoint: details.endpoint, headers, body: new Uint8Array(details.body) };
  };
}
