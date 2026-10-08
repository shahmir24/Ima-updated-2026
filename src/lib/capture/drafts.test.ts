import { describe, expect, it, vi } from 'vitest';

// The sheet module imports the organizer hook; the real client is never reached here.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));
import type { NewTaskInput } from '@/hooks/use-tasks';
import type { OrganizeResult } from '@/lib/ai/organize-contract';
import { runOrganize, runSave } from './actions';
import { commitDrafts } from './commit';
import {
  CAPTURE_COPY,
  captureReducer,
  describeDraftDate,
  describeTime,
  initialCaptureState,
  showImportanceQuestion,
  toNewTaskInput,
  validateDraft,
  type CaptureAction,
  type CaptureState
} from './drafts';

const TODAY = '2026-10-06';
const TOMORROW = '2026-10-07';

const RESULT: OrganizeResult = {
  proposals: [
    { title: 'Research Dubai accelerators', importance: 'normal', importanceBasis: 'default', date: null, dateBasis: null, dateText: null, time: null, timeText: null },
    { title: 'Buy new running shoes', importance: 'normal', importanceBasis: 'default', date: null, dateBasis: null, dateText: null, time: null, timeText: null },
    { title: 'Finish the application', importance: 'normal', importanceBasis: 'default', date: TOMORROW, dateBasis: 'stated', dateText: 'tomorrow', time: null, timeText: null },
    { title: 'Call Ali', importance: 'normal', importanceBasis: 'default', date: TOMORROW, dateBasis: 'stated', dateText: 'tomorrow', time: '15:00', timeText: '3pm' },
    { title: 'Work on the landing page', importance: 'normal', importanceBasis: 'default', date: TODAY, dateBasis: 'inferred', dateText: 'tonight', time: null, timeText: 'tonight' }
  ],
  notTasks: [{ text: 'feeling scattered', kind: 'note' }]
};

const reduce = (state: CaptureState, ...actions: CaptureAction[]) => actions.reduce(captureReducer, state);
const organized = () => reduce(initialCaptureState, { type: 'text', text: 'brain dump' }, { type: 'organized', result: RESULT });
const byTitle = (state: CaptureState, title: string) => state.drafts.find((d) => d.title === title)!;

describe('drafts from proposals', () => {
  it('keeps unscheduled tasks unscheduled, dated tasks dated, and flags inferred ones', () => {
    const state = organized();
    expect(state.stage).toBe('review');
    expect(byTitle(state, 'Research Dubai accelerators')).toMatchObject({ date: null, time: null, checkDate: false });
    expect(byTitle(state, 'Finish the application')).toMatchObject({ date: TOMORROW, checkDate: false });
    expect(byTitle(state, 'Call Ali')).toMatchObject({ date: TOMORROW, time: '15:00', checkDate: false });
    expect(byTitle(state, 'Work on the landing page')).toMatchObject({ date: TODAY, time: null, checkDate: true, dateText: 'tonight' });
    expect(state.notTasks).toEqual(RESULT.notTasks);
  });

  it('labels: Later, Today, Tomorrow, a short date; times as 3:00 PM', () => {
    expect(describeDraftDate(null, TODAY)).toBe('Later');
    expect(describeDraftDate(TODAY, TODAY)).toBe('Today');
    expect(describeDraftDate(TOMORROW, TODAY)).toBe('Tomorrow');
    expect(describeDraftDate('2026-10-09', TODAY)).toBe('Fri 9 Oct');
    expect(describeTime('15:00')).toBe('3:00 PM');
    expect(describeTime('00:30')).toBe('12:30 AM');
    expect(describeTime(null)).toBe('No time');
  });
});

describe('review edits', () => {
  it('edit title, importance, date, time', () => {
    let state = organized();
    const key = byTitle(state, 'Research Dubai accelerators').key;
    state = reduce(
      state,
      { type: 'title', key, title: 'Research UAE accelerators' },
      { type: 'importance', key, importance: 'high' },
      { type: 'date', key, date: TOMORROW },
      { type: 'time', key, time: '09:30' }
    );
    expect(state.drafts.find((d) => d.key === key)).toMatchObject({ title: 'Research UAE accelerators', importance: 'high', date: TOMORROW, time: '09:30' });
  });

  it('clearing the date makes it Later and clears the time', () => {
    let state = organized();
    const key = byTitle(state, 'Call Ali').key;
    state = reduce(state, { type: 'date', key, date: null });
    expect(state.drafts.find((d) => d.key === key)).toMatchObject({ date: null, time: null });
  });

  it('a time cannot be set without a date', () => {
    let state = organized();
    const key = byTitle(state, 'Buy new running shoes').key;
    state = reduce(state, { type: 'time', key, time: '10:00' });
    expect(state.drafts.find((d) => d.key === key)?.time).toBeNull();
  });

  it('choosing a date or time answers "Check this"', () => {
    let state = organized();
    const key = byTitle(state, 'Work on the landing page').key;
    expect(state.drafts.find((d) => d.key === key)?.checkDate).toBe(true);
    state = reduce(state, { type: 'date', key, date: TODAY });
    expect(state.drafts.find((d) => d.key === key)?.checkDate).toBe(false);
  });

  it('remove a proposal, add another, make a thought into a task', () => {
    let state = organized();
    state = reduce(state, { type: 'remove', key: byTitle(state, 'Buy new running shoes').key }, { type: 'addAnother' }, { type: 'promote', index: 0 });
    expect(state.drafts.map((d) => d.title)).toEqual([
      'Research Dubai accelerators',
      'Finish the application',
      'Call Ali',
      'Work on the landing page',
      '',
      'feeling scattered'
    ]);
    expect(state.drafts.at(-1)).toMatchObject({ date: null, importance: 'normal' });
    expect(state.notTasks).toEqual([]);
    expect(new Set(state.drafts.map((d) => d.key)).size).toBe(state.drafts.length);
  });

  it('back to the text keeps it exactly as written', () => {
    const state = reduce(organized(), { type: 'back' });
    expect(state).toMatchObject({ stage: 'write', text: 'brain dump', drafts: [] });
  });
});

