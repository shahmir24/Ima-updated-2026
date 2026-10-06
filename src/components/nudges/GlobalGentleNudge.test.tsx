import React from 'react';
import { readFileSync, readdirSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { NUDGE_COPY, _resetNudgeDismissalMemory, type NudgeAction } from '@/lib/nudges/in-app-nudge';
import { NUDGE_ROUTES } from '@/lib/nudges/nudge-routes';
import GlobalGentleNudge from './GlobalGentleNudge';

// No network: the Supabase client fails loudly if anything reaches it.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

// Navigation is observed, not performed.
const navigateSpy = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigateSpy
}));

// The popup renders for real; its handlers are captured so the tests can press × and the buttons.
const popup = vi.hoisted(() => ({ onDismiss: null as null | (() => void), onAction: null as null | ((a: NudgeAction) => void) }));
vi.mock('./GentleNudgePopup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./GentleNudgePopup')>();
  return {
    ...actual,
    default: (props: React.ComponentProps<typeof actual.default>) => {
      popup.onDismiss = props.onDismiss;
      popup.onAction = props.onAction;
      return actual.default(props);
    }
  };
});

const USER_ID = '11111111-1111-4111-8111-111111111111';
const user = { id: USER_ID } as User;
const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = iso(new Date());
const YESTERDAY = iso(new Date(Date.now() - 24 * 60 * 60 * 1000));

const auth = (state: 'signed-in' | 'signed-out' | 'not-onboarded'): AuthContextValue => ({
  session: state === 'signed-out' ? null : ({ user } as Session),
  user: state === 'signed-out' ? null : user,
  onboardingCompleted: state === 'signed-in' ? true : state === 'not-onboarded' ? false : null,
  loading: false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
});

const taskRow = (id: string, title: string, scheduled_date: string) => ({
  id, user_id: USER_ID, title, description: null, tag: 'focus', scheduled_date, start_time: null, end_time: null,
  completed: false, completed_at: null, importance: 'normal', created_at: '2026-01-01T09:00:00Z', updated_at: '2026-01-01T09:00:00Z'
});

let session: Map<string, string>;
beforeEach(() => {
  _resetNudgeDismissalMemory();
  navigateSpy.mockReset();
  popup.onDismiss = popup.onAction = null;
  session = new Map();
  const storage = { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v), removeItem: (k: string) => void session.delete(k) };
  vi.stubGlobal('window', { sessionStorage: storage, localStorage: storage });
});
afterEach(() => vi.unstubAllGlobals());

// Server rendering with a stubbed window makes React warn that useLayoutEffect
// cannot run on the server. Expected here, and only that one message is muted.
const consoleError = console.error;
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('useLayoutEffect does nothing on the server')) return;
    consoleError(...args);
  });
});
afterEach(() => vi.restoreAllMocks());

