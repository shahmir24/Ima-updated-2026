import { describe, expect, it, vi } from 'vitest';
import type { NewTaskInput } from '@/hooks/use-tasks';
import { importGuestTasks, offeredForImport, toImportInput } from './guest-import';
import { createGuestTaskStore } from './guest-task-store';

const TODAY = '2026-09-25';

function storeWithTasks() {
  const store = createGuestTaskStore({ storage: () => null });
  const a = store.create({
    title: 'Write intro',
    description: 'first draft',
    tag: 'flow',
    scheduled_date: '2026-09-20',
    start_time: '09:30',
    end_time: '10:15',
    importance: 'high'
  });
  const b = store.create({ title: 'Email Sam', scheduled_date: TODAY, importance: 'low' });
  const done = store.create({ title: 'Already done', scheduled_date: TODAY });
  store.toggleCompleted(done.id);
  const c = store.create({ title: 'Book dentist', scheduled_date: TODAY });
  return { store, a, b, c, done };
}

describe('what is offered', () => {
  it('offers only unfinished guest tasks', () => {
    const { store } = storeWithTasks();
    expect(offeredForImport(store.list()).map((t) => t.title).sort()).toEqual(['Book dentist', 'Email Sam', 'Write intro']);
  });

  it('carries exactly title, description, tag, date, times and importance — no ids, owner or completion', () => {
    const { a } = storeWithTasks();
    const input = toImportInput(a);
    expect(input).toEqual({
      title: 'Write intro',
      description: 'first draft',
      tag: 'flow',
      scheduled_date: '2026-09-20',
      start_time: '09:30:00',
      end_time: '10:15:00',
      importance: 'high'
    });
    for (const key of ['id', 'user_id', 'completed', 'completed_at', 'created_at', 'updated_at']) {
      expect(input).not.toHaveProperty(key);
    }
    expect(JSON.stringify(input)).not.toContain('guest');
  });
});

describe('importGuestTasks', () => {
  it('creates each unfinished task through the given create, then clears the whole store', async () => {
    const { store } = storeWithTasks();
    const create = vi.fn(async (input: NewTaskInput) => ({ id: 'db-id', ...input }));

    const result = await importGuestTasks(store, create);

    expect(result).toEqual({ imported: 3, failed: 0, error: null });
    expect(create.mock.calls.map(([input]) => input.title).sort()).toEqual(['Book dentist', 'Email Sam', 'Write intro']);
    // The completed task was never sent, and is gone with the rest.
    expect(create.mock.calls.some(([input]) => input.title === 'Already done')).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it('keeps the original dates, overdue ones included', async () => {
    const { store } = storeWithTasks();
    const create = vi.fn(async (_input: NewTaskInput) => undefined);
    await importGuestTasks(store, create);
    expect(create.mock.calls.map(([input]) => input.scheduled_date).sort()).toEqual([
      '2026-09-20',
      TODAY,
      TODAY
    ]);
  });

  it('partial failure: keeps what failed, drops what succeeded, and a retry cannot duplicate', async () => {
    const { store } = storeWithTasks();
    const created: string[] = [];
    const flaky = vi.fn(async (input: NewTaskInput) => {
      if (input.title === 'Email Sam') throw new Error('network down');
      created.push(input.title);
    });

    const first = await importGuestTasks(store, flaky);
    expect(first.imported).toBe(2);
    expect(first.failed).toBe(1);
    expect(first.error?.message).toBe('network down');
    // Not cleared: the failed task (and the completed one) are still there.
    expect(offeredForImport(store.list()).map((t) => t.title)).toEqual(['Email Sam']);
    expect(store.list().some((t) => t.title === 'Already done')).toBe(true);

    const working = vi.fn(async (input: NewTaskInput) => {
      created.push(input.title);
    });
    const retry = await importGuestTasks(store, working);
    expect(retry).toEqual({ imported: 1, failed: 0, error: null });
    expect(working).toHaveBeenCalledTimes(1);

    // Every task exactly once across both attempts.
    expect(created.sort()).toEqual(['Book dentist', 'Email Sam', 'Write intro']);
    expect(store.list()).toEqual([]);
  });

  it('total failure leaves the guest store exactly as it was', async () => {
    const { store } = storeWithTasks();
    const before = store.list();
    const result = await importGuestTasks(store, async () => {
      throw new Error('offline');
    });
    expect(result.imported).toBe(0);
    expect(result.failed).toBe(3);
    expect(store.list()).toEqual(before);
  });
});
