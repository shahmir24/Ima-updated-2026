import React, { useRef, useState } from 'react';
import { ArrowLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { DESKTOP_DIALOG_OVERLAY, DESKTOP_DIALOG_PANEL } from '@/components/layout/desktop-dialog';
import { isDesktopViewport, useDialogDismiss } from '@/hooks/use-dialog-dismiss';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import TimeField from '@/components/time/TimeField';
import { buildTaskFormInput } from '@/lib/tasks/task-form-input';
import { format, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TaskImportance, TaskRow } from '@/hooks/use-tasks';

export interface TaskFormInput {
  title: string;
  /** null when the task is unscheduled ("Later"). */
  scheduled_date: string | null;
  /** null when the user did not pick a time. */
  start_time: string | null;
  importance: TaskImportance;
}

interface MeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Absent/null creates a task; a row puts the form in edit mode and prefills
   * it. The caller decides which mutation runs — this form never persists.
   */
  task?: TaskRow | null;
  onSubmit: (input: TaskFormInput) => Promise<void>;
  isSaving?: boolean;
}

const IMPORTANCE_OPTIONS: ReadonlyArray<{ value: TaskImportance; label: string }> = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' }
];

/**
 * scheduled_date is a bare Postgres date. new Date('2026-09-18') reads it as
 * UTC midnight, which renders as the previous day west of Greenwich — the same
 * shift the write path avoids by using format() instead of toISOString().
 */
const parseScheduledDate = (value: string | null | undefined): Date => {
  if (!value) return new Date();
  const parsed = parse(value, 'yyyy-MM-dd', new Date());
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

/**
 * The form's starting date. A new task starts on today, as it always has. An
 * existing unscheduled ("Later") task starts with NO date, so editing its
 * title can never quietly schedule it for today.
 */
const initialDate = (task: TaskRow | null): Date | null =>
  task && task.scheduled_date === null ? null : parseScheduledDate(task?.scheduled_date);

/**
 * Postgres `time` reads back as 'HH:MM:SS'; the time field works in 'HH:MM'.
 *
 * Null stays null. A task with no start time now keeps no start time: the form
 * used to substitute 2 PM here, which meant every task carried a time nobody
 * had chosen. Existing rows that really do hold 14:00 are untouched — they are
 * read back and shown exactly as stored.
 */
const toSelectTime = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const [hour, minute] = value.split(':');
  if (!hour || !minute) return null;
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
};

/** Anything the column should not hold is read as the default, never guessed at. */
const toImportance = (value: unknown): TaskImportance =>
  IMPORTANCE_OPTIONS.some((option) => option.value === value) ? (value as TaskImportance) : 'normal';

export const TASK_FORM_HEADING_ID = 'task-form-heading';

