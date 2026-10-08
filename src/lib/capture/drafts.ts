/**
 * Quick Capture drafts: the editable proposals between "Organize it" and
 * "Add tasks". Plain functions and a reducer, so every edit is testable.
 *
 * Nothing here saves anything. A draft becomes a task only through
 * commitDrafts (commit.ts), only after the person presses "Add tasks", and
 * only through the existing task source.
 */
import type { NewTaskInput, TaskImportance } from '@/hooks/use-tasks';
import {
  ORGANIZE_LIMITS,
  cleanText,
  toClockTime,
  toEpochDay,
  addDays,
  type NotTask,
  type OrganizeProposal,
  type OrganizeResult
} from '@/lib/ai/organize-contract';

// ---------------------------------------------------------------------------
// Copy (all user-facing Quick Capture text lives here; no em dashes)
// ---------------------------------------------------------------------------

export const CAPTURE_COPY = {
  heading: "What's on your mind?",
  supporting: 'Dump your tasks, ideas, reminders, whatever. iMA will help sort them out.',
  placeholder: 'Finish the application tomorrow, call Ali at 3pm, buy running shoes...',
  aiNote: 'When you tap Organize it, your text is sent to an AI service to sort it into tasks. Nothing is saved until you choose.',
  organize: 'Organize it',
  organizing: 'Organizing...',
  addManually: 'Add manually',
  close: 'Close quick capture',
  reviewHeading: 'Here is what iMA found',
  reviewSupporting: 'Change anything that looks off. Nothing is saved until you add them.',
  noneFound: 'iMA did not find any tasks in that. You can add one yourself.',
  addAnother: 'Add another',
  addTasks: 'Add tasks',
  saving: 'Adding...',
  back: 'Edit text',
  later: 'Later',
  noTime: 'No time',
  checkThis: 'Check this',
  dateLabel: 'Date',
  timeLabel: 'Time',
  importanceLabel: 'Importance',
  importanceQuestion: 'Anything here particularly important to you?',
  importanceHint: 'Use the importance buttons on any task that matters. Or skip, and they stay as they are.',
  skip: 'Skip',
  titleLabel: 'Task',
  titlePlaceholder: 'What needs doing?',
  removeTask: 'Remove this task',
  keepForLater: 'Keep it for later',
  notTasksHeading: (count: number) => (count === 1 ? '1 thought not added as a task' : `${count} thoughts not added as tasks`),
  makeTask: 'Make it a task',
  needsTitle: 'Give this task a title.',
  saveFailed: (count: number) =>
    count === 1 ? 'One task could not be added. It is still here, so you can try again.' : `${count} tasks could not be added. They are still here, so you can try again.`,
  guestHeading: 'Organizing comes with an account',
  guestBody: 'Create a free account and iMA can sort your thoughts into tasks. Your text stays here in the meantime.',
  guestCreateAccount: 'Create account',
  guestLogIn: 'Log in'
} as const;

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export interface CaptureDraft {
  key: string;
  title: string;
  importance: TaskImportance;
  /**
   * The organizer had no signal for importance (importanceBasis "default").
   * Cleared as soon as the person taps any importance button on this draft.
   */
  importanceUnclear: boolean;
  /** 'YYYY-MM-DD', or null: unscheduled ("Later"). */
  date: string | null;
  /** 'HH:MM', or null. Only with a date. */
  time: string | null;
  /** The organizer guessed the date (or kept vague words): show "Check this" until the person changes it. */
  checkDate: boolean;
  /** The person's own words for the day / time, kept visible. */
  dateText: string | null;
  timeText: string | null;
}

export function draftFromProposal(proposal: OrganizeProposal, key: string): CaptureDraft {
  return {
    key,
    title: proposal.title,
    importance: proposal.importance,
    importanceUnclear: proposal.importanceBasis === 'default',
    date: proposal.date,
    time: proposal.date ? proposal.time : null,
    // A guessed date needs checking. So do vague words with no date or no
    // time ("tonight" with no clock time): they were not turned into anything.
    checkDate:
      proposal.dateBasis === 'inferred' ||
      (proposal.date === null && proposal.dateText !== null) ||
      (proposal.time === null && proposal.timeText !== null),
    dateText: proposal.dateText,
    timeText: proposal.timeText
  };
}

