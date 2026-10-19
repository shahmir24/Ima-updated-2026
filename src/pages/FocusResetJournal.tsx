import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Target } from 'lucide-react';
import JournalPageLayout, { JournalSaveButton } from '@/components/journal/JournalPageLayout';
import { JournalPrompt, JournalPromptGroup } from '@/components/journal/JournalPrompt';
import { useJournalEntryForm } from '@/hooks/use-journal';

const FocusResetJournal = () => {
  const navigate = useNavigate();
  // Today's entry for this journal type, loaded from Supabase so the
  // writing comes back after a refresh. The shape below is exactly what
  // journal_entries.responses stores for 'focus-reset'.
  const journal = useJournalEntryForm('focus-reset', { whatMatters: '', justNoise: '' });
  const { whatMatters, justNoise } = journal.values;

  const handleSave = async () => {
    // Navigate only once the write has landed, so a failure leaves the
    // page (and what was written) intact instead of discarding it.
    if ((await journal.save()) === 'saved') navigate('/journaling');
  };

  return (
    <JournalPageLayout
      title="Zoom In"
      backPath="/journaling"
      backLabel="Back to Journaling"
      icon={Target}
      iconTile="bg-green-500/20"
      iconColor="text-green-300"
      cardTitle="Focus Reset"
      width="pair"
      loading={journal.isLoading}
      notice={journal.notice}
      intro={
        <>
          <p>"Feeling pulled in 10 directions? You're not alone."</p>
          <p className="text-sm">Let's slow the spin.</p>
        </>
      }
      action={
        <JournalSaveButton
          tone="green"
          onClick={handleSave}
          disabled={journal.isBusy}
          saving={journal.isSaving}
          label="Save Focus Reset"
        />
      }
    >
      <JournalPromptGroup columns={2}>
        <JournalPrompt
          label="What actually matters right now?"
          value={whatMatters}
          onChange={(value) => journal.setValue('whatMatters', value)}
          placeholder="Focus on what truly matters..."
          readOnly={journal.isLoading}
        />
        <JournalPrompt
          label="What's just noise?"
          value={justNoise}
          onChange={(value) => journal.setValue('justNoise', value)}
          placeholder="What can you let go of..."
          readOnly={journal.isLoading}
        />
      </JournalPromptGroup>

      <p className="text-white/70 text-sm text-center lg:text-left">
        You get to choose your focus — even if it's just for the next 10 minutes.
      </p>
    </JournalPageLayout>
  );
};

export default FocusResetJournal;