const MeetingModal = ({ isOpen, onClose, task = null, onSubmit, isSaving = false }: MeetingModalProps) => {
  const isEditing = !!task;
  const [taskTitle, setTaskTitle] = useState(() => task?.title ?? '');
  const [selectedDate, setSelectedDate] = useState<Date | null>(() => initialDate(task));
  const [selectedTime, setSelectedTime] = useState<string | null>(() => toSelectTime(task?.start_time));
  const [importance, setImportance] = useState<TaskImportance>(() => toImportance(task?.importance));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Escape, Cancel and the close button all do what the back arrow always did
  // (onClose) — never while a save is in flight, and an Escape that closes an
  // open date or time picker closes only the picker. On desktop, Tab and
  // Shift+Tab stay inside the dialog.
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogDismiss({ open: isOpen, onDismiss: onClose, canDismiss: !isSaving, panelRef, trapFocus: isDesktopViewport });

  if (!isOpen) return null;

  const handleSave = async () => {
    const title = taskTitle.trim();
    if (!title) {
      setSaveError('Give the task a title first.');
      return;
    }

    setSaveError(null);
    try {
      await onSubmit(buildTaskFormInput({ title, date: selectedDate, time: selectedTime, importance }));
      // Reset only after a confirmed write, so a failure keeps the input. An
      // edit keeps its values instead: the caller remounts the form per task.
      if (!isEditing) {
        setTaskTitle('');
        setSelectedDate(new Date());
        setSelectedTime(null);
        setImportance('normal');
      }
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the task.');
    }
  };

  const formatDisplayTime = (timeString: string) => {
    const [hour, minute] = timeString.split(':');
    const date = new Date(2024, 0, 1, parseInt(hour), parseInt(minute));
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  return (
    <div className={cn('fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end', DESKTOP_DIALOG_OVERLAY)}>
      {/* Phones: the same bottom sheet as always. Desktop: a centred dialog. */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={TASK_FORM_HEADING_ID}
        tabIndex={-1}
        data-testid="task-form"
        className={cn(
          'w-full max-w-lg mx-auto bg-background rounded-t-3xl min-h-[60vh] flex flex-col focus:outline-none',
          DESKTOP_DIALOG_PANEL,
          'lg:max-w-[680px]'
        )}
      >

        {/* Header */}
        <header className="p-4 flex items-center justify-between lg:px-6 lg:pt-6">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            disabled={isSaving}
            aria-label="Close"
            className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" aria-hidden="true" />
          </Button>
          
          <div className="text-center">
            <h1 id={TASK_FORM_HEADING_ID} className="text-xl font-bold text-white">
              {isEditing ? 'Edit Task' : 'Create New Task'}
            </h1>
          </div>
          
          <div className="w-10"></div>
        </header>

        {/* Task Details */}
        <div className="flex-1 px-4 space-y-4 lg:px-6">
          {/* Task Title Input */}
          <div className="bg-secondary/30 rounded-2xl p-4">
            <h3 className="text-white font-semibold text-lg mb-3">Task Title</h3>
            <Input
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Enter task title..."
              className="bg-white/10 border-white/20 text-white placeholder:text-white/60 rounded-xl"
            />
          </div>

          {/* Date and Time: stacked on phones, side by side on desktop. */}
          <div className="space-y-4 lg:grid lg:grid-cols-2 lg:gap-4 lg:space-y-0">
          {/* Date Selection */}
          <div className="bg-secondary/30 rounded-2xl p-4">
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              {/* A real button, so Tab reaches it and Enter/Space open the picker.
                  Same look as the row it replaces: preflight strips button styling. */}
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex w-full items-center justify-between cursor-pointer rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="block">
                    <span className="block text-white font-semibold text-lg mb-1">Date</span>
                    <span className="block text-white/80">
                      {selectedDate ? format(selectedDate, 'EEEE, d MMMM yyyy') : 'Later'}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-white/60" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate ?? undefined}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setShowDatePicker(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
                {/* Only for a task that is already unscheduled, so the
                    create form looks and behaves as it always has. */}
                {isEditing && task?.scheduled_date === null && selectedDate !== null && (
                  <div className="border-t border-border p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 w-full rounded-xl"
                      onClick={() => {
                        // Later means no day, and so no time either.
                        setSelectedDate(null);
                        setSelectedTime(null);
                        setShowDatePicker(false);
                      }}
                    >
                      Keep it for later
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Selection */}
          <div className="bg-secondary/30 rounded-2xl p-4">
            {/* A time needs a day: with no date ("Later") the row explains and stays shut. */}
            <Popover open={showTimePicker && selectedDate !== null} onOpenChange={(open) => setShowTimePicker(open && selectedDate !== null)}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  // Still focusable without a date, so the reason is read out; it just does not open.
                  aria-disabled={selectedDate === null ? true : undefined}
                  className="flex w-full items-center justify-between cursor-pointer rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="block">
                    <span className="block text-white font-semibold text-lg mb-1">Time</span>
                    <span className="block text-white/80">
                      {selectedDate === null
                        ? 'Choose a day to add a time'
                        : selectedTime === null
                          ? 'No time set'
                          : formatDisplayTime(selectedTime)}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 text-white/60" aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="center">
                <div className="p-4">
                  <h4 className="font-medium mb-3">Select Time</h4>
                  {/* Any minute of the day. Empty or half-typed is "no time". */}
                  <TimeField value={selectedTime} onChange={setSelectedTime} label="Start time" className="w-full" />
                  <div className="mt-3 flex gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-11 flex-1 rounded-xl"
                      onClick={() => {
                        setSelectedTime(null);
                        setShowTimePicker(false);
                      }}
                    >
                      No time
                    </Button>
                    <Button type="button" className="h-11 flex-1 rounded-xl" onClick={() => setShowTimePicker(false)}>
                      Done
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
          </div>

          {/*
            Importance — the one judgement the Context Engine cannot derive.
            Three values, defaulted, and skippable: doing nothing leaves a task
            Normal, which ranks exactly as every task ranks today. Plain toggle
            buttons rather than a radiogroup, so Tab and Enter work natively
            with no custom key handling, matching how the Body Double task
            picker already behaves. No red, no warning iconography: this marks
            what matters, it does not scold.
          */}
          <div className="bg-secondary/30 rounded-2xl p-4">
            <h3 id="importance-label" className="text-white font-semibold text-lg mb-3">
              Importance
            </h3>
            <div role="group" aria-labelledby="importance-label" className="grid grid-cols-3 gap-2">
              {IMPORTANCE_OPTIONS.map((option) => {
                const selected = importance === option.value;
                return (
                  <Button
                    key={option.value}
                    type="button"
                    onClick={() => setImportance(option.value)}
                    aria-pressed={selected}
                    style={selected ? { backgroundColor: '#2f74db' } : undefined}
                    className={cn(
                      'h-11 rounded-xl text-base font-medium',
                      selected
                        ? 'text-white hover:opacity-90'
                        : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                    )}
                  >
                    {option.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Save Button — full width on phones; Cancel + Save, right-aligned, on desktop. */}
        <div className="p-4 pb-8 lg:px-6 lg:pb-6">
          {saveError && (
            <p className="text-red-300 text-sm mb-3 text-center lg:text-right">{saveError}</p>
          )}
          <div className="lg:flex lg:items-center lg:justify-end lg:gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={isSaving}
              className="hidden h-12 rounded-2xl px-6 text-base lg:inline-flex"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              style={{ backgroundColor: '#2f74db' }}
              className="w-full hover:opacity-90 text-white rounded-2xl py-4 text-lg font-semibold disabled:opacity-60 lg:h-12 lg:w-auto lg:min-w-[10rem] lg:px-8 lg:py-0 lg:text-base"
            >
              {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Task'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MeetingModal;
