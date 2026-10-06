import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectInAppNudge, type InAppNudge, type NudgeTask } from '@/lib/nudges/in-app-nudge';
import GentleNudgePopup, { GENTLE_NUDGE_HEADING_ID } from './GentleNudgePopup';

const TODAY = '2026-10-06';
const task = (id: string, title: string, scheduled_date: string): NudgeTask => ({
  id,
  title,
  scheduled_date,
  created_at: '2026-10-01T09:00:00Z',
  completed: false,
  importance: 'normal'
});
const nudgeFor = (tasks: NudgeTask[], showTitles = true) =>
  selectInAppNudge({
    signedIn: true,
    settings: { nudges_enabled: true, nudge_show_task_titles: showTitles },
    tasksReady: true,
    tasks,
    today: TODAY,
    dismissed: new Set()
  }) as InAppNudge;

/** The popup is a plain function of its props, so its element tree can be inspected and its handlers called directly. */
type El = React.ReactElement<{ children?: React.ReactNode; onClick?: () => void; 'aria-label'?: string; type?: string }>;
function buttons(node: React.ReactNode): El[] {
  const found: El[] = [];
  const walk = (n: React.ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!React.isValidElement(n)) return;
    const el = n as El;
    if (el.type === 'button') found.push(el);
    walk(el.props.children);
  };
  walk(node);
  return found;
}
const text = (el: El): string => {
  const c = el.props.children;
  return typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => typeof x === 'string').join('') : '';
};

afterEach(() => vi.useRealTimers());

describe('GentleNudgePopup', () => {
  it('renders nothing without a nudge', () => {
    expect(GentleNudgePopup({ nudge: null, onDismiss: () => {}, onAction: () => {} })).toBeNull();
  });

  it('recommended: heading, body with the title, Start and I’m stuck, an accessible ×', () => {
    const html = renderToString(<GentleNudgePopup nudge={nudgeFor([task('t1', 'Email the landlord', TODAY)])} onDismiss={() => {}} onAction={() => {}} />);
    expect(html).toContain('One thing at a time');
    expect(html).toContain('Maybe start with “Email the landlord”. You don&#x27;t have to finish it. Just start.');
    expect(html).toContain('>Start<');
    expect(html).toContain('>I&#x27;m stuck<');
    expect(html).toContain('aria-label="Close gentle nudge"');
    expect(html).toContain(`aria-labelledby="${GENTLE_NUDGE_HEADING_ID}"`);
    expect(html).toContain('role="region"');
    // Not an alert: no alert/alertdialog roles, no live interruption, no modal.
    expect(html).not.toMatch(/role="(alert|alertdialog|dialog)"|aria-modal/);
  });

  it('overdue: the overdue copy', () => {
    const html = renderToString(<GentleNudgePopup nudge={nudgeFor([task('t1', 'Book the dentist', '2026-10-02')])} onDismiss={() => {}} onAction={() => {}} />);
    expect(html).toContain('Still worth doing');
    expect(html).toContain('“Book the dentist” is still waiting. A small step counts.');
  });

  it('generic (titles hidden): no title, only See what’s next', () => {
    const nudge = nudgeFor([task('t1', 'Therapy appointment', TODAY)], false);
    const html = renderToString(<GentleNudgePopup nudge={nudge} onDismiss={() => {}} onAction={() => {}} />);
    expect(html).toContain('A gentle nudge');
    expect(html).not.toContain('Therapy');
    expect(html).not.toContain('I&#x27;m stuck');
    const labels = buttons(GentleNudgePopup({ nudge, onDismiss: () => {}, onAction: () => {} })).map(text);
    expect(labels).toEqual(['', "See what's next"]);
  });

  it('× calls onDismiss only', () => {
    const onDismiss = vi.fn();
    const onAction = vi.fn();
    const [close] = buttons(GentleNudgePopup({ nudge: nudgeFor([task('t1', 'x', TODAY)]), onDismiss, onAction }));
    expect(close.props['aria-label']).toBe('Close gentle nudge');
    close.props.onClick!();
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onAction).not.toHaveBeenCalled();
  });

  it('Start and I’m stuck report their actions', () => {
    const onAction = vi.fn();
    const [, start, stuck] = buttons(GentleNudgePopup({ nudge: nudgeFor([task('t1', 'x', TODAY)]), onDismiss: () => {}, onAction }));
    start.props.onClick!();
    stuck.props.onClick!();
    expect(onAction.mock.calls).toEqual([['start'], ['stuck']]);
  });

  it('never dismisses itself: no timers, and still shown however much time passes', () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    const nudge = nudgeFor([task('t1', 'x', TODAY)]);
    const before = renderToString(<GentleNudgePopup nudge={nudge} onDismiss={onDismiss} onAction={() => {}} />);
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(vi.getTimerCount()).toBe(0);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(renderToString(<GentleNudgePopup nudge={nudge} onDismiss={onDismiss} onAction={() => {}} />)).toBe(before);

    for (const file of ['./GentleNudgePopup.tsx', '../../hooks/use-in-app-nudge.ts', '../../lib/nudges/in-app-nudge.ts', './GlobalGentleNudge.tsx']) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/);
    }
  });

  it('reduced motion turns the entrance animation off', () => {
    const html = renderToString(<GentleNudgePopup nudge={nudgeFor([task('t1', 'x', TODAY)])} onDismiss={() => {}} onAction={() => {}} />);
    expect(html).toContain('motion-reduce:animate-none');
  });
});
