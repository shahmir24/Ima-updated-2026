
import React from 'react';
import { Settings, Clock, Timer, BarChart } from 'lucide-react';
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

/**
 * Option lists, matching App Settings exactly so the same setting does not
 * offer different choices in two places. This panel previously offered
 * 25|50 minute blocks and 5|15 minute buffers while App Settings — which is
 * what actually persists — offered 25|45|90 and 5|10.
 *
 * App Settings is the source of truth. All values sit inside the column
 * CHECKs (focus_block_minutes 1-240, buffer_minutes 0-60, default_flows
 * 1-12), so nothing here can produce a value the database would reject.
 */
const BLOCK_OPTIONS = [25, 45, 90];
const BUFFER_OPTIONS = [5, 10];
/** default_flows persists but has no App Settings control, so this list stands alone. */
const FLOW_OPTIONS = [1, 2, 3, 4];

/**
 * Keeps the current value selectable even when it is not one of the offered
 * options — a saved value only reachable by editing the row directly would
 * otherwise render the Select blank.
 */
const withCurrent = (options: number[], current: number) =>
  options.includes(current) ? options : [...options, current].sort((a, b) => a - b);

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
      options: withCurrent(BLOCK_OPTIONS, timeBoxDuration)
    },
    { 
      icon: Timer, 
      label: 'Interval duration', 
      value: `${intervalDuration} min`,
      setting: 'interval',
      options: withCurrent(BUFFER_OPTIONS, intervalDuration)
    },
    { 
      icon: BarChart, 
      label: 'No. of Flows', 
      value: numberOfFlows.toString(),
      setting: 'flows',
      options: withCurrent(FLOW_OPTIONS, numberOfFlows)
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
