
import React from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ControlButtonsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  disabled?: boolean;
}

const ControlButtons = ({ isPlaying, onPlayPause, onReset, disabled = false }: ControlButtonsProps) => {
  return (
    <div className="flex gap-6 mb-8">
      {/* Play/Pause Button */}
      <Button
        onClick={onPlayPause}
        disabled={disabled}
        className="w-16 h-16 rounded-2xl bg-white/10 hover:bg-white/20 shadow-lg border border-white/20 backdrop-blur-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {isPlaying ? (
          <Pause className="h-6 w-6 text-white" />
        ) : (
          <Play className="h-6 w-6 text-white ml-1" />
        )}
      </Button>

      {/* Reset Button */}
      <Button
        onClick={onReset}
        disabled={disabled}
        className="w-16 h-16 rounded-2xl bg-white/10 hover:bg-white/20 shadow-lg border border-white/20 backdrop-blur-xl transition-all duration-200 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        <RotateCcw className="h-5 w-5 text-white" />
      </Button>
    </div>
  );
};

export default ControlButtons;
