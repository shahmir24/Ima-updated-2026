
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const GratitudeJournal = () => {
  const navigate = useNavigate();
  const [smile, setSmile] = useState('');
  const [warmth, setWarmth] = useState('');

  const handleSave = () => {
    console.log('Saving gratitude journal:', { smile, warmth });
    navigate('/wellness');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Tiny Wins, Soft Joys" backPath="/wellness" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        <Card className="bg-secondary/40 border-0">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <Sun className="h-8 w-8 text-yellow-300" />
            </div>
            <CardTitle className="text-white text-xl">Gratitude Check-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-white/80 space-y-3 text-center">
              <p>"Let's find one soft spot in today."</p>
              <p className="text-sm">Doesn't have to be big. Just real.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What made you smile, even a little?</label>
                <Textarea
                  value={smile}
                  onChange={(e) => setSmile(e.target.value)}
                  placeholder="A moment that brought a smile..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What felt safe, sweet, or warm today?</label>
                <Textarea
                  value={warmth}
                  onChange={(e) => setWarmth(e.target.value)}
                  placeholder="Something that felt good..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <p className="text-white/70 text-sm text-center italic">
              Gratitude isn't pressure. It's permission.
            </p>

            <Button
              onClick={handleSave}
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Gratitude
            </Button>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default GratitudeJournal;
