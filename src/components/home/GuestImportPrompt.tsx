import React from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import type { GuestTaskImport } from '@/hooks/use-import-guest-tasks';

/**
 * "Keep your tasks?" — asked once a signed-in, onboarded user reaches Home
 * with unfinished tasks left over from trying iMA in this tab.
 *
 * The titles are listed before anything happens, because on a shared browser
 * they may not be this account holder's at all. It closes only through a
 * choice: there is no close button, and Escape and outside clicks are
 * ignored, so nothing is decided by accident.
 */
const GuestImportPrompt = ({ offered, isImporting, error, addToAccount, discard }: GuestTaskImport) => (
  <AlertDialog open={offered.length > 0}>
    <AlertDialogContent className="max-w-sm rounded-3xl" onEscapeKeyDown={(event) => event.preventDefault()}>
      <AlertDialogHeader className="text-left">
        <AlertDialogTitle>Keep your tasks?</AlertDialogTitle>
        <AlertDialogDescription>
          You added these while trying iMA. Would you like to add them to your account?
        </AlertDialogDescription>
      </AlertDialogHeader>

      <ul aria-label="Tasks to add" className="max-h-48 space-y-1 overflow-y-auto rounded-2xl bg-secondary/40 px-4 py-3 text-sm">
        {offered.map((task) => (
          <li key={task.id} className="truncate text-foreground">
            {task.title}
          </li>
        ))}
      </ul>

      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Button
          onClick={() => void addToAccount()}
          disabled={isImporting}
          className="h-11 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {isImporting ? 'Adding…' : error ? 'Try again' : 'Add to my account'}
        </Button>
        <Button
          variant="ghost"
          onClick={discard}
          disabled={isImporting}
          className="h-11 rounded-full text-muted-foreground"
        >
          Discard
        </Button>
      </div>
    </AlertDialogContent>
  </AlertDialog>
);

export default GuestImportPrompt;
