
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const FocusResetJournal = () => {
  const navigate = useNavigate();
  const [whatMatters, setWhatMatters] = useState('');
  const [justNoise, setJustNoise] = useState('');

  const handleSave = () => {
    console.log('Saving focus reset journal:', { whatMatters, justNoise });
    navigate('/wellness');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Zoom In" backPath="/wellness" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        <Card className="bg-secondary/40 border-0">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-500/20 flex items-center justify-center mx-auto mb-4">
              <Target className="h-8 w-8 text-green-300" />
            </div>
            <CardTitle className="text-white text-xl">Focus Reset</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-white/80 space-y-3 text-center">
              <p>"Feeling pulled in 10 directions? You're not alone."</p>
              <p className="text-sm">Let's slow the spin.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What actually matters right now?</label>
                <Textarea
                  value={whatMatters}
                  onChange={(e) => setWhatMatters(e.target.value)}
                  placeholder="Focus on what truly matters..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What's just noise?</label>
                <Textarea
                  value={justNoise}
                  onChange={(e) => setJustNoise(e.target.value)}
                  placeholder="What can you let go of..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <p className="text-white/70 text-sm text-center">
              You get to choose your focus — even if it's just for the next 10 minutes.
            </p>

            <Button
              onClick={handleSave}
              className="w-full bg-green-500 hover:bg-green-600 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Focus Reset
            </Button>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default FocusResetJournal;
