
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const RideTheWave = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [waveHeight, setWaveHeight] = useState(50);
  const [breathPhase, setBreathPhase] = useState('neutral'); // 'inhale', 'exhale', 'neutral'
  const [cycles, setCycles] = useState(0);
  const [waveOffset, setWaveOffset] = useState(0);

  useEffect(() => {
    let animationFrame: number;
    
    if (isActive) {
      const animate = () => {
        setWaveOffset(prev => (prev + 0.02) % (Math.PI * 2));
        animationFrame = requestAnimationFrame(animate);
      };
      animationFrame = requestAnimationFrame(animate);
    }

    return () => {
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [isActive]);

  const handleWaveInteraction = (direction: 'up' | 'down') => {
    if (direction === 'up') {
      setBreathPhase('inhale');
      setWaveHeight(Math.min(120, waveHeight + 10));
    } else {
      setBreathPhase('exhale');
      setWaveHeight(Math.max(20, waveHeight - 15));
      if (waveHeight <= 30) {
        setCycles(prev => prev + 1);
      }
    }
    
    setTimeout(() => setBreathPhase('neutral'), 500);
  };

  const toggleBreathing = () => {
    setIsActive(!isActive);
    if (!isActive) {
      setWaveHeight(50);
    }
  };

  const resetBreathing = () => {
    setIsActive(false);
    setWaveHeight(50);
    setBreathPhase('neutral');
    setCycles(0);
    setWaveOffset(0);
  };

  const generateWavePath = () => {
    const width = 300;
    const centerY = 120;
    const amplitude = waveHeight;
    let path = `M 0 ${centerY}`;
    
    for (let x = 0; x <= width; x += 10) {
      const y = centerY + Math.sin((x / width) * Math.PI * 4 + waveOffset) * amplitude * 0.01;
      path += ` L ${x} ${y}`;
    }
    
    return path;
  };

  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-purple-900 via-blue-800 to-teal-700 text-foreground pb-20">
      <WellnessHeader title="Ride the Wave" backPath="/breathing" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 flex flex-col items-center justify-center space-y-8">
        {/* Wave Animation */}
        <div className="relative w-full h-64 flex items-center justify-center">
          <svg
            width="300"
            height="240"
            viewBox="0 0 300 240"
            className="absolute"
          >
            {/* Wave gradient */}
            <defs>
              <linearGradient id="waveGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="rgba(147, 51, 234, 0.8)" />
                <stop offset="50%" stopColor="rgba(59, 130, 246, 0.6)" />
                <stop offset="100%" stopColor="rgba(20, 184, 166, 0.4)" />
              </linearGradient>
            </defs>
            
            {/* Wave path */}
            <path
              d={generateWavePath()}
              stroke="url(#waveGradient)"
              strokeWidth="4"
              fill="none"
              className="transition-all duration-300"
              style={{
                filter: isActive ? 'drop-shadow(0 0 20px rgba(147, 51, 234, 0.6))' : 'none'
              }}
            />
            
            {/* Wave fill */}
            <path
              d={`${generateWavePath()} L 300 240 L 0 240 Z`}
              fill="url(#waveGradient)"
              opacity="0.3"
            />
          </svg>
          
          {/* Interaction overlay */}
          <div className="absolute inset-0 flex flex-col">
            <div 
              className="flex-1 cursor-pointer hover:bg-white/5 transition-colors"
              onMouseDown={() => handleWaveInteraction('up')}
              onTouchStart={() => handleWaveInteraction('up')}
            >
              <div className="h-full flex items-center justify-center">
                <div className={`text-white/60 text-sm transition-opacity ${breathPhase === 'inhale' ? 'opacity-100' : 'opacity-0'}`}>
                  Inhale ↑
                </div>
              </div>
            </div>
            <div 
              className="flex-1 cursor-pointer hover:bg-white/5 transition-colors"
              onMouseDown={() => handleWaveInteraction('down')}
              onTouchStart={() => handleWaveInteraction('down')}
            >
              <div className="h-full flex items-center justify-center">
                <div className={`text-white/60 text-sm transition-opacity ${breathPhase === 'exhale' ? 'opacity-100' : 'opacity-0'}`}>
                  Exhale ↓
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-4">
          <p className="text-white/80 text-lg">
            No counts, no pressure.
          </p>
          <p className="text-white/60 text-sm">
            Just let the wave move through you.
          </p>
          <div className="text-white/60 text-sm">
            Breath cycles: {cycles}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-6">
          <Button
            onClick={toggleBreathing}
            className="w-16 h-16 rounded-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50"
          >
            {isActive ? (
              <Pause className="h-8 w-8 text-purple-300" />
            ) : (
              <Play className="h-8 w-8 text-purple-300" />
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
        <div className="bg-purple-800/40 rounded-3xl p-6 text-center">
          <p className="text-white/70 text-sm">
            Touch the upper half of the wave to inhale, lower half to exhale. 
            Or just watch and breathe naturally. There's no wrong way.
          </p>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default RideTheWave;
