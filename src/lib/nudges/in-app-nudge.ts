/**
 * The in-app gentle nudge: whether one shows, what it says, and where its
 * buttons go. Plain functions, so every state is testable without a browser.
 *
 * The Context Engine is the only authority on WHICH task. Nothing here ranks,
 * scores or reads meaning into a title: the first task rankTasks() returns for
 * the user's local date is the task, and its reason (days overdue) is the only
 * signal used to pick between the two task wordings.
 *
 * All copy lives in NUDGE_COPY. Components render it; they do not write it.
 */
import { rankTasks, type ContextTask } from '@/lib/context-engine';

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

export const NUDGE_COPY = {
  recommended: {
    heading: 'One thing at a time',
    body: (title: string) => `Maybe start with “${title}”. You don't have to finish it. Just start.`,
    primary: 'Start',
    secondary: "I'm stuck"
  },
  overdue: {
    heading: 'Still worth doing',
    body: (title: string) => `“${title}” is still waiting. A small step counts.`,
    primary: 'Start',
    secondary: "I'm stuck"
  },
  generic: {
    heading: 'A gentle nudge',
    body: 'One thing on your list could use a little attention. One small step is enough.',
    primary: "See what's next"
  },
  close: 'Close gentle nudge'
} as const;

const TITLE_MAX = 80;

/** A task title for one sentence: no control characters, collapsed whitespace, bounded. Null when blank. */
export function cleanNudgeTitle(title: unknown): string | null {
  if (typeof title !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const flat = title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const chars = Array.from(flat);
  return chars.length > TITLE_MAX ? `${chars.slice(0, TITLE_MAX - 1).join('').trimEnd()}…` : flat;
}

// ---------------------------------------------------------------------------
// Which nudge, if any
// ---------------------------------------------------------------------------

export type NudgeVariant = 'recommended' | 'overdue' | 'generic';
export type NudgeAction = 'start' | 'stuck' | 'see-next';

export interface InAppNudge {
  variant: NudgeVariant;
  /** The Context Engine's task. Its title is in `body` only when titles are allowed. */
  taskId: string;
  /** Identifies this nudge for dismissal: one task, one local day. */
  key: string;
  heading: string;
  body: string;
  primary: { label: string; action: NudgeAction };
  secondary: { label: string; action: NudgeAction } | null;
}

export interface NudgeTask extends ContextTask {
  title: string;
}

export interface InAppNudgeInput<T extends NudgeTask> {
  /** A signed-in account. Guests (and anyone signed out) never get a nudge. */
  signedIn: boolean;
  /** user_settings as loaded; null/undefined while loading, failed or missing. */
  settings: { nudges_enabled?: boolean | null; nudge_show_task_titles?: boolean | null } | null | undefined;
  /** False while tasks are loading or failed: never nudge from a partial picture. */
  tasksReady: boolean;
  tasks: T[];
  /** The user's local calendar date, 'YYYY-MM-DD' — the same "today" Home ranks with. */
  today: string;
  /** Keys the user has already dismissed or acted on this session. */
  dismissed: ReadonlySet<string>;
}

export const nudgeKey = (today: string, taskId: string) => `${today}:${taskId}`;

/** The nudge to show now, or null. Null is the common, correct answer. */
export function selectInAppNudge<T extends NudgeTask>(input: InAppNudgeInput<T>): InAppNudge | null {
  if (!input.signedIn) return null;
  // Strictly true: missing or unloaded settings mean off, as the database default does.
  if (input.settings?.nudges_enabled !== true) return null;
  if (!input.tasksReady) return null;

  const top = rankTasks(input.tasks, { today: input.today })[0];
  if (!top) return null;

  const key = nudgeKey(input.today, top.task.id);
  if (input.dismissed.has(key)) return null;

  // Strictly true as well: anything else keeps the title private.
  const title = input.settings.nudge_show_task_titles === true ? cleanNudgeTitle(top.task.title) : null;
  const base = { taskId: top.task.id, key };

  if (!title) {
    return {
      ...base,
      variant: 'generic',
      heading: NUDGE_COPY.generic.heading,
      body: NUDGE_COPY.generic.body,
      primary: { label: NUDGE_COPY.generic.primary, action: 'see-next' },
      secondary: null
    };
  }

  const copy = top.reason.daysOverdue > 0 ? NUDGE_COPY.overdue : NUDGE_COPY.recommended;
  return {
    ...base,
    variant: top.reason.daysOverdue > 0 ? 'overdue' : 'recommended',
    heading: copy.heading,
    body: copy.body(title),
    primary: { label: copy.primary, action: 'start' },
    secondary: { label: copy.secondary, action: 'stuck' }
  };
}

/**
 * Where an action goes. Start and I'm stuck carry the task id exactly as the
 * Right Now card does (?task=<id>), so Focus and Body Double pick the task up
 * themselves; See what's next opens the task list.
 */
export function nudgeActionPath(nudge: Pick<InAppNudge, 'taskId'>, action: NudgeAction): string {
  const task = `?task=${encodeURIComponent(nudge.taskId)}`;
  switch (action) {
    case 'start':
      return `/focus${task}`;
    case 'stuck':
      return `/body-double${task}`;
    default:
      return '/tasks';
  }
}

// ---------------------------------------------------------------------------
// Dismissal, for this browser session only
// ---------------------------------------------------------------------------

/** sessionStorage: survives Home remounts and reloads in this tab, gone when the tab closes. */
export const NUDGE_DISMISSALS_STORAGE_KEY = 'ima.gentleNudge.v1.dismissed';
const MAX_REMEMBERED = 50;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Last resort when sessionStorage is unavailable: dismissals still hold until reload. */
const memoryDismissals = new Set<string>();

function sessionStore(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readNudgeDismissals(storage: StorageLike | null = sessionStore()): Set<string> {
  const keys = new Set(memoryDismissals);
  if (!storage) return keys;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(NUDGE_DISMISSALS_STORAGE_KEY) ?? '[]');
    if (Array.isArray(parsed)) for (const key of parsed) if (typeof key === 'string') keys.add(key);
  } catch {
    // Unreadable: treat as nothing stored.
  }
  return keys;
}

/** Remembers a dismissal and returns the updated set. Never throws. */
export function rememberNudgeDismissal(key: string, storage: StorageLike | null = sessionStore()): Set<string> {
  memoryDismissals.add(key);
  const keys = readNudgeDismissals(storage);
  keys.add(key);
  if (storage) {
    try {
      storage.setItem(NUDGE_DISMISSALS_STORAGE_KEY, JSON.stringify([...keys].slice(-MAX_REMEMBERED)));
    } catch {
      // Full or blocked: the in-memory copy still holds for this page load.
    }
  }
  return keys;
}

/** Tests only. */
export function _resetNudgeDismissalMemory(): void {
  memoryDismissals.clear();
}
