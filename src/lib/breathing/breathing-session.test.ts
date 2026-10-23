import { describe, expect, it } from 'vitest';
import { BREATHING_CYCLE_TARGET, breathingProgress, isBreathingComplete, nextCycleCount } from './breathing-session';

describe('a breathing session is five full cycles', () => {
  it('the target is five', () => {
    expect(BREATHING_CYCLE_TARGET).toBe(5);
  });

  it('before starting: "Cycle 1 of 5", first dot outlined, the rest unfilled', () => {
    expect(breathingProgress(0)).toEqual({
      completed: 0,
      current: 1,
      target: 5,
      complete: false,
      label: 'Cycle 1 of 5',
      dots: ['current', 'todo', 'todo', 'todo', 'todo']
    });
  });

  it('"Cycle 3 of 5" means the third cycle is under way: two filled, the third outlined', () => {
    const progress = breathingProgress(2);
    expect(progress.label).toBe('Cycle 3 of 5');
    expect(progress.dots).toEqual(['done', 'done', 'current', 'todo', 'todo']);
  });

  it('dots progress one at a time through all five cycles', () => {
    const labels = [0, 1, 2, 3, 4].map((n) => breathingProgress(n).label);
    expect(labels).toEqual(['Cycle 1 of 5', 'Cycle 2 of 5', 'Cycle 3 of 5', 'Cycle 4 of 5', 'Cycle 5 of 5']);
    for (let n = 0; n < 5; n++) {
      const dots = breathingProgress(n).dots;
      expect(dots.filter((d) => d === 'done')).toHaveLength(n);
      expect(dots.filter((d) => d === 'current')).toHaveLength(1);
    }
  });

  it('after the fifth: complete, every dot filled, still "Cycle 5 of 5"', () => {
    const progress = breathingProgress(5);
    expect(progress.complete).toBe(true);
    expect(progress.label).toBe('Cycle 5 of 5');
    expect(progress.dots).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('never reads "Cycle 6 of 5", whatever it is given', () => {
    for (const n of [5, 6, 50, Number.POSITIVE_INFINITY]) expect(breathingProgress(n).label).toBe('Cycle 5 of 5');
    for (const n of [-1, Number.NaN]) expect(breathingProgress(n).label).toBe('Cycle 1 of 5');
  });

  it('counting never goes past five, so there is no sixth cycle', () => {
    let cycles = 0;
    for (let i = 0; i < 9; i++) cycles = nextCycleCount(cycles);
    expect(cycles).toBe(5);
    expect(isBreathingComplete(4)).toBe(false);
    expect(isBreathingComplete(5)).toBe(true);
  });
});
