import { describe, expect, it, vi } from 'vitest';
import { createInstallPromptStore } from './install-prompt';

function fakeWindow() {
  const listeners: Record<string, (event: Event) => void> = {};
  return {
    target: { addEventListener: vi.fn((type: string, listener: (event: Event) => void) => { listeners[type] = listener; }) },
    fire: (type: string, event: Event) => listeners[type]?.(event)
  };
}

function promptEvent(outcome: 'accepted' | 'dismissed', options: { promptThrows?: boolean } = {}) {
  const event = new Event('beforeinstallprompt') as Event & { prompt: ReturnType<typeof vi.fn>; userChoice: Promise<{ outcome: string }> };
  event.prompt = vi.fn(async () => {
    if (options.promptThrows) throw new DOMException('already used', 'InvalidStateError');
  });
  event.userChoice = Promise.resolve({ outcome });
  vi.spyOn(event, 'preventDefault');
  return event;
}

describe('install prompt store', () => {
  it('no prompt yet: nothing available, and asking is a safe no-op', async () => {
    const store = createInstallPromptStore();
    store.start(fakeWindow().target);
    expect(store.getSnapshot()).toEqual({ available: false, installed: false, lastOutcome: null });
    await expect(store.prompt()).resolves.toBe('unavailable');
  });

  it('keeps the browser’s prompt for later (no automatic mini-infobar) and says it is available', () => {
    const store = createInstallPromptStore();
    const win = fakeWindow();
    store.start(win.target);
    const event = promptEvent('accepted');
    const seen = vi.fn();
    store.subscribe(seen);
    win.fire('beforeinstallprompt', event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.prompt).not.toHaveBeenCalled();
    expect(store.getSnapshot().available).toBe(true);
    expect(seen).toHaveBeenCalled();
  });

  it('accepted: opens the prompt once, then reports installed and nothing left to offer', async () => {
    const store = createInstallPromptStore();
    const win = fakeWindow();
    store.start(win.target);
    const event = promptEvent('accepted');
    win.fire('beforeinstallprompt', event);
    await expect(store.prompt()).resolves.toBe('accepted');
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toEqual({ available: false, installed: true, lastOutcome: 'accepted' });
    // Single use: a second click cannot reopen a spent event.
    await expect(store.prompt()).resolves.toBe('unavailable');
    expect(event.prompt).toHaveBeenCalledTimes(1);
  });

  it('dismissed: not installed, and the button goes until the browser offers a new prompt', async () => {
    const store = createInstallPromptStore();
    const win = fakeWindow();
    store.start(win.target);
    win.fire('beforeinstallprompt', promptEvent('dismissed'));
    await expect(store.prompt()).resolves.toBe('dismissed');
    expect(store.getSnapshot()).toEqual({ available: false, installed: false, lastOutcome: 'dismissed' });
    win.fire('beforeinstallprompt', promptEvent('accepted'));
    expect(store.getSnapshot().available).toBe(true);
  });

  it('appinstalled (e.g. from the browser menu) marks it installed and drops any waiting prompt', () => {
    const store = createInstallPromptStore();
    const win = fakeWindow();
    store.start(win.target);
    win.fire('beforeinstallprompt', promptEvent('accepted'));
    win.fire('appinstalled', new Event('appinstalled'));
    expect(store.getSnapshot()).toMatchObject({ available: false, installed: true });
  });

  it('a prompt that throws is reported, not thrown', async () => {
    const store = createInstallPromptStore();
    const win = fakeWindow();
    store.start(win.target);
    win.fire('beforeinstallprompt', promptEvent('accepted', { promptThrows: true }));
    await expect(store.prompt()).resolves.toBe('unavailable');
    expect(store.getSnapshot().installed).toBe(false);
  });

  it('starting twice listens once', () => {
    const store = createInstallPromptStore();
    const win = fakeWindow();
    store.start(win.target);
    store.start(win.target);
    expect(win.target.addEventListener).toHaveBeenCalledTimes(2); // beforeinstallprompt + appinstalled
  });
});
