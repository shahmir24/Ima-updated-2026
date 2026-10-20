import { describe, expect, it } from 'vitest';
import { installPlatform, isIosDevice, isStandaloneDisplay, INSTALL_INSTRUCTIONS } from './install-platform';

const UA = {
  androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  iphoneChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.0.0 Mobile/15E148 Safari/604.1',
  iphoneInstagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0',
  ipadDesktopMode: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  desktopChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  desktopFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0'
};
const env = (userAgent: string, over: Partial<Parameters<typeof installPlatform>[0]> = {}) =>
  installPlatform({ userAgent, maxTouchPoints: 0, standalone: false, promptAvailable: false, installedHere: false, ...over });

describe('which install route this browser has', () => {
  it('a captured browser prompt means the native prompt (Android or desktop Chromium)', () => {
    expect(env(UA.androidChrome, { promptAvailable: true })).toBe('prompt');
    expect(env(UA.desktopChrome, { promptAvailable: true })).toBe('prompt');
  });

  it('no prompt: Android gets menu instructions; desktop Chromium, Firefox and Mac Safari get nothing', () => {
    expect(env(UA.androidChrome)).toBe('android-manual');
    expect(env(UA.desktopChrome)).toBe('unsupported');
    expect(env(UA.desktopFirefox)).toBe('unsupported');
    expect(env(UA.macSafari, { maxTouchPoints: 0 })).toBe('unsupported');
  });

  it('iPhone and iPad: Safari gets Share → Add to Home Screen; other iOS browsers are pointed to Safari', () => {
    expect(env(UA.iphoneSafari, { maxTouchPoints: 5 })).toBe('ios-safari');
    expect(env(UA.ipadDesktopMode, { maxTouchPoints: 5 })).toBe('ios-safari');
    expect(env(UA.iphoneChrome, { maxTouchPoints: 5 })).toBe('ios-other');
    expect(env(UA.iphoneInstagram, { maxTouchPoints: 5 })).toBe('ios-other');
  });

  it('Android Chrome before (or without) beforeinstallprompt is the manual menu route; once the prompt arrives it is the native one', () => {
    expect(env(UA.androidChrome, { maxTouchPoints: 5 })).toBe('android-manual');
    expect(env(UA.androidChrome, { maxTouchPoints: 5, promptAvailable: true })).toBe('prompt');
    // Installed Android app: no offer at all.
    expect(env(UA.androidChrome, { maxTouchPoints: 5, standalone: true })).toBe('installed');
  });

  it('running installed, or installed from this tab, wins over everything — no redundant offers', () => {
    expect(env(UA.iphoneSafari, { standalone: true })).toBe('installed');
    expect(env(UA.androidChrome, { promptAvailable: true, standalone: true })).toBe('installed');
    expect(env(UA.desktopChrome, { installedHere: true })).toBe('installed');
  });

  it('iPadOS posing as a Mac is still recognised by its touch points', () => {
    expect(isIosDevice(UA.ipadDesktopMode, 5)).toBe(true);
    expect(isIosDevice(UA.macSafari, 0)).toBe(false);
  });

  it('the instructions say exactly what the brief asked for on iPhone', () => {
    expect(INSTALL_INSTRUCTIONS['ios-safari']).toBe('Tap Share, then Add to Home Screen.');
  });
});

describe('standalone detection', () => {
  const win = (matching: string[]) => ({ matchMedia: (q: string) => ({ matches: matching.some((m) => q.includes(m)) }) as MediaQueryList });

  it('display-mode standalone, fullscreen or minimal-ui, or iOS navigator.standalone', () => {
    expect(isStandaloneDisplay(win(['standalone']), {})).toBe(true);
    expect(isStandaloneDisplay(win(['minimal-ui']), {})).toBe(true);
    expect(isStandaloneDisplay(win([]), { standalone: true })).toBe(true);
  });

  it('a normal browser tab is not standalone, and a missing or throwing matchMedia is safe', () => {
    expect(isStandaloneDisplay(win([]), {})).toBe(false);
    expect(isStandaloneDisplay(undefined, undefined)).toBe(false);
    expect(isStandaloneDisplay({ matchMedia: () => { throw new Error('x'); } } as unknown as Window, {})).toBe(false);
  });
});
