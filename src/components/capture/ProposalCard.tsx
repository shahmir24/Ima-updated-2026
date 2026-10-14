import { CalendarDays, Clock, X } from 'lucide-react';
import { format, parse } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import TimeField from '@/components/time/TimeField';
import { cn } from '@/lib/utils';
import type { TaskImportance } from '@/hooks/use-tasks';
import { ORGANIZE_LIMITS } from '@/lib/ai/organize-contract';
import { CAPTURE_COPY, describeDraftDate, describeTime, type CaptureDraft } from '@/lib/capture/drafts';

const IMPORTANCE: ReadonlyArray<{ value: TaskImportance; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' }
];

export interface ProposalCardProps {
  draft: CaptureDraft;
  /** The browser's local 'YYYY-MM-DD'. */
  today: string;
  error?: string;
  disabled?: boolean;
  /**
   * Set while the optional importance question is showing and this task's
   * importance is still unclear: the EXISTING importance buttons are tied to
   * the question and gently outlined. No second set of controls.
   */
  importanceQuestionId?: string;
  onTitle: (title: string) => void;
  onImportance: (importance: TaskImportance) => void;
  onDate: (date: string | null) => void;
  onTime: (time: string | null) => void;
  onRemove: () => void;
}

/** One editable proposal. Presentational: every change goes back through a callback. */
const ProposalCard = ({ draft, today, error, disabled, importanceQuestionId, onTitle, onImportance, onDate, onTime, onRemove }: ProposalCardProps) => {
  const dateLabel = describeDraftDate(draft.date, today);
  const selected = draft.date ? parse(draft.date, 'yyyy-MM-dd', new Date()) : undefined;
  // The person's own words, when they are worth showing next to the value.
  // De-duplicated, so "tonight" for both day and time reads once.
  const hint = draft.checkDate
    ? [draft.dateText, draft.timeText]
        .filter((words, index, all): words is string => !!words && all.findIndex((w) => w?.toLowerCase() === words.toLowerCase()) === index)
        .join(', ')
    : '';

  return (
    // Desktop: two lines instead of three — the title across the top, then the
    // day, time and importance on one row underneath. Phones are unchanged.
    <li
      className="relative rounded-2xl bg-secondary/30 p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-x-4 lg:gap-y-3 lg:px-5"
      data-draft={draft.key}
    >
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={CAPTURE_COPY.removeTask}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

      <div className="lg:col-span-2">
      <label className="sr-only" htmlFor={`title-${draft.key}`}>
        {CAPTURE_COPY.titleLabel}
      </label>
      <Input
        id={`title-${draft.key}`}
        value={draft.title}
        onChange={(event) => onTitle(event.target.value)}
        placeholder={CAPTURE_COPY.titlePlaceholder}
        maxLength={ORGANIZE_LIMITS.titleMaxLength}
        disabled={disabled}
        aria-invalid={error ? true : undefined}
        className="mr-10 w-[calc(100%-2.75rem)] rounded-xl border-white/20 bg-white/10 text-base text-foreground"
      />
      {error && <p className="mt-1 text-sm text-red-300">{error}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 lg:mt-0">
        {/* Date: "Later" when unscheduled. Tap to pick a day, or keep it for later. */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" disabled={disabled} className="h-11 rounded-full border-white/20 px-4" aria-label={`${CAPTURE_COPY.dateLabel}: ${dateLabel}`}>
              <CalendarDays className="mr-2 h-4 w-4" aria-hidden="true" />
              {dateLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selected} onSelect={(date) => date && onDate(format(date, 'yyyy-MM-dd'))} initialFocus />
            {draft.date !== null && (
              <div className="border-t border-border p-2">
                <Button type="button" variant="ghost" className="h-11 w-full rounded-xl" onClick={() => onDate(null)}>
                  {CAPTURE_COPY.keepForLater}
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>

        {/* Time: only once there is a date. */}
        {draft.date !== null && (
          // Any minute. The AI's proposed time is shown as proposed; empty means no time.
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-white/70" aria-hidden="true" />
            <TimeField
              value={draft.time}
              onChange={onTime}
              label={`${CAPTURE_COPY.timeLabel}: ${describeTime(draft.time)}`}
              disabled={disabled}
              className="rounded-full border-white/20 px-4"
            />
            {draft.time !== null && (
              <Button type="button" variant="ghost" size="sm" className="h-11 rounded-full px-3" onClick={() => onTime(null)} disabled={disabled}>
                {CAPTURE_COPY.noTime}
              </Button>
            )}
          </div>
        )}

        {draft.checkDate && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200" data-check="true">
            {hint ? `${hint[0].toUpperCase()}${hint.slice(1)} · ` : ''}
            {CAPTURE_COPY.checkThis}
          </span>
        )}
      </div>

      <div
        role="group"
        aria-label={CAPTURE_COPY.importanceLabel}
        aria-describedby={importanceQuestionId}
        data-importance-unclear={importanceQuestionId ? 'true' : undefined}
        className={cn('mt-3 grid grid-cols-3 gap-2 lg:mt-0 lg:w-[16.5rem]', importanceQuestionId && 'rounded-xl ring-1 ring-primary/40 ring-offset-2 ring-offset-background')}
      >
        {IMPORTANCE.map((option) => {
          const active = draft.importance === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              disabled={disabled}
              aria-pressed={active}
              onClick={() => onImportance(option.value)}
              style={active ? { backgroundColor: '#2f74db' } : undefined}
              className={cn('h-11 rounded-xl text-sm font-medium', active ? 'text-white hover:opacity-90' : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white')}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </li>
  );
};

export default ProposalCard;
