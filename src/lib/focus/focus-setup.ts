/**
 * First-time Focus setup: who needs it, what it offers, and what it saves.
 *
 * Saved preferences live in the existing user_settings row:
 *   focus_block_minutes, buffer_minutes, default_flows — the lengths and rounds;
 *   timeboxing_style — which kind of setup was chosen: 'pomodoro' (Short Focus,
 *     25/5), 'deep-dive' (Deep Focus, 45/15) or 'custom'.
 *
 * timeboxing_style is NULL until someone chooses (the sign-up trigger never
 * sets it; only an explicit choice in Profile Settings or here does), so it is
 * the setup marker. A user who left it NULL but already changed a length or
 * the rounds from the schema defaults HAS chosen, too, and is never asked.
 *
 * Plain functions, so every rule is testable without a page.
 */
import type { UserSettingsRow } from '@/hooks/use-user-settings';
import { CUSTOM_BREAK_MINUTES, CUSTOM_FOCUS_MINUTES, parseWholeMinutes, type MinuteParse } from './custom-duration';
import type { FocusTimerConfig } from './focus-timer-state';

export type TimeboxingStyle = 'pomodoro' | 'deep-dive' | 'custom';
export type FocusSetupChoice = 'short' | 'deep' | 'custom';

export interface FocusPreset {
  label: string;
  blockMinutes: number;
  breakMinutes: number;
  style: Exclude<TimeboxingStyle, 'custom'>;
}

export const FOCUS_PRESETS: Readonly<Record<'short' | 'deep', FocusPreset>> = Object.freeze({
  short: { label: 'Short Focus', blockMinutes: 25, breakMinutes: 5, style: 'pomodoro' },
  deep: { label: 'Deep Focus', blockMinutes: 45, breakMinutes: 15, style: 'deep-dive' }
});

export const SETUP_ROUND_OPTIONS: readonly number[] = Object.freeze([1, 2, 3, 4, 5]);
export const DEFAULT_SETUP_ROUNDS = 4;

/** The user_settings column defaults: what every row starts with. */
const SCHEMA_DEFAULTS = { block: 25, break: 5, flows: 4 } as const;

type FocusSettings = Pick<UserSettingsRow, 'focus_block_minutes' | 'buffer_minutes' | 'default_flows' | 'timeboxing_style'>;

export interface FocusSetupGate {
  /** Guests never see setup: their timer keeps its built-in defaults. */
  signedIn: boolean;
  /** The settings query has finished (successfully or not). */
  settingsLoaded: boolean;
  /** It failed: nothing is known, so nobody is asked. */
  settingsFailed: boolean;
  /** The saved row, or null when the account has none. */
  settings: FocusSettings | null | undefined;
  /** A session is running or paused: setup must never appear over it. */
  sessionInProgress: boolean;
}

/** Whether this user has chosen their focus preferences, by either route. */
export function hasChosenFocusPreferences(settings: FocusSettings): boolean {
  if (settings.timeboxing_style !== null) return true;
  return (
    settings.focus_block_minutes !== SCHEMA_DEFAULTS.block ||
    settings.buffer_minutes !== SCHEMA_DEFAULTS.break ||
    settings.default_flows !== SCHEMA_DEFAULTS.flows
  );
}

/** First-time setup is shown only to a signed-in user who genuinely has not chosen yet. */
export function needsFocusSetup(gate: FocusSetupGate): boolean {
  if (!gate.signedIn || !gate.settingsLoaded || gate.settingsFailed || gate.sessionInProgress) return false;
  if (gate.settings === undefined) return false;
  return gate.settings === null || !hasChosenFocusPreferences(gate.settings);
}

const matches = (preset: FocusPreset, block: number, rest: number) => preset.blockMinutes === block && preset.breakMinutes === rest;

/**
 * Which option a saved row corresponds to. A saved 'custom' stays Custom even
 * at 25/5: a custom choice is never reclassified as a preset. A preset style
 * whose lengths have since drifted is Custom too, since the lengths are what
 * the timer actually uses.
 */
export function choiceFor(settings: FocusSettings | null | undefined): FocusSetupChoice {
  if (!settings) return 'short';
  const block = settings.focus_block_minutes;
  const rest = settings.buffer_minutes;
  switch (settings.timeboxing_style) {
    case 'custom':
      return 'custom';
    case 'pomodoro':
      return matches(FOCUS_PRESETS.short, block, rest) ? 'short' : 'custom';
    case 'deep-dive':
      return matches(FOCUS_PRESETS.deep, block, rest) ? 'deep' : 'custom';
    default:
      if (matches(FOCUS_PRESETS.short, block, rest)) return 'short';
      if (matches(FOCUS_PRESETS.deep, block, rest)) return 'deep';
      return 'custom';
  }
}

