/**
 * Quick Capture "Organize it": the wire contract.
 *
 * This file exists twice, byte for byte:
 *   src/lib/ai/organize-contract.ts                    (browser, built by Vite)
 *   supabase/functions/_shared/organize-contract.ts    (Edge Function, Deno)
 * The runtimes cannot share a module, so organize-contract.parity.test.ts
 * fails unless the two files are identical. Change one, copy it to the other.
 *
 * Pure validation: no fetch, no environment, no secrets, no database, no
 * imports. The server runs sanitiseOrganizeOutput over the model's output
 * before replying; the browser runs it again over what arrives.
 *
 * The organizer ORGANIZES. It never ranks: nothing here, and nothing in the
 * reply, says what to do first. Order is the order things were mentioned.
 */

export const ORGANIZE_LIMITS = {
  /** Brain Dump text, in characters. */
  inputMaxLength: 2000,
  titleMaxLength: 120,
  maxProposals: 15,
  maxNotTasks: 10,
  notTaskMaxLength: 200,
  /** The user's own words for a date or time ("tomorrow", "tonight"). */
  phraseMaxLength: 40,
  timeZoneMaxLength: 64,
  /** A proposed date further out than this is dropped (left unscheduled). */
  maxDaysAhead: 366
} as const;

export const ORGANIZE_IMPORTANCE = ['low', 'normal', 'high'] as const;
export type OrganizeImportance = (typeof ORGANIZE_IMPORTANCE)[number];

export const NOT_TASK_KINDS = ['idea', 'note', 'unclear'] as const;
export type NotTaskKind = (typeof NOT_TASK_KINDS)[number];

export interface OrganizeRequest {
  /** What the person wrote (or, later, said). */
  text: string;
  /** The browser's local calendar date, 'YYYY-MM-DD'. Relative dates resolve against it. */
  today: string;
  /** Optional IANA zone name, only to describe the person's day to the model. */
  timeZone?: string;
}

export interface OrganizeProposal {
  title: string;
  importance: OrganizeImportance;
  /** 'stated' only when the wording itself signalled importance; otherwise importance is 'normal'. */
  importanceBasis: 'stated' | 'default';
  /** 'YYYY-MM-DD', or null when nothing in the text points to a day: an unscheduled task. */
  date: string | null;
  /** How the date was reached. null exactly when date is null. 'inferred' means "check this". */
  dateBasis: 'stated' | 'inferred' | null;
  /** The person's own words for the day ("tomorrow", "tonight"), if any. */
  dateText: string | null;
  /** 'HH:MM', only for a clock time the person actually gave, and only with a date. */
  time: string | null;
  /** The person's own words for the time ("3pm", "tonight"), if any. */
  timeText: string | null;
}

export interface NotTask {
  text: string;
  kind: NotTaskKind;
}

export interface OrganizeResult {
  proposals: OrganizeProposal[];
  notTasks: NotTask[];
}

export type OrganizeErrorCode = 'bad_request' | 'unauthenticated' | 'rate_limited' | 'provider_unavailable' | 'invalid_output';

export type OrganizeResponse = ({ ok: true } & OrganizeResult) | { ok: false; code: OrganizeErrorCode; message: string };

export type Validated<T> = { ok: true; value: T } | { ok: false; code: OrganizeErrorCode; message: string };

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** 'YYYY-MM-DD' to a whole day number, or null when it is not a real date. */
export function toEpochDay(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = Date.UTC(year, month - 1, day);
  const back = new Date(utc);
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) return null;
  return utc / MS_PER_DAY;
}

/** 'YYYY-MM-DD' plus n days. */
export function addDays(isoDate: string, days: number): string {
  const day = toEpochDay(isoDate);
  if (day === null) throw new Error('invalid date');
  const d = new Date((day + days) * MS_PER_DAY);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 'HH:MM' (or 'HH:MM:SS') to 'HH:MM', or null. */
export function toClockTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/.exec(value);
  return match ? `${match[1]}:${match[2]}` : null;
}

/** One line of plain text: control characters and runs of whitespace collapsed. */
export function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const flat = value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const chars = Array.from(flat);
  return chars.length > maxLength ? chars.slice(0, maxLength).join('').trimEnd() : flat;
}

/**
 * Words that are a clock time. A proposal keeps a time only when the person's
 * own words for it look like one, so "tonight" or "after lunch" can never come
 * back as 19:00 or 13:00.
 */
function looksLikeClockTime(words: string | null): boolean {
  return words !== null && (/\d/.test(words) || /\b(noon|midday|midnight)\b/i.test(words));
}

const hasOnly = (value: object, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key));

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

