import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import TimeField from '@/components/time/TimeField';
import ProposalCard from '@/components/capture/ProposalCard';
import MeetingModal from '@/components/tasks/MeetingModal';
import type { TaskRow } from '@/hooks/use-tasks';
import { toClockTime, type OrganizeProposal } from '@/lib/ai/organize-contract';
import { blankDraft, captureReducer, draftFromProposal, initialCaptureState, toNewTaskInput, validateDraft, type CaptureState } from '@/lib/capture/drafts';
import { CUSTOM_BREAK_MINUTES, CUSTOM_FOCUS_MINUTES, parseWholeMinutes } from '@/lib/focus/custom-duration';
import {
  changeFocusTimerSetting,
  createFocusTimerState,
  isRunning,
  parseFocusTimerState,
  playFocusTimer,
  reconcileFocusTimer,
  timeLeftMs
} from '@/lib/focus/focus-timer-state';
import { opsForEvents } from '@/lib/focus/focus-session-outbox';
import { buildTaskFormInput } from '@/lib/tasks/task-form-input';

const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 14, 9, 0, 0);
const CONFIG = { blockMinutes: 25, breakMinutes: 5, flows: 4 };
const text = (html: string) => html.replace(/<!-- -->/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

// ---------------------------------------------------------------------------
// Focus Timer: custom durations
// ---------------------------------------------------------------------------

describe('custom minute entry', () => {
  it.each([
    ['1', 1],
    ['17', 17],
    ['240', 240],
    [' 60 ', 60],
    ['007', 7]
  ])('focus accepts %j → %i', (raw, value) => {
    expect(parseWholeMinutes(raw, CUSTOM_FOCUS_MINUTES)).toEqual({ ok: true, value });
  });

  it.each(['', '   ', '0', '241', '25.5', '1e2', '-5', 'abc', '25 min', '+30', '99999'])('focus rejects %j', (raw) => {
    expect(parseWholeMinutes(raw, CUSTOM_FOCUS_MINUTES)).toEqual({ ok: false, message: 'Enter a whole number of minutes from 1 to 240.' });
  });

  it('break accepts 1–60 only', () => {
    expect(parseWholeMinutes('1', CUSTOM_BREAK_MINUTES)).toEqual({ ok: true, value: 1 });
    expect(parseWholeMinutes('60', CUSTOM_BREAK_MINUTES)).toEqual({ ok: true, value: 60 });
    for (const raw of ['0', '61', '7.5', '']) {
      expect(parseWholeMinutes(raw, CUSTOM_BREAK_MINUTES)).toEqual({ ok: false, message: 'Enter a whole number of minutes from 1 to 60.' });
    }
  });
});

describe('Focus Timer with custom durations', () => {
  const fresh = () => createFocusTimerState(CONFIG, T0);

  it('a custom focus length re-times a stopped block, exactly', () => {
    const { state } = changeFocusTimerSetting(fresh(), T0, 'timeBox', 17);
    expect(state.config.blockMinutes).toBe(17);
    expect(state.remainingMs).toBe(17 * MIN);
  });

  it('a custom break length is used for the next break', () => {
    let s = changeFocusTimerSetting(fresh(), T0, 'interval', 7).state;
    s = playFocusTimer(s, T0, { newSessionId: () => 's' }).state;
    s = reconcileFocusTimer(s, T0 + 25 * MIN).state;
    expect(s.phase).toBe('break');
    expect(s.remainingMs).toBe(7 * MIN);
  });

  it('running-session rule is unchanged: a running block keeps its length', () => {
    const running = playFocusTimer(fresh(), T0, { newSessionId: () => 's' }).state;
    const { state } = changeFocusTimerSetting(running, T0 + MIN, 'timeBox', 200);
    expect(isRunning(state)).toBe(true);
    expect(timeLeftMs(state, T0 + MIN)).toBe(24 * MIN);
    expect(state.config.blockMinutes).toBe(200); // used from the next focus block
  });

  it.each<[Parameters<typeof changeFocusTimerSetting>[2], number]>([
    ['timeBox', 0],
    ['timeBox', 241],
    ['timeBox', 25.5],
    ['timeBox', Number.NaN],
    ['timeBox', -5],
    ['interval', 61],
    ['interval', 2.5],
    ['flows', 0],
    ['flows', 13]
  ])('ignores an invalid %s of %s entirely', (setting, value) => {
    const before = fresh();
    expect(changeFocusTimerSetting(before, T0 + MIN, setting, value)).toEqual({ state: before, events: [] });
  });

  it('presets still work', () => {
    expect(changeFocusTimerSetting(fresh(), T0, 'timeBox', 90).state.remainingMs).toBe(90 * MIN);
    expect(changeFocusTimerSetting(fresh(), T0, 'interval', 10).state.config.breakMinutes).toBe(10);
  });

  it('a custom length survives persistence (JSON round trip)', () => {
    const s = changeFocusTimerSetting(fresh(), T0, 'timeBox', 133).state;
    expect(parseFocusTimerState(JSON.parse(JSON.stringify(s)))?.config.blockMinutes).toBe(133);
  });

  it('a stored state outside the ranges is rejected rather than trusted', () => {
    for (const config of [
      { ...CONFIG, blockMinutes: 241 },
      { ...CONFIG, blockMinutes: 25.5 },
      { ...CONFIG, breakMinutes: 61 },
      { ...CONFIG, flows: 13 }
    ]) {
      expect(parseFocusTimerState({ ...fresh(), config })).toBeNull();
    }
  });

  it('the session records the custom planned lengths', () => {
    let s = changeFocusTimerSetting(fresh(), T0, 'timeBox', 17).state;
    s = changeFocusTimerSetting(s, T0, 'interval', 7).state;
    const { events } = playFocusTimer(s, T0, { newSessionId: () => 's' });
    expect(opsForEvents(events, () => 'op')[0]).toMatchObject({ kind: 'start', plannedBlockMinutes: 17, plannedBreakMinutes: 7 });
  });

  it('the settings panel offers Custom… for focus and break, keeps the presets, and none for flows', () => {
    const panel = readFileSync(new URL('../components/focus/FloatingSettings.tsx', import.meta.url), 'utf8');
    expect(panel).toContain('const BLOCK_OPTIONS = [25, 45, 90];');
    expect(panel).toContain('const BUFFER_OPTIONS = [5, 10];');
    expect(panel).toMatch(/timeBox: \{ range: CUSTOM_FOCUS_MINUTES/);
    expect(panel).toMatch(/interval: \{ range: CUSTOM_BREAK_MINUTES/);
    expect(panel).not.toMatch(/flows: \{ range:/);
  });
});

// ---------------------------------------------------------------------------
// Exact-minute times
// ---------------------------------------------------------------------------

describe('TimeField', () => {
  it('is a native time input to the minute', () => {
    const html = renderToString(<TimeField value="10:09" onChange={() => {}} label="Start time" />);
    expect(html).toContain('type="time"');
    expect(html).toContain('step="60"');
    expect(html).toContain('value="10:09"');
    expect(html).toContain('aria-label="Start time"');
  });

  it('shows a stored HH:MM:SS as HH:MM, and nothing for no time', () => {
    expect(renderToString(<TimeField value="15:43:00" onChange={() => {}} label="t" />)).toContain('value="15:43"');
    expect(renderToString(<TimeField value={null} onChange={() => {}} label="t" />)).toContain('value=""');
  });

  it.each([
    ['10:09', '10:09'],
    ['11:17', '11:17'],
    ['15:43', '15:43'],
    ['00:00', '00:00'],
    ['23:59', '23:59'],
    ['15:43:27', '15:43'],
    ['', null],
    ['24:00', null],
    ['9:7', null],
    ['12:60', null],
    ['noon', null]
  ])('input %j → %j (empty or invalid is no time, never a guess)', (raw, expected) => {
    expect(toClockTime(raw)).toBe(expected);
  });
});

describe('task form', () => {
  const date = new Date(2026, 9, 14);

  it.each(['10:09', '11:17', '15:43'])('creates with the exact minute %s', (time) => {
    expect(buildTaskFormInput({ title: 'Call', date, time, importance: 'normal' })).toEqual({
      title: 'Call',
      scheduled_date: '2026-10-14',
      start_time: time,
      importance: 'normal'
    });
  });

  it('no time stays no time', () => {
    expect(buildTaskFormInput({ title: 'Call', date, time: null, importance: 'high' }).start_time).toBeNull();
  });

  it('an invalid time is dropped, not guessed', () => {
    expect(buildTaskFormInput({ title: 'Call', date, time: '25:99', importance: 'normal' }).start_time).toBeNull();
  });

  it('Later (no date) never carries a time', () => {
    expect(buildTaskFormInput({ title: 'Call', date: null, time: '10:09', importance: 'normal' })).toEqual({
      title: 'Call',
      scheduled_date: null,
      start_time: null,
      importance: 'normal'
    });
  });

  const task = (over: Partial<TaskRow>): TaskRow =>
    ({
      id: 't1', user_id: 'u', title: 'Dentist', description: null, tag: 'focus', scheduled_date: '2026-10-14', start_time: '11:17:00',
      end_time: null, completed: false, completed_at: null, importance: 'normal', created_at: '', updated_at: '', ...over
    }) as TaskRow;
  const renderForm = (row: TaskRow | null) =>
    text(renderToString(<MeetingModal isOpen onClose={() => {}} task={row} onSubmit={async () => {}} />));

  it('editing shows the stored exact minute', () => {
    expect(renderForm(task({ start_time: '11:17:00' }))).toContain('11:17 AM');
    expect(renderForm(task({ start_time: '15:43:00' }))).toContain('3:43 PM');
  });

  it('a task with no time still reads "No time set"', () => {
    expect(renderForm(task({ start_time: null }))).toContain('No time set');
  });

  it('a Later task asks for a day before a time', () => {
    expect(renderForm(task({ scheduled_date: null, start_time: null }))).toContain('Choose a day to add a time');
  });

  it('"Keep it for later" clears the time too, and the 30-minute list is gone', () => {
    const form = readFileSync(new URL('../components/tasks/MeetingModal.tsx', import.meta.url), 'utf8');
    expect(form).toMatch(/setSelectedDate\(null\);\s*setSelectedTime\(null\);/);
    expect(form).not.toContain('minute += 30');
    expect(form).toContain('No time');
  });
});

// ---------------------------------------------------------------------------
// Brain Dump review
// ---------------------------------------------------------------------------

const proposal = (over: Partial<OrganizeProposal>): OrganizeProposal => ({
  title: 'Call the bank',
  importance: 'normal',
  importanceBasis: 'default',
  date: '2026-10-15',
  dateBasis: 'stated',
  dateText: 'tomorrow',
  time: null,
  timeText: null,
  ...over
});

describe('Brain Dump: exact-minute times', () => {
  const withDraft = (draft = draftFromProposal(proposal({ time: '10:09', timeText: '10:09' }), 'k1')): CaptureState => ({
    ...initialCaptureState,
    stage: 'review',
    drafts: [draft]
  });

  it('an AI-proposed exact time is kept as proposed', () => {
    const draft = draftFromProposal(proposal({ time: '15:43', timeText: '3:43pm' }), 'k1');
    expect(draft.time).toBe('15:43');
    expect(toNewTaskInput(draft).start_time).toBe('15:43');
  });

  it('no proposed time stays no time — none is invented', () => {
    const draft = draftFromProposal(proposal({}), 'k1');
    expect(draft.time).toBeNull();
    expect(toNewTaskInput(draft).start_time).toBeNull();
  });

  it.each(['11:17', '00:01', '23:59'])('the person can set %s exactly', (time) => {
    const state = captureReducer(withDraft(), { type: 'time', key: 'k1', time });
    expect(state.drafts[0].time).toBe(time);
    expect(toNewTaskInput(state.drafts[0]).start_time).toBe(time);
  });

  it.each(['', '25:00', 'soon', '9:5'])('an empty or invalid entry %j clears the time instead of guessing', (time) => {
    expect(captureReducer(withDraft(), { type: 'time', key: 'k1', time }).drafts[0].time).toBeNull();
  });

  it('"No time" clears it', () => {
    expect(captureReducer(withDraft(), { type: 'time', key: 'k1', time: null }).drafts[0].time).toBeNull();
  });

  it('a time without a date is refused, as before', () => {
    const later = captureReducer(withDraft(), { type: 'date', key: 'k1', date: null });
    expect(later.drafts[0].time).toBeNull();
    expect(captureReducer(later, { type: 'time', key: 'k1', time: '10:09' }).drafts[0].time).toBeNull();
    expect(validateDraft({ ...blankDraft('x'), title: 'x', time: '10:09' })).toEqual({ ok: false, message: 'A time needs a date.' });
  });

  it('the review card shows a minute-precise time field with the proposed value and a No time action', () => {
    const draft = draftFromProposal(proposal({ time: '10:09', timeText: '10:09' }), 'k1');
    const props = { draft, today: '2026-10-14', error: null, disabled: false, onTitle: vi.fn(), onImportance: vi.fn(), onDate: vi.fn(), onTime: vi.fn(), onRemove: vi.fn() };
    const html = renderToString(<ProposalCard {...props} />);
    expect(html).toContain('type="time"');
    expect(html).toContain('value="10:09"');
    expect(html).toContain('aria-label="Time: 10:09 AM"');
    expect(text(html)).toContain('No time');
  });

  it('no date: no time field at all', () => {
    const draft = draftFromProposal(proposal({ date: null, dateBasis: null, dateText: null }), 'k1');
    const props = { draft, today: '2026-10-14', error: null, disabled: false, onTitle: vi.fn(), onImportance: vi.fn(), onDate: vi.fn(), onTime: vi.fn(), onRemove: vi.fn() };
    expect(renderToString(<ProposalCard {...props} />)).not.toContain('type="time"');
  });
});
