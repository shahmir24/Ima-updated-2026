
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Circle, Clock, Calendar, MessageSquare, Activity, Smile, Frown, Meh, Zap, Brain, User, Settings, HelpCircle, LogOut, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const Index = () => {
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [tasks, setTasks] = useState([
    { id: 1, title: "Team meeting", time: "10:00 AM", completed: false },
    { id: 2, title: "Project proposal", time: "12:30 PM", completed: false },
    { id: 3, title: "Review designs", time: "3:00 PM", completed: false }
  ]);

  const moods = [
    { name: "Happy", icon: Smile, color: "from-yellow-400 to-orange-400" },
    { name: "Sad", icon: Frown, color: "from-blue-400 to-blue-600" },
    { name: "Calm", icon: Circle, color: "from-blue-500 to-teal-400" },
    { name: "Anxious", icon: Zap, color: "from-red-400 to-pink-500" },
    { name: "Focused", icon: Brain, color: "from-purple-400 to-purple-600" }
  ];

  const toggleTask = (taskId: number) => {
    setTasks(tasks.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const completedTasks = tasks.filter(task => task.completed).length;
  const progressPercentage = (completedTasks / tasks.length) * 100;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
        {/* Logo in top left */}
        <div className="h-12 w-16 flex items-center justify-center">
          <img 
            src="/lovable-uploads/d8549ee1-5d5d-4efb-9c1b49629e14.png" 
            alt="iMA Logo" 
            className="h-10 w-auto object-contain"
          />
        </div>
        
        {/* Centered Title */}
        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-3xl font-bold font-morisawa">iMA</h1>
        </div>
        
        {/* Profile dropdown in top right */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-10 w-10 rounded-full p-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 bg-background border border-border">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <User className="mr-2 h-4 w-4" />
              <span>Profile Info</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
            </DropdownMenuItem>
            <DropdownMenuItem>
              <HelpCircle className="mr-2 h-4 w-4" />
              <span>Help</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log Out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-6 flex flex-col gap-6">
        {/* Question */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-medium text-foreground">How are you feeling today?</h2>
        </div>

        {/* Mood selection */}
        <div className="flex justify-center gap-4 mb-8 overflow-x-auto pb-2">
          {moods.map((mood, index) => {
            const IconComponent = mood.icon;
            const isSelected = selectedMood === mood.name;
            
            return (
              <button 
                key={index} 
                onClick={() => setSelectedMood(mood.name)}
                className="flex flex-col items-center min-w-[80px] transition-all duration-200"
              >
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-2 transition-all duration-200 ${
                  isSelected 
                    ? `bg-gradient-to-br ${mood.color} shadow-lg scale-110` 
                    : "bg-secondary hover:bg-secondary/80"
                }`}>
                  <IconComponent className={`h-7 w-7 ${isSelected ? 'text-white' : 'text-muted-foreground'}`} />
                </div>
                <span className={`text-sm font-medium transition-colors ${
                  isSelected ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {mood.name}
                </span>
              </button>
            );
          })}
        </div>

        {/* Feature cards grid - Updated for better mobile responsiveness */}
        <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
          <Link to="/breathe" className="col-span-2 sm:col-span-6 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-4 sm:p-6 aspect-[2/1] flex flex-col justify-between card-hover glow relative">
              <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <div className="w-32 sm:w-40 h-32 sm:h-40 rounded-full bg-blue-400/20 animate-breathe"></div>
                <div className="w-24 sm:w-32 h-24 sm:h-32 rounded-full bg-teal-400/30 absolute animate-breathe" style={{ animationDelay: '1s' }}></div>
              </div>
              <div className="z-10">
                <span className="text-blue-200 text-xs sm:text-sm">Feeling anxious?</span>
                <h3 className="text-lg sm:text-xl font-bold">Quick breathing exercise</h3>
              </div>
              <div className="flex items-end justify-between z-10">
                <span className="text-blue-200 text-xs sm:text-sm">2 min</span>
                <Circle className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
            </div>
          </Link>
          
          <Link to="/productivity" className="col-span-1 sm:col-span-2 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-amber-600 to-amber-900 rounded-3xl p-3 sm:p-5 h-32 sm:h-auto flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-sm sm:text-lg font-bold mb-1">Productivity</h3>
                <p className="text-xs sm:text-sm text-amber-200">Tasks</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Activity className="h-5 w-5 sm:h-7 sm:w-7 text-white/90" />
              </div>
            </div>
          </Link>

          <Link to="/wellness" className="col-span-1 sm:col-span-2 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-900 rounded-3xl p-3 sm:p-5 h-32 sm:h-auto flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-sm sm:text-lg font-bold mb-1">Wellness</h3>
                <p className="text-xs sm:text-sm text-emerald-200">Health</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Heart className="h-5 w-5 sm:h-7 sm:w-7 text-white/90" />
              </div>
            </div>
          </Link>

          <Link to="/body-double" className="col-span-2 sm:col-span-2 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-cyan-600 to-cyan-900 rounded-3xl p-3 sm:p-5 h-32 sm:h-auto flex flex-col justify-between card-hover">
              <div className="flex items-center gap-2 mb-1">
                <img 
                  src="/lovable-uploads/a89d4002-b0ce-4d98-b91b-70576e972e1f.png" 
                  alt="AI Chat Logo" 
                  className="h-4 w-4 sm:h-5 sm:w-5 object-contain"
                />
                <h3 className="text-sm sm:text-lg font-bold">iMA Chat</h3>
              </div>
              <p className="text-xs sm:text-sm text-cyan-200 mb-auto">AI Assistant</p>
              <div className="mt-auto flex justify-end">
                <MessageSquare className="h-5 w-5 sm:h-7 sm:w-7 text-white/90" />
              </div>
            </div>
          </Link>
          
          <Link to="/focus" className="col-span-1 sm:col-span-3 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-purple-600 to-purple-900 rounded-3xl p-3 sm:p-5 h-32 sm:h-auto flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-sm sm:text-lg font-bold mb-1">Focus time</h3>
                <p className="text-xs sm:text-sm text-purple-200">Pomodoro</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Clock className="h-5 w-5 sm:h-7 sm:w-7 text-white/90" />
              </div>
            </div>
          </Link>
          
          <Link to="/soundscape" className="col-span-1 sm:col-span-3 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-indigo-600 to-indigo-900 rounded-3xl p-3 sm:p-5 h-32 sm:h-auto flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-sm sm:text-lg font-bold mb-1">Soundscaping</h3>
                <p className="text-xs sm:text-sm text-indigo-200">Focus sounds</p>
              </div>
              <div className="mt-auto flex justify-end">
                <div className="relative">
                  <div className="w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-white/20 flex items-center justify-center">
                    <div className="w-2 h-2 sm:w-3 sm:h-3 rounded-full bg-white/80"></div>
                  </div>
                  <div className="absolute inset-0 w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-white/10 animate-ping"></div>
                </div>
              </div>
            </div>
          </Link>
          
          <Link to="/journal" className="col-span-2 sm:col-span-6 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-teal-600 to-teal-900 rounded-3xl p-3 sm:p-5 h-32 sm:h-auto flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-sm sm:text-lg font-bold mb-1">Daily journal</h3>
                <p className="text-xs sm:text-sm text-teal-200">Check in</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Heart className="h-5 w-5 sm:h-7 sm:w-7 text-white/90" />
              </div>
            </div>
          </Link>
        </div>

        {/* Tasks section */}
        <div className="mt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Today's tasks</h2>
            <Button variant="ghost" size="sm" className="text-primary">View all</Button>
          </div>
          
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="bg-secondary rounded-2xl p-4 flex items-center justify-between animate-slide-up">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => toggleTask(task.id)}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
                      task.completed 
                        ? 'bg-blue-500 border-blue-500' 
                        : 'border-muted-foreground hover:border-blue-500'
                    }`}
                  >
                    {task.completed && <Check className="w-4 h-4 text-white" />}
                  </button>
                  <div>
                    <h3 className="text-lg font-medium">{task.title}</h3>
                    <p className="text-sm text-muted-foreground">{task.time}</p>
                  </div>
                </div>
                <Button variant="ghost" size="sm" className="text-primary">Edit</Button>
              </div>
            ))}
          </div>
        </div>

        {/* Personal goal card */}
        <Card className="mt-4 bg-secondary border-0 rounded-3xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold mb-1">Personal goal</h3>
              <p className="text-muted-foreground text-sm mb-3">Daily meditation</p>
              <div className="flex items-center gap-2">
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-teal-400 rounded-full transition-all duration-300" 
                    style={{ width: `${progressPercentage}%` }}
                  ></div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(progressPercentage)}%</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="rounded-full h-10 w-10 p-2 bg-muted flex items-center justify-center">
              <Calendar className="h-5 w-5" />
            </Button>
          </div>
        </Card>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border">
        <div className="max-w-lg mx-auto flex justify-around items-center py-2 px-4">
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <Heart className="h-6 w-6" />
            <span className="text-xs">Wellness</span>
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <Clock className="h-6 w-6" />
            <span className="text-xs">Focus</span>
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center p-2 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 -translate-y-2 shadow-lg">
            <img 
              src="/lovable-uploads/d8549ee1-5d5d-4efb-9c5b-9c1b49629e14.png" 
              alt="iMA Logo" 
              className="h-8 w-8 object-contain"
            />
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <Calendar className="h-6 w-6" />
            <span className="text-xs">Journal</span>
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center">
              <User className="h-4 w-4 text-white" />
            </div>
            <span className="text-xs">Profile</span>
          </Button>
        </div>
      </nav>
    </div>
  );
};

export default Index;
