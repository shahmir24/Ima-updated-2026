import type { NudgePushError, NudgePushErrorCode, NudgePushResult, NudgePushState, PushFeature } from './gentle-nudges-push';

/**
 * What the Notifications card on Settings shows, worked out from the push
 * controller's state and the saved account settings. Plain functions, so
 * every state can be tested without a browser.
 *
 * Every string here is written for the person using iMA. None of them names a
 * key, an environment variable, an error code or a browser API. None of them
 * says Focus alerts are being delivered: this stage only saves the choice and
 * connects the device.
 */

export type NudgeNoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface NudgeNotice {
  tone: NudgeNoticeTone;
  text: string;
}

export type PushViewState = NudgePushState & { signedIn: boolean };

const COPY = {
  signedOut: 'Sign in to turn on notifications. They need an account so iMA knows what to send you.',
  installRequired:
    'On iPhone and iPad, notifications work once iMA is on your Home Screen. In Safari, tap Share, then “Add to Home Screen”, open iMA from there and turn notifications on.',
  unsupported: "This browser can't show notifications from iMA. A recent version of Chrome, Edge, Firefox or Safari can.",
  notConfigured: "Notifications aren't available right now. Please check back later.",
  permissionDenied:
    'Notifications are blocked for iMA. To get them, allow notifications for iMA in your browser or device settings, then come back here.',
  permissionDismissed: 'Notifications weren’t allowed, so this is still off. You can try again whenever you like.',
  serviceWorkerUnavailable: "iMA couldn't finish setting up notifications. Please reload the page and try again.",
  subscribeFailed: "Your browser couldn't set up notifications for iMA. Please try again in a moment.",
  registerFailed: "We couldn't save this device for notifications. Please check your connection and try again.",
  settingsFailed: "We couldn't save your notification setting. Please try again.",
  disableFailed: "We couldn't turn that off. Please check your connection and try again.",
  busy: 'Another notification change is still finishing. Please try again in a moment.',
  deviceConnected: 'This device can receive notifications from iMA.',
  deviceNotConnected: 'Not connected yet. Turning on Focus alerts or Gentle Nudges connects this device.',
  deviceUnknown: "We couldn't check this device just now. Please check your connection.",
  nudgesOnHere: 'Gentle Nudges are on for this device.',
  nudgesTimezoneMissed:
    "Gentle Nudges are on. We couldn't save your time zone, so the time may be off — try turning nudges off and on again.",
  nudgesOnElsewhere:
    'Gentle Nudges are on for your account, but not on this device yet. Turn them on here to get them on this device too.',
  focusOnHere: 'Focus alerts are on for your account, and this device is ready. None will arrive until delivery is set up.',
  focusOnElsewhere:
    'Focus alerts are on for your account, but this device isn’t connected. Turn them on here so this device is ready for them.'
} as const;

const ERROR_COPY: Record<NudgePushErrorCode, string> = {
  unsupported: COPY.unsupported,
  'install-required': COPY.installRequired,
  'not-configured': COPY.notConfigured,
  'permission-denied': COPY.permissionDenied,
  'permission-dismissed': COPY.permissionDismissed,
  'service-worker-unavailable': COPY.serviceWorkerUnavailable,
  'subscribe-failed': COPY.subscribeFailed,
  'register-failed': COPY.registerFailed,
  'settings-failed': COPY.settingsFailed,
  'disable-failed': COPY.disableFailed,
  busy: COPY.busy
};

/** Human copy for a controller error. Unknown codes get a generic line, never the code. */
export function nudgeErrorText(code: string): string {
  return (ERROR_COPY as Record<string, string>)[code] ?? 'Something went wrong with notifications. Please try again.';
}

// ---------------------------------------------------------------------------
// A. This device
// ---------------------------------------------------------------------------

export interface DeviceView {
  /** A short status: Connected, Not connected, Needs Home Screen… */
  status: string;
  notice: NudgeNotice;
  /** This device cannot be connected as things stand; neither feature can be turned on here. */
  blocked: boolean;
  /** This device holds this account's subscription, with permission granted. */
  connected: boolean;
}

