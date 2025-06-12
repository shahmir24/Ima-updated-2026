
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';

const BreathSyncWalk = () => {
  const navigate = useNavigate();
  const [currentPhase, setCurrentPhase] = useState<'intro' | 'sync-3' | 'sync-4-5' | 'complete'>('intro');
  const [isActive, setIsActive] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'inhale' | 'exhale'>('inhale');
  const [breathCount, setBreathCount] = useState(1);
  const [maxInhale, setMaxInhale] = useState(3);
  const [maxExhale, setMaxExhale] = useState(3);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && (currentPhase === 'sync-3' || currentPhase === 'sync-4-5')) {
      interval = setInterval(() => {
        setBreathCount(prev => {
          const maxCount = breathPhase === 'inhale' ? maxInhale : maxExhale;
          if (prev >= maxCount) {
            setBreathPhase(current => current === 'inhale' ? 'exhale' : 'inhale');
            return 1;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, breathPhase, maxInhale, maxExhale, currentPhase]);

  const handleStart = () => {
    setCurrentPhase('sync-3');
    setIsActive(true);
    setBreathPhase('inhale');
    setBreathCount(1);
    setMaxInhale(3);
    setMaxExhale(3);
  };

  const handleNext = () => {
    if (currentPhase === 'sync-3') {
      setCurrentPhase('sync-4-5');
      setMaxInhale(4);
      setMaxExhale(5);
      setBreathPhase('inhale');
      setBreathCount(1);
    } else if (currentPhase === 'sync-4-5') {
      setCurrentPhase('complete');
      setIsActive(false);
    }
  };

  const togglePause = () => {
    setIsActive(!isActive);
  };

  const handleRestart = () => {
    setCurrentPhase('intro');
    setIsActive(false);
    setBreathPhase('inhale');
    setBreathCount(1);
  };

  const getBreathInstruction = () => {
    if (currentPhase === 'sync-3') {
      return breathPhase === 'inhale' ? `Inhale... ${breathCount}` : `Exhale... ${breathCount}`;
    } else if (currentPhase === 'sync-4-5') {
      return breathPhase === 'inhale' ? `Inhale for ${breathCount}` : `Exhale for ${breathCount}`;
    }
    return '';
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <WellnessHeader title="Breath and Sync" backPath="/mindfulness/walking" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-8">
        {/* Intro */}
        {currentPhase === 'intro' && (
          <div className="text-center space-y-8 flex flex-col justify-center h-full">
            <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/30 flex items-center justify-center">
                <Footprints className="h-8 w-8 text-green-400" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white">Let's sync up</h1>
              <p className="text-white/70 text-lg leading-relaxed">
                You, your breath, and your steps.
              </p>
              <p className="text-white/60 text-base">
                Start walking slowly. No rush. Let your body lead. Let your mind follow.
              </p>
            </div>

            <Button
              onClick={handleStart}
              className="bg-green-500 hover:bg-green-600 text-white rounded-2xl py-4 text-lg font-medium"
            >
              Start Walking
            </Button>
          </div>
        )}

        {/* Sync 3-3 Pattern */}
        {currentPhase === 'sync-3' && (
          <div className="space-y-8 text-center">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-white">Feel your steps match your breath</h2>
              <p className="text-white/70">Inhale for 3, exhale for 3</p>
            </div>

            <div className="relative">
              <div className={`w-32 h-32 mx-auto rounded-full border-4 transition-all duration-1000 ${
                breathPhase === 'inhale' 
                  ? 'border-blue-400 bg-blue-500/20 scale-110' 
                  : 'border-green-400 bg-green-500/20 scale-90'
              }`}>
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{breathCount}</div>
                    <div className="text-sm text-white/70 capitalize">{breathPhase}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-lg text-white/80">{getBreathInstruction()}</p>
              
              <div className="flex justify-center space-x-4">
                <Button
                  onClick={togglePause}
                  variant="outline"
                  className="rounded-xl px-6"
                >
                  {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                
                <Button
                  onClick={handleNext}
                  className="bg-green-500 hover:bg-green-600 text-white rounded-xl px-6"
                >
                  Try Longer Pattern
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Sync 4-5 Pattern */}
        {currentPhase === 'sync-4-5' && (
          <div className="space-y-8 text-center">
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-white">Now try a little longer</h2>
              <p className="text-white/70">Inhale for 4, exhale for 5</p>
            </div>

            <div className="relative">
              <div className={`w-32 h-32 mx-auto rounded-full border-4 transition-all duration-1000 ${
                breathPhase === 'inhale' 
                  ? 'border-blue-400 bg-blue-500/20 scale-110' 
                  : 'border-green-400 bg-green-500/20 scale-90'
              }`}>
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-white">{breathCount}</div>
                    <div className="text-sm text-white/70 capitalize">{breathPhase}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <p className="text-lg text-white/80">{getBreathInstruction()}</p>
              <p className="text-white/60 italic">You're not going anywhere special — just coming back to yourself.</p>
              
              <div className="flex justify-center space-x-4">
                <Button
                  onClick={togglePause}
                  variant="outline"
                  className="rounded-xl px-6"
                >
                  {isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
                
                <Button
                  onClick={handleNext}
                  className="bg-green-500 hover:bg-green-600 text-white rounded-xl px-6"
                >
                  Complete
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Complete */}
        {currentPhase === 'complete' && (
          <div className="text-center space-y-8 flex flex-col justify-center h-full">
            <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/30 flex items-center justify-center">
                <Footprints className="h-8 w-8 text-green-400" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white">You're synced</h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Your breath, your steps, your presence — all in harmony.
              </p>
              <p className="text-white/60 italic">
                Take this feeling with you as you continue your day.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleRestart}
                className="w-full bg-green-500 hover:bg-green-600 text-white rounded-2xl py-4 text-lg font-medium"
              >
                Walk Again
              </Button>
              <Button
                onClick={() => navigate('/mindfulness/walking')}
                variant="outline"
                className="w-full rounded-2xl py-3"
              >
                Back to Walking
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default BreathSyncWalk;
