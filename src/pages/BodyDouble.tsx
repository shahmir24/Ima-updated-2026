import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Play, Pause, RotateCcw, Heart, Brain, Meh, CheckCircle,
  Edit3, Wind, Volume2, ListChecks, LifeBuoy
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import { useToast } from '@/hooks/use-toast';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useSaveJournalEntry } from '@/hooks/use-journal';
import { useFocusSession } from '@/hooks/use-focus-session';
import { useTasks } from '@/hooks/use-tasks';
import { useTaskBreakdown } from '@/hooks/use-task-breakdown';
import StepSuggestions from '@/components/bodydouble/StepSuggestions';

/**
 * Body Double — quiet co-working presence.
 *
 * One part of this screen now asks a service for suggestions: "Break it down"
 * sends the task text, and the step being narrowed, to the ai-breakdown Edge
 * Function and shows what comes back. That is the whole of it. Everything else
 * here is still unmodelled — the nudges are canned and on a timer, the support
 * area never claims to have read anything, and nothing infers the user's state
 * from how long they went without clicking.
 *
 * What the suggestions are NOT: they are not evidence that iMA can see the
 * screen, the user's attention, their mood or their surroundings. Nothing but
 * the words in the task and the current step is ever sent, and nothing that
 * comes back is stored — suggestions live in this component's state until the
 * dialog closes and are not memory of any kind.
 *
 * The manual path is untouched and stays the fallback: the "write your own
 * step" field is visible and usable whether suggestions are idle, loading,
 * returned or broken, and a failed call leaves this screen working exactly as
 * it did before any of it existed.
 */

interface SupportMessage {
  id: string;
  /** 'nudge' = scheduled encouragement, 'status' = something that happened. */
  kind: 'nudge' | 'status';
  text: string;
}

interface SessionState {
  isActive: boolean;
  timeRemaining: number;
  totalTime: number;
  phase: 'work' | 'break';
  /** Completed work blocks — focus_sessions.flows_completed. */
  cycles: number;
  /** Completed break blocks — focus_sessions.breaks_taken. */
  breaksTaken: number;
  /** Active work-phase seconds only. Pauses and breaks do not count. */
  focusSeconds: number;
  intention: string;
  mood: string;
  startType: string;
}

interface SessionWrapUp {
  didWell: string;
  wantToImprove: string;
  endMood: string;
}

/** Matches the user_settings column defaults. */
const FALLBACK_BLOCK_MINUTES = 25;
const FALLBACK_BREAK_MINUTES = 5;

const moods = [
  { name: 'calm', icon: '😌', color: 'from-blue-400 to-blue-600' },
  { name: 'anxious', icon: '😰', color: 'from-yellow-400 to-orange-500' },
  { name: 'sleepy', icon: '😴', color: 'from-purple-400 to-indigo-500' },
  { name: 'fire', icon: '🔥', color: 'from-red-400 to-pink-500' },
  { name: 'scattered', icon: '🌪️', color: 'from-gray-400 to-gray-600' }
];

const startOptions = [
  { id: 'task', title: 'Task I want to focus on', icon: CheckCircle },
  { id: 'scattered', title: "I'm feeling scattered", icon: Brain },
  { id: 'lost', title: "I don't know where to start", icon: Meh }
];

/**
 * Canned encouragement on a schedule — nothing more is claimed.
 *
 * Fractions of the work block rather than fixed seconds, so they land whatever
 * block length the user has saved, and `>=` rather than `===`, so a tick lost
 * to a throttled background tab does not skip the nudge entirely.
 */
const NUDGE_MILESTONES = [
  {
    at: 0.25,
    lines: [
      'Still with it? One small step is enough.',
      'No rush. Small and steady counts.',
      "Whatever you've done so far is a start."
    ]
  },
  {
    at: 0.6,
    lines: [
      "You don't need to finish everything. Just keep moving.",
      'Want to keep going, or take a quick reset after this block?',
      'Still here with you. Keep going at your pace.'
    ]
  }
];

