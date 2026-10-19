import { describe, expect, it } from 'vitest';
import { speaksCompletionLine } from './body-scan-voice';

describe('Body Scan closing line', () => {
  it('is spoken when a playing scan completes (timer or Skip while playing)', () => {
    expect(speaksCompletionLine({ showCompletion: true, isPlaying: true })).toBe(true);
  });

  it('is silent when the end was reached by skipping without ever playing, or while paused', () => {
    expect(speaksCompletionLine({ showCompletion: true, isPlaying: false })).toBe(false);
  });

  it('is never spoken before completion', () => {
    expect(speaksCompletionLine({ showCompletion: false, isPlaying: true })).toBe(false);
    expect(speaksCompletionLine({ showCompletion: false, isPlaying: false })).toBe(false);
  });
});
