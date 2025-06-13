
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Brain, CircleDot, BookOpen, Shield } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
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
      <WellnessHeader title="Wellness" />

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

