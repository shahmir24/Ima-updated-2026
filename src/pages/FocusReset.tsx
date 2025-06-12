
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';

const FocusReset = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'intro' | 'inhale' | 'hold' | 'exhale' | 'complete'>('intro');
  const [isActive, setIsActive] = useState(false);
  const [counter, setCounter] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);

  const phaseTexts = {
    intro: "Overthinking? Distracted? Let's drop in real quick.",
    inhale: "Take a deep breath in...",
    hold: "Hold it... just for a moment...",
    exhale: "Now let it go — slowly...",
    complete: "You're safe to pause. You're safe to start fresh."
  };

  const phaseDurations = {
    inhale: 4,
    hold: 2,
    exhale: 6
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive && phase !== 'intro' && phase !== 'complete') {
      interval = setInterval(() => {
        setCounter((prev) => {
          const newCounter = prev + 1;
          const currentDuration = phaseDurations[phase as keyof typeof phaseDurations];
          
          if (newCounter >= currentDuration) {
            if (phase === 'inhale') {
              setPhase('hold');
            } else if (phase === 'hold') {
              setPhase('exhale');
            } else if (phase === 'exhale') {
              setCycleCount(prev => prev + 1);
              if (cycleCount >= 2) {
                setPhase('complete');
                setIsActive(false);
              } else {
                setPhase('inhale');
              }
            }
            return 0;
          }
          return newCounter;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isActive, phase, cycleCount]);

  const startMeditation = () => {
    setPhase('inhale');
    setIsActive(true);
    setCounter(0);
    setCycleCount(0);
  };

  const pauseResume = () => {
    setIsActive(!isActive);
  };

  const restart = () => {
    setPhase('intro');
    setIsActive(false);
    setCounter(0);
    setCycleCount(0);
  };

  const getCircleScale = () => {
    if (phase === 'inhale') {
      return 1 + (counter / phaseDurations.inhale) * 0.5;
    } else if (phase === 'exhale') {
      return 1.5 - (counter / phaseDurations.exhale) * 0.5;
    }
    return phase === 'hold' ? 1.5 : 1;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <WellnessHeader title="Focus Reset" backPath="/meditation" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-8 flex flex-col justify-center items-center">
        <div className="text-center space-y-8">
          {/* Breathing Circle */}
          <div className="w-48 h-48 mx-auto relative flex items-center justify-center">
            <div
              className="w-32 h-32 rounded-full bg-gradient-to-r from-blue-400/30 to-purple-400/30 border-2 border-blue-400/50 transition-transform duration-1000 ease-in-out flex items-center justify-center"
              style={{
                transform: `scale(${getCircleScale()})`,
              }}
            >
              <div className="w-16 h-16 rounded-full bg-blue-400/20"></div>
            </div>
          </div>

          {/* Instructions */}
          <div className="space-y-4">
            <h2 className="text-2xl font-semibold text-white">
              {phaseTexts[phase]}
            </h2>
            
            {phase !== 'intro' && phase !== 'complete' && (
              <div className="text-white/70">
                <p className="text-lg">
                  {phase === 'inhale' && `${counter + 1}...`}
                  {phase === 'hold' && 'Hold...'}
                  {phase === 'exhale' && `Out for ${counter + 1}...`}
                </p>
                <p className="text-sm mt-2">Cycle {cycleCount + 1} of 3</p>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex justify-center space-x-4">
            {phase === 'intro' && (
              <Button
                onClick={startMeditation}
                className="bg-blue-500 hover:bg-blue-600 text-white rounded-2xl px-8 py-3 text-lg font-medium flex items-center gap-3"
              >
                <Play className="h-6 w-6" />
                Start Reset
              </Button>
            )}

            {phase !== 'intro' && phase !== 'complete' && (
              <>
                <Button
                  onClick={pauseResume}
                  variant="outline"
                  className="rounded-2xl px-6 py-3"
                >
                  {isActive ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
                </Button>
                <Button
                  onClick={restart}
                  variant="outline"
                  className="rounded-2xl px-6 py-3"
                >
                  <RotateCcw className="h-5 w-5" />
                </Button>
              </>
            )}

            {phase === 'complete' && (
              <div className="space-y-4">
                <p className="text-white/70 text-lg">
                  Let go of what you were thinking... just for now.
                </p>
                <Button
                  onClick={restart}
                  className="bg-blue-500 hover:bg-blue-600 text-white rounded-2xl px-8 py-3 text-lg font-medium"
                >
                  Tap to start again
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default FocusReset;