describe('validation and the saved input', () => {
  it('an unscheduled draft is valid and saves with scheduled_date null', () => {
    const draft = byTitle(organized(), 'Research Dubai accelerators');
    expect(validateDraft(draft)).toEqual({ ok: true });
    expect(toNewTaskInput(draft)).toEqual({ title: 'Research Dubai accelerators', scheduled_date: null, start_time: null, importance: 'normal' });
  });

  it('a dated, timed draft saves its date and time', () => {
    expect(toNewTaskInput(byTitle(organized(), 'Call Ali'))).toEqual({ title: 'Call Ali', scheduled_date: TOMORROW, start_time: '15:00', importance: 'normal' });
  });

  it('a blank title is not valid', () => {
    const state = reduce(organized(), { type: 'addAnother' });
    expect(validateDraft(state.drafts.at(-1)!)).toEqual({ ok: false, message: CAPTURE_COPY.needsTitle });
  });
});

describe('saving: nothing before Add tasks, partial success, no duplicates on retry', () => {
  it('reaching review saves nothing; only runSave calls create', async () => {
    const create = vi.fn(async () => ({}));
    let state = initialCaptureState;
    const dispatch = (action: CaptureAction) => (state = captureReducer(state, action));
    await runOrganize({ isGuest: false, text: 'x', today: TODAY, organize: async () => RESULT, dispatch, showGuestBoundary: () => {} });
    state = reduce(state, { type: 'remove', key: state.drafts[0].key });
    expect(create).not.toHaveBeenCalled();

    const done = await runSave({ state, create, dispatch });
    expect(done).toBe(true);
    expect(create).toHaveBeenCalledTimes(4);
    expect(state.drafts).toEqual([]);
  });

  it('an invalid draft stops the save before anything is sent', async () => {
    const create = vi.fn(async () => ({}));
    let state = reduce(organized(), { type: 'addAnother' });
    const dispatch = (action: CaptureAction) => (state = captureReducer(state, action));
    expect(await runSave({ state, create, dispatch })).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(Object.values(state.invalid)).toEqual([CAPTURE_COPY.needsTitle]);
  });

  it('task 3 fails: tasks 1 and 2 are saved once, the failed and unsent stay, retry sends only those', async () => {
    const saved: string[] = [];
    let failTitle: string | null = 'Finish the application';
    const create = vi.fn(async (input: NewTaskInput) => {
      if (input.title === failTitle) throw new Error('network down');
      saved.push(input.title);
    });
    let state = organized();
    const dispatch = (action: CaptureAction) => (state = captureReducer(state, action));

    expect(await runSave({ state, create, dispatch })).toBe(false);
    expect(saved).toEqual(['Research Dubai accelerators', 'Buy new running shoes', 'Call Ali', 'Work on the landing page']);
    expect(state.drafts.map((d) => d.title)).toEqual(['Finish the application']);
    expect(state.saveError).toBe(CAPTURE_COPY.saveFailed(1));

    failTitle = null;
    expect(await runSave({ state, create, dispatch })).toBe(true);
    expect(saved).toEqual(['Research Dubai accelerators', 'Buy new running shoes', 'Call Ali', 'Work on the landing page', 'Finish the application']);
    expect(saved.filter((t) => t === 'Research Dubai accelerators')).toHaveLength(1);
  });

  it('commitDrafts reports saved and failed keys in order', async () => {
    const drafts = organized().drafts.slice(0, 3);
    const result = await commitDrafts(drafts, async (input) => {
      if (input.title === 'Buy new running shoes') throw new Error('x');
    });
    expect(result.savedKeys).toEqual([drafts[0].key, drafts[2].key]);
    expect(result.failedKeys).toEqual([drafts[1].key]);
  });
});

