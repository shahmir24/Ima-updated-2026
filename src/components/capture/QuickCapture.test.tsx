import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { OrganizeResult } from '@/lib/ai/organize-contract';
import { captureReducer, initialCaptureState, type CaptureState } from '@/lib/capture/drafts';
import type { CaptureOrganizer } from '@/hooks/use-capture-organizer';
import BrainDumpInput from './BrainDumpInput';
import CaptureReview from './CaptureReview';
import QuickCaptureSheet from './QuickCaptureSheet';

// The real organizer hook must never be reached: a fake is passed in.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

const TODAY = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

const RESULT: OrganizeResult = {
  proposals: [
    { title: 'Research Dubai accelerators', importance: 'normal', importanceBasis: 'default', date: null, dateBasis: null, dateText: null, time: null, timeText: null },
    { title: 'Work on the landing page', importance: 'normal', importanceBasis: 'default', date: TODAY, dateBasis: 'inferred', dateText: 'tonight', time: null, timeText: 'tonight' }
  ],
  notTasks: [{ text: 'feeling scattered', kind: 'note' }]
};
const reviewState = (): CaptureState => captureReducer({ ...initialCaptureState, text: 'dump' }, { type: 'organized', result: RESULT });

const organizer = (): CaptureOrganizer & { organize: ReturnType<typeof vi.fn> } => ({
  pending: false,
  error: null,
  organize: vi.fn(async () => RESULT),
  clearError: () => {}
});

const sheet = (overrides: Partial<React.ComponentProps<typeof QuickCaptureSheet>> = {}) => {
  const props = {
    isOpen: true,
    onClose: vi.fn(),
    isGuest: false,
    onAddManually: vi.fn(),
    create: vi.fn(async () => ({})),
    onCreateAccount: vi.fn(),
    onLogIn: vi.fn(),
    organizer: organizer(),
    ...overrides
  };
  // React separates adjacent text nodes with <!-- --> in server output; drop it for text assertions.
  return { html: renderToString(<QuickCaptureSheet {...props} />).replace(/<!-- -->/g, ''), props };
};

type El = React.ReactElement<Record<string, unknown> & { children?: React.ReactNode }>;
/** Walks a presentational component's element tree (no rendering) to reach its handlers. */
function find(node: React.ReactNode, match: (el: El) => boolean): El[] {
  const out: El[] = [];
  const walk = (n: React.ReactNode) => {
    if (Array.isArray(n)) return n.forEach(walk);
    if (!React.isValidElement(n)) return;
    const el = n as El;
    if (match(el)) out.push(el);
    walk(el.props.children);
  };
  walk(node);
  return out;
}
const textOf = (el: El): string => {
  const parts: string[] = [];
  const walk = (n: React.ReactNode) => {
    if (typeof n === 'string') parts.push(n);
    else if (Array.isArray(n)) n.forEach(walk);
    else if (React.isValidElement(n)) walk((n as El).props.children);
  };
  walk(el.props.children);
  return parts.join('');
};