export function deviceView(push: PushViewState): DeviceView {
  const connected = push.signedIn && push.supported && push.subscribed === true && push.permission === 'granted';
  const blocked = (status: string, tone: NudgeNoticeTone, text: string): DeviceView => ({
    status,
    notice: { tone, text },
    blocked: true,
    connected
  });
  if (!push.signedIn) return blocked('Signed out', 'info', COPY.signedOut);
  if (push.installRequired) return blocked('Add to Home Screen first', 'info', COPY.installRequired);
  if (!push.supported) return blocked('Not supported', 'info', COPY.unsupported);
  if (!push.configured) return blocked('Unavailable', 'info', COPY.notConfigured);
  if (push.permission === 'denied') return blocked('Blocked', 'warning', COPY.permissionDenied);

  const ready = (status: string, tone: NudgeNoticeTone, text: string): DeviceView => ({
    status,
    notice: { tone, text },
    blocked: false,
    connected
  });
  if (connected) return ready('Connected', 'success', COPY.deviceConnected);
  if (push.subscribed === null) {
    return push.loading ? ready('Checking…', 'info', 'Checking this device…') : ready('Unknown', 'warning', COPY.deviceUnknown);
  }
  return ready('Not connected', 'info', COPY.deviceNotConnected);
}

// ---------------------------------------------------------------------------
// B, C. One feature's switch
// ---------------------------------------------------------------------------

export interface FeatureViewInput {
  feature: PushFeature;
  push: PushViewState;
  /** The feature's account switch as last saved (nudges_enabled / focus_alerts_enabled). */
  accountOn: boolean;
  /** Which action this screen is running for THIS feature, if any. */
  pending: 'enable' | 'disable' | null;
  /** A change to the other feature is running: this one waits. */
  otherPending: boolean;
  /** This feature's last failure on this screen. */
  error: NudgePushError | null;
  /** The last enable succeeded but the device's time zone was not saved. */
  timezoneMissed: boolean;
}

export interface FeatureView {
  /** On only when the account AND this device are set up. */
  checked: boolean;
  switchDisabled: boolean;
  /** A one-line status beside the switch. */
  status: string;
  notice: NudgeNotice | null;
  /** On for the account, but this device can't show it: offer turning it off everywhere. */
  offerTurnOffEverywhere: boolean;
}

export function featureView({ feature, push, accountOn, pending, otherPending, error, timezoneMissed }: FeatureViewInput): FeatureView {
  if (!push.signedIn) {
    return { checked: false, switchDisabled: true, status: 'Off', notice: null, offerTurnOffEverywhere: false };
  }

  const device = deviceView(push);
  const busy = pending !== null || otherPending || push.loading;
  const checked = accountOn && device.connected;

  let status = checked ? 'On' : 'Off';
  if (pending === 'enable') status = 'Turning on…';
  else if (pending === 'disable') status = 'Turning off…';

  let notice: NudgeNotice | null = null;
  if (error) notice = { tone: 'error', text: nudgeErrorText(error.code) };
  else if (busy) notice = null;
  else if (checked && feature === 'focus') notice = { tone: 'info', text: COPY.focusOnHere };
  else if (checked) notice = timezoneMissed ? { tone: 'warning', text: COPY.nudgesTimezoneMissed } : { tone: 'success', text: COPY.nudgesOnHere };
  else if (accountOn && push.subscribed !== null) {
    notice = { tone: 'info', text: feature === 'focus' ? COPY.focusOnElsewhere : COPY.nudgesOnElsewhere };
  }

  return {
    checked,
    // Turning OFF is always allowed; turning on is not when the device can't.
    switchDisabled: busy || (!checked && device.blocked),
    status,
    notice,
    offerTurnOffEverywhere: accountOn && !checked && !busy && push.subscribed !== null
  };
}

/** Each feature's account switch as this screen shows it, until the saved settings are reloaded. */
export type AccountSwitches = Partial<Record<PushFeature, boolean>>;

/**
 * The switches to show after enable/disable settles. A failure changes
 * nothing. When the server's switches came back (turning a feature off reads
 * them), they win over what was asked for: another tab may have turned this
 * feature back on after this one saved "off".
 */
