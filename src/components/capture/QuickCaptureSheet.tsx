import { useReducer } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NewTaskInput } from '@/hooks/use-tasks';
import { useCaptureOrganizer, type CaptureOrganizer } from '@/hooks/use-capture-organizer';
import { browserTimeZone, localToday, runOrganize, runSave } from '@/lib/capture/actions';
import { CAPTURE_COPY, captureReducer, initialCaptureState, showImportanceQuestion, type CaptureState } from '@/lib/capture/drafts';
import BrainDumpInput, { BRAIN_DUMP_HEADING_ID } from './BrainDumpInput';
import CaptureReview from './CaptureReview';

export interface QuickCaptureSheetProps {
  isOpen: boolean;
  onClose: () => void;
  isGuest: boolean;
  /** Opens the existing manual task form. */
  onAddManually: () => void;
  /** useTaskSource().create.run: the same path as the manual form. */
  create: (input: NewTaskInput) => Promise<unknown>;
  onCreateAccount: () => void;
  onLogIn: () => void;
  /** Test seam; the app uses the real organizer hook. */
  organizer?: CaptureOrganizer;
  /** Test seam for the initial state. */
  initialState?: CaptureState;
}

/**
 * Quick Capture: write everything down, let iMA organize it, review, then add.
 *
 * Laid out like the manual task form (a sheet from the bottom on phones). It
 * does not save until "Add tasks", and saving goes through the same task
 * source as the manual form. Unscheduled drafts are saved as Later, never as
 * today.
 */
const QuickCaptureSheet = (props: QuickCaptureSheetProps) => {
  const realOrganizer = useCaptureOrganizer();
  const organizer = props.organizer ?? realOrganizer;
  const [state, dispatch] = useReducer(captureReducer, props.initialState ?? initialCaptureState);
  const [guestBoundary, setGuestBoundary] = useReducer((_: boolean, next: boolean) => next, false);

  if (!props.isOpen) return null;

  const today = localToday();
  const close = () => {
    // The text survives a close; a finished save resets it (see handleSave).
    setGuestBoundary(false);
    organizer.clearError();
    props.onClose();
  };

  const handleOrganize = () =>
    void runOrganize({
      isGuest: props.isGuest,
      text: state.text,
      today,
      timeZone: browserTimeZone(),
      organize: organizer.organize,
      dispatch,
      showGuestBoundary: () => setGuestBoundary(true)
    });

  const handleSave = () =>
    void runSave({ state, create: props.create, dispatch }).then((allSaved) => {
      if (allSaved) {
        dispatch({ type: 'reset' });
        props.onClose();
      }
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/50 backdrop-blur-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && !state.saving) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={BRAIN_DUMP_HEADING_ID}
        data-testid="quick-capture"
        className="mx-auto flex max-h-[92dvh] min-h-[60vh] w-full max-w-lg flex-col overflow-y-auto rounded-t-3xl bg-background"
      >
        <header className="flex items-center p-4">
          <Button variant="ghost" size="icon" onClick={close} disabled={state.saving} aria-label={CAPTURE_COPY.close} className="h-11 w-11 rounded-full">
            <ArrowLeft className="h-6 w-6" aria-hidden="true" />
          </Button>
        </header>

        <div className="flex flex-1 flex-col px-4 pb-8">
          {guestBoundary ? (
            <div className="flex flex-1 flex-col gap-4" data-testid="capture-guest-boundary">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Lock className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 id={BRAIN_DUMP_HEADING_ID} className="text-2xl font-bold text-foreground">
                {CAPTURE_COPY.guestHeading}
              </h2>
              <p className="text-sm text-muted-foreground">{CAPTURE_COPY.guestBody}</p>
              <Button type="button" onClick={props.onCreateAccount} style={{ backgroundColor: '#2f74db' }} className="h-12 rounded-2xl text-base font-semibold text-white hover:opacity-90">
                {CAPTURE_COPY.guestCreateAccount}
              </Button>
              <Button type="button" variant="outline" onClick={props.onLogIn} className="h-11 rounded-2xl border-white/20">
                {CAPTURE_COPY.guestLogIn}
              </Button>
              <Button type="button" variant="ghost" onClick={props.onAddManually} className="h-11 rounded-2xl text-primary">
                {CAPTURE_COPY.addManually}
              </Button>
              <Button type="button" variant="ghost" onClick={() => setGuestBoundary(false)} className="h-11 rounded-2xl">
                {CAPTURE_COPY.back}
              </Button>
            </div>
          ) : state.stage === 'write' ? (
            <BrainDumpInput
              text={state.text}
              onTextChange={(text) => dispatch({ type: 'text', text })}
              onOrganize={handleOrganize}
              onAddManually={props.onAddManually}
              organizing={organizer.pending}
              error={organizer.error}
              isGuest={props.isGuest}
            />
          ) : (
            <CaptureReview
              drafts={state.drafts}
              notTasks={state.notTasks}
              today={today}
              saving={state.saving}
              saveError={state.saveError}
              invalid={state.invalid}
              showImportanceQuestion={showImportanceQuestion(state)}
              onSkipImportance={() => dispatch({ type: 'skipImportance' })}
              onTitle={(key, title) => dispatch({ type: 'title', key, title })}
              onImportance={(key, importance) => dispatch({ type: 'importance', key, importance })}
              onDate={(key, date) => dispatch({ type: 'date', key, date })}
              onTime={(key, time) => dispatch({ type: 'time', key, time })}
              onRemove={(key) => dispatch({ type: 'remove', key })}
              onAddAnother={() => dispatch({ type: 'addAnother' })}
              onPromote={(index) => dispatch({ type: 'promote', index })}
              onAddTasks={handleSave}
              onBack={() => dispatch({ type: 'back' })}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickCaptureSheet;
