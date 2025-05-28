
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
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

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setTimeLeft(timeBoxDuration * 60);
  };

  const handleSettingChange = (setting: string, value: number) => {
    switch (setting) {
      case 'timeBox':
        setTimeBoxDuration(value);
        setTimeLeft(value * 60);
        break;
      case 'interval':
        setIntervalDuration(value);
        break;
      case 'flows':
        setNumberOfFlows(value);
        break;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Status Bar */}
      <div className="w-full max-w-lg mx-auto px-4 pt-2 pb-1">
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
      <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/productivity')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-white text-lg font-medium">Focus Timer</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg w-full mx-auto px-4 flex flex-col items-center justify-center pb-20">
        <TimerBox timeLeft={timeLeft} />
        <ControlButtons 
          isPlaying={isPlaying}
          onPlayPause={handlePlayPause}
          onReset={handleReset}
        />
      </main>

      {/* Floating Settings */}
      <FloatingSettings 
        isOpen={isSettingsOpen}
        onToggle={() => setIsSettingsOpen(!isSettingsOpen)}
        timeBoxDuration={timeBoxDuration}
        intervalDuration={intervalDuration}
        numberOfFlows={numberOfFlows}
        onSettingChange={handleSettingChange}
      />

      {/* Bottom Navigation */}
      <BottomNavigation />
    </div>
  );
};

export default Focus;
