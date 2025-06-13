
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const SteadySquare = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState(0); // 0: inhale, 1: hold, 2: exhale, 3: hold
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);

  const phases = ['Inhale', 'Hold', 'Exhale', 'Hold'];
  const phaseDuration = 4000; // 4 seconds per phase

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      interval = setInterval(() => {
        setCount((prev) => {
          if (prev === 1) {
            setPhase((prevPhase) => {
              const nextPhase = (prevPhase + 1) % 4;
              if (nextPhase === 0) {
                setCycles(c => c + 1);
              }
              return nextPhase;
            });
            return 4;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => clearInterval(interval);
  }, [isActive]);

  const toggleBreathing = () => {
    setIsActive(!isActive);
  };

  const resetBreathing = () => {
    setIsActive(false);
    setPhase(0);
    setCount(4);
    setCycles(0);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Steady Square" backPath="/breathing" />

      <main className="flex-1 responsive-container flex flex-col items-center justify-center space-y-6 sm:space-y-8">
        {/* Breathing Animation */}
        <div className="relative flex items-center justify-center">
          <div 
            className={`w-40 h-40 sm:w-48 sm:h-48 border-4 border-cyan-400 rounded-lg transition-all duration-1000 ${
              isActive ? 'shadow-lg shadow-cyan-400/50 scale-110' : ''
            }`}
            style={{
              boxShadow: isActive ? '0 0 40px rgba(34, 211, 238, 0.6)' : 'none',
              borderColor: phase === 0 ? '#22d3ee' : 
                          phase === 1 ? '#06b6d4' : 
                          phase === 2 ? '#0891b2' : 
                          '#0e7490'
            }}
          >
            {/* Corner indicators */}
            <div className={`absolute -top-2 -left-2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-cyan-400 transition-opacity duration-300 ${phase === 0 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            <div className={`absolute -top-2 -right-2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-cyan-400 transition-opacity duration-300 ${phase === 1 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            <div className={`absolute -bottom-2 -right-2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-cyan-400 transition-opacity duration-300 ${phase === 2 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            <div className={`absolute -bottom-2 -left-2 w-3 h-3 sm:w-4 sm:h-4 rounded-full bg-cyan-400 transition-opacity duration-300 ${phase === 3 ? 'opacity-100 animate-pulse' : 'opacity-40'}`} />
            
            {/* Center content */}
            <div className="w-full h-full flex flex-col items-center justify-center">
              <div className="text-4xl sm:text-6xl font-bold text-cyan-400 mb-2">{count}</div>
              <div className="responsive-subtitle text-white/80">{phases[phase]}</div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-4">
          <p className="text-white/80 responsive-subtitle">
            Trace the edges. One breath per side.
          </p>
          <p className="text-white/60 responsive-body">
            Let your mind find structure.
          </p>
          <div className="text-white/60 responsive-body">
            Cycles completed: {cycles}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-6">
          <Button
            onClick={toggleBreathing}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50"
          >
            {isActive ? (
              <Pause className="h-6 w-6 sm:h-8 sm:w-8 text-cyan-400" />
            ) : (
              <Play className="h-6 w-6 sm:h-8 sm:w-8 text-cyan-400" />
            )}
          </Button>
          
          <Button
            onClick={resetBreathing}
            variant="ghost"
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full hover:bg-white/10"
          >
            <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6 text-white/60" />
          </Button>
        </div>

        {/* Guidance */}
        <div className="bg-secondary/40 rounded-3xl p-4 sm:p-6 text-center">
          <p className="text-white/70 responsive-body">
            Focus on each edge of the square. Four counts per side. 
            Feel your breath create structure and calm.
          </p>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default SteadySquare;