export function blankDraft(key: string): CaptureDraft {
  // Written by the person, not proposed: nothing to clarify.
  return { key, title: '', importance: 'normal', importanceUnclear: false, date: null, time: null, checkDate: false, dateText: null, timeText: null };
}

export type DraftCheck = { ok: true } | { ok: false; message: string };

/** What must hold before a draft may be saved. */
export function validateDraft(draft: CaptureDraft): DraftCheck {
  const title = cleanText(draft.title, ORGANIZE_LIMITS.titleMaxLength);
  if (!title) return { ok: false, message: CAPTURE_COPY.needsTitle };
  if (draft.date !== null && toEpochDay(draft.date) === null) return { ok: false, message: 'Pick a real date, or keep it for later.' };
  if (draft.time !== null && (draft.date === null || toClockTime(draft.time) === null)) {
    return { ok: false, message: 'A time needs a date.' };
  }
  return { ok: true };
}

/**
 * The exact input the existing task form would produce. An unscheduled draft
 * is saved with scheduled_date null: never today, never a placeholder date.
 */
export function toNewTaskInput(draft: CaptureDraft): NewTaskInput {
  return {
    title: cleanText(draft.title, ORGANIZE_LIMITS.titleMaxLength) ?? '',
    scheduled_date: draft.date,
    start_time: draft.date !== null ? toClockTime(draft.time) : null,
    importance: draft.importance
  };
}

