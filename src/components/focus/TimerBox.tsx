
import React from 'react';

interface TimerBoxProps {
  timeLeft: number; // in seconds
  isBreak?: boolean;
}

const TimerBox = ({ timeLeft, isBreak = false }: TimerBoxProps) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative mb-12 w-full max-w-sm">
      <div className={`bg-white/5 backdrop-blur-xl border border-white/20 rounded-3xl p-12 shadow-2xl ${
        isBreak ? 'ring-2 ring-orange-300/20' : ''
      }`}>
        <div className="text-center">
          <div className={`text-6xl md:text-7xl font-thin tracking-wider font-mono ${
            isBreak ? 'text-orange-300' : 'text-white'
          }`}>
            {formatTime(timeLeft)}
          </div>
          {isBreak && (
            <div className="text-orange-300/80 text-sm mt-2 font-light">
              Break Time
            </div>
          )}
        </div>
      </div>
      {/* Subtle glow effect */}
      <div className={`absolute inset-0 rounded-3xl blur-2xl -z-10 ${
        isBreak ? 'bg-orange-400/5' : 'bg-blue-400/5'
      }`}></div>
    </div>
  );
};

export default TimerBox;
