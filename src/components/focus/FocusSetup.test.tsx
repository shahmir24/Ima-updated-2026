import React from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import FocusSetup from './FocusSetup';

const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const initial = { choice: 'short' as const, customBlock: '25', customBreak: '5', rounds: 4 };

describe('FocusSetup', () => {
  it('offers Short Focus 25/5, Deep Focus 45/15 and Custom, as named toggle buttons', () => {
    const html = renderToString(<FocusSetup initial={initial} onConfirm={vi.fn()} />);
    const t = text(html);
    expect(t).toContain('How would you like to focus?');
    expect(t).toContain('Short Focus 25 min focus · 5 min break');
    expect(t).toContain('Deep Focus 45 min focus · 15 min break');
    expect(t).toContain('Custom Choose your own lengths');
    expect(html).toMatch(/<section aria-labelledby="focus-setup-heading"/);
    expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Short Focus/);
  });

  it('1–5 rounds, 4 selected by default, each named', () => {
    const html = renderToString(<FocusSetup initial={initial} onConfirm={vi.fn()} />);
    for (const n of [1, 2, 3, 4, 5]) expect(html).toContain(`aria-label="${n} ${n === 1 ? 'round' : 'rounds'}"`);
    expect(html).toMatch(/aria-pressed="true" aria-label="4 rounds"/);
    expect(html).not.toContain('aria-label="6 rounds"');
  });

  it('custom lengths have labelled fields with their ranges', () => {
    const html = renderToString(<FocusSetup initial={{ ...initial, choice: 'custom' }} onConfirm={vi.fn()} />);
    expect(text(html)).toContain('Focus (1–240 min)');
    expect(text(html)).toContain('Break (1–60 min)');
    expect(html).toContain('id="focus-setup-block"');
    expect(html).toContain('id="focus-setup-break"');
  });

  it('says that saving will not start the timer; Cancel appears only when reopened', () => {
    const first = renderToString(<FocusSetup initial={initial} onConfirm={vi.fn()} />);
    expect(text(first)).toContain('Saving won’t start the timer.');
    expect(text(first)).not.toContain('Cancel');
    expect(text(renderToString(<FocusSetup initial={initial} onConfirm={vi.fn()} onCancel={vi.fn()} />))).toContain('Cancel');
  });
});
