/**
 * send-nudges — the daily gentle-nudge sender.
 *
 * One run:
 *   1. refuses anything but a POST carrying the service-role key, and refuses
 *      to start at all unless VAPID and database access are configured — so a
 *      misconfiguration never claims (and so never uses up) anyone's nudge;
 *   2. claims every user due now through claim_due_nudges(), which inserts the
 *      nudge_deliveries row BEFORE anything is sent. Its unique
 *      (user_id, local_date) is the duplicate guard: a user can be claimed at
 *      most once per local day, by one run, whatever else is running;
 *   3. for each claim: ranks the user's incomplete tasks with the Context
 *      Engine (the same rules as the Right Now card, no model), writes a
 *      gentle notification — naming the task only if the user allows it —
 *      and sends it to each of their devices;
 *   4. keeps the device list healthy (404/410 → the row is deleted; success →
 *      last_success_at and failure_count reset; other failures → failure_count
 *      goes up) and closes the claim as sent, no_devices or failed.
 *
 * A claim is never retried in the same run or re-claimed later that day. If a
 * run dies part-way, its unfinished claims stay 'claimed': that user misses
 * one nudge, and is never sent two.
 *
 * Nothing here holds a key or reads a table directly: the store and the push
 * request builder are injected (index.ts wires the real ones). Logs and the
 * response carry counts only — never a user id, task, endpoint or key.
 */
import { rankTasks } from '../_shared/context-engine.ts';
import { toPushTarget, type PushRequestBuilder } from '../_shared/push-subscription.ts';

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

/** One user claimed by claim_due_nudges(), validated. */
export interface ClaimedNudge {
  deliveryId: string;
  userId: string;
  /** The user's local date the nudge is for: the Context Engine's "today". */
  localDate: string;
  showTaskTitles: boolean;
}

export interface NudgeTaskRow {
  id: string;
  title: string;
  scheduled_date: string;
  created_at: string;
  completed: boolean;
  importance?: unknown;
}

export interface StoredSubscription {
  id: string;
  endpoint: unknown;
  p256dh: unknown;
  auth: unknown;
  failure_count: unknown;
}

export type DeliveryStatus = 'sent' | 'no_devices' | 'failed';

export interface DeliveryOutcome {
  status: DeliveryStatus;
  devicesAttempted: number;
  devicesSucceeded: number;
  taskId: string | null;
  completedAt: string;
}

/** The database side. Every method throws on failure; the handler decides what that means. */
export interface NudgeStore {
  /** Raw claim_due_nudges() rows; validated by the handler. */
  claimDueNudges(limit: number): Promise<unknown[]>;
  /** The user's incomplete tasks scheduled on or before localDate. */
  loadTasks(userId: string, localDate: string): Promise<NudgeTaskRow[]>;
  loadSubscriptions(userId: string): Promise<StoredSubscription[]>;
  markSubscriptionSuccess(subscriptionId: string, userId: string, at: string): Promise<void>;
  markSubscriptionFailure(subscriptionId: string, userId: string, failureCount: number): Promise<void>;
  deleteSubscription(subscriptionId: string, userId: string): Promise<void>;
  /** Closes a 'claimed' delivery. Must not touch a delivery in any other state. */
  completeDelivery(deliveryId: string, outcome: DeliveryOutcome): Promise<void>;
}

export interface SendNudgesLogEvent {
  status: number;
  outcome: string;
  claimed?: number;
  sent?: number;
  noDevices?: number;
  failed?: number;
}

export interface SendNudgesDeps {
  /** SUPABASE_SERVICE_ROLE_KEY. The caller must present it as its bearer token. */
  serviceRoleKey: string | undefined;
  /** False when VAPID or the database URL is missing or malformed. */
  configured: boolean;
  store: NudgeStore;
  buildRequest: PushRequestBuilder;
  fetchImpl: typeof fetch;
  now?: () => Date;
  /** Per push-service request. */
  pushTimeoutMs?: number;
  /** Users processed at once. */
  concurrency?: number;
  log?: (event: SendNudgesLogEvent) => void;
}

