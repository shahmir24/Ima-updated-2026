/**
 * Manual minute entry for the Focus Timer's settings panel.
 *
 * Custom ranges (whole minutes):
 *   focus block  1–240 (the focus_block_minutes CHECK)
 *   break        1–60  (inside buffer_minutes 0–60; a custom break of 0 is not offered)
 *
 * Only plain digits are accepted. "25.5", "1e2", "-5", "  " and "abc" are all
 * refused with a message rather than rounded or guessed at.
 */

export interface MinuteRange {
  min: number;
  max: number;
}

export const CUSTOM_FOCUS_MINUTES: MinuteRange = Object.freeze({ min: 1, max: 240 });
export const CUSTOM_BREAK_MINUTES: MinuteRange = Object.freeze({ min: 1, max: 60 });

export type MinuteParse = { ok: true; value: number } | { ok: false; message: string };

export function parseWholeMinutes(raw: string, range: MinuteRange): MinuteParse {
  const text = raw.trim();
  const invalid = { ok: false as const, message: `Enter a whole number of minutes from ${range.min} to ${range.max}.` };
  if (!/^\d{1,4}$/.test(text)) return invalid;
  const value = Number(text);
  if (value < range.min || value > range.max) return invalid;
  return { ok: true, value };
}
