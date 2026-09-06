import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';

export type TaskRow = Database['public']['Tables']['tasks']['Row'];

export interface NewTaskInput {
  title: string;
  description?: string | null;
  /** 'flow' | 'break' | 'focus' — the DB CHECK accepts only these. */
  tag?: string;
  /** 'YYYY-MM-DD' */
  scheduled_date: string;
  /** 'HH:MM' */
  start_time?: string | null;
  end_time?: string | null;
}

/**
 * Cache key is per user, so switching accounts cannot show the previous
 * account's tasks from cache. RLS already scopes every query server-side;
 * the explicit .eq('user_id', ...) below is a second, client-side guard.
 */
const tasksKey = (userId: string | null) => ['tasks', userId ?? 'anonymous'] as const;

export function useTasks() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: tasksKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<TaskRow[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*')
        .eq('user_id', userId as string)
        .order('scheduled_date', { ascending: true })
        .order('start_time', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ?? [];
    }
  });
}

function useTasksInvalidator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  return () => queryClient.invalidateQueries({ queryKey: tasksKey(userId) });
}

export function useCreateTask() {
  const { user } = useAuth();
  const invalidate = useTasksInvalidator();

  return useMutation({
    mutationFn: async (input: NewTaskInput): Promise<TaskRow> => {
      if (!user) throw new Error('You must be signed in to create a task.');

      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: user.id,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          tag: input.tag ?? 'focus',
          scheduled_date: input.scheduled_date,
          start_time: input.start_time ?? null,
          end_time: input.end_time ?? null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidate
  });
}

export function useUpdateTask() {
  const { user } = useAuth();
  const invalidate = useTasksInvalidator();

  return useMutation({
    mutationFn: async ({
      id,
      changes
    }: {
      id: string;
      changes: Database['public']['Tables']['tasks']['Update'];
    }): Promise<TaskRow> => {
      if (!user) throw new Error('You must be signed in to update a task.');

      const { data, error } = await supabase
        .from('tasks')
        .update(changes)
        .eq('id', id)
        .eq('user_id', user.id)
        .select()
        .single();

      // .single() surfaces a zero-row update as an error rather than a silent
      // success — the failure mode that made onboarding uncompletable.
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate
  });
}

/**
 * Toggles completion. completed_at has to move with `completed`: the
 * tasks_completed_at_consistent CHECK rejects a timestamp on an open task.
 */
export function useToggleTaskCompleted() {
  const update = useUpdateTask();

  return {
    ...update,
    toggle: (task: TaskRow) =>
      update.mutateAsync({
        id: task.id,
        changes: {
          completed: !task.completed,
          completed_at: task.completed ? null : new Date().toISOString()
        }
      })
  };
}

export function useDeleteTask() {
  const { user } = useAuth();
  const invalidate = useTasksInvalidator();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!user) throw new Error('You must be signed in to delete a task.');

      const { error } = await supabase
        .from('tasks')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: invalidate
  });
}
