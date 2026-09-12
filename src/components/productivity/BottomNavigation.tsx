
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Clock, Grid3X3, Calendar, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The app's primary navigation, rendered on 25 screens.
 *
 * Every button was previously inert — no handler of any kind — so the main nav
 * did nothing anywhere in the app. Destinations below are the existing routes;
 * nothing new was registered.
 *
 * Slots 4 and 5 carry Calendar and User rather than the Heart and Calendar
 * they held before. The layout is untouched; only which icon renders inside
 * each slot changed, so that a button's icon matches where it goes. Home's own
 * nav already establishes Calendar = Journal and User = Profile, and a
 * calendar icon that opened Profile would have replaced a dead button with a
 * misleading one.
 */
const BottomNavigation = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // Journal and Profile use a prefix match so the six journal screens and the
  // Profile/Settings tabs keep the nav item lit.
  const isHome = pathname === '/';
  const isFocus = pathname === '/focus';
  const isTasks = pathname === '/tasks';
  const isJournal = pathname.startsWith('/journaling');
  const isProfile = pathname.startsWith('/profile-settings');

  /** Existing token pair — no new styling. */
  const iconTone = (active: boolean) => (active ? 'text-foreground' : 'text-muted-foreground');

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-lg border-t border-border">
      <div className="max-w-lg mx-auto flex justify-around items-center py-3 px-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/focus')}
          aria-label="Focus"
          aria-current={isFocus ? 'page' : undefined}
          className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]"
        >
          <Clock className={`h-6 w-6 ${iconTone(isFocus)}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/tasks')}
          aria-label="Tasks"
          aria-current={isTasks ? 'page' : undefined}
          className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]"
        >
          <div className={`w-6 h-6 rounded-full border-2 ${isTasks ? 'border-foreground' : 'border-muted-foreground'}`}></div>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          aria-label="Home"
          aria-current={isHome ? 'page' : undefined}
          className="flex flex-col items-center p-3 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg"
        >
          <Grid3X3 className="h-6 w-6 text-white" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/journaling')}
          aria-label="Journal"
          aria-current={isJournal ? 'page' : undefined}
          className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]"
        >
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-pink-400 to-purple-500 flex items-center justify-center">
            <Calendar className="h-4 w-4 text-white" />
          </div>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/profile-settings?tab=profile')}
          aria-label="Profile"
          aria-current={isProfile ? 'page' : undefined}
          className="flex flex-col items-center gap-1 h-auto py-2 px-3 rounded-2xl min-w-[60px]"
        >
          <User className={`h-6 w-6 ${iconTone(isProfile)}`} />
        </Button>
      </div>
    </nav>
  );
};

export default BottomNavigation;
