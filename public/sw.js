/*
 * iMA service worker — installability, plus displaying push messages.
 *
 * What this worker deliberately does NOT do:
 *   - no fetch handler: every request goes straight to the network exactly as
 *     it did before this file existed, so the worker can never serve a stale
 *     app, break sign-in, or stand between the app and Supabase;
 *   - no Cache API and no offline page;
 *   - no nudge logic: the push handler below only displays what it is sent,
 *     and the click handler only takes the user to that notification's page.
 *
 * Because it holds no cache, a new version can take over at once: skipWaiting
 * on install and clients.claim on activate carry no risk of mixing an old
 * cache with a new build.
 *
 * Emergency off switch: replacing this file with one that calls
 * self.registration.unregister() in its activate handler removes the worker
 * from every browser on its next update check.
 */

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/*
 * Push: show exactly one notification per message.
 *
 * Every push must end in a visible notification — browsers penalise silent
 * pushes (Safari revokes the permission). So a missing, unreadable or odd
 * payload still shows a plain "iMA" notification rather than nothing.
 *
 * The payload is data, never markup: only a short title and body string are
 * read, and the destination is kept only if it is a path on this site. No
 * push can arrive unless this browser subscribed with iMA's VAPID key.
 */
const PUSH_DEFAULT_TITLE = 'iMA';

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : '');
  const url = typeof data.url === 'string' && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/';

  event.waitUntil(
    self.registration.showNotification(text(data.title, 80) || PUSH_DEFAULT_TITLE, {
      body: text(data.body, 240),
      icon: '/brand/icon-192.png',
      data: { url }
    })
  );
});

/*
 * Notification click: close it, then take the user to its page in iMA.
 *
 * The destination is checked again here rather than trusted: only a path on
 * this site is kept. It must start with a single '/', and once resolved
 * against this origin it must still be on this origin (browsers read '/\x'
 * as '//x', another site). Anything else — a missing, absolute, protocol-
 * relative or script URL — becomes the home page.
 *
 * An iMA window that is already open is focused and navigated there (the one
 * in front first); only when none is open, or it cannot be navigated, is a
 * new window opened.
 */
function notificationDestination(data) {
  const home = new URL('/', self.location.origin).href;
  const raw = data && typeof data.url === 'string' ? data.url : '';
  if (!raw.startsWith('/') || raw.startsWith('//')) return home;
  try {
    const url = new URL(raw, self.location.origin);
    return url.origin === self.location.origin ? url.href : home;
  } catch {
    return home;
  }
}

async function showDestination(destination) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const existing =
    windows.find((client) => client.focused) ||
    windows.find((client) => client.visibilityState === 'visible') ||
    windows[0];

  if (existing) {
    try {
      const client = (await existing.focus()) || existing;
      if (client.url !== destination) await client.navigate(destination);
      return;
    } catch {
      // A page this worker does not control cannot be navigated; open one.
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(destination);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(showDestination(notificationDestination(event.notification.data)));
});
