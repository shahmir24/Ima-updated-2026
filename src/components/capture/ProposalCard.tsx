import { CalendarDays, Clock, X } from 'lucide-react';
import { format, parse } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { TaskImportance } from '@/hooks/use-tasks';
import { ORGANIZE_LIMITS } from '@/lib/ai/organize-contract';
import { CAPTURE_COPY, describeDraftDate, describeTime, timeOptions, type CaptureDraft } from '@/lib/capture/drafts';

const NO_TIME = '__none__';
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
  onTitle: (title: string) => void;
  onImportance: (importance: TaskImportance) => void;
  onDate: (date: string | null) => void;
  onTime: (time: string | null) => void;
  onRemove: () => void;
}

/** One editable proposal. Presentational: every change goes back through a callback. */
const ProposalCard = ({ draft, today, error, disabled, onTitle, onImportance, onDate, onTime, onRemove }: ProposalCardProps) => {
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
    <li className="relative rounded-2xl bg-secondary/30 p-4" data-draft={draft.key}>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={CAPTURE_COPY.removeTask}
        className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-5 w-5" aria-hidden="true" />
      </button>

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

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
          <Select value={draft.time ?? NO_TIME} onValueChange={(value) => onTime(value === NO_TIME ? null : value)} disabled={disabled}>
            <SelectTrigger className="h-11 w-auto gap-2 rounded-full border-white/20 px-4" aria-label={`${CAPTURE_COPY.timeLabel}: ${describeTime(draft.time)}`}>
              <Clock className="h-4 w-4" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-60">
              <SelectItem value={NO_TIME}>{CAPTURE_COPY.noTime}</SelectItem>
              {timeOptions(draft.time).map((time) => (
                <SelectItem key={time} value={time}>
                  {describeTime(time)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {draft.checkDate && (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-200" data-check="true">
            {hint ? `${hint[0].toUpperCase()}${hint.slice(1)} · ` : ''}
            {CAPTURE_COPY.checkThis}
          </span>
        )}
      </div>

      <div role="group" aria-label={CAPTURE_COPY.importanceLabel} className="mt-3 grid grid-cols-3 gap-2">
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
