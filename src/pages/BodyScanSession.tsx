
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pause, Play, SkipForward, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import VoiceToggle from '@/components/wellness/VoiceToggle';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useSpokenGuidance } from '@/hooks/use-spoken-guidance';

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

/** The completion screen's own words — not the quote beneath them. */
const COMPLETION_LINE =
  "You've completed your body scan. Take a moment to notice how you feel.";

const BodyScanSession = () => {
  const navigate = useNavigate();
  
  const [currentStep, setCurrentStep] = useState(0);
  // Starts paused. Arriving on this route used to begin the scan on its own,
  // which with voice would mean the app talking at whoever opened it.
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(bodyScanSteps[0].duration);
  const [showCompletion, setShowCompletion] = useState(false);

  const { data: settings } = useUserSettings();
  const voice = useSpokenGuidance({ volume: (settings?.sound_volume ?? 75) / 100 });
  const { speak, repeat, cancel: cancelVoice } = voice;

  const currentInstruction = bodyScanSteps[currentStep].instruction;
  const stepKey = `step-${currentStep}`;

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

  // One utterance per step, driven by committed state rather than from inside
  // the timer's updater. Silent until the user starts.
  useEffect(() => {
    if (!isPlaying || showCompletion) return;
    speak(stepKey, currentInstruction);
  }, [isPlaying, showCompletion, stepKey, currentInstruction, speak]);

  useEffect(() => {
    if (!showCompletion) return;
    speak('complete', COMPLETION_LINE);
  }, [showCompletion, speak]);

  const handleNext = () => {
    // Drop the instruction being read before moving on, so the outgoing step
    // cannot talk over the incoming one.
    cancelVoice();
    if (currentStep < bodyScanSteps.length - 1) {
      setCurrentStep(currentStep + 1);
      setTimeRemaining(bodyScanSteps[currentStep + 1].duration);
    } else {
      setShowCompletion(true);
    }
  };

  const handlePausePlay = () => {
    if (isPlaying) {
      cancelVoice();
      setIsPlaying(false);
      return;
    }

    setHasStarted(true);
    setIsPlaying(true);
    // Starting and resuming both say where we are. A step runs 30-45 seconds,
    // so the instruction is the guidance itself, not a passing cue — coming
    // back to silence would leave the user with nothing to follow.
    repeat(stepKey, currentInstruction);
  };

  const handleVoiceToggle = () => {
    const nextMuted = !voice.muted;
    voice.setMuted(nextMuted);
    // Unmuting mid-step: without this the user waits up to 45 seconds for the
    // guidance they just asked for.
    if (!nextMuted && isPlaying && !showCompletion) repeat(stepKey, currentInstruction);
  };

  const handleExit = () => {
    cancelVoice();
    navigate('/mindfulness/body-scan');
  };

  const handleComplete = () => {
    cancelVoice();
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
            aria-label={hasStarted ? (isPlaying ? 'Pause body scan' : 'Resume body scan') : 'Start body scan'}
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
            aria-label="Skip to the next step"
            className="h-12 w-12 rounded-full hover:bg-white/10"
          >
            <SkipForward className="h-6 w-6 text-white" />
          </Button>

          <VoiceToggle supported={voice.supported} muted={voice.muted} onToggle={handleVoiceToggle} />
        </div>
        
        <p className="text-center text-white/50 text-sm mt-4">
          {hasStarted
            ? `${isPlaying ? 'Pause' : 'Resume'} • Skip • Exit`
            : voice.supported && !voice.muted
              ? 'Press play to begin — each step is read aloud'
              : 'Press play to begin'}
        </p>
      </div>
    </div>
  );
};

export default BodyScanSession;
