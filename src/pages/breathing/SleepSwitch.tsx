
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const SleepSwitch = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState(0); // 0: inhale, 1: hold, 2: exhale
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);
  const [moonScale, setMoonScale] = useState(1);
  const [starOpacity, setStarOpacity] = useState(0.3);

  const phases = ['Inhale', 'Hold', 'Exhale'];
  const phaseDurations = [4000, 7000, 8000]; // inhale 4s, hold 7s, exhale 8s

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      const currentDuration = phaseDurations[phase];
      const countsInPhase = phase === 0 ? 4 : phase === 1 ? 7 : 8;
      
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
            return phase === 0 ? 7 : phase === 1 ? 8 : 4; // Set next phase count
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

  const toggleBreathing = () => {
    setIsActive(!isActive);
  };

  const resetBreathing = () => {
    setIsActive(false);
    setPhase(0);
    setCount(4);
    setCycles(0);
    setMoonScale(1);
    setStarOpacity(0.3);
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-indigo-900 via-purple-900 to-indigo-800 text-foreground pb-20">
      <WellnessHeader title="Sleep Switch" backPath="/breathing" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 flex flex-col items-center justify-center space-y-8">
        {/* Stars background */}
        <div className="absolute inset-0 overflow-hidden">
          {Array.from({ length: 20 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-white rounded-full animate-pulse"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                opacity: starOpacity,
                animationDelay: `${Math.random() * 3}s`,
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
