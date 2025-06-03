
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TimerBox from '@/components/focus/TimerBox';
import ControlButtons from '@/components/focus/ControlButtons';
import FloatingSettings from '@/components/focus/FloatingSettings';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const Focus = () => {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(1500); // 25 minutes default
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [timeBoxDuration, setTimeBoxDuration] = useState(25);
  const [intervalDuration, setIntervalDuration] = useState(5);
  const [numberOfFlows, setNumberOfFlows] = useState(4);
  const [isLocked, setIsLocked] = useState(false);
  const [flowsCompleted, setFlowsCompleted] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('focus'); // 'focus' or 'break'

  // Timer functionality
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isPlaying && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isPlaying) {
      // Timer completed
      setIsPlaying(false);
      
      if (currentPhase === 'focus') {
        // Focus session completed
        setFlowsCompleted(prev => prev + 1);
        
        // Start break if not the last flow
        if (flowsCompleted + 1 < numberOfFlows) {
          setCurrentPhase('break');
          setTimeLeft(intervalDuration * 60);
        }
      } else {
        // Break completed, start next focus session
        setCurrentPhase('focus');
        setTimeLeft(timeBoxDuration * 60);
      }
    }

    return () => clearInterval(interval);
  }, [isPlaying, timeLeft, currentPhase, flowsCompleted, numberOfFlows, timeBoxDuration, intervalDuration]);

  const handlePlayPause = () => {
    if (isLocked) return;
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    if (isLocked) return;
    setIsPlaying(false);
    setTimeLeft(timeBoxDuration * 60);
    setFlowsCompleted(0);
    setCurrentPhase('focus');
  };

  const handleSettingChange = (setting: string, value: number) => {
    if (isLocked) return;
    switch (setting) {
      case 'timeBox':
        setTimeBoxDuration(value);
        if (!isPlaying && currentPhase === 'focus') {
          setTimeLeft(value * 60);
        }
        break;
      case 'interval':
        setIntervalDuration(value);
        if (!isPlaying && currentPhase === 'break') {
          setTimeLeft(value * 60);
        }
        break;
      case 'flows':
        setNumberOfFlows(value);
        break;
    }
  };

  const handleLockToggle = () => {
    setIsLocked(!isLocked);
    if (!isLocked) {
      setIsSettingsOpen(false); // Close settings when locking
    }
  };

  const getAffirmationMessage = () => {
    if (flowsCompleted === 0) return "Ready to flow? Let's get started ✨";
    if (flowsCompleted === 1) return "You're in the zone. 1 flow done. Keep glowing ✨";
    return `You're in the zone. ${flowsCompleted} flows done. Keep glowing ✨`;
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground w-[480px] mx-auto relative">
      {/* Lock Overlay */}
      {isLocked && (
        <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-40 flex items-center justify-center">
          <div className="absolute top-20 left-1/2 transform -translate-x-1/2 text-center">
            <Lock className="h-8 w-8 text-white/60 mx-auto mb-2" />
            <p className="text-white/80 text-sm font-medium">Focus Mode Active</p>
            <p className="text-white/60 text-xs mt-1">Tap lock to exit</p>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div className="w-full px-4 pt-2 pb-1">
        <div className="flex justify-between items-center text-white text-sm font-medium">
          <span>09:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
            </div>
            <svg className="w-4 h-4 ml-1" fill="white" viewBox="0 0 24 24">
              <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
            </svg>
            <div className="w-6 h-3 border border-white rounded-sm ml-1">
              <div className="w-4 h-1.5 bg-white rounded-sm m-0.5"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="w-full p-4 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => !isLocked && navigate('/productivity')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
          disabled={isLocked}
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-white text-lg font-medium">Focus Timer</h1>
        
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleLockToggle}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10 z-50"
        >
          <Lock className="h-5 w-5 text-white" />
        </Button>
      </header>

      {/* Flows Counter & Affirmation */}
      <div className="w-full px-4 mb-4">
        <div className="text-center">
          <div className="text-white/60 text-sm mb-1">
            {flowsCompleted}/{numberOfFlows}
          </div>
          {!isPlaying && (
            <>
              {flowsCompleted === 0 && (
                <div className="text-white/80 text-xs font-light">
                  {getAffirmationMessage()}
                </div>
              )}
              {flowsCompleted > 0 && (
                <div className="text-white/80 text-xs font-light">
                  {getAffirmationMessage()}
                </div>
              )}
            </>
          )}
          {currentPhase === 'break' && (
            <div className="text-orange-300/80 text-xs mt-1">
              Break time - recharge for your next flow
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 flex flex-col items-center justify-center pb-20">
        <TimerBox timeLeft={timeLeft} isBreak={currentPhase === 'break'} />
        <ControlButtons 
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
          disabled={isLocked}
        />
      </main>

      {/* Floating Settings */}
      {!isLocked && (
        <FloatingSettings 
          isOpen={isSettingsOpen}
          onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
          timeBoxDuration={timeBoxDuration}
          intervalDuration={intervalDuration}
          numberOfFlows={numberOfFlows}
          onSettingChange={handleSettingChange}
        />
      )}

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default Focus;
