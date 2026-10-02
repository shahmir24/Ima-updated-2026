import { describe, expect, it, vi } from 'vitest';

// The real library is resolved by Deno at deploy. Here it is replaced by a
// fake that records the options it was given.
const generateRequestDetails = vi.hoisted(() =>
  vi.fn((subscription: { endpoint: string }, payload: string, options: Record<string, unknown>) => ({
    endpoint: subscription.endpoint,
    headers: { TTL: options.TTL, Urgency: options.urgency, Topic: options.topic, 'Content-Length': 10, Authorization: 'vapid t=x, k=y' },
    body: new TextEncoder().encode(payload)
  }))
);
vi.mock('npm:web-push@3.6.7', () => ({ default: { generateRequestDetails } }));

import { createVapidRequestBuilder, isKnownPushService, isVapidConfigValid, toPushTarget } from './web-push';

const P256DH = 'B' + 'A'.repeat(86);
const AUTH = 'A'.repeat(22);
const VAPID = { subject: 'mailto:hello@example.com', publicKey: 'B' + 'x'.repeat(86), privateKey: 'k'.repeat(43) };

describe('isKnownPushService', () => {
  it.each([
    ['https://fcm.googleapis.com/fcm/send/abc', true],
    ['https://web.push.apple.com/QF', true],
    ['https://updates.push.services.mozilla.com/wpush/v2/x', true],
    ['https://wns2-par02p.notify.windows.com/w/?token=x', true],
    ['http://fcm.googleapis.com/fcm/send/abc', false],
    ['https://fcm.googleapis.com.evil.com/x', false],
    ['https://evil.com/fcm.googleapis.com', false],
    ['https://user:pw@fcm.googleapis.com/x', false],
    ['https://fcm.googleapis.com:8443/x', false]
  ])('%s → %s', (url, ok) => {
    expect(isKnownPushService(new URL(url))).toBe(ok);
  });
});

describe('toPushTarget — malformed stored subscriptions are never used', () => {
  const good = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', p256dh: P256DH, auth: AUTH };

  it('accepts a well-formed row', () => {
    expect(toPushTarget(good)).toEqual({ endpoint: good.endpoint, keys: { p256dh: P256DH, auth: AUTH } });
  });

  it.each([
    ['endpoint missing', { ...good, endpoint: undefined }],
    ['endpoint not a URL', { ...good, endpoint: 'not a url' }],
    ['endpoint on an unknown host', { ...good, endpoint: 'https://attacker.example/push' }],
    ['endpoint too long', { ...good, endpoint: `https://fcm.googleapis.com/${'a'.repeat(2050)}` }],
    ['p256dh wrong length', { ...good, p256dh: 'B'.repeat(86) }],
    ['p256dh bad alphabet', { ...good, p256dh: '+' + 'A'.repeat(86) }],
    ['auth too short', { ...good, auth: 'A'.repeat(21) }],
    ['auth not a string', { ...good, auth: 42 }]
  ])('%s → null', (_label, row) => {
    expect(toPushTarget(row as Record<string, unknown>)).toBeNull();
  });
});

describe('isVapidConfigValid — fails closed', () => {
  it('accepts a complete config (mailto or https subject)', () => {
    expect(isVapidConfigValid(VAPID)).toBe(true);
    expect(isVapidConfigValid({ ...VAPID, subject: 'https://ima.example' })).toBe(true);
  });

  it.each([
    ['nothing', undefined],
    ['missing subject', { ...VAPID, subject: '' }],
    ['subject not mailto/https', { ...VAPID, subject: 'hello@example.com' }],
    ['missing public key', { ...VAPID, publicKey: '' }],
    ['public key wrong length', { ...VAPID, publicKey: 'B'.repeat(80) }],
    ['missing private key', { ...VAPID, privateKey: '' }],
    ['private key wrong length', { ...VAPID, privateKey: 'k'.repeat(44) }],
    ['private key bad alphabet', { ...VAPID, privateKey: '/'.repeat(43) }]
  ])('%s → invalid', (_label, config) => {
    expect(isVapidConfigValid(config as never)).toBe(false);
  });
});

describe('createVapidRequestBuilder', () => {
  it('asks for aes128gcm with the given TTL, Topic and urgency, and drops Content-Length', () => {
    const build = createVapidRequestBuilder(VAPID, { ttlSeconds: 14_400, topic: 'ima-daily-nudge' });
    const request = build({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: P256DH, auth: AUTH } }, '{"title":"x"}') as {
      headers: Record<string, string>;
      body: Uint8Array;
    };

    expect(generateRequestDetails).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }),
      '{"title":"x"}',
      { vapidDetails: VAPID, TTL: 14_400, contentEncoding: 'aes128gcm', urgency: 'normal', topic: 'ima-daily-nudge' }
    );
    expect(request.headers).toMatchObject({ TTL: '14400', Topic: 'ima-daily-nudge', Urgency: 'normal' });
    expect(Object.keys(request.headers).map((h) => h.toLowerCase())).not.toContain('content-length');
    expect(request.body).toBeInstanceOf(Uint8Array);
  });
});