const BodyDouble = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'session' | 'wrapup'>('welcome');
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [showSupport, setShowSupport] = useState(false);
  const [supportView, setSupportView] = useState<'options' | 'break-down'>('options');
  const [nextStepDraft, setNextStepDraft] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [showNudge, setShowNudge] = useState(false);
  const [nudgeText, setNudgeText] = useState('');
  const [journalSaved, setJournalSaved] = useState(false);

  /**
   * Co-working and timeboxing are not the same thing. 'timed' keeps the
   * existing behaviour — the saved Focus block starts counting down — while
   * 'untimed' simply stays with the user: no countdown, and the elapsed time
   * is tracked only so the session still records a real duration.
   */
  const [timerMode, setTimerMode] = useState<'timed' | 'untimed'>('timed');
  /**
   * True when the intention should be shown as an editable field rather than
   * a list to pick from: either the user asked for "Something else", or a task
   * was handed over from Home and is therefore already known.
   */
  const [showIntentionField, setShowIntentionField] = useState(false);

  const [blockMinutes, setBlockMinutes] = useState(FALLBACK_BLOCK_MINUTES);
  const [breakMinutes, setBreakMinutes] = useState(FALLBACK_BREAK_MINUTES);

  const [session, setSession] = useState<SessionState>({
    isActive: false,
    timeRemaining: FALLBACK_BLOCK_MINUTES * 60,
    totalTime: FALLBACK_BLOCK_MINUTES * 60,
    phase: 'work',
    cycles: 0,
    breaksTaken: 0,
    focusSeconds: 0,
    intention: '',
    mood: '',
    startType: ''
  });

  const [wrapUp, setWrapUp] = useState<SessionWrapUp>({
    didWell: '',
    wantToImprove: '',
    endMood: ''
  });

  const { data: settings, isFetched: settingsReady } = useUserSettings();
  const recorder = useFocusSession();

  /**
   * Context handoff. Home's "I'm stuck" passes the id of the task it was
   * showing, so this screen already knows what the user is stuck on instead of
   * asking again. The title is resolved from the user's own tasks, so nothing
   * is carried in the URL and RLS still applies. Reached with no id — from the
   * sidebar, say — the generic intake is unchanged.
   */
  const [searchParams] = useSearchParams();
  const requestedTaskId = searchParams.get('task');
  const { data: allTasks = [] } = useTasks();
  const handedOffTask = requestedTaskId
    ? allTasks.find((task) => task.id === requestedTaskId) ?? null
    : null;

  /**
   * The user's own unfinished work, offered instead of an empty text field.
   * useTasks() already orders by date, so overdue and today's tasks come
   * first, and the list is capped to stay a choice rather than a backlog.
   */
  const pickableTasks = allTasks.filter((task) => !task.completed).slice(0, 6);
  const saveJournalEntry = useSaveJournalEntry('body-double');

  /**
   * Suggested steps. Session-local and never persisted: closing the dialog or
   * starting another session drops them.
   */
  const breakdown = useTaskBreakdown();

  const messageSeq = useRef(0);
  const firedNudgesRef = useRef<Set<string>>(new Set());
  const nudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingJournalRef = useRef(false);
  const startedRef = useRef(false);

  const pushSupport = useCallback((kind: SupportMessage['kind'], text: string) => {
    messageSeq.current += 1;
    const message: SupportMessage = { id: `m${messageSeq.current}`, kind, text };
    // Idempotent by id: React is free to re-invoke a state updater against an
    // already-committed baseline, and a plain append would then duplicate the
    // message (and its key).
    setSupportMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
  }, []);

  const flashNudge = useCallback(
    (text: string) => {
      setNudgeText(text);
      setShowNudge(true);
      if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
      nudgeTimerRef.current = setTimeout(() => setShowNudge(false), 6000);
      pushSupport('nudge', text);
    },
    [pushSupport]
  );

  useEffect(() => () => {
    if (nudgeTimerRef.current) clearTimeout(nudgeTimerRef.current);
  }, []);

  // Saved timer settings, seeded once. A later refetch must not move the clock
  // of a session already running.
  const handoffSeededRef = useRef(false);
  useEffect(() => {
    if (handoffSeededRef.current || !handedOffTask) return;
    handoffSeededRef.current = true;
    setSession((prev) => ({ ...prev, intention: handedOffTask.title, startType: 'task' }));
    // Already known — do not offer a picker that asks the same question again.
    setShowIntentionField(true);
  }, [handedOffTask]);

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || !settingsReady) return;
    seededRef.current = true;
    if (!settings) return;

    setBlockMinutes(settings.focus_block_minutes);
    setBreakMinutes(settings.buffer_minutes);
    if (startedRef.current) return;
    setSession((prev) => ({
      ...prev,
      timeRemaining: settings.focus_block_minutes * 60,
      totalTime: settings.focus_block_minutes * 60
    }));
  }, [settingsReady, settings]);

  // One interval for the whole run, restarted only when the clock starts or
  // stops — not rebuilt every tick.
  /**
   * Untimed companionship still needs a real duration for focus_sessions, so
   * time spent on the screen is counted up. Nothing counts down, and this
   * never touches timeRemaining.
   */
  useEffect(() => {
    if (currentScreen !== 'session' || timerMode !== 'untimed') return;

    const interval = setInterval(() => {
      setSession((prev) => ({ ...prev, focusSeconds: prev.focusSeconds + 1 }));
    }, 1000);

    return () => clearInterval(interval);
  }, [currentScreen, timerMode]);

  useEffect(() => {
    if (!session.isActive || timerMode === 'untimed') return;

    const interval = setInterval(() => {
      setSession((prev) => {
        if (!prev.isActive || prev.timeRemaining <= 0) return prev;
        return {
          ...prev,
          timeRemaining: prev.timeRemaining - 1,
          // Only a running work block counts as focus time.
          focusSeconds: prev.phase === 'work' ? prev.focusSeconds + 1 : prev.focusSeconds
        };
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [session.isActive, timerMode]);

  // Keep the recorder's copy of the counters current, so leaving early still
  // records the focus time that was actually earned.
  const { reportProgress } = recorder;
  useEffect(() => {
    reportProgress({
      flowsCompleted: session.cycles,
      breaksTaken: session.breaksTaken,
      focusSeconds: session.focusSeconds
    });
  }, [reportProgress, session.cycles, session.breaksTaken, session.focusSeconds]);

  const blockSeconds = blockMinutes * 60;
  const breakSeconds = breakMinutes * 60;

  // Phase rollover. The next phase does not auto-start: the user decides when
  // to begin a break, and when to come back.
  useEffect(() => {
    if (!session.isActive || timerMode === 'untimed' || session.timeRemaining > 0) return;

    // The phase in this render IS the one that just ran out, so it can be read
    // directly. Reading it inside the updater below would be a race: React is
    // free to run an updater after this effect body has finished.
    const wasWork = session.phase === 'work';
    const nextSeconds = wasWork ? breakSeconds : blockSeconds;

    setSession((prev) => ({
      ...prev,
      isActive: false,
      phase: wasWork ? 'break' : 'work',
      cycles: wasWork ? prev.cycles + 1 : prev.cycles,
      breaksTaken: wasWork ? prev.breaksTaken : prev.breaksTaken + 1,
      timeRemaining: nextSeconds,
      totalTime: nextSeconds
    }));

    pushSupport(
      'status',
      wasWork
        ? `Block done. A ${breakMinutes}-minute break is ready when you are.`
        : 'Break over. Start the next block whenever you like.'
    );
  }, [
    session.isActive, session.timeRemaining, session.phase, timerMode,
    blockSeconds, breakSeconds, breakMinutes, pushSupport
  ]);

  // Scheduled nudges: once per work block, per milestone.
  useEffect(() => {
    if (!session.isActive || timerMode === 'untimed' || session.phase !== 'work' || session.totalTime <= 0) return;

    const elapsedFraction = (session.totalTime - session.timeRemaining) / session.totalTime;

    for (const milestone of NUDGE_MILESTONES) {
      if (elapsedFraction < milestone.at) continue;
      const token = `${session.cycles}:${milestone.at}`;
      if (firedNudgesRef.current.has(token)) continue;
      firedNudgesRef.current.add(token);
      flashNudge(milestone.lines[session.cycles % milestone.lines.length]);
    }
  }, [
    session.isActive, session.phase, session.timeRemaining,
    session.totalTime, session.cycles, timerMode, flashNudge
  ]);

  const startSession = async () => {
    startedRef.current = true;
    // 'untimed' leaves isActive false, which is what the countdown effect
    // watches, so no clock starts. The elapsed counter below runs instead.
    const timed = timerMode === 'timed';
    setSession((prev) => ({ ...prev, isActive: timed }));
    setCurrentScreen('session');

    pushSupport('status', `Working on: ${session.intention}`);
    pushSupport(
      'nudge',
      timed
        ? "I'll keep time and check in now and then. Nothing here is watching your screen."
        : "No timer running. I'll stay here until you say you're done. Nothing here is watching your screen."
    );

    await recorder.start({
      intention: session.intention,
      startType: session.startType,
      startMood: session.mood,
      // An untimed session planned no block, so it stores none rather than
      // claiming the saved Focus settings it never used.
      plannedBlockMinutes: timed ? blockMinutes : null,
      plannedBreakMinutes: timed ? breakMinutes : null
    });
  };

  const toggleTimer = () => {
    setSession((prev) => ({ ...prev, isActive: !prev.isActive }));
  };

  const resetBlock = () => {
    firedNudgesRef.current = new Set();
    setSession((prev) => ({
      ...prev,
      isActive: false,
      timeRemaining: prev.phase === 'work' ? blockSeconds : breakSeconds,
      totalTime: prev.phase === 'work' ? blockSeconds : breakSeconds
    }));
    pushSupport('status', 'Block reset. Start again when you are ready.');
  };

  const openSupport = () => {
    setSupportView('options');
    setNextStepDraft(nextStep);
    // Each stuck moment starts clean. Carrying the previous one's suggestions
    // forward would show steps for a step the user has already moved past.
    breakdown.reset();
    setShowSupport(true);
  };

  /**
   * Entering the break-down view always starts clean.
   *
   * Resetting in openSupport alone was not enough: "Back" returns to the
   * options view without closing the dialog, so re-entering would show the
   * steps from before — and, if a request was still in flight, would show a
   * permanently disabled "Thinking…" belonging to a view the user had left.
   */
  const openBreakDownView = () => {
    breakdown.reset();
    setSupportView('break-down');
  };

  /**
   * The one way a next step is set, whether it was typed or picked from a
   * suggestion. Unchanged in behaviour from when it was inlined in
   * saveNextStep: same trim, same guard, same state, same support message.
   */
  const commitNextStep = (candidate: string) => {
    const step = candidate.trim();
    if (!step) return;
    setNextStep(step);
    setNextStepDraft(step);
    setShowSupport(false);
    setSupportView('options');
    breakdown.reset();
    pushSupport('status', `Next step: ${step}`);
  };

  const saveNextStep = () => {
    commitNextStep(nextStepDraft);
  };

  /**
   * Picking a suggestion goes through commitNextStep, exactly as typing one
   * does. There is one way a next step is set, one place it is announced into
   * the support log, and no second parallel system to keep in agreement.
   */
  const startWithSuggestion = (step: string) => {
    commitNextStep(step);
  };

  const handleSessionComplete = async () => {
    setSession((prev) => ({ ...prev, isActive: false }));
    setCurrentScreen('wrapup');

    // Recorded now, not when the reflection is written: the session really did
    // end here, and closing the wrap-up must never turn it into an abandon.
    await recorder.complete({
      flowsCompleted: session.cycles,
      breaksTaken: session.breaksTaken,
      focusSeconds: session.focusSeconds
    });
  };

  const handleSaveReflection = async () => {
    // A ref, not the mutation's isPending: two taps in one tick read the same
    // render's value and would both write.
    if (savingJournalRef.current || journalSaved) return;

    const didWell = wrapUp.didWell.trim();
    const toImprove = wrapUp.wantToImprove.trim();
    const endMood = wrapUp.endMood || null;

    if (!didWell && !toImprove && !endMood) {
      toast({
        title: 'Nothing to save yet',
        description: 'Write a line or pick how you feel, then save.'
      });
      return;
    }

    savingJournalRef.current = true;
    try {
      const sessionSaved = await recorder.saveReflection({
        endMood,
        reflectionDidWell: didWell || null,
        reflectionToImprove: toImprove || null
      });

      // An empty reflection is not a journal entry.
      if (!didWell && !toImprove) {
        toast({
          title: sessionSaved ? 'Saved with this session' : 'Saved on this screen only',
          description: sessionSaved
            ? 'Write a line if you would like it in your journal too.'
            : 'We could not reach the server, so nothing was stored.'
        });
        return;
      }

      await saveJournalEntry.mutateAsync({ didWell, toImprove });
      setJournalSaved(true);
      toast({
        title: 'Saved to your journal',
        description: 'You can read it back under Past Entries.'
      });
    } catch (saveError) {
      // The text stays on screen so it can be saved again.
      toast({
        title: 'Could not save your reflection',
        description: saveError instanceof Error ? saveError.message : 'Please try again.',
        variant: 'destructive'
      });
    } finally {
      savingJournalRef.current = false;
    }
  };

  const startAnotherSession = () => {
    firedNudgesRef.current = new Set();
    startedRef.current = false;
    messageSeq.current = 0;
    setSupportMessages([]);
    setNextStep('');
    setNextStepDraft('');
    // Suggestions belong to the session that asked for them.
    breakdown.reset();
    setJournalSaved(false);
    setWrapUp({ didWell: '', wantToImprove: '', endMood: '' });
    setSession({
      isActive: false,
      timeRemaining: blockSeconds,
      totalTime: blockSeconds,
      phase: 'work',
      cycles: 0,
      breaksTaken: 0,
      focusSeconds: 0,
      intention: '',
      mood: '',
      startType: ''
    });
    setCurrentScreen('welcome');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage =
    session.totalTime > 0 ? ((session.totalTime - session.timeRemaining) / session.totalTime) * 100 : 0;

  // Welcome Screen
  if (currentScreen === 'welcome') {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
        {/* Header */}
        <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/productivity')}
            className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>

          <h1 className="text-2xl font-bold text-white">BodyDouble</h1>

          <div className="w-10"></div>
        </header>

        {/* Welcome Content */}
        <main className="flex-1 w-full max-w-lg mx-auto px-4 flex flex-col items-center justify-center space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto bg-purple-500/20 rounded-full flex items-center justify-center">
              <Heart className="h-10 w-10 text-purple-300" />
            </div>
            <h2 className="text-2xl font-bold text-white">Hey, what's on your mind today?</h2>
            <p className="text-white/80 text-lg leading-relaxed">
              Let's set the vibe and get you focused ✨
            </p>
          </div>

          {/* Mood Selector */}
          <div className="w-full space-y-4">
            <p className="text-white/80 text-center">How are you feeling?</p>
            <div className="flex justify-center gap-3 flex-wrap">
              {moods.map((mood) => (
                <button
                  key={mood.name}
                  onClick={() => setSession((prev) => ({ ...prev, mood: mood.name }))}
                  aria-pressed={session.mood === mood.name}
                  className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                    session.mood === mood.name
                      ? `bg-gradient-to-br ${mood.color} scale-105`
                      : 'bg-[#1F1F1F] hover:bg-[#2F2F2F]'
                  }`}
                >
                  <span className="text-2xl mb-1">{mood.icon}</span>
                  <span className="text-sm text-white capitalize">{mood.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Start Options */}
          <div className="w-full space-y-3">
            <p className="text-white/80 text-center">What brings you here?</p>
            {startOptions.map((option) => {
              const IconComponent = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => setSession((prev) => ({ ...prev, startType: option.id }))}
                  aria-pressed={session.startType === option.id}
                  className={`w-full p-4 rounded-2xl text-left transition-all ${
                    session.startType === option.id
                      ? 'bg-purple-500/30 border border-purple-400/50'
                      : 'bg-[#1F1F1F] hover:bg-[#2F2F2F] border border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComponent className="h-5 w-5 text-purple-300" />
                    <span className="text-white">{option.title}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Task Input */}
          {session.startType && (
            <div className="w-full space-y-3 animate-fade-in">
              {/* The user's own unfinished tasks, when this screen has them and
                  the user has not chosen to type something else instead. iMA
                  already knows this list; making them retype a task they
                  already entered is the thing to avoid. Selecting one only
                  borrows its title — no task is created, changed or copied. */}
              {session.startType === 'task' && !showIntentionField && pickableTasks.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-white/80 text-sm">Which one?</p>
                  {pickableTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => setSession((prev) => ({ ...prev, intention: task.title }))}
                      aria-pressed={session.intention === task.title}
                      className={`w-full min-h-11 p-3 rounded-2xl text-left transition-all ${
                        session.intention === task.title
                          ? 'bg-purple-500/30 border border-purple-400/50'
                          : 'bg-[#1F1F1F] hover:bg-[#2F2F2F] border border-white/10'
                      }`}
                    >
                      <span className="text-white text-sm">{task.title}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setShowIntentionField(true);
                      setSession((prev) => ({ ...prev, intention: '' }));
                    }}
                    className="w-full min-h-11 p-3 rounded-2xl text-left bg-[#1F1F1F] hover:bg-[#2F2F2F] border border-white/10 text-white/70 text-sm"
                  >
                    Something else
                  </button>
                </div>
              ) : (
                <Input
                  value={session.intention}
                  onChange={(e) => setSession((prev) => ({ ...prev, intention: e.target.value }))}
                  placeholder="What would you like to work on?"
                  className="bg-[#1F1F1F] border-white/20 text-white placeholder:text-white/50"
                />
              )}

              {/* Co-working is not automatically a timebox. */}
              <div className="space-y-2 pt-1">
                <p className="text-white/80 text-sm">How should I keep you company?</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setTimerMode('untimed')}
                    aria-pressed={timerMode === 'untimed'}
                    className={`min-h-11 p-3 rounded-2xl text-left transition-all ${
                      timerMode === 'untimed'
                        ? 'bg-purple-500/30 border border-purple-400/50'
                        : 'bg-[#1F1F1F] hover:bg-[#2F2F2F] border border-white/10'
                    }`}
                  >
                    <span className="text-white text-sm">Just stay with me</span>
                    <span className="block text-white/50 text-xs">No countdown</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTimerMode('timed')}
                    aria-pressed={timerMode === 'timed'}
                    className={`min-h-11 p-3 rounded-2xl text-left transition-all ${
                      timerMode === 'timed'
                        ? 'bg-purple-500/30 border border-purple-400/50'
                        : 'bg-[#1F1F1F] hover:bg-[#2F2F2F] border border-white/10'
                    }`}
                  >
                    <span className="text-white text-sm">Use my Focus timer</span>
                    <span className="block text-white/50 text-xs">{blockMinutes} min</span>
                  </button>
                </div>
              </div>

              <p className="text-white/40 text-xs text-center">
                {timerMode === 'timed'
                  ? `${blockMinutes}-minute blocks with ${breakMinutes}-minute breaks, from your settings.`
                  : 'No timer. I\u2019ll stay here until you say you\u2019re done.'}
              </p>

              <div className="flex gap-3">
                <Button
                  onClick={startSession}
                  disabled={!session.mood || !session.intention.trim()}
                  className="flex-1 bg-purple-500 hover:bg-purple-600 text-white"
                >
                  Start Co-Working
                </Button>

                <Button
                  variant="outline"
                  onClick={() => navigate('/breathing')}
                  className="border-purple-400/50 text-purple-300 hover:bg-purple-500/20"
                >
                  <Wind className="h-4 w-4 mr-2" />
                  Quick Breath First
                </Button>
              </div>
            </div>
          )}
        </main>

        <BottomNavigation />
      </div>
    );
  }

  // Session Wrap-up Screen
  if (currentScreen === 'wrapup') {
    const minutesFocused = Math.round(session.focusSeconds / 60);

    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
        {/* Header */}
        <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/productivity')}
            className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>

          <h1 className="text-lg font-bold text-white">Session Complete</h1>

          <div className="w-10"></div>
        </header>

        {/* Wrap-up Content */}
        <main className="flex-1 w-full max-w-lg mx-auto px-4 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-300" />
            </div>
            <h2 className="text-xl font-bold text-white">Nice work 🎉</h2>
            <p className="text-white/80">
              {minutesFocused} {minutesFocused === 1 ? 'minute' : 'minutes'} of focus
              {session.cycles > 0 && ` · ${session.cycles} ${session.cycles === 1 ? 'block' : 'blocks'}`}
            </p>
            {recorder.status === 'unrecorded' && (
              <p className="text-orange-300 text-xs">
                This session could not be saved{recorder.error ? `: ${recorder.error}` : '.'}
              </p>
            )}
          </div>

          {/* Reflection Questions */}
          <div className="space-y-4">
            <div>
              <label className="block text-white/80 text-sm mb-2">What went well?</label>
              <Input
                value={wrapUp.didWell}
                onChange={(e) => setWrapUp((prev) => ({ ...prev, didWell: e.target.value }))}
                placeholder="I stayed focused, took breaks, asked for help..."
                className="bg-[#1F1F1F] border-white/20 text-white placeholder:text-white/50"
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm mb-2">What would I like to improve?</label>
              <Input
                value={wrapUp.wantToImprove}
                onChange={(e) => setWrapUp((prev) => ({ ...prev, wantToImprove: e.target.value }))}
                placeholder="Starting sooner, fewer distractions..."
                className="bg-[#1F1F1F] border-white/20 text-white placeholder:text-white/50"
              />
            </div>

            {/* End Mood */}
            <div>
              <label className="block text-white/80 text-sm mb-2">How do you feel now?</label>
              <div className="flex justify-center gap-3">
                {moods.map((mood) => (
                  <button
                    key={mood.name}
                    onClick={() => setWrapUp((prev) => ({ ...prev, endMood: mood.name }))}
                    aria-pressed={wrapUp.endMood === mood.name}
                    className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                      wrapUp.endMood === mood.name
                        ? `bg-gradient-to-br ${mood.color} scale-105`
                        : 'bg-[#1F1F1F] hover:bg-[#2F2F2F]'
                    }`}
                  >
                    <span className="text-2xl mb-1">{mood.icon}</span>
                    <span className="text-xs text-white capitalize">{mood.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              className="w-full bg-purple-500 hover:bg-purple-600 text-white"
              onClick={handleSaveReflection}
              disabled={journalSaved || saveJournalEntry.isPending}
            >
              <Edit3 className="h-4 w-4 mr-2" />
              {journalSaved
                ? 'Saved to your journal'
                : saveJournalEntry.isPending
                  ? 'Saving…'
                  : 'Save Reflection'}
            </Button>
            <p className="text-white/40 text-xs text-center">
              Saved with this session, and to your journal if you have written something.
            </p>

            <Button
              variant="outline"
              className="w-full border-purple-400/50 text-purple-300 hover:bg-purple-500/20"
              onClick={startAnotherSession}
            >
              Start Another Session
            </Button>

            {/* Finishing a session should not be a dead end. Nothing redirects
                on its own: the confirmation above stays until the user picks. */}
            <Button
              variant="outline"
              className="w-full border-white/20 text-white/80 hover:bg-white/10"
              onClick={() => navigate('/')}
            >
              Return to Home
            </Button>
          </div>
        </main>

        <BottomNavigation />
      </div>
    );
  }

  // Active Session Screen
  return (
    // The mobile bar is fixed over this screen too, so it needs the same
    // allowance as the welcome and wrap-up screens.
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
      {/* Header with Timer */}
      <header className="w-full max-w-lg mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/productivity')}
            className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>

          <h1 className="text-lg font-bold text-white">BodyDouble Session</h1>

          <div className="w-10"></div>
        </div>

        {/* Animated Timer Display */}
        <div className="bg-[#1F1F1F] rounded-3xl p-6 text-center relative overflow-hidden">
          {/* Animated Ring Background */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="w-32 h-32 rounded-full border-4 border-purple-500/20"
              style={{
                background:
                  timerMode === 'untimed'
                    ? undefined
                    : `conic-gradient(from 0deg, #a855f7 ${progressPercentage * 3.6}deg, transparent ${progressPercentage * 3.6}deg)`
              }}
            />
          </div>

          <div className="relative z-10">
            <div className="text-4xl font-bold text-white mb-2">
              {formatTime(timerMode === 'untimed' ? session.focusSeconds : session.timeRemaining)}
            </div>
            <p className="text-white/60 text-sm mb-1">
              {timerMode === 'untimed'
                ? 'Here with you'
                : `${session.phase === 'work' ? 'Focus Time' : 'Break Time'} • Block ${session.cycles + 1}`}
            </p>
            <p className="text-purple-300 text-sm">
              Working on: {session.intention}
            </p>
            {nextStep && (
              <p className="text-white/70 text-xs mt-1">
                Next step: {nextStep}
              </p>
            )}

            <div
              className={`flex items-center justify-center space-x-4 mt-4 ${
                timerMode === 'untimed' ? 'hidden' : ''
              }`}
            >
              <Button
                onClick={toggleTimer}
                aria-label={session.isActive ? 'Pause timer' : 'Start timer'}
                className="w-12 h-12 rounded-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50"
              >
                {session.isActive ? (
                  <Pause className="h-6 w-6 text-purple-400" />
                ) : (
                  <Play className="h-6 w-6 text-purple-400" />
                )}
              </Button>

              <Button
                onClick={resetBlock}
                variant="ghost"
                aria-label="Reset this block"
                className="w-10 h-10 rounded-full hover:bg-white/10"
              >
                <RotateCcw className="h-5 w-5 text-white/60" />
              </Button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <Button
            onClick={openSupport}
            variant="outline"
            className="flex-1 border-orange-400/50 text-orange-300 hover:bg-orange-500/20"
          >
            <LifeBuoy className="h-4 w-4 mr-2" />
            I'm stuck
          </Button>

          <Button
            onClick={handleSessionComplete}
            className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 text-green-300"
          >
            I'm done
          </Button>
        </div>
      </header>

      {/* Floating nudge */}
      {showNudge && (
        <div className="absolute top-1/3 left-4 right-4 z-50 animate-fade-in">
          <Card className="bg-purple-500/10 border border-purple-400/30 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5 text-purple-300" />
              <p className="text-white text-sm">{nudgeText}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Support area — timed nudges, session status, and help the user asks
          for. Deliberately not a chat: there is nothing here that could
          understand a typed message yet. */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 pb-8">
        <div className="flex items-center gap-2 mb-1">
          <Heart className="h-4 w-4 text-purple-300" />
          <h2 className="text-purple-300 text-sm font-medium">Support</h2>
        </div>
        <p className="text-white/40 text-xs mb-4">
          Timed nudges and the help you ask for. Nothing here is reading your screen.
        </p>

        <div className="space-y-3">
          {supportMessages.length === 0 ? (
            <p className="text-white/40 text-sm">
              Check-ins will appear here as your block goes on.
            </p>
          ) : (
            supportMessages.map((message) => (
              <div key={message.id} className="flex justify-start animate-fade-in">
                <div className="max-w-[85%] p-3 rounded-2xl bg-[#1F1F1F] text-white border border-white/10">
                  <p className="text-white/40 text-[11px] mb-1">
                    {message.kind === 'nudge' ? 'Check-in' : 'Session'}
                  </p>
                  <p className="text-sm leading-relaxed">{message.text}</p>
                </div>
              </div>
            ))
          )}
        </div>

        {recorder.status === 'unrecorded' && (
          <p className="text-orange-300 text-xs mt-4">
            Your timer is running, but this session is not being saved
            {recorder.error ? `: ${recorder.error}` : '.'}
          </p>
        )}
      </main>

      {/* Support dialog */}
      <Dialog
        open={showSupport}
        onOpenChange={(open) => {
          setShowSupport(open);
          if (!open) setSupportView('options');
        }}
      >
        <DialogContent className="bg-[#1F1F1F] border border-white/20 text-white max-h-[calc(100vh-10rem)] overflow-y-auto">
          {supportView === 'options' ? (
            <>
              <DialogHeader>
                <DialogTitle className="text-center text-white">
                  Want to reset together?
                </DialogTitle>
                <DialogDescription className="text-center text-white/60">
                  Pick whatever helps. Nothing here is chosen for you.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={openBreakDownView}
                    className="bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 text-green-300"
                  >
                    <ListChecks className="h-4 w-4 mr-2" />
                    Break it down
                  </Button>

                  <Button
                    onClick={() => setShowSupport(false)}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    Back to task
                  </Button>

                  <Button
                    onClick={() => navigate('/breathing')}
                    className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 text-blue-300"
                  >
                    <Wind className="h-4 w-4 mr-2" />
                    Quick breath
                  </Button>

                  <Button
                    onClick={() => navigate('/soundscape')}
                    className="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-300"
                  >
                    <Volume2 className="h-4 w-4 mr-2" />
                    Sounds
                  </Button>
                </div>

                <p className="text-white/40 text-xs text-center">
                  Quick breath and Sounds open another screen, which ends this session.
                </p>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="text-center text-white">
                  What is the smallest next action you can take?
                </DialogTitle>
                <DialogDescription className="text-center text-white/60">
                  Working on: {session.intention}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">

                <StepSuggestions
                  steps={breakdown.steps}
                  pending={breakdown.pending}
                  error={breakdown.error}
                  requested={breakdown.requested}
                  canMakeSmaller={breakdown.canMakeSmaller}
                  onSuggest={() => breakdown.breakDown(session.intention)}
                  onStartWith={startWithSuggestion}
                  onMakeSmaller={(step) => breakdown.makeSmaller(session.intention, step)}
                  onTryAnother={(step) => breakdown.tryAnother(session.intention, step)}
                />

                <div className="flex items-center gap-3">
                  <span className="h-px flex-1 bg-white/10" />
                  <span className="text-white/40 text-xs">or write your own</span>
                  <span className="h-px flex-1 bg-white/10" />
                </div>

                <Input
                  value={nextStepDraft}
                  onChange={(e) => setNextStepDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNextStep();
                  }}
                  placeholder="Find 3 papers about ACL loading..."
                  className="bg-background border-white/20 text-white placeholder:text-white/50"
                />

                <p className="text-white/40 text-xs text-center">
                  Suggestions come from a service, using only the task and step above.
                  They are not saved, and nothing here can see your screen or how you feel.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    onClick={saveNextStep}
                    disabled={!nextStepDraft.trim()}
                    className="bg-purple-500 hover:bg-purple-600 text-white"
                  >
                    Set next step
                  </Button>

                  <Button
                    onClick={() => setSupportView('options')}
                    variant="outline"
                    className="border-white/20 text-white hover:bg-white/10"
                  >
                    Back
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <BottomNavigation />
    </div>
  );
};

export default BodyDouble;
