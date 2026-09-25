/**
 * push-spike — a development-only proof that this runtime can send one
 * standards-based Web Push message (RFC 8030 delivery, RFC 8291 aes128gcm
 * encryption, RFC 8292 VAPID).
 *
 * What it does: takes ONE PushSubscription supplied by the developer in the
 * request body and sends ONE fixed notification to it. That is all.
 *
 * What it can never do: read or write any table, look up users or tasks,
 * choose its own recipients, schedule anything, or send caller-chosen text.
 * The message is the constant below; the only input is where to send it.
 *
 * Protection, all of which must pass (see index.ts and config.toml):
 *   1. verify_jwt stays on, so the Supabase gateway refuses callers without a
 *      project key before this code runs;
 *   2. the `x-ima-spike-secret` header must equal PUSH_SPIKE_SECRET, compared
 *      in constant time. With the secret unset the function is OFF (503) —
 *      it fails closed, so deploying the code alone enables nothing;
 *   3. the endpoint must be https on a known push-service host, so it cannot
 *      be pointed at arbitrary URLs.
 * There are no CORS headers: a browser page cannot call it.
 *
 * Nothing here holds or sees a key. Encryption and VAPID signing happen in the
 * injected `buildRequest`; this file only validates, sends and reports.
 * Delete the function once the spike has served its purpose.
 */

/** The only message this function can send. */
export const SPIKE_NOTIFICATION = Object.freeze({
  title: 'iMA',
  body: 'Your gentle nudges are ready.',
  url: '/'
});

export const SPIKE_SECRET_HEADER = 'x-ima-spike-secret';

/** A PushSubscription as PushSubscription.toJSON() produces it. */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** What the push service is sent: already encrypted and VAPID-signed. */
export interface PushRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export interface PushSpikeLogEvent {
  status: number;
  outcome: string;
  pushServiceStatus?: number;
}

export interface PushSpikeDeps {
  /** PUSH_SPIKE_SECRET. Unset or blank switches the function off. */
  secret: string | undefined;
  buildRequest: (subscription: PushSubscriptionInput, payload: string) => PushRequest | Promise<PushRequest>;
  fetchImpl: typeof fetch;
  isAllowedEndpoint?: (endpoint: URL) => boolean;
  log?: (event: PushSpikeLogEvent) => void;
}

/** Largest request body accepted. A subscription is a few hundred bytes. */
const MAX_BODY_BYTES = 4096;

/**
 * The push services browsers actually hand out endpoints for. Exact hosts or
 * whole-label suffixes only, so `fcm.googleapis.com.evil.com` cannot match.
 */
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_SERVICE_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

export function isKnownPushService(endpoint: URL): boolean {
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port) return false;
  const host = endpoint.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.includes(host) || PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/** Equal-length strings compared without an early exit. */
export function secretsMatch(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

function parseSubscription(value: unknown): PushSubscriptionInput | null {
  if (!value || typeof value !== 'object') return null;
  const outer = value as { subscription?: unknown };
  const sub = (outer.subscription ?? null) as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!sub || typeof sub.endpoint !== 'string' || !sub.keys) return null;
  const { p256dh, auth } = sub.keys;
  if (typeof p256dh !== 'string' || typeof auth !== 'string') return null;
  if (!BASE64URL.test(p256dh) || !BASE64URL.test(auth)) return null;
  // Uncompressed P-256 point (65 bytes) and a 16-byte auth secret, base64url.
  if (p256dh.length !== 87 || auth.length !== 22) return null;
  return { endpoint: sub.endpoint, keys: { p256dh, auth } };
}

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function handlePushSpikeRequest(request: Request, deps: PushSpikeDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const done = (status: number, outcome: string, extra: Record<string, unknown> = {}, pushServiceStatus?: number) => {
    log({ status, outcome, pushServiceStatus });
    return reply(status, { outcome, ...extra });
  };

  if (request.method !== 'POST') return done(405, 'method_not_allowed');
  if (!deps.secret || deps.secret.trim() === '') return done(503, 'disabled');
  if (!secretsMatch(deps.secret, request.headers.get(SPIKE_SECRET_HEADER))) return done(401, 'unauthorized');

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return done(413, 'too_large');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return done(400, 'invalid_json');
  }
  const subscription = parseSubscription(parsed);
  if (!subscription) return done(400, 'invalid_subscription');

  let endpoint: URL;
  try {
    endpoint = new URL(subscription.endpoint);
  } catch {
    return done(400, 'invalid_subscription');
  }
  if (!(deps.isAllowedEndpoint ?? isKnownPushService)(endpoint)) return done(400, 'endpoint_not_allowed');

  let pushRequest: PushRequest;
  try {
    pushRequest = await deps.buildRequest(subscription, JSON.stringify(SPIKE_NOTIFICATION));
  } catch {
    // Almost always a malformed key in the subscription or a misconfigured
    // VAPID secret. The detail stays out of the response.
    return done(500, 'encryption_failed');
  }

  let response: Response;
  try {
    response = await deps.fetchImpl(pushRequest.endpoint, {
      method: 'POST',
      headers: pushRequest.headers,
      // Plain bytes. The assertion only bridges TypeScript versions that type
      // Uint8Array's buffer differently; fetch accepts it in every runtime.
      body: pushRequest.body as BodyInit
    });
  } catch {
    return done(502, 'push_service_unreachable');
  }

  const status = response.status;
  if (status >= 200 && status < 300) return done(200, 'sent', { pushServiceStatus: status }, status);
  // 404 / 410: the subscription no longer exists (a real sender deletes it).
  if (status === 404 || status === 410) return done(410, 'subscription_gone', { pushServiceStatus: status }, status);
  return done(502, 'push_service_rejected', { pushServiceStatus: status }, status);
}
