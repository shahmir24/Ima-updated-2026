
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, Check, Pencil, Play, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Task {
  id: string;
  title: string;
  description: string;
  /** Pre-formatted, e.g. "9:15 AM - 10:15 AM". Empty when no time was set. */
  time: string;
  /** "Today" when scheduled for today, otherwise a short date. */
  dateLabel: string;
  tag: string;
  completed: boolean;
}

interface TaskCardProps {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
  /** Optional, so the card stays usable anywhere editing is not offered. */
  onEdit?: () => void;
  /**
   * Take this task into Focus / into Body Double. Both optional for the same
   * reason as onEdit, and both hidden on a completed task: there is nothing to
   * start and nothing to be stuck on once it is done.
   */
  onStart?: () => void;
  onStuck?: () => void;
  busy?: boolean;
}

const TaskCard = ({ task, onComplete, onDelete, onEdit, onStart, onStuck, busy = false }: TaskCardProps) => {
  const getTagColor = (tag: string) => {
    switch (tag.toLowerCase()) {
      case 'flow':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'break':
        return 'bg-teal-500/20 text-teal-300 border-teal-500/30';
      case 'focus':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const getCardBackground = () => {
    if (task.completed) {
      return '#1d8690';
    }
    return '#1f1f1f';
  };

  return (
    <div
      className={`rounded-3xl p-6 ${task.completed ? 'opacity-70' : ''}`}
      style={{ backgroundColor: getCardBackground() }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <h3 className={`text-xl font-bold text-white ${task.completed ? 'line-through' : ''}`}>
              {task.title}
            </h3>
            <Badge className={`rounded-full border ${getTagColor(task.tag)}`}>
              {task.tag}
            </Badge>
          </div>

          <p className="text-white/80 text-sm mb-4 leading-relaxed">
            {task.description}
          </p>

          <div className="flex items-center justify-between">
            <div className="text-white/90 text-sm">
              <span className="font-medium">{task.dateLabel}</span>
              <br />
              <span>{task.time}</span>
            </div>

            <div className="flex items-center gap-2">
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEdit}
                  disabled={busy}
                  aria-label={`Edit task "${task.title}"`}
                  className="h-11 w-11 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                >
                  <Pencil className="h-5 w-5" />
                </Button>
              )}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy}
                    aria-label={`Delete task "${task.title}"`}
                    className="h-11 w-11 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                  >
                    <Trash2 className="h-5 w-5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this task?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{task.title}" will be removed permanently. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button
                onClick={onComplete}
                disabled={busy}
                aria-label={task.completed ? 'Mark as not done' : 'Mark as done'}
                className={`h-12 w-12 rounded-full ${
                  task.completed
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'hover:opacity-90'
                } flex items-center justify-center`}
                style={!task.completed ? { backgroundColor: '#2f74db' } : {}}
              >
                <Check className="h-6 w-6 text-white" />
              </Button>
            </div>
          </div>

          {/*
            The two ways out of a task, matching Home: Start takes it into
            Focus, "I'm stuck" takes it into Body Double. Both are hidden once
            the task is done.

            Their own row rather than the icon row above: at 320px the card has
            240px of inner width and those three icons already occupy 152px.
            They wrap rather than shrink, the same approach the Right Now card
            uses, so at 320px each takes a full line instead of being crushed.
          */}
          {!task.completed && (onStart || onStuck) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {onStart && (
                <Button
                  onClick={onStart}
                  aria-label={`Start "${task.title}" in Focus`}
                  style={{ backgroundColor: '#2f74db' }}
                  className="min-h-11 flex-1 min-w-[130px] rounded-full text-white hover:opacity-90"
                >
                  <Play className="mr-2 h-4 w-4 fill-current" aria-hidden="true" />
                  Start
                </Button>
              )}

              {onStuck && (
                <Button
                  onClick={onStuck}
                  aria-label={`Get unstuck on "${task.title}" with Body Double`}
                  className="min-h-11 flex-1 min-w-[130px] rounded-full bg-white/10 text-white hover:bg-white/20"
                >
                  <Brain className="mr-2 h-4 w-4" aria-hidden="true" />
                  I’m stuck
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
