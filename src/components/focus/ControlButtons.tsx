
import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ControlButtonsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
}

const ControlButtons = ({ isPlaying, onPlayPause, onReset }: ControlButtonsProps) => {
  return (
    <div className="flex gap-4 mb-8">
      {/* Play/Pause Button */}
      <Button
        onClick={onPlayPause}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 shadow-lg border-0 transition-all duration-200 hover:scale-105"
      >
        {isPlaying ? (
          <Pause className="h-5 w-5 text-white" />
        ) : (
          <Play className="h-5 w-5 text-white ml-1" />
        )}
      </Button>

      {/* Reset Button */}
      <Button
        onClick={onReset}
        className="w-16 h-16 rounded-2xl bg-gradient-to-br from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 shadow-lg border-0 transition-all duration-200 hover:scale-105"
      >
        <RotateCcw className="h-4 w-4 text-white" />
      </Button>
    </div>
  );
};

export default ControlButtons;
