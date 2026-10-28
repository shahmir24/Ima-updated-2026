import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import ProfileSettings from './ProfileSettings';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

beforeEach(() => vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());

const render = (tab: 'profile' | 'settings') =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[`/profile-settings?tab=${tab}`]}>
          <ProfileSettings />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('Profile & Settings — desktop layout (presentation only)', () => {
  it('the workspace widens to 5xl on desktop only', () => {
    const html = render('profile');
    expect(html).toContain('max-w-3xl lg:max-w-5xl');
    expect(html).toContain('lg:max-w-md'); // the tab switcher keeps a compact width
  });

  it('profile: photo card beside About You, fields in two columns, long fields spanning both', () => {
    const html = render('profile');
    expect(html).toContain('lg:grid lg:grid-cols-[18rem_minmax(0,1fr)]');
    expect(html).toContain('lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5');
    expect(html.match(/lg:col-span-2/g)?.length).toBe(2); // Focus Goals + Preferred Mode
  });

  it('profile: every field is still there', () => {
    const t = text(render('profile'));
    for (const label of ['First Name', 'Pronouns', 'Date of Birth', 'Mood Check-in Frequency', 'Focus Goals', 'Preferred Mode', 'Use my favorite mood emoji instead']) {
      expect(t).toContain(label);
    }
  });

  it('settings: cards in a two-column grid, in the original order, with every card and Log out', () => {
    const html = render('settings');
    expect(html).toContain('lg:grid lg:grid-cols-2 lg:items-start lg:gap-6');
    const t = text(html);
    const order = ['Personalization', 'Wellness Settings', 'Time Boxing Settings', '🔔 Notifications', 'Account & Privacy', 'Feedback & Support'].map((h) => t.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(t).toContain('Log out');
  });

  it('the grids sit on inner wrappers, never on the tab panels (an inactive panel must stay hidden)', () => {
    const source = readFileSync(new URL('./ProfileSettings.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/<TabsContent value="profile" className="space-y-6 mt-0">/);
    expect(source).toMatch(/<TabsContent value="settings" className="space-y-6 mt-0">/);
  });

  it('phone classes are unchanged: every desktop change is behind lg:', () => {
    const html = render('settings');
    expect(html).toContain('grid w-full grid-cols-2 mb-8 bg-secondary/50 rounded-2xl p-1');
    expect(html).toContain('space-y-6 lg:grid');
  });
});
