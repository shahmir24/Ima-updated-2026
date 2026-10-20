/**
 * Holds Chromium's install prompt until the user asks for it.
 *
 * `beforeinstallprompt` can fire as soon as the page loads — long before the
 * Settings card or the Home hint mount — so the store starts listening from
 * main.tsx and keeps the event. The prompt itself is only ever opened from a
 * user's click (`prompt()`), and each event can be used once.
 */

/** The parts of BeforeInstallPromptEvent this app uses (not in lib.dom). */
export interface BeforeInstallPromptEventLike extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

export interface InstallPromptSnapshot {
  /** A prompt is waiting to be opened. */
  available: boolean;
  /** appinstalled fired, or the prompt was accepted, in this tab. */
  installed: boolean;
  /** How the last prompt this tab opened ended, if any. */
  lastOutcome: InstallOutcome | null;
}

export interface InstallPromptStore {
  start(target: Pick<Window, 'addEventListener'>): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): InstallPromptSnapshot;
  /** Opens the browser's own install prompt. Call only from a user's click. */
  prompt(): Promise<InstallOutcome>;
}

export function createInstallPromptStore(): InstallPromptStore {
  let deferred: BeforeInstallPromptEventLike | null = null;
  let snapshot: InstallPromptSnapshot = { available: false, installed: false, lastOutcome: null };
  let started = false;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<InstallPromptSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    listeners.forEach((listener) => listener());
  };

  return {
    start(target) {
      if (started) return;
      started = true;
      target.addEventListener('beforeinstallprompt', (event: Event) => {
        // Keep it for the user's own tap instead of the browser's automatic
        // mini-infobar, which would compete with iMA's own offer.
        event.preventDefault();
        deferred = event as BeforeInstallPromptEventLike;
        update({ available: true });
      });
      target.addEventListener('appinstalled', () => {
        deferred = null;
        update({ available: false, installed: true });
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    async prompt() {
      const event = deferred;
      if (!event) return 'unavailable';
      // One use per event; the browser may offer a new one later.
      deferred = null;
      update({ available: false });
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        update(outcome === 'accepted' ? { installed: true, lastOutcome: outcome } : { lastOutcome: outcome });
        return outcome;
      } catch {
        update({ lastOutcome: 'unavailable' });
        return 'unavailable';
      }
    }
  };
}

/** The app's one store, started in main.tsx. */
export const installPromptStore = createInstallPromptStore();
