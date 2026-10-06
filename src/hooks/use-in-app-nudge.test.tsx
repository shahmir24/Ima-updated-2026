import React from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NUDGE_DISMISSALS_STORAGE_KEY, _resetNudgeDismissalMemory, type NudgeTask } from '@/lib/nudges/in-app-nudge';
import { useInAppNudge, type InAppNudgeState } from './use-in-app-nudge';

const TODAY = '2026-10-06';
const TASKS: NudgeTask[] = [
  { id: 'task-1', title: 'Email the landlord', scheduled_date: TODAY, created_at: '2026-10-01T09:00:00Z', completed: false, importance: 'normal' }
];

let session: Map<string, string>;

beforeEach(() => {
  _resetNudgeDismissalMemory();
  session = new Map();
  vi.stubGlobal('window', {
    sessionStorage: { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => void session.set(k, v) }
  });
});
afterEach(() => vi.unstubAllGlobals());

/** One mount of the hook, as Home would mount it. */
function mount(overrides: Partial<Parameters<typeof useInAppNudge<NudgeTask>>[0]> = {}): InAppNudgeState {
  let captured: InAppNudgeState | undefined;
  const Probe = () => {
    captured = useInAppNudge<NudgeTask>({
      signedIn: true,
      settings: { nudges_enabled: true, nudge_show_task_titles: true },
      tasksReady: true,
      tasks: TASKS,
      today: TODAY,
      ...overrides
    });
    return null;
  };
  renderToString(<Probe />);
  return captured!;
}

describe('useInAppNudge', () => {
  it('shows the nudge for an eligible signed-in user', () => {
    expect(mount().nudge).toMatchObject({ variant: 'recommended', taskId: 'task-1' });
  });

  it('is hidden for a guest and when nudges are off', () => {
    expect(mount({ signedIn: false }).nudge).toBeNull();
    expect(mount({ settings: { nudges_enabled: false, nudge_show_task_titles: true } }).nudge).toBeNull();
  });

  it('× remembers the dismissal for the session: the next mount (or reload) shows nothing', () => {
    mount().dismiss();
    expect(JSON.parse(session.get(NUDGE_DISMISSALS_STORAGE_KEY)!)).toEqual([`${TODAY}:task-1`]);
    expect(mount().nudge).toBeNull();
  });

  it('Start returns Focus with the selected task, and the nudge does not come straight back', () => {
    expect(mount().act('start')).toBe('/focus?task=task-1');
    expect(mount().nudge).toBeNull();
  });

  it('I’m stuck returns Body Double with the selected task, and the nudge does not come straight back', () => {
    expect(mount().act('stuck')).toBe('/body-double?task=task-1');
    expect(mount().nudge).toBeNull();
  });

  it('See what’s next (titles hidden) returns the task list', () => {
    const state = mount({ settings: { nudges_enabled: true, nudge_show_task_titles: false } });
    expect(state.nudge?.variant).toBe('generic');
    expect(state.act('see-next')).toBe('/tasks');
  });

  it('nothing to act on → no path, nothing stored', () => {
    const state = mount({ tasks: [] });
    expect(state.act('start')).toBeNull();
    state.dismiss();
    expect(session.size).toBe(0);
  });

  it('a dismissal survives without sessionStorage, for this page load', () => {
    vi.stubGlobal('window', {
      get sessionStorage(): Storage {
        throw new Error('blocked');
      }
    });
    mount().dismiss();
    expect(mount().nudge).toBeNull();
  });
});
