import React from 'react';
import { breathingProgress } from '@/lib/breathing/breathing-session';

interface BreathingProgressProps {
  /** Completed cycles, as the exercise counts them. */
  completed: number;
  className?: string;
}

/**
 * Five dots and "Cycle 3 of 5" under a breathing exercise: completed cycles
 * filled, the one in progress outlined, the rest faint. The words carry the
 * meaning for a screen reader; the dots are decoration.
 */
const BreathingProgress = ({ completed, className = '' }: BreathingProgressProps) => {
  const progress = breathingProgress(completed);
  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <div className="flex items-center gap-2" aria-hidden="true" data-breathing-dots="">
        {progress.dots.map((dot, index) => (
          <span
            key={index}
            data-dot={dot}
            className={`h-2.5 w-2.5 rounded-full ${
              dot === 'done' ? 'bg-white/70' : dot === 'current' ? 'border border-white/70' : 'bg-white/15'
            }`}
          />
        ))}
      </div>
      <div className="text-white/60 text-sm" aria-live="polite" aria-atomic="true">
        {progress.label}
      </div>
    </div>
  );
};

export default BreathingProgress;
