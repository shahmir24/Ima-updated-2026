
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const DailyJournal = () => {
  const navigate = useNavigate();
  const [onMind, setOnMind] = useState('');
  const [energy, setEnergy] = useState('');
  const [letGoLeanIn, setLetGoLeanIn] = useState('');

  const handleSave = () => {
    console.log('Saving daily journal:', { onMind, energy, letGoLeanIn });
    navigate('/wellness');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Where Am I, Really?" backPath="/wellness" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        <Card className="bg-secondary/40 border-0">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <BookOpen className="h-8 w-8 text-blue-300" />
            </div>
            <CardTitle className="text-white text-xl">Daily Check-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-white/80 space-y-3 text-center">
              <p>"Hey. Let's check in — just you and you."</p>
              <p className="text-sm">No pressure to be deep. No need to impress.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What's on your mind right now?</label>
                <Textarea
                  value={onMind}
                  onChange={(e) => setOnMind(e.target.value)}
                  placeholder="Whatever's floating around in your head..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ How's your energy — physically, emotionally, mentally?</label>
                <Textarea
                  value={energy}
                  onChange={(e) => setEnergy(e.target.value)}
                  placeholder="Check in with your energy levels..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ Is there anything you want to let go of, or lean into?</label>
                <Textarea
                  value={letGoLeanIn}
                  onChange={(e) => setLetGoLeanIn(e.target.value)}
                  placeholder="What needs releasing or embracing..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <Button
              onClick={handleSave}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Entry
            </Button>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default DailyJournal;
