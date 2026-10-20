/**
 * Which way, if any, this browser can install iMA — so the app only ever
 * offers what will actually work.
 *
 *   installed       already running as the installed app (or just installed)
 *   prompt          Chromium has offered its install prompt (beforeinstallprompt)
 *   ios-safari      iPhone/iPad Safari: no prompt exists; Share → Add to Home Screen
 *   ios-other       another iPhone/iPad browser: Safari is the dependable route
 *   android-manual  Android without a prompt: the browser menu
 *   unsupported     nothing accurate to offer (e.g. desktop Firefox or Safari)
 */
export type InstallPlatform = 'installed' | 'prompt' | 'ios-safari' | 'ios-other' | 'android-manual' | 'unsupported';

export interface InstallEnvironment {
  userAgent: string;
  maxTouchPoints: number;
  /** Running as an installed app (display-mode or iOS navigator.standalone). */
  standalone: boolean;
  /** A captured beforeinstallprompt event is waiting. */
  promptAvailable: boolean;
  /** appinstalled fired, or the prompt was accepted, in this tab. */
  installedHere: boolean;
}

export function isIosDevice(userAgent: string, maxTouchPoints: number): boolean {
  // iPadOS asks for desktop sites and reports itself as a Mac; touch gives it away.
  return /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

/** In-app browsers and the other iOS browsers all identify themselves. */
const IOS_NON_SAFARI = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//;

export function installPlatform(env: InstallEnvironment): InstallPlatform {
  if (env.standalone || env.installedHere) return 'installed';
  if (env.promptAvailable) return 'prompt';
  if (isIosDevice(env.userAgent, env.maxTouchPoints)) {
    return /Safari\//.test(env.userAgent) && !IOS_NON_SAFARI.test(env.userAgent) ? 'ios-safari' : 'ios-other';
  }
  if (/Android/.test(env.userAgent)) return 'android-manual';
  return 'unsupported';
}

/** Display modes an installed web app can run in. */
const INSTALLED_DISPLAY_MODES = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];

export function isStandaloneDisplay(win: Pick<Window, 'matchMedia'> | undefined, nav: { standalone?: boolean } | undefined): boolean {
  if (nav?.standalone === true) return true;
  if (!win?.matchMedia) return false;
  return INSTALLED_DISPLAY_MODES.some((mode) => {
    try {
      return win.matchMedia(`(display-mode: ${mode})`).matches;
    } catch {
      return false;
    }
  });
}

export const INSTALL_INSTRUCTIONS: Record<'ios-safari' | 'ios-other' | 'android-manual', string> = {
  'ios-safari': 'Tap Share, then Add to Home Screen.',
  'ios-other': 'Open iMA in Safari, then tap Share and Add to Home Screen.',
  'android-manual': 'Open your browser’s menu, then choose Install app or Add to Home screen.'
};
