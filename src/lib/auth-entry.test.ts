import { describe, expect, it } from 'vitest';
import { LOG_IN_PATH, SIGN_UP_PATH, opensOnSignUp } from './auth-entry';

describe('auth entry links', () => {
  it('opens the sign-up form only for ?mode=signup', () => {
    expect(opensOnSignUp(new URL(SIGN_UP_PATH, 'https://x').search)).toBe(true);
    expect(opensOnSignUp(new URL(LOG_IN_PATH, 'https://x').search)).toBe(false);
    expect(opensOnSignUp('')).toBe(false);
    expect(opensOnSignUp('?mode=login')).toBe(false);
    expect(opensOnSignUp('?mode=SIGNUP')).toBe(false);
  });

  it('both links lead to the one existing sign-in screen', () => {
    expect(new URL(SIGN_UP_PATH, 'https://x').pathname).toBe('/auth');
    expect(LOG_IN_PATH).toBe('/auth');
  });
});
