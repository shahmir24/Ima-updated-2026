import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface OnboardingData {
  reason: string;
  dailyFeeling: string;
  struggles: string[];
  adhdStatus: string;
  overwhelmedResponse: string;
  firstHelp: string;
  supportStyle: string[];
  additionalInfo: string;
}

const Onboarding = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    reason: '',
    dailyFeeling: '',
    struggles: [],
    adhdStatus: '',
    overwhelmedResponse: '',
    firstHelp: '',
    supportStyle: [],
    additionalInfo: ''
  });

  const questions = [
    {
      title: "What brings you to iMA today?",
      type: "radio",
      field: "reason",
      options: [
        "I want to feel more in control",
        "I'm overwhelmed",
        "I want to be more consistent",
        "Just exploring",
        "Other"
      ]
    },
    {
      title: "How do you usually feel at the start of your day?",
      type: "radio",
      field: "dailyFeeling",
      options: [
        "Calm",
        "Anxious",
        "Motivated",
        "Lost",
        "Tired",
        "Hyperfocused"
      ]
    },
    {
      title: "Which of these do you struggle with the most?",
      type: "multiselect",
      field: "struggles",
      options: [
        "Staying focused",
        "Managing time",
        "Regulating emotions",
        "Remembering things",
        "Falling asleep",
        "Managing stress"
      ]
    },
    {
      title: "Have you been diagnosed with ADHD or suspect you have it?",
      type: "radio",
      field: "adhdStatus",
      options: [
        "Yes",
        "Diagnosed",
        "Suspect I have it",
        "No",
        "Prefer not to say"
      ]
    },
    {
      title: "When you're overwhelmed, what usually happens?",
      type: "radio",
      field: "overwhelmedResponse",
      options: [
        "I shut down",
        "I overcommit",
        "I forget things",
        "I get restless",
        "I power through",
        "Not sure"
      ]
    },
    {
      title: "What would you love iMA to help you with first?",
      type: "radio",
      field: "firstHelp",
      options: [
        "Breathing & calm",
        "Focus & flow",
        "Managing my day",
        "Organizing my thoughts",
        "Panic attack help",
        "Journaling"
      ]
    },
    {
      title: "How do you want iMA to support you?",
      type: "multiselect",
      field: "supportStyle",
      options: [
        "Gentle nudges",
        "Structured guidance",
        "A supportive friend vibe",
        "Task & mood tracking",
        "AI buddy for motivation"
      ]
    },
    {
      title: "Anything else you want us to know about you?",
      type: "text",
      field: "additionalInfo",
      placeholder: "Tell us anything that would help us help you better"
    }
  ];

  const handleNext = () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      // Store onboarding data in localStorage
      localStorage.setItem('onboardingData', JSON.stringify(data));
      navigate('/auth');
    }
  };

  const handleRadioChange = (field: string, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const handleMultiSelectChange = (field: string, value: string, checked: boolean) => {
    setData(prev => ({
      ...prev,
      [field]: checked 
        ? [...prev[field as keyof OnboardingData] as string[], value]
        : (prev[field as keyof OnboardingData] as string[]).filter(item => item !== value)
    }));
  };

  const handleTextChange = (field: string, value: string) => {
    setData(prev => ({ ...prev, [field]: value }));
  };

  const isStepValid = () => {
    const currentQuestion = questions[currentStep];
    const currentValue = data[currentQuestion.field as keyof OnboardingData];
    
    if (currentQuestion.type === 'text') {
      return true; // Text fields are optional
    } else if (currentQuestion.type === 'multiselect') {
      return Array.isArray(currentValue) && currentValue.length > 0;
    } else {
      return currentValue && currentValue.length > 0;
    }
  };

  const currentQuestion = questions[currentStep];

  if (currentStep === -1) {
    return (
      <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center px-6">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl font-bold font-morisawa">Hey there 👋</h1>
            <h2 className="text-2xl font-semibold text-muted-foreground">Let's get to know you!</h2>
            <p className="text-lg text-muted-foreground">
              We'll ask a few gentle questions to personalize your iMA experience
            </p>
          </div>
          
          <Button 
            onClick={() => setCurrentStep(0)}
            className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-blue-500 to-teal-400 hover:from-blue-600 hover:to-teal-500"
          >
            Let's begin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Progress indicator */}
      <div className="w-full bg-secondary p-4">
        <div className="max-w-md mx-auto">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm text-muted-foreground">
              Question {currentStep + 1} of {questions.length}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(((currentStep + 1) / questions.length) * 100)}%
            </span>
          </div>
          <div className="w-full bg-muted rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-blue-500 to-teal-400 h-2 rounded-full transition-all duration-300"
              style={{ width: `${((currentStep + 1) / questions.length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Question content */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-md w-full space-y-8">
          <h2 className="text-2xl font-bold text-center leading-relaxed">
            {currentQuestion.title}
          </h2>

          <div className="space-y-4">
            {currentQuestion.type === 'radio' && (
              <RadioGroup
                value={data[currentQuestion.field as keyof OnboardingData] as string}
                onValueChange={(value) => handleRadioChange(currentQuestion.field, value)}
                className="space-y-3"
              >
                {currentQuestion.options?.map((option, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                    <RadioGroupItem value={option} id={`option-${index}`} />
                    <Label htmlFor={`option-${index}`} className="text-base cursor-pointer flex-1">
                      {option}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            )}

            {currentQuestion.type === 'multiselect' && (
              <div className="space-y-3">
                {currentQuestion.options?.map((option, index) => (
                  <div key={index} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-secondary/50 transition-colors">
                    <Checkbox
                      id={`checkbox-${index}`}
                      checked={(data[currentQuestion.field as keyof OnboardingData] as string[])?.includes(option)}
                      onCheckedChange={(checked) => 
                        handleMultiSelectChange(currentQuestion.field, option, checked as boolean)
                      }
                    />
                    <Label htmlFor={`checkbox-${index}`} className="text-base cursor-pointer flex-1">
                      {option}
                    </Label>
                  </div>
                ))}
              </div>
            )}

            {currentQuestion.type === 'text' && (
              <Textarea
                placeholder={currentQuestion.placeholder}
                value={data[currentQuestion.field as keyof OnboardingData] as string}
                onChange={(e) => handleTextChange(currentQuestion.field, e.target.value)}
                className="min-h-[120px] text-base"
              />
            )}
          </div>

          <Button
            onClick={handleNext}
            disabled={!isStepValid() && currentQuestion.type !== 'text'}
            className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-blue-500 to-teal-400 hover:from-blue-600 hover:to-teal-500 disabled:opacity-50"
          >
            {currentStep < questions.length - 1 ? 'Next →' : 'Complete →'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
