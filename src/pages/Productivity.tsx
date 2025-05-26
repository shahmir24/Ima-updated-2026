
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  Search, 
  Mic, 
  Clock, 
  Headphones, 
  BarChart3, 
  Check, 
  Gamepad2,
  Calendar,
  Heart,
  User,
  Grid3X3,
  Target
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const Productivity = () => {
  const navigate = useNavigate();
  const [fidgetColor, setFidgetColor] = useState('#2F74DB');
  
  const fidgetColors = ['#2F74DB', '#7359B8', '#1D8690'];
  
  const handleFidgetClick = () => {
    const currentIndex = fidgetColors.indexOf(fidgetColor);
    const nextIndex = (currentIndex + 1) % fidgetColors.length;
    setFidgetColor(fidgetColors[nextIndex]);
  };

  const toolCards = [
    { 
      name: 'Focus', 
      icon: Clock, 
      iconColor: '#2F74DB',
      route: '/focus'
    },
    { 
      name: 'Soundscape', 
      icon: Headphones, 
      iconColor: '#1D8690',
      route: '/soundscape'
    },
    { 
      name: 'Stats', 
      icon: BarChart3, 
      iconColor: '#7359B8',
      route: '/stats'
    },
    { 
      name: 'Tasks', 
      icon: Check, 
      iconColor: '#2F74DB',
      route: '/tasks'
    }
  ];

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
          onClick={() => navigate('/')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-2xl font-bold text-white">Productivity</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Search Bar */}
      <div className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="relative">
          <div className="absolute left-4 top-1/2 transform -translate-y-1/2">
            <Search className="h-5 w-5 text-muted-foreground" />
          </div>
          <input
            type="text"
            placeholder="Search productivity tools"
            className="w-full bg-secondary border-0 rounded-2xl pl-12 pr-12 py-4 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="absolute right-4 top-1/2 transform -translate-y-1/2">
            <Mic className="h-5 w-5 text-muted-foreground" />
          </div>
        </div>
      </div>

      {/* Tool Cards Grid */}
      <main className="flex-1 max-w-lg w-full mx-auto px-4">
        <div className="grid grid-cols-2 gap-4 mb-6">
          {toolCards.map((tool, index) => {
            const IconComponent = tool.icon;
            return (
              <Link 
                key={index}
                to={tool.route}
                className="block"
              >
                <div className="bg-[#1F1F1F] rounded-3xl p-6 aspect-square flex flex-col justify-start hover:scale-105 transition-transform duration-200">
                  <div className="flex items-center gap-4">
                    <IconComponent 
                      className="h-8 w-8 flex-shrink-0" 
                      style={{ color: tool.iconColor }}
                    />
                    <h3 className="text-white text-lg font-semibold">
                      {tool.name}
                    </h3>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Fidget Card */}
        <div className="mb-6">
          <button 
            onClick={handleFidgetClick}
            className="w-full rounded-3xl p-6 transition-all duration-300 hover:scale-105"
            style={{ backgroundColor: fidgetColor }}
          >
            <div className="flex items-center gap-4">
              <Gamepad2 className="h-8 w-8 text-white flex-shrink-0" />
              <h3 className="text-white text-xl font-bold">FIDGET</h3>
            </div>
          </button>
        </div>

        {/* Goals Card */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-[#1F1F1F] rounded-3xl p-6 aspect-square flex flex-col justify-start hover:scale-105 transition-transform duration-200">
            <div className="flex items-center gap-4">
              <Target 
                className="h-8 w-8 flex-shrink-0" 
                style={{ color: '#7359B8' }}
              />
              <h3 className="text-white text-lg font-semibold">
                Goals
              </h3>
            </div>
          </div>
          <div className="bg-secondary/50 rounded-3xl p-6 aspect-square border-2 border-dashed border-muted"></div>
        </div>
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border">
        <div className="max-w-lg mx-auto flex justify-around items-center py-3 px-4">
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <Clock className="h-6 w-6 text-muted-foreground" />
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <div className="w-6 h-6 rounded-full border-2 border-muted-foreground"></div>
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
            <Grid3X3 className="h-6 w-6 text-white" />
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center">
              <Heart className="h-4 w-4 text-white" />
            </div>
          </Button>
          <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
            <Calendar className="h-6 w-6 text-muted-foreground" />
          </Button>
        </div>
      </nav>
    </div>
  );
};

export default Productivity;
