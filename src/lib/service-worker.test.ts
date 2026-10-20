import { readFileSync, existsSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

/**
 * The real public/sw.js, run in a sandbox with a fake `self`, `caches` and
 * `fetch`, so every event handler can be driven directly.
 */

const ORIGIN = 'https://ima.example';
const SOURCE = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const root = (path: string) => new URL(`../../${path}`, import.meta.url);

type Listener = (event: Record<string, unknown>) => void;

function loadWorker(options: { online?: boolean; existingCaches?: string[]; installFetchFails?: boolean } = {}) {
  const listeners: Record<string, Listener[]> = {};
  const cacheWrites: string[] = [];
  const stores = new Map<string, Map<string, Response>>();
  for (const name of options.existingCaches ?? []) stores.set(name, new Map());

  const caches = {
    open: vi.fn(async (name: string) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name)!;
      return {
        add: vi.fn(async (request: Request) => {
          if (options.installFetchFails) throw new TypeError('Failed to fetch');
          cacheWrites.push(`${name} add ${new URL(request.url, ORIGIN).pathname} cache=${request.cache}`);
          store.set(new URL(request.url, ORIGIN).pathname, new Response('<h1>You’re offline</h1>'));
        }),
        put: vi.fn(async (request: Request) => {
          cacheWrites.push(`${name} put ${request.url}`);
        })
      };
    }),
    keys: vi.fn(async () => [...stores.keys()]),
    delete: vi.fn(async (name: string) => stores.delete(name)),
    match: vi.fn(async (url: string, opts?: { cacheName?: string }) => stores.get(opts?.cacheName ?? '')?.get(url))
  };

  const fetchMock = vi.fn(async (request: Request) => {
    if (options.online === false) throw new TypeError('Failed to fetch');
    return new Response(`network ${request.url}`, { status: 200 });
  });

  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => {
      (listeners[type] ??= []).push(listener);
    },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}), matchAll: vi.fn(async () => []), openWindow: vi.fn(async () => null) },
    registration: { showNotification: vi.fn(async () => {}) }
  };

  // Request needs absolute URLs; the worker builds `new Request('/offline.html')`,
  // which a browser resolves against its own location.
  const SandboxRequest = class extends Request {
    constructor(input: string, init?: RequestInit) {
      super(new URL(input, ORIGIN), init);
    }
  };

  runInNewContext(SOURCE, { self, caches, fetch: fetchMock, Request: SandboxRequest, Response, URL, Promise });

  /** Dispatches an event and returns what it waited on or responded with. */
  const dispatch = async (type: string, extra: Record<string, unknown> = {}) => {
    const waited: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const event = {
      ...extra,
      waitUntil: (p: Promise<unknown>) => waited.push(p),
      respondWith: (p: Promise<Response>) => {
        responded = p;
      }
    };
    for (const listener of listeners[type] ?? []) listener(event);
    await Promise.all(waited);
    return { responded: responded ? await responded : undefined, wasHandled: responded !== undefined };
  };

  return { listeners, dispatch, caches, fetchMock, self, stores, cacheWrites };
}

const navigation = (path: string, origin = ORIGIN) => ({ request: { url: `${origin}${path}`, mode: 'navigate', method: 'GET' } });