function render(path: string, options: { auth?: 'signed-in' | 'signed-out' | 'not-onboarded'; tasks?: ReturnType<typeof taskRow>[]; settings?: Record<string, unknown>; extra?: React.ReactNode } = {}) {
  const client = new QueryClient();
  client.setQueryData(['tasks', USER_ID], options.tasks ?? [taskRow('task-1', 'Email the landlord', TODAY)]);
  client.setQueryData(['user-settings', USER_ID], { user_id: USER_ID, nudges_enabled: true, nudge_show_task_titles: true, ...(options.settings ?? {}) });
  return renderToString(
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={auth(options.auth ?? 'signed-in')}>
        <MemoryRouter initialEntries={[path]}>
          {options.extra}
          <GlobalGentleNudge />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
}
const shown = (html: string) => html.includes('data-testid="gentle-nudge"');
const count = (html: string) => html.split('data-testid="gentle-nudge"').length - 1;

describe('GlobalGentleNudge — where it may appear', () => {
  it.each(['/', '/tasks', '/productivity', '/soundscape', '/stats', '/wellness', '/wellness/mindfulness', '/meditation', '/mindfulness/walking', '/journaling', '/journaling/history', '/profile-settings', '/profile-settings?tab=settings', '/tasks/'])(
    'allowed browsing route %s → shown',
    (path) => {
      expect(shown(render(path))).toBe(true);
    }
  );

  it('appears on a non-Home route with the Context Engine task', () => {
    const html = render('/stats');
    expect(html).toContain('One thing at a time');
    expect(html).toContain('Maybe start with “Email the landlord”.');
  });

  it.each([
    ['Focus', '/focus'],
    ['Focus with a task', '/focus?task=task-1'],
    ['Body Double', '/body-double'],
    ['Body Double with a task', '/body-double?task=task-1'],
    ['breathing menu', '/breathing'],
    ['a breathing exercise', '/breathing/steady-square'],
    ['another breathing exercise', '/breathing/ride-the-wave'],
    ['body scan intro', '/mindfulness/body-scan'],
    ['body scan session', '/mindfulness/body-scan/session'],
    ['a meditation', '/meditation/anchor'],
    ['a mindful walk', '/mindfulness/walking/breath-sync'],
    ['Safe Space', '/safe-space'],
    ['Safe Space chat', '/safe-space/chat'],
    ['safe contacts', '/safe-space/contacts'],
    ['the post-panic journal', '/journaling/post-panic'],
    ['a journal writing page', '/journaling/daily-journal'],
    ['auth', '/auth'],
    ['auth callback', '/auth/callback'],
    ['welcome', '/welcome'],
    ['onboarding', '/onboarding'],
    ['an unknown route', '/something-new']
  ])('%s (%s) → suppressed', (_label, path) => {
    expect(shown(render(path))).toBe(false);
  });

  it('a guest / signed-out visitor never gets it, even on Home', () => {
    expect(shown(render('/', { auth: 'signed-out' }))).toBe(false);
    expect(shown(render('/tasks', { auth: 'signed-out' }))).toBe(false);
  });

  it('a signed-in account that has not finished onboarding never gets it', () => {
    expect(shown(render('/', { auth: 'not-onboarded' }))).toBe(false);
  });

  it('the allowlist is exactly the reviewed set', () => {
    expect([...NUDGE_ROUTES].sort()).toEqual(
      ['/', '/journaling', '/journaling/history', '/meditation', '/mindfulness/walking', '/productivity', '/profile-settings', '/soundscape', '/stats', '/tasks', '/wellness', '/wellness/mindfulness'].sort()
    );
  });
});

describe('GlobalGentleNudge — rules carried over unchanged', () => {
  it('nudges disabled → hidden on allowed routes', () => {
    expect(shown(render('/tasks', { settings: { nudges_enabled: false } }))).toBe(false);
  });

  it('no eligible task → hidden', () => {
    expect(shown(render('/tasks', { tasks: [] }))).toBe(false);
  });

  it('copy is exactly the approved wording', () => {
    expect(NUDGE_COPY.recommended.heading).toBe('One thing at a time');
    expect(NUDGE_COPY.recommended.body('X')).toBe("Maybe start with “X”. You don't have to finish it. Just start.");
    expect(NUDGE_COPY.recommended.primary).toBe('Start');
    expect(NUDGE_COPY.recommended.secondary).toBe("I'm stuck");
    expect(NUDGE_COPY.overdue.heading).toBe('Still worth doing');
    expect(NUDGE_COPY.overdue.body('X')).toBe('“X” is still waiting. A small step counts.');
    expect(NUDGE_COPY.overdue.primary).toBe('Start');
    expect(NUDGE_COPY.overdue.secondary).toBe("I'm stuck");
    expect(NUDGE_COPY.generic.heading).toBe('A gentle nudge');
    expect(NUDGE_COPY.generic.body).toBe('One thing on your list could use a little attention. One small step is enough.');
    expect(NUDGE_COPY.generic.primary).toBe("See what's next");
  });

  it('overdue and privacy copy render the same away from Home', () => {
    const overdue = render('/wellness', { tasks: [taskRow('task-1', 'Book the dentist', YESTERDAY)] });
    expect(overdue).toContain('Still worth doing');
    expect(overdue).toContain('“Book the dentist” is still waiting. A small step counts.');
    const generic = render('/journaling', { settings: { nudge_show_task_titles: false }, tasks: [taskRow('task-1', 'Therapy appointment', TODAY)] });
    expect(generic).toContain('A gentle nudge');
    expect(generic).not.toContain('Therapy');
  });
});

describe('GlobalGentleNudge — dismissal and actions across routes', () => {
  it('× on one allowed route keeps it away on the others for the session', () => {
    expect(shown(render('/tasks'))).toBe(true);
    popup.onDismiss!();
    for (const path of ['/stats', '/', '/profile-settings', '/tasks']) expect(shown(render(path)), path).toBe(false);
  });

  it('Start (from a non-Home route) → Focus with the selected task, and it stays dismissed', () => {
    render('/stats');
    popup.onAction!('start');
    expect(navigateSpy).toHaveBeenCalledWith('/focus?task=task-1');
    expect(shown(render('/tasks'))).toBe(false);
  });

  it('I’m stuck → Body Double with the selected task, and it stays dismissed', () => {
    render('/journaling');
    popup.onAction!('stuck');
    expect(navigateSpy).toHaveBeenCalledWith('/body-double?task=task-1');
    expect(shown(render('/'))).toBe(false);
  });

  it('See what’s next → the task list', () => {
    render('/stats', { settings: { nudge_show_task_titles: false } });
    popup.onAction!('see-next');
    expect(navigateSpy).toHaveBeenCalledWith('/tasks');
  });
});

describe('GlobalGentleNudge — one instance', () => {
  it('a page plus the global mount renders exactly one nudge', () => {
    const Page = () => <main>a page</main>;
    const html = render('/tasks', { extra: <Routes><Route path="/tasks" element={<Page />} /></Routes> });
    expect(count(html)).toBe(1);
  });

  it('App mounts it once, outside <Routes>, and no page mounts its own', () => {
    const app = readFileSync(new URL('../../App.tsx', import.meta.url), 'utf8');
    expect(app.match(/<GlobalGentleNudge\s*\/>/g)).toHaveLength(1);
    expect(app.indexOf('<GlobalGentleNudge')).toBeGreaterThan(app.lastIndexOf('</Routes>'));
    expect(app.indexOf('<GlobalGentleNudge')).toBeLessThan(app.indexOf('</BrowserRouter>'));

    const pagesDir = new URL('../../pages/', import.meta.url);
    for (const file of readdirSync(pagesDir, { recursive: true }) as string[]) {
      if (!/\.tsx?$/.test(file) || /\.test\./.test(file)) continue;
      const source = readFileSync(new URL(file, pagesDir), 'utf8');
      expect(source, file).not.toMatch(/GentleNudgePopup|GlobalGentleNudge|useInAppNudge/);
    }
  });
});
