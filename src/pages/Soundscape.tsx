
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause, Droplets, Waves, Zap, Sparkles, Wind } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Soundscape = () => {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSound, setSelectedSound] = useState<string | null>(null);

  const soundOptions = [
    { id: 'rain', icon: Droplets, name: 'Rain' },
    { id: 'waves', icon: Waves, name: 'Ocean' },
    { id: 'white-noise', icon: Zap, name: 'White Noise' },
    { id: 'ambient', icon: Sparkles, name: 'Ambient' },
    { id: 'wind', icon: Wind, name: 'Wind' }
  ];

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSoundSelect = (soundId: string) => {
    setSelectedSound(soundId);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground w-[480px] mx-auto">
      {/* Status Bar */}
      <div className="w-full px-4 pt-2 pb-1">
        <div className="flex justify-between items-center text-white text-sm font-medium">
          <span>09:41</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white rounded-full"></div>
              <div className="w-1 h-1 bg-white/60 rounded-full"></div>
            </div>
            <svg className="w-4 h-4 ml-1" fill="white" viewBox="0 0 24 24">
              <path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.07 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/>
            </svg>
            <div className="w-6 h-3 border border-white rounded-sm ml-1">
              <div className="w-4 h-1.5 bg-white rounded-sm m-0.5"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="w-full p-4 flex items-center justify-between">
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={() => navigate('/productivity')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-white text-lg font-medium">Soundscaping</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 flex flex-col items-center justify-center">
        {/* Central Play Button */}
        <div className="relative flex items-center justify-center mb-16">
          <div className="relative">
            {/* Outer pulsing ring when playing */}
            {isPlaying && (
              <div className="absolute inset-0 w-32 h-32 rounded-full bg-gradient-to-br from-blue-500/30 to-teal-400/30 animate-ping"></div>
            )}
            
            {/* Middle pulsing ring when playing */}
            {isPlaying && (
              <div className="absolute inset-2 w-28 h-28 rounded-full bg-gradient-to-br from-blue-500/40 to-teal-400/40 animate-pulse"></div>
            )}
            
            {/* Main button */}
            <Button
              onClick={handlePlayPause}
              className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 shadow-2xl transition-all duration-300 hover:scale-105 active:scale-95 relative z-10"
            >
              {isPlaying ? (
                <Pause className="h-12 w-12 text-white" />
              ) : (
                <Play className="h-12 w-12 text-white ml-1" />
              )}
            </Button>
          </div>
        </div>

        {/* Sound Selector - Horizontal line below play button */}
        <div className="flex items-center space-x-8">
          {soundOptions.map((sound) => {
            const IconComponent = sound.icon;
            const isSelected = selectedSound === sound.id;
            
            return (
              <button
                key={sound.id}
                onClick={() => handleSoundSelect(sound.id)}
                className="flex flex-col items-center space-y-2 transition-all duration-300"
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isSelected 
                      ? 'bg-white/20 shadow-lg ring-2 ring-white/40 scale-110' 
                      : 'bg-white/10 hover:bg-white/15 hover:scale-105'
                  }`}
                >
                  <IconComponent 
                    className={`h-5 w-5 transition-colors duration-300 ${
                      isSelected ? 'text-white' : 'text-white/70'
                    }`} 
                  />
                </div>
                <span 
                  className={`text-xs transition-colors duration-300 ${
                    isSelected ? 'text-white' : 'text-white/70'
                  }`}
                >
                  {sound.name}
                </span>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
};

export default Soundscape;
