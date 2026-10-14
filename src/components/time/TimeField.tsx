import { toClockTime } from '@/lib/ai/organize-contract';
import { cn } from '@/lib/utils';

export interface TimeFieldProps {
  /** 'HH:MM' (24-hour), or null for no time. */
  value: string | null;
  /** Called with 'HH:MM', or null when the field is empty or incomplete. */
  onChange: (value: string | null) => void;
  /** Accessible name, e.g. "Start time". */
  label: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

/**
 * An exact-minute clock time: the browser's own time input, so every minute
 * (10:09, 11:17, 3:43 PM) can be typed or picked, on a phone's native wheel
 * or with the keyboard. Its value is always 24-hour 'HH:MM', whatever the
 * device shows, which is exactly what tasks store.
 *
 * Empty or half-typed reads as "no time" — a time is never invented. Seconds
 * are never offered (step 60) and never kept.
 */
const TimeField = ({ value, onChange, label, disabled, id, className }: TimeFieldProps) => (
  <input
    id={id}
    type="time"
    step={60}
    value={toClockTime(value) ?? ''}
    onChange={(event) => onChange(toClockTime(event.target.value))}
    aria-label={label}
    disabled={disabled}
    className={cn(
      'h-11 rounded-xl border border-input bg-background px-3 text-base text-foreground [color-scheme:dark] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
      className
    )}
  />
);

export default TimeField;
