
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Brain, CircleDot, BookOpen, Shield, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface WellnessOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  route: string;
}

const wellnessOptions: WellnessOption[] = [
  {
    id: 'mindfulness',
    title: 'Mindfulness',
    icon: <Heart className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Meditation, body scans, and mindful practices',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/wellness/mindfulness'
  },
  {
    id: 'breathing',
    title: 'Breathing',
    icon: <CircleDot className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Guided breathing exercises for calm and focus',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/breathing'
  },
  {
    id: 'safe-space',
    title: 'Safe Space',
    icon: <Shield className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Crisis support, grounding, and emergency tools',
    color: 'bg-green-500/20 text-green-300',
    route: '/safe-space'
  },
  {
    id: 'journaling',
    title: 'Journaling',
    icon: <BookOpen className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Daily reflection, gratitude, and self-discovery',
    color: 'bg-yellow-500/20 text-yellow-300',
    route: '/journaling'
  }
];

const Wellness = () => {
  const navigate = useNavigate();

  const handleOptionClick = (route: string) => {
    console.log(`Navigating to ${route}`);
    navigate(route);
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
          onClick={() => navigate('/')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-2xl font-bold text-white">Wellness</h1>
        
        <div className="w-10"></div>
      </header>

      <main className="flex-1 responsive-container">
        <div className="responsive-grid mb-6">
          {wellnessOptions.map((option, index) => (
            <div
              key={option.id}
              onClick={() => handleOptionClick(option.route)}
              className="bg-[#1F1F1F] rounded-3xl p-4 sm:p-6 aspect-square flex flex-col justify-start hover:scale-105 transition-transform duration-200 cursor-pointer"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl ${option.color} flex items-center justify-center`}>
                  {option.icon}
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-white responsive-subtitle font-medium leading-tight mb-2">
                  {option.title}
                </h3>
                <p className="text-white/70 responsive-body leading-relaxed">{option.description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 sm:mt-8 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-3xl p-4 sm:p-6">
          <div className="text-center">
            <p className="text-white/80 italic responsive-subtitle mb-2">
              "Your wellness journey is unique to you."
            </p>
            <p className="text-white/50 responsive-body">— iMA Wellness</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Wellness;
