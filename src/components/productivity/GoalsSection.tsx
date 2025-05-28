
import React from 'react';
import { Target } from 'lucide-react';

const GoalsSection = () => {
  return (
    <div className="mb-6">
      <button className="w-full rounded-full py-5 px-6 transition-all duration-300 hover:scale-105 bg-[#7359B8]">
        <div className="flex items-center gap-3">
          <Target className="h-6 w-6 text-white flex-shrink-0" />
          <h3 className="text-white text-base font-semibold">GOALS</h3>
        </div>
      </button>
    </div>
  );
};

export default GoalsSection;
