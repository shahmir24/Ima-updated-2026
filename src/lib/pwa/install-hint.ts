/**
 * Whether Home suggests installing iMA, and remembering "not now".
 *
 * Only where installing is genuinely possible from here — a captured browser
 * prompt, or iPhone/iPad (Share → Add to Home Screen). Android without a
 * prompt usually means it is already installed, so it is not nagged. The
 * dismissal is one flag in localStorage: no user data, and if storage is
 * blocked the hint simply counts as dismissed rather than coming back.
 */
import type { InstallPlatform } from './install-platform';

export const INSTALL_HINT_DISMISSED_KEY = 'ima.installHint.v1.dismissed';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function readHintDismissed(storage: StorageLike | undefined): boolean {
  try {
    return !storage || storage.getItem(INSTALL_HINT_DISMISSED_KEY) === '1';
  } catch {
    return true;
  }
}

/** Hints shown at once (phone and desktop Home are both mounted) hear a dismissal together. */
const dismissListeners = new Set<() => void>();
let dismissedThisVisit = false;

export function subscribeHintDismissed(listener: () => void): () => void {
  dismissListeners.add(listener);
  return () => dismissListeners.delete(listener);
}

export function writeHintDismissed(storage: StorageLike | undefined): void {
  dismissedThisVisit = true;
  try {
    storage?.setItem(INSTALL_HINT_DISMISSED_KEY, '1');
  } catch {
    // Storage blocked: the hint is hidden for this visit either way.
  }
  dismissListeners.forEach((listener) => listener());
}

/** Dismissed earlier (stored) or during this visit. */
export function hintDismissed(storage: StorageLike | undefined): boolean {
  return dismissedThisVisit || readHintDismissed(storage);
}

export function showsInstallHint(platform: InstallPlatform, dismissed: boolean): boolean {
  if (dismissed) return false;
  return platform === 'prompt' || platform === 'ios-safari' || platform === 'ios-other';
}
