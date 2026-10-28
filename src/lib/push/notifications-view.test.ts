import { describe, expect, it } from 'vitest';
import type { NudgePushErrorCode } from './gentle-nudges-push';
import {
  accountAfter,
  quietHoursChange,
  deviceView,
  featureView,
  nudgeErrorText,
  parseTimeInput,
  quietHoursProblem,
  quietHoursSummary,
  timeZoneText,
  toTimeInputValue,
  type FeatureViewInput,
  type PushViewState
} from './notifications-view';

const ready: PushViewState = {
  signedIn: true,
  supported: true,
  installRequired: false,
  configured: true,
  permission: 'default',
  subscribed: false,
  loading: false,
  error: null
};
const on = { permission: 'granted' as const, subscribed: true };

const feature = (push: Partial<PushViewState> = {}, rest: Partial<Omit<FeatureViewInput, 'push'>> = {}) =>
  featureView({
    feature: 'nudges',
    push: { ...ready, ...push },
    accountOn: false,
    pending: null,
    otherPending: false,
    error: null,
    timezoneMissed: false,
    ...rest
  });

// Nothing the user reads may leak keys, env names, codes or browser APIs.
const TECHNICAL = /vapid|vite_|service ?worker|pushmanager|subscription|endpoint|p256dh|supabase|undefined|null|error code|domexception/i;

