
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import WellnessHeader from '@/components/wellness/WellnessHeader';

const BodyScanIntro = () => {
  const navigate = useNavigate();

  const handleStartScan = () => {
    navigate('/mindfulness/body-scan/session');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      <WellnessHeader title="Body Scan" backPath="/wellness/mindfulness" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 py-8 flex flex-col justify-center">
        <div className="text-center space-y-8">
          {/* Hero Icon */}
          <div className="w-24 h-24 mx-auto rounded-full bg-blue-500/20 flex items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-blue-500/30 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-blue-400"></div>
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-white">Body Scan Meditation</h1>
            <p className="text-white/70 text-lg leading-relaxed">
              Take a moment to connect with your body. We'll guide you through each area, 
              helping you release tension and find calm.
            </p>
          </div>

          {/* Duration Info */}
          <div className="bg-secondary/30 rounded-2xl p-4">
            <p className="text-white/80 text-sm">
              <span className="font-medium">Duration:</span> 5-8 minutes
            </p>
            <p className="text-white/60 text-sm mt-1">
              8 gentle steps from head to toe
            </p>
          </div>

          {/* Start Button */}
          <Button
            onClick={handleStartScan}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-2xl py-4 text-lg font-medium flex items-center justify-center gap-3"
          >
            <Play className="h-6 w-6" />
            Start Body Scan
          </Button>

          {/* Instructions */}
          <div className="text-center space-y-2">
            <p className="text-white/60 text-sm">
              Find a comfortable position and take a deep breath
            </p>
            <p className="text-white/50 text-xs">
              You can pause or exit at any time
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default BodyScanIntro;
