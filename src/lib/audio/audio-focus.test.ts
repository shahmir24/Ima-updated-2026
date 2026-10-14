import { describe, expect, it, vi } from 'vitest';
import { createAudioFocus } from './audio-focus';

describe('audio focus', () => {
  it('is free until claimed, and free again once released', () => {
    const focus = createAudioFocus();
    expect(focus.isClaimed()).toBe(false);
    const release = focus.claim();
    expect(focus.isClaimed()).toBe(true);
    release();
    expect(focus.isClaimed()).toBe(false);
  });

  it('notifies only when "claimed" flips', () => {
    const focus = createAudioFocus();
    const listener = vi.fn();
    focus.subscribe(listener);
    const a = focus.claim();
    const b = focus.claim();
    a();
    b();
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('two claimants never release each other', () => {
    const focus = createAudioFocus();
    const a = focus.claim();
    const b = focus.claim();
    a();
    expect(focus.isClaimed()).toBe(true);
    b();
    expect(focus.isClaimed()).toBe(false);
  });

  it('releasing twice is harmless (an effect cleanup run twice cannot under-count)', () => {
    const focus = createAudioFocus();
    const a = focus.claim();
    const b = focus.claim();
    a();
    a();
    expect(focus.isClaimed()).toBe(true);
    b();
    expect(focus.isClaimed()).toBe(false);
  });

  it('unsubscribed listeners hear nothing', () => {
    const focus = createAudioFocus();
    const listener = vi.fn();
    const off = focus.subscribe(listener);
    off();
    focus.claim()();
    expect(listener).not.toHaveBeenCalled();
  });
});