/** A push service may hold an undelivered daily nudge this long, then drop it. */
export const NUDGE_TTL_SECONDS = 4 * 60 * 60;
/** One daily nudge per device: a newer one replaces an undelivered older one. */
export const NUDGE_TOPIC = 'ima-daily-nudge';
export const DEFAULT_CLAIM_LIMIT = 200;
const MAX_BODY_BYTES = 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// Task choice and notification copy
// ---------------------------------------------------------------------------

/** The task the nudge is about: the Context Engine's first choice for the user's local date. */
export function selectNudgeTask(tasks: NudgeTaskRow[], localDate: string): NudgeTaskRow | null {
  const ranked = rankTasks(tasks, { today: localDate });
  return ranked.length > 0 ? ranked[0].task : null;
}

export interface NudgeNotification {
  title: string;
  body: string;
  /** An internal iMA path; the service worker refuses anything else. */
  url: string;
}

export const NUDGE_TITLE = 'A gentle nudge from iMA';
export const GENERIC_TASK_BODY = 'One thing on your list could use a little attention today. One small step is enough.';
export const NO_TASK_BODY = 'Nothing is waiting on you right now. If you like, plan one small thing for today.';
const TASK_TITLE_MAX = 60;

/** A task title made safe for one line on a lock screen: no control characters, bounded length. */
export function cleanTaskTitle(title: unknown): string | null {
  if (typeof title !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const flat = title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!flat) return null;
  const chars = Array.from(flat);
  return chars.length > TASK_TITLE_MAX ? `${chars.slice(0, TASK_TITLE_MAX - 1).join('').trimEnd()}…` : flat;
}

/**
 * The notification for one user. A task is named only when the user allows
 * titles; otherwise nothing about the task — not its title, tag, date or id —
 * goes into the payload.
 */
export function buildNudgeNotification(task: NudgeTaskRow | null, showTaskTitles: boolean): NudgeNotification {
  if (!task) return { title: NUDGE_TITLE, body: NO_TASK_BODY, url: '/tasks' };
  const name = showTaskTitles ? cleanTaskTitle(task.title) : null;
  if (name) return { title: NUDGE_TITLE, body: `Maybe start with “${name}”. One small step is enough.`, url: '/' };
  return { title: NUDGE_TITLE, body: GENERIC_TASK_BODY, url: '/' };
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export type DeviceResult = 'sent' | 'gone' | 'failed' | 'invalid';

interface BatchTotals {
  claimed: number;
  sent: number;
  noDevices: number;
  failed: number;
  /** Claim rows too malformed to act on (never expected; counted, not sent). */
  skipped: number;
  devicesAttempted: number;
  devicesSucceeded: number;
  subscriptionsRemoved: number;
  /** Bookkeeping writes that failed (the notification itself may have gone). */
  recordErrors: number;
}

/** A claim_due_nudges() row, or null when it cannot be acted on safely. */
export function parseClaim(row: unknown): ClaimedNudge | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  if (typeof r.delivery_id !== 'string' || !UUID.test(r.delivery_id)) return null;
  if (typeof r.user_id !== 'string' || !UUID.test(r.user_id)) return null;
  if (typeof r.local_date !== 'string' || !ISO_DATE.test(r.local_date)) return null;
  return {
    deliveryId: r.delivery_id,
    userId: r.user_id,
    localDate: r.local_date,
    // Anything but an explicit true hides task names: privacy is the safe default.
    showTaskTitles: r.show_task_titles === true
  };
}

function failureCountOf(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : 0;
}