/** "Later", "Today", "Tomorrow", or a short date. */
export function describeDraftDate(date: string | null, today: string): string {
  if (date === null) return CAPTURE_COPY.later;
  if (date === today) return 'Today';
  if (toEpochDay(today) !== null && date === addDays(today, 1)) return 'Tomorrow';
  const day = toEpochDay(date);
  if (day === null) return CAPTURE_COPY.later;
  return new Date(day * 86_400_000).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** 'HH:MM' as '3:00 PM'. */
export function describeTime(time: string | null): string {
  const clock = toClockTime(time);
  if (!clock) return CAPTURE_COPY.noTime;
  const [h, m] = clock.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Half-hour choices, plus the draft's own time if it is off the grid. */
export function timeOptions(current: string | null): string[] {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) for (const m of [0, 30]) options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
  const clock = toClockTime(current);
  if (clock && !options.includes(clock)) options.push(clock);
  return options.sort();
}

// ---------------------------------------------------------------------------
// Review state
// ---------------------------------------------------------------------------

export interface CaptureState {
  stage: 'write' | 'review';
  text: string;
  drafts: CaptureDraft[];
  notTasks: NotTask[];
  nextKey: number;
  saving: boolean;
  /** The last save's failure, shown above the remaining drafts. */
  saveError: string | null;
  /** Keys whose fields failed validation on the last "Add tasks". */
  invalid: Record<string, string>;
  /** The person chose Skip on the optional importance question. */
  importanceQuestionSkipped: boolean;
}

export const initialCaptureState: CaptureState = {
  stage: 'write',
  text: '',
  drafts: [],
  notTasks: [],
  nextKey: 1,
  saving: false,
  saveError: null,
  invalid: {},
  importanceQuestionSkipped: false
};

export type CaptureAction =
  | { type: 'text'; text: string }
  | { type: 'organized'; result: OrganizeResult }
  | { type: 'back' }
  | { type: 'title'; key: string; title: string }
  | { type: 'importance'; key: string; importance: TaskImportance }
  | { type: 'skipImportance' }
  | { type: 'date'; key: string; date: string | null }
  | { type: 'time'; key: string; time: string | null }
  | { type: 'remove'; key: string }
  | { type: 'addAnother' }
  | { type: 'promote'; index: number }
  | { type: 'invalid'; invalid: Record<string, string> }
  | { type: 'saveStarted' }
  | { type: 'saveFinished'; savedKeys: string[]; failedCount: number }
  | { type: 'reset' };

const editDraft = (state: CaptureState, key: string, change: (draft: CaptureDraft) => CaptureDraft): CaptureState => {
  const { [key]: _cleared, ...invalid } = state.invalid;
  return { ...state, invalid, drafts: state.drafts.map((draft) => (draft.key === key ? change(draft) : draft)) };
};

export function captureReducer(state: CaptureState, action: CaptureAction): CaptureState {
  switch (action.type) {
    case 'text':
      return { ...state, text: action.text };
    case 'organized': {
      let nextKey = state.nextKey;
      const drafts = action.result.proposals.map((proposal) => draftFromProposal(proposal, `d${nextKey++}`));
      return {
        ...state,
        stage: 'review',
        drafts,
        notTasks: action.result.notTasks,
        nextKey,
        saveError: null,
        invalid: {},
        importanceQuestionSkipped: false
      };
    }
    case 'back':
      // The text is kept exactly as written; the proposals are dropped.
      return { ...state, stage: 'write', drafts: [], notTasks: [], saveError: null, invalid: {}, importanceQuestionSkipped: false };
    case 'title':
      return editDraft(state, action.key, (draft) => ({ ...draft, title: action.title }));
    case 'importance':
      // Any tap answers the question for this task, Normal included.
      return editDraft(state, action.key, (draft) => ({ ...draft, importance: action.importance, importanceUnclear: false }));
    case 'skipImportance':
      return { ...state, importanceQuestionSkipped: true };
    case 'date':
      // Choosing a date answers "Check this". Clearing it to Later clears the time too.
      return editDraft(state, action.key, (draft) => ({
        ...draft,
        date: action.date,
        time: action.date === null ? null : draft.time,
        checkDate: false
      }));
    case 'time':
      return editDraft(state, action.key, (draft) => ({ ...draft, time: draft.date === null ? null : action.time, checkDate: false }));
    case 'remove': {
      const { [action.key]: _cleared, ...invalid } = state.invalid;
      return { ...state, invalid, drafts: state.drafts.filter((draft) => draft.key !== action.key) };
    }
    case 'addAnother':
      return { ...state, stage: 'review', drafts: [...state.drafts, blankDraft(`d${state.nextKey}`)], nextKey: state.nextKey + 1 };
    case 'promote': {
      const thought = state.notTasks[action.index];
      if (!thought) return state;
      const draft = { ...blankDraft(`d${state.nextKey}`), title: cleanText(thought.text, ORGANIZE_LIMITS.titleMaxLength) ?? '' };
      return {
        ...state,
        drafts: [...state.drafts, draft],
        notTasks: state.notTasks.filter((_, index) => index !== action.index),
        nextKey: state.nextKey + 1
      };
    }
    case 'invalid':
      return { ...state, invalid: action.invalid };
    case 'saveStarted':
      return { ...state, saving: true, saveError: null };
    case 'saveFinished': {
      // Saved drafts leave the list at once, so a retry can never send them again.
      const saved = new Set(action.savedKeys);
      return {
        ...state,
        saving: false,
        drafts: state.drafts.filter((draft) => !saved.has(draft.key)),
        saveError: action.failedCount > 0 ? CAPTURE_COPY.saveFailed(action.failedCount) : null
      };
    }
    case 'reset':
      return initialCaptureState;
    default:
      return state;
  }
}

/** Validation for every draft at once: key → message for each one that cannot be saved. */
export function findInvalidDrafts(drafts: CaptureDraft[]): Record<string, string> {
  const invalid: Record<string, string> = {};
  for (const draft of drafts) {
    const check = validateDraft(draft);
    if ('message' in check) invalid[draft.key] = check.message;
  }
  return invalid;
}

/**
 * The optional "Anything here particularly important to you?" question: shown
 * only while at least one proposed task had no importance signal and the
 * person has not skipped it. It never affects saving.
 */
export function showImportanceQuestion(state: Pick<CaptureState, 'drafts' | 'importanceQuestionSkipped'>): boolean {
  return !state.importanceQuestionSkipped && state.drafts.some((draft) => draft.importanceUnclear);
}
