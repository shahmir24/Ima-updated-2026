
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import VoiceToggle from '@/components/wellness/VoiceToggle';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useSpokenGuidance } from '@/hooks/use-spoken-guidance';

const phases = ['Inhale', 'Hold', 'Exhale', 'Hold'];
/** Counts per phase: the advertised Inhale 4 -> Hold 4 -> Exhale 8 -> Hold 4. */
const phaseCounts = [4, 4, 8, 4];
const phaseDurations = [4000, 4000, 8000, 4000];

const DeepReset = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState(0); // 0: inhale, 1: hold, 2: exhale, 3: hold
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);
  const [ripple, setRipple] = useState(false);


  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      const currentDuration = phaseDurations[phase];
      const countsInPhase = phaseCounts[phase];
      
      interval = setInterval(() => {
        setCount((prev) => {
          if (prev === 1) {
            setPhase((prevPhase) => {
              const nextPhase = (prevPhase + 1) % 4;
              if (nextPhase === 0) {
                setCycles(c => c + 1);
                setRipple(true);
                setTimeout(() => setRipple(false), 2000);
              }
              return nextPhase;
            });
            // The count belongs to the phase that is STARTING. Taking it
            // from the phase that had just ended put the 8 on the closing
            // hold and left the exhale at 4, so this ran 4-4-4-8.
            return phaseCounts[(phase + 1) % phaseCounts.length];
          }
          return prev - 1;
        });
      }, currentDuration / countsInPhase);
    }

    return () => clearInterval(interval);
  }, [isActive, phase]);


  const { data: settings } = useUserSettings();
  const voice = useSpokenGuidance({ volume: (settings?.sound_volume ?? 75) / 100 });
  const { speak, cancel: cancelVoice, reset: resetVoice } = voice;

  // Speaks the phase the component has actually committed to — never from
  // inside a state updater, which React is free to re-invoke. Keyed by cycle
  // and phase, so each phase says its cue exactly once no matter how many
  // times this re-renders, and silent until the user starts the exercise.
  useEffect(() => {
    if (!isActive) return;
    speak(`${cycles}:${phase}`, phases[phase]);
  }, [isActive, phase, cycles, speak]);

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
    setRipple(false);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Deep Reset" backPath="/breathing" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 flex flex-col items-center justify-center space-y-8">
        {/* Breathing Animation */}
        <div className="relative flex items-center justify-center">
          <div 
            className={`w-64 h-40 rounded-2xl transition-all duration-1000 ${
              isActive ? 'shadow-2xl' : ''
            }`}
            style={{
              background: `linear-gradient(135deg, 
                ${phase === 0 ? '#a3a3a3' : phase === 1 ? '#737373' : phase === 2 ? '#525252' : '#404040'} 0%, 
                ${phase === 0 ? '#d4a574' : phase === 1 ? '#b8956a' : phase === 2 ? '#a68660' : '#8b7355'} 100%)`,
              boxShadow: isActive ? '0 0 50px rgba(168, 134, 96, 0.4)' : 'none',
              transform: phase === 2 ? 'scaleY(1.1)' : 'scaleY(1)'
            }}
          >
            {/* Ripple effect */}
            {ripple && (
              <div className="absolute inset-0 rounded-2xl border-4 border-yellow-400/60 animate-ping" />
            )}
            
            {/* Edge indicators */}
            <div className={`absolute top-2 left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full bg-yellow-400 transition-opacity duration-300 ${phase === 0 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            <div className={`absolute right-2 top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full bg-yellow-400 transition-opacity duration-300 ${phase === 1 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            <div className={`absolute bottom-2 left-1/2 transform -translate-x-1/2 w-3 h-3 rounded-full bg-yellow-400 transition-opacity duration-300 ${phase === 2 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            <div className={`absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3 rounded-full bg-yellow-400 transition-opacity duration-300 ${phase === 3 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            
            {/* Center content */}
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div className="text-5xl font-bold text-white mb-2">{count}</div>
              <div className="text-xl text-white/90">{phases[phase]}</div>
              {phase === 2 && (
                <div className="text-sm text-white/70 mt-2">Longer exhale</div>
              )}
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-4">
          <p className="text-white/80 text-lg">
            Longer out-breaths to signal safety.
          </p>
          <p className="text-white/60 text-sm">
            You're steadying, not rushing.
          </p>
          <div className="text-white/60 text-sm">
            Cycles completed: {cycles}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-6">
          <Button
            onClick={toggleBreathing}
            className="w-16 h-16 rounded-full bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-400/50"
          >
            {isActive ? (
              <Pause className="h-8 w-8 text-yellow-400" />
            ) : (
              <Play className="h-8 w-8 text-yellow-400" />
            )}
          </Button>
          
          <Button
            onClick={resetBreathing}
            variant="ghost"
            className="w-12 h-12 rounded-full hover:bg-white/10"
          >
            <RotateCcw className="h-6 w-6 text-white/60" />
          </Button>

          <VoiceToggle supported={voice.supported} muted={voice.muted} onToggle={voice.toggleMuted} />
        </div>

        {/* Guidance */}
        <div className="bg-secondary/40 rounded-3xl p-6 text-center">
          <p className="text-white/70 text-sm">
            "You're doing okay. Just keep breathing." Let the longer exhale 
            help your nervous system know it's safe to slow down.
          </p>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default DeepReset;
