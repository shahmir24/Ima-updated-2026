
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Phone, MessageCircle, Heart, Wind, Users } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import EmergencyHelpDialog from '@/components/safe-space/EmergencyHelpDialog';
import { SAFE_SPACE_HEADER_ALIGN } from '@/components/safe-space/layout';

interface SafeSpaceOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  priority?: boolean;
  /** Where the card goes. Omitted for cards that open something in place. */
  route?: string;
  /** Set instead of `route` when the card opens a dialog rather than navigating. */
  action?: 'emergency-help';
}

// The "Talk to Your AI Friend" card is gone for the MVP. Its chat was not AI:
// it answered from a fixed list of keyword-matched and random lines, including
// to messages about self-harm. AI chat is deferred to post-MVP; the page
// (SafeSpaceChat.tsx) is kept but /safe-space/chat now redirects here.
const safeSpaceOptions: SafeSpaceOption[] = [
  {
    id: 'immediate-help',
    title: 'I Need Help Now',
    icon: <Phone className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Emergency services and safe contacts',
    color: 'bg-red-500/20 text-red-300',
    priority: true,
    // No route: this opens the emergency help dialog in place. It previously
    // pointed at /safe-space/emergency, which was never a registered route.
    action: 'emergency-help'
  },
  {
    id: 'safe-contacts',
    title: 'Safe Contacts',
    icon: <Users className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Your trusted people and support network',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/safe-space/contacts'
  },
  {
    id: 'grounding-exercises',
    title: 'Grounding Techniques',
    icon: <Heart className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: '5-4-3-2-1 and other grounding techniques',
    color: 'bg-green-500/20 text-green-300',
    route: '/meditation/anchor?from=safe-space'
  },
  {
    id: 'breathing-sos',
    title: 'Emergency Breathing',
    icon: <Wind className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Quick breathing exercises for anxiety relief',
    color: 'bg-cyan-500/20 text-cyan-300',
    route: '/breathing'
  }
];

const SafeSpaceMenu = () => {
  const navigate = useNavigate();
  const [emergencyHelpOpen, setEmergencyHelpOpen] = useState(false);

  // "I Need Help Now" opens the emergency help dialog. It used to call
  // window.location.href = 'tel:911' directly from this tap: one touch on a
  // card dialled US emergency services, with no confirmation, no choice of
  // region, and the number never shown. The try/catch around it could not
  // fire either — assigning location.href does not throw — so the fallback
  // that listed all three numbers was unreachable, and on desktop the card
  // appeared to do nothing at all.
  const handleOptionClick = (option: SafeSpaceOption) => {
    if (option.action === 'emergency-help') {
      setEmergencyHelpOpen(true);
      return;
    }
    if (option.route) navigate(option.route);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-8">
      <div className={SAFE_SPACE_HEADER_ALIGN}>
        <WellnessHeader title="Safe Space" backPath="/wellness" />
      </div>

      <main className="flex-1 responsive-container space-y-4">
        {/* Emergency Notice */}
        <div className="bg-red-500/20 border border-red-500/30 rounded-3xl p-4 mb-6">
          <p className="text-red-300 responsive-body text-center">
            <strong>Crisis Support:</strong> If you're in immediate danger, call emergency services or go to your nearest emergency room.
          </p>
        </div>

        {safeSpaceOptions.map((option, index) => (
          // A real button, so every card — "I Need Help Now" above all — can
          // be reached with Tab and opened with Enter or Space. The classes
          // are the old card's, plus w-full/text-left to undo button defaults
          // and a focus ring that sits outside the card's own ring.
          <button
            key={option.id}
            type="button"
            onClick={() => handleOptionClick(option)}
            aria-haspopup={option.action === 'emergency-help' ? 'dialog' : undefined}
            className={`block w-full text-left bg-secondary/40 rounded-3xl p-4 sm:p-6 hover:bg-secondary/60 transition-all duration-300 cursor-pointer card-hover animate-fade-in focus-visible:outline-none focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              option.priority ? 'ring-2 ring-blue-500/50' : ''
            } ${option.action === 'emergency-help' ? 'focus-visible:ring-2 focus-visible:ring-red-300' : 'focus-visible:ring-2 focus-visible:ring-blue-300'}`}
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <span className="flex items-center space-x-3 sm:space-x-4">
              <span
                aria-hidden="true"
                className={`w-12 h-12 sm:w-16 sm:h-16 rounded-2xl ${option.color} flex items-center justify-center`}
              >
                {option.icon}
              </span>
              <span className="flex-1">
                <span className="block responsive-subtitle font-semibold text-white mb-1">{option.title}</span>
                <span className="block text-white/70 responsive-body leading-relaxed">{option.description}</span>
              </span>
              <span className="text-white/40" aria-hidden="true">
                <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </span>
          </button>
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

      <EmergencyHelpDialog open={emergencyHelpOpen} onOpenChange={setEmergencyHelpOpen} />

      <BottomNavigation />
    </div>
  );
};

export default SafeSpaceMenu;
