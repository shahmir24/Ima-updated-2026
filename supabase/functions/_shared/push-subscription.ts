/**
 * Web Push checks with no dependencies: stored-subscription and VAPID
 * configuration validation, plus the shapes shared with the request builder
 * (web-push.ts). Kept apart from the builder so the sender's logic never loads
 * the npm library and can be unit tested anywhere.
 */
export interface VapidConfig {
  /** mailto: address or https: URL the push service can contact. */
  subject: string;
  /** Uncompressed P-256 public key, base64url (87 characters). */
  publicKey: string;
  /** P-256 private key, base64url (43 characters). */
  privateKey: string;
}

export interface PushTarget {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** What the push service is sent: already encrypted and VAPID-signed. */
export interface PushRequest {
  endpoint: string;
  headers: Record<string, string>;
  body: Uint8Array;
}

export type PushRequestBuilder = (target: PushTarget, payload: string) => PushRequest | Promise<PushRequest>;

export interface PushRequestOptions {
  /** Seconds a push service may hold an undelivered message. */
  ttlSeconds: number;
  /** A newer message with the same Topic replaces an undelivered older one. */
  topic?: string;
  urgency?: 'very-low' | 'low' | 'normal' | 'high';
}

/**
 * The push services browsers hand out endpoints for. Exact hosts or whole-label
 * suffixes, so `fcm.googleapis.com.evil.com` cannot match.
 */
const PUSH_SERVICE_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com'];
const PUSH_SERVICE_SUFFIXES = ['.push.apple.com', '.notify.windows.com', '.push.services.mozilla.com'];

export function isKnownPushService(endpoint: URL): boolean {
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.port) return false;
  const host = endpoint.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.includes(host) || PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix));
}

/**
 * A stored subscription the sender may use: same shape rules as the
 * push_subscriptions CHECK constraints, plus a known push-service host so a
 * row can never point the sender at an arbitrary URL.
 */
export function toPushTarget(row: { endpoint?: unknown; p256dh?: unknown; auth?: unknown }): PushTarget | null {
  const { endpoint, p256dh, auth } = row;
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return null;
  if (typeof p256dh !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(p256dh)) return null;
  if (typeof auth !== 'string' || !/^[A-Za-z0-9_-]{22,64}$/.test(auth)) return null;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return null;
  }
  if (!isKnownPushService(url)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

/** True only for a complete, well-formed VAPID configuration. Says nothing about which part failed. */
export function isVapidConfigValid(config: Partial<VapidConfig> | null | undefined): config is VapidConfig {
  if (!config) return false;
  const { subject, publicKey, privateKey } = config;
  if (typeof subject !== 'string' || !/^(mailto:\S+@\S+|https:\/\/\S+)$/.test(subject.trim())) return false;
  if (typeof publicKey !== 'string' || !/^[A-Za-z0-9_-]{87}$/.test(publicKey.trim())) return false;
  if (typeof privateKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(privateKey.trim())) return false;
  return true;
}
