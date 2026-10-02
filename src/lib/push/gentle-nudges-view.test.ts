import { describe, expect, it } from 'vitest';
import type { NudgePushErrorCode, NudgePushState } from './gentle-nudges-push';
import { gentleNudgesView, nudgeErrorText, parseTimeInput, toTimeInputValue, type GentleNudgesViewInput } from './gentle-nudges-view';

const ready: NudgePushState & { signedIn: boolean } = {
  signedIn: true,
  supported: true,
  installRequired: false,
  configured: true,
  permission: 'default',
  subscribed: false,
  loading: false,
  error: null
};

const view = (push: Partial<GentleNudgesViewInput['push']> = {}, rest: Partial<Omit<GentleNudgesViewInput, 'push'>> = {}) =>
  gentleNudgesView({ push: { ...ready, ...push }, accountOn: false, pending: null, timezoneMissed: false, ...rest });

const on = { permission: 'granted' as const, subscribed: true };

// Nothing the user reads may leak keys, env names, codes or browser APIs.
const TECHNICAL = /vapid|vite_|service ?worker|pushmanager|subscription|endpoint|p256dh|supabase|undefined|null|error code|domexception/i;

describe('gentleNudgesView — default and signed out', () => {
  it('is off by default, with nothing to warn about', () => {
    expect(view()).toMatchObject({ checked: false, switchDisabled: false, status: 'Off', notice: null, offerTurnOffEverywhere: false });
  });

  it('signed out (Guest Mode): off, every control disabled, asks to sign in', () => {
    const v = view({ signedIn: false, supported: false, permission: 'unsupported' });
    expect(v).toMatchObject({ checked: false, switchDisabled: true, detailsEditable: false });
    expect(v.notice?.text).toMatch(/sign in/i);
  });
});

describe('gentleNudgesView — only on once the account AND this device are set up', () => {
  it('account on + device subscribed + permission granted → on', () => {
    expect(view(on, { accountOn: true })).toMatchObject({ checked: true, status: 'On', switchDisabled: false });
    expect(view(on, { accountOn: true }).notice).toEqual({ tone: 'success', text: 'Nudges are on for this device.' });
  });

  it.each([
    ['account off', on, false],
    ['device not subscribed', { ...on, subscribed: false }, true],
    ['device not checked yet', { ...on, subscribed: null }, true],
    ['permission not granted', { ...on, permission: 'default' as const }, true]
  ])('%s → off', (_label, push, accountOn) => {
    expect(view(push, { accountOn }).checked).toBe(false);
  });

  it('while enabling the switch stays off and cannot be tapped again', () => {
    const v = view({ loading: true }, { pending: 'enable' });
    expect(v).toMatchObject({ checked: false, switchDisabled: true, status: 'Turning on…', notice: null });
  });

  it('while disabling, it says so', () => {
    expect(view({ ...on, loading: true }, { accountOn: true, pending: 'disable' })).toMatchObject({ status: 'Turning off…', switchDisabled: true });
  });

  it('while reading this device it says it is checking', () => {
    expect(view({ loading: true, subscribed: null })).toMatchObject({ status: 'Checking this device…', switchDisabled: true });
  });

  it('notes a time zone that could not be saved', () => {
    expect(view(on, { accountOn: true, timezoneMissed: true }).notice?.tone).toBe('warning');
  });

  it('account on but not this device: explains, and offers turning off everywhere', () => {
    const v = view({ subscribed: false }, { accountOn: true });
    expect(v.checked).toBe(false);
    expect(v.notice?.text).toMatch(/not on this device/);
    expect(v.offerTurnOffEverywhere).toBe(true);
  });
});

describe('gentleNudgesView — states that block turning nudges on', () => {
  it.each([
    ['iPhone/iPad outside the Home Screen app', { supported: false, installRequired: true, permission: 'unsupported' as const }, /Add to Home Screen/],
    ['unsupported browser', { supported: false, permission: 'unsupported' as const }, /can't show notifications/],
    ['missing configuration', { configured: false }, /aren't available right now/],
    ['permission blocked', { permission: 'denied' as const }, /blocked/]
  ])('%s: switch disabled, human message', (_label, push, text) => {
    const v = view(push);
    expect(v.switchDisabled).toBe(true);
    expect(v.checked).toBe(false);
    expect(v.notice?.text).toMatch(text);
    expect(v.notice?.text).not.toMatch(TECHNICAL);
  });

  it('a blocked device can still turn OFF nudges that are on', () => {
    // Account on, device subscribed, but permission later revoked.
    const v = view({ ...on, permission: 'denied' }, { accountOn: true });
    expect(v.checked).toBe(false);
    expect(v.offerTurnOffEverywhere).toBe(true);
  });
});

describe('gentleNudgesView — errors from enable()/disable()', () => {
  const codes: [NudgePushErrorCode, RegExp][] = [
    ['unsupported', /can't show notifications/],
    ['install-required', /Home Screen/],
    ['not-configured', /aren't available/],
    ['permission-denied', /blocked/],
    ['permission-dismissed', /try again whenever/],
    ['service-worker-unavailable', /reload the page/],
    ['subscribe-failed', /couldn't set up notifications/],
    ['register-failed', /couldn't save this device/],
    ['settings-failed', /couldn't save your nudge setting/],
    ['disable-failed', /couldn't turn nudges off/]
  ];

  it.each(codes)('%s → a plain-language error, never the code or the raw message', (code, text) => {
    const v = view({ error: { code, message: 'DOMException: AbortError at pushManager.subscribe (VAPID)' } });
    expect(v.notice?.tone).toBe('error');
    expect(v.notice?.text).toMatch(text);
    expect(v.notice?.text).not.toContain(code);
    expect(v.notice?.text).not.toMatch(TECHNICAL);
  });

  it('an unknown code still reads as plain language', () => {
    expect(nudgeErrorText('weird-new-code')).toBe('Something went wrong with nudges. Please try again.');
  });
});

describe('nudge time conversion', () => {
  it.each([
    ['09:00:00', '09:00'],
    ['21:30:00', '21:30'],
    ['07:05', '07:05'],
    [null, '09:00'],
    [undefined, '09:00'],
    ['garbage', '09:00'],
    ['25:00:00', '09:00']
  ])('stored %s → input %s', (stored, input) => {
    expect(toTimeInputValue(stored)).toBe(input);
  });

  it.each([
    ['08:15', '08:15'],
    ['08:15:00', '08:15'],
    ['', null],
    ['8:1', null],
    ['24:00', null]
  ])('input %s → saved %s', (value, saved) => {
    expect(parseTimeInput(value)).toBe(saved);
  });
});
