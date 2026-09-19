import React, { useState } from 'react';
import { Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { EMERGENCY_NUMBERS, type EmergencyNumber } from '@/lib/emergency-contacts';

interface EmergencyHelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The emergency help sheet behind "I Need Help Now".
 *
 * It replaces a handler that ran `window.location.href = 'tel:911'` on the
 * first tap of a card — dialling emergency services from a single touch, with
 * no confirmation, no choice of region, and no way to see the number first.
 *
 * Two deliberate steps are required before any tel: navigation: pick a region,
 * then confirm that specific number. The number is readable as text the whole
 * time, so the screen is still useful on a desktop where tel: does nothing.
 */
const EmergencyHelpDialog = ({ open, onOpenChange }: EmergencyHelpDialogProps) => {
  const [pending, setPending] = useState<EmergencyNumber | null>(null);

  const close = (next: boolean) => {
    if (!next) setPending(null);
    onOpenChange(next);
  };

  const placeCall = () => {
    if (!pending) return;
    // Only reachable from the confirm step below.
    window.location.href = `tel:${pending.number}`;
    setPending(null);
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent>
        {pending ? (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Call {pending.number}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will try to call {pending.number}, the emergency number for{' '}
                {pending.region}. Only continue if you need emergency services now.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              {/* A plain Button, not AlertDialogCancel: Cancel is a Radix close
                  primitive, so it would dismiss the whole dialog and drop the
                  user out of the emergency screen. Back should only undo the
                  choice and return to the list of numbers. */}
              <Button variant="outline" onClick={() => setPending(null)}>
                Back
              </Button>
              <AlertDialogAction onClick={placeCall}>Call {pending.number}</AlertDialogAction>
            </AlertDialogFooter>
          </>
        ) : (
          <>
            <AlertDialogHeader>
              <AlertDialogTitle>Emergency numbers</AlertDialogTitle>
              <AlertDialogDescription>
                iMA cannot contact emergency services for you, and is not a substitute
                for them. Choose the number for where you are, or dial it directly from
                your phone.
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-3">
              {EMERGENCY_NUMBERS.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 rounded-2xl bg-secondary/40 p-4"
                >
                  <div>
                    <p className="text-sm text-muted-foreground">{entry.region}</p>
                    {/* Selectable so the number can be copied or simply read on
                        a device that cannot dial. */}
                    <p className="select-text text-2xl font-semibold tracking-wide">
                      {entry.number}
                    </p>
                  </div>
                  <Button
                    onClick={() => setPending(entry)}
                    aria-label={`Call ${entry.number} (${entry.region})`}
                    className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300"
                  >
                    <Phone className="mr-1 h-4 w-4" />
                    Call
                  </Button>
                </div>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              On a computer these numbers may not dial. Call them from a phone.
            </p>

            <AlertDialogFooter>
              <AlertDialogCancel>Close</AlertDialogCancel>
            </AlertDialogFooter>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default EmergencyHelpDialog;
