
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Brain, BookOpen, Heart, Target, Sparkles, Sun } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface JournalingOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const journalingOptions: JournalingOption[] = [
  {
    id: 'brain-dump',
    title: "What's on my mind?",
    icon: <Brain className="h-8 w-8" />,
    description: 'Quick brain dump to clear your thoughts',
    color: 'bg-purple-500/20 text-purple-300'
  },
  {
    id: 'daily-journal',
    title: 'Daily Journal',
    icon: <BookOpen className="h-8 w-8" />,
    description: 'Reflect on your day and experiences',
    color: 'bg-blue-500/20 text-blue-300'
  },
  {
    id: 'emotion-tracker',
    title: 'Emotion Tracker',
    icon: <Heart className="h-8 w-8" />,
    description: 'Track and understand your feelings',
    color: 'bg-pink-500/20 text-pink-300'
  },
  {
    id: 'goals-blocks',
    title: 'Goals & Blocks',
    icon: <Target className="h-8 w-8" />,
    description: 'Set goals and identify obstacles',
    color: 'bg-green-500/20 text-green-300'
  },
  {
    id: 'needs-today',
    title: 'What do I need today?',
    icon: <Sparkles className="h-8 w-8" />,
    description: 'Identify your daily needs and priorities',
    color: 'bg-yellow-500/20 text-yellow-300'
  },
  {
    id: 'gratitude',
    title: 'Gratitude Check-In',
    icon: <Sun className="h-8 w-8" />,
    description: 'Practice gratitude and positive reflection',
    color: 'bg-orange-500/20 text-orange-300'
  }
];

const JournalingMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (optionId: string) => {
    console.log(`Navigating to journaling/${optionId}`);
    // Future navigation: navigate(`/journaling/${optionId}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Journaling" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">
        {journalingOptions.map((option, index) => (
          <div
            key={option.id}
            onClick={() => handleOptionClick(option.id)}
            className="bg-secondary/40 rounded-3xl p-6 hover:bg-secondary/60 transition-all duration-300 cursor-pointer card-hover animate-fade-in"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex items-center space-x-4">
              <div className={`w-16 h-16 rounded-2xl ${option.color} flex items-center justify-center`}>
                {option.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-1">{option.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{option.description}</p>
              </div>
              <div className="text-white/40">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        ))}

        <div className="mt-8 bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl p-6">
          <div className="text-center">
            <p className="text-white/80 italic text-lg mb-2">
              "Writing is thinking on paper."
            </p>
            <p className="text-white/50 text-sm">— Journaling Practice</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default JournalingMenu;
