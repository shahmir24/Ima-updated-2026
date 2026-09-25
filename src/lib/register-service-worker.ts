/**
 * Registers /sw.js, the worker that makes iMA installable.
 *
 * Production builds only: in development a worker would outlive the dev
 * server and confuse hot reload. Browsers without service workers simply skip
 * it. A failed registration is ignored — the worker adds installability and
 * nothing the app needs to run, so it must never stop the app from loading or
 * show the user an error.
 *
 * `updateViaCache: 'none'` makes the browser fetch /sw.js past its HTTP cache
 * on every update check, so a new version is picked up promptly (vercel.json
 * also serves it with `Cache-Control: no-cache`).
 */

export const SERVICE_WORKER_URL = '/sw.js';

interface RegistrationEnvironment {
  isProduction: boolean;
  navigator?: Navigator;
  window?: Pick<Window, 'addEventListener'> & { document?: Pick<Document, 'readyState'> };
}

export function registerServiceWorker(env: RegistrationEnvironment): void {
  const nav = env.navigator;
  const win = env.window;
  if (!env.isProduction || !nav || !win || !('serviceWorker' in nav)) return;

  const register = () => {
    try {
      nav.serviceWorker.register(SERVICE_WORKER_URL, { updateViaCache: 'none' }).catch(() => {
        // Installability is optional; the app works the same without it.
      });
    } catch {
      // Some browsers throw synchronously (e.g. storage blocked). Same answer.
    }
  };

  // After load, so registering never competes with the app's first render.
  if (win.document?.readyState === 'complete') register();
  else win.addEventListener('load', register, { once: true });
}
