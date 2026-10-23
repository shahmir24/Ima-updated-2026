import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';

/**
 * Regressions for the five functional fixes in final desktop batch 2. Pages
 * are rendered to HTML (there is no DOM here); effects and real input are
 * covered by browser QA.
 */

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

// Journal History reads its state from this hook; each test sets it.
const history = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('@/hooks/use-journal', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-journal')>()),
  useJournalHistory: () => history.state
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};
const render = (element: React.ReactElement, path: string) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
const source = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

const { default: SleepSwitch } = await import('./breathing/SleepSwitch');
const { default: Stats } = await import('./Stats');
const { default: RideTheWave } = await import('./breathing/RideTheWave');
const { default: JournalHistory } = await import('./JournalHistory');

describe('1. Sleep Switch — Back can be clicked', () => {
  it('the full-screen star layer lets clicks through and is hidden from screen readers', () => {
    const html = render(<SleepSwitch />, '/breathing/sleep-switch');
    const layer = html.match(/<div class="absolute inset-0 overflow-hidden[^"]*"[^>]*>/)?.[0] ?? '';
    expect(layer).toContain('pointer-events-none');
    expect(layer).toContain('aria-hidden="true"');
    // Stars themselves unchanged.
    expect(html).toMatch(/class="absolute w-1 h-1 bg-white rounded-full animate-pulse"/);
    expect(html).toContain('aria-label="Back"');
  });
});

describe('2. Stats — the shared phone bottom bar', () => {
  it('renders the one shared BottomNavigation, with room for it on phones only', () => {
    const html = render(<Stats />, '/stats');
    expect(html).toMatch(/<nav[^>]*class="fixed bottom-0[^"]*lg:hidden/);
    expect(html).toContain('href="/productivity"');
    expect(html).toMatch(/class="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-0"/);
    expect(source('./Stats.tsx')).toContain("import BottomNavigation from '@/components/productivity/BottomNavigation';");
  });
});

describe('3. Safe error messages', () => {
  const RAW = /row-level|policy|relation|JWT|PGRST|42501|journal_entries/i;

  beforeEach(() => {
    history.state = {};
  });

  it('Journal History: a failed load shows fixed wording, announced, with a Try again button', () => {
    history.state = {
      data: undefined, isFetched: true, isError: true, isFetching: false, refetch: () => {},
      error: { code: '42501', message: 'permission denied for table journal_entries (row-level security)' }
    };
    const html = render(<JournalHistory />, '/journaling/history');
    expect(html).toMatch(/role="alert"/);
    expect(html).toContain('We couldn’t open your journal with this account. Please sign in again.');
    expect(html).toMatch(/<button[^>]*>Try again<\/button>/);
    expect(html).not.toMatch(RAW);
  });

  it('Journal History: while retrying, the button says so and cannot be pressed twice', () => {
    history.state = { data: undefined, isFetched: true, isError: true, isFetching: true, refetch: () => {}, error: { message: 'TypeError: Failed to fetch' } };
    const html = render(<JournalHistory />, '/journaling/history');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Trying again…<\/button>/);
    expect(html).toContain('You seem to be offline.');
  });

  it('Journal History retries once, a second later — set on its own query, not app-wide', () => {
    const hook = source('../hooks/use-journal.ts');
    expect(hook).toMatch(/useJournalHistory\(\)[\s\S]*?retry: JOURNAL_HISTORY_RETRIES,\s+retryDelay: JOURNAL_HISTORY_RETRY_DELAY_MS/);
    expect(hook).toContain('export const JOURNAL_HISTORY_RETRIES = 1;');
    expect(source('../App.tsx')).toContain('const queryClient = new QueryClient();');
  });

  it('Auth and Onboarding show only fixed wording, and keep what was typed', () => {
    const authPage = source('./Auth.tsx');
    const catchBlock = authPage.slice(authPage.indexOf('} catch (error) {'), authPage.indexOf('} finally {'));
    expect(catchBlock).toContain('description: friendlyAuthError(error)');
    expect(catchBlock).not.toMatch(/error\.message/);
    // Nothing typed is cleared on failure.
    expect(catchBlock).not.toMatch(/set(Email|Password|ConfirmPassword|FullName)\(/);

    const onboarding = source('./Onboarding.tsx');
    const saveCatch = onboarding.slice(onboarding.indexOf('} catch (error) {'), onboarding.indexOf('} finally {'));
    expect(saveCatch).toContain('description: friendlyOnboardingError(error)');
    expect(saveCatch).not.toMatch(/error\.message/);
    // Answers and step are left as they were, and the failure reports false.
    expect(saveCatch).not.toMatch(/setData\(|setCurrentStep\(/);
    expect(saveCatch).toContain('return false;');
  });
});

describe('4. Ride the Wave — one input, one step; nothing before Start; keyboard too', () => {
  const html = render(<RideTheWave />, '/breathing/ride-the-wave');
  const zone = (label: string) => html.match(new RegExp(`<button[^>]*aria-label="${label}"[^>]*>`))?.[0] ?? '';

  it('the two halves of the wave are real buttons, named, described, and disabled until started', () => {
    for (const label of ['Breathe in: raise the wave', 'Breathe out: lower the wave']) {
      const button = zone(label);
      expect(button, label).toContain('type="button"');
      expect(button, label).toContain('disabled=""');
      expect(button, label).toContain('aria-describedby="ride-the-wave-how"');
      expect(button, label).toContain('focus-visible:ring-2');
    }
    expect(html).toMatch(/<p id="ride-the-wave-how" class="sr-only">Start the wave first\./);
    // Cycle progress is announced politely (BreathingProgress): "Cycle 1 of 5" before the first cycle.
    expect(html).toMatch(/aria-live="polite"[^>]*>Cycle 1 of 5</);
  });

  it('listens to click only — never touchstart and mousedown together', () => {
    const page = source('./breathing/RideTheWave.tsx');
    expect(page).not.toMatch(/onTouchStart|onMouseDown|onPointerDown/);
    expect(page.match(/onClick=\{\(\) => handleWaveInteraction\('(up|down)'\)\}/g)).toHaveLength(2);
    expect(page).toMatch(/const handleWaveInteraction = [\s\S]*?if \(!isActive \|\| complete\) return;[\s\S]*?waveStep\(waveHeight, direction\)/);
  });
});

describe('5. Body Scan — skipping through without playing is silent', () => {
  it('the closing line is spoken only through speaksCompletionLine (playing at completion)', () => {
    const page = source('./BodyScanSession.tsx');
    expect(page).toMatch(/if \(!speaksCompletionLine\(\{ showCompletion, isPlaying \}\)\) return;\s+speak\('complete', COMPLETION_LINE\);/);
    // Step guidance and audio focus are untouched: speaking while playing, focus held while playing.
    expect(page).toMatch(/if \(!isPlaying \|\| showCompletion\) return;\s+speak\(stepKey, currentInstruction\);/);
    expect(page).toContain('useSpokenGuidance({ volume: (settings?.sound_volume ?? 75) / 100, active: isPlaying })');
  });
});
