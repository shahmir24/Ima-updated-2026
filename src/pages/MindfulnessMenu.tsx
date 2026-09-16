import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Scan, Footprints } from 'lucide-react';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import PageHeader from '@/components/layout/PageHeader';
import PageWorkspace from '@/components/layout/PageWorkspace';

interface MindfulnessOption {
  id: string;
  title: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  route: string;
}

const mindfulnessOptions: MindfulnessOption[] = [
  {
    id: 'meditation',
    title: 'Meditation',
    icon: <Heart className="h-8 w-8" />,
    description: 'Guided meditation sessions for focus and calm',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/meditation'
  },
  {
    id: 'body-scans',
    title: 'Body Scans',
    icon: <Scan className="h-8 w-8" />,
    description: 'Progressive relaxation and body awareness',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/mindfulness/body-scan'
  },
  {
    id: 'mindful-walking',
    title: 'Mindful Walking',
    icon: <Footprints className="h-8 w-8" />,
    description: 'Walking meditation and movement practices',
    color: 'bg-green-500/20 text-green-300',
    route: '/mindfulness/walking'
  }
];

const WORKSPACE = 'max-w-4xl';

const MindfulnessMenu = () => {
  const navigate = useNavigate();

  const handleOptionClick = (route: string) => {
    console.log(`Navigating to ${route}`);
    navigate(route);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
      <PageHeader title="Mindfulness" backPath="/wellness" width={WORKSPACE} />

      <main className="flex-1">
        <PageWorkspace width={WORKSPACE} className="space-y-4">
          {/* Three destinations: stacked on a phone, paired once there is room. */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {mindfulnessOptions.map((option, index) => (
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
          </div>

          <div className="mt-8 lg:mx-auto lg:max-w-3xl bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-3xl p-6">
            <div className="text-center">
              <p className="text-white/80 italic text-lg mb-2">
                "In the quiet moments, you find your inner strength."
              </p>
              <p className="text-white/50 text-sm">— Mindfulness Practice</p>
            </div>
          </div>
        </PageWorkspace>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default MindfulnessMenu;
