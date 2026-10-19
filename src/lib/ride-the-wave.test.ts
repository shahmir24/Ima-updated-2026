import { describe, expect, it } from 'vitest';
import { waveStep, WAVE_START_HEIGHT, type WaveDirection } from './ride-the-wave';

/** Applies inputs from the starting height, the way the page does: one input, one step. */
function ride(inputs: WaveDirection[]) {
  let height = WAVE_START_HEIGHT;
  let cycles = 0;
  for (const input of inputs) {
    const step = waveStep(height, input);
    height = step.height;
    if (step.completesCycle) cycles++;
  }
  return { height, cycles };
}

describe('Ride the Wave — one input, one step', () => {
  it('keeps the original arithmetic: up +10 (max 120), down −15 (min 20)', () => {
    expect(waveStep(50, 'up')).toEqual({ height: 60, completesCycle: false });
    expect(waveStep(115, 'up')).toEqual({ height: 120, completesCycle: false });
    expect(waveStep(50, 'down')).toEqual({ height: 35, completesCycle: false });
    expect(waveStep(25, 'down')).toEqual({ height: 20, completesCycle: true });
  });

  it('a breath out completes a cycle only when the wave is already low (≤ 30)', () => {
    expect(waveStep(31, 'down').completesCycle).toBe(false);
    expect(waveStep(30, 'down').completesCycle).toBe(true);
    expect(waveStep(20, 'up').completesCycle).toBe(false);
  });

  it('from the start: two breaths out bring the wave low, the third completes exactly one cycle', () => {
    expect(ride(['down', 'down'])).toEqual({ height: 20, cycles: 0 });
    expect(ride(['down', 'down', 'down'])).toEqual({ height: 20, cycles: 1 });
  });

  it('the bug this fixes: one tap used to run two steps — that moved twice as far and could double a cycle', () => {
    // A single tap at height 30 is one cycle; the old touchstart + mousedown
    // pair applied it twice and counted two.
    const once = ride(['down', 'down', 'down']);
    const doubled = ride(['down', 'down', 'down', 'down']);
    expect(once.cycles).toBe(1);
    expect(doubled.cycles).toBe(2);
  });
});
