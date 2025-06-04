
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import TaskCard from '@/components/tasks/TaskCard';
import MeetingModal from '@/components/tasks/MeetingModal';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface Task {
  id: string;
  title: string;
  description: string;
  time: string;
  tag: string;
  completed: boolean;
}

const Tasks = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'all' | 'completed'>('all');
  const [showMeetingModal, setShowMeetingModal] = useState(false);
  
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const dateString = today.toLocaleDateString('en-US', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });

  const [tasks, setTasks] = useState<Task[]>([
    {
      id: '1',
      title: 'Set a meeting',
      description: 'Schedule a meeting to align on goals and next steps seamlessly',
      time: '9:15 AM - 10:15 AM',
      tag: 'Flow',
      completed: false
    },
    {
      id: '2',
      title: 'Oil Change',
      description: 'Call the workshop',
      time: '9:15 AM - 10:15 AM', 
      tag: 'Break',
      completed: false
    },
    {
      id: '3',
      title: 'Review Documents',
      description: 'Go through project requirements',
      time: '2:00 PM - 3:00 PM',
      tag: 'Focus',
      completed: true
    }
  ]);

  const filteredTasks = tasks.filter(task => 
    activeTab === 'all' ? true : task.completed
  );

  const handleCompleteTask = (taskId: string) => {
    setTasks(tasks.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      {/* Status Bar */}
      <div className="w-full max-w-lg mx-auto px-4 pt-2 pb-1">
        <div className="flex justify-between items-center text-white text-sm font-medium">
          <span>09:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
            </div>
            <svg className="w-4 h-4 ml-1" fill="white" viewBox="0 0 24 24">
              <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
            </svg>
            <div className="w-6 h-3 border border-white rounded-sm ml-1">
              <div className="w-4 h-1.5 bg-white rounded-sm m-0.5"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/productivity')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-2xl font-bold text-white">Today's Tasks</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Sub-header */}
      <div className="w-full max-w-lg mx-auto px-4 mb-6">
        <div className="flex justify-between items-center">
          <span className="text-white text-base">{dayName}, {dateString}</span>
          <div className="flex items-center gap-3">
            <Button 
              onClick={() => setShowMeetingModal(true)}
              style={{ backgroundColor: '#2f74db' }}
              className="hover:opacity-90 text-white rounded-full px-4 py-2 flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              New Task
            </Button>
            <Calendar className="h-6 w-6 text-white" />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="w-full max-w-lg mx-auto px-4 mb-6">
        <div className="flex gap-2">
          <Button
            onClick={() => setActiveTab('all')}
            className={`rounded-full px-6 py-2 flex items-center gap-2 ${
              activeTab === 'all' 
                ? 'text-white' 
                : 'bg-gray-600 text-white hover:bg-gray-500'
            }`}
            style={activeTab === 'all' ? { background: 'linear-gradient(to right, #2f74db, #2f74db)' } : {}}
          >
            All
            <Badge variant="secondary" className="bg-white/20 text-white text-xs">
              {tasks.filter(t => !t.completed).length}
            </Badge>
          </Button>
          <Button
            onClick={() => setActiveTab('completed')}
            className={`rounded-full px-6 py-2 flex items-center gap-2 ${
              activeTab === 'completed' 
                ? 'text-white' 
                : 'bg-gray-600 text-white hover:bg-gray-500'
            }`}
            style={activeTab === 'completed' ? { background: 'linear-gradient(to right, #2f74db, #2f74db)' } : {}}
          >
            Completed
            <Badge variant="secondary" className="bg-white/20 text-white text-xs">
              {tasks.filter(t => t.completed).length}
            </Badge>
          </Button>
        </div>
      </div>

      {/* Task Cards */}
      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">
        {filteredTasks.map((task) => (
          <TaskCard 
            key={task.id} 
            task={task} 
            onComplete={() => handleCompleteTask(task.id)} 
          />
        ))}
      </main>

      {/* Meeting Modal */}
      <MeetingModal 
        isOpen={showMeetingModal} 
        onClose={() => setShowMeetingModal(false)} 
      />

      <BottomNavigation />
    </div>
  );
};

export default Tasks;
