
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const MorningIntention = () => {
  const navigate = useNavigate();
  const [intention, setIntention] = useState('');

  const handleSave = () => {
    console.log('Saving morning intention:', intention);
    // Future: Save to local storage or database
    navigate('/wellness');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Set the Tone" backPath="/wellness" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        <Card className="bg-secondary/40 border-0">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 flex items-center justify-center mx-auto mb-4">
              <Sun className="h-8 w-8 text-orange-300" />
            </div>
            <CardTitle className="text-white text-xl">Morning Intention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-white/80 space-y-3 text-center">
              <p>"Hey, before the day takes over — how do you want to feel today?"</p>
              <p className="text-sm">Not what you have to do…</p>
              <p className="text-sm">Just what you want to carry inside you.</p>
            </div>
            
            <div className="space-y-3">
              <p className="text-white/90 text-sm">✍️ Pick a word. A vibe. A feeling.</p>
              <p className="text-white/70 text-sm">Calm? Confident? Curious? Connected?</p>
              <p className="text-white/80 text-sm">Let that be your anchor today.</p>
            </div>

            <Textarea
              value={intention}
              onChange={(e) => setIntention(e.target.value)}
              placeholder="Write your intention for today..."
              className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50 min-h-[120px]"
            />

            <Button
              onClick={handleSave}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Intention
            </Button>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default MorningIntention;
