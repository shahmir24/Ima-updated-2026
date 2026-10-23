import { describe, expect, it, vi } from 'vitest';
import {
  applyFocusSetup,
  choiceFor,
  hasChosenFocusPreferences,
  initialRounds,
  lengthsForStyle,
  needsFocusSetup,
  resolveFocusSetup,
  styleAfterLengthEdit,
  type FocusSetupGate
} from './focus-setup';

const row = (over: Partial<{ focus_block_minutes: number; buffer_minutes: number; default_flows: number; timeboxing_style: string | null }> = {}) => ({
  focus_block_minutes: 25,
  buffer_minutes: 5,
  default_flows: 4,
  timeboxing_style: null,
  ...over
});
const gate = (over: Partial<FocusSetupGate> = {}): FocusSetupGate => ({
  signedIn: true,
  settingsLoaded: true,
  settingsFailed: false,
  settings: row(),
  sessionInProgress: false,
  ...over
});

describe('who sees first-time setup', () => {
  it('a signed-in user whose row is untouched (no style, schema defaults) sees it', () => {
    expect(needsFocusSetup(gate())).toBe(true);
  });

  it('an account with no settings row at all sees it', () => {
    expect(needsFocusSetup(gate({ settings: null }))).toBe(true);
  });

  it('anyone who chose a style in Profile Settings has set up', () => {
    for (const style of ['pomodoro', 'deep-dive', 'custom']) expect(needsFocusSetup(gate({ settings: row({ timeboxing_style: style }) }))).toBe(false);
  });

  it('anyone who already changed a length or the rounds has chosen, even with no style', () => {
    expect(needsFocusSetup(gate({ settings: row({ focus_block_minutes: 90 }) }))).toBe(false);
    expect(needsFocusSetup(gate({ settings: row({ buffer_minutes: 10 }) }))).toBe(false);
    expect(needsFocusSetup(gate({ settings: row({ default_flows: 2 }) }))).toBe(false);
    expect(hasChosenFocusPreferences(row())).toBe(false);
  });

  it('guests never see it', () => {
    expect(needsFocusSetup(gate({ signedIn: false }))).toBe(false);
  });

  it('nothing is shown until settings have loaded, or when they failed to load', () => {
    expect(needsFocusSetup(gate({ settingsLoaded: false }))).toBe(false);
    expect(needsFocusSetup(gate({ settings: undefined }))).toBe(false);
    expect(needsFocusSetup(gate({ settingsFailed: true }))).toBe(false);
  });

  it('never over a running or paused session', () => {
    expect(needsFocusSetup(gate({ sessionInProgress: true }))).toBe(false);
  });
});

