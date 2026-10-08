import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TaskImportance } from '@/hooks/use-tasks';
import type { NotTask } from '@/lib/ai/organize-contract';
import { CAPTURE_COPY, type CaptureDraft } from '@/lib/capture/drafts';
import ProposalCard from './ProposalCard';

export interface CaptureReviewProps {
  drafts: CaptureDraft[];
  notTasks: NotTask[];
  today: string;
  saving: boolean;
  saveError: string | null;
  invalid: Record<string, string>;
  /** The optional importance question (see showImportanceQuestion). Never blocks saving. */
  showImportanceQuestion: boolean;
  onSkipImportance: () => void;
  onTitle: (key: string, title: string) => void;
  onImportance: (key: string, importance: TaskImportance) => void;
  onDate: (key: string, date: string | null) => void;
  onTime: (key: string, time: string | null) => void;
  onRemove: (key: string) => void;
  onAddAnother: () => void;
  onPromote: (index: number) => void;
  onAddTasks: () => void;
  onBack: () => void;
}

export const IMPORTANCE_QUESTION_ID = 'capture-importance-question';

/** Step 2: every proposal editable and removable; nothing saved until Add tasks. Presentational only. */
const CaptureReview = (props: CaptureReviewProps) => {
  const { drafts, notTasks, today, saving, saveError, invalid } = props;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div>
        <h2 className="text-2xl font-bold text-foreground">{CAPTURE_COPY.reviewHeading}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{drafts.length > 0 ? CAPTURE_COPY.reviewSupporting : CAPTURE_COPY.noneFound}</p>
      </div>

      {saveError && (
        <p role="alert" className="rounded-2xl bg-destructive/15 px-4 py-3 text-sm text-foreground">
          {saveError}
        </p>
      )}

      {props.showImportanceQuestion && drafts.length > 0 && (
        <section
          aria-labelledby={IMPORTANCE_QUESTION_ID}
          className="flex items-start justify-between gap-3 rounded-2xl bg-primary/10 px-4 py-3"
          data-testid="importance-question"
        >
          <div>
            <p id={IMPORTANCE_QUESTION_ID} className="text-sm font-medium text-foreground">
              {CAPTURE_COPY.importanceQuestion}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{CAPTURE_COPY.importanceHint}</p>
          </div>
          <Button type="button" variant="ghost" onClick={props.onSkipImportance} disabled={saving} className="h-11 shrink-0 rounded-xl text-primary">
            {CAPTURE_COPY.skip}
          </Button>
        </section>
      )}

      {drafts.length > 0 && (
        <ul className="space-y-3">
          {drafts.map((draft) => (
            <ProposalCard
              key={draft.key}
              draft={draft}
              today={today}
              error={invalid[draft.key]}
              importanceQuestionId={props.showImportanceQuestion && draft.importanceUnclear ? IMPORTANCE_QUESTION_ID : undefined}
              disabled={saving}
              onTitle={(title) => props.onTitle(draft.key, title)}
              onImportance={(importance) => props.onImportance(draft.key, importance)}
              onDate={(date) => props.onDate(draft.key, date)}
              onTime={(time) => props.onTime(draft.key, time)}
              onRemove={() => props.onRemove(draft.key)}
            />
          ))}
        </ul>
      )}

      <Button type="button" variant="outline" onClick={props.onAddAnother} disabled={saving} className="h-11 rounded-2xl border-white/20">
        <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
        {CAPTURE_COPY.addAnother}
      </Button>

      {notTasks.length > 0 && (
        <details className="rounded-2xl bg-secondary/20 px-4 py-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">{CAPTURE_COPY.notTasksHeading(notTasks.length)}</summary>
          <ul className="mt-2 space-y-2">
            {notTasks.map((thought, index) => (
              <li key={`${index}-${thought.text}`} className="flex items-center justify-between gap-3">
                <span className="text-foreground">{thought.text}</span>
                <Button type="button" variant="ghost" className="h-11 shrink-0 rounded-xl text-primary" onClick={() => props.onPromote(index)} disabled={saving}>
                  {CAPTURE_COPY.makeTask}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="mt-auto flex flex-col gap-2 pt-2">
        <Button
          type="button"
          onClick={props.onAddTasks}
          disabled={saving || drafts.length === 0}
          style={{ backgroundColor: '#2f74db' }}
          className="h-12 rounded-2xl text-base font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          {saving ? CAPTURE_COPY.saving : CAPTURE_COPY.addTasks}
        </Button>
        <Button type="button" variant="ghost" onClick={props.onBack} disabled={saving} className="h-11 rounded-2xl">
          {CAPTURE_COPY.back}
        </Button>
      </div>
    </div>
  );
};

export default CaptureReview;