/** What the browser may send. Anything else, including any user field, is refused. */
export function validateOrganizeRequest(payload: unknown): Validated<OrganizeRequest> {
  const bad = (message: string): Validated<OrganizeRequest> => ({ ok: false, code: 'bad_request', message });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return bad('Request body must be an object.');
  const body = payload as Record<string, unknown>;
  if (!hasOnly(body, ['text', 'today', 'timeZone'])) return bad('Request has unexpected fields.');

  if (typeof body.text !== 'string' || body.text.trim() === '') return bad('Write something to organize first.');
  if (Array.from(body.text).length > ORGANIZE_LIMITS.inputMaxLength) return bad('That is a little long. Try a shorter list.');

  if (toEpochDay(body.today) === null) return bad('Request needs today as a date.');

  let timeZone: string | undefined;
  if (body.timeZone !== undefined) {
    if (
      typeof body.timeZone !== 'string' ||
      body.timeZone.length > ORGANIZE_LIMITS.timeZoneMaxLength ||
      !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(body.timeZone)
    ) {
      return bad('Request has an invalid time zone.');
    }
    timeZone = body.timeZone;
  }

  return { ok: true, value: { text: body.text.trim(), today: body.today as string, ...(timeZone ? { timeZone } : {}) } };
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

/** One proposal from untrusted output, cleaned, or null to drop it. */
function sanitiseProposal(raw: unknown, today: string): OrganizeProposal | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;

  const title = cleanText(item.title, ORGANIZE_LIMITS.titleMaxLength);
  if (!title) return null;

  // Importance moves off 'normal' only with stated evidence in the wording.
  const stated = item.importanceBasis === 'stated';
  const importance: OrganizeImportance =
    stated && (ORGANIZE_IMPORTANCE as readonly unknown[]).includes(item.importance) ? (item.importance as OrganizeImportance) : 'normal';

  const dateText = cleanText(item.dateText, ORGANIZE_LIMITS.phraseMaxLength);
  const timeText = cleanText(item.timeText, ORGANIZE_LIMITS.phraseMaxLength);

  // A date must be real and within today .. today + maxDaysAhead. A past date
  // or a far-future one is dropped: the task is left unscheduled, and the
  // person's own words stay visible so nothing is silently lost.
  let date: string | null = null;
  const day = toEpochDay(item.date);
  const todayDay = toEpochDay(today);
  if (day !== null && todayDay !== null && day >= todayDay && day <= todayDay + ORGANIZE_LIMITS.maxDaysAhead) {
    date = item.date as string;
  }
  // Unknown provenance is treated as a guess, never as certain.
  const dateBasis: OrganizeProposal['dateBasis'] = date === null ? null : item.dateBasis === 'stated' ? 'stated' : 'inferred';

  // A clock time only with a date, and only when the person's words were one.
  const clock = toClockTime(item.time);
  const time = date !== null && clock !== null && looksLikeClockTime(timeText) ? clock : null;

  return { title, importance, importanceBasis: importance === 'normal' ? 'default' : 'stated', date, dateBasis, dateText, time, timeText };
}

function sanitiseNotTask(raw: unknown): NotTask | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const text = cleanText(item.text, ORGANIZE_LIMITS.notTaskMaxLength);
  if (!text) return null;
  const kind = (NOT_TASK_KINDS as readonly unknown[]).includes(item.kind) ? (item.kind as NotTaskKind) : 'unclear';
  return { text, kind };
}

const titleKey = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Untrusted organizer output to a safe result. Malformed items are dropped,
 * duplicate titles are removed (first kept), and counts are capped. Output
 * that is not even the right shape is refused outright.
 */
export function sanitiseOrganizeOutput(raw: unknown, context: { today: string }): Validated<OrganizeResult> {
  const invalid: Validated<OrganizeResult> = { ok: false, code: 'invalid_output', message: 'Could not organize that just now.' };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid;
  const body = raw as Record<string, unknown>;
  if (!Array.isArray(body.proposals)) return invalid;
  const notTasksRaw = body.notTasks === undefined ? [] : body.notTasks;
  if (!Array.isArray(notTasksRaw)) return invalid;
  if (toEpochDay(context.today) === null) return invalid;

  const seen = new Set<string>();
  const proposals: OrganizeProposal[] = [];
  for (const item of body.proposals) {
    if (proposals.length >= ORGANIZE_LIMITS.maxProposals) break;
    const proposal = sanitiseProposal(item, context.today);
    if (!proposal) continue;
    const key = titleKey(proposal.title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    proposals.push(proposal);
  }

  const notTasks: NotTask[] = [];
  for (const item of notTasksRaw) {
    if (notTasks.length >= ORGANIZE_LIMITS.maxNotTasks) break;
    const notTask = sanitiseNotTask(item);
    if (notTask) notTasks.push(notTask);
  }

  return { ok: true, value: { proposals, notTasks } };
}
