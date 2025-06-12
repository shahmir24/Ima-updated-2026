
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
  route: string;
}

const journalingOptions: JournalingOption[] = [
  {
    id: 'morning-intention',
    title: "Set the Tone",
    icon: <Sun className="h-8 w-8" />,
    description: 'Morning intention setting to anchor your day',
    color: 'bg-orange-500/20 text-orange-300',
    route: '/journaling/morning-intention'
  },
  {
    id: 'daily-journal',
    title: 'Where Am I, Really?',
    icon: <BookOpen className="h-8 w-8" />,
    description: 'Daily check-in with yourself',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/journaling/daily-journal'
  },
  {
    id: 'post-panic',
    title: 'Name It to Tame It',
    icon: <Heart className="h-8 w-8" />,
    description: 'Post-overwhelm reflection and grounding',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/journaling/post-panic'
  },
  {
    id: 'focus-reset',
    title: 'Zoom In',
    icon: <Target className="h-8 w-8" />,
    description: 'Clarify priorities when feeling scattered',
    color: 'bg-green-500/20 text-green-300',
    route: '/journaling/focus-reset'
  },
  {
    id: 'gratitude',
    title: 'Tiny Wins, Soft Joys',
    icon: <Sun className="h-8 w-8" />,
    description: 'Gratitude practice without pressure',
    color: 'bg-yellow-500/20 text-yellow-300',
    route: '/journaling/gratitude'
  },
  {
    id: 'sensory-checkin',
    title: 'Come Back to Your Body',
    icon: <Heart className="h-8 w-8" />,
    description: 'Sensory awareness and body connection',
    color: 'bg-pink-500/20 text-pink-300',
    route: '/journaling/sensory-checkin'
  }
];

const JournalingMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (route: string) => {
    console.log(`Navigating to ${route}`);
    navigate(route);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Journaling" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">
        {journalingOptions.map((option, index) => (
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
