import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import BodyDouble from './BodyDouble';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

const renderWelcome = () =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/body-double']}>
          <BodyDouble />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

const source = readFileSync(new URL('./BodyDouble.tsx', import.meta.url), 'utf8');
const constant = (name: string) => source.match(new RegExp(`const ${name} = '([^']*)'`))?.[1] ?? '';

describe('Body Double desktop layout', () => {
  it('the desktop constants hold lg-only classes, so phones are untouched by them', () => {
    for (const name of ['DESKTOP_SETUP_WIDTH', 'DESKTOP_SESSION_WIDTH', 'DESKTOP_WRAPUP_WIDTH', 'DESKTOP_PANEL']) {
      const classes = constant(name).split(' ').filter(Boolean);
      expect(classes.length, name).toBeGreaterThan(0);
      for (const cls of classes) expect(cls, `${name}: ${cls}`).toMatch(/^lg:/);
    }
    expect(constant('DESKTOP_SETUP_WIDTH')).toBe('lg:max-w-4xl');
    expect(constant('DESKTOP_SESSION_WIDTH')).toBe('lg:max-w-5xl');
    expect(constant('DESKTOP_WRAPUP_WIDTH')).toBe('lg:max-w-3xl');
  });

  it('welcome: a compact greeting over two columns, everything optional and unchanged', () => {
    const html = renderWelcome();
    expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]');
    expect(html).toContain('lg:col-span-2 lg:flex lg:items-center');
    expect(html).toContain('lg:max-w-4xl');
    for (const text of ['How are you feeling?', 'What brings you here?', 'Task I want to focus on', 'I&#x27;m feeling scattered', 'I don&#x27;t know where to start']) {
      expect(html).toContain(text);
    }
    // Before a reason is picked: the desktop-only hint, hidden on phones.
    expect(html).toMatch(/class="hidden lg:block[^"]*">Pick what brings you here\./);
  });

  it('session: two panes, a 256px ring that only holds the time, and both panes sticky', () => {
    expect(source).toContain('lg:grid-cols-[minmax(0,1fr)_20rem]');
    expect(source).toContain('w-32 h-32 rounded-full border-4 border-purple-500/20 lg:relative lg:h-64 lg:w-64');
    expect(source).toContain('lg:flex lg:h-64 lg:flex-col lg:items-center lg:justify-center');
    expect(source).toContain('hidden lg:block absolute inset-2 rounded-full bg-[#1F1F1F]');
    expect(source.match(/lg:sticky lg:top-6/g)).toHaveLength(2);
    // Sticky, not a nested scroller.
    expect(source).not.toMatch(/lg:overflow-y-auto|lg:max-h-/);
  });

  it('the nudge keeps its phone position and sits inside the left pane on desktop', () => {
    expect(source).toContain('absolute top-1/3 left-4 right-4 z-50 animate-fade-in lg:left-0 lg:right-0 lg:top-full lg:mt-4');
    // Its containing block on desktop is the sticky session header.
    const header = source.indexOf('<header className="w-full max-w-lg mx-auto p-4 lg:sticky');
    const nudge = source.indexOf('{showNudge && (');
    const headerEnd = source.indexOf('</header>', header);
    expect(header).toBeGreaterThan(-1);
    expect(nudge).toBeGreaterThan(header);
    expect(nudge).toBeLessThan(headerEnd);
    // Timing and auto-hide are untouched.
    expect(source).toContain('setTimeout(() => setShowNudge(false), 6000)');
  });

  it('desktop titles sit left beside the back arrow; phones keep the centred row', () => {
    expect(source.match(/justify-between (mb-4 )?lg:justify-start lg:gap-3/g)).toHaveLength(3);
    expect(source.match(/<div className="w-10 lg:hidden"><\/div>/g)).toHaveLength(3);
  });

  it('the exit note is desktop-only and informational', () => {
    expect(source).toMatch(/<p className="hidden lg:block[^"]*">\s*Leaving this page ends your co-working session\.\s*<\/p>/);
  });

  it('wrap-up: a wider card, questions in two columns, actions in one row', () => {
    expect(source).toContain('space-y-4 lg:grid lg:grid-cols-2 lg:gap-x-6 lg:gap-y-5 lg:space-y-0');
    expect(source).toContain('space-y-3 lg:grid lg:grid-cols-3 lg:gap-3 lg:space-y-0');
    expect(source).toContain('text-white/40 text-xs text-center lg:order-last lg:col-span-3');
    expect(source.match(/<Input\b/g)).toHaveLength(4);
  });

  it('phone classes and every handler are still in place', () => {
    for (const cls of [
      'flex-1 w-full max-w-lg mx-auto px-4 flex flex-col items-center justify-center space-y-8',
      'flex-1 w-full max-w-lg mx-auto px-4 space-y-6',
      'flex-1 w-full max-w-lg mx-auto px-4 pb-8',
      'bg-[#1F1F1F] rounded-3xl p-6 text-center relative overflow-hidden',
      'text-4xl font-bold text-white mb-2',
      'flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10'
    ]) {
      expect(source).toContain(cls);
    }
    for (const handler of [
      'onClick={startSession}', 'onClick={toggleTimer}', 'onClick={resetBlock}', 'onClick={openSupport}',
      'onClick={handleSessionComplete}', 'onClick={handleSaveReflection}', 'onClick={startAnotherSession}',
      "onClick={() => navigate('/')}", "onClick={() => navigate('/breathing')}"
    ]) {
      expect(source).toContain(handler);
    }
  });
});
