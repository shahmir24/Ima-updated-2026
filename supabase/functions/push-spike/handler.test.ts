import { describe, expect, it, vi } from 'vitest';
import {
  SPIKE_NOTIFICATION,
  SPIKE_SECRET_HEADER,
  handlePushSpikeRequest,
  isKnownPushService,
  secretsMatch,
  type PushSpikeDeps
} from './handler';

const P256DH = 'B' + 'A'.repeat(86); // 87 base64url chars = 65 bytes
const AUTH = 'A'.repeat(22); // 16 bytes
const subscription = (endpoint = 'https://fcm.googleapis.com/fcm/send/abc') => ({ subscription: { endpoint, keys: { p256dh: P256DH, auth: AUTH } } });

function deps(overrides: Partial<PushSpikeDeps> = {}) {
  const buildRequest = vi.fn((sub, payload: string) => ({ endpoint: sub.endpoint, headers: { TTL: '60' }, body: new TextEncoder().encode(payload) }));
  const fetchImpl = vi.fn(async () => new Response(null, { status: 201 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
  return { secret: 'correct-horse', buildRequest, fetchImpl, ...overrides } as PushSpikeDeps & { buildRequest: typeof buildRequest; fetchImpl: typeof fetchImpl };
}

const post = (body: unknown, secret: string | null = 'correct-horse', method = 'POST') =>
  new Request('https://x.supabase.co/functions/v1/push-spike', {
    method,
    headers: secret === null ? {} : { [SPIKE_SECRET_HEADER]: secret },
    body: method === 'GET' ? undefined : typeof body === 'string' ? body : JSON.stringify(body)
  });

describe('push-spike access', () => {
  it('is OFF (503) when PUSH_SPIKE_SECRET is unset or blank, and sends nothing', async () => {
    for (const secret of [undefined, '', '   ']) {
      const d = deps({ secret });
      const res = await handlePushSpikeRequest(post(subscription(), 'anything'), d);
      expect(res.status).toBe(503);
      expect(d.fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('refuses a missing or wrong secret (401) before reading the body', async () => {
    for (const given of [null, '', 'wrong', 'correct-hors', 'correct-horsE']) {
      const d = deps();
      const res = await handlePushSpikeRequest(post(subscription(), given), d);
      expect(res.status).toBe(401);
      expect(d.buildRequest).not.toHaveBeenCalled();
      expect(d.fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('accepts POST only', async () => {
    const res = await handlePushSpikeRequest(post(null, 'correct-horse', 'GET'), deps());
    expect(res.status).toBe(405);
  });

  it('never sets CORS headers, so no web page can call it', async () => {
    const res = await handlePushSpikeRequest(post(subscription()), deps());
    const names: string[] = [];
    res.headers.forEach((_value, name) => names.push(name));
    expect(names.some((h) => h.startsWith('access-control'))).toBe(false);
  });
});

describe('push-spike input', () => {
  it('rejects malformed bodies and subscriptions', async () => {
    const bad = [
      '{',
      {},
      { subscription: { endpoint: 'https://fcm.googleapis.com/x' } },
      { subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'short', auth: AUTH } } },
      { subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: P256DH, auth: 'A'.repeat(21) + '+' } } },
      { subscription: { endpoint: 'not a url', keys: { p256dh: P256DH, auth: AUTH } } }
    ];
    for (const body of bad) {
      const d = deps();
      const res = await handlePushSpikeRequest(post(body), d);
      expect(res.status).toBe(400);
      expect(d.fetchImpl).not.toHaveBeenCalled();
    }
  });

  it('refuses an oversized body', async () => {
    const res = await handlePushSpikeRequest(post({ ...subscription(), pad: 'x'.repeat(5000) }), deps());
    expect(res.status).toBe(413);
  });

  it('only sends to https push-service hosts', async () => {
    const refused = [
      'http://fcm.googleapis.com/fcm/send/a',
      'https://localhost/x',
      'https://127.0.0.1/x',
      'https://fcm.googleapis.com.evil.test/x',
      'https://evilpush.apple.com.attacker.test/x',
      'https://user:pw@fcm.googleapis.com/x',
      'https://fcm.googleapis.com:8443/x',
      'https://example.com/fcm.googleapis.com'
    ];
    for (const endpoint of refused) {
      const d = deps();
      const res = await handlePushSpikeRequest(post(subscription(endpoint)), d);
      expect(res.status, endpoint).toBe(400);
      expect(d.fetchImpl).not.toHaveBeenCalled();
    }
    for (const endpoint of [
      'https://fcm.googleapis.com/fcm/send/a',
      'https://updates.push.services.mozilla.com/wpush/v2/a',
      'https://web.push.apple.com/QGx',
      'https://wns2-by3p.notify.windows.com/w/?token=a'
    ]) {
      expect(isKnownPushService(new URL(endpoint)), endpoint).toBe(true);
    }
  });
});

describe('push-spike sending', () => {
  it('sends exactly the fixed notification, whatever else the caller includes', async () => {
    const d = deps();
    const res = await handlePushSpikeRequest(post({ ...subscription(), title: 'hijack', body: 'hijack' }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ outcome: 'sent', pushServiceStatus: 201 });
    expect(d.buildRequest).toHaveBeenCalledTimes(1);
    expect(JSON.parse(d.buildRequest.mock.calls[0][1])).toEqual(SPIKE_NOTIFICATION);
    expect(SPIKE_NOTIFICATION).toEqual({ title: 'iMA', body: 'Your gentle nudges are ready.', url: '/' });
    const [url, init] = d.fetchImpl.mock.calls[0];
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(init.method).toBe('POST');
  });

  it('maps push-service answers without leaking detail', async () => {
    const cases: Array<[number, number, string]> = [[201, 200, 'sent'], [404, 410, 'subscription_gone'], [410, 410, 'subscription_gone'], [403, 502, 'push_service_rejected'], [429, 502, 'push_service_rejected']];
    for (const [push, status, outcome] of cases) {
      const d = deps({ fetchImpl: vi.fn(async () => new Response('secret detail', { status: push })) as unknown as typeof fetch });
      const res = await handlePushSpikeRequest(post(subscription()), d);
      expect(res.status).toBe(status);
      const body = await res.json();
      expect(body.outcome).toBe(outcome);
      expect(JSON.stringify(body)).not.toContain('secret detail');
    }
  });

  it('reports encryption and network failures plainly', async () => {
    const enc = await handlePushSpikeRequest(post(subscription()), deps({ buildRequest: () => { throw new Error('bad VAPID private key abc123'); } }));
    expect(enc.status).toBe(500);
    expect(await enc.text()).not.toContain('abc123');
    const net = await handlePushSpikeRequest(post(subscription()), deps({ fetchImpl: (async () => { throw new TypeError('dns'); }) as unknown as typeof fetch }));
    expect(net.status).toBe(502);
  });
});

describe('secretsMatch', () => {
  it('matches only the identical secret', () => {
    expect(secretsMatch('abc', 'abc')).toBe(true);
    for (const given of [null, '', 'ab', 'abcd', 'abd']) expect(secretsMatch('abc', given)).toBe(false);
  });
});
