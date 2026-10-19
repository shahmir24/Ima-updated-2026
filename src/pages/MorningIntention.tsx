import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import JournalPageLayout, { JournalSaveButton } from '@/components/journal/JournalPageLayout';
import { useJournalEntryForm } from '@/hooks/use-journal';

const MorningIntention = () => {
  const navigate = useNavigate();
  // Today's entry for this journal type, loaded from Supabase so the
  // writing comes back after a refresh. The shape below is exactly what
  // journal_entries.responses stores for 'morning-intention'.
  const journal = useJournalEntryForm('morning-intention', { intention: '' });
  const { intention } = journal.values;

  const handleSave = async () => {
    // Navigate only once the write has landed, so a failure leaves the
    // page (and what was written) intact instead of discarding it.
    if ((await journal.save()) === 'saved') navigate('/journaling');
  };

  return (
    <JournalPageLayout
      title="Set the Tone"
      backPath="/journaling"
      backLabel="Back to Journaling"
      icon={Sun}
      iconTile="bg-orange-500/20"
      iconColor="text-orange-300"
      cardTitle="Morning Intention"
      width="narrow"
      contentSpacing="space-y-4"
      loading={journal.isLoading}
      notice={journal.notice}
      intro={
        <>
          <p>"Hey, before the day takes over — how do you want to feel today?"</p>
          <p className="text-sm">Not what you have to do…</p>
          <p className="text-sm">Just what you want to carry inside you.</p>
        </>
      }
      action={
        <JournalSaveButton
          tone="orange"
          onClick={handleSave}
          disabled={journal.isBusy}
          saving={journal.isSaving}
          label="Save Intention"
        />
      }
    >
      <div className="space-y-3">
        <p className="text-white/90 text-sm lg:text-base">
          <span aria-hidden="true">✍️ </span>Pick a word. A vibe. A feeling.
        </p>
        <p className="text-white/70 text-sm">Calm? Confident? Curious? Connected?</p>
        <p className="text-white/80 text-sm">Let that be your anchor today.</p>
      </div>

      {/* The question this answers is the opening line above; the visible
          guidance has no label element, so it is named directly. */}
      <Textarea
        value={intention}
        onChange={(e) => journal.setValue('intention', e.target.value)}
        aria-label="How do you want to feel today?"
        readOnly={journal.isLoading}
        aria-busy={journal.isLoading || undefined}
        placeholder="Write your intention for today..."
        className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50 min-h-[120px] lg:text-base"
      />
    </JournalPageLayout>
  );
};

export default MorningIntention;
