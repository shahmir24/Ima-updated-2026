import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format, parse } from 'date-fns';
import { cn } from '@/lib/utils';
import type { TaskImportance, TaskRow } from '@/hooks/use-tasks';

export interface TaskFormInput {
  title: string;
  scheduled_date: string;
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

/**
 * The time picker's "no particular time" entry.
 *
 * A sentinel rather than an empty string because Radix's Select rejects an
 * item whose value is '' — it reserves that for "nothing selected".
 */
const NO_TIME = '__none__';

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
 * Postgres `time` reads back as 'HH:MM:SS'; the Select's values are 'HH:MM'.
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

const MeetingModal = ({ isOpen, onClose, task = null, onSubmit, isSaving = false }: MeetingModalProps) => {
  const isEditing = !!task;
  const [taskTitle, setTaskTitle] = useState(() => task?.title ?? '');
  const [selectedDate, setSelectedDate] = useState<Date>(() => parseScheduledDate(task?.scheduled_date));
  const [selectedTime, setSelectedTime] = useState<string | null>(() => toSelectTime(task?.start_time));
  const [importance, setImportance] = useState<TaskImportance>(() => toImportance(task?.importance));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    const title = taskTitle.trim();
    if (!title) {
      setSaveError('Give the task a title first.');
      return;
    }

    setSaveError(null);
    try {
      await onSubmit({
        title,
        // Local date, not toISOString(): that converts to UTC and can shift the
        // task to the previous or next day depending on the timezone.
        scheduled_date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedTime,
        importance
      });
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

  const timeOptions = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const displayTime = new Date(2024, 0, 1, hour, minute).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      timeOptions.push({ value: timeString, label: displayTime });
    }
  }

  // An existing row can hold a time off the 30-minute grid. Offer it rather
  // than letting the Select render blank against a value it cannot find.
  if (selectedTime !== null && !timeOptions.some((option) => option.value === selectedTime)) {
    timeOptions.push({ value: selectedTime, label: formatDisplayTime(selectedTime) });
    timeOptions.sort((a, b) => (a.value < b.value ? -1 : 1));
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-end">
      <div className="w-full max-w-lg mx-auto bg-background rounded-t-3xl min-h-[60vh] flex flex-col">

        {/* Header */}
        <header className="p-4 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>
          
          <div className="text-center">
            <h1 className="text-xl font-bold text-white">
              {isEditing ? 'Edit Task' : 'Create New Task'}
            </h1>
          </div>
          
          <div className="w-10"></div>
        </header>

        {/* Task Details */}
        <div className="flex-1 px-4 space-y-4">
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

          {/* Date Selection */}
          <div className="bg-secondary/30 rounded-2xl p-4">
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer">
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">Date</h3>
                    <p className="text-white/80">
                      {format(selectedDate, 'EEEE, d MMMM yyyy')}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/60" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={(date) => {
                    if (date) {
                      setSelectedDate(date);
                      setShowDatePicker(false);
                    }
                  }}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>

          {/* Time Selection */}
          <div className="bg-secondary/30 rounded-2xl p-4">
            <Popover open={showTimePicker} onOpenChange={setShowTimePicker}>
              <PopoverTrigger asChild>
                <div className="flex items-center justify-between cursor-pointer">
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-1">Time</h3>
                    <p className="text-white/80">
                      {selectedTime === null ? 'No time set' : formatDisplayTime(selectedTime)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/60" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="center">
                <div className="p-4">
                  <h4 className="font-medium mb-3">Select Time</h4>
                  <Select
                    value={selectedTime ?? NO_TIME}
                    onValueChange={(value) => {
                      setSelectedTime(value === NO_TIME ? null : value);
                      setShowTimePicker(false);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      {/* First, so a task can be left untimed without scrolling. */}
                      <SelectItem value={NO_TIME}>No time</SelectItem>
                      {timeOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </PopoverContent>
            </Popover>
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

        {/* Save Button */}
        <div className="p-4 pb-8">
          {saveError && (
            <p className="text-red-300 text-sm mb-3 text-center">{saveError}</p>
          )}
          <Button
            onClick={handleSave}
            disabled={isSaving}
            style={{ backgroundColor: '#2f74db' }}
            className="w-full hover:opacity-90 text-white rounded-2xl py-4 text-lg font-semibold disabled:opacity-60"
          >
            {isSaving ? 'Saving…' : isEditing ? 'Save Changes' : 'Save Task'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MeetingModal;