async function sendToDevice(
  deps: SendNudgesDeps,
  claim: ClaimedNudge,
  subscription: StoredSubscription,
  payload: string,
  totals: BatchTotals
): Promise<DeviceResult> {
  const { store } = deps;
  const subscriptionId = typeof subscription.id === 'string' && UUID.test(subscription.id) ? subscription.id : null;
  const recordFailure = async () => {
    if (!subscriptionId) return;
    try {
      await store.markSubscriptionFailure(subscriptionId, claim.userId, Math.min(failureCountOf(subscription.failure_count) + 1, 1_000_000));
    } catch {
      totals.recordErrors++;
    }
  };

  const target = subscriptionId ? toPushTarget(subscription) : null;
  if (!target) {
    await recordFailure();
    return 'invalid';
  }

  let response: Response;
  try {
    const request = await deps.buildRequest(target, payload);
    response = await deps.fetchImpl(request.endpoint, {
      method: 'POST',
      headers: request.headers,
      body: request.body as BodyInit,
      signal: AbortSignal.timeout(deps.pushTimeoutMs ?? 10_000)
    });
  } catch {
    // Encryption failure (a bad key) or an unreachable push service. No detail kept.
    await recordFailure();
    return 'failed';
  }

  const status = response.status;
  if (status >= 200 && status < 300) {
    try {
      await store.markSubscriptionSuccess(subscriptionId!, claim.userId, (deps.now?.() ?? new Date()).toISOString());
    } catch {
      totals.recordErrors++;
    }
    return 'sent';
  }
  if (status === 404 || status === 410) {
    // The browser unsubscribed or the push service expired it. It can never work again.
    try {
      await store.deleteSubscription(subscriptionId!, claim.userId);
      totals.subscriptionsRemoved++;
    } catch {
      totals.recordErrors++;
    }
    return 'gone';
  }
  await recordFailure();
  return 'failed';
}

async function processClaim(deps: SendNudgesDeps, claim: ClaimedNudge, totals: BatchTotals): Promise<void> {
  const { store } = deps;

  // Tasks that cannot be loaded are NOT "no eligible task": nothing is sent,
  // because the no-task copy would tell the user something untrue. The claim
  // is closed as failed and the run moves on to the next user.
  let task: NudgeTaskRow | null;
  try {
    task = selectNudgeTask(await store.loadTasks(claim.userId, claim.localDate), claim.localDate);
  } catch {
    return finish(deps, claim, { status: 'failed', devicesAttempted: 0, devicesSucceeded: 0, taskId: null }, totals);
  }

  let subscriptions: StoredSubscription[] = [];
  let outcome: Omit<DeliveryOutcome, 'completedAt'>;
  try {
    subscriptions = await store.loadSubscriptions(claim.userId);
  } catch {
    subscriptions = [];
    outcome = { status: 'failed', devicesAttempted: 0, devicesSucceeded: 0, taskId: null };
    return finish(deps, claim, outcome, totals);
  }

  if (subscriptions.length === 0) {
    outcome = { status: 'no_devices', devicesAttempted: 0, devicesSucceeded: 0, taskId: null };
    return finish(deps, claim, outcome, totals);
  }

  const payload = JSON.stringify(buildNudgeNotification(task, claim.showTaskTitles));
  const results = await Promise.all(subscriptions.map((sub) => sendToDevice(deps, claim, sub, payload, totals)));
  const succeeded = results.filter((result) => result === 'sent').length;
  outcome = {
    status: succeeded > 0 ? 'sent' : 'failed',
    devicesAttempted: results.length,
    devicesSucceeded: succeeded,
    // The task the nudge was about. Only its id is stored, never its title.
    taskId: task?.id ?? null
  };
  totals.devicesAttempted += results.length;
  totals.devicesSucceeded += succeeded;
  return finish(deps, claim, outcome, totals);
}

async function finish(
  deps: SendNudgesDeps,
  claim: ClaimedNudge,
  outcome: Omit<DeliveryOutcome, 'completedAt'>,
  totals: BatchTotals
): Promise<void> {
  if (outcome.status === 'sent') totals.sent++;
  else if (outcome.status === 'no_devices') totals.noDevices++;
  else totals.failed++;
  try {
    await deps.store.completeDelivery(claim.deliveryId, { ...outcome, completedAt: (deps.now?.() ?? new Date()).toISOString() });
  } catch {
    totals.recordErrors++;
  }
}