describe('Quick Capture — write step', () => {
  it('shows the heading, supporting copy, the AI note and the two actions', () => {
    const { html } = sheet();
    expect(html).toContain('What&#x27;s on your mind?');
    expect(html).toContain('Dump your tasks, ideas, reminders, whatever. iMA will help sort them out.');
    expect(html).toContain('Organize it');
    expect(html).toContain('Add manually');
    expect(html).toContain('your text is sent to an AI service');
    expect(html).toContain('role="dialog"');
    expect(html).not.toContain('—');
  });

  it('opening it calls nothing: no organize, no save', () => {
    const { props } = sheet();
    expect(props.organizer.organize).not.toHaveBeenCalled();
    expect(props.create).not.toHaveBeenCalled();
  });

  it('closed renders nothing', () => {
    expect(sheet({ isOpen: false }).html).toBe('');
  });

  it('Add manually calls the existing manual form opener', () => {
    const onAddManually = vi.fn();
    const tree = BrainDumpInput({ text: '', onTextChange: () => {}, onOrganize: () => {}, onAddManually, organizing: false, error: null, isGuest: false });
    const button = find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el) === 'Add manually')[0];
    (button.props.onClick as () => void)();
    expect(onAddManually).toHaveBeenCalledTimes(1);
  });

  it('typing goes through onTextChange (the slot voice will reuse later)', () => {
    const onTextChange = vi.fn();
    const tree = BrainDumpInput({ text: '', onTextChange, onOrganize: () => {}, onAddManually: () => {}, organizing: false, error: null, isGuest: false });
    const [area] = find(tree, (el) => el.props.id === 'brain-dump');
    (area.props.onChange as (e: { target: { value: string } }) => void)({ target: { value: 'call Ali' } });
    expect(onTextChange).toHaveBeenCalledWith('call Ali');
    expect(area.props.maxLength).toBe(2000);
  });

  it('Organize it is disabled with nothing written', () => {
    const tree = BrainDumpInput({ text: '   ', onTextChange: () => {}, onOrganize: () => {}, onAddManually: () => {}, organizing: false, error: null, isGuest: false });
    const [organize] = find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el).includes('Organize it'));
    expect(organize.props.disabled).toBe(true);
  });

  it('a guest sees no AI note (organizing needs an account)', () => {
    expect(sheet({ isGuest: true }).html).not.toContain('AI service');
  });
});

describe('Quick Capture — review step', () => {
  it('shows each proposal editable, Later for unscheduled, Check this for inferred, and the thoughts', () => {
    const html = sheet({ initialState: reviewState() }).html;
    expect(html).toContain('value="Research Dubai accelerators"');
    expect(html).toContain('value="Work on the landing page"');
    expect(html).toContain('Date: Later');
    expect(html).toContain('Date: Today');
    expect(html).toContain('Tonight · Check this');
    expect(html).toContain('1 thought not added as a task');
    expect(html).toContain('Add another');
    expect(html).toContain('Add tasks');
    expect(html).not.toMatch(/\bnull\b|provenance|schema|database/i);
  });

  it('rendering the review saves nothing', () => {
    const { props } = sheet({ initialState: reviewState() });
    expect(props.create).not.toHaveBeenCalled();
  });

  it('review controls report the right actions', () => {
    const calls: unknown[] = [];
    const record = (name: string) => (...args: unknown[]) => calls.push([name, ...args]);
    const state = reviewState();
    const tree = CaptureReview({
      drafts: state.drafts,
      notTasks: state.notTasks,
      today: TODAY,
      saving: false,
      saveError: null,
      invalid: {},
      showImportanceQuestion: true,
      onSkipImportance: record('skipImportance'),
      onTitle: record('title'),
      onImportance: record('importance'),
      onDate: record('date'),
      onTime: record('time'),
      onRemove: record('remove'),
      onAddAnother: record('addAnother'),
      onPromote: record('promote'),
      onAddTasks: record('addTasks'),
      onBack: record('back')
    });
    const click = (label: string) => (find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el).includes(label))[0].props.onClick as () => void)();
    click('Add another');
    click('Make it a task');
    click('Add tasks');
    click('Edit text');
    // Each card's callbacks are bound to its own draft.
    const cards = find(tree, (el) => typeof el.props.onRemove === 'function');
    (cards[0].props.onRemove as () => void)();
    (cards[0].props.onDate as (d: string | null) => void)(null);
    (cards[1].props.onTitle as (t: string) => void)('Edited');
    expect(calls).toEqual([
      ['addAnother'],
      ['promote', 0],
      ['addTasks'],
      ['back'],
      ['remove', state.drafts[0].key],
      ['date', state.drafts[0].key, null],
      ['title', state.drafts[1].key, 'Edited']
    ]);
  });
});

