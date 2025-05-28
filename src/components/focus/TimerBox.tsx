
import React from 'react';

interface TimerBoxProps {
  timeLeft: number; // in seconds
}

const TimerBox = ({ timeLeft }: TimerBoxProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative mb-8 w-full max-w-sm">
      <div className="bg-[#1F1F1F] border-2 border-blue-500 rounded-3xl p-8 shadow-lg">
        <div className="text-center">
          <div className="text-5xl md:text-6xl font-mono text-blue-400 font-light tracking-wider">
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>
      {/* Subtle glow effect */}
      <div className="absolute inset-0 bg-blue-500/10 rounded-3xl blur-xl -z-10"></div>
    </div>
  );
};

export default TimerBox;
