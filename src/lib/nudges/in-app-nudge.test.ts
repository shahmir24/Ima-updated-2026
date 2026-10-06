import { beforeEach, describe, expect, it } from 'vitest';
import { rankTasks } from '@/lib/context-engine';
import {
  NUDGE_COPY,
  NUDGE_DISMISSALS_STORAGE_KEY,
  _resetNudgeDismissalMemory,
  cleanNudgeTitle,
  nudgeActionPath,
  nudgeKey,
  readNudgeDismissals,
  rememberNudgeDismissal,
  selectInAppNudge,
  type InAppNudgeInput,
  type NudgeTask
} from './in-app-nudge';

const TODAY = '2026-10-06';

const task = (id: string, title: string, scheduled_date: string, extra: Partial<NudgeTask> = {}): NudgeTask => ({
  id,
  title,
  scheduled_date,
  created_at: '2026-10-01T09:00:00Z',
  completed: false,
  importance: 'normal',
  ...extra
});

const ON = { nudges_enabled: true, nudge_show_task_titles: true };

const select = (overrides: Partial<InAppNudgeInput<NudgeTask>> = {}) =>
  selectInAppNudge<NudgeTask>({
    signedIn: true,
    settings: ON,
    tasksReady: true,
    tasks: [task('t1', 'Email the landlord', TODAY)],
    today: TODAY,
    dismissed: new Set(),
    ...overrides
  });

// Shaming or pressuring language the copy must never contain.
const BANNED = /you'?re behind|overdue!|failed|catch up|you need to|hurry|late\b|should have/i;

describe('selectInAppNudge — eligibility', () => {
  it('signed in + nudges enabled + an eligible task → a nudge', () => {
    expect(select()).not.toBeNull();
  });

  it.each([
    ['nudges disabled', { settings: { nudges_enabled: false, nudge_show_task_titles: true } }],
    ['nudges_enabled missing', { settings: { nudge_show_task_titles: true } }],
    ['settings not loaded / failed', { settings: undefined }],
    ['settings row missing', { settings: null }],
    ['a guest / signed out', { signedIn: false }],
    ['tasks still loading or failed', { tasksReady: false }],
    ['no tasks', { tasks: [] }],
    ['only completed tasks', { tasks: [task('t1', 'Done', TODAY, { completed: true })] }],
    ['only future tasks', { tasks: [task('t1', 'Next week', '2026-10-13')] }]
  ])('%s → no nudge', (_label, overrides) => {
    expect(select(overrides as Partial<InAppNudgeInput<NudgeTask>>)).toBeNull();
  });

  it('a truthy-but-not-true nudges_enabled is still off', () => {
    expect(select({ settings: { nudges_enabled: 'true' as unknown as boolean, nudge_show_task_titles: true } })).toBeNull();
  });

  it('the task is exactly the Context Engine’s first choice — no other ranking', () => {
    const tasks = [
      task('long', 'Old thing', '2026-08-01'),
      task('recent', 'Yesterday', '2026-10-05', { importance: 'high' }),
      task('low', 'Today low', TODAY, { importance: 'low' }),
      task('high', 'Today high', TODAY, { importance: 'high' }),
      // Title words must not matter: "URGENT" is just text.
      task('shouty', 'URGENT!!! deadline NOW', TODAY, { importance: 'low', created_at: '2026-01-01T00:00:00Z' })
    ];
    const nudge = select({ tasks })!;
    expect(nudge.taskId).toBe(rankTasks(tasks, { today: TODAY })[0].task.id);
    expect(nudge.taskId).toBe('high');
  });

  it('uses the given local date as "today"', () => {
    const tasks = [task('t1', 'Tomorrow’s task', '2026-10-07')];
    expect(select({ tasks })).toBeNull();
    expect(select({ tasks, today: '2026-10-07' })?.taskId).toBe('t1');
  });
});

