import React from 'react';
import { renderToString } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import { AuthContext, type AuthContextValue } from '@/contexts/auth-context';
import { createGuestTaskStore } from '@/lib/guest/guest-task-store';
import { importGuestTasks, toImportInput } from '@/lib/guest/guest-import';
import { useCreateTask, type NewTaskInput } from '@/hooks/use-tasks';
import MeetingModal from '@/components/tasks/MeetingModal';

// Records what reaches the tasks insert; nothing leaves the test.
const inserts = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        return { select: () => ({ single: async () => ({ data: { id: 'new', ...row }, error: null }) }) };
      }
    })
  }
}));

const TODAY = '2026-10-06';
const user = { id: '11111111-1111-4111-8111-111111111111' } as User;
const auth: AuthContextValue = {
  session: { user } as Session,
  user,
  onboardingCompleted: true,
  loading: false,
  signOut: async () => {},
  refreshOnboardingStatus: async () => {},
  markOnboardingComplete: () => {}
};

function createTaskFn(): (input: NewTaskInput) => Promise<unknown> {
  let create: ((input: NewTaskInput) => Promise<unknown>) | undefined;
  const Probe = () => {
    create = useCreateTask().mutateAsync;
    return null;
  };
  renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <AuthContext.Provider value={auth}>
        <Probe />
      </AuthContext.Provider>
    </QueryClientProvider>
  );
  return create!;
}

describe('task model — scheduled_date may be null (unscheduled / Later)', () => {
  it('useCreateTask sends scheduled_date null for an unscheduled task, never today', async () => {
    inserts.length = 0;
    await createTaskFn()({ title: 'Research Dubai accelerators', scheduled_date: null, importance: 'normal' });
    expect(inserts[0]).toMatchObject({ title: 'Research Dubai accelerators', scheduled_date: null, start_time: null, importance: 'normal', user_id: user.id });
  });

  it('existing dated creation is unchanged', async () => {
    inserts.length = 0;
    await createTaskFn()({ title: 'Call Ali', scheduled_date: TODAY, start_time: '15:00' });
    expect(inserts[0]).toMatchObject({ scheduled_date: TODAY, start_time: '15:00', importance: 'normal', tag: 'focus' });
  });

  it('guest store: accepts an unscheduled task, keeps dated tasks working, orders Later last', () => {
    const store = createGuestTaskStore({ storage: () => null });
    const later = store.create({ title: 'Buy running shoes', scheduled_date: null });
    const dated = store.create({ title: 'Call Ali', scheduled_date: TODAY });
    expect(later.scheduled_date).toBeNull();
    expect(store.list().map((t) => t.title)).toEqual(['Call Ali', 'Buy running shoes']);
    expect(store.update(dated.id, { scheduled_date: null }).scheduled_date).toBeNull();
    expect(store.update(later.id, { scheduled_date: TODAY }).scheduled_date).toBe(TODAY);
    expect(() => store.create({ title: 'x', scheduled_date: 'tomorrow' })).toThrow();
    expect(() => store.create({ title: 'x', scheduled_date: undefined as unknown as string })).toThrow();
  });

  it('guest import carries an unscheduled task into the account as unscheduled', async () => {
    const store = createGuestTaskStore({ storage: () => null });
    const task = store.create({ title: 'Later thing', scheduled_date: null });
    expect(toImportInput(task).scheduled_date).toBeNull();
    const created: NewTaskInput[] = [];
    await importGuestTasks(store, async (input) => void created.push(input));
    expect(created).toEqual([expect.objectContaining({ title: 'Later thing', scheduled_date: null })]);
  });
});

describe('manual task form — understands unscheduled tasks', () => {
  const row = (scheduled_date: string | null) => ({
    id: 't1', user_id: user.id, title: 'Research', description: null, tag: 'focus', scheduled_date, start_time: null, end_time: null,
    importance: 'normal', completed: false, completed_at: null, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z'
  });

  it('editing an unscheduled task shows Later rather than quietly showing today', () => {
    const html = renderToString(<MeetingModal isOpen task={row(null)} onClose={() => {}} onSubmit={async () => {}} />);
    expect(html).toContain('Edit Task');
    expect(html).toContain('Later');
  });

  it('a new task still starts on today (unchanged create form)', () => {
    const html = renderToString(<MeetingModal isOpen onClose={() => {}} onSubmit={async () => {}} />);
    expect(html).toContain('Create New Task');
    expect(html).not.toContain('>Later<');
  });
});
