
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Footprints, RefreshCw } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface WalkingOption {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  route: string;
}

const walkingOptions: WalkingOption[] = [
  {
    id: 'breath-sync',
    title: 'Breath and Sync',
    subtitle: 'Feeling scattered?',
    description: 'Sync your steps with your breath to regulate your nervous system',
    icon: <Footprints className="h-8 w-8" />,
    color: 'bg-green-500/20 text-green-300',
    route: '/mindfulness/walking/breath-sync'
  },
  {
    id: 'break-loop',
    title: 'Break the Loop',
    subtitle: 'Feeling stuck?',
    description: 'ADHD-friendly movement to break mental loops and restart fresh',
    icon: <RefreshCw className="h-8 w-8" />,
    color: 'bg-blue-500/20 text-blue-300',
    route: '/mindfulness/walking/break-loop'
  }
];

const MindfulWalkingMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (route: string) => {
    console.log(`Navigating to ${route}`);
    navigate(route);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Mindful Walking" backPath="/wellness/mindfulness" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        {walkingOptions.map((option, index) => (
          <div
            key={option.id}
            onClick={() => handleOptionClick(option.route)}
            className="bg-secondary/40 rounded-3xl p-6 hover:bg-secondary/60 transition-all duration-300 cursor-pointer card-hover animate-fade-in"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex items-start space-x-4">
              <div className={`w-16 h-16 rounded-2xl ${option.color} flex items-center justify-center flex-shrink-0`}>
                {option.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-1">{option.title}</h3>
                <p className="text-green-300 text-sm font-medium mb-2">{option.subtitle}</p>
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

        <div className="mt-8 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-3xl p-6">
          <div className="text-center">
            <p className="text-white/80 italic text-lg mb-2">
              "With every step, you return to yourself."
            </p>
            <p className="text-white/50 text-sm">— Mindful Walking</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default MindfulWalkingMenu;
