
import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Headphones, BarChart3, Check } from 'lucide-react';

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

interface ToolCardsGridProps {
  filteredTools: typeof toolCards;
}

const ToolCardsGrid = ({ filteredTools }: ToolCardsGridProps) => {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {filteredTools.map((tool, index) => {
        const IconComponent = tool.icon;
        return (
          <Link 
            key={index}
            to={tool.route}
            className="block"
          >
            <div className="bg-[#1F1F1F] rounded-3xl p-6 aspect-square flex flex-col justify-start hover:scale-105 transition-transform duration-200">
              <div className="flex items-center gap-3">
                <IconComponent 
                  className="h-6 w-6 flex-shrink-0" 
                  style={{ color: tool.iconColor }}
                />
                <h3 className="text-white text-base font-medium leading-tight">
                  {tool.name}
                </h3>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
};

export { ToolCardsGrid, toolCards };
