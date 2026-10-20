import { describe, expect, it } from 'vitest';
import { showsInstallHint } from './install-hint';

describe('which platforms get the Home install hint', () => {
  it('every route with a real way to install: native prompt, iPhone/iPad, and Android without a prompt', () => {
    for (const platform of ['prompt', 'ios-safari', 'ios-other', 'android-manual'] as const) {
      expect(showsInstallHint(platform, false), platform).toBe(true);
    }
  });

  it('never when installed, unsupported, or dismissed', () => {
    expect(showsInstallHint('installed', false)).toBe(false);
    expect(showsInstallHint('unsupported', false)).toBe(false);
    for (const platform of ['prompt', 'ios-safari', 'ios-other', 'android-manual'] as const) {
      expect(showsInstallHint(platform, true), platform).toBe(false);
    }
  });
});
