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

  it('handles only install and activate', () => {
    const events = [...code.matchAll(/addEventListener\(\s*['"](\w+)['"]/g)].map((m) => m[1]);
    expect(events).toEqual(['install', 'activate']);
  });

  it('has no fetch handler, no caching and no push code', () => {
    for (const forbidden of ['fetch', 'caches', 'Cache', 'push', 'notification', 'importScripts']) {
      expect(code).not.toContain(forbidden);
    }
  });

  it('activates at once and takes control of open pages', () => {
    expect(code).toContain('self.skipWaiting()');
    expect(code).toContain('self.clients.claim()');
  });
});
