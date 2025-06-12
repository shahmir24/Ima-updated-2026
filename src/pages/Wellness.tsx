
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
    icon: <Heart className="h-8 w-8" />,
    description: 'Meditation, body scans, and mindful practices',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/wellness/mindfulness'
  },
  {
    id: 'breathing',
    title: 'Breathing',
    icon: <CircleDot className="h-8 w-8" />,
    description: 'Guided breathing exercises for calm and focus',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/breathing'
  },
  {
    id: 'safe-space',
    title: 'Safe Space',
    icon: <Shield className="h-8 w-8" />,
    description: 'Crisis support, grounding, and emergency tools',
    color: 'bg-green-500/20 text-green-300',
    route: '/safe-space'
  },
  {
    id: 'journaling',
    title: 'Journaling',
    icon: <BookOpen className="h-8 w-8" />,
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

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">
        {wellnessOptions.map((option, index) => (
          <div
            key={option.id}
            onClick={() => handleOptionClick(option.route)}
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

        <div className="mt-8 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-3xl p-6">
          <div className="text-center">
            <p className="text-white/80 italic text-lg mb-2">
              "Your wellness journey is unique to you."
            </p>
            <p className="text-white/50 text-sm">— iMA Wellness</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Wellness;
