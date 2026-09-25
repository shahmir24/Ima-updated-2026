import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GuestIntroCardProps {
  onAddTask: () => void;
  onCreateAccount: () => void;
  onLogIn: () => void;
}

/**
 * Guest Mode only: says, in one card, that this Home is live and what to do
 * with it. Deliberately the size of the other Home cards, not a landing page.
 */
const GuestIntroCard = ({ onAddTask, onCreateAccount, onLogIn }: GuestIntroCardProps) => (
  <section
    aria-label="Try iMA"
    className="rounded-3xl border border-border bg-secondary/40 p-5 sm:p-6"
  >
    <h2 className="text-lg font-bold text-foreground">Try iMA</h2>
    <p className="mt-1 text-sm text-muted-foreground">
      Add something you need to get done and iMA will help you figure out where to start.
    </p>
    <p className="mt-1 text-xs text-muted-foreground">
      Tasks you add here stay in this browser tab. Nothing is saved to an account.
    </p>
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button
        onClick={onAddTask}
        className="h-11 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
      >
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        Add a task
      </Button>
      <Button
        variant="ghost"
        onClick={onCreateAccount}
        className="h-11 rounded-full px-4 text-primary"
      >
        Create account
      </Button>
      <Button
        variant="ghost"
        onClick={onLogIn}
        className="h-11 rounded-full px-4 text-muted-foreground hover:text-foreground"
      >
        Log in
      </Button>
    </div>
  </section>
);

export default GuestIntroCard;