describe('Tasks wiring', () => {
  it('New Task opens Quick Capture; Add manually opens the existing form; saving uses the task source', () => {
    const source = readFileSync(new URL('../../pages/Tasks.tsx', import.meta.url), 'utf8');
    expect(source).toMatch(/onClick=\{\(\) => setShowCapture\(true\)\}[\s\S]{0,400}New Task/);
    expect(source).toMatch(/const openManualFromCapture = \(\) => \{\s*setShowCapture\(false\);\s*openCreateModal\(\);/);
    expect(source).toMatch(/<QuickCaptureSheet[\s\S]*?create=\{createTask\.run\}[\s\S]*?isGuest=\{isGuest\}|<QuickCaptureSheet[\s\S]*?isGuest=\{isGuest\}[\s\S]*?create=\{createTask\.run\}/);
    expect(source).toContain('<MeetingModal');
  });
});

describe('Quick Capture: optional importance question', () => {
  const stated = (title: string, importance: 'high' | 'low') => ({
    title, importance, importanceBasis: 'stated' as const, date: null, dateBasis: null, dateText: null, time: null, timeText: null
  });
  const stateFor = (result: OrganizeResult) => captureReducer({ ...initialCaptureState, text: 'dump' }, { type: 'organized', result });
  const QUESTION = 'Anything here particularly important to you?';

  it('shows once, above the list, when any proposal has unclear importance; Add tasks stays enabled', () => {
    const html = sheet({ initialState: reviewState() }).html;
    expect(html.split(QUESTION)).toHaveLength(2);
    expect(html.indexOf(QUESTION)).toBeLessThan(html.indexOf('value="Research Dubai accelerators"'));
    expect(html).toContain('>Skip<');
    const addTasks = html.slice(html.lastIndexOf('<button', html.indexOf('>Add tasks<')), html.indexOf('>Add tasks<'));
    expect(addTasks).not.toContain('disabled=""');
  });

  it('is not shown when every proposal has stated importance', () => {
    const html = sheet({ initialState: stateFor({ proposals: [stated('Pay rent', 'high'), stated('Tidy desk', 'low')], notTasks: [] }) }).html;
    expect(html).not.toContain(QUESTION);
    expect(html).not.toContain('data-importance-unclear');
  });

  it('reuses the existing importance buttons: one set per card, tied to the question only on unclear cards', () => {
    const state = stateFor({ proposals: [RESULT.proposals[0], stated('Pay rent', 'high')], notTasks: [] });
    const html = sheet({ initialState: state }).html;
    expect(html.match(/aria-pressed=/g)).toHaveLength(6);
    expect(html.match(/data-importance-unclear="true"/g)).toHaveLength(1);
    expect(html).toContain('aria-describedby="capture-importance-question"');
  });

  it('Skip reports skipImportance', () => {
    const onSkipImportance = vi.fn();
    const state = reviewState();
    const tree = CaptureReview({
      drafts: state.drafts, notTasks: [], today: TODAY, saving: false, saveError: null, invalid: {},
      showImportanceQuestion: true, onSkipImportance,
      onTitle: vi.fn(), onImportance: vi.fn(), onDate: vi.fn(), onTime: vi.fn(), onRemove: vi.fn(),
      onAddAnother: vi.fn(), onPromote: vi.fn(), onAddTasks: vi.fn(), onBack: vi.fn()
    });
    const [skip] = find(tree, (el) => typeof el.props.onClick === 'function' && textOf(el) === 'Skip');
    (skip.props.onClick as () => void)();
    expect(onSkipImportance).toHaveBeenCalledTimes(1);
  });

  it('after Skip the question is gone and the review is otherwise unchanged', () => {
    const skipped = captureReducer(reviewState(), { type: 'skipImportance' });
    const html = sheet({ initialState: skipped }).html;
    expect(html).not.toContain(QUESTION);
    expect(html).toContain('value="Research Dubai accelerators"');
    expect(html).toContain('>Add tasks<');
  });
});
