
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wind, Timer, Zap, Moon } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface BreathingOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
}

const breathingOptions: BreathingOption[] = [
  {
    id: 'box-breathing',
    title: 'Box Breathing',
    icon: <Wind className="h-8 w-8" />,
    description: '4-4-4-4 breathing for focus and calm',
    color: 'bg-cyan-500/20 text-cyan-300'
  },
  {
    id: 'timed-breathing',
    title: 'Timed Sessions',
    icon: <Timer className="h-8 w-8" />,
    description: 'Structured breathing with guided timers',
    color: 'bg-blue-500/20 text-blue-300'
  },
  {
    id: 'quick-calm',
    title: 'Quick Calm',
    icon: <Zap className="h-8 w-8" />,
    description: 'Fast anxiety relief in 30 seconds',
    color: 'bg-yellow-500/20 text-yellow-300'
  },
  {
    id: 'sleep-breathing',
    title: 'Sleep Breathing',
    icon: <Moon className="h-8 w-8" />,
    description: 'Relaxing breaths for better sleep',
    color: 'bg-indigo-500/20 text-indigo-300'
  }
];

const BreathingMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (optionId: string) => {
    console.log(`Navigating to breathing/${optionId}`);
    // Future navigation: navigate(`/breathing/${optionId}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Breathing" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">
        {breathingOptions.map((option, index) => (
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

        <div className="mt-8 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-3xl p-6">
          <div className="text-center">
            <p className="text-white/80 italic text-lg mb-2">
              "Breathe in peace, breathe out stress."
            </p>
            <p className="text-white/50 text-sm">— Breathing Practice</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default BreathingMenu;
