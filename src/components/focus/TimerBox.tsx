
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
    <div className="relative mb-12 w-full max-w-sm">
      <div className="bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-12 shadow-2xl">
        <div className="text-center">
          <div className="text-6xl md:text-7xl font-thin text-white tracking-wider font-mono">
            {formatTime(timeLeft)}
          </div>
        </div>
      </div>
      {/* Subtle glow effect */}
      <div className="absolute inset-0 bg-blue-400/5 rounded-3xl blur-2xl -z-10"></div>
    </div>
  );
};

export default TimerBox;
