
import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Check, ChevronRight } from 'lucide-react';

interface Task {
  id: string;
  title: string;
  description: string;
  time: string;
  tag: string;
  completed: boolean;
}

interface TaskCardProps {
  task: Task;
  onComplete: () => void;
}

const TaskCard = ({ task, onComplete }: TaskCardProps) => {
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
              <span className="font-medium">Today</span>
              <br />
              <span>{task.time}</span>
            </div>
            
            <Button
              onClick={onComplete}
              className={`h-12 w-12 rounded-full ${
                task.completed 
                  ? 'bg-green-500 hover:bg-green-600' 
                  : 'hover:opacity-90'
              } flex items-center justify-center`}
              style={!task.completed ? { backgroundColor: '#2f74db' } : {}}
            >
              {task.completed ? (
                <Check className="h-6 w-6 text-white" />
              ) : (
                <ChevronRight className="h-6 w-6 text-white" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskCard;
