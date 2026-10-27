import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import PageHeader from '@/components/layout/PageHeader';
import NotFound from './NotFound';

/**
 * Desktop (lg and up, where the sidebar shows) relies on the sidebar for
 * top-level pages, so their back arrows are hidden there. Phones keep every
 * arrow, and subpages keep their arrow to the parent menu at every width.
 */

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const inRouter = (element: React.ReactElement) => renderToString(<MemoryRouter>{element}</MemoryRouter>);
/** The "Go back" button's class attribute. */
const backClass = (html: string) => html.match(/<button[^>]*class="([^"]*)"[^>]*aria-label="Go back"|<button[^>]*aria-label="Go back"[^>]*class="([^"]*)"/)?.slice(1).find(Boolean) ?? '';

describe('PageHeader', () => {
  it('keeps the back arrow at every width by default (subpages)', () => {
    const cls = backClass(inRouter(<PageHeader title="Meditation" backPath="/wellness/mindfulness" />));
    expect(cls).toContain('h-11 w-11');
    expect(cls).not.toContain('lg:hidden');
  });

  it('hideBackOnDesktop hides it only from lg; it is still rendered for phones', () => {
    const html = inRouter(<PageHeader title="Statistics" backPath="/productivity" hideBackOnDesktop />);
    expect(backClass(html)).toMatch(/(^| )lg:hidden( |$)/);
    expect(backClass(html)).not.toMatch(/(^| )hidden( |$)/);
  });
});

describe('top-level pages hide their redundant back arrow on desktop only', () => {
  it.each(['./Tasks.tsx', './Stats.tsx', './Wellness.tsx', './JournalingMenu.tsx'])('%s uses hideBackOnDesktop', (file) => {
    expect(source(file)).toMatch(/<PageHeader [^>]*hideBackOnDesktop \/>/);
  });

  it('Focus, Soundscape and Profile & Settings: their own back button is lg:hidden', () => {
    expect(source('./Focus.tsx')).toMatch(/navigate\(mode === 'guest' \? '\/' : '\/productivity'\)\}[\s\S]{0,120}className="h-11 w-11 rounded-full p-0 hover:bg-white\/10 lg:hidden"/);
    expect(source('./Soundscape.tsx')).toMatch(/navigate\('\/productivity'\)\}[\s\S]{0,120}className="h-11 w-11 rounded-full p-0 hover:bg-white\/10 lg:hidden"/);
    expect(source('./ProfileSettings.tsx')).toContain('className="h-11 w-11 rounded-full lg:hidden"\n            aria-label="Go back"');
  });

  it('Body Double: all three screens (setup, session, wrap-up) hide the arrow on desktop', () => {
    const page = source('./BodyDouble.tsx');
    const arrows = page.match(/onClick=\{\(\) => navigate\('\/productivity'\)\}\s+className="([^"]*)"/g) ?? [];
    expect(arrows).toHaveLength(3);
    for (const arrow of arrows) expect(arrow).toContain('lg:hidden');
  });

  it('the Focus lock and the Body Double wrap-up "Return to Home" are untouched', () => {
    expect(source('./Focus.tsx')).toContain('className="h-11 w-11 rounded-full p-0 hover:bg-white/10 z-50 lg:ml-auto"');
    expect(source('./BodyDouble.tsx')).toMatch(/onClick=\{\(\) => navigate\('\/'\)\}\s+>\s+Return to Home/);
  });
});

describe('subpages, guided exercises and flows keep their way back at every width', () => {
  it.each(['./BreathingMenu.tsx', './MeditationMenu.tsx', './MindfulnessMenu.tsx', './MindfulWalkingMenu.tsx', './JournalHistory.tsx'])(
    '%s keeps its arrow to the parent menu',
    (file) => {
      const header = source(file).match(/<PageHeader [^>]*\/>/)?.[0] ?? '';
      expect(header).not.toBe('');
      expect(header).not.toContain('hideBackOnDesktop');
    }
  );

  it('WellnessHeader (breathing, meditation, walking, Safe Space) and journal writing pages are not hidden', () => {
    expect(source('../components/wellness/WellnessHeader.tsx')).not.toContain('lg:hidden');
    const journal = source('../components/journal/JournalPageLayout.tsx');
    const back = journal.slice(journal.indexOf('onClick={() => navigate(backPath)}') - 200, journal.indexOf('onClick={() => navigate(backPath)}') + 200);
    expect(back).not.toMatch(/className="[^"]*lg:hidden[^"]*"[^>]*aria-label/);
  });

  it('Daily Journal goes back to Journaling, like the other writing pages', () => {
    const page = source('./DailyJournal.tsx');
    expect(page).toContain('backPath="/journaling"');
    expect(page).toContain('backLabel="Back to Journaling"');
  });
});

describe('404 page', () => {
  it('uses the app theme, a readable heading and an in-app link Home', () => {
    const html = inRouter(<NotFound />);
    expect(html).toContain('bg-background');
    expect(html).not.toContain('bg-gray-100');
    expect(html).toMatch(/<h1 class="[^"]*text-white[^"]*">404<\/h1>/);
    // A router <Link>, rendered as an anchor to "/", inside the app's Button styling.
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Return to Home<\/a>/);
    expect(source('./NotFound.tsx')).toContain('<Link to="/">');
  });
});

describe('Statistics alignment', () => {
  it('phones keep the centred layout; desktop starts under the title', () => {
    expect(source('./Stats.tsx')).toContain('<main className="flex-1 flex flex-col justify-center lg:justify-start">');
  });
});
