import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { focusStatsKey } from '@/hooks/use-focus-stats';
import { summarizeFocusSessions } from '@/lib/focus/focus-stats';
import Stats from './Stats';

// No network: server rendering never runs the query, and anything else touching Supabase fails loudly.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const user = { id: USER_ID } as User;
const auth: AuthContextValue = {
  session: { user } as Session,
  user,
  onboardingCompleted: true,
  loading: false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
};

function render(rows?: Array<{ status: string; focus_seconds: number }>) {
  const client = new QueryClient();
  if (rows) client.setQueryData(focusStatsKey(USER_ID), summarizeFocusSessions(rows));
  return renderToString(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={['/stats']}>
          <Stats />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('Stats page', () => {
  it('shows completed and abandoned sessions separately, with real focus minutes and the completion rate', () => {
    const html = text(
      render([
        { status: 'completed', focus_seconds: 1500 },
        { status: 'completed', focus_seconds: 3000 },
        { status: 'completed', focus_seconds: 1500 },
        { status: 'abandoned', focus_seconds: 420 }
      ])
    );
    expect(html).toContain('Statistics');
    expect(html).toContain('Completed 3 sessions 100 focus minutes');
    expect(html).toContain('Abandoned 1 session 7 focus minutes');
    expect(html).toContain('Completion rate 75% of 4 ended sessions');
  });

  it('only abandoned sessions: 0%, not an error', () => {
    expect(text(render([{ status: 'abandoned', focus_seconds: 60 }]))).toContain('Completion rate 0%');
  });

  it('no ended sessions: the honest empty state, never a fake number', () => {
    const html = text(render([]));
    expect(html).toContain('No activity stats yet');
    expect(html).not.toContain('Completion rate');
    expect(html).not.toContain('%');
  });

  it('active sessions alone still show the empty state', () => {
    expect(text(render([{ status: 'active', focus_seconds: 900 }]))).toContain('No activity stats yet');
  });

  it('while loading, says so', () => {
    expect(text(render())).toContain('Loading your stats');
  });
});
