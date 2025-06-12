
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const SensoryCheckIn = () => {
  const navigate = useNavigate();
  const [sensations, setSensations] = useState('');
  const [bodyAwareness, setBodyAwareness] = useState('');
  const [softenSpot, setSoftenSpot] = useState('');

  const handleSave = () => {
    console.log('Saving sensory check-in:', { sensations, bodyAwareness, softenSpot });
    navigate('/wellness');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Come Back to Your Body" backPath="/wellness" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        <Card className="bg-secondary/40 border-0">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-pink-500/20 flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-pink-300" />
            </div>
            <CardTitle className="text-white text-xl">Sensory Check-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-white/80 space-y-3 text-center">
              <p>"Let's do a little body roll call."</p>
              <p className="text-sm">You've been carrying a lot — maybe without even noticing.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What sensations are you noticing right now?</label>
                <Textarea
                  value={sensations}
                  onChange={(e) => setSensations(e.target.value)}
                  placeholder="Notice what you're feeling in your body..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ Where do you feel tight, light, heavy, warm, or buzzy?</label>
                <Textarea
                  value={bodyAwareness}
                  onChange={(e) => setBodyAwareness(e.target.value)}
                  placeholder="Map your body's sensations..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ Can you soften just one spot?</label>
                <Textarea
                  value={softenSpot}
                  onChange={(e) => setSoftenSpot(e.target.value)}
                  placeholder="What would it feel like to soften..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <p className="text-white/70 text-sm text-center italic">
              This is your space. No pressure. Just presence.
            </p>

            <Button
              onClick={handleSave}
              className="w-full bg-pink-500 hover:bg-pink-600 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Check-In
            </Button>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default SensoryCheckIn;
