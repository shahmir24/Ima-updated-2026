
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const TriangleCalm = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState(0); // 0: inhale, 1: hold, 2: exhale
  const [count, setCount] = useState(4);
  const [cycles, setCycles] = useState(0);
  const [scale, setScale] = useState(1);

  const phases = ['Inhale', 'Hold', 'Exhale'];
  const phaseDurations = [4000, 4000, 6000]; // inhale 4s, hold 4s, exhale 6s

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      const currentDuration = phaseDurations[phase];
      const countsInPhase = phase === 2 ? 6 : 4;
      
      interval = setInterval(() => {
        setCount((prev) => {
          if (prev === 1) {
            setPhase((prevPhase) => {
              const nextPhase = (prevPhase + 1) % 3;
              if (nextPhase === 0) {
                setCycles(c => c + 1);
                setScale(1);
              }
              return nextPhase;
            });
            return phase === 1 ? 6 : 4; // Set next phase count
          }
          return prev - 1;
        });
      }, currentDuration / (phase === 2 ? 6 : 4));

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
  }, [isActive, phase]);

  const toggleBreathing = () => {
    setIsActive(!isActive);
  };

  const resetBreathing = () => {
    setIsActive(false);
    setPhase(0);
    setCount(4);
    setCycles(0);
    setScale(1);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
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
          <div className="text-white/60 text-sm">
            Cycles completed: {cycles}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-6">
          <Button
            onClick={toggleBreathing}
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
            variant="ghost"
            className="w-12 h-12 rounded-full hover:bg-white/10"
          >
            <RotateCcw className="h-6 w-6 text-white/60" />
          </Button>
        </div>

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
