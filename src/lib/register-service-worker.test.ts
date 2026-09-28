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

  it('handles only install, activate, push and notificationclick', () => {
    const events = [...code.matchAll(/addEventListener\(\s*['"](\w+)['"]/g)].map((m) => m[1]);
    expect(events).toEqual(['install', 'activate', 'push', 'notificationclick']);
  });

  it('has no fetch handler, no caching and no network calls', () => {
    for (const forbidden of ['fetch', 'caches', 'Cache', 'importScripts', 'subscribe']) {
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

describe('public/sw.js notificationclick handler (run against a fake worker scope)', () => {
  const source = readFileSync(join(__dirname, '../../public/sw.js'), 'utf8');
  const ORIGIN = 'https://ima.test';

  interface FakeWindow {
    url: string;
    focused?: boolean;
    visibilityState?: string;
    focus: ReturnType<typeof vi.fn>;
    navigate: ReturnType<typeof vi.fn>;
  }

  function fakeWindow(url: string, options: { focused?: boolean; visible?: boolean; navigable?: boolean } = {}): FakeWindow {
    const client: FakeWindow = {
      url,
      focused: options.focused ?? false,
      visibilityState: options.visible ? 'visible' : 'hidden',
      focus: vi.fn(async () => client),
      navigate: vi.fn(async (to: string) => {
        if (options.navigable === false) throw new TypeError('not controlled');
        client.url = to;
        return client;
      })
    };
    return client;
  }

  function loadWorker(windows: FakeWindow[] = [], options: { openWindow?: boolean } = {}) {
    const listeners: Record<string, (event: unknown) => void> = {};
    const matchAll = vi.fn(async () => windows);
    const openWindow = vi.fn(async () => null);
    const self = {
      location: { origin: ORIGIN },
      addEventListener: (type: string, listener: (event: unknown) => void) => { listeners[type] = listener; },
      skipWaiting: vi.fn(),
      clients: { claim: vi.fn(async () => undefined), matchAll, ...(options.openWindow === false ? {} : { openWindow }) },
      registration: { showNotification: vi.fn(async () => undefined) }
    };
    new Function('self', source)(self);
    const click = async (data: unknown) => {
      const close = vi.fn();
      let waited: Promise<unknown> | undefined;
      listeners.notificationclick({ notification: { data, close }, waitUntil: (p: Promise<unknown>) => { waited = p; } });
      expect(waited).toBeInstanceOf(Promise);
      await waited;
      return { close };
    };
    return { click, matchAll, openWindow, showNotification: self.registration.showNotification, listeners };
  }

  it('closes the notification and opens a new window at the destination when iMA is not open', async () => {
    const worker = loadWorker();
    const { close } = await worker.click({ url: '/tasks?view=today#top' });
    expect(close).toHaveBeenCalledTimes(1);
    expect(worker.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true });
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks?view=today#top`);
  });

  it('focuses an open iMA window and navigates it instead of opening another', async () => {
    const open = fakeWindow(`${ORIGIN}/journal`);
    const worker = loadWorker([open]);
    await worker.click({ url: '/tasks' });
    expect(open.focus).toHaveBeenCalledTimes(1);
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/tasks`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('prefers the focused window, then a visible one, over the rest', async () => {
    const background = fakeWindow(`${ORIGIN}/a`);
    const visible = fakeWindow(`${ORIGIN}/b`, { visible: true });
    const focused = fakeWindow(`${ORIGIN}/c`, { focused: true, visible: true });
    await loadWorker([background, visible, focused]).click({ url: '/tasks' });
    expect(focused.navigate).toHaveBeenCalledTimes(1);
    expect(background.focus).not.toHaveBeenCalled();
    expect(visible.focus).not.toHaveBeenCalled();

    const background2 = fakeWindow(`${ORIGIN}/a`);
    const visible2 = fakeWindow(`${ORIGIN}/b`, { visible: true });
    await loadWorker([background2, visible2]).click({ url: '/tasks' });
    expect(visible2.navigate).toHaveBeenCalledTimes(1);
    expect(background2.focus).not.toHaveBeenCalled();
  });

  it('only focuses when the window is already on the destination', async () => {
    const open = fakeWindow(`${ORIGIN}/tasks`);
    const worker = loadWorker([open]);
    await worker.click({ url: '/tasks' });
    expect(open.focus).toHaveBeenCalledTimes(1);
    expect(open.navigate).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it('opens a new window when the open one cannot be navigated (not controlled by this worker)', async () => {
    const open = fakeWindow(`${ORIGIN}/journal`, { navigable: false });
    const worker = loadWorker([open]);
    await worker.click({ url: '/tasks' });
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks`);
  });

  it('sends every unsafe or missing destination to the home page', async () => {
    const unsafe: unknown[] = [
      { url: 'https://evil.test/' },
      { url: `${ORIGIN}/tasks` },
      { url: '//evil.test/x' },
      { url: '/\\evil.test/x' },
      { url: '\\\\evil.test' },
      { url: 'javascript:alert(1)' },
      { url: 'tasks' },
      { url: 42 },
      { url: '' },
      {},
      null,
      undefined
    ];
    for (const data of unsafe) {
      const worker = loadWorker();
      await worker.click(data);
      expect(worker.openWindow, JSON.stringify(data)).toHaveBeenCalledWith(`${ORIGIN}/`);
    }
    const open = fakeWindow(`${ORIGIN}/journal`);
    await loadWorker([open]).click({ url: '//evil.test/x' });
    expect(open.navigate).toHaveBeenCalledWith(`${ORIGIN}/`);
  });

  it('never throws out of the handler when windows cannot be opened', async () => {
    const worker = loadWorker([], { openWindow: false });
    const { close } = await worker.click({ url: '/tasks' });
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('a pushed notification, when clicked, lands on the page it was sent with', async () => {
    const worker = loadWorker();
    let waited: Promise<unknown> | undefined;
    worker.listeners.push({ data: { json: () => ({ title: 'iMA', body: 'One small thing', url: '/tasks' }) }, waitUntil: (p: Promise<unknown>) => { waited = p; } });
    await waited;
    const [, options] = worker.showNotification.mock.calls.at(-1) as unknown as [string, { data: unknown }];
    await worker.click(options.data);
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/tasks`);
  });
});
