import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import ProfileSettings from './ProfileSettings';

// No network: the Supabase client is a stub that fails loudly if touched.
const supabaseTouched = vi.hoisted(() => ({ value: false }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { supabaseTouched.value = true; throw new Error('Supabase must not be reached'); } })
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const authValue = (signedIn: boolean): AuthContextValue => ({
  session: signedIn ? ({ user } as Session) : null,
  user: signedIn ? user : null,
  onboardingCompleted: signedIn ? true : null,
  loading: false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
});

const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);

beforeEach(() => {
  requestPermission.mockClear();
  supabaseTouched.value = false;
  vi.stubGlobal('Notification', { permission: 'default', requestPermission });
});
afterEach(() => vi.unstubAllGlobals());

const renderSettings = (signedIn: boolean, tab = 'settings') =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={authValue(signedIn)}>
        <MemoryRouter initialEntries={[`/profile-settings?tab=${tab}`]}>
          <ProfileSettings />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

describe('Profile & Settings — Gentle nudges card', () => {
  it('appears on App Settings, off by default, among the existing cards', () => {
    const html = renderSettings(true);
    expect(html).toContain('Gentle nudges');
    expect(html).toContain('Daily nudge time');
    expect(html).toContain('Show task names in notifications');
    expect(html).toMatch(/id="gentle-nudges"[^>]*aria-checked="false"|aria-checked="false"[^>]*id="gentle-nudges"/);

    // Existing cards are still there, in order, with nudges before Account & Privacy.
    const order = ['Personalization', 'Wellness Settings', 'Time Boxing Settings', 'Gentle nudges', 'Account &amp; Privacy'].map((t) =>
      html.indexOf(t)
    );
    expect(order.every((index) => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('opening Settings never asks for notification permission or reaches the server', () => {
    renderSettings(true);
    renderSettings(false);
    expect(requestPermission).not.toHaveBeenCalled();
    expect(supabaseTouched.value).toBe(false);
  });

  it('Guest Mode sees the card disabled with a sign-in note', () => {
    const html = renderSettings(false);
    expect(html).toContain('Sign in to turn on gentle nudges');
    expect(html).toMatch(/id="gentle-nudges"[^>]*disabled=""|disabled=""[^>]*id="gentle-nudges"/);
  });

  it('is not on the Profile Info tab', () => {
    expect(renderSettings(true, 'profile')).not.toContain('Daily nudge time');
  });
});