describe('selectInAppNudge — copy', () => {
  it('a task due today → the recommended copy, with Start and I’m stuck', () => {
    expect(select()).toMatchObject({
      variant: 'recommended',
      heading: 'One thing at a time',
      body: 'Maybe start with “Email the landlord”. You don\'t have to finish it. Just start.',
      primary: { label: 'Start', action: 'start' },
      secondary: { label: "I'm stuck", action: 'stuck' }
    });
  });

  it.each([
    ['1 day', '2026-10-05'],
    ['8 days (long overdue)', '2026-09-28']
  ])('an overdue task (%s) → the overdue copy', (_label, date) => {
    expect(select({ tasks: [task('t1', 'Book the dentist', date)] })).toMatchObject({
      variant: 'overdue',
      heading: 'Still worth doing',
      body: '“Book the dentist” is still waiting. A small step counts.',
      primary: { label: 'Start', action: 'start' },
      secondary: { label: "I'm stuck", action: 'stuck' }
    });
  });

  it('task-title privacy (titles hidden) → generic copy, no title anywhere, See what’s next only', () => {
    for (const date of [TODAY, '2026-10-01']) {
      const nudge = select({ settings: { nudges_enabled: true, nudge_show_task_titles: false }, tasks: [task('t1', 'Therapy appointment', date)] })!;
      expect(nudge).toMatchObject({
        variant: 'generic',
        heading: 'A gentle nudge',
        body: 'One thing on your list could use a little attention. One small step is enough.',
        primary: { label: "See what's next", action: 'see-next' },
        secondary: null
      });
      expect(JSON.stringify(nudge)).not.toContain('Therapy');
    }
  });

  it('a missing or non-true title setting is treated as hidden', () => {
    expect(select({ settings: { nudges_enabled: true } })?.variant).toBe('generic');
    expect(select({ settings: { nudges_enabled: true, nudge_show_task_titles: null } })?.variant).toBe('generic');
  });

  it('a blank title falls back to the generic copy', () => {
    expect(select({ tasks: [task('t1', '   \n ', TODAY)] })?.variant).toBe('generic');
  });

  it('titles are flattened and bounded, never parsed', () => {
    expect(cleanNudgeTitle('  Call\n\tmum  ')).toBe('Call mum');
    const long = cleanNudgeTitle('x'.repeat(200))!;
    expect(Array.from(long)).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
    expect(cleanNudgeTitle(undefined)).toBeNull();
  });

  it('no copy uses shaming or pressuring language', () => {
    const all = [
      NUDGE_COPY.recommended.heading,
      NUDGE_COPY.recommended.body('X'),
      NUDGE_COPY.overdue.heading,
      NUDGE_COPY.overdue.body('X'),
      NUDGE_COPY.generic.heading,
      NUDGE_COPY.generic.body,
      NUDGE_COPY.generic.primary
    ];
    for (const text of all) expect(text).not.toMatch(BANNED);
    expect(NUDGE_COPY.overdue.body('X').toLowerCase()).not.toContain('overdue');
  });
});

describe('nudgeActionPath — the existing task → Focus / Body Double flows', () => {
  it('Start → Focus with the selected task', () => {
    expect(nudgeActionPath({ taskId: 'abc-123' }, 'start')).toBe('/focus?task=abc-123');
  });
  it('I’m stuck → Body Double with the selected task', () => {
    expect(nudgeActionPath({ taskId: 'abc-123' }, 'stuck')).toBe('/body-double?task=abc-123');
  });
  it('See what’s next → the task list', () => {
    expect(nudgeActionPath({ taskId: 'abc-123' }, 'see-next')).toBe('/tasks');
  });
  it('ids are URL-encoded', () => {
    expect(nudgeActionPath({ taskId: 'a b&c' }, 'start')).toBe('/focus?task=a%20b%26c');
  });
});

describe('dismissal (this session only)', () => {
  const storage = () => {
    const data = new Map<string, string>();
    return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
  };
  beforeEach(() => _resetNudgeDismissalMemory());

  it('a dismissed nudge does not come back for the same task and day', () => {
    const first = select()!;
    const store = storage();
    const dismissed = rememberNudgeDismissal(first.key, store);
    expect(select({ dismissed })).toBeNull();
    // A later mount in the same session reads it back.
    expect(select({ dismissed: readNudgeDismissals(store) })).toBeNull();
    expect(JSON.parse(store.data.get(NUDGE_DISMISSALS_STORAGE_KEY)!)).toEqual([nudgeKey(TODAY, 't1')]);
  });

  it('a different Context Engine task can still be nudged', () => {
    const dismissed = rememberNudgeDismissal(nudgeKey(TODAY, 't1'), storage());
    const nudge = select({ dismissed, tasks: [task('t1', 'One', TODAY, { completed: true }), task('t2', 'Two', TODAY)] });
    expect(nudge?.taskId).toBe('t2');
  });

  it('the same task on a new local day can be nudged again', () => {
    const dismissed = rememberNudgeDismissal(nudgeKey(TODAY, 't1'), storage());
    expect(select({ dismissed, today: '2026-10-07' })?.taskId).toBe('t1');
  });

  it('works without sessionStorage (blocked): remembered in memory for the page load', () => {
    rememberNudgeDismissal('k1', null);
    expect(readNudgeDismissals(null).has('k1')).toBe(true);
  });

  it('a throwing or corrupt storage never breaks it', () => {
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
    expect(() => rememberNudgeDismissal('k2', throwing)).not.toThrow();
    const corrupt = { getItem: () => '{not json', setItem: () => {} };
    expect(readNudgeDismissals(corrupt).has('k2')).toBe(true);
  });

  it('remembers at most 50 keys', () => {
    const store = storage();
    for (let i = 0; i < 60; i++) rememberNudgeDismissal(`k${i}`, store);
    expect(JSON.parse(store.data.get(NUDGE_DISMISSALS_STORAGE_KEY)!)).toHaveLength(50);
  });
});
