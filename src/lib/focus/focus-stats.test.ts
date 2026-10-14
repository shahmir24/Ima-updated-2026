import { describe, expect, it, vi } from 'vitest';
import { fetchAllFocusStatsRows, summarizeFocusSessions, type FocusStatsRow } from './focus-stats';

const row = (status: string, focus_seconds: number | null): FocusStatsRow => ({ status, focus_seconds });

describe('summarizeFocusSessions', () => {
  it('counts completed and abandoned separately with their own focus minutes', () => {
    const summary = summarizeFocusSessions([row('completed', 1500), row('completed', 3000), row('abandoned', 600), row('abandoned', 0)]);
    expect(summary.completed).toEqual({ sessions: 2, focusMinutes: 75 });
    expect(summary.abandoned).toEqual({ sessions: 2, focusMinutes: 10 });
    expect(summary.endedSessions).toBe(4);
  });

  it('completion rate = completed / (completed + abandoned) * 100, rounded', () => {
    expect(summarizeFocusSessions([row('completed', 60), row('completed', 60), row('abandoned', 60)]).completionRate).toBe(67);
    expect(summarizeFocusSessions([row('completed', 60)]).completionRate).toBe(100);
    expect(summarizeFocusSessions([row('abandoned', 60)]).completionRate).toBe(0);
  });

  it('active sessions are excluded from every number, including the rate', () => {
    const summary = summarizeFocusSessions([row('completed', 600), row('active', 9999), row('active', 1)]);
    expect(summary.completed.sessions).toBe(1);
    expect(summary.abandoned.sessions).toBe(0);
    expect(summary.endedSessions).toBe(1);
    expect(summary.completionRate).toBe(100);
  });

  it('zero sessions: no rate rather than a division by zero', () => {
    expect(summarizeFocusSessions([])).toEqual({
      completed: { sessions: 0, focusMinutes: 0 },
      abandoned: { sessions: 0, focusMinutes: 0 },
      endedSessions: 0,
      completionRate: null
    });
    expect(summarizeFocusSessions([row('active', 100)]).completionRate).toBeNull();
  });

  it('sums seconds before converting, so short sessions are not rounded away', () => {
    expect(summarizeFocusSessions([row('completed', 30), row('completed', 30)]).completed.focusMinutes).toBe(1);
  });

  it('missing or invalid focus_seconds count as zero, never as negative time', () => {
    expect(summarizeFocusSessions([row('completed', null), row('completed', -50), row('completed', Number.NaN)]).completed).toEqual({
      sessions: 3,
      focusMinutes: 0
    });
  });
});

describe('fetchAllFocusStatsRows', () => {
  it('reads every page past the 1000-row default limit', async () => {
    const all = Array.from({ length: 2345 }, (_, i) => row(i % 3 === 0 ? 'abandoned' : 'completed', 60));
    const fetchPage = vi.fn(async (from: number, to: number) => all.slice(from, to + 1));
    const rows = await fetchAllFocusStatsRows(fetchPage);
    expect(rows).toHaveLength(2345);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999]
    ]);
    expect(summarizeFocusSessions(rows).endedSessions).toBe(2345);
  });

  it('an exact multiple of the page size ends on the empty page', async () => {
    const all = Array.from({ length: 4 }, () => row('completed', 1));
    const fetchPage = vi.fn(async (from: number, to: number) => all.slice(from, to + 1));
    expect(await fetchAllFocusStatsRows(fetchPage, 2)).toHaveLength(4);
    expect(fetchPage).toHaveBeenCalledTimes(3);
  });

  it('a failed page fails the whole read (no partial totals)', async () => {
    await expect(fetchAllFocusStatsRows(async () => Promise.reject(new Error('offline')))).rejects.toThrow('offline');
  });
});
