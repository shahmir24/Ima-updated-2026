
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Phone, MessageCircle, Heart, Wind, Users } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface SafeSpaceOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  priority?: boolean;
}

const safeSpaceOptions: SafeSpaceOption[] = [
  {
    id: 'immediate-help',
    title: 'I Need Help Now',
    icon: <Phone className="h-8 w-8" />,
    description: 'Crisis hotlines and emergency contacts',
    color: 'bg-red-500/20 text-red-300',
    priority: true
  },
  {
    id: 'panic-guide',
    title: 'Panic Attack Guide',
    icon: <Shield className="h-8 w-8" />,
    description: 'Step-by-step guidance for panic attacks',
    color: 'bg-blue-500/20 text-blue-300'
  },
  {
    id: 'grounding-exercises',
    title: 'Grounding Exercises',
    icon: <Heart className="h-8 w-8" />,
    description: '5-4-3-2-1 and other grounding techniques',
    color: 'bg-green-500/20 text-green-300'
  },
  {
    id: 'breathing-sos',
    title: 'Emergency Breathing',
    icon: <Wind className="h-8 w-8" />,
    description: 'Quick breathing exercises for anxiety relief',
    color: 'bg-cyan-500/20 text-cyan-300'
  },
  {
    id: 'safe-contacts',
    title: 'Safe Contacts',
    icon: <Users className="h-8 w-8" />,
    description: 'Your trusted people and support network',
    color: 'bg-purple-500/20 text-purple-300'
  },
  {
    id: 'self-talk',
    title: 'Calming Self-Talk',
    icon: <MessageCircle className="h-8 w-8" />,
    description: 'Positive affirmations and calming phrases',
    color: 'bg-yellow-500/20 text-yellow-300'
  }
];

const SafeSpaceMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (optionId: string) => {
    console.log(`Navigating to safe-space/${optionId}`);
    // Future navigation: navigate(`/safe-space/${optionId}`);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Safe Space" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">
        {/* Emergency Notice */}
        <div className="bg-red-500/20 border border-red-500/30 rounded-3xl p-4 mb-6">
          <p className="text-red-300 text-sm text-center">
            <strong>Crisis Support:</strong> If you're in immediate danger, call emergency services or go to your nearest emergency room.
          </p>
        </div>

        {safeSpaceOptions.map((option, index) => (
          <div
            key={option.id}
            onClick={() => handleOptionClick(option.id)}
            className={`bg-secondary/40 rounded-3xl p-6 hover:bg-secondary/60 transition-all duration-300 cursor-pointer card-hover animate-fade-in ${
              option.priority ? 'ring-2 ring-red-500/50' : ''
            }`}
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

        <div className="mt-8 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-3xl p-6">
          <div className="text-center">
            <p className="text-white/80 italic text-lg mb-2">
              "You are safe. You are not alone. This feeling will pass."
            </p>
            <p className="text-white/50 text-sm">— Safe Space Reminder</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default SafeSpaceMenu;
