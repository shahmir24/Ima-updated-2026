import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Timer, Volume2, BarChart3, CheckSquare, Sparkles, Heart } from 'lucide-react';

interface ToolCard {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  route: string;
}

export const toolCards: ToolCard[] = [
  {
    id: 'focus',
    name: 'Focus Timer',
    icon: <Timer className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Stay on task with a customizable timer',
    color: 'bg-red-500/20 text-red-300',
    route: '/focus'
  },
  {
    id: 'body-double',
    name: 'BodyDouble',
    icon: <Heart className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'AI companion for focus & accountability',
    color: 'bg-purple-500/20 text-purple-300',
    route: '/body-double'
  },
  {
    id: 'soundscape',
    name: 'Soundscape',
    icon: <Volume2 className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Immersive ambient sounds for focus',
    color: 'bg-green-500/20 text-green-300',
    route: '/soundscape'
  },
  {
    id: 'stats',
    name: 'Stats',
    icon: <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Track your productivity and progress',
    color: 'bg-blue-500/20 text-blue-300',
    route: '/stats'
  },
  {
    id: 'tasks',
    name: 'Tasks',
    icon: <CheckSquare className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Manage your to-do list and stay organized',
    color: 'bg-orange-500/20 text-orange-300',
    route: '/tasks'
  },
  {
    id: 'wellness',
    name: 'Wellness',
    icon: <Sparkles className="h-6 w-6 sm:h-8 sm:w-8" />,
    description: 'Mindfulness, breathing, and safe space',
    color: 'bg-pink-500/20 text-pink-300',
    route: '/wellness'
  }
];

interface ToolCardsGridProps {
  filteredTools: ToolCard[];
}

export const ToolCardsGrid: React.FC<ToolCardsGridProps> = ({ filteredTools }) => {
  const navigate = useNavigate();

  const handleToolClick = (route: string) => {
    navigate(route);
  };

  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {filteredTools.map((tool, index) => (
        <div
          key={tool.id}
          onClick={() => handleToolClick(tool.route)}
          className="bg-[#1F1F1F] rounded-3xl p-4 sm:p-6 aspect-square flex flex-col justify-start hover:scale-105 transition-transform duration-200 cursor-pointer"
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="flex items-center gap-2 sm:gap-3 mb-2">
            <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-2xl ${tool.color} flex items-center justify-center`}>
              {tool.icon}
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-white responsive-subtitle font-medium leading-tight mb-2">
              {tool.name}
            </h3>
            <p className="text-white/70 responsive-body leading-relaxed">{tool.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
};