describe('guests', () => {
  it('Organize it for a guest NEVER calls the organizer: the account boundary is shown instead', async () => {
    const organize = vi.fn(async () => RESULT);
    const showGuestBoundary = vi.fn();
    const dispatch = vi.fn();
    await runOrganize({ isGuest: true, text: 'my private brain dump', today: TODAY, organize, dispatch, showGuestBoundary });
    expect(organize).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(showGuestBoundary).toHaveBeenCalledTimes(1);
  });

  it('a signed-in Organize sends only text, today and the zone', async () => {
    const organize = vi.fn(async () => RESULT);
    await runOrganize({ isGuest: false, text: 'call Ali', today: TODAY, timeZone: 'Asia/Karachi', organize, dispatch: () => {}, showGuestBoundary: () => {} });
    expect(organize).toHaveBeenCalledWith({ text: 'call Ali', today: TODAY, timeZone: 'Asia/Karachi' });
  });
});

describe('copy', () => {
  it('uses no em dashes and no technical words', () => {
    const text = JSON.stringify(CAPTURE_COPY) + CAPTURE_COPY.saveFailed(1) + CAPTURE_COPY.saveFailed(2) + CAPTURE_COPY.notTasksHeading(1) + CAPTURE_COPY.notTasksHeading(3);
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/\b(null|provenance|database|schema)\b/i);
    expect(CAPTURE_COPY.heading).toBe("What's on your mind?");
    expect(CAPTURE_COPY.supporting).toBe('Dump your tasks, ideas, reminders, whatever. iMA will help sort them out.');
    expect(CAPTURE_COPY.organize).toBe('Organize it');
    expect(CAPTURE_COPY.addManually).toBe('Add manually');
    expect(CAPTURE_COPY.addTasks).toBe('Add tasks');
    expect(CAPTURE_COPY.addAnother).toBe('Add another');
    expect(CAPTURE_COPY.checkThis).toBe('Check this');
    expect(CAPTURE_COPY.later).toBe('Later');
  });
});

describe('optional importance clarification', () => {
  const stated = { importance: 'high' as const, importanceBasis: 'stated' as const };
  const withStated = (): CaptureState =>
    reduce(initialCaptureState, {
      type: 'organized',
      result: { ...RESULT, proposals: [{ ...RESULT.proposals[0], ...stated }, { ...RESULT.proposals[1], importance: 'low', importanceBasis: 'stated' }] }
    });

  it('marks proposals with importanceBasis "default" as unclear, stated ones as clear', () => {
    const state = reduce(initialCaptureState, {
      type: 'organized',
      result: { ...RESULT, proposals: [RESULT.proposals[0], { ...RESULT.proposals[1], ...stated }] }
    });
    expect(state.drafts.map((d) => d.importanceUnclear)).toEqual([true, false]);
    expect(showImportanceQuestion(state)).toBe(true);
  });

  it('is not asked when every proposal has stated importance', () => {
    expect(showImportanceQuestion(withStated())).toBe(false);
  });

  it('any importance tap answers it for that task (Normal included); the question goes when none are unclear', () => {
    let state = organized();
    expect(showImportanceQuestion(state)).toBe(true);
    const [first, ...rest] = state.drafts;
    state = reduce(state, { type: 'importance', key: first.key, importance: 'normal' });
    expect(state.drafts[0]).toMatchObject({ importance: 'normal', importanceUnclear: false });
    expect(showImportanceQuestion(state)).toBe(true);
    state = reduce(state, ...rest.map((d, i): CaptureAction => ({ type: 'importance', key: d.key, importance: i === 0 ? 'high' : 'low' })));
    expect(showImportanceQuestion(state)).toBe(false);
  });

  it('Skip hides it for this review; a new Organize asks again', () => {
    let state = reduce(organized(), { type: 'skipImportance' });
    expect(showImportanceQuestion(state)).toBe(false);
    expect(state.drafts.some((d) => d.importanceUnclear)).toBe(true);
    state = reduce(state, { type: 'back' }, { type: 'organized', result: RESULT });
    expect(showImportanceQuestion(state)).toBe(true);
  });

  it('tasks the person adds (Add another, Make it a task) are never "unclear"', () => {
    const state = reduce(withStated(), { type: 'addAnother' }, { type: 'promote', index: 0 });
    expect(state.drafts.slice(-2).map((d) => d.importanceUnclear)).toEqual([false, false]);
    expect(showImportanceQuestion(state)).toBe(false);
  });

  it('never blocks saving: unanswered tasks save as they are; answered ones save the chosen importance', async () => {
    const saved: NewTaskInput[] = [];
    let state = organized();
    state = reduce(state, { type: 'importance', key: state.drafts[0].key, importance: 'high' });
    expect(showImportanceQuestion(state)).toBe(true);
    const dispatch = (action: CaptureAction) => (state = captureReducer(state, action));
    expect(await runSave({ state, create: async (input) => void saved.push(input), dispatch })).toBe(true);
    expect(saved.map((t) => t.importance)).toEqual(['high', 'normal', 'normal', 'normal', 'normal']);
  });
});
