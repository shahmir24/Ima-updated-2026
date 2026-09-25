/**
 * "This browser has signed in to iMA before."
 *
 * One flag in localStorage, set once a real session exists and never cleared
 * by signing out. It is what tells a returning user whose session has lapsed
 * apart from a brand-new visitor: the returning user is sent to sign in, as
 * they always were, instead of landing on an empty Guest Home and wondering
 * where their tasks went.
 *
 * It holds the value '1' and nothing else — no id, email or token. Every
 * access is guarded, because touching localStorage throws when site data is
 * blocked; unreadable storage reads as "no marker", which only means Guest
 * Home instead of the sign-in screen.
 */

export const ACCOUNT_MARKER_KEY = 'ima.hasAccount';

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function hasAccountMarker(): boolean {
  try {
    return storage()?.getItem(ACCOUNT_MARKER_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAccountMarker(): void {
  try {
    storage()?.setItem(ACCOUNT_MARKER_KEY, '1');
  } catch {
    // Nothing to do: without the marker this browser is simply treated as new.
  }
}
