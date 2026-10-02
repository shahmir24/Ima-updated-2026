/**
 * The sender's database access, over PostgREST with plain fetch — the same
 * dependency-free style as _shared/auth.ts, so it type-checks and is unit
 * tested outside Deno.
 *
 * It runs with the SERVICE ROLE key, which bypasses RLS. That is why it is
 * this narrow: one RPC (claim_due_nudges), a read of one user's open tasks and
 * devices, and updates/deletes that always name both the row id AND the user
 * id. Every id and date is validated before it reaches a URL. Errors are thrown
 * without the response body, so nothing from the database reaches a log.
 */
import type { DeliveryOutcome, NudgeStore, NudgeTaskRow, StoredSubscription } from './handler.ts';

export interface PostgrestStoreConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  /** The claim window passed to claim_due_nudges(). */
  windowMinutes?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Ranking reads every eligible task; this only bounds a pathological account. */
export const MAX_TASKS_PER_USER = 1000;
/** Devices per user per nudge. Newest first. */
export const MAX_DEVICES_PER_USER = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function uuid(value: string): string {
  if (!UUID.test(value)) throw new Error('invalid id');
  return value;
}

export class StoreError extends Error {
  constructor(
    readonly operation: string,
    readonly status?: number
  ) {
    super(`store ${operation} failed${status ? ` (${status})` : ''}`);
  }
}

export function createPostgrestNudgeStore(config: PostgrestStoreConfig): NudgeStore {
  const fetchImpl = config.fetchImpl ?? fetch;
  const base = `${config.supabaseUrl.replace(/\/+$/, '')}/rest/v1`;
  const windowMinutes = config.windowMinutes ?? 120;

  async function call(operation: string, path: string, init: { method: string; body?: unknown; prefer?: string }): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(`${base}${path}`, {
        method: init.method,
        headers: {
          apikey: config.serviceRoleKey,
          Authorization: `Bearer ${config.serviceRoleKey}`,
          'Content-Type': 'application/json',
          ...(init.prefer ? { Prefer: init.prefer } : {})
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 15_000)
      });
    } catch {
      throw new StoreError(operation);
    }
    if (!response.ok) throw new StoreError(operation, response.status);
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new StoreError(operation);
    }
  }

  const asArray = (operation: string, value: unknown): unknown[] => {
    if (!Array.isArray(value)) throw new StoreError(operation);
    return value;
  };

  return {
    async claimDueNudges(limit) {
      const rows = await call('claim', '/rpc/claim_due_nudges', {
        method: 'POST',
        // p_now is left to the database clock: it exists only for SQL tests.
        body: { p_limit: limit, p_window_minutes: windowMinutes }
      });
      return asArray('claim', rows);
    },

    async loadTasks(userId, localDate) {
      if (!ISO_DATE.test(localDate)) throw new StoreError('tasks');
      const query = new URLSearchParams({
        select: 'id,title,scheduled_date,created_at,completed,importance',
        user_id: `eq.${uuid(userId)}`,
        completed: 'is.false',
        scheduled_date: `lte.${localDate}`,
        // Newest plan first, so a cap could only ever cut the oldest backlog.
        order: 'scheduled_date.desc,created_at.asc',
        limit: String(MAX_TASKS_PER_USER)
      });
      return asArray('tasks', await call('tasks', `/tasks?${query}`, { method: 'GET' })) as NudgeTaskRow[];
    },

    async loadSubscriptions(userId) {
      const query = new URLSearchParams({
        select: 'id,endpoint,p256dh,auth,failure_count',
        user_id: `eq.${uuid(userId)}`,
        order: 'updated_at.desc',
        limit: String(MAX_DEVICES_PER_USER)
      });
      return asArray('devices', await call('devices', `/push_subscriptions?${query}`, { method: 'GET' })) as StoredSubscription[];
    },

    async markSubscriptionSuccess(subscriptionId, userId, at) {
      const query = new URLSearchParams({ id: `eq.${uuid(subscriptionId)}`, user_id: `eq.${uuid(userId)}` });
      await call('device-success', `/push_subscriptions?${query}`, {
        method: 'PATCH',
        body: { last_success_at: at, failure_count: 0 },
        prefer: 'return=minimal'
      });
    },

    async markSubscriptionFailure(subscriptionId, userId, failureCount) {
      const query = new URLSearchParams({ id: `eq.${uuid(subscriptionId)}`, user_id: `eq.${uuid(userId)}` });
      await call('device-failure', `/push_subscriptions?${query}`, {
        method: 'PATCH',
        body: { failure_count: failureCount },
        prefer: 'return=minimal'
      });
    },

    async deleteSubscription(subscriptionId, userId) {
      const query = new URLSearchParams({ id: `eq.${uuid(subscriptionId)}`, user_id: `eq.${uuid(userId)}` });
      await call('device-delete', `/push_subscriptions?${query}`, { method: 'DELETE', prefer: 'return=minimal' });
    },

    async completeDelivery(deliveryId, outcome: DeliveryOutcome) {
      // Only a 'claimed' row moves, so a finished delivery is never rewritten.
      const query = new URLSearchParams({ id: `eq.${uuid(deliveryId)}`, status: 'eq.claimed', select: 'id' });
      const rows = await call('delivery', `/nudge_deliveries?${query}`, {
        method: 'PATCH',
        body: {
          status: outcome.status,
          devices_attempted: outcome.devicesAttempted,
          devices_succeeded: outcome.devicesSucceeded,
          task_id: outcome.taskId === null ? null : uuid(outcome.taskId),
          completed_at: outcome.completedAt
        },
        prefer: 'return=representation'
      });
      if (!Array.isArray(rows) || rows.length !== 1) throw new StoreError('delivery');
    }
  };
}
