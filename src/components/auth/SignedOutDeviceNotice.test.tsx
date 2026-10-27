import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SignedOutDeviceNotice from './SignedOutDeviceNotice';
import {
  clearDeviceStillConnectedNotice,
  isDeviceStillConnectedNoticeShown,
  showDeviceStillConnectedNotice,
  subscribeToDeviceNotice
} from '@/lib/push/signed-out-notice';

const MESSAGE =
  "You're signed out, but notifications may still arrive on this device. Open iMA again when you're online to finish disconnecting notifications.";
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/&#x27;/g, "'").replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

afterEach(() => clearDeviceStillConnectedNotice());

describe('the signed-out device notice', () => {
  it('normal logout: nothing is shown', () => {
    expect(renderToString(<SignedOutDeviceNotice />)).toBe('');
  });

  it('after a cleanup that could not be confirmed: the approved text, as an alert, with a way to dismiss it', () => {
    showDeviceStillConnectedNotice();
    const html = renderToString(<SignedOutDeviceNotice />);
    expect(text(html)).toContain(MESSAGE);
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain('Dismiss');
    expect(text(html)).not.toMatch(/https?:\/\/|endpoint|token/i);
  });

  it('dismissing or a confirmed release clears it, and listeners hear about it', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToDeviceNotice(listener);
    showDeviceStillConnectedNotice();
    expect(isDeviceStillConnectedNoticeShown()).toBe(true);
    clearDeviceStillConnectedNotice();
    expect(isDeviceStillConnectedNoticeShown()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('sits in the sign-in page flow above the form — never a floating layer over its controls', () => {
    const auth = readFileSync(new URL('../../pages/Auth.tsx', import.meta.url), 'utf8');
    const notice = auth.indexOf('<SignedOutDeviceNotice />');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(auth.indexOf('{/* Auth Card */}'));
    const component = readFileSync(new URL('./SignedOutDeviceNotice.tsx', import.meta.url), 'utf8');
    expect(component).not.toMatch(/\b(fixed|absolute|sticky)\b/);
  });
});
