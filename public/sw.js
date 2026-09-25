/*
 * iMA service worker — installability foundation only.
 *
 * What this worker deliberately does NOT do:
 *   - no fetch handler: every request goes straight to the network exactly as
 *     it did before this file existed, so the worker can never serve a stale
 *     app, break sign-in, or stand between the app and Supabase;
 *   - no Cache API and no offline page;
 *   - no push or notification handling (that arrives with gentle nudges).
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
