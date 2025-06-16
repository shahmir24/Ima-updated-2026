import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw, MessageCircle, Heart, Droplets, Coffee, Zap, Brain, Meh, Smile, Frown, Sun, Moon, CheckCircle, Edit3, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
}

interface SessionState {
  isActive: boolean;
  timeRemaining: number;
  totalTime: number;
  phase: 'work' | 'break';
  cycles: number;
  intention: string;
  mood: string;
  startType: string;
}

interface SessionWrapUp {
  didWell: string;
  wantToImprove: string;
  endMood: string;
}

const BodyDouble = () => {
  const navigate = useNavigate();
  const [currentScreen, setCurrentScreen] = useState<'welcome' | 'session' | 'wrapup'>('welcome');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [showDistraction, setShowDistraction] = useState(false);
  const [showCheckIn, setShowCheckIn] = useState(false);
  const [checkInMessage, setCheckInMessage] = useState('');
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [session, setSession] = useState<SessionState>({
    isActive: false,
    timeRemaining: 25 * 60,
    totalTime: 25 * 60,
    phase: 'work',
    cycles: 0,
    intention: '',
    mood: '',
    startType: ''
  });
  const [wrapUp, setWrapUp] = useState<SessionWrapUp>({
    didWell: '',
    wantToImprove: '',
    endMood: ''
  });

  const moods = [
    { name: 'calm', icon: '😌', color: 'from-blue-400 to-blue-600' },
    { name: 'anxious', icon: '😰', color: 'from-yellow-400 to-orange-500' },
    { name: 'sleepy', icon: '😴', color: 'from-purple-400 to-indigo-500' },
    { name: 'fire', icon: '🔥', color: 'from-red-400 to-pink-500' },
    { name: 'scattered', icon: '🌪️', color: 'from-gray-400 to-gray-600' }
  ];

  const startOptions = [
    { id: 'task', title: 'Task I want to focus on', icon: CheckCircle },
    { id: 'scattered', title: "I'm feeling scattered", icon: Brain },
    { id: 'lost', title: "I don't know where to start", icon: Meh }
  ];

  // Timer effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (session.isActive && session.timeRemaining > 0) {
      interval = setInterval(() => {
        setSession(prev => ({
          ...prev,
          timeRemaining: prev.timeRemaining - 1
        }));
      }, 1000);
    } else if (session.timeRemaining === 0 && session.isActive) {
      handleTimerComplete();
    }

    return () => clearInterval(interval);
  }, [session.isActive, session.timeRemaining]);

  // Activity tracking for distraction detection
  useEffect(() => {
    const handleActivity = () => setLastActivity(Date.now());
    
    window.addEventListener('click', handleActivity);
    window.addEventListener('keypress', handleActivity);
    
    return () => {
      window.removeEventListener('click', handleActivity);
      window.removeEventListener('keypress', handleActivity);
    };
  }, []);

  // Check-in prompts based on timer progress
  useEffect(() => {
    if (!session.isActive) return;
    
    const timeElapsed = session.totalTime - session.timeRemaining;
    
    // 5-minute mark
    if (timeElapsed === 5 * 60 && session.phase === 'work') {
      showCheckInCard("5 mins in — want a water break or keep flowing? 💧");
    }
    
    // Mid-session check-in
    if (timeElapsed === 12 * 60 && session.phase === 'work') {
      showCheckInCard("Still on track, love? You're doing amazing ✨");
    }
  }, [session.timeRemaining, session.isActive]);

  // Distraction detection
  useEffect(() => {
    if (!session.isActive) return;
    
    const checkDistraction = setInterval(() => {
      if (Date.now() - lastActivity > 60000) { // 1 minute of inactivity
        setShowDistraction(true);
      }
    }, 30000);

    return () => clearInterval(checkDistraction);
  }, [lastActivity, session.isActive]);

  const showCheckInCard = (message: string) => {
    setCheckInMessage(message);
    setShowCheckIn(true);
    setTimeout(() => setShowCheckIn(false), 5000);
  };

  const addAiMessage = (text: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'ai',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const addUserMessage = (text: string) => {
    const newMessage: Message = {
      id: Date.now().toString(),
      text,
      sender: 'user',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
  };

  const handleTimerComplete = () => {
    setSession(prev => ({
      ...prev,
      isActive: false,
      phase: prev.phase === 'work' ? 'break' : 'work',
      cycles: prev.phase === 'work' ? prev.cycles + 1 : prev.cycles,
      timeRemaining: prev.phase === 'work' ? 5 * 60 : 25 * 60,
      totalTime: prev.phase === 'work' ? 5 * 60 : 25 * 60
    }));

    if (session.phase === 'work') {
      addAiMessage("Beautiful work! 🎉 Time for a 5-minute breather. How did that feel?");
    } else {
      addAiMessage("Break's over! Ready to dive back in? You've got this 💪");
    }
  };

  const startSession = (mood: string, startType: string, intention: string) => {
    setSession(prev => ({
      ...prev,
      mood,
      startType,
      intention
    }));
    setCurrentScreen('session');
    
    const moodResponses = {
      calm: "Love that calm energy! Let's flow with it 🌊",
      anxious: "I feel you. Let's channel that energy into focus 💙",
      sleepy: "No judgment here. We'll take it gentle and steady ☁️",
      fire: "That's the energy! Let's put it to good use 🚀",
      scattered: "Totally normal. We'll gather those thoughts together ✨"
    };
    
    addAiMessage(moodResponses[mood] || "Hey friend! 👋 Ready to co-work together?");
    addAiMessage(`Working on: ${intention}. I'm here with you every step of the way.`);
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    addUserMessage(inputValue);
    
    setTimeout(() => {
      const responses = [
        "I hear you! We're in this together 💙",
        "That sounds totally valid. What feels like the smallest next step?",
        "Love the honesty. Sometimes just naming it helps, right?",
        "You're doing great by checking in. What would feel good right now?",
        "I'm here with you. Want to break that down into smaller pieces?"
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      addAiMessage(randomResponse);
    }, 1000);
    
    setInputValue('');
  };

  const toggleTimer = () => {
    setSession(prev => ({
      ...prev,
      isActive: !prev.isActive
    }));
  };

  const resetTimer = () => {
    setSession(prev => ({
      ...prev,
      isActive: false,
      timeRemaining: 25 * 60,
      totalTime: 25 * 60,
      phase: 'work',
      cycles: 0
    }));
  };

  const handleDistracted = () => {
    setShowDistraction(true);
  };

  const handleSessionComplete = () => {
    setCurrentScreen('wrapup');
    addAiMessage("You did it! 🎉 Let's reflect on how that went.");
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progressPercentage = ((session.totalTime - session.timeRemaining) / session.totalTime) * 100;

  // Welcome Screen
  if (currentScreen === 'welcome') {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
        {/* Header */}
        <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/')}
            className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>
          
          <h1 className="text-2xl font-bold text-white">BodyDouble</h1>
          
          <div className="w-10"></div>
        </header>

        {/* Welcome Content */}
        <main className="flex-1 w-full max-w-lg mx-auto px-4 flex flex-col items-center justify-center space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto bg-purple-500/20 rounded-full flex items-center justify-center">
              <Heart className="h-10 w-10 text-purple-300" />
            </div>
            <h2 className="text-2xl font-bold text-white">Hey, what's on your mind today?</h2>
            <p className="text-white/80 text-lg leading-relaxed">
              Let's set the vibe and get you focused ✨
            </p>
          </div>

          {/* Mood Selector */}
          <div className="w-full space-y-4">
            <p className="text-white/80 text-center">How are you feeling?</p>
            <div className="flex justify-center gap-3 flex-wrap">
              {moods.map((mood) => (
                <button
                  key={mood.name}
                  onClick={() => setSession(prev => ({ ...prev, mood: mood.name }))}
                  className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                    session.mood === mood.name 
                      ? `bg-gradient-to-br ${mood.color} scale-105` 
                      : 'bg-[#1F1F1F] hover:bg-[#2F2F2F]'
                  }`}
                >
                  <span className="text-2xl mb-1">{mood.icon}</span>
                  <span className="text-sm text-white capitalize">{mood.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Start Options */}
          <div className="w-full space-y-3">
            <p className="text-white/80 text-center">What brings you here?</p>
            {startOptions.map((option) => {
              const IconComponent = option.icon;
              return (
                <button
                  key={option.id}
                  onClick={() => setSession(prev => ({ ...prev, startType: option.id }))}
                  className={`w-full p-4 rounded-2xl text-left transition-all ${
                    session.startType === option.id 
                      ? 'bg-purple-500/30 border border-purple-400/50' 
                      : 'bg-[#1F1F1F] hover:bg-[#2F2F2F] border border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <IconComponent className="h-5 w-5 text-purple-300" />
                    <span className="text-white">{option.title}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Task Input */}
          {session.startType && (
            <div className="w-full space-y-3 animate-fade-in">
              <Input
                value={session.intention}
                onChange={(e) => setSession(prev => ({ ...prev, intention: e.target.value }))}
                placeholder="What would you like to work on?"
                className="bg-[#1F1F1F] border-white/20 text-white placeholder:text-white/50"
              />
              
              <div className="flex gap-3">
                <Button
                  onClick={() => startSession(session.mood, session.startType, session.intention)}
                  disabled={!session.mood || !session.intention.trim()}
                  className="flex-1 bg-purple-500 hover:bg-purple-600 text-white"
                >
                  Start Co-Working
                </Button>
                
                <Button
                  variant="outline"
                  className="border-purple-400/50 text-purple-300 hover:bg-purple-500/20"
                >
                  <Wind className="h-4 w-4 mr-2" />
                  Quick Breath First
                </Button>
              </div>
            </div>
          )}
        </main>

        <BottomNavigation />
      </div>
    );
  }

  // Session Wrap-up Screen
  if (currentScreen === 'wrapup') {
    return (
      <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
        {/* Header */}
        <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/')}
            className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>
          
          <h1 className="text-lg font-bold text-white">Session Complete</h1>
          
          <div className="w-10"></div>
        </header>

        {/* Wrap-up Content */}
        <main className="flex-1 w-full max-w-lg mx-auto px-4 space-y-6">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
              <CheckCircle className="h-8 w-8 text-green-300" />
            </div>
            <h2 className="text-xl font-bold text-white">Beautiful work! 🎉</h2>
            <p className="text-white/80">Let's reflect on how that went</p>
          </div>

          {/* Reflection Questions */}
          <div className="space-y-4">
            <div>
              <label className="block text-white/80 text-sm mb-2">One thing I did well:</label>
              <Input
                value={wrapUp.didWell}
                onChange={(e) => setWrapUp(prev => ({ ...prev, didWell: e.target.value }))}
                placeholder="I stayed focused, took breaks, asked for help..."
                className="bg-[#1F1F1F] border-white/20 text-white placeholder:text-white/50"
              />
            </div>

            <div>
              <label className="block text-white/80 text-sm mb-2">One thing I want to improve:</label>
              <Input
                value={wrapUp.wantToImprove}
                onChange={(e) => setWrapUp(prev => ({ ...prev, wantToImprove: e.target.value }))}
                placeholder="Starting sooner, fewer distractions..."
                className="bg-[#1F1F1F] border-white/20 text-white placeholder:text-white/50"
              />
            </div>

            {/* End Mood */}
            <div>
              <label className="block text-white/80 text-sm mb-2">How do you feel now?</label>
              <div className="flex justify-center gap-3">
                {moods.map((mood) => (
                  <button
                    key={mood.name}
                    onClick={() => setWrapUp(prev => ({ ...prev, endMood: mood.name }))}
                    className={`flex flex-col items-center p-3 rounded-2xl transition-all ${
                      wrapUp.endMood === mood.name 
                        ? `bg-gradient-to-br ${mood.color} scale-105` 
                        : 'bg-[#1F1F1F] hover:bg-[#2F2F2F]'
                    }`}
                  >
                    <span className="text-2xl mb-1">{mood.icon}</span>
                    <span className="text-xs text-white capitalize">{mood.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-3">
            <Button
              className="w-full bg-purple-500 hover:bg-purple-600 text-white"
              onClick={() => navigate('/journal')}
            >
              <Edit3 className="h-4 w-4 mr-2" />
              Save as Journal Entry
            </Button>
            
            <Button
              variant="outline"
              className="w-full border-purple-400/50 text-purple-300 hover:bg-purple-500/20"
              onClick={() => {
                setCurrentScreen('welcome');
                setSession({
                  isActive: false,
                  timeRemaining: 25 * 60,
                  totalTime: 25 * 60,
                  phase: 'work',
                  cycles: 0,
                  intention: session.intention,
                  mood: '',
                  startType: ''
                });
              }}
            >
              Replay This Setup
            </Button>
          </div>
        </main>

        <BottomNavigation />
      </div>
    );
  }

  // Active Session Screen
  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Header with Timer */}
      <header className="w-full max-w-lg mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/')}
            className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>
          
          <h1 className="text-lg font-bold text-white">BodyDouble Session</h1>
          
          <div className="w-10"></div>
        </div>

        {/* Animated Timer Display */}
        <div className="bg-[#1F1F1F] rounded-3xl p-6 text-center relative overflow-hidden">
          {/* Animated Ring Background */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div 
              className="w-32 h-32 rounded-full border-4 border-purple-500/20"
              style={{
                background: `conic-gradient(from 0deg, #a855f7 ${progressPercentage * 3.6}deg, transparent ${progressPercentage * 3.6}deg)`
              }}
            />
          </div>
          
          <div className="relative z-10">
            <div className="text-4xl font-bold text-white mb-2">
              {formatTime(session.timeRemaining)}
            </div>
            <p className="text-white/60 text-sm mb-1">
              {session.phase === 'work' ? 'Focus Time' : 'Break Time'} • Cycle {session.cycles + 1}
            </p>
            <p className="text-purple-300 text-sm mb-4">
              Working on: {session.intention}
            </p>
            
            <div className="flex items-center justify-center space-x-4">
              <Button
                onClick={toggleTimer}
                className="w-12 h-12 rounded-full bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50"
              >
                {session.isActive ? (
                  <Pause className="h-6 w-6 text-purple-400" />
                ) : (
                  <Play className="h-6 w-6 text-purple-400" />
                )}
              </Button>
              
              <Button
                onClick={resetTimer}
                variant="ghost"
                className="w-10 h-10 rounded-full hover:bg-white/10"
              >
                <RotateCcw className="h-5 w-5 text-white/60" />
              </Button>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <Button
            onClick={handleDistracted}
            variant="outline"
            className="flex-1 border-orange-400/50 text-orange-300 hover:bg-orange-500/20"
          >
            I got distracted
          </Button>
          
          <Button
            onClick={handleSessionComplete}
            className="flex-1 bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 text-green-300"
          >
            I'm done
          </Button>
        </div>
      </header>

      {/* Floating Check-in Card */}
      {showCheckIn && (
        <div className="absolute top-1/3 left-4 right-4 z-50 animate-fade-in">
          <Card className="bg-purple-500/10 border border-purple-400/30 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <Heart className="h-5 w-5 text-purple-300" />
              <p className="text-white text-sm">{checkInMessage}</p>
            </div>
          </Card>
        </div>
      )}

      {/* Chat Messages */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 pb-24">
        <div className="space-y-4 mb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div
                className={`max-w-[80%] p-3 rounded-2xl ${
                  message.sender === 'user'
                    ? 'bg-purple-500 text-white'
                    : 'bg-[#1F1F1F] text-white border border-white/10'
                }`}
              >
                {message.sender === 'ai' && (
                  <div className="flex items-center gap-2 mb-1">
                    <Heart className="h-4 w-4 text-purple-300" />
                    <span className="text-purple-300 text-sm font-medium">BodyDouble</span>
                  </div>
                )}
                <p className="text-sm leading-relaxed">{message.text}</p>
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Distraction Rescue Modal */}
      <Dialog open={showDistraction} onOpenChange={setShowDistraction}>
        <DialogContent className="bg-[#1F1F1F] border border-white/20 text-white">
          <DialogHeader>
            <DialogTitle className="text-center text-white">
              Hey, no worries — feels like your mind wandered 🌊
            </DialogTitle>
          </DialogHeader>
          
          <div className="text-center space-y-4">
            <p className="text-white/80">Want to reset together?</p>
            
            <div className="grid grid-cols-2 gap-3">
              <Button
                onClick={() => setShowDistraction(false)}
                className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/50 text-blue-300"
              >
                <Wind className="h-4 w-4 mr-2" />
                Quick breath
              </Button>
              
              <Button
                onClick={() => setShowDistraction(false)}
                className="bg-green-500/20 hover:bg-green-500/30 border border-green-400/50 text-green-300"
              >
                <Brain className="h-4 w-4 mr-2" />
                Break into steps
              </Button>
              
              <Button
                onClick={() => setShowDistraction(false)}
                className="bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-300"
              >
                🎵 Lo-fi sounds
              </Button>
              
              <Button
                onClick={() => setShowDistraction(false)}
                variant="outline"
                className="border-white/20 text-white hover:bg-white/10"
              >
                Back to task
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Input Bar */}
      <div className="fixed bottom-20 left-0 right-0 bg-background border-t border-white/10">
        <div className="w-full max-w-lg mx-auto p-4">
          <div className="flex items-center space-x-2">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Share what's on your mind..."
              className="flex-1 bg-[#1F1F1F] border-white/20 text-white placeholder:text-white/50"
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            />
            <Button
              onClick={handleSendMessage}
              className="bg-purple-500 hover:bg-purple-600 text-white px-4"
            >
              <MessageCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
};

export default BodyDouble;
