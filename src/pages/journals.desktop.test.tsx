import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { JOURNAL_TYPE_META } from '@/lib/journal-types';
import type { JournalType } from '@/hooks/use-journal';
import MorningIntention from './MorningIntention';
import DailyJournal from './DailyJournal';
import PostPanicJournal from './PostPanicJournal';
import FocusResetJournal from './FocusResetJournal';
import GratitudeJournal from './GratitudeJournal';
import SensoryCheckIn from './SensoryCheckIn';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

const render = (Page: React.ComponentType) =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter>
          <Page />
        </MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const source = (file: string) => readFileSync(new URL(`./${file}.tsx`, import.meta.url), 'utf8');

/** Every screen: its type, its fields exactly as stored, its back path, save label and width. */
const SCREENS: {
  type: JournalType; file: string; Page: React.ComponentType; empty: string;
  back: string; backLabel: string; save: string; width: 'standard' | 'narrow' | 'pair';
}[] = [
  { type: 'morning-intention', file: 'MorningIntention', Page: MorningIntention, empty: "{ intention: '' }", back: '/journaling', backLabel: 'Back to Journaling', save: 'Save Intention', width: 'narrow' },
  { type: 'daily-journal', file: 'DailyJournal', Page: DailyJournal, empty: "{ onMind: '', energy: '', letGoLeanIn: '' }", back: '/wellness', backLabel: 'Back to Wellness', save: 'Save Entry', width: 'standard' },
  { type: 'post-panic', file: 'PostPanicJournal', Page: PostPanicJournal, empty: "{ whatHappened: '', howItFelt: '', whatNeeded: '' }", back: '/journaling', backLabel: 'Back to Journaling', save: 'Save Reflection', width: 'standard' },
  { type: 'focus-reset', file: 'FocusResetJournal', Page: FocusResetJournal, empty: "{ whatMatters: '', justNoise: '' }", back: '/journaling', backLabel: 'Back to Journaling', save: 'Save Focus Reset', width: 'pair' },
  { type: 'gratitude', file: 'GratitudeJournal', Page: GratitudeJournal, empty: "{ smile: '', warmth: '' }", back: '/journaling', backLabel: 'Back to Journaling', save: 'Save Gratitude', width: 'pair' },
  { type: 'sensory-checkin', file: 'SensoryCheckIn', Page: SensoryCheckIn, empty: "{ sensations: '', bodyAwareness: '', softenSpot: '' }", back: '/journaling', backLabel: 'Back to Journaling', save: 'Save Check-In', width: 'standard' }
];

describe.each(SCREENS)('$file', ({ type, file, Page, empty, back, backLabel, save, width }) => {
  const html = render(Page);
  const src = source(file);

  it('keeps its journal type, field keys and save path', () => {
    expect(src).toContain(`useJournalEntryForm('${type}', ${empty})`);
    expect(src).toContain("if ((await journal.save()) === 'saved') navigate('/journaling');");
    expect(src).toContain(`backPath="${back}"`);
    expect(text(html)).toContain(save);
  });

  it('every writing area is named by its question — the same wording Journal History uses', () => {
    const questions = JOURNAL_TYPE_META[type].fields.map((field) => field.question);
    const textareas = html.match(/<textarea[^>]*>/g) ?? [];
    expect(textareas).toHaveLength(questions.length);
    if (type === 'morning-intention') {
      expect(textareas[0]).toContain(`aria-label="${questions[0]}"`);
      return;
    }
    for (const [index, question] of questions.entries()) {
      const id = textareas[index].match(/id="([^"]+)"/)?.[1];
      expect(id, question).toBeTruthy();
      // The label points at this textarea, holds the question, and hides the emoji.
      const label = html.match(new RegExp(`<label[^>]*for="${id}"[^>]*>([\\s\\S]*?)</label>`))?.[1] ?? '';
      expect(text(label).trim()).toBe(`✍️ ${question}`);
      expect(label).toContain('<span aria-hidden="true">✍️ </span>');
    }
    // Two prompts on one page never share an id.
    const ids = textareas.map((t) => t.match(/id="([^"]+)"/)?.[1]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('the back button says where it goes', () => {
    expect(html).toContain(`aria-label="${backLabel}"`);
  });

  it('Save has dark text on its colour (WCAG AA) and keeps its phone width', () => {
    const button = html.match(new RegExp(`<button[^>]*>(?:(?!</button>)[\\s\\S])*${save}`))?.[0] ?? '';
    expect(button).toContain('text-slate-950');
    expect(button).not.toContain('text-white');
    expect(button).toContain('w-full h-12');
    expect(button).toContain('lg:ml-auto lg:flex lg:w-auto');
  });

  it(`desktop: ${width} writing column; phones keep the original column`, () => {
    const expected = { standard: 'lg:max-w-3xl', narrow: 'lg:max-w-2xl', pair: 'lg:max-w-3xl xl:max-w-5xl' }[width];
    expect(html).toContain(`flex-1 max-w-lg w-full mx-auto px-4 space-y-6 lg:px-8 ${expected}`);
    expect(html).toContain('w-full max-w-lg mx-auto p-4 flex items-center justify-between lg:justify-start');
    // Two columns from xl only for the paired questions.
    expect(html.includes('xl:grid xl:grid-cols-2')).toBe(width === 'pair');
  });
});

describe('journal layout', () => {
  it('Post-Panic stays one simple column', () => {
    expect(source('PostPanicJournal')).not.toContain('columns={2}');
    expect(source('PostPanicJournal')).not.toContain('width="pair"');
  });

  it('WellnessHeader, shared by other screens, is not used or changed by the journals', () => {
    for (const { file } of SCREENS) expect(source(file)).not.toContain('WellnessHeader');
    const header = readFileSync(new URL('../components/wellness/WellnessHeader.tsx', import.meta.url), 'utf8');
    expect(header).toContain('<header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">');
  });
});

describe('journal loading state', () => {
  it.each(SCREENS)('$file: while today’s entry loads, says so and keeps its fields read-only (Post-Panic never waits)', ({ type, Page }) => {
    // Rendered on the server, the today query never runs, so a one-per-day
    // journal is still loading here; Post-Panic has nothing to load.
    const html = render(Page);
    const textareas = html.match(/<textarea[^>]*>/g) ?? [];
    const loads = type !== 'post-panic';
    expect(text(html).includes('Loading today’s entry…'), 'loading line').toBe(loads);
    for (const textarea of textareas) expect(textarea.includes('readOnly=""') || textarea.includes(' readonly'), 'read-only').toBe(loads);
    if (loads) expect(html).toMatch(/role="status" aria-live="polite"[^>]*>Loading today’s entry…/);
  });
});