describe('what setup offers and saves', () => {
  it('Short Focus saves 25/5 as pomodoro; Deep Focus saves 45/15 as deep-dive', () => {
    expect(resolveFocusSetup({ choice: 'short', customBlock: '', customBreak: '', rounds: 4 })).toEqual({
      ok: true,
      config: { blockMinutes: 25, breakMinutes: 5, flows: 4 },
      patch: { focus_block_minutes: 25, buffer_minutes: 5, default_flows: 4, timeboxing_style: 'pomodoro' }
    });
    expect(resolveFocusSetup({ choice: 'deep', customBlock: '', customBreak: '', rounds: 2 })).toMatchObject({
      ok: true,
      patch: { focus_block_minutes: 45, buffer_minutes: 15, default_flows: 2, timeboxing_style: 'deep-dive' }
    });
  });

  it('Custom saves the typed lengths as custom — even when they happen to equal a preset', () => {
    expect(resolveFocusSetup({ choice: 'custom', customBlock: '30', customBreak: '7', rounds: 5 })).toMatchObject({
      ok: true,
      patch: { focus_block_minutes: 30, buffer_minutes: 7, default_flows: 5, timeboxing_style: 'custom' }
    });
    expect(resolveFocusSetup({ choice: 'custom', customBlock: '25', customBreak: '5', rounds: 4 })).toMatchObject({
      patch: { timeboxing_style: 'custom' }
    });
  });

  it('Custom refuses lengths outside the existing custom ranges, naming the field', () => {
    expect(resolveFocusSetup({ choice: 'custom', customBlock: '0', customBreak: '5', rounds: 4 })).toMatchObject({ ok: false, field: 'block' });
    expect(resolveFocusSetup({ choice: 'custom', customBlock: '241', customBreak: '5', rounds: 4 })).toMatchObject({ ok: false, field: 'block' });
    expect(resolveFocusSetup({ choice: 'custom', customBlock: '25', customBreak: '61', rounds: 4 })).toMatchObject({ ok: false, field: 'break' });
    expect(resolveFocusSetup({ choice: 'custom', customBlock: '2.5', customBreak: '5', rounds: 4 })).toMatchObject({ ok: false, field: 'block' });
  });

  it('1–5 rounds, nothing else', () => {
    for (const rounds of [1, 2, 3, 4, 5]) expect(resolveFocusSetup({ choice: 'short', customBlock: '', customBreak: '', rounds }).ok).toBe(true);
    for (const rounds of [0, 6, 2.5]) expect(resolveFocusSetup({ choice: 'short', customBlock: '', customBreak: '', rounds })).toMatchObject({ ok: false, field: 'rounds' });
  });

  it('starts from what is saved: rounds 1–5 kept, otherwise 4', () => {
    expect(initialRounds(null)).toBe(4);
    expect(initialRounds(row({ default_flows: 3 }))).toBe(3);
    expect(initialRounds(row({ default_flows: 8 }))).toBe(4);
  });

  it('reopened, the saved choice is selected; Custom is never reclassified as a preset', () => {
    expect(choiceFor(null)).toBe('short');
    expect(choiceFor(row())).toBe('short');
    expect(choiceFor(row({ focus_block_minutes: 45, buffer_minutes: 15 }))).toBe('deep');
    expect(choiceFor(row({ timeboxing_style: 'custom' }))).toBe('custom');
    expect(choiceFor(row({ timeboxing_style: 'pomodoro', focus_block_minutes: 90 }))).toBe('custom');
    expect(choiceFor(row({ focus_block_minutes: 30 }))).toBe('custom');
  });
});

describe('applying saved preferences to the timer', () => {
  const timer = (over: { inProgress?: boolean; finished?: boolean } = {}) => ({
    inProgress: over.inProgress ?? false,
    state: { finished: over.finished ?? false },
    seed: vi.fn(),
    changeSetting: vi.fn()
  });
  const config = { blockMinutes: 45, breakMinutes: 15, flows: 3 };

  it('no session yet: seeds the idle timer (which still waits for Play)', () => {
    const t = timer();
    expect(applyFocusSetup(t, config)).toBe('seeded');
    expect(t.seed).toHaveBeenCalledWith(config);
    expect(t.changeSetting).not.toHaveBeenCalled();
  });

  it('a running or paused session is never touched', () => {
    const t = timer({ inProgress: true });
    expect(applyFocusSetup(t, config)).toBe('kept-session');
    expect(t.seed).not.toHaveBeenCalled();
    expect(t.changeSetting).not.toHaveBeenCalled();
  });

  it('a finished session gets the new lengths, so the next Play uses them', () => {
    const t = timer({ finished: true });
    expect(applyFocusSetup(t, config)).toBe('updated-finished');
    expect(t.changeSetting.mock.calls).toEqual([['timeBox', 45], ['interval', 15], ['flows', 3]]);
  });
});

describe('Profile Settings stays consistent with the presets', () => {
  it('choosing Pomodoro or Deep Dive also sets its lengths; Custom keeps the current ones', () => {
    expect(lengthsForStyle('pomodoro')).toEqual({ focus_block_minutes: 25, buffer_minutes: 5 });
    expect(lengthsForStyle('deep-dive')).toEqual({ focus_block_minutes: 45, buffer_minutes: 15 });
    expect(lengthsForStyle('custom')).toBeNull();
  });

  it('editing a length away from the chosen preset makes it Custom; nothing else changes the style', () => {
    expect(styleAfterLengthEdit('pomodoro', 45, 5)).toBe('custom');
    expect(styleAfterLengthEdit('deep-dive', 45, 10)).toBe('custom');
    expect(styleAfterLengthEdit('pomodoro', 25, 5)).toBeNull();
    expect(styleAfterLengthEdit('custom', 25, 5)).toBeNull(); // never promoted to a preset
    expect(styleAfterLengthEdit(null, 90, 10)).toBeNull();
  });
});
