
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Wind, Timer, Zap, Moon, Heart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface BreathingOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  flow: string;
  color: string;
  route: string;
}

const breathingOptions: BreathingOption[] = [
  {
    id: 'steady-square',
    title: 'Steady Square',
    icon: <Wind className="h-8 w-8" />,
    description: 'For focus, calm control',
    flow: 'Inhale 4 → Hold 4 → Exhale 4 → Hold 4',
    color: 'bg-cyan-500/20 text-cyan-300',
    route: '/breathing/steady-square'
  },
  {
    id: 'triangle-calm',
    title: 'Triangle Calm',
    icon: <Timer className="h-8 w-8" />,
    description: 'For transitioning, softening, letting go',
    flow: 'Inhale 4 → Hold 4 → Exhale 6',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/breathing/triangle-calm'
  },
  {
    id: 'deep-reset',
    title: 'Deep Reset',
    icon: <Zap className="h-8 w-8" />,
    description: 'For ADHD loops, emotional regulation',
    flow: 'Inhale 4 → Hold 4 → Exhale 8 → Hold 4',
    color: 'bg-yellow-500/20 text-yellow-300',
    route: '/breathing/deep-reset'
  },
  {
    id: 'sleep-switch',
    title: 'Sleep Switch',
    icon: <Moon className="h-8 w-8" />,
    description: 'For wind-down, bedtime, post-trigger calm',
    flow: 'Inhale 4 → Hold 7 → Exhale 8',
    color: 'bg-indigo-500/20 text-indigo-300',
    route: '/breathing/sleep-switch'
  },
  {
    id: 'ride-wave',
    title: 'Ride the Wave',
    icon: <Heart className="h-8 w-8" />,
    description: 'For gentle calm, no structure, just presence',
    flow: 'Inhale slow → Exhale longer',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/breathing/ride-the-wave'
  }
];

const BreathingMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (route: string) => {
    navigate(route);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Pick Your Rhythm" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        <Card className="bg-secondary/40 border-0">
          <CardContent className="pt-6">
            <div className="text-white/80 space-y-3 text-center mb-6">
              <p>"You don't need to feel better all at once. You just need a rhythm your body can follow. Let's start there."</p>
              <p className="text-sm">Take a moment. Pick the kind of breath your body's asking for right now:</p>
            </div>
          </CardContent>
        </Card>

        {breathingOptions.map((option, index) => (
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
                <p className="text-white/70 text-sm mb-2">{option.description}</p>
                <p className="text-white/60 text-xs font-mono bg-black/20 px-2 py-1 rounded">
                  {option.flow}
                </p>
                {option.id === 'steady-square' && (
                  <p className="text-white/50 text-xs mt-1 italic">Trace the edges. One breath per side. Let your mind find structure.</p>
                )}
                {option.id === 'triangle-calm' && (
                  <p className="text-white/50 text-xs mt-1 italic">Breathe down the triangle. Loosen your grip on what's next.</p>
                )}
                {option.id === 'deep-reset' && (
                  <p className="text-white/50 text-xs mt-1 italic">Longer out-breaths to signal safety. You're steadying, not rushing.</p>
                )}
                {option.id === 'sleep-switch' && (
                  <p className="text-white/50 text-xs mt-1 italic">The lights are dimming. Breathe like you're already resting.</p>
                )}
                {option.id === 'ride-wave' && (
                  <p className="text-white/50 text-xs mt-1 italic">No counts, no pressure. Just let the wave move through you.</p>
                )}
              </div>
            </div>
          </div>
        ))}

        <div className="mt-8 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 rounded-3xl p-6">
          <div className="text-center">
            <p className="text-white/80 text-lg mb-2">
              ✨ Tap to begin. No pressure. Just one breath at a time. That's enough.
            </p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default BreathingMenu;
