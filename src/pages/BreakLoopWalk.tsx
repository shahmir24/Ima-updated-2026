
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';

const BreakLoopWalk = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<'intro' | 'stand' | 'walk' | 'breathe' | 'complete'>('intro');

  const handleStart = () => {
    setCurrentStep('stand');
  };

  const handleNext = () => {
    if (currentStep === 'stand') {
      setCurrentStep('walk');
    } else if (currentStep === 'walk') {
      setCurrentStep('breathe');
    } else if (currentStep === 'breathe') {
      setCurrentStep('complete');
    }
  };

  const handleRestart = () => {
    setCurrentStep('intro');
  };

  const getStepContent = () => {
    switch (currentStep) {
      case 'stand':
        return {
          title: 'Stand up',
          instruction: 'Just rise. Feel your feet on the ground.',
          description: 'No need to think about what comes next. Just stand.',
          icon: <div className="w-8 h-16 bg-blue-400 rounded-lg mx-auto"></div>
        };
      case 'walk':
        return {
          title: 'Take a few slow steps',
          instruction: 'Even if it\'s just across the room.',
          description: 'With every step, drop the last thought. Step. Let go. Step. Clear space.',
          icon: <RefreshCw className="h-8 w-8" />
        };
      case 'breathe':
        return {
          title: 'Breathe it out',
          instruction: 'Breathe out what you don\'t need.',
          description: 'Breathe in what helps you restart. You\'re moving again.',
          icon: <div className="w-8 h-8 rounded-full bg-green-400 animate-pulse"></div>
        };
      default:
        return null;
    }
  };

  const stepContent = getStepContent();

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <WellnessHeader title="Break the Loop" backPath="/mindfulness/walking" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-8">
        {/* Intro */}
        {currentStep === 'intro' && (
          <div className="text-center space-y-8 flex flex-col justify-center h-full">
            <div className="w-24 h-24 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-blue-500/30 flex items-center justify-center">
                <RefreshCw className="h-8 w-8 text-blue-400" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white">Feeling stuck?</h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Let's break the loop.
              </p>
              <p className="text-white/60 text-base">
                Sometimes the simplest movement can shift everything. Ready to reset?
              </p>
            </div>

            <Button
              onClick={handleStart}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-4 text-lg font-medium"
            >
              Break the Loop
            </Button>
          </div>
        )}

        {/* Action Steps */}
        {stepContent && (
          <div className="space-y-8 text-center">
            {/* Progress */}
            <div className="flex justify-center space-x-2">
              {['stand', 'walk', 'breathe'].map((step, index) => (
                <div
                  key={step}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    ['stand', 'walk', 'breathe'].indexOf(currentStep) >= index ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>

            <div className="space-y-6">
              <div className="w-20 h-20 mx-auto rounded-2xl bg-blue-500/20 flex items-center justify-center">
                {stepContent.icon}
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-semibold text-white">{stepContent.title}</h2>
                <p className="text-white/80 text-lg">{stepContent.instruction}</p>
                <p className="text-white/60 leading-relaxed">{stepContent.description}</p>
              </div>

              <Button
                onClick={handleNext}
                className="bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-3 px-8 flex items-center mx-auto space-x-2"
              >
                <span>Continue</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Complete */}
        {currentStep === 'complete' && (
          <div className="text-center space-y-8 flex flex-col justify-center h-full">
            <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/30 flex items-center justify-center">
                <RefreshCw className="h-8 w-8 text-green-400" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white">You're back</h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Ready to re-engage.
              </p>
              <p className="text-white/60 italic">
                The loop is broken. Your mind has space to move forward.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleRestart}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-4 text-lg font-medium"
              >
                Break Another Loop
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

export default BreakLoopWalk;
