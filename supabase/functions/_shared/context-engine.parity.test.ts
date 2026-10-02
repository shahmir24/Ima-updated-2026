import { describe, expect, it } from 'vitest';
import { rankTasks as appRank, type ContextTask } from '../../../src/lib/context-engine';
import { rankTasks as serverRank } from './context-engine';

/**
 * The sender must point at the same task the app's Right Now card shows. The
 * app's Context Engine is the authority; this proves the server copy ranks
 * identically — same tasks, same order, same reasons — for fixed cases and for
 * thousands of generated ones.
 */

const ids = (ranked: { task: ContextTask }[]) => ranked.map((entry) => entry.task.id);
const both = (tasks: ContextTask[], today: string) => {
  const app = appRank(tasks, { today });
  const server = serverRank(tasks, { today });
  return { app, server };
};

const task = (id: string, scheduled_date: string, extra: Partial<ContextTask> = {}): ContextTask => ({
  id,
  scheduled_date,
  created_at: '2026-09-01T10:00:00Z',
  completed: false,
  importance: 'normal',
  ...extra
});

describe('Context Engine parity — named behaviours', () => {
  const TODAY = '2026-10-02';
  const cases: [string, ContextTask[], string[]][] = [
    ['today before overdue', [task('a', '2026-09-30'), task('b', TODAY)], ['b', 'a']],
    ['importance inside today', [task('a', TODAY, { importance: 'low' }), task('b', TODAY, { importance: 'high' }), task('c', TODAY)], ['b', 'c', 'a']],
    ['older first at equal importance', [task('a', TODAY, { created_at: '2026-09-02T00:00:00Z' }), task('b', TODAY, { created_at: '2026-09-01T00:00:00Z' })], ['b', 'a']],
    ['id breaks a full tie', [task('b', TODAY), task('a', TODAY)], ['a', 'b']],
    ['future and completed are excluded', [task('a', '2026-10-03'), task('b', TODAY, { completed: true }), task('c', TODAY)], ['c']],
    ['7 days overdue is recent, 8 is long', [task('long', '2026-09-24'), task('recent', '2026-09-25')], ['recent', 'long']],
    ['long-overdue high is promoted to recent, not today', [task('t', TODAY), task('hi', '2026-08-01', { importance: 'high' }), task('r', '2026-09-30')], ['t', 'hi', 'r']],
    ['unknown importance reads as normal', [task('a', TODAY, { importance: 'urgent' }), task('b', TODAY, { importance: 'low' })], ['a', 'b']],
    ['unreadable dates are excluded', [task('a', '2026-02-30'), task('b', 'soon'), task('c', TODAY)], ['c']]
  ];

  it.each(cases)('%s', (_label, tasks, expected) => {
    const { app, server } = both(tasks, TODAY);
    expect(ids(app)).toEqual(expected);
    expect(server).toEqual(app);
  });

  it('long-overdue rotation follows the day, inside each importance tier', () => {
    const backlog = ['a', 'b', 'c', 'd'].map((id, i) =>
      task(id, '2026-08-01', { created_at: `2026-07-0${i + 1}T00:00:00Z`, importance: i === 3 ? 'low' : 'normal' })
    );
    for (const today of ['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) {
      const { app, server } = both(backlog, today);
      expect(server).toEqual(app);
      expect(ids(server).at(-1)).toBe('d'); // low never precedes normal
    }
    expect(ids(serverRank(backlog, { today: '2026-10-02' }))[0]).not.toBe(ids(serverRank(backlog, { today: '2026-10-03' }))[0]);
  });

  it('an unreadable "today" ranks nothing, in both', () => {
    for (const today of ['', '2026-13-01', 'today']) {
      const { app, server } = both([task('a', '2026-10-01')], today);
      expect(app).toEqual([]);
      expect(server).toEqual([]);
    }
  });

  it('timestamps at mixed precision and offset order the same way', () => {
    const tasks = [
      task('a', TODAY, { created_at: '2026-09-01T00:00:00.5+00:00' }),
      task('b', TODAY, { created_at: '2026-09-01T00:00:00Z' }),
      task('c', TODAY, { created_at: 'not a time' }),
      task('d', TODAY, { created_at: '2026-09-01T01:00:00+02:00' })
    ];
    const { app, server } = both(tasks, TODAY);
    expect(server).toEqual(app);
  });
});

describe('Context Engine parity — generated task sets', () => {
  // A small deterministic PRNG, so a failure is reproducible from its seed.
  const mulberry32 = (seed: number) => () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pad = (n: number) => String(n).padStart(2, '0');
  const dayOffset = (base: string, offset: number) => {
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + offset);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  it('ranks 3,000 random task sets identically', () => {
    const random = mulberry32(20261002);
    const pick = <T,>(items: T[]) => items[Math.floor(random() * items.length)];
    const todays = ['2026-10-02', '2024-02-29', '2026-01-01', '2026-12-31', '2027-03-28'];
    for (let round = 0; round < 3000; round++) {
      const today = pick(todays);
      const count = Math.floor(random() * 14);
      const tasks: ContextTask[] = Array.from({ length: count }, (_, i) => ({
        id: `${pick(['a', 'b', 'c', 'd', 'e'])}${i}`,
        scheduled_date: random() < 0.04 ? pick(['2026-02-30', '', 'x']) : dayOffset(today, -Math.floor(random() * 20) + 2),
        created_at: random() < 0.05 ? 'garbage' : `2026-0${1 + Math.floor(random() * 9)}-1${Math.floor(random() * 9)}T0${Math.floor(random() * 9)}:00:00${pick(['Z', '.5Z', '+01:00'])}`,
        completed: random() < 0.2,
        importance: pick(['low', 'normal', 'high', 'high', undefined, 'weird', null])
      }));
      const { app, server } = both(tasks, today);
      expect(server, `round ${round}`).toEqual(app);
    }
  });
});
