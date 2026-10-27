/**
 * "Notifications may still arrive on this device" after a sign-out whose
 * device cleanup could not be confirmed (push-device-lifecycle.ts).
 *
 * Shown inline on the sign-in page, never as a floating toast that could
 * cover its controls. Kept in sessionStorage so it survives the redirect and a
 * reload of this tab, and cleared once a later account check confirms this
 * device no longer holds the old subscription, or when dismissed. It holds a
 * flag only — nothing about the account or the device.
 */

const STORAGE_KEY = 'ima.push.deviceStillConnected';

let shown = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

function stored(): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function showDeviceStillConnectedNotice(): void {
  shown = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage blocked: the in-memory flag still shows it in this tab.
  }
  notify();
}

export function clearDeviceStillConnectedNotice(): void {
  const was = shown || stored();
  shown = false;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored to remove.
  }
  if (was) notify();
}

export const isDeviceStillConnectedNoticeShown = (): boolean => shown || stored();

export function subscribeToDeviceNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
