import { format } from 'date-fns';
import type { TaskFormInput } from '@/components/tasks/MeetingModal';
import type { TaskImportance } from '@/hooks/use-tasks';
import { toClockTime } from '@/lib/ai/organize-contract';

/**
 * What the form submits. A time belongs to a day, so an unscheduled ("Later")
 * task never carries one; any exact minute is kept as 'HH:MM'.
 */
export function buildTaskFormInput(input: {
  title: string;
  date: Date | null;
  time: string | null;
  importance: TaskImportance;
}): TaskFormInput {
  return {
    title: input.title,
    // Local date, not toISOString(): that converts to UTC and can shift the
    // task to the previous or next day depending on the timezone.
    scheduled_date: input.date ? format(input.date, 'yyyy-MM-dd') : null,
    start_time: input.date ? toClockTime(input.time) : null,
    importance: input.importance
  };
}
