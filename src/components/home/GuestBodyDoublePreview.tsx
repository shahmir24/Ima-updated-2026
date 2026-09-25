import React from 'react';
import { Footprints, Play, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';

interface GuestBodyDoublePreviewProps {
  /** The task the guest pressed "I'm stuck" on. Null closes the preview. */
  taskTitle: string | null;
  onClose: () => void;
  onCreateAccount: () => void;
  onLogIn: () => void;
}

/**
 * The same three steps for every task: what Body Double does, not advice
 * about this one. Nothing here is generated, and no request is made.
 */
const HOW_IT_WORKS = [
  { icon: Footprints, text: 'Pick the smallest first step' },
  { icon: Play, text: 'Start with just that' },
  { icon: Users, text: 'Stay focused with your Body Double' }
];

/**
 * Guest Mode's "I'm stuck": a short, static explanation of Body Double and a
 * way to sign up for it. The real Body Double screen needs an account (it
 * records sessions and can ask for AI step suggestions), so a guest never
 * reaches it — this dialog is local UI only.
 */
const GuestBodyDoublePreview = ({ taskTitle, onClose, onCreateAccount, onLogIn }: GuestBodyDoublePreviewProps) => (
  <Dialog open={taskTitle !== null} onOpenChange={(open) => !open && onClose()}>
    <DialogContent className="max-w-sm rounded-3xl">
      <DialogHeader className="text-left">
        <DialogTitle className="text-xl">Let’s make this easier.</DialogTitle>
        <DialogDescription>
          Your iMA Body Double can help you break a task into smaller, more manageable steps and
          stay with you while you get started.
        </DialogDescription>
      </DialogHeader>

      {taskTitle && (
        <p className="rounded-2xl bg-secondary/40 px-4 py-3 text-sm">
          <span className="block text-xs text-muted-foreground">Stuck on</span>
          <span className="block truncate font-medium text-foreground">{taskTitle}</span>
        </p>
      )}

      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">How it works</p>
        <ol className="mt-2 space-y-2">
          {HOW_IT_WORKS.map(({ icon: Icon, text }, index) => (
            <li key={text} className="flex items-center gap-3 text-sm text-foreground">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                <Icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span>
                <span className="sr-only">{`Step ${index + 1}: `}</span>
                {text}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <p className="text-sm font-medium text-foreground">Create an account to use your AI Body Double.</p>

      <div className="flex flex-col gap-2">
        <Button
          onClick={onCreateAccount}
          className="h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Create account
        </Button>
        <Button variant="ghost" onClick={onLogIn} className="h-11 rounded-full text-primary">
          Log in
        </Button>
        <Button variant="ghost" onClick={onClose} className="h-11 rounded-full text-muted-foreground">
          Not now
        </Button>
      </div>
    </DialogContent>
  </Dialog>
);

export default GuestBodyDoublePreview;
