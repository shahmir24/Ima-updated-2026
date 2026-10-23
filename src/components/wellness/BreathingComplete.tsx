import React, { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { BREATHING_CYCLE_TARGET } from '@/lib/breathing/breathing-session';

interface BreathingCompleteProps {
  /** The exercise's name, for the action labels ("Start Triangle Calm again"). */
  name: string;
  onStartAgain: () => void;
  onDone: () => void;
}

/**
 * Shown in place of the controls once the fifth cycle is complete. Takes focus
 * when it appears, because the button the user last pressed is gone.
 */
const BreathingComplete = ({ name, onStartAgain, onDone }: BreathingCompleteProps) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-labelledby="breathing-complete-heading" className="bg-secondary/40 rounded-3xl p-6 text-center w-full">
      <h2 id="breathing-complete-heading" ref={headingRef} tabIndex={-1} className="text-white text-lg font-medium outline-none">
        {BREATHING_CYCLE_TARGET} cycles complete
      </h2>
      <p className="text-white/70 text-sm mt-2">Nicely done. Notice how you feel right now.</p>
      <div className="mt-5 flex items-center justify-center gap-3">
        <Button onClick={onStartAgain} aria-label={`Start ${name} again`} className="rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 text-white">
          Start Again
        </Button>
        <Button onClick={onDone} variant="ghost" className="rounded-full text-white/80 hover:bg-white/10">
          Done
        </Button>
      </div>
    </section>
  );
};

export default BreathingComplete;
