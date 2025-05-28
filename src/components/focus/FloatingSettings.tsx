
import React from 'react';
import { Settings, Clock, Timer, BarChart, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingSettingsProps {
  isOpen: boolean;
  onToggle: () => void;
}

const FloatingSettings = ({ isOpen, onToggle }: FloatingSettingsProps) => {
  const settingsOptions = [
    { icon: Clock, label: 'Time boxing duration', value: '25 min' },
    { icon: Timer, label: 'Interval duration', value: '5 min' },
    { icon: BarChart, label: 'No. of Flows', value: '4' },
    { icon: Trophy, label: 'Challenges', value: 'Daily' },
  ];

  return (
    <div className="fixed bottom-8 right-4 z-50">
      {/* Settings Cards Stack */}
      {isOpen && (
        <div className="mb-4 space-y-3 animate-fade-in">
          {settingsOptions.map((option, index) => {
            const IconComponent = option.icon;
            return (
              <div
                key={index}
                className="bg-gradient-to-r from-blue-500/90 to-purple-600/90 backdrop-blur-lg rounded-full px-6 py-4 shadow-lg border border-white/20 min-w-[240px]"
              >
                <div className="flex items-center gap-4">
                  <IconComponent className="h-4 w-4 text-white flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-white text-sm font-medium">{option.label}</span>
                  </div>
                  <div className="text-white/80 text-sm">{option.value}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Settings Button */}
      <Button
        onClick={onToggle}
        className="w-14 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg border-0 transition-all duration-200 hover:scale-105"
      >
        <Settings className="h-5 w-5 text-white" />
      </Button>
    </div>
  );
};

export default FloatingSettings;
