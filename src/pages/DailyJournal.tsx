import React from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import JournalPageLayout, { JournalSaveButton } from '@/components/journal/JournalPageLayout';
import { JournalPrompt, JournalPromptGroup } from '@/components/journal/JournalPrompt';
import { useJournalEntryForm } from '@/hooks/use-journal';

const DailyJournal = () => {
  const navigate = useNavigate();
  // Today's entry for this journal type, loaded from Supabase so the
  // writing comes back after a refresh. The shape below is exactly what
  // journal_entries.responses stores for 'daily-journal'.
  const journal = useJournalEntryForm('daily-journal', { onMind: '', energy: '', letGoLeanIn: '' });
  const { onMind, energy, letGoLeanIn } = journal.values;

  const handleSave = async () => {
    // Navigate only once the write has landed, so a failure leaves the
    // page (and what was written) intact instead of discarding it.
    if ((await journal.save()) === 'saved') navigate('/journaling');
  };

  return (
    <JournalPageLayout
      title="Where Am I, Really?"
      backPath="/journaling"
      backLabel="Back to Journaling"
      icon={BookOpen}
      iconTile="bg-blue-500/20"
      iconColor="text-blue-300"
      cardTitle="Daily Check-In"
      loading={journal.isLoading}
      notice={journal.notice}
      intro={
        <>
          <p>"Hey. Let's check in — just you and you."</p>
          <p className="text-sm">No pressure to be deep. No need to impress.</p>
        </>
      }
      action={
        <JournalSaveButton
          tone="blue"
          onClick={handleSave}
          disabled={journal.isBusy}
          saving={journal.isSaving}
          label="Save Entry"
        />
      }
    >
      <JournalPromptGroup>
        <JournalPrompt
          label="What's on your mind right now?"
          value={onMind}
          onChange={(value) => journal.setValue('onMind', value)}
          placeholder="Whatever's floating around in your head..."
          readOnly={journal.isLoading}
        />
        <JournalPrompt
          label="How's your energy — physically, emotionally, mentally?"
          value={energy}
          onChange={(value) => journal.setValue('energy', value)}
          placeholder="Check in with your energy levels..."
          readOnly={journal.isLoading}
        />
        <JournalPrompt
          label="Is there anything you want to let go of, or lean into?"
          value={letGoLeanIn}
          onChange={(value) => journal.setValue('letGoLeanIn', value)}
          placeholder="What needs releasing or embracing..."
          readOnly={journal.isLoading}
        />
      </JournalPromptGroup>
    </JournalPageLayout>
  );
};

export default DailyJournal;
