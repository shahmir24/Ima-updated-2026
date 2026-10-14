import React from 'react';

interface FocusRingProps {
  /** Whole seconds left, as the timer shows them. */
  timeLeft: number;
  /**
   * Fraction of the current phase done, already clamped to [0, 1], or null
   * when the phase's length is not known: then only the track is drawn, so
   * the ring never shows progress it cannot vouch for.
   */
  progress: number | null;
  label: string;
  hint?: string;
  isBreak?: boolean;
  className?: string;
}

const SIZE = 320;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

/**
 * The desktop timer: a 320px progress ring with the time and the phase inside
 * it. Display only — the time and progress come from the app-wide timer.
 * Same colours as the phone's timer card: white for focus, orange for a break.
 */
const FocusRing = ({ timeLeft, progress, label, hint, isBreak = false, className = '' }: FocusRingProps) => (
  <div className={`relative h-80 w-80 items-center justify-center ${className}`}>
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="absolute inset-0 -rotate-90"
      aria-hidden="true"
    >
      <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="stroke-white/10" />
      {progress !== null && (
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          // No transition: it would sweep backwards across the ring at every
          // phase change. One step a second is already smooth on a long block.
          className={isBreak ? 'stroke-orange-300' : 'stroke-blue-300'}
        />
      )}
    </svg>
    <div className="relative text-center">
      <div className={`text-7xl font-thin tracking-wider font-mono ${isBreak ? 'text-orange-300' : 'text-white'}`}>
        {formatTime(timeLeft)}
      </div>
      <p className={`mt-3 text-base font-medium ${isBreak ? 'text-orange-300/90' : 'text-white/80'}`}>{label}</p>
      {hint && <p className="mt-1 text-sm text-white/50">{hint}</p>}
    </div>
  </div>
);

export default FocusRing;
