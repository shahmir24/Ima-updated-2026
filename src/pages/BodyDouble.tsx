
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, RotateCcw, MessageCircle, Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
}

const BodyDouble = () => {
  const navigate = useNavigate();
  const [sessionStarted, setSessionStarted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [session, setSession] = useState<SessionState>({
    isActive: false,
    timeRemaining: 25 * 60,
    totalTime: 25 * 60,
    phase: 'work',
    cycles: 0,
    intention: ''
  });

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
      // Timer completed
      handleTimerComplete();
    }

    return () => clearInterval(interval);
  }, [session.isActive, session.timeRemaining]);

  // Check-in prompts based on timer progress
  useEffect(() => {
    if (!session.isActive) return;
    
    const progress = 1 - (session.timeRemaining / session.totalTime);
    const timeElapsed = session.totalTime - session.timeRemaining;
    
    // Mid-session check-in
    if (timeElapsed === 12 * 60 && session.phase === 'work') {
      addAiMessage("Midway check! You're doing great 🌟 Still feeling focused?");
    }
    
    // 5-minute mark
    if (timeElapsed === 5 * 60 && session.phase === 'work') {
      addAiMessage("Nice, 5 minutes in! Keep that momentum going 🧠💪");
    }
  }, [session.timeRemaining, session.isActive]);

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
      addAiMessage("Yo, you crushed that session! 🎉 Time for a 5-minute breather. How did that feel?");
    } else {
      addAiMessage("Break's over! Ready to dive back in? You've got this 💪");
    }
  };

  const handleSendMessage = () => {
    if (!inputValue.trim()) return;
    
    addUserMessage(inputValue);
    
    // Simple AI responses (in a real app, this would connect to an AI API)
    setTimeout(() => {
      const responses = [
        "I hear you! Let's tackle this together 💙",
        "That sounds totally valid. What feels like the smallest next step?",
        "Nice work sharing that! How can I support you right now?",
        "Love the honesty. Sometimes just naming it helps, right?",
        "I'm here with you. Want to break that down into smaller pieces?",
        "You're doing great by checking in. What would feel good right now?"
      ];
      const randomResponse = responses[Math.floor(Math.random() * responses.length)];
      addAiMessage(randomResponse);
    }, 1000);
    
    setInputValue('');
  };

  const startSession = () => {
    setSessionStarted(true);
    addAiMessage("Hey friend! 👋 What are we working on today? And how's your energy - need a quick grounding breath or should we jump right in?");
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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (!sessionStarted) {
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
          
          <h1 className="text-2xl font-bold text-white">BodyDouble</h1>
          
          <div className="w-10"></div>
        </header>

        {/* Welcome Screen */}
        <main className="flex-1 w-full max-w-lg mx-auto px-4 flex flex-col items-center justify-center space-y-8">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 mx-auto bg-purple-500/20 rounded-full flex items-center justify-center">
              <Heart className="h-10 w-10 text-purple-300" />
            </div>
            <h2 className="text-2xl font-bold text-white">Hey friend! 👋</h2>
            <p className="text-white/80 text-lg leading-relaxed">
              I'm your BodyDouble - a calm, caring co-pilot here to help you focus, 
              stay on track, and celebrate your efforts.
            </p>
            <p className="text-white/60 text-sm">
              Think of me as your best friend sitting next to you while you work ✨
            </p>
          </div>

          <Button
            onClick={startSession}
            className="bg-purple-500 hover:bg-purple-600 text-white px-8 py-3 rounded-full text-lg font-medium"
          >
            Start Co-Working Session
          </Button>

          <div className="text-center space-y-2">
            <p className="text-white/50 text-sm">No pressure, just presence</p>
            <p className="text-white/50 text-sm">• Gentle accountability • Friendly check-ins • Celebration of effort •</p>
          </div>
        </main>

        <BottomNavigation />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
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
          </div>
        </div>
      </div>

      {/* Header with Timer */}
      <header className="w-full max-w-lg mx-auto p-4">
        <div className="flex items-center justify-between mb-4">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => navigate('/productivity')}
            className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
          >
            <ArrowLeft className="h-6 w-6 text-white" />
          </Button>
          
          <h1 className="text-lg font-bold text-white">BodyDouble Session</h1>
          
          <div className="w-10"></div>
        </div>

        {/* Timer Display */}
        <div className="bg-[#1F1F1F] rounded-3xl p-6 text-center">
          <div className="text-4xl font-bold text-white mb-2">
            {formatTime(session.timeRemaining)}
          </div>
          <p className="text-white/60 text-sm mb-3">
            {session.phase === 'work' ? 'Work Time' : 'Break Time'} • Cycle {session.cycles + 1}
          </p>
          
          <Progress 
            value={((session.totalTime - session.timeRemaining) / session.totalTime) * 100} 
            className="mb-4"
          />

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
      </header>

      {/* Chat Messages */}
      <main className="flex-1 w-full max-w-lg mx-auto px-4 pb-24">
        <div className="space-y-4 mb-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}
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
