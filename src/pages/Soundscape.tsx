
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Soundscape = () => {
  const navigate = useNavigate();
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSound, setSelectedSound] = useState<string | null>(null);

  const soundscapes = [
    { id: 'deep-focus', name: 'Deep Focus', description: 'Ambient tones for concentration' },
    { id: 'flow-rain', name: 'Flow Rain', description: 'Gentle rainfall sounds' },
    { id: 'white-noise', name: 'White Noise', description: 'Pure focus frequency' },
    { id: 'forest-calm', name: 'Forest Calm', description: 'Nature\'s whispers' },
    { id: 'ocean-waves', name: 'Ocean Waves', description: 'Rhythmic wave patterns' }
  ];

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleSoundSelect = (soundId: string) => {
    setSelectedSound(soundId);
    setIsPlaying(false);
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
          onClick={() => navigate('/')}
          className="h-10 w-10 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>
        
        <h1 className="text-white text-lg font-medium">Soundscaping</h1>
        
        <div className="w-10"></div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full px-4 flex flex-col items-center justify-center pb-20">
        {/* Central Play Button */}
        <div className="relative mb-16">
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
              className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 shadow-2xl transition-all duration-300 hover:scale-105 relative z-10"
            >
              {isPlaying ? (
                <Pause className="h-12 w-12 text-white" />
              ) : (
                <Play className="h-12 w-12 text-white ml-1" />
              )}
            </Button>
          </div>
          
          {/* Status text */}
          <div className="text-center mt-6">
            <p className="text-white text-lg font-light">
              {isPlaying ? 'Playing' : 'Tap to start'}
            </p>
            {selectedSound && (
              <p className="text-white/60 text-sm mt-1">
                {soundscapes.find(s => s.id === selectedSound)?.name}
              </p>
            )}
          </div>
        </div>

        {/* Soundscape Options */}
        <div className="w-full max-w-sm space-y-3">
          <h2 className="text-white/80 text-sm font-medium mb-4 text-center">Choose your soundscape</h2>
          
          {soundscapes.map((soundscape) => (
            <button
              key={soundscape.id}
              onClick={() => handleSoundSelect(soundscape.id)}
              className={`w-full p-4 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 text-left transition-all duration-200 hover:bg-white/10 ${
                selectedSound === soundscape.id 
                  ? 'ring-2 ring-blue-400/50 bg-white/10' 
                  : ''
              }`}
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-white font-medium text-sm">{soundscape.name}</h3>
                  <p className="text-white/60 text-xs mt-1">{soundscape.description}</p>
                </div>
                <div className={`w-3 h-3 rounded-full border-2 ${
                  selectedSound === soundscape.id 
                    ? 'bg-blue-400 border-blue-400' 
                    : 'border-white/40'
                }`}></div>
              </div>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Soundscape;
