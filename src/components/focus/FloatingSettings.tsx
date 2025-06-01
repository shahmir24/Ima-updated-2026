
import React from 'react';
import { Settings, Clock, Timer, BarChart, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface FloatingSettingsProps {
  isOpen: boolean;
  onToggle: () => void;
  timeBoxDuration: number;
  intervalDuration: number;
  numberOfFlows: number;
  onSettingChange: (setting: string, value: number) => void;
}

const FloatingSettings = ({ 
  isOpen, 
  onToggle, 
  timeBoxDuration, 
  intervalDuration, 
  numberOfFlows, 
  onSettingChange 
}: FloatingSettingsProps) => {
  const settingsOptions = [
    { 
      icon: Clock, 
      label: 'Time boxing duration', 
      value: `${timeBoxDuration} min`,
      setting: 'timeBox',
      options: [25, 50]
    },
    { 
      icon: Timer, 
      label: 'Interval duration', 
      value: `${intervalDuration} min`,
      setting: 'interval',
      options: [5, 15]
    },
    { 
      icon: BarChart, 
      label: 'No. of Flows', 
      value: numberOfFlows.toString(),
      setting: 'flows',
      options: [1, 2, 3, 4]
    },
    { 
      icon: Trophy, 
      label: 'Challenges', 
      value: 'Daily',
      setting: 'challenges',
      options: ['Daily', 'Weekly']
    },
  ];

  return (
    <div className="fixed bottom-24 right-4 z-50">
      {/* Settings Cards Stack */}
      {isOpen && (
        <div className="mb-2 space-y-2 animate-fade-in">
          {settingsOptions.map((option, index) => {
            const IconComponent = option.icon;
            return (
              <div
                key={index}
                className="bg-white/10 backdrop-blur-xl rounded-2xl px-4 py-3 shadow-lg border border-white/20 min-w-[260px]"
              >
                <div className="flex items-center gap-3">
                  <IconComponent className="h-4 w-4 text-white flex-shrink-0" />
                  <div className="flex-1">
                    <span className="text-white text-sm font-medium">{option.label}</span>
                  </div>
                  <div className="text-white/80 text-sm min-w-[70px]">
                    {option.setting === 'challenges' ? (
                      <Select 
                        value={option.value} 
                        onValueChange={(value) => console.log('Challenge setting:', value)}
                      >
                        <SelectTrigger className="h-7 bg-white/10 border-white/20 text-white text-xs rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(option.options as string[]).map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select 
                        value={option.setting === 'timeBox' ? timeBoxDuration.toString() : 
                               option.setting === 'interval' ? intervalDuration.toString() : 
                               numberOfFlows.toString()} 
                        onValueChange={(value) => onSettingChange(option.setting, parseInt(value))}
                      >
                        <SelectTrigger className="h-7 bg-white/10 border-white/20 text-white text-xs rounded-lg">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(option.options as number[]).map((opt) => (
                            <SelectItem key={opt} value={opt.toString()}>
                              {opt}{option.setting !== 'flows' ? ' min' : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Settings Button */}
      <Button
        onClick={onToggle}
        className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 shadow-lg border border-white/20 backdrop-blur-xl transition-all duration-200 hover:scale-105"
      >
        <Settings className="h-5 w-5 text-white" />
      </Button>
    </div>
  );
};

export default FloatingSettings;
