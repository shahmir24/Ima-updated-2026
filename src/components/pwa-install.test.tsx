import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { InstallApp } from '@/hooks/use-install-app';
import { InstallAppCard } from './settings/InstallAppCard';
import { InstallHint } from './home/InstallHint';
import { INSTALL_HINT_DISMISSED_KEY, writeHintDismissed } from '@/lib/pwa/install-hint';

const app = (over: Partial<InstallApp>): InstallApp => ({
  platform: 'unsupported', standalone: false, installedHere: false, lastOutcome: null, install: vi.fn(async () => 'accepted' as const), ...over
});
const memory = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; }, data };
};
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

describe('Settings — Install iMA card', () => {
  it('a browser prompt is available: an "Install iMA" button', () => {
    const html = renderToString(<InstallAppCard app={app({ platform: 'prompt' })} />);
    expect(html).toMatch(/<button[^>]*>.*Install iMA<\/button>/s);
  });

  it('iPhone/iPad Safari: the Share → Add to Home Screen instruction, and no fake install button', () => {
    const html = renderToString(<InstallAppCard app={app({ platform: 'ios-safari' })} />);
    expect(text(html)).toContain('Tap Share, then Add to Home Screen.');
    expect(html).not.toMatch(/<button/);
  });

  it('other iPhone browsers are pointed to Safari; Android without a prompt gets the menu route', () => {
    expect(text(renderToString(<InstallAppCard app={app({ platform: 'ios-other' })} />))).toContain('Open iMA in Safari, then tap Share and Add to Home Screen.');
    expect(text(renderToString(<InstallAppCard app={app({ platform: 'android-manual' })} />))).toContain('choose Install app or Add to Home screen');
  });

  it('inside the installed app, or where nothing accurate can be offered: no card at all', () => {
    expect(renderToString(<InstallAppCard app={app({ platform: 'installed', standalone: true })} />)).toBe('');
    expect(renderToString(<InstallAppCard app={app({ platform: 'unsupported' })} />)).toBe('');
  });

  it('just installed from this tab: a confirmation, no more install actions', () => {
    const html = renderToString(<InstallAppCard app={app({ platform: 'installed', installedHere: true, lastOutcome: 'accepted' })} />);
    expect(text(html)).toContain('iMA is installed on this device.');
    expect(html).toMatch(/role="status"/);
    expect(html).not.toMatch(/<button/);
  });

  it('the prompt was dismissed: a calm note, and no dead button while the browser has no new prompt', () => {
    const html = renderToString(<InstallAppCard app={app({ platform: 'android-manual', lastOutcome: 'dismissed' })} />);
    expect(text(html)).toContain('you can install iMA any time from your browser’s menu');
    expect(html).not.toMatch(/<button/);
  });
});

describe('Home — install hint', () => {
  it('prompt available and not dismissed: a quiet line with Install and a named dismiss button', () => {
    const html = renderToString(<InstallHint app={app({ platform: 'prompt' })} storage={memory()} />);
    expect(html).toMatch(/<aside aria-label="Install iMA"/);
    expect(html).toMatch(/>Install<\/button>/);
    expect(html).toContain('aria-label="Dismiss install suggestion"');
    expect(html).not.toMatch(/role="dialog"|fixed inset/);
  });

  it('iPhone: the instruction instead of a button', () => {
    const html = renderToString(<InstallHint app={app({ platform: 'ios-safari' })} storage={memory()} />);
    expect(text(html)).toContain('Tap Share, then Add to Home Screen.');
    expect(html).not.toMatch(/>Install<\/button>/);
  });

  it('Android without a browser prompt: the hint shows the menu route — no Install button, no promised prompt', () => {
    const html = renderToString(<InstallHint app={app({ platform: 'android-manual' })} storage={memory()} />);
    expect(html).toMatch(/<aside aria-label="Install iMA"/);
    expect(text(html)).toContain('Open your browser’s menu, then choose Install app or Add to Home screen.');
    expect(html).not.toMatch(/>Install<\/button>/);
    expect(html).toContain('aria-label="Dismiss install suggestion"');
  });

  it('Android: the hint and the Settings card give the same instruction', () => {
    const instruction = 'Open your browser’s menu, then choose Install app or Add to Home screen.';
    expect(text(renderToString(<InstallHint app={app({ platform: 'android-manual' })} storage={memory()} />))).toContain(instruction);
    expect(text(renderToString(<InstallAppCard app={app({ platform: 'android-manual' })} />))).toContain(instruction);
  });

  it('Android, dismissed: stays gone', () => {
    expect(renderToString(<InstallHint app={app({ platform: 'android-manual' })} storage={memory({ [INSTALL_HINT_DISMISSED_KEY]: '1' })} />)).toBe('');
  });

  it.each(['installed', 'unsupported'] as const)('%s: no hint', (platform) => {
    expect(renderToString(<InstallHint app={app({ platform, standalone: platform === 'installed' })} storage={memory()} />)).toBe('');
  });

  it('once dismissed it stays gone — and blocked storage counts as dismissed rather than nagging', () => {
    expect(renderToString(<InstallHint app={app({ platform: 'prompt' })} storage={memory({ [INSTALL_HINT_DISMISSED_KEY]: '1' })} />)).toBe('');
    const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(renderToString(<InstallHint app={app({ platform: 'prompt' })} storage={blocked} />)).toBe('');
  });

  it('dismissing stores a single flag and nothing else', () => {
    const storage = memory();
    writeHintDismissed(storage);
    expect(storage.data).toEqual({ [INSTALL_HINT_DISMISSED_KEY]: '1' });
  });
});

