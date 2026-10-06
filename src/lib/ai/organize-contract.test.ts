import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as browser from './organize-contract';
import * as edge from '../../../supabase/functions/_shared/organize-contract';

const { ORGANIZE_LIMITS, sanitiseOrganizeOutput, validateOrganizeRequest } = browser;
const TODAY = '2026-10-06'; // a Tuesday
const TOMORROW = '2026-10-07';

const proposal = (overrides: Record<string, unknown> = {}) => ({
  title: 'Research Dubai accelerators',
  importance: 'normal',
  importanceBasis: 'default',
  date: null,
  dateBasis: null,
  dateText: null,
  time: null,
  timeText: null,
  ...overrides
});
const sanitise = (proposals: unknown[], notTasks: unknown[] = []) => {
  const result = sanitiseOrganizeOutput({ proposals, notTasks }, { today: TODAY });
  if (!result.ok) throw new Error('expected ok');
  return result.value;
};

describe('organize contract — browser/server parity', () => {
  it('the two copies are byte-identical', () => {
    const a = readFileSync(new URL('./organize-contract.ts', import.meta.url), 'utf8');
    const b = readFileSync(new URL('../../../supabase/functions/_shared/organize-contract.ts', import.meta.url), 'utf8');
    expect(b).toBe(a);
  });

  it('and behave identically on the same inputs', () => {
    expect(edge.ORGANIZE_LIMITS).toEqual(browser.ORGANIZE_LIMITS);
    const outputs = [
      { proposals: [proposal({ date: TOMORROW, dateBasis: 'stated', dateText: 'tomorrow', time: '15:00', timeText: '3pm' })], notTasks: [{ text: 'x', kind: 'idea' }] },
      { proposals: 'nope' },
      { proposals: [proposal({ title: '' }), proposal(), proposal()] },
      null
    ];
    for (const output of outputs) {
      expect(edge.sanitiseOrganizeOutput(output, { today: TODAY })).toEqual(browser.sanitiseOrganizeOutput(output, { today: TODAY }));
    }
    for (const request of [{ text: 'a', today: TODAY }, { text: 'a', today: TODAY, userId: 'x' }, { text: '', today: TODAY }]) {
      expect(edge.validateOrganizeRequest(request)).toEqual(browser.validateOrganizeRequest(request));
    }
  });
});

describe('validateOrganizeRequest', () => {
  it('accepts text, today and an optional time zone; trims the text', () => {
    expect(validateOrganizeRequest({ text: '  call Ali  ', today: TODAY, timeZone: 'Asia/Karachi' })).toEqual({
      ok: true,
      value: { text: 'call Ali', today: TODAY, timeZone: 'Asia/Karachi' }
    });
  });

  it.each([
    ['not an object', 'text'],
    ['an array', []],
    ['unknown fields (no user field may be sent)', { text: 'a', today: TODAY, userId: 'someone' }],
    ['empty text', { text: '   ', today: TODAY }],
    ['text not a string', { text: 5, today: TODAY }],
    ['text too long', { text: 'x'.repeat(2001), today: TODAY }],
    ['missing today', { text: 'a' }],
    ['unreal today', { text: 'a', today: '2026-02-30' }],
    ['bad time zone', { text: 'a', today: TODAY, timeZone: '../etc' }],
    ['time zone too long', { text: 'a', today: TODAY, timeZone: 'A'.repeat(65) }]
  ])('refuses %s', (_label, payload) => {
    const result = validateOrganizeRequest(payload);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ code: 'bad_request' });
  });

  it('accepts exactly 2,000 characters', () => {
    expect(validateOrganizeRequest({ text: 'x'.repeat(2000), today: TODAY }).ok).toBe(true);
  });
});

