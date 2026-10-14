import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { FocusTimerContext, type FocusTimerValue } from '@/contexts/focus-timer-context';
import FocusTimerProvider from '@/contexts/FocusTimerProvider';
import { createFocusTimerState } from '@/lib/focus/focus-timer-state';
import Focus from './Focus';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const user = { id: USER_ID } as User;
const auth = (signedIn: boolean): AuthContextValue => ({
  session: signedIn ? ({ user } as Session) : null,
  user: signedIn ? user : null,
  onboardingCompleted: signedIn ? true : null,
  loading: false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
});

const task = { id: 'task-1', user_id: USER_ID, title: 'Write the report', description: null, tag: 'focus', scheduled_date: '2026-10-14', start_time: null, end_time: null, completed: false, completed_at: null, importance: 'normal', created_at: '2026-10-14T08:00:00Z', updated_at: '2026-10-14T08:00:00Z' };

const timerValue = (over: Partial<FocusTimerValue> = {}): FocusTimerValue => {
  const state = createFocusTimerState({ blockMinutes: 25, breakMinutes: 5, flows: 4 }, 0);
  return {
    state,
    timeLeft: 1500,
    isPlaying: false,
    phase: 'focus',
    flowsCompleted: 0,
    config: state.config,
    inProgress: false,
    sessionTaskId: null,
    play: vi.fn(),
    pause: vi.fn(),
    reset: vi.fn(),
    changeSetting: vi.fn(),
    seed: vi.fn(),
    ...over
  };
};

function render(path: string, value: FocusTimerValue) {
  const client = new QueryClient();
  client.setQueryData(['tasks', USER_ID], [task]);
  return renderToString(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth(true)}>
        <FocusTimerContext.Provider value={value}>
          <MemoryRouter initialEntries={[path]}>
            <Focus />
          </MemoryRouter>
        </FocusTimerContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

describe('Focus page — a view of the app-wide timer', () => {
  it('shows the shared timer exactly as the old screen did', () => {
    const html = text(render('/focus', timerValue()));
    expect(html).toContain('Focus Timer');
    expect(html).toContain('25:00');
    expect(html).toContain('0/4');
    expect(html).toContain("Ready to flow? Let's get started ✨");
  });

  it('coming back mid-break shows the remaining break time and progress, not a reset timer', () => {
    const html = text(render('/focus', timerValue({ timeLeft: 4 * 60 + 2, phase: 'break', flowsCompleted: 1, inProgress: true })));
    expect(html).toContain('04:02');
    expect(html).toContain('1/4');
    expect(html).toContain('Break time - recharge for your next flow');
  });

  it("returning without ?task still shows the running session's task", () => {
    expect(text(render('/focus', timerValue({ inProgress: true, isPlaying: true, sessionTaskId: 'task-1' })))).toContain('Working on Write the report');
  });

  it('the URL task still wins, as before', () => {
    expect(text(render('/focus?task=task-1', timerValue()))).toContain('Working on Write the report');
  });

  it('renders with the real provider (signed out / guest) on the built-in defaults', () => {
    const html = text(
      renderToString(
        <QueryClientProvider client={new QueryClient()}>
          <AuthContext.Provider value={auth(false)}>
            <FocusTimerProvider>
              <MemoryRouter initialEntries={['/focus']}>
                <Focus />
              </MemoryRouter>
            </FocusTimerProvider>
          </AuthContext.Provider>
        </QueryClientProvider>
      )
    );
    expect(html).toContain('25:00');
    expect(html).toContain('0/4');
  });
});

describe('regression guards', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('the Focus page no longer counts time with its own interval', () => {
    expect(read('./Focus.tsx')).not.toMatch(/setInterval|setTimeLeft/);
  });

  it('nothing in the Focus Timer abandons a session on page close, hide or unmount', () => {
    for (const path of ['../contexts/FocusTimerProvider.tsx', '../lib/focus/focus-timer-engine.ts', '../lib/focus/focus-timer-store.ts', './Focus.tsx']) {
      const source = read(path);
      expect(source, path).not.toMatch(/['"](beforeunload|pagehide|unload)['"]/);
      expect(source, path).not.toMatch(/status:\s*'abandoned'/);
    }
  });

  it('the provider is mounted once, app-wide, outside the routes', () => {
    const app = read('../App.tsx');
    expect(app.match(/<FocusTimerProvider>/g)).toHaveLength(1);
    expect(app.indexOf('<FocusTimerProvider>')).toBeLessThan(app.indexOf('<BrowserRouter>'));
  });

  it('Body Double keeps its own recorder, unchanged: body-double source, abandoned on unmount', () => {
    const recorder = read('../hooks/use-focus-session.ts');
    expect(recorder).toContain("source: 'body-double'");
    expect(recorder).toMatch(/return \(\) => \{[\s\S]*status: 'abandoned'/);
    const bodyDouble = read('./BodyDouble.tsx');
    expect(bodyDouble).toContain("from '@/hooks/use-focus-session'");
    expect(bodyDouble).not.toMatch(/focus-timer|FocusTimer/);
  });
});
