import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';

/**
 * Keyboard access and control names on the wellness and productivity menus
 * and the exercise screens. There is no DOM here: pages are rendered to HTML,
 * which shows the elements, links and names a browser would get.
 */

vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session, user, onboardingCompleted: true, loading: false,
  signOut: async () => {}, refreshOnboardingStatus: async () => {}, markOnboardingComplete: () => {}
};

const render = (element: React.ReactElement, path = '/') =>
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
      </AuthContext.Provider>
    </QueryClientProvider>
  );

const { default: Wellness } = await import('./Wellness');
const { default: MindfulnessMenu } = await import('./MindfulnessMenu');
const { default: BreathingMenu } = await import('./BreathingMenu');
const { default: MeditationMenu } = await import('./MeditationMenu');
const { default: MindfulWalkingMenu } = await import('./MindfulWalkingMenu');
const { default: JournalingMenu } = await import('./JournalingMenu');
const { ToolCardsGrid, toolCards } = await import('@/components/productivity/ToolCardsGrid');

/** Each menu's destinations, exactly as they were before the cards became links. */
const MENUS: [string, () => React.ReactElement, string, string[]][] = [
  ['Wellness', () => <Wellness />, '/wellness', ['/wellness/mindfulness', '/breathing', '/safe-space', '/journaling']],
  ['Mindfulness', () => <MindfulnessMenu />, '/wellness/mindfulness', ['/meditation', '/mindfulness/body-scan', '/mindfulness/walking']],
  ['Breathing', () => <BreathingMenu />, '/breathing', ['/breathing/steady-square', '/breathing/triangle-calm', '/breathing/deep-reset', '/breathing/sleep-switch', '/breathing/ride-the-wave']],
  ['Meditation', () => <MeditationMenu />, '/meditation', ['/meditation/focus-reset', '/meditation/anchor']],
  ['Mindful Walking', () => <MindfulWalkingMenu />, '/mindfulness/walking', ['/mindfulness/walking/breath-sync', '/mindfulness/walking/break-loop']],
  ['Journaling', () => <JournalingMenu />, '/journaling', ['/journaling/morning-intention', '/journaling/daily-journal', '/journaling/post-panic', '/journaling/focus-reset', '/journaling/gratitude', '/journaling/sensory-checkin', '/journaling/history']],
  ['Productivity tools', () => <ToolCardsGrid filteredTools={toolCards} />, '/productivity', ['/focus', '/body-double', '/soundscape', '/stats', '/tasks', '/wellness']]
];