describe('service worker — offline page', () => {
  it('install caches exactly one file, /offline.html, fetched past the HTTP cache — and still activates at once', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    expect(worker.cacheWrites).toEqual(['ima-offline-v1 add /offline.html cache=reload']);
  });

  it('install still succeeds when the offline page cannot be fetched (installing while offline)', async () => {
    const worker = loadWorker({ installFetchFails: true });
    await expect(worker.dispatch('install')).resolves.toBeDefined();
    expect(worker.self.skipWaiting).toHaveBeenCalled();
  });

  it('activate deletes only older ima-offline-* caches, never anyone else’s, then takes control', async () => {
    const worker = loadWorker({ existingCaches: ['ima-offline-v0', 'ima-offline-v1', 'workbox-precache', 'some-other-cache'] });
    await worker.dispatch('activate');
    expect(worker.caches.delete.mock.calls.map(([name]) => name)).toEqual(['ima-offline-v0']);
    expect([...worker.stores.keys()].sort()).toEqual(['ima-offline-v1', 'some-other-cache', 'workbox-precache']);
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it('online: a page navigation goes to the network and the response is passed through, never stored', async () => {
    const worker = loadWorker({ online: true });
    await worker.dispatch('install');
    const { responded } = await worker.dispatch('fetch', navigation('/tasks'));
    expect(await responded!.text()).toBe(`network ${ORIGIN}/tasks`);
    expect(worker.cacheWrites.filter((w) => !w.includes('/offline.html'))).toEqual([]);
  });

  it('offline: a page navigation gets the cached offline page', async () => {
    const worker = loadWorker({ online: false });
    await worker.dispatch('install');
    const { responded } = await worker.dispatch('fetch', navigation('/journaling/history'));
    expect(await responded!.text()).toContain('offline');
  });

  it('offline with no cached page: a network error, never something invented', async () => {
    const worker = loadWorker({ online: false, installFetchFails: true });
    await worker.dispatch('install');
    const { responded } = await worker.dispatch('fetch', navigation('/'));
    expect(responded!.type).toBe('error');
  });

  it.each([
    ['the app’s JavaScript', { url: `${ORIGIN}/assets/index-abc.js`, mode: 'cors', method: 'GET' }],
    ['the app’s CSS', { url: `${ORIGIN}/assets/index-abc.css`, mode: 'no-cors', method: 'GET' }],
    ['Soundscape audio', { url: `${ORIGIN}/audio/soundscapes/rain.mp3`, mode: 'no-cors', method: 'GET' }],
    ['a Supabase read', { url: 'https://abc.supabase.co/rest/v1/tasks?select=*', mode: 'cors', method: 'GET' }],
    ['a Supabase sign-in', { url: 'https://abc.supabase.co/auth/v1/token?grant_type=password', mode: 'cors', method: 'POST' }],
    ['an AI function', { url: 'https://abc.supabase.co/functions/v1/organize-capture', mode: 'cors', method: 'POST' }],
    ['a navigation to another site', { url: 'https://accounts.google.com/o/oauth2/auth', mode: 'navigate', method: 'GET' }],
    ['a form POST navigation', { url: `${ORIGIN}/`, mode: 'navigate', method: 'POST' }]
  ])('%s is left entirely to the browser — not handled, not fetched, not cached', async (_name, request) => {
    const worker = loadWorker({ online: true });
    const { wasHandled } = await worker.dispatch('fetch', { request });
    expect(wasHandled).toBe(false);
    expect(worker.fetchMock).not.toHaveBeenCalled();
    expect(worker.cacheWrites).toEqual([]);
  });
});

describe('service worker — push and notifications are unchanged', () => {
  it('still registers push and notificationclick, and a push shows one notification', async () => {
    const worker = loadWorker();
    expect(worker.listeners.push).toHaveLength(1);
    expect(worker.listeners.notificationclick).toHaveLength(1);
    await worker.dispatch('push', { data: { json: () => ({ title: 'Gentle nudge', body: 'Maybe start small', url: '/tasks' }) } });
    expect(worker.self.registration.showNotification).toHaveBeenCalledWith('Gentle nudge', {
      body: 'Maybe start small',
      icon: '/brand/icon-192.png',
      data: { url: '/tasks' }
    });
  });

  it('keeps the documented emergency off switch and its no-stale-app guarantees', () => {
    expect(SOURCE).toContain('self.registration.unregister()');
    expect(SOURCE).toMatch(/self\.skipWaiting\(\)/);
    expect(SOURCE).toMatch(/self\.clients\.claim\(\)/);
    // The only cache write in the whole file is the offline page at install.
    expect(SOURCE.match(/\.(add|addAll|put)\(/g)).toEqual(['.add(']);
  });
});

describe('offline page', () => {
  const page = readFileSync(root('public/offline.html'), 'utf8');

  it('says it is offline, how to fix it, and offers Retry', () => {
    expect(page).toContain('<h1>You\'re offline</h1>');
    expect(page).toContain('Connect to the internet to open iMA.');
    expect(page).toMatch(/<button type="button" id="retry">Retry<\/button>/);
    expect(page).toContain("window.addEventListener('online', retry)");
  });

  it('is self-contained: loads nothing from anywhere and holds no user data', () => {
    expect(page).not.toMatch(/<(script|img|link|iframe)[^>]+(src|href)=/i);
    expect(page).not.toMatch(/https?:\/\//);
    expect(page).not.toMatch(/localStorage|sessionStorage|indexedDB|supabase|fetch\(/i);
  });
});

describe('install metadata', () => {
  const manifest = JSON.parse(readFileSync(root('public/site.webmanifest'), 'utf8'));
  const html = readFileSync(root('index.html'), 'utf8');

  it('the manifest keeps its identity, start URL, scope, display, colours and icons', () => {
    expect(manifest).toMatchObject({
      id: '/', name: 'iMA', short_name: 'iMA', start_url: '/', scope: '/', display: 'standalone',
      background_color: '#080b12', theme_color: '#080b12'
    });
    expect(manifest.icons.map((i: { sizes: string; purpose: string }) => `${i.sizes}/${i.purpose}`)).toEqual([
      '192x192/any', '512x512/any', '512x512/maskable'
    ]);
    for (const icon of manifest.icons) expect(existsSync(root(`public${icon.src}`)), icon.src).toBe(true);
  });

  it('adds a description and language', () => {
    expect(manifest.description.length).toBeGreaterThan(20);
    expect(manifest.lang).toBe('en');
    expect(manifest.dir).toBe('ltr');
  });

  it('index.html has the iOS standalone tags, with the default (not translucent) status bar', () => {
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />');
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="default" />');
    expect(html).not.toContain('black-translucent');
    expect(html).toContain('<link rel="manifest" href="/site.webmanifest" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png" />');
  });
});
