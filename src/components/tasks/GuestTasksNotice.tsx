import React from 'react';

interface GuestTasksNoticeProps {
  onCreateAccount: () => void;
}

/**
 * Guest Mode only: one quiet line saying these tasks are temporary, and how to
 * keep them. Sized like helper text, not a banner.
 */
const GuestTasksNotice = ({ onCreateAccount }: GuestTasksNoticeProps) => (
  <p role="note" aria-label="Temporary tasks" className="rounded-2xl bg-secondary/40 px-4 py-3 text-sm text-muted-foreground">
    You’re trying iMA. These tasks stay in this browser tab only.{' '}
    <button type="button" onClick={onCreateAccount} className="font-medium text-primary hover:underline">
      Create an account
    </button>{' '}
    to keep your progress.
  </p>
);

export default GuestTasksNotice;
