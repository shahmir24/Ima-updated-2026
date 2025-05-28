
import React from 'react';
import { Gamepad2 } from 'lucide-react';

interface FidgetButtonProps {
  fidgetColor: string;
  onFidgetClick: () => void;
}

const FidgetButton = ({ fidgetColor, onFidgetClick }: FidgetButtonProps) => {
  return (
    <div className="mb-6">
      <button 
        onClick={onFidgetClick}
        className="w-full rounded-3xl py-6 px-6 transition-all duration-300 hover:scale-105 shadow-lg"
        style={{ backgroundColor: fidgetColor }}
      >
        <div className="flex items-center gap-3">
          <Gamepad2 className="h-6 w-6 text-white flex-shrink-0" />
          <h3 className="text-white text-base font-semibold">FIDGET</h3>
        </div>
      </button>
    </div>
  );
};

export default FidgetButton;
