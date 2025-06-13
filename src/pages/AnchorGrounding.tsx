
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const AnchorGrounding = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const fromSafeSpace = searchParams.get('from') === 'safe-space';
  
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [cycles, setCycles] = useState(0);

  const steps = [
    { title: "5 Things You Can See", description: "Look around and name 5 things you can see" },
    { title: "4 Things You Can Touch", description: "Feel and name 4 things you can touch" },
    { title: "3 Things You Can Hear", description: "Listen and name 3 things you can hear" },
    { title: "2 Things You Can Smell", description: "Notice and name 2 things you can smell" },
    { title: "1 Thing You Can Taste", description: "Focus on 1 thing you can taste" }
  ];

  const backPath = fromSafeSpace ? '/safe-space' : '/meditation';

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isActive) {
      interval = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev === steps.length - 1) {
            setCycles(c => c + 1);
            return 0;
          }
          return prev + 1;
        });
      }, 8000); // 8 seconds per step
    }

    return () => clearInterval(interval);
  }, [isActive, steps.length]);

  const toggleExercise = () => {
    setIsActive(!isActive);
  };

  const resetExercise = () => {
    setIsActive(false);
    setCurrentStep(0);
    setCycles(0);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Anchor Grounding" backPath={backPath} />

      <main className="flex-1 responsive-container flex flex-col items-center justify-center space-y-6 sm:space-y-8">
        {/* Grounding Animation */}
        <div className="relative flex items-center justify-center">
          <div 
            className={`w-40 h-40 sm:w-48 sm:h-48 border-4 border-green-400 rounded-full transition-all duration-1000 ${
              isActive ? 'shadow-lg shadow-green-400/50 scale-110' : ''
            }`}
            style={{
              boxShadow: isActive ? '0 0 40px rgba(34, 197, 94, 0.6)' : 'none',
            }}
          >
            {/* Center content */}
            <div className="w-full h-full flex flex-col items-center justify-center p-4">
              <div className="text-2xl sm:text-3xl font-bold text-green-400 mb-2 text-center">
                {steps[currentStep].title.split(' ')[0]}
              </div>
              <div className="responsive-body text-white/80 text-center leading-tight">
                {steps[currentStep].title.substring(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Instructions */}
        <div className="text-center space-y-4">
          <p className="text-white/80 responsive-subtitle">
            {steps[currentStep].description}
          </p>
          <p className="text-white/60 responsive-body">
            Ground yourself in the present moment.
          </p>
          <div className="text-white/60 responsive-body">
            Cycles completed: {cycles}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center space-x-6">
          <Button
            onClick={toggleExercise}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-green-500/20 hover:bg-green-500/30 border border-green-400/50"
          >
            {isActive ? (
              <Pause className="h-6 w-6 sm:h-8 sm:w-8 text-green-400" />
            ) : (
              <Play className="h-6 w-6 sm:h-8 sm:w-8 text-green-400" />
            )}
          </Button>
          
          <Button
            onClick={resetExercise}
            variant="ghost"
            className="w-10 h-10 sm:w-12 sm:h-12 rounded-full hover:bg-white/10"
          >
            <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6 text-white/60" />
          </Button>
        </div>

        {/* Guidance */}
        <div className="bg-secondary/40 rounded-3xl p-4 sm:p-6 text-center">
          <p className="text-white/70 responsive-body">
            This is the 5-4-3-2-1 technique. Use your senses to anchor yourself 
            in the present moment and find your calm.
          </p>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default AnchorGrounding;
