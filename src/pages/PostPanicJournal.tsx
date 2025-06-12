
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

const PostPanicJournal = () => {
  const navigate = useNavigate();
  const [whatHappened, setWhatHappened] = useState('');
  const [howItFelt, setHowItFelt] = useState('');
  const [whatNeeded, setWhatNeeded] = useState('');

  const handleSave = () => {
    console.log('Saving post-panic journal:', { whatHappened, howItFelt, whatNeeded });
    navigate('/journaling');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Name It to Tame It" backPath="/journaling" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-6">
        <Card className="bg-secondary/40 border-0">
          <CardHeader className="text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
              <Heart className="h-8 w-8 text-blue-300" />
            </div>
            <CardTitle className="text-white text-xl">Post-Overwhelm Check-In</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-white/80 space-y-3 text-center">
              <p>"Hey. That felt like a lot, huh?"</p>
              <p className="text-sm">Let's take just a second to untangle the mess.</p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What just happened?</label>
                <Textarea
                  value={whatHappened}
                  onChange={(e) => setWhatHappened(e.target.value)}
                  placeholder="Describe what happened..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ How did it make you feel — really?</label>
                <Textarea
                  value={howItFelt}
                  onChange={(e) => setHowItFelt(e.target.value)}
                  placeholder="Name your feelings..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>

              <div>
                <label className="text-white/90 text-sm block mb-2">✍️ What do you need right now?</label>
                <Textarea
                  value={whatNeeded}
                  onChange={(e) => setWhatNeeded(e.target.value)}
                  placeholder="What would help you right now..."
                  className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50"
                />
              </div>
            </div>

            <p className="text-white/70 text-sm text-center italic">
              No fixing. Just naming. That's powerful enough.
            </p>

            <Button
              onClick={handleSave}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Reflection
            </Button>
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

export default PostPanicJournal;
