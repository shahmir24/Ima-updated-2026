
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Pause, Play, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface BodyScanStep {
  id: string;
  title: string;
  instruction: string;
  duration: number; // in seconds
}

const bodyScanSteps: BodyScanStep[] = [
  {
    id: 'head-face',
    title: 'Head & Face',
    instruction: 'Close your eyes and focus on your head and face. Relax your jaw, soften your eyes, and release any tension in your forehead.',
    duration: 45
  },
  {
    id: 'neck',
    title: 'Neck',
    instruction: 'Move your attention to your neck. Let it feel long and relaxed, releasing any tightness from your day.',
    duration: 30
  },
  {
    id: 'shoulders',
    title: 'Shoulders',
    instruction: 'Notice your shoulders. Let them drop away from your ears, melting any stress you\'ve been carrying.',
    duration: 35
  },
  {
    id: 'chest',
    title: 'Chest',
    instruction: 'Bring awareness to your chest. Feel your breath naturally flowing in and out, expanding and releasing.',
    duration: 40
  },
  {
    id: 'stomach',
    title: 'Stomach',
    instruction: 'Focus on your stomach and abdomen. Let this area soften and relax with each gentle breath.',
    duration: 35
  },
  {
    id: 'hips',
    title: 'Hips',
    instruction: 'Notice your hips and lower back. Allow them to settle and release, feeling supported and grounded.',
    duration: 30
  },
  {
    id: 'legs',
    title: 'Legs',
    instruction: 'Bring attention to your legs. Feel them heavy and relaxed, from your thighs down to your knees.',
    duration: 35
  },
  {
    id: 'feet',
    title: 'Feet',
    instruction: 'Finally, focus on your feet. Let them be completely relaxed, feeling connected to the ground beneath you.',
    duration: 30
  }
];

const BodyScanSession = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const soundEnabled = location.state?.soundEnabled || false;
  
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(bodyScanSteps[0].duration);
  const [showCompletion, setShowCompletion] = useState(false);

  useEffect(() => {
    if (!isPlaying || showCompletion) return;

    const timer = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          if (currentStep < bodyScanSteps.length - 1) {
            setCurrentStep(currentStep + 1);
            return bodyScanSteps[currentStep + 1].duration;
          } else {
            setShowCompletion(true);
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [currentStep, isPlaying, showCompletion]);

  const handleNext = () => {
    if (currentStep < bodyScanSteps.length - 1) {
      setCurrentStep(currentStep + 1);
      setTimeRemaining(bodyScanSteps[currentStep + 1].duration);
    } else {
      setShowCompletion(true);
    }
  };

  const handlePausePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleExit = () => {
    navigate('/mindfulness/body-scan');
  };

  const handleComplete = () => {
    navigate('/wellness/mindfulness');
  };

  const progressPercentage = ((currentStep + (bodyScanSteps[currentStep]?.duration - timeRemaining) / bodyScanSteps[currentStep]?.duration) / bodyScanSteps.length) * 100;

  if (showCompletion) {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground">
        <div className="flex-1 max-w-lg w-full mx-auto px-4 py-8 flex flex-col justify-center">
          <div className="text-center space-y-8">
            <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/30 flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-green-400"></div>
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white">Body Scan Complete</h1>
              <p className="text-white/70 text-lg leading-relaxed">
                You've completed your body scan. Take a moment to notice how you feel. 
                Your body and mind have had a chance to release and reset.
              </p>
            </div>

            <div className="bg-secondary/30 rounded-2xl p-6">
              <p className="text-white/80 italic text-lg mb-2">
                "The body benefits from movement, and the mind benefits from stillness."
              </p>
              <p className="text-white/50 text-sm">— Sakyong Mipham</p>
            </div>

            <Button
              onClick={handleComplete}
              className="w-full bg-green-500 hover:bg-green-600 text-white rounded-2xl py-4 text-lg font-medium"
            >
              Continue
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleExit}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <X className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-xl font-semibold text-white">Body Scan</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Progress */}
      <div className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="flex items-center justify-between mb-2">
          <span className="text-white/60 text-sm">Step {currentStep + 1} of {bodyScanSteps.length}</span>
          <span className="text-white/60 text-sm">{Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}</span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-lg w-full mx-auto px-4 flex flex-col justify-center">
        <div className="text-center space-y-8">
          {/* Current Step Indicator */}
          <div className="space-y-4">
            <h2 className="text-2xl font-bold text-white animate-fade-in">
              {bodyScanSteps[currentStep].title}
            </h2>
            <div className="bg-secondary/30 rounded-2xl p-6 animate-fade-in">
              <p className="text-white/80 text-lg leading-relaxed">
                {bodyScanSteps[currentStep].instruction}
              </p>
            </div>
          </div>

          {/* Breathing Animation */}
          <div className="breathing-animation w-20 h-20 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
            <div className="w-12 h-12 rounded-full bg-blue-500/40"></div>
          </div>
        </div>
      </main>

      {/* Controls */}
      <div className="w-full max-w-lg mx-auto px-4 pb-8">
        <div className="flex items-center justify-center space-x-6">
          <Button
            variant="ghost"
            size="icon"
            onClick={handlePausePlay}
            className="h-12 w-12 rounded-full hover:bg-white/10"
          >
            {isPlaying ? (
              <Pause className="h-6 w-6 text-white" />
            ) : (
              <Play className="h-6 w-6 text-white" />
            )}
          </Button>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={handleNext}
            className="h-12 w-12 rounded-full hover:bg-white/10"
          >
            <SkipForward className="h-6 w-6 text-white" />
          </Button>
        </div>
        
        <p className="text-center text-white/50 text-sm mt-4">
          {isPlaying ? 'Pause' : 'Resume'} • Skip • Exit
        </p>
      </div>
    </div>
  );
};

export default BodyScanSession;
