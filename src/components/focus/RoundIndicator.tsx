import React from 'react';
import type { RoundDot } from '@/lib/focus/focus-progress';

interface RoundIndicatorProps {
  /** From currentRound(), the same number the desktop session panel shows. */
  round: number;
  flows: number;
  /** From roundDots(). */
  dots: RoundDot[];
  className?: string;
}

/**
 * Phones: "Round 2 of 4" and a dot per round — completed filled, the current
 * round outlined, upcoming faint. The text is what a screen reader reads; the
 * dots only repeat it.
 */
const RoundIndicator = ({ round, flows, dots, className = '' }: RoundIndicatorProps) => (
  <div className={`flex flex-col items-center gap-1.5 ${className}`}>
    <div className="text-white/60 text-sm">
      Round {round} of {flows}
    </div>
    <div className="flex flex-wrap justify-center gap-2" aria-hidden="true" data-round-dots="">
      {dots.map((dot, index) => (
        <span
          key={index}
          data-dot={dot}
          className={`h-2 w-2 rounded-full ${
            dot === 'done' ? 'bg-blue-300' : dot === 'current' ? 'ring-1 ring-inset ring-blue-300 bg-blue-300/20' : 'bg-white/15'
          }`}
        />
      ))}
    </div>
  </div>
);

export default RoundIndicator;
