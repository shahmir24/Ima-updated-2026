
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import VoiceToggle from '@/components/wellness/VoiceToggle';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useSpokenGuidance } from '@/hooks/use-spoken-guidance';
import BreathingProgress from '@/components/wellness/BreathingProgress';
import BreathingComplete from '@/components/wellness/BreathingComplete';
import { isBreathingComplete, nextCycleCount } from '@/lib/breathing/breathing-session';

const phases = ['Inhale', 'Hold', 'Exhale'];
/** Counts per phase: the advertised Inhale 4 -> Hold 4 -> Exhale 6. */
const phaseCounts = [4, 4, 6];
const phaseDurations = [4000, 4000, 6000];

const TriangleCalm = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState(0); // 0: inhale, 1: hold, 2: exhale
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);
  // Five full cycles, then the exercise is over (see breathing-session.ts).
  const complete = isBreathingComplete(cycles);
  const [scale, setScale] = useState(1);


  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive && !complete) {
      const currentDuration = phaseDurations[phase];
      const countsInPhase = phaseCounts[phase];
      
      interval = setInterval(() => {
        setCount((prev) => {
          if (prev === 1) {
            setPhase((prevPhase) => {
              const nextPhase = (prevPhase + 1) % 3;
              if (nextPhase === 0) {
                setCycles((c) => nextCycleCount(c));
                setScale(1);
              }
              return nextPhase;
            });
            // The count belongs to the phase that is STARTING.
            return phaseCounts[(phase + 1) % phaseCounts.length];
          }
          return prev - 1;
        });
      }, currentDuration / countsInPhase);

      // Scale animation
      if (phase === 0) {
        setScale(1.2);
      } else if (phase === 1) {
        setScale(1.2);
      } else {
        setScale(0.8);
      }
    }

    return () => clearInterval(interval);
  }, [isActive, phase, complete]);


  const { data: settings } = useUserSettings();
  const voice = useSpokenGuidance({ volume: (settings?.sound_volume ?? 75) / 100, active: isActive });
  const { speak, cancel: cancelVoice, reset: resetVoice } = voice;

  // Speaks the phase the component has actually committed to — never from
  // inside a state updater, which React is free to re-invoke. Keyed by cycle
  // and phase, so each phase says its cue exactly once no matter how many
  // times this re-renders, and silent until the user starts the exercise.
  useEffect(() => {
    // Once the fifth cycle is done the next Inhale is never announced.
    if (!isActive || complete) return;
    speak(`${cycles}:${phase}`, phases[phase]);
  }, [isActive, complete, phase, cycles, speak]);

  // The fifth cycle is complete: stop the exercise, silence the voice and let
  // the shape come to rest. The interval above has already stopped itself.
  useEffect(() => {
    if (!complete) return;
    cancelVoice();
    setIsActive(false);
    setScale(1);
  }, [complete, cancelVoice]);

  const toggleBreathing = () => {
    // Pausing stops a cue mid-word; resuming does not repeat it, because the
    // phase key has not changed.
    if (isActive) cancelVoice();
    setIsActive(!isActive);
  };

  const resetBreathing = () => {
    resetVoice();
    setIsActive(false);
    setPhase(0);
    setCount(phaseCounts[0]);
    setCycles(0);
    setScale(1);
  };

  // Start Again: a fresh five-cycle session, started by this same tap.
  const startAgain = () => {
    resetBreathing();
    setIsActive(true);
  };

  // Read-only, for the play button's name: nothing moves before the first
  // Play and Reset puts everything back, so any movement means paused, not new.
  const hasStarted = isActive || phase !== 0 || count !== phaseCounts[0] || cycles > 0;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
      <WellnessHeader title="Triangle Calm" backPath="/breathing" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 flex flex-col items-center justify-center space-y-8">
        {/* Breathing Animation */}
        <div className="relative flex items-center justify-center">
          <div 
            className="w-48 h-48 flex items-center justify-center transition-all duration-1000"
            style={{
              transform: `scale(${scale})`,
              filter: isActive ? 'drop-shadow(0 0 30px rgba(59, 130, 246, 0.5))' : 'none'
            }}
          >
            {/* Triangle shape */}
            <div 
              className="relative"
              style={{
                width: '180px',
                height: '156px',
                background: `linear-gradient(135deg, 
                  ${phase === 0 ? '#3b82f6' : phase === 1 ? '#1d4ed8' : '#1e40af'} 0%, 
                  ${phase === 0 ? '#60a5fa' : phase === 1 ? '#3b82f6' : '#2563eb'} 100%)`,
                clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
                borderRadius: '8px',
                opacity: phase === 2 ? 0.7 : 1,
                transition: 'all 1s ease-in-out'
              }}
            >
              {/* Center content */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pt-12">
                <div className="text-4xl font-bold text-white mb-2">{count}</div>
                <div className="text-lg text-white/90">{phases[phase]}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-4">
          <p className="text-white/80 text-lg">
            Breathe down the triangle.
          </p>
          <p className="text-white/60 text-sm">
            Loosen your grip on what's next.
          </p>
          <BreathingProgress completed={cycles} />
        </div>

        {/* Controls */}
        {complete ? (
          <BreathingComplete name="Triangle Calm" onStartAgain={startAgain} onDone={() => navigate('/breathing')} />
        ) : (
          <div className="flex items-center space-x-6">
            <Button
              onClick={toggleBreathing}
              aria-label={isActive ? 'Pause Triangle Calm' : hasStarted ? 'Resume Triangle Calm' : 'Start Triangle Calm'}
              className="w-16 h-16 rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50"
            >
              {isActive ? (
                <Pause className="h-8 w-8 text-blue-400" />
              ) : (
                <Play className="h-8 w-8 text-blue-400" />
              )}
            </Button>
          
            <Button
              onClick={resetBreathing}
              aria-label="Reset Triangle Calm"
              variant="ghost"
              className="w-12 h-12 rounded-full hover:bg-white/10"
            >
              <RotateCcw className="h-6 w-6 text-white/60" />
            </Button>

            <VoiceToggle supported={voice.supported} muted={voice.muted} onToggle={voice.toggleMuted} />
          </div>
        )}

        {/* Guidance */}
        <div className="bg-secondary/40 rounded-3xl p-6 text-center">
          <p className="text-white/70 text-sm">
            Let go with each exhale. Feel yourself softening into this moment.
            No need to hold onto anything tightly.
          </p>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default TriangleCalm;
