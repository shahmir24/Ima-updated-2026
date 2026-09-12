import React, { useState } from 'react';
import { ArrowLeft, ChevronRight, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface CreateTaskInput {
  title: string;
  scheduled_date: string;
  start_time: string;
}

interface MeetingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (input: CreateTaskInput) => Promise<void>;
  isSaving?: boolean;
}

const MeetingModal = ({ isOpen, onClose, onCreate, isSaving = false }: MeetingModalProps) => {
  const [taskTitle, setTaskTitle] = useState('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>('14:00');
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
      await onCreate({
        title,
        // Local date, not toISOString(): that converts to UTC and can shift the
        // task to the previous or next day depending on the timezone.
        scheduled_date: format(selectedDate, 'yyyy-MM-dd'),
        start_time: selectedTime
      });
      // Reset only after a confirmed write, so a failure keeps the input.
      setTaskTitle('');
      setSelectedDate(new Date());
      setSelectedTime('14:00');
      onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save the task.');
    }
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
            <h1 className="text-xl font-bold text-white">Create New Task</h1>
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
                      {formatDisplayTime(selectedTime)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white/60" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="center">
                <div className="p-4">
                  <h4 className="font-medium mb-3">Select Time</h4>
                  <Select value={selectedTime} onValueChange={(value) => {
                    setSelectedTime(value);
                    setShowTimePicker(false);
                  }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
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
            {isSaving ? 'Saving…' : 'Save Task'}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MeetingModal;
