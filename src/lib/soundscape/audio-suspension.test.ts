import { describe, expect, it } from 'vitest';
import { suspensionChange, SYSTEM_PAUSED_MESSAGE } from './audio-suspension';

const base = { status: 'playing' as const, hasSource: true, pausedBySystem: false, state: 'running' as const };

describe('Soundscape and system audio suspension', () => {
  it('playing, then the OS suspends or interrupts the context: show paused (never "Playing" over silence)', () => {
    expect(suspensionChange({ ...base, state: 'suspended' })).toBe('paused-by-system');
    expect(suspensionChange({ ...base, state: 'interrupted' })).toBe('paused-by-system');
    expect(suspensionChange({ ...base, state: 'closed' })).toBe('paused-by-system');
  });

  it('the user’s own pause is not mistaken for the system’s, and never turns back into "Playing" by itself', () => {
    expect(suspensionChange({ ...base, status: 'paused', state: 'suspended' })).toBeNull();
    expect(suspensionChange({ ...base, status: 'paused', state: 'running' })).toBeNull();
  });

  it('only a pause the system made follows the system back to running (e.g. after a phone call)', () => {
    expect(suspensionChange({ ...base, status: 'paused', pausedBySystem: true, state: 'running' })).toBe('running-again');
    expect(suspensionChange({ ...base, status: 'paused', pausedBySystem: true, state: 'suspended' })).toBeNull();
  });

  it('nothing loaded, loading, idle or in error: nothing to correct', () => {
    expect(suspensionChange({ ...base, hasSource: false, state: 'suspended' })).toBeNull();
    for (const status of ['idle', 'loading', 'error'] as const) {
      expect(suspensionChange({ ...base, status, state: 'suspended' })).toBeNull();
    }
    expect(suspensionChange(base)).toBeNull();
  });

  it('tells the user what happened and what to do', () => {
    expect(SYSTEM_PAUSED_MESSAGE).toBe('Your device paused the sound. Tap play to resume.');
  });
});
