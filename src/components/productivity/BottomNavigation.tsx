
import React from 'react';
import { Clock, Grid3X3, Heart, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';

const BottomNavigation = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border">
      <div className="max-w-lg mx-auto flex justify-around items-center py-3 px-4">
        <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
          <Clock className="h-6 w-6 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
          <div className="w-6 h-6 rounded-full border-2 border-muted-foreground"></div>
        </Button>
        <Button variant="ghost" size="icon" className="flex flex-col items-center p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg">
          <Grid3X3 className="h-6 w-6 text-white" />
        </Button>
        <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center">
            <Heart className="h-4 w-4 text-white" />
          </div>
        </Button>
        <Button variant="ghost" size="icon" className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]">
          <Calendar className="h-6 w-6 text-muted-foreground" />
        </Button>
      </div>
    </nav>
  );
};

export default BottomNavigation;