export function accountAfter(current: AccountSwitches, feature: PushFeature, on: boolean, result: NudgePushResult): AccountSwitches {
  if (!result.ok) return current;
  if ('flags' in result && result.flags) {
    return { nudges: result.flags.nudges_enabled, focus: result.flags.focus_alerts_enabled };
  }
  return { ...current, [feature]: on };
}

// ---------------------------------------------------------------------------
// D. Quiet hours, F. Time zone, and time inputs
// ---------------------------------------------------------------------------

/** Why these quiet hours cannot be saved, or null. Mirrors the user_settings_quiet_hours_range check. */
export function quietHoursProblem(enabled: boolean, start: string | null, end: string | null): string | null {
  if (!enabled || !start || !end) return null;
  return start === end ? 'Quiet hours need different start and end times.' : null;
}

export interface QuietHoursDraft {
  on: boolean;
  /** As shown in the inputs, possibly half-typed. */
  start: string;
  end: string;
}

export interface QuietHoursPatch {
  quiet_hours_enabled: boolean;
  quiet_hours_start?: string;
  quiet_hours_end?: string;
}

export interface QuietHoursChange {
  /** Whether the switch should show on. Never on for a range that was not saved as on. */
  shownOn: boolean;
  /** What to save, or null when nothing may be saved yet. */
  patch: QuietHoursPatch | null;
  /** Why turning quiet hours on was refused, or null. */
  refused: string | null;
}

/**
 * One change to quiet hours: the switch, or a start/end edit. While on they
 * are saved whole, and never in a state the database's check would refuse.
 * Turning them on with a range that cannot be saved leaves the switch off.
 */
export function quietHoursChange(draft: QuietHoursDraft, next: { on?: boolean; start?: string; end?: string }): QuietHoursChange {
  // Turning them off is always allowed and saved, whatever the inputs hold.
  if (next.on === false) return { shownOn: false, patch: { quiet_hours_enabled: false }, refused: null };
  const on = next.on ?? draft.on;
  const start = parseTimeInput(next.start ?? draft.start);
  const end = parseTimeInput(next.end ?? draft.end);
  const turningOn = next.on === true;
  if (!start || !end || quietHoursProblem(on, start, end)) {
    return {
      shownOn: turningOn ? false : on,
      patch: null,
      refused: turningOn ? 'Choose different start and end times, then turn quiet hours on.' : null
    };
  }
  const patch: QuietHoursPatch = on
    ? { quiet_hours_enabled: true, quiet_hours_start: start, quiet_hours_end: end }
    : { quiet_hours_enabled: false, ...(next.start ? { quiet_hours_start: start } : {}), ...(next.end ? { quiet_hours_end: end } : {}) };
  return { shownOn: on, patch, refused: null };
}

/** "22:00 to 07:00 (overnight)" — what the quiet hours mean, in words. */
export function quietHoursSummary(start: string, end: string): string {
  return start > end ? `${start} to ${end} the next morning` : `${start} to ${end}`;
}

/** The time zone line: what is saved, and whether this device differs. */
export function timeZoneText(saved: string | null | undefined, device: string | null | undefined): string {
  const zone = saved?.trim() || 'UTC';
  const base = `Nudge times and quiet hours use ${zone}.`;
  if (!device || device === zone) return base;
  return `${base} This device is set to ${device}; it is saved the next time you change a notification setting here.`;
}

/** This device's IANA time zone, or null where the browser does not say. */
export function deviceTimeZone(): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof zone === 'string' && zone.trim() ? zone.trim() : null;
  } catch {
    return null;
  }
}

/** A stored time ("09:00:00") as an <input type="time"> value ("09:00"); `fallback` when unusable. */
export function toTimeInputValue(stored: string | null | undefined, fallback = '09:00'): string {
  const match = typeof stored === 'string' ? /^(\d{2}):(\d{2})/.exec(stored) : null;
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return fallback;
  return `${match[1]}:${match[2]}`;
}

/** A complete HH:MM from the time input, or null while it is empty or half-typed. */
export function parseTimeInput(value: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1]}:${match[2]}`;
}
