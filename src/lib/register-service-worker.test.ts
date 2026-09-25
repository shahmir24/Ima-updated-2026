import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { SERVICE_WORKER_URL, registerServiceWorker } from './register-service-worker';

function environment(options: { supported?: boolean; readyState?: string; register?: () => Promise<unknown> } = {}) {
  const register = vi.fn(options.register ?? (async () => ({})));
  const navigator = (options.supported === false ? {} : { serviceWorker: { register } }) as unknown as Navigator;
  const listeners: Array<() => void> = [];
  const window = {
    document: { readyState: options.readyState ?? 'loading' },
    addEventListener: vi.fn((_type: string, listener: () => void) => listeners.push(listener))
  } as unknown as Window;
  return { register, navigator, window, fireLoad: () => listeners.forEach((listener) => listener()) };
}

describe('registerServiceWorker', () => {
  it('registers /sw.js after load in production, bypassing the HTTP cache for updates', () => {
    const env = environment();
    registerServiceWorker({ isProduction: true, navigator: env.navigator, window: env.window });
    expect(env.register).not.toHaveBeenCalled();
    env.fireLoad();
    expect(env.register).toHaveBeenCalledWith(SERVICE_WORKER_URL, { updateViaCache: 'none' });
  });

  it('registers straight away when the page has already loaded', () => {
    const env = environment({ readyState: 'complete' });
    registerServiceWorker({ isProduction: true, navigator: env.navigator, window: env.window });
    expect(env.register).toHaveBeenCalledTimes(1);
  });

  it('does nothing outside production', () => {
    const env = environment({ readyState: 'complete' });
    registerServiceWorker({ isProduction: false, navigator: env.navigator, window: env.window });
    env.fireLoad();
    expect(env.register).not.toHaveBeenCalled();
  });

  it('does nothing where service workers are unsupported, or with no browser at all', () => {
    const env = environment({ supported: false, readyState: 'complete' });
    expect(() => registerServiceWorker({ isProduction: true, navigator: env.navigator, window: env.window })).not.toThrow();
    expect(() => registerServiceWorker({ isProduction: true })).not.toThrow();
  });

  it('swallows a rejected or throwing registration', async () => {
    const rejected = environment({ readyState: 'complete', register: () => Promise.reject(new Error('blocked')) });
    expect(() => registerServiceWorker({ isProduction: true, navigator: rejected.navigator, window: rejected.window })).not.toThrow();
    await Promise.resolve();

    const throwing = environment({ readyState: 'complete', register: () => { throw new Error('SecurityError'); } });
    expect(() => registerServiceWorker({ isProduction: true, navigator: throwing.navigator, window: throwing.window })).not.toThrow();
  });
});

describe('public/sw.js', () => {
  const source = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('handles only install, activate and push', () => {
    const events = [...code.matchAll(/addEventListener\(\s*['"](\w+)['"]/g)].map((m) => m[1]);
    expect(events).toEqual(['install', 'activate', 'push']);
  });

  it('has no fetch handler, no caching, no click handling and no network calls', () => {
    for (const forbidden of ['fetch', 'caches', 'Cache', 'notificationclick', 'importScripts', 'subscribe']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('activates at once and takes control of open pages', () => {
    expect(code).toContain('self.skipWaiting()');
    expect(code).toContain('self.clients.claim()');
  });
});

describe('public/sw.js push handler (run against a fake worker scope)', () => {
  const source = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8');

  function loadWorker() {
    const listeners: Record<string, (event: unknown) => void> = {};
    const showNotification = vi.fn(async () => undefined);
    const self = {
      addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(async () => undefined) },
      registration: { showNotification }
    };
    new Function('self', source)(self);
    const push = async (data: { json: () => unknown } | null) => {
      let waited: Promise<unknown> | undefined;
      listeners.push({ data, waitUntil: (p: Promise<unknown>) => { waited = p; } });
      await waited;
      return showNotification.mock.calls.at(-1) as unknown as [string, { body: string; icon: string; data: { url: string } }];
    };
    return { push };
  }
  const payload = (value: unknown) => ({ json: () => value });

  it('shows the title, body and on-site url it is sent', async () => {
    const [title, options] = await loadWorker().push(payload({ title: 'iMA', body: 'Your gentle nudges are ready.', url: '/tasks' }));
    expect(title).toBe('iMA');
    expect(options).toEqual({ body: 'Your gentle nudges are ready.', icon: '/brand/icon-192.png', data: { url: '/tasks' } });
  });

  it('still shows a plain notification for an empty or unreadable push', async () => {
    const worker = loadWorker();
    expect((await worker.push(null))[0]).toBe('iMA');
    const [title, options] = await worker.push({ json: () => { throw new SyntaxError('not json'); } });
    expect(title).toBe('iMA');
    expect(options.body).toBe('');
  });

  it('keeps only on-site paths and caps the text', async () => {
    const worker = loadWorker();
    for (const url of ['https://evil.test/', '//evil.test/x', 'javascript:alert(1)', 42]) {
      expect((await worker.push(payload({ url })))[1].data.url).toBe('/');
    }
    const [title, options] = await worker.push(payload({ title: 'x'.repeat(500), body: 'y'.repeat(500) }));
    expect(title).toHaveLength(80);
    expect(options.body).toHaveLength(240);
  });
});
