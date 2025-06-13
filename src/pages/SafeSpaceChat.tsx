import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Send, Heart, Wind, Edit3, Phone, Mic, MicOff, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  actionCard?: 'grounding' | 'breathing' | 'journal' | 'emergency';
}

const SafeSpaceChat = () => {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hey there. I'm right here with you. You're safe, and you're not alone. What's going on?",
      isUser: false,
      timestamp: new Date()
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestedPrompts = [
    { text: "Help me feel grounded", icon: <Heart className="h-4 w-4" /> },
    { text: "I'm feeling overwhelmed", icon: <Wind className="h-4 w-4" /> },
    { text: "Can you just be here with me?", icon: <Heart className="h-4 w-4" /> },
    { text: "I need someone to talk to", icon: <Heart className="h-4 w-4" /> },
    { text: "Help me breathe slowly", icon: <Wind className="h-4 w-4" /> },
    { text: "What should I focus on right now?", icon: <Heart className="h-4 w-4" /> }
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const getAIResponse = (userMessage: string): { text: string; actionCard?: Message['actionCard'] } => {
    const lowerMessage = userMessage.toLowerCase();
    
    if (lowerMessage.includes('ground') || lowerMessage.includes('5-4-3')) {
      return {
        text: "Let's ground you right now. I'm going to walk you through the 5-4-3-2-1 technique. It's simple and it works. Ready?",
        actionCard: 'grounding'
      };
    }
    
    if (lowerMessage.includes('spiral') || lowerMessage.includes('thoughts')) {
      return {
        text: "I hear you. When thoughts spiral, it feels overwhelming, but you're not stuck there forever. Let's slow this down together. Can you try taking just one deep breath with me?"
      };
    }
    
    if (lowerMessage.includes('safe') && lowerMessage.includes('body')) {
      return {
        text: "Your body is trying to protect you right now, even if it doesn't feel comfortable. You are safe in this moment. Let's find your way back to feeling settled.",
        actionCard: 'breathing'
      };
    }
    
    if (lowerMessage.includes('breathing') || lowerMessage.includes('breath')) {
      return {
        text: "Breathing is your anchor. When everything feels chaotic, your breath is always there for you. Let me guide you through something gentle.",
        actionCard: 'breathing'
      };
    }
    
    if (lowerMessage.includes('friend') || lowerMessage.includes('talk')) {
      return {
        text: "I'm here as your friend. No judgment, no pressure. Sometimes we just need someone to sit with us in the mess, and that's exactly what I'm doing. You don't have to be okay right now."
      };
    }
    
    if (lowerMessage.includes('what') && lowerMessage.includes('do')) {
      return {
        text: "Right now, you don't have to do anything big. Just stay here with me. The next right thing might be as simple as feeling your feet on the ground or taking one slow breath."
      };
    }
    
    // Default supportive responses
    const responses = [
      "I'm right here. You don't have to go through this alone.",
      "Whatever you're feeling right now is valid. There's no wrong way to feel.",
      "You're being so brave by reaching out. That takes real strength.",
      "Let's take this moment by moment. You don't have to figure it all out right now.",
      "Your feelings make sense. You're not broken, you're human.",
      "I believe in your ability to get through this, even when it doesn't feel that way."
    ];
    
    return { text: responses[Math.floor(Math.random() * responses.length)] };
  };

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsTyping(true);

    // Simulate AI typing delay
    setTimeout(() => {
      const aiResponse = getAIResponse(text);
      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: aiResponse.text,
        isUser: false,
        timestamp: new Date(),
        actionCard: aiResponse.actionCard
      };

      setMessages(prev => [...prev, aiMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      
      recorder.onstart = () => {
        setIsRecording(true);
      };
      
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          const simulatedText = "I'm feeling anxious and need some support right now.";
          handleSendMessage(simulatedText);
        }
      };
      
      recorder.onstop = () => {
        setIsRecording(false);
        stream.getTracks().forEach(track => track.stop());
      };
      
      setMediaRecorder(recorder);
      recorder.start();
      
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 10000);
      
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Unable to access microphone. Please check your permissions.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
  };

  const handlePromptClick = (promptText: string) => {
    handleSendMessage(promptText);
  };

  const handleActionCard = (action: string) => {
    console.log(`Action triggered: ${action}`);
    switch (action) {
      case 'grounding':
        // Could navigate to a grounding exercise
        break;
      case 'breathing':
        navigate('/breathing');
        break;
      case 'journal':
        navigate('/journaling');
        break;
      case 'emergency':
        // Could show emergency contacts
        break;
    }
  };

  const renderActionCard = (type: Message['actionCard']) => {
    if (!type) return null;

    const cards = {
      grounding: {
        title: "5-4-3-2-1 Grounding",
        description: "Name 5 things you see, 4 you can touch, 3 you hear, 2 you smell, 1 you taste",
        icon: <Heart className="h-5 w-5" />,
        color: "bg-green-500/20 text-green-300"
      },
      breathing: {
        title: "Breathing Reset",
        description: "Guided breathing exercise to calm your nervous system",
        icon: <Wind className="h-5 w-5" />,
        color: "bg-blue-500/20 text-blue-300"
      },
      journal: {
        title: "Write It Out",
        description: "Sometimes putting it on paper helps release the pressure",
        icon: <Edit3 className="h-5 w-5" />,
        color: "bg-purple-500/20 text-purple-300"
      },
      emergency: {
        title: "I Need Help Now",
        description: "Crisis support and emergency contacts",
        icon: <Phone className="h-5 w-5" />,
        color: "bg-red-500/20 text-red-300"
      }
    };

    const card = cards[type];

    return (
      <Card 
        className="mt-3 bg-secondary/40 border-0 p-4 cursor-pointer hover:bg-secondary/60 transition-colors"
        onClick={() => handleActionCard(type)}
      >
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-full ${card.color} flex items-center justify-center`}>
            {card.icon}
          </div>
          <div className="flex-1">
            <h4 className="text-white font-medium text-sm">{card.title}</h4>
            <p className="text-white/70 text-xs">{card.description}</p>
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-secondary/20">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/safe-space')}
          className="text-white/80 hover:text-white"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <h1 className="responsive-subtitle font-semibold text-white">Talk to Your AI Friend</h1>
          <p className="text-xs text-white/60">Your gentle companion</p>
        </div>
        <div className="w-10" />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] ${message.isUser ? 'order-2' : 'order-1'}`}>
              <div
                className={`rounded-2xl px-4 py-3 ${
                  message.isUser
                    ? 'bg-blue-500 text-white ml-4'
                    : 'bg-secondary/40 text-white mr-4'
                }`}
              >
                <p className="responsive-body leading-relaxed">{message.text}</p>
              </div>
              {!message.isUser && renderActionCard(message.actionCard)}
            </div>
          </div>
        ))}
        
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-secondary/40 text-white rounded-2xl px-4 py-3 mr-4">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-white/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Suggested Prompts */}
      {messages.length <= 1 && (
        <div className="px-4 pb-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestedPrompts.map((prompt, index) => (
              <Button
                key={index}
                variant="outline"
                size="sm"
                onClick={() => handlePromptClick(prompt.text)}
                className="bg-secondary/10 border-secondary/20 text-white/70 hover:bg-secondary/20 hover:text-white text-xs p-3 h-auto justify-start"
              >
                <div className="flex items-center space-x-2">
                  {prompt.icon}
                  <span className="text-left leading-tight">{prompt.text}</span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Text Input Bar with Mic - Above Navigation */}
      <div className="p-4 border-t border-secondary/20">
        <div className="relative">
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(inputText)}
            placeholder="Type your message..."
            className="w-full bg-secondary/20 border-0 rounded-2xl pl-12 pr-16 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex space-x-1">
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              size="icon"
              className={`h-8 w-8 rounded-full ${
                isRecording 
                  ? 'bg-red-500 hover:bg-red-600 animate-pulse' 
                  : 'bg-green-500/20 hover:bg-green-500/30 border border-green-500/50'
              }`}
            >
              {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4 text-green-400" />}
            </Button>
            
            <Button
              onClick={() => handleSendMessage(inputText)}
              disabled={!inputText.trim()}
              size="icon"
              className="h-8 w-8 rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 disabled:opacity-30"
            >
              <Send className="h-4 w-4 text-blue-400" />
            </Button>
          </div>
        </div>
      </div>

      <BottomNavigation />
    </div>
  );
};

export default SafeSpaceChat;
