/**
 * Ride the Wave's one rule, kept apart from the page so it can be tested: what
 * a single breath input does to the wave. The arithmetic is unchanged from the
 * page's original handler.
 */
export type WaveDirection = 'up' | 'down';

export const WAVE_START_HEIGHT = 50;
const WAVE_MAX = 120;
const WAVE_MIN = 20;
/** At or below this height, breathing out completes a cycle. */
const CYCLE_THRESHOLD = 30;

export function waveStep(height: number, direction: WaveDirection): { height: number; completesCycle: boolean } {
  if (direction === 'up') return { height: Math.min(WAVE_MAX, height + 10), completesCycle: false };
  return { height: Math.max(WAVE_MIN, height - 15), completesCycle: height <= CYCLE_THRESHOLD };
}
