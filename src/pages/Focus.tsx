
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TimerBox from '@/components/focus/TimerBox';
import ControlButtons from '@/components/focus/ControlButtons';
import FloatingSettings from '@/components/focus/FloatingSettings';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import { useUserSettings } from '@/hooks/use-user-settings';

/**
 * Used until the saved settings arrive, and when a user has no settings row.
 * These are the same values user_settings declares as its column defaults, so
 * the screen never shows one thing before the row loads and another after.
 */
const FALLBACK_BLOCK_MINUTES = 25;
const FALLBACK_BUFFER_MINUTES = 5;
const FALLBACK_FLOWS = 4;

const Focus = () => {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [timeLeft, setTimeLeft] = useState(FALLBACK_BLOCK_MINUTES * 60);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [timeBoxDuration, setTimeBoxDuration] = useState(FALLBACK_BLOCK_MINUTES);
  const [intervalDuration, setIntervalDuration] = useState(FALLBACK_BUFFER_MINUTES);
  const [numberOfFlows, setNumberOfFlows] = useState(FALLBACK_FLOWS);
  const [isLocked, setIsLocked] = useState(false);
  const [flowsCompleted, setFlowsCompleted] = useState(0);
  const [currentPhase, setCurrentPhase] = useState('focus'); // 'focus' or 'break'

  // The timer used to hardcode 25 / 5 / 4 and ignore what the user had saved
  // in App Settings entirely.
  const { data: settings, isFetched: settingsLoaded } = useUserSettings();

  // Seeding happens exactly once, and only before the user has touched
  // anything. Two refs rather than reading state in the effect:
  //   * seededRef stops a refetch — React Query refetches on window focus —
  //     from ever re-applying the saved values to a timer in progress.
  //   * interactedRef closes the seeding window the moment the user presses
  //     play, resets, or changes a setting. Without it, settings arriving
  //     late (or a pause after an early play) could overwrite a session
  //     already under way.
  const seededRef = useRef(false);
  const interactedRef = useRef(false);

  useEffect(() => {
    if (seededRef.current || interactedRef.current || !settingsLoaded) return;
    seededRef.current = true;

    // No row: the fallbacks already in state are the schema's own defaults.
    if (!settings) return;

    setTimeBoxDuration(settings.focus_block_minutes);
    setIntervalDuration(settings.buffer_minutes);
    setNumberOfFlows(settings.default_flows);
    // The timer has not started, so the displayed time follows the block.
    setTimeLeft(settings.focus_block_minutes * 60);
  }, [settingsLoaded, settings]);

  /** Whether to show the pre-session encouragement line. */
  const showEncouragement = settings?.encouragement ?? true;

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
    interactedRef.current = true;
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    if (isLocked) return;
    interactedRef.current = true;
    setIsPlaying(false);
    setTimeLeft(timeBoxDuration * 60);
    setFlowsCompleted(0);
    setCurrentPhase('focus');
  };

  // Session-scoped by design: App Settings holds the persistent default (its
  // label reads "Default Block Length"), and this panel adjusts the session in
  // front of you. A tweak here does not rewrite the saved default.
  const handleSettingChange = (setting: string, value: number) => {
    if (isLocked) return;
    interactedRef.current = true;
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
          {/* "Send me a little boost before I begin" in App Settings. The two
              branches this replaces rendered exactly the same thing for
              flowsCompleted === 0 and > 0. */}
          {!isPlaying && showEncouragement && (
            <div className="text-white/80 text-xs font-light">
              {getAffirmationMessage()}
            </div>
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
