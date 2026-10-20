import { useEffect, useState, useSyncExternalStore } from 'react';
import { installPlatform, isStandaloneDisplay, type InstallPlatform } from '@/lib/pwa/install-platform';
import { installPromptStore, type InstallOutcome, type InstallPromptStore } from '@/lib/pwa/install-prompt';

export interface InstallApp {
  platform: InstallPlatform;
  /** Running as the installed app right now. */
  standalone: boolean;
  /** Installed from this very tab (prompt accepted, or appinstalled). */
  installedHere: boolean;
  lastOutcome: InstallOutcome | null;
  /** Opens the browser's install prompt; only meaningful when platform is 'prompt'. */
  install: () => Promise<InstallOutcome>;
}

const readStandalone = () =>
  typeof window === 'undefined' ? false : isStandaloneDisplay(window, navigator as { standalone?: boolean });

export function useInstallApp(store: InstallPromptStore = installPromptStore): InstallApp {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [standalone, setStandalone] = useState(readStandalone);

  // Installing from a browser tab can switch this very window to standalone.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(display-mode: standalone)');
    const onChange = () => setStandalone(readStandalone());
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);

  const platform = installPlatform({
    userAgent: typeof navigator === 'undefined' ? '' : navigator.userAgent,
    maxTouchPoints: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints ?? 0,
    standalone,
    promptAvailable: snapshot.available,
    installedHere: snapshot.installed
  });

  return { platform, standalone, installedHere: snapshot.installed, lastOutcome: snapshot.lastOutcome, install: store.prompt };
}