/** The <a> elements whose href is one of `routes`, with their full inner HTML. */
const cardLinks = (html: string, routes: string[]) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)]
    .map(([, attrs, inner]) => ({ attrs, inner, href: attrs.match(/href="([^"]*)"/)?.[1] ?? '' }))
    .filter((link) => routes.includes(link.href));

describe('menu cards are keyboard-reachable links', () => {
  it.each(MENUS)('%s: every card is a real link to its original destination', (_name, page, path, routes) => {
    const html = render(page(), path);
    const links = cardLinks(html, routes);
    expect(links.map((l) => l.href)).toEqual(routes);
    for (const link of links) {
      // In the Tab order (no tabindex="-1"), and shows a ring for keyboard focus.
      expect(link.attrs, link.href).not.toMatch(/tabindex="-1"/);
      expect(link.attrs, link.href).toContain('focus-visible:ring-2');
      // Has a name: the card's own title text.
      expect(link.inner.replace(/<[^>]+>/g, '').trim().length, link.href).toBeGreaterThan(3);
      // No interactive element inside a link.
      expect(link.inner, link.href).not.toMatch(/<(a|button|input|select|textarea)\b/);
    }
  });

  it.each(MENUS)('%s: no clickable div is left behind', (_name, page, path) => {
    const html = render(page(), path);
    expect(html).not.toMatch(/<div[^>]*cursor-pointer/);
  });

  it('menu sources no longer navigate from an onClick or log to the console', () => {
    for (const file of ['Wellness', 'MindfulnessMenu', 'BreathingMenu', 'MeditationMenu', 'MindfulWalkingMenu', 'JournalingMenu']) {
      const source = readFileSync(new URL(`./${file}.tsx`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/onClick=\{\(\) => handleOptionClick/);
      expect(source, file).not.toContain('console.log');
    }
  });
});

const { default: SteadySquare } = await import('./breathing/SteadySquare');
const { default: TriangleCalm } = await import('./breathing/TriangleCalm');
const { default: DeepReset } = await import('./breathing/DeepReset');
const { default: SleepSwitch } = await import('./breathing/SleepSwitch');
const { default: RideTheWave } = await import('./breathing/RideTheWave');
const { default: AnchorGrounding } = await import('./AnchorGrounding');

/** Buttons in the HTML with neither text nor an aria-label. */
const unnamedButtons = (html: string) =>
  [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].filter(
    ([, attrs, inner]) => !/aria-label="[^"]+"/.test(attrs) && !inner.replace(/<[^>]+>/g, '').trim()
  );

const EXERCISES: [string, () => React.ReactElement, string, string, string][] = [
  ['Steady Square', () => <SteadySquare />, '/breathing/steady-square', 'Start Steady Square', 'Reset Steady Square'],
  ['Triangle Calm', () => <TriangleCalm />, '/breathing/triangle-calm', 'Start Triangle Calm', 'Reset Triangle Calm'],
  ['Deep Reset', () => <DeepReset />, '/breathing/deep-reset', 'Start Deep Reset', 'Reset Deep Reset'],
  ['Sleep Switch', () => <SleepSwitch />, '/breathing/sleep-switch', 'Start Sleep Switch', 'Reset Sleep Switch'],
  ['Ride the Wave', () => <RideTheWave />, '/breathing/ride-the-wave', 'Start the wave', 'Reset Ride the Wave'],
  ['Anchor Grounding', () => <AnchorGrounding />, '/meditation/anchor', 'Start Anchor Grounding', 'Reset Anchor Grounding']
];

describe('exercise controls have names', () => {
  it.each(EXERCISES)('%s: before it starts, Play is “Start …”, Reset is named, Back is named, and nothing is unnamed', (_n, page, path, play, reset) => {
    const html = render(page(), path);
    expect(html).toContain(`aria-label="${play}"`);
    expect(html).toContain(`aria-label="${reset}"`);
    expect(html).toContain('aria-label="Back"');
    expect(unnamedButtons(html)).toEqual([]);
  });

  // The rendered page shows only the first state, so the switching itself is
  // pinned here in the source; browser QA presses the buttons.
  it.each([
    ['breathing/SteadySquare', 'Steady Square'], ['breathing/TriangleCalm', 'Triangle Calm'],
    ['breathing/DeepReset', 'Deep Reset'], ['breathing/SleepSwitch', 'Sleep Switch'], ['AnchorGrounding', 'Anchor Grounding']
  ])('%s: the play button is Pause while running, Resume once started, Start before', (file, name) => {
    const source = readFileSync(new URL(`./${file}.tsx`, import.meta.url), 'utf8');
    expect(source).toContain(`aria-label={isActive ? 'Pause ${name}' : hasStarted ? 'Resume ${name}' : 'Start ${name}'}`);
    expect(source).toMatch(/const hasStarted = isActive \|\| /);
  });

  it.each([
    ['breathing/RideTheWave', "aria-label={isActive ? 'Pause the wave' : 'Start the wave'}"],
    ['FocusReset', "aria-label={isActive ? 'Pause Focus Reset' : 'Resume Focus Reset'}"],
    ['FocusReset', 'aria-label="Restart Focus Reset"'],
    ['BreathSyncWalk', "aria-label={isActive ? 'Pause walking' : 'Resume walking'}"],
    ['BodyScanSession', 'aria-label="Exit body scan"'],
    ['BodyScanSession', "aria-label={hasStarted ? (isPlaying ? 'Pause body scan' : 'Resume body scan') : 'Start body scan'}"]
  ])('%s: %s', (file, label) => {
    expect(readFileSync(new URL(`./${file}.tsx`, import.meta.url), 'utf8')).toContain(label);
  });

  it('every icon-only Button in the exercise screens has an aria-label', () => {
    for (const file of ['breathing/SteadySquare', 'breathing/TriangleCalm', 'breathing/DeepReset', 'breathing/SleepSwitch', 'breathing/RideTheWave',
      'FocusReset', 'AnchorGrounding', 'BreathSyncWalk', 'BreakLoopWalk', 'BodyScanSession', 'BodyScanIntro']) {
      const source = readFileSync(new URL(`./${file}.tsx`, import.meta.url), 'utf8');
      for (const [button] of source.matchAll(/<Button\b[\s\S]*?<\/Button>/g)) {
        const text = button.replace(/<Button\b[\s\S]*?>/, '').replace(/<\/Button>/, '').replace(/<[^>]+\/>/g, '').replace(/\{[^}]*\}/g, '').trim();
        if (!text) expect(button, `${file}: ${button.slice(0, 80)}`).toMatch(/aria-label=/);
      }
    }
  });
});

describe('onboarding', () => {
  it('the free-text answer is labelled by its visible question', () => {
    const source = readFileSync(new URL('./Onboarding.tsx', import.meta.url), 'utf8');
    expect(source).toContain('<h2 id="onboarding-question"');
    expect(source).toMatch(/<Textarea\s+aria-labelledby="onboarding-question"/);
    // The question heading is rendered once per step, so the id is unique.
    expect(source.match(/id="onboarding-question"/g)).toHaveLength(1);
  });
});