describe('deviceView — A. This device', () => {
  it.each([
    ['signed out (Guest Mode)', { signedIn: false, supported: false, permission: 'unsupported' as const }, 'Signed out', /sign in/i],
    ['iPhone/iPad outside the Home Screen app', { supported: false, installRequired: true, permission: 'unsupported' as const }, 'Add to Home Screen first', /Add to Home Screen/],
    ['unsupported browser', { supported: false, permission: 'unsupported' as const }, 'Not supported', /can't show notifications/],
    ['missing configuration', { configured: false }, 'Unavailable', /aren't available right now/],
    ['permission blocked', { permission: 'denied' as const }, 'Blocked', /blocked/]
  ])('%s: blocked, with a human message', (_label, push, status, text) => {
    const v = deviceView({ ...ready, ...push });
    expect(v).toMatchObject({ status, blocked: true, connected: false });
    expect(v.notice.text).toMatch(text);
    expect(v.notice.text).not.toMatch(TECHNICAL);
  });

  it('connected only with this account’s subscription and permission granted', () => {
    expect(deviceView({ ...ready, ...on })).toMatchObject({ status: 'Connected', connected: true, blocked: false });
    expect(deviceView({ ...ready, subscribed: true })).toMatchObject({ connected: false });
    expect(deviceView({ ...ready, permission: 'granted' })).toMatchObject({ status: 'Not connected', connected: false });
  });

  it('checking, then unknown when ownership could not be read', () => {
    expect(deviceView({ ...ready, subscribed: null, loading: true }).status).toBe('Checking…');
    expect(deviceView({ ...ready, subscribed: null }).status).toBe('Unknown');
  });
});

describe('featureView — default and signed out', () => {
  it.each(['nudges', 'focus'] as const)('%s is off by default, with nothing to warn about', (name) => {
    expect(feature({}, { feature: name })).toMatchObject({ checked: false, switchDisabled: false, status: 'Off', notice: null, offerTurnOffEverywhere: false });
  });

  it('signed out: off and disabled', () => {
    expect(feature({ signedIn: false })).toMatchObject({ checked: false, switchDisabled: true });
  });
});

describe('featureView — on only once the account AND this device are set up', () => {
  it('Gentle Nudges on here', () => {
    expect(feature(on, { accountOn: true })).toMatchObject({ checked: true, status: 'On', switchDisabled: false });
    expect(feature(on, { accountOn: true }).notice).toEqual({ tone: 'success', text: 'Gentle Nudges are on for this device.' });
  });

  it('Focus alerts on here never claims they are being delivered', () => {
    const v = feature(on, { feature: 'focus', accountOn: true });
    expect(v.checked).toBe(true);
    expect(v.notice?.tone).toBe('info');
    expect(v.notice?.text).toMatch(/None will arrive until delivery is set up/);
  });

  it.each([
    ['account off', on, false],
    ['device not subscribed', { ...on, subscribed: false }, true],
    ['device not checked yet', { ...on, subscribed: null }, true],
    ['permission not granted', { ...on, permission: 'default' as const }, true]
  ])('%s → off', (_label, push, accountOn) => {
    expect(feature(push, { accountOn }).checked).toBe(false);
  });

  it('while enabling the switch stays off and cannot be tapped again', () => {
    expect(feature({ loading: true }, { pending: 'enable' })).toMatchObject({ checked: false, switchDisabled: true, status: 'Turning on…', notice: null });
  });

  it('while the OTHER feature is changing, this one waits', () => {
    expect(feature(on, { accountOn: true, otherPending: true })).toMatchObject({ checked: true, switchDisabled: true, notice: null });
  });

  it('while disabling, it says so', () => {
    expect(feature({ ...on, loading: true }, { accountOn: true, pending: 'disable' })).toMatchObject({ status: 'Turning off…', switchDisabled: true });
  });

  it('notes a time zone that could not be saved', () => {
    expect(feature(on, { accountOn: true, timezoneMissed: true }).notice?.tone).toBe('warning');
  });

  it.each(['nudges', 'focus'] as const)('%s on for the account but not this device: explains, and offers turning off everywhere', (name) => {
    const v = feature({ subscribed: false }, { feature: name, accountOn: true });
    expect(v.checked).toBe(false);
    expect(v.notice?.text).toMatch(/this device/);
    expect(v.offerTurnOffEverywhere).toBe(true);
  });

  it('a blocked device cannot turn a feature on, but can still turn one off', () => {
    expect(feature({ permission: 'denied' }).switchDisabled).toBe(true);
    const v = feature({ ...on, permission: 'denied' }, { accountOn: true });
    expect(v.checked).toBe(false);
    expect(v.offerTurnOffEverywhere).toBe(true);
  });
});

describe('errors from enable()/disable()', () => {
  const codes: [NudgePushErrorCode, RegExp][] = [
    ['unsupported', /can't show notifications/],
    ['install-required', /Home Screen/],
    ['not-configured', /aren't available/],
    ['permission-denied', /blocked/],
    ['permission-dismissed', /try again whenever/],
    ['service-worker-unavailable', /reload the page/],
    ['subscribe-failed', /couldn't set up notifications/],
    ['register-failed', /couldn't save this device/],
    ['settings-failed', /couldn't save your notification setting/],
    ['disable-failed', /couldn't turn that off/],
    ['busy', /still finishing/]
  ];

  it.each(codes)('%s → a plain-language error, never the code or the raw message', (code, text) => {
    const v = feature({}, { error: { code, message: 'DOMException: AbortError at pushManager.subscribe (VAPID)' } });
    expect(v.notice?.tone).toBe('error');
    expect(v.notice?.text).toMatch(text);
    expect(v.notice?.text).not.toContain(code);
    expect(v.notice?.text).not.toMatch(TECHNICAL);
  });

  it('an unknown code still reads as plain language', () => {
    expect(nudgeErrorText('weird-new-code')).toBe('Something went wrong with notifications. Please try again.');
  });
});

describe('quiet hours and time zone', () => {
  it('equal start and end are refused only while quiet hours are on', () => {
    expect(quietHoursProblem(true, '22:00', '22:00')).toMatch(/different start and end/);
    expect(quietHoursProblem(false, '22:00', '22:00')).toBeNull();
    expect(quietHoursProblem(true, '22:00', '07:00')).toBeNull();
    expect(quietHoursProblem(true, null, '07:00')).toBeNull();
  });

  it('describes same-day and overnight ranges', () => {
    expect(quietHoursSummary('13:00', '15:00')).toBe('13:00 to 15:00');
    expect(quietHoursSummary('22:00', '07:00')).toBe('22:00 to 07:00 the next morning');
  });

  it('shows the saved zone, and says when this device differs', () => {
    expect(timeZoneText('Europe/London', 'Europe/London')).toBe('Nudge times and quiet hours use Europe/London.');
    expect(timeZoneText(null, null)).toBe('Nudge times and quiet hours use UTC.');
    expect(timeZoneText('UTC', 'Asia/Karachi')).toMatch(/This device is set to Asia\/Karachi; it is saved the next time/);
  });
});

describe('time conversion', () => {
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

  it('uses the given fallback (quiet hours default to 22:00–07:00)', () => {
    expect(toTimeInputValue(undefined, '22:00')).toBe('22:00');
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

describe('accountAfter — what the switches show once enable/disable settles', () => {
  const flags = (nudges_enabled: boolean, focus_alerts_enabled: boolean) => ({ nudges_enabled, focus_alerts_enabled });

  it("uses the server's switches when they came back: a later opt-in in another tab shows ON here", () => {
    const after = accountAfter({}, 'nudges', false, { ok: true, timezoneSaved: false, device: 'kept', flags: flags(true, false) });
    expect(after).toEqual({ nudges: true, focus: false });
  });

  it('also corrects the other switch from the server', () => {
    expect(accountAfter({ focus: false }, 'nudges', false, { ok: true, timezoneSaved: false, device: 'kept', flags: flags(false, true) })).toEqual({
      nudges: false,
      focus: true
    });
  });

  it('without the server switches, shows what was asked for', () => {
    expect(accountAfter({ focus: true }, 'nudges', true, { ok: true, timezoneSaved: true })).toEqual({ focus: true, nudges: true });
    expect(accountAfter({}, 'focus', false, { ok: true, timezoneSaved: false, device: 'kept' })).toEqual({ focus: false });
  });

  it('a failure (including busy) changes nothing', () => {
    const current = { nudges: true };
    expect(accountAfter(current, 'nudges', false, { ok: false, error: { code: 'busy', message: '' } })).toBe(current);
  });
});

describe('quietHoursChange — never shown on unless it can be saved on', () => {
  const draft = (on: boolean, start: string, end: string) => ({ on, start, end });

  it('turning on a valid overnight range saves it whole', () => {
    expect(quietHoursChange(draft(false, '22:00', '07:00'), { on: true })).toEqual({
      shownOn: true,
      patch: { quiet_hours_enabled: true, quiet_hours_start: '22:00', quiet_hours_end: '07:00' },
      refused: null
    });
  });

  it('turning on with equal times is refused: the switch stays off and nothing is saved', () => {
    const change = quietHoursChange(draft(false, '09:00', '09:00'), { on: true });
    expect(change).toMatchObject({ shownOn: false, patch: null });
    expect(change.refused).toMatch(/different start and end times/);
  });

  it('turning on with a half-typed time is refused the same way', () => {
    expect(quietHoursChange(draft(false, '', '07:00'), { on: true })).toMatchObject({ shownOn: false, patch: null });
  });

  it('turning off always saves, whatever the inputs hold', () => {
    expect(quietHoursChange(draft(true, '09:00', '09:00'), { on: false })).toEqual({ shownOn: false, patch: { quiet_hours_enabled: false }, refused: null });
  });

  it('while on, an edit to equal times saves nothing and the saved range stays on', () => {
    expect(quietHoursChange(draft(true, '22:00', '07:00'), { end: '22:00' })).toEqual({ shownOn: true, patch: null, refused: null });
  });

  it('while off, an edit saves only that time', () => {
    expect(quietHoursChange(draft(false, '22:00', '07:00'), { start: '23:15' })).toEqual({
      shownOn: false,
      patch: { quiet_hours_enabled: false, quiet_hours_start: '23:15' },
      refused: null
    });
  });
});
