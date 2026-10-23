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

function render(path: string, value: FocusTimerValue, settings?: Record<string, unknown> | null) {
  const client = new QueryClient();
  client.setQueryData(['tasks', USER_ID], [task]);
  if (settings !== undefined) client.setQueryData(['user-settings', USER_ID], settings);
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
    expect(html).toContain('Round 1 of 4');
    expect(html).toContain("Ready to flow? Let's get started ✨");
  });

  it('coming back mid-break shows the remaining break time and progress, not a reset timer', () => {
    const base = createFocusTimerState({ blockMinutes: 25, breakMinutes: 5, flows: 4 }, 0);
    const state = { ...base, sessionId: 's', sessionStartedAt: 0, phase: 'break' as const, flowsCompleted: 1, remainingMs: 4 * 60_000 + 2000 };
    const html = text(render('/focus', timerValue({ state, timeLeft: 4 * 60 + 2, phase: 'break', flowsCompleted: 1, inProgress: true })));
    expect(html).toContain('04:02');
    expect(html).toContain('Round 1 of 4');
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
    expect(html).toContain('Round 1 of 4');
  });
});

describe('phone round indicator', () => {
  const at = (over: Partial<ReturnType<typeof createFocusTimerState>>, flows = 4) => {
    const base = createFocusTimerState({ blockMinutes: 25, breakMinutes: 5, flows }, 0);
    const state = { ...base, sessionId: 's', sessionStartedAt: 0, ...over };
    return render('/focus', timerValue({ state, config: state.config, phase: state.phase, flowsCompleted: state.flowsCompleted }));
  };
  /** The phone indicator: its text and its dots, from the lg:hidden block only. */
  const indicator = (html: string) => {
    const block = html.slice(html.indexOf('mb-4 lg:hidden'), html.indexOf('<main'));
    const label = text(block).match(/Round \d+ of \d+/)?.[0];
    const dots = [...block.matchAll(/data-dot="(\w+)"/g)].map((m) => m[1]);
    return { label, dots, hidden: /aria-hidden="true" data-round-dots=""/.test(block) };
  };

  it('before starting: Round 1 of 4, the first round outlined as current', () => {
    expect(indicator(render('/focus', timerValue()))).toEqual({ label: 'Round 1 of 4', dots: ['current', 'upcoming', 'upcoming', 'upcoming'], hidden: true });
  });

  it('round 2 under way: one done, the second current', () => {
    expect(indicator(at({ flowsCompleted: 1, phase: 'focus', phaseEndsAt: 1_500_000, runningSince: 0 }))).toMatchObject({
      label: 'Round 2 of 4',
      dots: ['done', 'current', 'upcoming', 'upcoming']
    });
  });

  it('the break after round 2: two done, none current, still Round 2 of 4 as on desktop', () => {
    const html = at({ flowsCompleted: 2, phase: 'break', remainingMs: 300_000 });
    expect(indicator(html)).toMatchObject({ label: 'Round 2 of 4', dots: ['done', 'done', 'upcoming', 'upcoming'] });
    expect(text(html)).toContain('Round 2 of 4'); // the desktop panel agrees
  });

  it('the final round: Round 4 of 4, three done and the last current', () => {
    expect(indicator(at({ flowsCompleted: 3, phase: 'focus' }))).toMatchObject({ label: 'Round 4 of 4', dots: ['done', 'done', 'done', 'current'] });
  });

  it('session complete: every round done, never "Round 5 of 4"', () => {
    const html = at({ flowsCompleted: 4, finished: true, remainingMs: 0 });
    expect(indicator(html)).toMatchObject({ label: 'Round 4 of 4', dots: ['done', 'done', 'done', 'done'] });
    expect(text(html)).not.toContain('Round 5 of 4');
  });

  it('any number of rounds: one dot each', () => {
    expect(indicator(at({ flowsCompleted: 0 }, 1))).toMatchObject({ label: 'Round 1 of 1', dots: ['current'] });
    expect(indicator(at({ flowsCompleted: 5 }, 12)).dots).toHaveLength(12);
  });

  it('desktop keeps its own panel dots exactly as they were', () => {
    const html = at({ flowsCompleted: 1, phase: 'focus' });
    const panel = html.slice(html.indexOf('aria-label="This session"'));
    expect(panel).not.toContain('data-round-dots');
    expect(panel).toMatch(/<span class="h-2 w-2 rounded-full bg-blue-300"><\/span><span class="h-2 w-2 rounded-full bg-white\/15">/);
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

describe('first-time Focus setup', () => {
  const settingsRow = (over: Record<string, unknown> = {}) => ({
    user_id: USER_ID,
    focus_block_minutes: 25,
    buffer_minutes: 5,
    default_flows: 4,
    timeboxing_style: null,
    encouragement: true,
    ...over
  });
  const hasSetup = (html: string) => html.includes('focus-setup-heading');

  it('a signed-in user who never chose sees setup in place of the timer, with the Right Now task kept', () => {
    const html = render('/focus?task=task-1', timerValue(), settingsRow());
    expect(hasSetup(html)).toBe(true);
    expect(text(html)).toContain('Working on Write the report');
    // The countdown is not shown or started: no Play, no Pause, no running ring.
    expect(html).not.toContain('aria-label="Start timer"');
    expect(html).not.toContain('aria-label="Pause timer"');
    expect(text(html)).not.toContain('Change focus setup');
  });

  it('an account with no settings row sees setup too', () => {
    expect(hasSetup(render('/focus', timerValue(), null))).toBe(true);
  });

  it('a returning user skips setup: the timer with their saved lengths, waiting for Play, and a way back to setup', () => {
    const base = createFocusTimerState({ blockMinutes: 45, breakMinutes: 15, flows: 3 }, 0);
    const html = render('/focus', timerValue({ state: base, config: base.config, timeLeft: 45 * 60 }), settingsRow({ focus_block_minutes: 45, buffer_minutes: 15, default_flows: 3, timeboxing_style: 'deep-dive' }));
    expect(hasSetup(html)).toBe(false);
    expect(text(html)).toContain('45:00');
    expect(text(html)).toContain('Round 1 of 3');
    expect(html).toContain('aria-label="Start timer"');
    expect(text(html)).toContain('Change focus setup');
  });

  it('a user who customised lengths before setup existed is not asked again', () => {
    expect(hasSetup(render('/focus', timerValue(), settingsRow({ focus_block_minutes: 90 })))).toBe(false);
  });

  it('never over a running session, and setup cannot be reopened while one runs', () => {
    const base = createFocusTimerState({ blockMinutes: 25, breakMinutes: 5, flows: 4 }, 0);
    const running = { ...base, sessionId: 's', sessionStartedAt: 0, phaseEndsAt: 1_500_000, runningSince: 0 };
    const html = render('/focus', timerValue({ state: running, isPlaying: true, inProgress: true }), settingsRow());
    expect(hasSetup(html)).toBe(false);
    expect(html).toContain('aria-label="Pause timer"');
    expect(text(html)).not.toContain('Change focus setup');
  });

  it('never over a paused session either', () => {
    const base = createFocusTimerState({ blockMinutes: 25, breakMinutes: 5, flows: 4 }, 0);
    const paused = { ...base, sessionId: 's', sessionStartedAt: 0, remainingMs: 600_000 };
    const html = render('/focus', timerValue({ state: paused, inProgress: true, timeLeft: 600 }), settingsRow());
    expect(hasSetup(html)).toBe(false);
    expect(html).toContain('aria-label="Resume timer"');
    expect(text(html)).not.toContain('Change focus setup');
  });

  it('a finished session can reopen setup, so the next session uses new preferences', () => {
    const base = createFocusTimerState({ blockMinutes: 25, breakMinutes: 5, flows: 1 }, 0);
    const finished = { ...base, sessionId: 's', sessionStartedAt: 0, finished: true, flowsCompleted: 1, remainingMs: 0 };
    const html = render('/focus', timerValue({ state: finished, inProgress: false, timeLeft: 0 }), settingsRow({ timeboxing_style: 'pomodoro' }));
    expect(text(html)).toContain('Change focus setup');
  });

  it('guests keep the existing timer, with no setup and nothing to reopen', () => {
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
    expect(html).not.toContain('How would you like to focus?');
    expect(html).not.toContain('Change focus setup');
    expect(html).toContain('25:00');
  });

  it('desktop quick settings are hidden while setup is open, and back once setup is saved', () => {
    const panelOf = (html: string) => html.slice(html.indexOf('aria-label="This session"'));
    // Setup visible: the panel keeps its summary but offers no settings controls.
    const during = panelOf(render('/focus', timerValue(), settingsRow()));
    expect(text(during)).toContain('Choose your focus setup to begin.');
    expect(text(during)).not.toContain('Time boxing duration');
    // Setup confirmed (the saved row now carries a style): the normal settings return.
    const after = panelOf(render('/focus', timerValue(), settingsRow({ timeboxing_style: 'pomodoro' })));
    expect(text(after)).toContain('Time boxing duration');
    expect(text(after)).not.toContain('Choose your focus setup to begin.');
    // The phone's floating settings button follows the same rule.
    const source = readFileSync(new URL('./Focus.tsx', import.meta.url), 'utf8');
    expect(source).toContain('{!isLocked && !showSetup && (');
  });

  it('saving goes through applyFocusSetup and never calls play', () => {
    const source = readFileSync(new URL('./Focus.tsx', import.meta.url), 'utf8');
    const save = source.slice(source.indexOf('const saveSetup = async'), source.indexOf('const setupInitial'));
    expect(save).toContain('await updateSettings.mutateAsync(result.patch);');
    expect(save).toContain('applyFocusSetup(timerRef.current, result.config);');
    expect(save).not.toMatch(/\.play\(/);
  });
});
