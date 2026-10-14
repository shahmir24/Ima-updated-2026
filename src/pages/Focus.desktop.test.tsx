import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { FocusTimerContext, type FocusTimerValue } from '@/contexts/focus-timer-context';
import { createFocusTimerState, type FocusTimerState } from '@/lib/focus/focus-timer-state';
import Focus from './Focus';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const user = { id: USER_ID } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};
const task = { id: 'task-1', user_id: USER_ID, title: 'Write the report', description: null, tag: 'focus', scheduled_date: '2026-10-14', start_time: null, end_time: null, completed: false, completed_at: null, importance: 'normal', created_at: '2026-10-14T08:00:00Z', updated_at: '2026-10-14T08:00:00Z' };

const timerValue = (stateOver: Partial<FocusTimerState> = {}, over: Partial<FocusTimerValue> = {}): FocusTimerValue => {
  const state = { ...createFocusTimerState({ blockMinutes: 25, breakMinutes: 5, flows: 4 }, 0), ...stateOver };
  return {
    state, timeLeft: Math.ceil(state.remainingMs / 1000), isPlaying: false, phase: state.phase,
    flowsCompleted: state.flowsCompleted, config: state.config, inProgress: false, sessionTaskId: null,
    play: vi.fn(), pause: vi.fn(), reset: vi.fn(), changeSetting: vi.fn(), seed: vi.fn(), ...over
  };
};

const render = (path: string, value: FocusTimerValue) => {
  const client = new QueryClient();
  client.setQueryData(['tasks', USER_ID], [task]);
  return renderToString(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth}>
        <FocusTimerContext.Provider value={value}>
          <MemoryRouter initialEntries={[path]}>
            <Focus />
          </MemoryRouter>
        </FocusTimerContext.Provider>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
};
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Focus desktop layout', () => {
  it('desktop: a ring and a session panel; phones keep the timer card', () => {
    const html = render('/focus', timerValue());
    expect(html).toContain('max-w-2xl lg:max-w-5xl');
    expect(html).toContain('lg:grid-cols-[minmax(0,1fr)_20rem]');
    expect(html).toMatch(/class="relative h-80 w-80 items-center justify-center hidden lg:flex/);
    expect(html).toContain('relative mb-12 w-full max-w-sm sm:max-w-md lg:hidden');
    expect(html).toContain('aria-label="This session"');
    const t = text(html);
    expect(t).toContain('Ready Press play when you’re ready');
    expect(t).toContain('Round 1 of 4');
    expect(t).toContain('Time boxing duration');
  });

  it('Play, Pause and Reset have accessible names that say what they do', () => {
    expect(render('/focus', timerValue())).toContain('aria-label="Start timer"');
    expect(render('/focus', timerValue())).toContain('aria-label="Reset timer"');
    expect(render('/focus', timerValue())).toContain('aria-label="Timer settings"');
    const running = timerValue({ sessionId: 's', sessionStartedAt: 0, phaseEndsAt: 1_500_000, runningSince: 0 }, { isPlaying: true });
    expect(render('/focus', running)).toContain('aria-label="Pause timer"');
    const breakWaiting = timerValue({ sessionId: 's', sessionStartedAt: 0, phase: 'break', remainingMs: 300_000, flowsCompleted: 1 });
    expect(render('/focus', breakWaiting)).toContain('aria-label="Start break"');
    expect(text(render('/focus', breakWaiting))).toContain('Break Your break is ready when you are');
  });

  it('a phase whose length cannot be proved shows the ring track only; the countdown still shows', () => {
    // Round 2, paused, after a refresh, with the setting now 25 min: the
    // phase's real length is not in the stored state.
    const unknown = timerValue({ sessionId: 'refreshed-session', sessionStartedAt: 0, flowsCompleted: 1, breaksTaken: 1, remainingMs: 60_000, focusMs: 120_000 });
    const html = render('/focus', unknown);
    const ringSvg = (page: string) => { const at = page.indexOf('<svg', page.indexOf('relative h-80 w-80')); return page.slice(at, page.indexOf('</svg>', at)); };
    const ring = ringSvg(html);
    expect(ring.match(/<circle/g)).toHaveLength(1);
    expect(text(html)).toContain('01:00 Paused');
    // A completed session draws the full arc.
    const done = render('/focus', timerValue({ sessionId: 's', sessionStartedAt: 0, finished: true, remainingMs: 0, flowsCompleted: 4 }));
    const doneRing = ringSvg(done);
    expect(doneRing.match(/<circle/g)).toHaveLength(2);
    expect(doneRing).toContain('stroke-dashoffset="0"');
  });

  it('the task from Right Now sits above the ring', () => {
    const html = render('/focus?task=task-1', timerValue());
    expect(html).toMatch(/hidden lg:block mb-6[^"]*"><p[^>]*>Working on<\/p><p[^>]*>Write the report<\/p>/);
  });

  it('completion: a summary from the timer state, View stats, and Play as Start again — no saved claim', () => {
    const done = timerValue({ sessionId: 's', sessionStartedAt: 0, finished: true, remainingMs: 0, flowsCompleted: 4, focusMs: 100 * 60_000 });
    const html = render('/focus', done);
    const t = text(html);
    expect(t).toContain('Complete All rounds done');
    expect(t).toContain('Session complete 4 of 4 rounds · 100 min of focus');
    expect(t).toContain('View stats');
    expect(html).toContain('aria-label="Start again"');
    expect(t).not.toMatch(/saved/i);
  });

  it('settings: one shared list, the floating panel only on phones, the mini player in its corner on desktop', () => {
    const panel = read('../components/focus/FloatingSettings.tsx');
    expect(panel).toContain('export const FocusSettingsList');
    expect(panel).toContain('fixed bottom-24 right-4 z-50 lg:bottom-10 lg:right-8 lg:hidden');
    expect(panel).toContain('<FocusSettingsList {...values} className="mb-2 space-y-2 animate-fade-in" />');
    const focus = read('./Focus.tsx');
    expect(focus).toContain('onSettingChange={handleSettingChange}');
    expect(focus.match(/onSettingChange=\{handleSettingChange\}/g)).toHaveLength(2);
    expect(read('../components/soundscape/SoundscapeMiniPlayer.tsx')).toContain("'right-[4.75rem] lg:right-8'");
  });

  it('phone classes are unchanged', () => {
    const focus = read('./Focus.tsx');
    expect(focus).toContain('className="mb-4 lg:hidden"');
    expect(focus).toContain('className="contents lg:flex lg:flex-col lg:items-center"');
    expect(read('../components/focus/ControlButtons.tsx')).toContain('<div className="flex gap-6 mb-8">');
  });
});
