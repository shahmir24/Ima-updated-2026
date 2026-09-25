/*
 * iMA service worker — installability, plus displaying push messages.
 *
 * What this worker deliberately does NOT do:
 *   - no fetch handler: every request goes straight to the network exactly as
 *     it did before this file existed, so the worker can never serve a stale
 *     app, break sign-in, or stand between the app and Supabase;
 *   - no Cache API and no offline page;
 *   - no nudge logic and no click handling yet (those arrive with gentle
 *     nudges). The push handler below only displays what it is sent.
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

