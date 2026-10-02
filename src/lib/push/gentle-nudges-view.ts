import type { NudgePushErrorCode, NudgePushState } from './gentle-nudges-push';

/**
 * What the Gentle nudges card on Settings shows, worked out from the push
 * controller's state and the saved account setting. Plain functions, so every
 * state can be tested without a browser.
 *
 * Every string here is written for the person using iMA. None of them names a
 * key, an environment variable, an error code or a browser API.
 */

export type NudgeNoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface NudgeNotice {
  tone: NudgeNoticeTone;
  text: string;
}

export interface GentleNudgesViewInput {
  push: NudgePushState & { signedIn: boolean };
  /** user_settings.nudges_enabled, as last saved for the account. */
  accountOn: boolean;
  /** Which action this screen is running, if any. */
  pending: 'enable' | 'disable' | null;
  /** The last enable succeeded but the device's time zone was not saved. */
  timezoneMissed: boolean;
}

export interface GentleNudgesView {
  /** The switch is on only when the account AND this device are set up. */
  checked: boolean;
  switchDisabled: boolean;
  /** A one-line status beside the switch. */
  status: string;
  notice: NudgeNotice | null;
  /** Nudges are on for the account, but this device can't show them. */
  offerTurnOffEverywhere: boolean;
  /** The time and privacy controls can be edited. */
  detailsEditable: boolean;
}

const COPY = {
  signedOut: 'Sign in to turn on gentle nudges. They need an account so iMA knows what to remind you about.',
  installRequired:
    'On iPhone and iPad, nudges work once iMA is on your Home Screen. In Safari, tap Share, then “Add to Home Screen”, open iMA from there and turn nudges on.',
  unsupported: "This browser can't show notifications from iMA. A recent version of Chrome, Edge, Firefox or Safari can.",
  notConfigured: "Gentle nudges aren't available right now. Please check back later.",
  permissionDenied:
    'Notifications are blocked for iMA. To get nudges, allow notifications for iMA in your browser or device settings, then come back here.',
  permissionDismissed: 'Notifications weren’t allowed, so nudges are still off. You can try again whenever you like.',
  serviceWorkerUnavailable: "iMA couldn't finish setting up notifications. Please reload the page and try again.",
  subscribeFailed: "Your browser couldn't set up notifications for iMA. Please try again in a moment.",
  registerFailed: "We couldn't save this device for nudges. Please check your connection and try again.",
  settingsFailed: "We couldn't save your nudge setting. Please try again.",
  disableFailed: "We couldn't turn nudges off. Please check your connection and try again.",
  onHere: 'Nudges are on for this device.',
  timezoneMissed: "Nudges are on. We couldn't save your time zone, so the time may be off — try turning nudges off and on again.",
  onElsewhere: 'Nudges are on for your account, but not on this device yet. Turn them on here to get them on this device too.'
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
  'disable-failed': COPY.disableFailed
};

/** Human copy for a controller error. Unknown codes get a generic line, never the code. */
export function nudgeErrorText(code: string): string {
  return (ERROR_COPY as Record<string, string>)[code] ?? 'Something went wrong with nudges. Please try again.';
}

/** Why this device cannot turn nudges on, before anyone taps anything. */
function blockedNotice(push: GentleNudgesViewInput['push']): NudgeNotice | null {
  if (push.installRequired) return { tone: 'info', text: COPY.installRequired };
  if (!push.supported) return { tone: 'info', text: COPY.unsupported };
  if (!push.configured) return { tone: 'info', text: COPY.notConfigured };
  if (push.permission === 'denied') return { tone: 'warning', text: COPY.permissionDenied };
  return null;
}

export function gentleNudgesView({ push, accountOn, pending, timezoneMissed }: GentleNudgesViewInput): GentleNudgesView {
  if (!push.signedIn) {
    return {
      checked: false,
      switchDisabled: true,
      status: 'Off',
      notice: { tone: 'info', text: COPY.signedOut },
      offerTurnOffEverywhere: false,
      detailsEditable: false
    };
  }

  const busy = pending !== null || push.loading;
  const deviceOn = push.supported && push.subscribed === true && push.permission === 'granted';
  const checked = accountOn && deviceOn;
  const blocked = blockedNotice(push);

  let status = checked ? 'On' : 'Off';
  if (pending === 'enable') status = 'Turning on…';
  else if (pending === 'disable') status = 'Turning off…';
  else if (push.loading) status = 'Checking this device…';

  let notice: NudgeNotice | null = null;
  if (push.error) notice = { tone: 'error', text: nudgeErrorText(push.error.code) };
  else if (busy) notice = null;
  else if (checked) notice = timezoneMissed ? { tone: 'warning', text: COPY.timezoneMissed } : { tone: 'success', text: COPY.onHere };
  else if (blocked) notice = blocked;
  else if (accountOn && push.subscribed !== null) notice = { tone: 'info', text: COPY.onElsewhere };

  return {
    checked,
    // Turning OFF is always allowed; turning on is not when the device can't.
    switchDisabled: busy || (!checked && blocked !== null),
    status,
    notice,
    offerTurnOffEverywhere: accountOn && !checked && !busy && push.subscribed !== null,
    detailsEditable: true
  };
}

/** user_settings.nudge_time ("09:00:00") as an <input type="time"> value ("09:00"). */
export function toTimeInputValue(stored: string | null | undefined): string {
  const match = typeof stored === 'string' ? /^(\d{2}):(\d{2})/.exec(stored) : null;
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return '09:00';
  return `${match[1]}:${match[2]}`;
}

/** A complete HH:MM from the time input, or null while it is empty or half-typed. */
export function parseTimeInput(value: string): string | null {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return null;
  return `${match[1]}:${match[2]}`;
}
