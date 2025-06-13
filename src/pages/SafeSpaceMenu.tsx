
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Phone, MessageCircle, Heart, Wind, Users, Bot } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface SafeSpaceOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  priority?: boolean;
  route: string;
}

const safeSpaceOptions: SafeSpaceOption[] = [
  {
    id: 'safe-chat',
    title: 'Talk to Your AI Friend',
    icon: <Bot className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Gentle, supportive AI chat that feels like a caring friend',
    color: 'bg-blue-500/20 text-blue-300',
    priority: true,
    route: '/safe-space/chat'
  },
  {
    id: 'immediate-help',
    title: 'I Need Help Now',
    icon: <Phone className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Crisis hotlines and emergency contacts',
    color: 'bg-red-500/20 text-red-300',
    priority: true,
    route: '/safe-space/emergency'
  },
  {
    id: 'grounding-exercises',
    title: 'Grounding Exercises',
    icon: <Heart className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: '5-4-3-2-1 and other grounding techniques',
    color: 'bg-green-500/20 text-green-300',
    route: '/safe-space/grounding'
  },
  {
    id: 'breathing-sos',
    title: 'Emergency Breathing',
    icon: <Wind className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Quick breathing exercises for anxiety relief',
    color: 'bg-cyan-500/20 text-cyan-300',
    route: '/breathing'
  },
  {
    id: 'safe-contacts',
    title: 'Safe Contacts',
    icon: <Users className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Your trusted people and support network',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/safe-space/contacts'
  }
];

const SafeSpaceMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (route: string) => {
    console.log(`Navigating to ${route}`);
    
    if (route === '/safe-space/emergency') {
      // Trigger emergency call functionality
      handleEmergencyCall();
      return;
    }
    
    navigate(route);
  };

  const handleEmergencyCall = () => {
    // Emergency numbers by country - you can expand this
    const emergencyNumbers = {
      US: '911',
      UK: '999',
      EU: '112',
      // Add more countries as needed
    };
    
    // Detect user's country or default to US
    const emergencyNumber = emergencyNumbers.US; // Default to US
    
    // Try to make the call
    try {
      window.location.href = `tel:${emergencyNumber}`;
    } catch (error) {
      // Fallback: show emergency numbers
      alert(`Emergency Numbers:\nUS: 911\nUK: 999\nEU: 112\n\nIf you're in immediate danger, please call your local emergency services.`);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Safe Space" backPath="/wellness" />

      <main className="flex-1 responsive-container space-y-4">
        {/* Emergency Notice */}
        <div className="bg-red-500/20 border border-red-500/30 rounded-3xl p-4 mb-6">
          <p className="text-red-300 responsive-body text-center">
            <strong>Crisis Support:</strong> If you're in immediate danger, call emergency services or go to your nearest emergency room.
          </p>
        </div>

        {safeSpaceOptions.map((option, index) => (
          <div
            key={option.id}
            onClick={() => handleOptionClick(option.route)}
            className={`bg-secondary/40 rounded-3xl p-4 sm:p-6 hover:bg-secondary/60 transition-all duration-300 cursor-pointer card-hover animate-fade-in ${
              option.priority ? 'ring-2 ring-blue-500/50' : ''
            }`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex items-center space-x-3 sm:space-x-4">
              <div className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl ${option.color} flex items-center justify-center`}>
                {option.icon}
              </div>
              <div className="flex-1">
                <h3 className="responsive-subtitle font-semibold text-white mb-1">{option.title}</h3>
                <p className="text-white/70 responsive-body leading-relaxed">{option.description}</p>
              </div>
              <div className="text-white/40">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        ))}

        <div className="mt-6 sm:mt-8 bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-3xl p-4 sm:p-6">
          <div className="text-center">
            <p className="text-white/80 italic responsive-subtitle mb-2">
              "You are safe. You are not alone. This feeling will pass."
            </p>
            <p className="text-white/50 responsive-body">— Safe Space Reminder</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default SafeSpaceMenu;