describe('sanitiseOrganizeOutput — dates and times', () => {
  it('explicit date ("tomorrow") is kept as stated', () => {
    expect(sanitise([proposal({ title: 'Finish the application', date: TOMORROW, dateBasis: 'stated', dateText: 'tomorrow' })]).proposals[0]).toMatchObject({
      date: TOMORROW,
      dateBasis: 'stated',
      dateText: 'tomorrow',
      time: null
    });
  });

  it('inferred date ("tonight") is kept but labelled inferred, with no invented time', () => {
    expect(
      sanitise([proposal({ title: 'Work on the landing page', date: TODAY, dateBasis: 'inferred', dateText: 'tonight', time: '19:00', timeText: 'tonight' })]).proposals[0]
    ).toMatchObject({ date: TODAY, dateBasis: 'inferred', time: null, timeText: 'tonight' });
  });

  it('no date signal → date null (unscheduled), never today', () => {
    expect(sanitise([proposal()]).proposals[0]).toMatchObject({ date: null, dateBasis: null, time: null });
  });

  it('explicit clock time ("3pm") with a date is kept', () => {
    expect(sanitise([proposal({ title: 'Call Ali', date: TOMORROW, dateBasis: 'stated', dateText: 'tomorrow', time: '15:00', timeText: 'at 3pm' })]).proposals[0]).toMatchObject({
      date: TOMORROW,
      time: '15:00'
    });
    expect(sanitise([proposal({ date: TODAY, dateBasis: 'stated', time: '12:00', timeText: 'noon' })]).proposals[0].time).toBe('12:00');
  });

  it.each([
    ['vague words', { timeText: 'after lunch', time: '13:00' }],
    ['no words at all', { timeText: null, time: '09:00' }],
    ['a malformed time', { timeText: '3pm', time: '3pm' }],
    ['an impossible time', { timeText: '25:00', time: '25:00' }]
  ])('a time from %s is dropped', (_label, fields) => {
    expect(sanitise([proposal({ date: TODAY, dateBasis: 'stated', ...fields })]).proposals[0].time).toBeNull();
  });

  it('a time without a date is dropped (the words stay)', () => {
    expect(sanitise([proposal({ time: '15:00', timeText: '3pm' })]).proposals[0]).toMatchObject({ date: null, time: null, timeText: '3pm' });
  });

  it.each([
    ['in the past', '2026-10-05'],
    ['too far ahead', '2027-10-08'],
    ['not a real date', '2026-02-30'],
    ['not a date', 'tomorrow']
  ])('a date %s is dropped, leaving the task unscheduled', (_label, date) => {
    expect(sanitise([proposal({ date, dateBasis: 'stated', dateText: 'x' })]).proposals[0]).toMatchObject({ date: null, dateBasis: null, dateText: 'x' });
  });

  it('unknown date provenance is treated as inferred, never as certain', () => {
    expect(sanitise([proposal({ date: TODAY, dateBasis: 'certain' })]).proposals[0].dateBasis).toBe('inferred');
  });
});

describe('sanitiseOrganizeOutput — importance, titles, limits', () => {
  it('importance defaults to normal', () => {
    expect(sanitise([proposal()]).proposals[0]).toMatchObject({ importance: 'normal', importanceBasis: 'default' });
  });

  it('an explicit signal keeps high or low', () => {
    expect(sanitise([proposal({ importance: 'high', importanceBasis: 'stated' })]).proposals[0]).toMatchObject({ importance: 'high', importanceBasis: 'stated' });
    expect(sanitise([proposal({ importance: 'low', importanceBasis: 'stated' })]).proposals[0].importance).toBe('low');
  });

  it('high or low without stated evidence falls back to normal', () => {
    expect(sanitise([proposal({ importance: 'high', importanceBasis: 'default' })]).proposals[0].importance).toBe('normal');
    expect(sanitise([proposal({ importance: 'critical', importanceBasis: 'stated' })]).proposals[0].importance).toBe('normal');
  });

  it('titles are flattened and capped at 120 characters; empty titles are dropped', () => {
    const value = sanitise([proposal({ title: '  Call\n\tAli  ' }), proposal({ title: 'x'.repeat(300) }), proposal({ title: '   ' }), proposal({ title: 42 })]);
    expect(value.proposals.map((p) => p.title)).toEqual(['Call Ali', 'x'.repeat(120)]);
  });

  it('duplicates (by normalised title) are removed, first kept', () => {
    const value = sanitise([proposal({ title: 'Call Ali' }), proposal({ title: 'call ali!', date: TODAY, dateBasis: 'stated' }), proposal({ title: 'Buy shoes' })]);
    expect(value.proposals.map((p) => p.title)).toEqual(['Call Ali', 'Buy shoes']);
    expect(value.proposals[0].date).toBeNull();
  });

  it('at most 15 proposals and 10 not-tasks', () => {
    const value = sanitise(
      Array.from({ length: 30 }, (_, i) => proposal({ title: `Task ${i}` })),
      Array.from({ length: 30 }, (_, i) => ({ text: `Thought ${i}`, kind: 'idea' }))
    );
    expect(value.proposals).toHaveLength(ORGANIZE_LIMITS.maxProposals);
    expect(value.notTasks).toHaveLength(ORGANIZE_LIMITS.maxNotTasks);
  });

  it('non-task thoughts are kept separately, cleaned, with a known kind', () => {
    expect(sanitise([], [{ text: ' I feel behind on everything ', kind: 'note' }, { text: 'maybe a podcast?', kind: 'weird' }, { text: '' }]).notTasks).toEqual([
      { text: 'I feel behind on everything', kind: 'note' },
      { text: 'maybe a podcast?', kind: 'unclear' }
    ]);
  });

  it('extra fields from the model never pass through', () => {
    const out = sanitise([{ ...proposal(), rank: 1, doThisFirst: true, user_id: 'x' }]).proposals[0];
    expect(Object.keys(out).sort()).toEqual(['date', 'dateBasis', 'dateText', 'importance', 'importanceBasis', 'time', 'timeText', 'title']);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['proposals missing', { notTasks: [] }],
    ['proposals not an array', { proposals: 'Call Ali' }],
    ['notTasks not an array', { proposals: [], notTasks: {} }]
  ])('malformed output (%s) is refused', (_label, output) => {
    expect(sanitiseOrganizeOutput(output, { today: TODAY })).toMatchObject({ ok: false, code: 'invalid_output' });
  });

  it('malformed individual items are dropped, the rest kept', () => {
    expect(sanitise([null, 'Call Ali', [], proposal({ title: 'Real one' })]).proposals.map((p) => p.title)).toEqual(['Real one']);
  });
});
