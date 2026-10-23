
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import TimerBox from '@/components/focus/TimerBox';
import ControlButtons from '@/components/focus/ControlButtons';
import RoundIndicator from '@/components/focus/RoundIndicator';
import FloatingSettings, { FocusSettingsList } from '@/components/focus/FloatingSettings';
import FocusRing from '@/components/focus/FocusRing';
import FocusSessionPanel from '@/components/focus/FocusSessionPanel';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import PageWorkspace from '@/components/layout/PageWorkspace';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useTaskSource } from '@/hooks/use-task-source';
import { useFocusTimer } from '@/contexts/focus-timer-context';
import {
  currentRound,
  focusDisplayPhase,
  phaseLengthMs,
  phaseLengthToRemember,
  phaseProgress,
  roundDots,
  type FocusDisplayPhase,
  type RememberedPhase
} from '@/lib/focus/focus-progress';

/**
 * Deliberately narrower than the card hubs. This is a concentration screen, so
 * the timer stays centred and close to itself. On desktop the workspace widens
 * only to fit the session panel beside the timer.
 */
const WORKSPACE = 'max-w-2xl lg:max-w-5xl';

/**
 * The current phase's exact length, as last learned on this page (see
 * focus-progress). Module scope, so it survives leaving /focus and coming
 * back; a refresh clears it, and the ring then relies on what the persisted
 * state can prove. Display only: nothing reads it but the ring.
 */
let rememberedPhase: RememberedPhase | null = null;

const PHASE_LABEL: Record<FocusDisplayPhase, string> = {
  ready: 'Ready',
  focus: 'Focus',
  paused: 'Paused',
  break: 'Break',
  complete: 'Complete'
};