/** Claims and sends every nudge due now. Never throws once the claim succeeded. */
export async function runNudgeBatch(deps: SendNudgesDeps, limit: number): Promise<BatchTotals> {
  const rows = await deps.store.claimDueNudges(limit);
  const totals: BatchTotals = {
    claimed: rows.length,
    sent: 0,
    noDevices: 0,
    failed: 0,
    skipped: 0,
    devicesAttempted: 0,
    devicesSucceeded: 0,
    subscriptionsRemoved: 0,
    recordErrors: 0
  };

  const claims: ClaimedNudge[] = [];
  for (const row of rows) {
    const claim = parseClaim(row);
    if (claim) {
      claims.push(claim);
      continue;
    }
    // Never expected. Nothing is sent for it; if its delivery row can be
    // identified it is closed as failed rather than left hanging.
    totals.skipped++;
    const deliveryId = (row as { delivery_id?: unknown } | null)?.delivery_id;
    if (typeof deliveryId === 'string' && UUID.test(deliveryId)) {
      try {
        await deps.store.completeDelivery(deliveryId, {
          status: 'failed',
          devicesAttempted: 0,
          devicesSucceeded: 0,
          taskId: null,
          completedAt: (deps.now?.() ?? new Date()).toISOString()
        });
      } catch {
        totals.recordErrors++;
      }
    }
  }

  const workers = Math.max(1, Math.min(deps.concurrency ?? 4, claims.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      while (next < claims.length) {
        const claim = claims[next++];
        try {
          await processClaim(deps, claim, totals);
        } catch {
          // Unexpected: close this claim as failed and carry on with the rest.
          await finish(deps, claim, { status: 'failed', devicesAttempted: 0, devicesSucceeded: 0, taskId: null }, totals);
        }
      }
    })
  );
  return totals;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/** Equal-length comparison without an early exit. */
export function secretsMatch(expected: string, given: string | null): boolean {
  if (!given) return false;
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(given);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  const match = header ? /^Bearer\s+(\S+)$/i.exec(header.trim()) : null;
  return match ? match[1] : null;
}

/** Empty, or {"limit": 1..200}. Anything else is refused. */
export function parseRunOptions(raw: string): { limit: number } | null {
  if (raw.trim() === '') return { limit: DEFAULT_CLAIM_LIMIT };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const keys = Object.keys(parsed);
  if (keys.some((key) => key !== 'limit')) return null;
  const limit = (parsed as { limit?: unknown }).limit;
  if (limit === undefined) return { limit: DEFAULT_CLAIM_LIMIT };
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > DEFAULT_CLAIM_LIMIT) return null;
  return { limit };
}

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function handleSendNudgesRequest(request: Request, deps: SendNudgesDeps): Promise<Response> {
  const log = deps.log ?? (() => {});
  const done = (status: number, outcome: string, extra: Partial<BatchTotals> = {}) => {
    log({ status, outcome, claimed: extra.claimed, sent: extra.sent, noDevices: extra.noDevices, failed: extra.failed });
    return reply(status, { outcome, ...extra });
  };

  if (request.method !== 'POST') return done(405, 'method_not_allowed');
  // Fail closed: without the key to compare against, nobody is let in.
  if (!deps.serviceRoleKey || deps.serviceRoleKey.trim() === '') return done(503, 'disabled');
  if (!secretsMatch(deps.serviceRoleKey, bearer(request))) return done(401, 'unauthorized');
  // Checked before claiming, so a broken configuration uses up nobody's nudge.
  if (!deps.configured) return done(503, 'not_configured');

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) return done(413, 'too_large');
  const options = parseRunOptions(raw);
  if (!options) return done(400, 'invalid_request');

  let totals: BatchTotals;
  try {
    totals = await runNudgeBatch(deps, options.limit);
  } catch {
    // Only the claim itself can land here, and a failed claim sent nothing.
    return done(500, 'claim_failed');
  }
  return done(200, 'done', totals);
}
