import { describe, expect, it } from 'vitest';
import { daysOverdue, isEligible, rankTasks, type ContextTask } from '@/lib/context-engine';
import { rankTasks as serverRank } from '../../../supabase/functions/_shared/context-engine';
import { selectInAppNudge } from '@/lib/nudges/in-app-nudge';

const TODAY = '2026-10-06';
const task = (id: string, scheduled_date: string | null, extra: Partial<ContextTask> = {}): ContextTask => ({
  id,
  scheduled_date,
  created_at: '2026-10-01T09:00:00Z',
  completed: false,
  importance: 'normal',
  ...extra
});
const ids = (tasks: ContextTask[]) => rankTasks(tasks, { today: TODAY }).map((entry) => entry.task.id);

describe('Context Engine — unscheduled ("Later") tasks never enter Right Now', () => {
  it('an unscheduled task is excluded', () => {
    expect(isEligible(task('later', null), TODAY)).toBe(false);
    expect(daysOverdue(null, TODAY)).toBeNull();
    expect(ids([task('later', null)])).toEqual([]);
  });

  it('an unscheduled HIGH-importance task is still excluded', () => {
    expect(ids([task('later-high', null, { importance: 'high' })])).toEqual([]);
  });

  it('a brand-new unscheduled task is excluded, even when it is the newest thing', () => {
    expect(ids([task('old', TODAY, { created_at: '2026-01-01T00:00:00Z' }), task('new-later', null, { created_at: new Date().toISOString() })])).toEqual(['old']);
  });

  it('scheduled tasks rank exactly as before around unscheduled ones', () => {
    const scheduled = [
      task('long', '2026-08-01'),
      task('recent-high', '2026-10-04', { importance: 'high' }),
      task('today-low', TODAY, { importance: 'low' }),
      task('today-high', TODAY, { importance: 'high' }),
      task('future', '2026-10-07'),
      task('done', TODAY, { completed: true })
    ];
    const withLater = [...scheduled, task('later-a', null, { importance: 'high' }), task('later-b', null)];
    expect(ids(withLater)).toEqual(ids(scheduled));
    expect(ids(scheduled)).toEqual(['today-high', 'today-low', 'recent-high', 'long']);
  });

  it('the server copy (gentle-nudge sender) agrees exactly, null dates included', () => {
    const tasks = [task('a', null, { importance: 'high' }), task('b', TODAY), task('c', '2026-10-01'), task('d', null)];
    expect(serverRank(tasks, { today: TODAY })).toEqual(rankTasks(tasks, { today: TODAY }));
  });

  it('the in-app gentle nudge never picks an unscheduled task', () => {
    const nudge = selectInAppNudge({
      signedIn: true,
      settings: { nudges_enabled: true, nudge_show_task_titles: true },
      tasksReady: true,
      tasks: [{ ...task('later', null, { importance: 'high' }), title: 'Research accelerators' }],
      today: TODAY,
      dismissed: new Set()
    });
    expect(nudge).toBeNull();
  });
});
