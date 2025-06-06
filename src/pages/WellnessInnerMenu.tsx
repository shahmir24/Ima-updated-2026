
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Heart, Wind, BookOpen, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface WellnessMenuItem {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  route: string;
}

const wellnessMenuItems: WellnessMenuItem[] = [
  {
    id: 'mindfulness',
    title: 'Mindfulness',
    icon: <Heart className="h-8 w-8" />,
    description: 'Guided meditation and awareness practices',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/wellness/mindfulness'
  },
  {
    id: 'breathing',
    title: 'Breathing',
    icon: <Wind className="h-8 w-8" />,
    description: 'Breathing exercises for relaxation',
    color: 'bg-cyan-500/20 text-cyan-300',
    route: '/wellness/breathing'
  },
  {
    id: 'journaling',
    title: 'Journaling',
    icon: <BookOpen className="h-8 w-8" />,
    description: 'Reflect and express your thoughts',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/wellness/journaling'
  },
  {
    id: 'safe-space',
    title: 'Safe Space',
    icon: <Shield className="h-8 w-8" />,
    description: 'Panic attack guidance and support',
    color: 'bg-green-500/20 text-green-300',
    route: '/wellness/safe-space'
  }
];

const WellnessInnerMenu = () => {
  const navigate = useNavigate();

  const handleMenuItemClick = (route: string) => {
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
          onClick={() => navigate('/wellness')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-2xl font-bold text-white">Wellness Tools</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Wellness Menu Items */}
      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">
        {wellnessMenuItems.map((item, index) => (
          <div
            key={item.id}
            onClick={() => handleMenuItemClick(item.route)}
            className="bg-secondary/40 rounded-3xl p-6 hover:bg-secondary/60 transition-all duration-300 cursor-pointer card-hover animate-fade-in"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="flex items-center space-x-4">
              <div className={`w-16 h-16 rounded-2xl ${item.color} flex items-center justify-center`}>
                {item.icon}
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-semibold text-white mb-1">{item.title}</h3>
                <p className="text-white/70 text-sm leading-relaxed">{item.description}</p>
              </div>
              <div className="text-white/40">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </div>
          </div>
        ))}

        {/* Inspirational Quote Section */}
        <div className="mt-8 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-3xl p-6">
          <div className="text-center">
            <p className="text-white/80 italic text-lg mb-2">
              "Take time to breathe. In the quiet moments, you find your strength."
            </p>
            <p className="text-white/50 text-sm">— Daily Wellness</p>
          </div>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default WellnessInnerMenu;