const Focus = () => {
  const navigate = useNavigate();

  /**
   * Optional context. Home passes the id of the task it was showing under
   * Right Now; the title is resolved from the user's own tasks rather than
   * carried in the URL, so it survives a refresh, exposes nothing, and stays
   * subject to the same RLS as every other read. An unknown or absent id
   * simply leaves this the generic Focus Timer.
   */
  const [searchParams] = useSearchParams();
  const requestedTaskId = searchParams.get('task');
  const { tasks, mode } = useTaskSource();
  // In Guest Mode the task comes from the guest store (the same lookup, by id)
  // and useUserSettings below stays idle with no account to read, so the
  // timer runs on its built-in defaults. A guest's timer is kept in the tab
  // only and never recorded; a signed-in session is recorded in focus_sessions.
  //
  // The timer itself lives app-wide (FocusTimerProvider), so a session keeps
  // going while the user is elsewhere in iMA, in another app, or away
  // entirely. This page only shows it and sends it the controls.
  const timer = useFocusTimer();
  const {
    timeLeft,
    isPlaying,
    phase: currentPhase,
    flowsCompleted,
    config: { blockMinutes: timeBoxDuration, breakMinutes: intervalDuration, flows: numberOfFlows }
  } = timer;

  // The URL's task wins, as before; coming back without one (the sidebar, a
  // refresh of /focus) still shows the task the running session was started for.
  const shownTaskId = requestedTaskId ?? timer.sessionTaskId;
  const focusTask = shownTaskId
    ? tasks.find((task) => task.id === shownTaskId) ?? null
    : null;
  // Desktop ring. Derived from the timer's state for display; never written back.
  const remember = phaseLengthToRemember(timer.state, rememberedPhase);
  if (remember) rememberedPhase = remember;
  const displayPhase = focusDisplayPhase(timer.state);
  const ringProgress = phaseProgress(timer.state, timeLeft, phaseLengthMs(timer.state, rememberedPhase));
  const round = currentRound(timer.state);
  const isFinished = timer.state.finished;
  const ringHint = (() => {
    switch (displayPhase) {
      case 'ready':
        return flowsCompleted > 0 ? `Round ${round} is ready when you are` : 'Press play when you’re ready';
      case 'focus':
        return `Round ${round} of ${numberOfFlows}`;
      case 'break':
        return isPlaying ? 'Rest before the next round' : 'Your break is ready when you are';
      case 'paused':
        return 'Press play to carry on';
      case 'complete':
        return 'All rounds done';
    }
  })();
  // What Play will do, for its accessible name.
  const playLabel = ({ ready: 'Start timer', focus: 'Start timer', paused: 'Resume timer', break: 'Start break', complete: 'Start again' } as const)[displayPhase];
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  // The timer used to hardcode 25 / 5 / 4 and ignore what the user had saved
  // in App Settings entirely.
  const { data: settings, isFetched: settingsLoaded } = useUserSettings();

  // Seeding happens once per visit, and only before the user has touched
  // anything. Two refs rather than reading state in the effect:
  //   * seededRef stops a refetch — React Query refetches on window focus —
  //     from ever re-applying the saved values to a timer in progress.
  //   * interactedRef closes the seeding window the moment the user presses
  //     play, resets, or changes a setting.
  // The timer adds its own rule: a session already under way (or just
  // finished) is never re-timed by settings, on any visit.
  const seededRef = useRef(false);
  const interactedRef = useRef(false);
  const { seed } = timer;

  useEffect(() => {
    if (seededRef.current || interactedRef.current || !settingsLoaded) return;
    seededRef.current = true;

    // No row: the timer's fallbacks are already the schema's own defaults.
    if (!settings) return;

    seed({
      blockMinutes: settings.focus_block_minutes,
      breakMinutes: settings.buffer_minutes,
      flows: settings.default_flows
    });
  }, [settingsLoaded, settings, seed]);

  /** Whether to show the pre-session encouragement line. */
  const showEncouragement = settings?.encouragement ?? true;

  const handlePlayPause = () => {
    if (isLocked) return;
    interactedRef.current = true;
    if (isPlaying) timer.pause();
    else timer.play(requestedTaskId);
  };

  // Reset returns to flow 0 with a fresh block, as before. A session it
  // clears counts as nothing: not completed, not abandoned.
  const handleReset = () => {
    if (isLocked) return;
    interactedRef.current = true;
    timer.reset();
  };

  // Session-scoped by design: App Settings holds the persistent default (its
  // label reads "Default Block Length"), and this panel adjusts the session in
  // front of you. A tweak here does not rewrite the saved default.
  const handleSettingChange = (setting: string, value: number) => {
    if (isLocked) return;
    interactedRef.current = true;
    if (setting === 'timeBox' || setting === 'interval' || setting === 'flows') {
      timer.changeSetting(setting, value);
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
    <div className="flex flex-col min-h-screen bg-background text-foreground relative">
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
      {/* Desktop: the title sits left beside the back arrow, the lock on the right. */}
      <PageWorkspace width={WORKSPACE} className="flex items-center justify-between py-4 lg:justify-start lg:gap-3">
        <Button 
          variant="ghost" 
          size="icon" 
          // Productivity needs an account, so a guest goes back to Home.
          onClick={() => !isLocked && navigate(mode === 'guest' ? '/' : '/productivity')}
          className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
          disabled={isLocked}
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-white text-lg font-medium">Focus Timer</h1>
        
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={handleLockToggle}
          className="h-11 w-11 rounded-full p-0 hover:bg-white/10 z-50 lg:ml-auto"
        >
          <Lock className="h-5 w-5 text-white" />
        </Button>
      </PageWorkspace>

      {/* Flows Counter & Affirmation. Desktop shows the same information in
          the ring, above it and in the session panel instead. */}
      <PageWorkspace width={WORKSPACE} className="mb-4 lg:hidden">
        <div className="text-center">
          <RoundIndicator round={round} flows={numberOfFlows} dots={roundDots(timer.state)} className="mb-1" />
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
          {focusTask && (
            <div className="mt-3">
              <p className="text-white/50 text-xs">Working on</p>
              <p className="text-white text-sm font-medium">{focusTask.title}</p>
            </div>
          )}
        </div>
      </PageWorkspace>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center pb-20 lg:pb-10">
        {/* Desktop: the timer on the left, the session panel on the right. */}
        <PageWorkspace
          width={WORKSPACE}
          className="flex flex-col items-center justify-center lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-center lg:gap-10"
        >
          {/* On phones `contents`, so the timer card and controls stay direct
              children of the column exactly as before. */}
          <div className="contents lg:flex lg:flex-col lg:items-center">
            {focusTask && (
              <div className="hidden lg:block mb-6 max-w-xl text-center">
                <p className="text-white/50 text-sm">Working on</p>
                <p className="mt-1 text-white text-xl font-medium break-words">{focusTask.title}</p>
              </div>
            )}
            <FocusRing
              timeLeft={timeLeft}
              progress={ringProgress}
              label={PHASE_LABEL[displayPhase]}
              hint={ringHint}
              isBreak={currentPhase === 'break' && !isFinished}
              className="hidden lg:flex mb-10"
            />
            <TimerBox timeLeft={timeLeft} isBreak={currentPhase === 'break'} className="lg:hidden" />
            <ControlButtons
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onReset={handleReset}
              disabled={isLocked}
              playLabel={playLabel}
            />
            {!isPlaying && !isFinished && showEncouragement && (
              <p className="hidden lg:block text-white/60 text-sm">{getAffirmationMessage()}</p>
            )}
            {/* Completion, from the timer's own state. Nothing here says the
                session was saved: the timer does not report that. */}
            {isFinished && (
              <div className="hidden lg:block w-full max-w-md rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
                <p className="text-white font-medium">Session complete</p>
                <p className="mt-1 text-white/60 text-sm">
                  {flowsCompleted} of {numberOfFlows} {numberOfFlows === 1 ? 'round' : 'rounds'} ·{' '}
                  {Math.round(timer.state.focusMs / 60000)} min of focus
                </p>
                {mode === 'guest' ? (
                  <p className="mt-3 text-white/40 text-xs">Guest sessions aren’t recorded.</p>
                ) : (
                  <Button variant="secondary" className="mt-4" onClick={() => navigate('/stats')}>
                    View stats
                  </Button>
                )}
                <p className="mt-3 text-white/40 text-xs">Press play to start a new session.</p>
              </div>
            )}
          </div>

          <div className="hidden lg:block">
            <FocusSessionPanel
              round={round}
              flows={numberOfFlows}
              flowsCompleted={flowsCompleted}
              focusMinutes={timeBoxDuration}
              breakMinutes={intervalDuration}
            >
              {isLocked ? (
                <p className="text-white/50 text-sm">Settings are locked while Focus Mode is on.</p>
              ) : (
                <FocusSettingsList
                  className="space-y-2"
                  timeBoxDuration={timeBoxDuration}
                  intervalDuration={intervalDuration}
                  numberOfFlows={numberOfFlows}
                  onSettingChange={handleSettingChange}
                />
              )}
            </FocusSessionPanel>
          </div>
        </PageWorkspace>
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
