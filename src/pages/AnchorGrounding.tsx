
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Hand, Ear, Nose, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';

interface GroundingStep {
  id: string;
  icon: React.ReactNode;
  title: string;
  instruction: string;
  count: number;
  color: string;
}

const groundingSteps: GroundingStep[] = [
  {
    id: 'see',
    icon: <Eye className="h-8 w-8" />,
    title: 'Look around',
    instruction: 'Can you name 5 things you can see?',
    count: 5,
    color: 'bg-blue-500/20 text-blue-300'
  },
  {
    id: 'touch',
    icon: <Hand className="h-8 w-8" />,
    title: 'Feel around',
    instruction: 'What are 4 things you can touch?',
    count: 4,
    color: 'bg-green-500/20 text-green-300'
  },
  {
    id: 'hear',
    icon: <Ear className="h-8 w-8" />,
    title: 'Listen in',
    instruction: 'Catch 3 things you can hear, even faintly.',
    count: 3,
    color: 'bg-purple-500/20 text-purple-300'
  },
  {
    id: 'smell',
    icon: <Nose className="h-8 w-8" />,
    title: 'Breathe deep',
    instruction: 'Notice 2 things you can smell.',
    count: 2,
    color: 'bg-orange-500/20 text-orange-300'
  },
  {
    id: 'taste',
    icon: <Zap className="h-8 w-8" />,
    title: 'And if you can',
    instruction: '1 thing you can taste.',
    count: 1,
    color: 'bg-pink-500/20 text-pink-300'
  }
];

const AnchorGrounding = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<'intro' | number | 'breathing' | 'complete'>('intro');
  const [foundItems, setFoundItems] = useState<string[]>([]);

  const handleStart = () => {
    setCurrentStep(0);
    setFoundItems([]);
  };

  const handleNext = () => {
    if (typeof currentStep === 'number') {
      if (currentStep < groundingSteps.length - 1) {
        setCurrentStep(currentStep + 1);
        setFoundItems([]);
      } else {
        setCurrentStep('breathing');
      }
    } else if (currentStep === 'breathing') {
      setCurrentStep('complete');
    }
  };

  const handleAddItem = (item: string) => {
    if (item.trim() && !foundItems.includes(item.trim())) {
      setFoundItems([...foundItems, item.trim()]);
    }
  };

  const handleRestart = () => {
    setCurrentStep('intro');
    setFoundItems([]);
  };

  const currentStepData = typeof currentStep === 'number' ? groundingSteps[currentStep] : null;
  const canProceed = typeof currentStep === 'number' && foundItems.length >= currentStepData!.count;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <WellnessHeader title="Anchor" backPath="/meditation" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-8">
        {/* Intro */}
        {currentStep === 'intro' && (
          <div className="text-center space-y-8 flex flex-col justify-center h-full">
            <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/30 flex items-center justify-center">
                <Zap className="h-8 w-8 text-green-400" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white">Feeling overwhelmed?</h1>
              <p className="text-white/70 text-lg leading-relaxed">
                Hey, you're okay. Let's come back to now — together.
              </p>
              <p className="text-white/60 text-base">
                We'll use your 5 senses to ground you in the present moment.
              </p>
            </div>

            <Button
              onClick={handleStart}
              className="bg-green-500 hover:bg-green-600 text-white rounded-2xl py-4 text-lg font-medium"
            >
              Start Grounding
            </Button>
          </div>
        )}

        {/* Grounding Steps */}
        {typeof currentStep === 'number' && currentStepData && (
          <div className="space-y-8">
            {/* Progress */}
            <div className="flex justify-center space-x-2">
              {groundingSteps.map((_, index) => (
                <div
                  key={index}
                  className={`w-3 h-3 rounded-full transition-colors ${
                    index <= currentStep ? 'bg-white' : 'bg-white/30'
                  }`}
                />
              ))}
            </div>

            {/* Step Content */}
            <div className="text-center space-y-6">
              <div className={`w-20 h-20 mx-auto rounded-2xl ${currentStepData.color} flex items-center justify-center`}>
                {currentStepData.icon}
              </div>

              <div>
                <h2 className="text-2xl font-semibold text-white mb-2">{currentStepData.title}</h2>
                <p className="text-white/70 text-lg">{currentStepData.instruction}</p>
              </div>

              {/* Found Items */}
              <div className="space-y-3">
                {Array.from({ length: currentStepData.count }, (_, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border-2 border-dashed transition-colors ${
                      foundItems[i] 
                        ? 'border-green-400 bg-green-500/10 text-white' 
                        : 'border-white/30 text-white/50'
                    }`}
                  >
                    {foundItems[i] || `${currentStepData.count - i} more to find...`}
                  </div>
                ))}
              </div>

              {/* Input for adding items */}
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder={`What do you ${currentStepData.id}?`}
                  className="w-full p-4 rounded-xl bg-secondary/30 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-white/40"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleAddItem(e.currentTarget.value);
                      e.currentTarget.value = '';
                    }
                  }}
                />
                
                <Button
                  onClick={handleNext}
                  disabled={!canProceed}
                  className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-xl py-3"
                >
                  {canProceed ? 'Continue' : `Find ${currentStepData.count - foundItems.length} more`}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Breathing Step */}
        {currentStep === 'breathing' && (
          <div className="text-center space-y-8 flex flex-col justify-center h-full">
            <div className="w-24 h-24 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center animate-pulse">
              <div className="w-16 h-16 rounded-full bg-blue-500/30"></div>
            </div>
            
            <div className="space-y-4">
              <h2 className="text-2xl font-semibold text-white">Now take a long, deep breath</h2>
              <p className="text-white/70 text-lg">Inhale. Hold. Exhale.</p>
            </div>

            <Button
              onClick={handleNext}
              className="bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-4 text-lg font-medium"
            >
              I'm ready
            </Button>
          </div>
        )}

        {/* Complete */}
        {currentStep === 'complete' && (
          <div className="text-center space-y-8 flex flex-col justify-center h-full">
            <div className="w-24 h-24 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
              <div className="w-16 h-16 rounded-full bg-green-500/30 flex items-center justify-center">
                <Zap className="h-8 w-8 text-green-400" />
              </div>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-3xl font-bold text-white">You're here. You're present.</h1>
              <p className="text-white/70 text-lg leading-relaxed">
                You're okay.
              </p>
              <p className="text-white/60 italic">
                Take a moment to notice how you feel right now.
              </p>
            </div>

            <div className="space-y-4">
              <Button
                onClick={handleRestart}
                className="w-full bg-green-500 hover:bg-green-600 text-white rounded-2xl py-4 text-lg font-medium"
              >
                Practice Again
              </Button>
              <Button
                onClick={() => navigate('/meditation')}
                variant="outline"
                className="w-full rounded-2xl py-3"
              >
                Back to Meditation
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AnchorGrounding;
