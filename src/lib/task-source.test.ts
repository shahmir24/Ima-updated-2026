import { describe, expect, it, vi } from 'vitest';
import {
  composeTaskSource,
  refuseGuestIds,
  selectTaskSourceMode,
  type TaskAction,
  type TaskSourceBackend
} from './task-source';

const REAL_ID = '3f1c1b0e-8d3a-4e8b-9a47-2b1f0c9d7e61';
const GUEST_ID = 'guest_abc';

const action = <I, O>(result: O, extra: Partial<TaskAction<I, O>> = {}): TaskAction<I, O> & { run: ReturnType<typeof vi.fn> } => ({
  run: vi.fn(async () => result),
  isPending: false,
  error: null,
  ...extra
}) as TaskAction<I, O> & { run: ReturnType<typeof vi.fn> };

const row = (id: string, completed = false) =>
  ({
    id,
    user_id: 'u',
    title: id,
    description: null,
    tag: 'focus',
    scheduled_date: '2026-09-25',
    start_time: null,
    end_time: null,
    importance: 'normal',
    completed,
    completed_at: completed ? '2026-09-25T00:00:00.000Z' : null,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z'
  });

function backend(label: string): TaskSourceBackend<{ title: string; scheduled_date: string }> {
  return {
    tasks: [row(`${label}-task`)],
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    create: action(row(`${label}-created`)),
    update: action(row(`${label}-updated`)),
    toggle: action(row(`${label}-toggled`)),
    remove: action(undefined)
  };
}

describe('selectTaskSourceMode', () => {
  it('always picks Supabase for a signed-in user, even where guests are allowed', () => {
    for (const authLoading of [true, false]) {
      for (const guestStoreOffered of [true, false]) {
        expect(selectTaskSourceMode({ signedIn: true, authLoading, guestStoreOffered })).toBe('authenticated');
      }
    }
  });

  it('picks the guest store only when offered AND auth has settled', () => {
    expect(selectTaskSourceMode({ signedIn: false, authLoading: false, guestStoreOffered: true })).toBe('guest');
    expect(selectTaskSourceMode({ signedIn: false, authLoading: true, guestStoreOffered: true })).toBe('signed-out');
  });

  it('keeps today\'s signed-out behaviour wherever Guest Mode is not offered', () => {
    expect(selectTaskSourceMode({ signedIn: false, authLoading: false, guestStoreOffered: false })).toBe('signed-out');
    expect(selectTaskSourceMode({ signedIn: false, authLoading: true, guestStoreOffered: false })).toBe('signed-out');
  });
});

describe('composeTaskSource', () => {
  it('guest mode uses only the guest backend; no Supabase action is ever run', async () => {
    const supabase = backend('supabase');
    const guest = backend('guest');
    const source = composeTaskSource('guest', { supabase, guest });

    expect(source.mode).toBe('guest');
    expect(source.tasks).toBe(guest.tasks);

    await source.create.run({ title: 'x', scheduled_date: '2026-09-25' });
    await source.update.run({ id: GUEST_ID, changes: { title: 'y' } });
    await source.toggle.run(row(GUEST_ID));
    await source.remove.run(GUEST_ID);
    source.refetch();

    for (const name of ['create', 'update', 'toggle', 'remove'] as const) {
      expect(supabase[name].run).not.toHaveBeenCalled();
      expect(guest[name].run).toHaveBeenCalledTimes(1);
    }
    expect(supabase.refetch).not.toHaveBeenCalled();
  });

  it.each(['authenticated', 'signed-out'] as const)(
    '%s mode passes everything straight through to Supabase',
    async (mode) => {
      const supabase = backend('supabase');
      const guest = backend('guest');
      supabase.isPending = true;
      supabase.update.isPending = true;
      supabase.remove.error = new Error('boom');
      const source = composeTaskSource(mode, { supabase, guest });

      expect(source.mode).toBe(mode);
      expect(source.tasks).toBe(supabase.tasks);
      expect(source.isPending).toBe(true);
      expect(source.update.isPending).toBe(true);
      expect(source.remove.error?.message).toBe('boom');

      const input = { title: 'x', scheduled_date: '2026-09-25' };
      const task = row(REAL_ID);
      await expect(source.create.run(input)).resolves.toEqual(row('supabase-created'));
      await source.update.run({ id: REAL_ID, changes: { title: 'y' } });
      await source.toggle.run(task);
      await source.remove.run(REAL_ID);

      expect(supabase.create.run).toHaveBeenCalledWith(input);
      expect(supabase.update.run).toHaveBeenCalledWith({ id: REAL_ID, changes: { title: 'y' } });
      expect(supabase.toggle.run).toHaveBeenCalledWith(task);
      expect(supabase.remove.run).toHaveBeenCalledWith(REAL_ID);
      for (const name of ['create', 'update', 'toggle', 'remove'] as const) {
        expect(guest[name].run).not.toHaveBeenCalled();
      }
    }
  );
});

describe('refuseGuestIds', () => {
  it('refuses a guest id before Supabase is called, and passes real ids through', async () => {
    const supabase = backend('supabase');
    const guarded = refuseGuestIds(supabase);

    await expect(guarded.update.run({ id: GUEST_ID, changes: {} })).rejects.toThrow();
    await expect(guarded.toggle.run(row(GUEST_ID))).rejects.toThrow();
    await expect(guarded.remove.run(GUEST_ID)).rejects.toThrow();
    expect(supabase.update.run).not.toHaveBeenCalled();
    expect(supabase.toggle.run).not.toHaveBeenCalled();
    expect(supabase.remove.run).not.toHaveBeenCalled();

    await guarded.remove.run(REAL_ID);
    expect(supabase.remove.run).toHaveBeenCalledWith(REAL_ID);
  });
});
