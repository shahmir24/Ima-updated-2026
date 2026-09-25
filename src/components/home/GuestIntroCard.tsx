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
 *
 * Phones stack it: explanation, then Add a task at full width, then the two
 * account actions as a quiet centred pair — so nothing wraps into a stray
 * second row at 320px. From sm up the actions sit beside the text instead of
 * under it, which keeps the card short and fills the width.
 */
const GuestIntroCard = ({ onAddTask, onCreateAccount, onLogIn }: GuestIntroCardProps) => (
  <section
    aria-label="Try iMA"
    className="rounded-3xl border border-border bg-secondary/40 p-4 sm:flex sm:items-center sm:justify-between sm:gap-6 sm:p-5"
  >
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="text-base font-bold text-foreground sm:text-lg">Try iMA</h2>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
          Saved in this tab only
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Add something you need to get done and iMA will help you figure out where to start.
      </p>
    </div>

    <div className="mt-3 flex flex-col items-stretch gap-1 sm:mt-0 sm:shrink-0 sm:items-center">
      <Button
        onClick={onAddTask}
        className="h-11 w-full rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90 sm:w-auto"
      >
        <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
        Add a task
      </Button>
      <div className="flex items-center justify-center text-sm">
        <Button
          variant="ghost"
          onClick={onCreateAccount}
          className="h-9 rounded-full px-3 text-primary hover:bg-transparent hover:underline"
        >
          Create account
        </Button>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <Button
          variant="ghost"
          onClick={onLogIn}
          className="h-9 rounded-full px-3 text-muted-foreground hover:bg-transparent hover:text-foreground hover:underline"
        >
          Log in
        </Button>
      </div>
    </div>
  </section>
);

export default GuestIntroCard;