/** The rounds to offer first: the saved count when it is 1–5, else 4. */
export function initialRounds(settings: FocusSettings | null | undefined): number {
  const flows = settings?.default_flows;
  return typeof flows === 'number' && SETUP_ROUND_OPTIONS.includes(flows) ? flows : DEFAULT_SETUP_ROUNDS;
}

export interface FocusSetupSelection {
  choice: FocusSetupChoice;
  /** Custom only: as typed. */
  customBlock: string;
  customBreak: string;
  rounds: number;
}

export type FocusSetupResult =
  | {
      ok: true;
      config: FocusTimerConfig;
      patch: { focus_block_minutes: number; buffer_minutes: number; default_flows: number; timeboxing_style: TimeboxingStyle };
    }
  | { ok: false; field: 'block' | 'break' | 'rounds'; message: string };

/** What a confirmed selection saves and loads into the timer, or why it cannot. */
export function resolveFocusSetup(selection: FocusSetupSelection): FocusSetupResult {
  const { choice, rounds } = selection;
  if (!SETUP_ROUND_OPTIONS.includes(rounds)) return { ok: false, field: 'rounds', message: 'Choose from 1 to 5 rounds.' };

  let block: number;
  let rest: number;
  let style: TimeboxingStyle;
  if (choice === 'custom') {
    const b: MinuteParse = parseWholeMinutes(selection.customBlock, CUSTOM_FOCUS_MINUTES);
    if (b.ok === false) return { ok: false, field: 'block', message: b.message };
    const r: MinuteParse = parseWholeMinutes(selection.customBreak, CUSTOM_BREAK_MINUTES);
    if (r.ok === false) return { ok: false, field: 'break', message: r.message };
    block = b.value;
    rest = r.value;
    style = 'custom';
  } else {
    const preset = FOCUS_PRESETS[choice];
    block = preset.blockMinutes;
    rest = preset.breakMinutes;
    style = preset.style;
  }

  return {
    ok: true,
    config: { blockMinutes: block, breakMinutes: rest, flows: rounds },
    patch: { focus_block_minutes: block, buffer_minutes: rest, default_flows: rounds, timeboxing_style: style }
  };
}

/** The parts of the app-wide timer that applying a setup may use. */
export interface FocusSetupTimer {
  inProgress: boolean;
  state: { finished: boolean };
  seed: (config: FocusTimerConfig) => void;
  changeSetting: (setting: 'timeBox' | 'interval' | 'flows', value: number) => void;
}

/**
 * Puts newly saved preferences on the timer — only when no session is running
 * or paused, and never by starting it. Returns what it did.
 *
 *   * In progress: nothing. The session keeps its own lengths and progress.
 *   * Finished: Play would restart with the old lengths, so the new ones are
 *     set on the stopped timer (the same path as the quick settings).
 *   * Otherwise: seeded. Seeding itself refuses a timer that has a session.
 */
export function applyFocusSetup(timer: FocusSetupTimer, config: FocusTimerConfig): 'kept-session' | 'updated-finished' | 'seeded' {
  if (timer.inProgress) return 'kept-session';
  if (timer.state.finished) {
    timer.changeSetting('timeBox', config.blockMinutes);
    timer.changeSetting('interval', config.breakMinutes);
    timer.changeSetting('flows', config.flows);
    return 'updated-finished';
  }
  timer.seed(config);
  return 'seeded';
}

// ---------------------------------------------------------------------------
// Profile Settings consistency
// ---------------------------------------------------------------------------

/** The lengths a style button in Profile Settings also saves: presets set theirs, Custom keeps what is there. */
export function lengthsForStyle(style: TimeboxingStyle): { focus_block_minutes: number; buffer_minutes: number } | null {
  if (style === 'pomodoro') return { focus_block_minutes: FOCUS_PRESETS.short.blockMinutes, buffer_minutes: FOCUS_PRESETS.short.breakMinutes };
  if (style === 'deep-dive') return { focus_block_minutes: FOCUS_PRESETS.deep.blockMinutes, buffer_minutes: FOCUS_PRESETS.deep.breakMinutes };
  return null;
}

/**
 * After a length is edited in Profile Settings: a preset style whose lengths
 * no longer match becomes 'custom'. Anything else is left exactly as it was —
 * Custom is never promoted to a preset, and an unset style stays unset.
 */
export function styleAfterLengthEdit(style: string | null | undefined, block: number, rest: number): TimeboxingStyle | null {
  if (style === 'pomodoro' && !matches(FOCUS_PRESETS.short, block, rest)) return 'custom';
  if (style === 'deep-dive' && !matches(FOCUS_PRESETS.deep, block, rest)) return 'custom';
  return null;
}
