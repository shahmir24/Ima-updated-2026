
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, Mic, Heart, Book, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface WellnessTool {
  id: string;
  name: string;
  icon: React.ReactNode;
  color: string;
}

const wellnessTools: WellnessTool[] = [
  {
    id: 'mindfulness',
    name: 'Mindfulness',
    icon: <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center">
      <Heart className="h-7 w-7 text-purple-400" />
    </div>,
    color: 'purple'
  },
  {
    id: 'journal',
    name: 'Journal',
    icon: <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
      <Book className="h-7 w-7 text-blue-400" />
    </div>,
    color: 'blue'
  },
  {
    id: 'breath-easy',
    name: 'Breath Easy',
    icon: <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 flex items-center justify-center">
      <div className="w-7 h-7 rounded-full border-2 border-cyan-400 flex items-center justify-center">
        <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
      </div>
    </div>,
    color: 'cyan'
  },
  {
    id: 'safe-space',
    name: 'Safe Space',
    icon: <div className="w-12 h-12 rounded-2xl bg-purple-500/20 flex items-center justify-center">
      <div className="w-7 h-7 flex items-center justify-center">
        <Heart className="h-6 w-6 text-purple-400" />
      </div>
    </div>,
    color: 'purple'
  },
  {
    id: 'friends',
    name: 'Friends',
    icon: <div className="w-12 h-12 rounded-2xl bg-blue-500/20 flex items-center justify-center">
      <Users className="h-7 w-7 text-blue-400" />
    </div>,
    color: 'blue'
  }
];

const Wellness = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTools = useMemo(() => {
    if (!searchTerm.trim()) return wellnessTools;
    
    return wellnessTools.filter(tool =>
      tool.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const handleToolClick = (toolId: string) => {
    if (toolId === 'mindfulness') {
      navigate('/wellness/mindfulness');
    } else if (toolId === 'journal') {
      navigate('/journaling');
    } else if (toolId === 'breath-easy') {
      navigate('/breathing');
    }
    // Add more navigation logic for other tools later
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
          onClick={() => navigate('/')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-2xl font-bold text-white">Wellness</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Search Bar */}
      <div className="w-full max-w-lg mx-auto px-4 mb-8">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-white/60" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search wellness tools"
            className="w-full bg-secondary/30 border-0 rounded-2xl pl-12 pr-12 py-4 text-white placeholder:text-white/60 focus:ring-2 focus:ring-white/20"
          />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 rounded-full hover:bg-white/10"
          >
            <Mic className="h-4 w-4 text-white/60" />
          </Button>
        </div>
      </div>

      {/* Wellness Tools Grid */}
      <main className="flex-1 max-w-lg w-full mx-auto px-4">
        <div className="grid grid-cols-2 gap-4 mb-8">
          {filteredTools.slice(0, 4).map((tool) => (
            <div
              key={tool.id}
              onClick={() => handleToolClick(tool.id)}
              className="bg-secondary/50 rounded-3xl p-6 aspect-square flex flex-col items-center justify-center space-y-4 hover:bg-secondary/70 transition-colors cursor-pointer"
            >
              {tool.icon}
              <span className="text-white font-medium text-center">{tool.name}</span>
            </div>
          ))}
        </div>

        {/* Additional Tool */}
        {filteredTools.length > 4 && (
          <div className="grid grid-cols-1 gap-4 mb-8">
            <div 
              onClick={() => handleToolClick(filteredTools[4].id)}
              className="bg-secondary/50 rounded-3xl p-6 flex items-center justify-center space-x-4 hover:bg-secondary/70 transition-colors cursor-pointer"
            >
              {filteredTools[4].icon}
              <span className="text-white font-medium">{filteredTools[4].name}</span>
            </div>
          </div>
        )}

        {/* Social Icons */}
        <div className="flex justify-center space-x-6 mt-8">
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-white/10">
            <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.179 0-5.515 2.966-4.797 6.045-4.091-.205-7.719-2.165-10.148-5.144-1.29 2.213-.669 5.108 1.523 6.574-.806-.026-1.566-.247-2.229-.616-.054 2.281 1.581 4.415 3.949 4.89-.693.188-1.452.232-2.224.084.626 1.956 2.444 3.379 4.6 3.419-2.07 1.623-4.678 2.348-7.29 2.04 2.179 1.397 4.768 2.212 7.548 2.212 9.142 0 14.307-7.721 13.995-14.646.962-.695 1.797-1.562 2.457-2.549z"/>
            </svg>
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-white/10">
            <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.174-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.083.347-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.402.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.357-.629-2.766-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24.009 12.017 24.009c6.624 0 11.99-5.367 11.99-11.988C24.007 5.367 18.641.001 12.017.001z"/>
            </svg>
          </Button>
          <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full hover:bg-white/10">
            <svg className="h-5 w-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </Button>
        </div>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default Wellness;
