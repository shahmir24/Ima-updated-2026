
import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import VoiceToggle from '@/components/wellness/VoiceToggle';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useSpokenGuidance } from '@/hooks/use-spoken-guidance';

const phases = ['Inhale', 'Hold', 'Exhale'];
/** Counts per phase: the advertised Inhale 4 -> Hold 7 -> Exhale 8. */
const phaseCounts = [4, 7, 8];
const phaseDurations = [4000, 7000, 8000];

const SleepSwitch = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState(0); // 0: inhale, 1: hold, 2: exhale
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);
  const [moonScale, setMoonScale] = useState(1);
  const [starOpacity, setStarOpacity] = useState(0.3);


  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      const currentDuration = phaseDurations[phase];
      const countsInPhase = phaseCounts[phase];
      
      interval = setInterval(() => {
        setCount((prev) => {
          if (prev === 1) {
            setPhase((prevPhase) => {
              const nextPhase = (prevPhase + 1) % 3;
              if (nextPhase === 0) {
                setCycles(c => c + 1);
              }
              return nextPhase;
            });
            // The count belongs to the phase that is STARTING.
            return phaseCounts[(phase + 1) % phaseCounts.length];
          }
          return prev - 1;
        });
      }, currentDuration / countsInPhase);

      // Animation effects
      if (phase === 0) {
        setMoonScale(1.3);
        setStarOpacity(0.6);
      } else if (phase === 1) {
        setMoonScale(1.3);
        setStarOpacity(0.8);
      } else {
        setMoonScale(0.8);
        setStarOpacity(0.2);
      }
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
    setMoonScale(1);
    setStarOpacity(0.3);
  };

  const stars = useMemo(
    () =>
      Array.from({ length: 20 }, () => ({
        left: `${Math.random() * 100}%`,
        top: `${Math.random() * 100}%`,
        delay: `${Math.random() * 3}s`
      })),
    []
  );

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800 text-foreground pb-20 lg:pb-10">
      <WellnessHeader title="Sleep Switch" backPath="/breathing" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 flex flex-col items-center justify-center space-y-8">
        {/* Stars background — positions fixed once, so they do not jump on
            every re-render of the running timer. */}
        <div className="absolute inset-0 overflow-hidden">
          {stars.map((star, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
              style={{
                left: star.left,
                top: star.top,
                opacity: starOpacity,
                animationDelay: star.delay,
                transition: 'opacity 1s ease-in-out'
              }}
            />
          ))}
        </div>

        {/* Breathing Animation */}
        <div className="relative flex items-center justify-center z-10">
          <div 
            className="w-48 h-48 rounded-full transition-all duration-1000 flex items-center justify-center"
            style={{
              transform: `scale(${moonScale})`,
              background: `radial-gradient(circle, rgba(190, 170, 255, 0.8) 0%, rgba(147, 197, 253, 0.6) 50%, rgba(99, 102, 241, 0.4) 100%)`,
              boxShadow: isActive ? '0 0 60px rgba(190, 170, 255, 0.5)' : '0 0 30px rgba(190, 170, 255, 0.3)',
              border: '2px solid rgba(190, 170, 255, 0.6)'
            }}
          >
            {/* Moon icon */}
            <div className="flex flex-col items-center justify-center">
              <Moon className="h-12 w-12 text-indigo-200 mb-3" />
              <div className="text-4xl font-bold text-white mb-2">{count}</div>
              <div className="text-lg text-indigo-200">{phases[phase]}</div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-4 z-10">
          <p className="text-white/80 text-lg">
            The lights are dimming.
          </p>
          <p className="text-white/60 text-sm">
            Breathe like you're already resting.
          </p>
          <div className="text-white/60 text-sm">
            Cycles completed: {cycles}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-6 z-10">
          <Button
            onClick={toggleBreathing}
            className="w-16 h-16 rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/50"
          >
            {isActive ? (
              <Pause className="h-8 w-8 text-indigo-300" />
            ) : (
              <Play className="h-8 w-8 text-indigo-300" />
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
        <div className="bg-indigo-800/40 rounded-3xl p-6 text-center z-10">
          <p className="text-white/70 text-sm">
            Let each breath carry you deeper into rest. Feel your body 
            preparing for peaceful sleep with every gentle exhale.
          </p>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default SleepSwitch;
