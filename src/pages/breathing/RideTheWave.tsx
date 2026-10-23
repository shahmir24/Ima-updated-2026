
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import { waveStep, WAVE_START_HEIGHT, type WaveDirection } from '@/lib/ride-the-wave';
import BreathingProgress from '@/components/wellness/BreathingProgress';
import BreathingComplete from '@/components/wellness/BreathingComplete';
import { isBreathingComplete, nextCycleCount } from '@/lib/breathing/breathing-session';

/**
 * One half of the wave. Same look as before — full width, a pointer and a
 * faint hover while the exercise runs — and inert, with no hover, until then.
 */
const ZONE =
  'block w-full flex-1 cursor-pointer hover:bg-white/5 transition-colors disabled:cursor-default disabled:hover:bg-transparent';

const RideTheWave = () => {
  const navigate = useNavigate();
  const [isActive, setIsActive] = useState(false);
  const [waveHeight, setWaveHeight] = useState(WAVE_START_HEIGHT);
  const [breathPhase, setBreathPhase] = useState('neutral'); // 'inhale', 'exhale', 'neutral'
  const [cycles, setCycles] = useState(0);
  // Five complete cycles, then the exercise is over (see breathing-session.ts).
  const complete = isBreathingComplete(cycles);
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

  // The fifth cycle is complete: the wave stops and taps are no longer taken.
  useEffect(() => {
    if (complete) setIsActive(false);
  }, [complete]);

  // One breath input. Called only from the zones' onClick, which a mouse
  // click, a touch tap and Enter/Space each fire exactly once. The zones used
  // to listen to touchstart AND mousedown, and a tap fires both, so one touch
  // moved the wave twice and could count a cycle twice.
  const handleWaveInteraction = (direction: WaveDirection) => {
    // Nothing responds until the exercise is started, or once it is complete.
    if (!isActive || complete) return;
    const step = waveStep(waveHeight, direction);
    setBreathPhase(direction === 'up' ? 'inhale' : 'exhale');
    setWaveHeight(step.height);
    if (step.completesCycle) {
      setCycles((prev) => nextCycleCount(prev));
    }

    setTimeout(() => setBreathPhase('neutral'), 500);
  };

  const toggleBreathing = () => {
    setIsActive(!isActive);
    if (!isActive) {
      setWaveHeight(WAVE_START_HEIGHT);
    }
  };

  const resetBreathing = () => {
    setIsActive(false);
    setWaveHeight(WAVE_START_HEIGHT);
    setBreathPhase('neutral');
    setCycles(0);
    setWaveOffset(0);
  };

  // Start Again: a fresh five-cycle session, started by this same tap.
  const startAgain = () => {
    resetBreathing();
    setIsActive(true);
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
    <div className="flex flex-col min-h-screen bg-gradient-to-b from-purple-900 via-blue-800 to-teal-700 text-foreground pb-20 lg:pb-10">
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
          
          {/* Interaction overlay: the top half breathes in, the bottom half
              breathes out. Real buttons, so a keyboard can do the same with
              Tab and Enter or Space; disabled until the wave is started. */}
          <div className="absolute inset-0 flex flex-col">
            <button
              type="button"
              onClick={() => handleWaveInteraction('up')}
              disabled={!isActive || complete}
              aria-label="Breathe in: raise the wave"
              aria-describedby="ride-the-wave-how"
              className={`${ZONE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-200`}
            >
              <span className="h-full flex items-center justify-center" aria-hidden="true">
                <span className={`text-white/60 text-sm transition-opacity ${breathPhase === 'inhale' ? 'opacity-100' : 'opacity-0'}`}>
                  Inhale ↑
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => handleWaveInteraction('down')}
              disabled={!isActive || complete}
              aria-label="Breathe out: lower the wave"
              aria-describedby="ride-the-wave-how"
              className={`${ZONE} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-purple-200`}
            >
              <span className="h-full flex items-center justify-center" aria-hidden="true">
                <span className={`text-white/60 text-sm transition-opacity ${breathPhase === 'exhale' ? 'opacity-100' : 'opacity-0'}`}>
                  Exhale ↓
                </span>
              </span>
            </button>
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
          <BreathingProgress completed={cycles} />
        </div>

        {/* Controls */}
        {complete ? (
          <BreathingComplete name="Ride the Wave" onStartAgain={startAgain} onDone={() => navigate('/breathing')} />
        ) : (
          <div className="flex items-center space-x-6">
            <Button
              onClick={toggleBreathing}
              aria-label={isActive ? 'Pause the wave' : 'Start the wave'}
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
              aria-label="Reset Ride the Wave"
              variant="ghost"
              className="w-12 h-12 rounded-full hover:bg-white/10"
            >
              <RotateCcw className="h-6 w-6 text-white/60" />
            </Button>
          </div>
        )}

        {/* Guidance */}
        <div className="bg-purple-800/40 rounded-3xl p-6 text-center">
          <p className="text-white/70 text-sm">
            Touch the upper half of the wave to inhale, lower half to exhale. 
            Or just watch and breathe naturally. There's no wrong way.
          </p>
          {/* For screen readers and keyboards: the same instruction in terms
              of the two buttons over the wave. */}
          <p id="ride-the-wave-how" className="sr-only">
            Start the wave first. Then use Breathe in to raise the wave and Breathe out to lower it,
            with a tap, a click, or Enter or Space. Breathing out while the wave is low completes a cycle.
          </p>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default RideTheWave;
