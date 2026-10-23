import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BreathingProgress from './BreathingProgress';
import BreathingComplete from './BreathingComplete';

const dots = (html: string) => [...html.matchAll(/data-dot="(\w+)"/g)].map((m) => m[1]);

describe('BreathingProgress', () => {
  it('before starting: five dots, the first outlined, and "Cycle 1 of 5" announced politely', () => {
    const html = renderToString(<BreathingProgress completed={0} />);
    expect(dots(html)).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
    expect(html).toMatch(/aria-live="polite" aria-atomic="true">Cycle 1 of 5</);
    // The dots are decoration; the words carry the meaning.
    expect(html).toMatch(/aria-hidden="true" data-breathing-dots=""/);
  });

  it('mid-session and complete', () => {
    expect(dots(renderToString(<BreathingProgress completed={3} />))).toEqual(['done', 'done', 'done', 'current', 'todo']);
    const done = renderToString(<BreathingProgress completed={5} />);
    expect(dots(done)).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(done).toContain('Cycle 5 of 5');
    expect(renderToString(<BreathingProgress completed={6} />)).not.toContain('6 of 5');
  });
});

describe('BreathingComplete', () => {
  it('a labelled section with Start Again and Done, both named', () => {
    const html = renderToString(<BreathingComplete name="Triangle Calm" onStartAgain={vi.fn()} onDone={vi.fn()} />);
    expect(html).toMatch(/<section aria-labelledby="breathing-complete-heading"/);
    expect(html).toMatch(/<h2 id="breathing-complete-heading" tabindex="-1"[^>]*>5<!-- --> cycles complete<\/h2>/);
    expect(html).toMatch(/aria-label="Start Triangle Calm again"[^>]*>Start Again<\/button>/);
    expect(html).toMatch(/>Done<\/button>/);
  });

  it('wires its actions straight to the buttons and takes focus when it appears', () => {
    const source = readFileSync(new URL('./BreathingComplete.tsx', import.meta.url), 'utf8');
    expect(source).toContain('onClick={onStartAgain}');
    expect(source).toContain('onClick={onDone}');
    expect(source).toMatch(/headingRef\.current\?\.focus\(\)/);
  });
});

// The pages have no DOM here, so their wiring is pinned in the source; the
// browser run drives each exercise through five cycles.
const TIMED = [
  ['SteadySquare', 'Steady Square'],
  ['TriangleCalm', 'Triangle Calm'],
  ['DeepReset', 'Deep Reset'],
  ['SleepSwitch', 'Sleep Switch']
] as const;

const page = (file: string) => readFileSync(new URL(`../../pages/breathing/${file}.tsx`, import.meta.url), 'utf8');

describe.each(TIMED)('%s completes after five cycles', (file, name) => {
  const source = page(file);

  it('counts with nextCycleCount, so there is never a sixth cycle', () => {
    expect(source).toContain('setCycles((c) => nextCycleCount(c));');
    expect(source).not.toMatch(/setCycles\(c => c \+ 1\)/);
  });

  it('its timer stops itself at completion and is cleared on unmount', () => {
    expect(source).toMatch(/if \(isActive && !complete\) \{/);
    expect(source).toMatch(/return \(\) => clearInterval\(interval\);\n {2}\}, \[isActive, (phase, )?complete\]\);/);
  });

  it('never announces the next Inhale once complete, and silences the voice', () => {
    expect(source).toMatch(/if \(!isActive \|\| complete\) return;\n {4}speak\(/);
    expect(source).toMatch(/if \(!complete\) return;\n {4}cancelVoice\(\);\n {4}setIsActive\(false\);/);
  });

  it('shows the completion card in place of the controls, with Start Again and Done', () => {
    expect(source).toContain(
      `<BreathingComplete name="${name}" onStartAgain={startAgain} onDone={() => navigate('/breathing')} />`
    );
    expect(source).toMatch(/const startAgain = \(\) => \{\n {4}resetBreathing\(\);\n {4}setIsActive\(true\);\n {2}\};/);
    expect(source).toContain('<BreathingProgress completed={cycles} />');
    expect(source).not.toContain('Cycles completed:');
  });
});

describe('Ride the Wave completes after five successful cycles', () => {
  const source = page('RideTheWave');

  it('stops taking taps once complete — in the handler and on the buttons', () => {
    expect(source).toMatch(/if \(!isActive \|\| complete\) return;/);
    expect(source.match(/disabled=\{!isActive \|\| complete\}/g)).toHaveLength(2);
    expect(source).toContain('setCycles((prev) => nextCycleCount(prev));');
  });

  it('stops the wave and shows the completion card', () => {
    expect(source).toMatch(/if \(complete\) setIsActive\(false\);/);
    expect(source).toContain(`<BreathingComplete name="Ride the Wave" onStartAgain={startAgain} onDone={() => navigate('/breathing')} />`);
    expect(source).toContain('<BreathingProgress completed={cycles} />');
  });
});
