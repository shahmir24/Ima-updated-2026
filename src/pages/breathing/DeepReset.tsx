
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const DeepReset = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState(0); // 0: inhale, 1: hold, 2: exhale, 3: hold
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);
  const [ripple, setRipple] = useState(false);

  const phases = ['Inhale', 'Hold', 'Exhale', 'Hold'];
  const phaseDurations = [4000, 4000, 8000, 4000]; // inhale 4s, hold 4s, exhale 8s, hold 4s

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      const currentDuration = phaseDurations[phase];
      const countsInPhase = phase === 2 ? 8 : 4;
      
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
            return phase === 2 ? 8 : 4; // Set next phase count
          }
          return prev - 1;
        });
      }, currentDuration / countsInPhase);
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
