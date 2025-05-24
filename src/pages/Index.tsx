import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Circle, Clock, Calendar, MessageSquare, Activity, Smile, Frown, Meh, Zap, Brain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const Index = () => {
  const [selectedMood, setSelectedMood] = useState<string | null>(null);

  const moods = [
    { name: "Happy", icon: Smile, color: "from-yellow-400 to-orange-400" },
    { name: "Sad", icon: Frown, color: "from-blue-400 to-blue-600" },
    { name: "Calm", icon: Circle, color: "from-blue-500 to-teal-400" },
    { name: "Anxious", icon: Zap, color: "from-red-400 to-pink-500" },
    { name: "Focused", icon: Brain, color: "from-purple-400 to-purple-600" }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      {/* Header */}
      <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
        {/* Centered Title */}
        <div className="flex-1 flex items-center justify-center">
          <h1 className="text-3xl font-bold font-morisawa">iMA</h1>
        </div>
        
        {/* Logo in top right */}
        <div className="h-12 w-16 flex items-center justify-center">
          <img 
            src="/lovable-uploads/d8549ee1-5d5d-4efb-9c5b-9c1b49629e14.png" 
            alt="iMA Logo" 
            className="h-10 w-auto object-contain"
          />
        </div>
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

        {/* Feature cards grid */}
        <div className="grid grid-cols-6 gap-4">
          <Link to="/breathe" className="col-span-6 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-6 aspect-[2/1] flex flex-col justify-between card-hover glow relative">
              <div className="absolute inset-0 flex items-center justify-center opacity-30">
                <div className="w-40 h-40 rounded-full bg-blue-400/20 animate-breathe"></div>
                <div className="w-32 h-32 rounded-full bg-teal-400/30 absolute animate-breathe" style={{ animationDelay: '1s' }}></div>
              </div>
              <div className="z-10">
                <span className="text-blue-200 text-sm">Feeling anxious?</span>
                <h3 className="text-xl font-bold">Quick breathing exercise</h3>
              </div>
              <div className="flex items-end justify-between z-10">
                <span className="text-blue-200 text-sm">2 min</span>
                <Circle className="h-8 w-8 text-white" />
              </div>
            </div>
          </Link>
          
          <Link to="/productivity" className="col-span-2 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-amber-600 to-amber-900 rounded-3xl p-5 h-full flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-lg font-bold mb-1">Productivity</h3>
                <p className="text-sm text-amber-200">Tasks</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Activity className="h-7 w-7 text-white/90" />
              </div>
            </div>
          </Link>

          <Link to="/wellness" className="col-span-2 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-emerald-600 to-emerald-900 rounded-3xl p-5 h-full flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-lg font-bold mb-1">Wellness</h3>
                <p className="text-sm text-emerald-200">Health</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Heart className="h-7 w-7 text-white/90" />
              </div>
            </div>
          </Link>

          <Link to="/chatbot" className="col-span-2 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-cyan-600 to-cyan-900 rounded-3xl p-5 h-full flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-lg font-bold mb-1">iMA Chat</h3>
                <p className="text-sm text-cyan-200">AI Assistant</p>
              </div>
              <div className="mt-auto flex justify-end">
                <MessageSquare className="h-7 w-7 text-white/90" />
              </div>
            </div>
          </Link>
          
          <Link to="/focus" className="col-span-3 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-purple-600 to-purple-900 rounded-3xl p-5 h-full flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-lg font-bold mb-1">Focus time</h3>
                <p className="text-sm text-purple-200">Pomodoro</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Clock className="h-7 w-7 text-white/90" />
              </div>
            </div>
          </Link>
          
          <Link to="/journal" className="col-span-3 rounded-3xl overflow-hidden">
            <div className="bg-gradient-to-br from-teal-600 to-teal-900 rounded-3xl p-5 h-full flex flex-col justify-between card-hover">
              <div>
                <h3 className="text-lg font-bold mb-1">Daily journal</h3>
                <p className="text-sm text-teal-200">Check in</p>
              </div>
              <div className="mt-auto flex justify-end">
                <Heart className="h-7 w-7 text-white/90" />
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
            {/* Task cards */}
            {[
              { title: "Team meeting", time: "10:00 AM", completed: true },
              { title: "Project proposal", time: "12:30 PM", completed: false },
              { title: "Review designs", time: "3:00 PM", completed: false }
            ].map((task, index) => (
              <div key={index} className="bg-secondary rounded-2xl p-4 flex items-center justify-between animate-slide-up" style={{ animationDelay: `${index * 100}ms` }}>
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded-full ${task.completed ? 'bg-blue-500' : 'border-2 border-muted-foreground'} flex items-center justify-center`}>
                    {task.completed && <div className="w-2 h-2 bg-white rounded-full"></div>}
                  </div>
                  <div>
                    <h3 className={`text-lg font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>{task.title}</h3>
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
                  <div className="h-full w-3/4 bg-gradient-to-r from-blue-500 to-teal-400 rounded-full"></div>
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">75%</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" className="rounded-full h-10 w-10 p-2 bg-muted flex items-center justify-center">
              <Calendar className="h-5 w-5" />
            </Button>
          </div>
        </Card>
      </main>

      {/* Bottom navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-lg border-t border-border">
        <div className="max-w-lg mx-auto flex justify-around items-center p-4">
          <Button variant="ghost" size="icon" className="flex flex-col items-center">
            <Heart className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center">
            <Clock className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center p-2 rounded-full bg-gradient-to-br from-blue-500 to-teal-400 -translate-y-3">
            <img 
              src="/lovable-uploads/d8549ee1-5d5d-4efb-9c5b-9c1b49629e14.png" 
              alt="iMA Logo" 
              className="h-6 w-6 object-contain"
            />
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center">
            <Calendar className="h-6 w-6" />
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center">
            <div className="w-6 h-6 rounded-full bg-gray-700"></div>
          </Button>
        </div>
      </nav>
    </div>
  );
};

export default Index;