describe('placement — approved layouts keep their order', () => {
  const index = readFileSync(new URL('../pages/Index.tsx', import.meta.url), 'utf8');
  const desktop = readFileSync(new URL('./home/DesktopHome.tsx', import.meta.url), 'utf8');
  const settings = readFileSync(new URL('../pages/ProfileSettings.tsx', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../main.tsx', import.meta.url), 'utf8');

  it('phone Home: the hint comes after the Right Now card and the destination cards, at the end of main', () => {
    const mobile = index.slice(index.indexOf('data-testid="mobile-home"'), index.indexOf('<BottomNavigation />'));
    expect(mobile.indexOf('<RightNowCard')).toBeGreaterThan(-1);
    expect(mobile.indexOf('<InstallHint />')).toBeGreaterThan(mobile.indexOf('to="/body-double"'));
    expect(mobile.slice(mobile.indexOf('<InstallHint />'))).toMatch(/^<InstallHint \/>\s*<\/main>/);
  });

  it('desktop Home: rendered last in the main column, after the destination cards', () => {
    const column = desktop.slice(desktop.indexOf('main column'), desktop.indexOf('right rail'));
    expect(column.indexOf('{installHint}')).toBeGreaterThan(column.lastIndexOf('to="/body-double"'));
  });

  it('Settings: the card follows Gentle Nudges, before Account & Privacy', () => {
    const nudges = settings.indexOf('<GentleNudgesCard');
    const card = settings.indexOf('<InstallAppCard />');
    expect(card).toBeGreaterThan(nudges);
    expect(card).toBeLessThan(settings.indexOf('Account & Privacy */}'));
  });

  it('the prompt is captured before the first render', () => {
    expect(main.indexOf('installPromptStore.start(window)')).toBeGreaterThan(-1);
    expect(main.indexOf('installPromptStore.start(window)')).toBeLessThan(main.indexOf('.render(<App />)'));
  });
});

describe('Soundscape player — follows the system, never resumes on its own', () => {
  const hook = readFileSync(new URL('../hooks/use-soundscape-player.ts', import.meta.url), 'utf8');
  const sync = hook.slice(hook.indexOf('const syncWithContext = useCallback'), hook.indexOf('const syncWithContextRef'));

  it('one AudioContext, with the statechange listener attached where it is created', () => {
    expect(hook.match(/new Constructor\(\)/g)).toHaveLength(1);
    expect(hook.match(/addEventListener\('statechange'/g)).toHaveLength(1);
    expect(hook.indexOf("addEventListener('statechange'")).toBeGreaterThan(hook.indexOf('new Constructor()'));
  });

  it('the sync only updates what is shown — no resume(), no play, no new context', () => {
    expect(sync).toContain('suspensionChange(');
    expect(sync).not.toMatch(/resume\(|play\(|new Constructor|start\(/);
  });

  it('re-checks when the app comes back into view, and a user play or pause clears the system flag', () => {
    const effect = hook.slice(hook.indexOf('const onVisibility'), hook.indexOf("removeEventListener('visibilitychange'"));
    expect(effect).toContain("document.visibilityState === 'visible'");
    expect(effect).toContain('syncWithContextRef.current()');
    expect(effect).toContain("document.addEventListener('visibilitychange', onVisibility)");
    expect(hook.match(/pausedBySystemRef\.current = false;/g)!.length).toBeGreaterThanOrEqual(3);
  });
});

describe('push and the service worker are untouched by this batch', () => {
  it('the worker still handles exactly install, activate, fetch, push and notificationclick', () => {
    const sw = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect([...sw.matchAll(/addEventListener\(\s*'(\w+)'/g)].map((m) => m[1])).toEqual(['install', 'activate', 'fetch', 'push', 'notificationclick']);
  });

  it('the install store does not touch notifications, push or the service worker', () => {
    const store = readFileSync(new URL('../lib/pwa/install-prompt.ts', import.meta.url), 'utf8');
    expect(store).not.toMatch(/serviceWorker|PushManager|Notification|requestPermission/);
  });
});
