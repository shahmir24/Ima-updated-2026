import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

interface GuestAccountGateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAccount: () => void;
  onLogIn: () => void;
}

/**
 * Guest Mode only: what "I'm stuck" shows instead of opening Body Double.
 * Body Double records sessions and can ask for step suggestions, both of which
 * need an account, so a guest is told so plainly rather than sent somewhere
 * that fails.
 */
const GuestAccountGate = ({ open, onOpenChange, onCreateAccount, onLogIn }: GuestAccountGateProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-sm rounded-3xl">
      <DialogHeader>
        <DialogTitle>Body Double needs an account</DialogTitle>
        <DialogDescription>
          Body Double stays with you while you get started on a task. Create an account or log in to
          use it.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-2 pt-2">
        <Button
          onClick={onCreateAccount}
          className="h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Create account
        </Button>
        <Button variant="ghost" onClick={onLogIn} className="h-11 rounded-full text-primary">
          Log in
        </Button>
        <Button
          variant="ghost"
          onClick={() => onOpenChange(false)}
          className="h-11 rounded-full text-muted-foreground"
        >
          Not now
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default GuestAccountGate;
