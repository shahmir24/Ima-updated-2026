import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState(null);
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

  // Check if user is authenticated
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth');
        return;
      }
      setUser(user);
    };
    
    checkAuth();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        navigate('/auth');
      } else if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

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

  const saveOnboardingData = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to save your onboarding data.",
        variant: "destructive"
      });
      return false;
    }

    setLoading(true);

    try {
      // One column per question, and an upsert keyed on user_id so re-running
      // onboarding updates the answers instead of creating a second row.
      //
      // There is no user record to create first: the on_auth_user_created
      // trigger seeds profiles and user_settings the moment the account exists.
      const { error: responseError } = await supabase
        .from('onboarding_responses')
        .upsert(
          {
            user_id: user.id,
            reason: data.reason || null,
            daily_feeling: data.dailyFeeling || null,
            struggles: data.struggles,
            adhd_status: data.adhdStatus || null,
            overwhelmed_response: data.overwhelmedResponse || null,
            first_help: data.firstHelp || null,
            support_style: data.supportStyle,
            additional_info: data.additionalInfo.trim() || null,
            stress_level: getStressLevelFromResponses()
          },
          { onConflict: 'user_id' }
        );

      if (responseError) throw responseError;

      // Stamps onboarding as done, so the app can send returning users past it.
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ onboarding_completed_at: new Date().toISOString() })
        .eq('id', user.id);

      if (profileError) throw profileError;

      toast({
        title: "Welcome to iMA! 🌿",
        description: "Your onboarding responses have been saved."
      });

      return true;
    } catch (error: any) {
      console.error('Error saving onboarding data:', error);
      toast({
        title: "Something went wrong",
        description: error.message || "Failed to save your responses. Please try again.",
        variant: "destructive"
      });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const getStressLevelFromResponses = () => {
    // Map responses to stress levels (1-10 scale)
    const stressIndicators = {
      'I shut down': 8,
      'I overcommit': 7,
      'I forget things': 6,
      'I get restless': 7,
      'I power through': 6,
      'Not sure': 5,
      'Overwhelmed': 8,
      'Anxious': 7,
      'Lost': 6,
      'Tired': 5,
      'Calm': 2,
      'Motivated': 3
    };

    const responses = [data.overwhelmedResponse, data.reason, data.dailyFeeling];
    const levels = responses
      .map(response => stressIndicators[response] || 5)
      .filter(level => level > 0);

    return levels.length > 0 ? Math.round(levels.reduce((a, b) => a + b) / levels.length) : 5;
  };

  const handleNext = async () => {
    if (currentStep < questions.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      const success = await saveOnboardingData();
      if (success) {
        navigate('/');
      }
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
            disabled={(!isStepValid() && currentQuestion.type !== 'text') || loading}
            className="w-full py-6 text-lg font-semibold bg-gradient-to-r from-blue-500 to-teal-400 hover:from-blue-600 hover:to-teal-500 disabled:opacity-50"
          >
            {loading ? (
              currentStep < questions.length - 1 ? 'Next →' : 'Saving...'
            ) : (
              currentStep < questions.length - 1 ? 'Next →' : 'Complete →'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
