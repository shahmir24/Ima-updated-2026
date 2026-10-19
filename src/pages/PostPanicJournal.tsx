import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import JournalPageLayout, { JournalSaveButton } from '@/components/journal/JournalPageLayout';
import { JournalPrompt, JournalPromptGroup } from '@/components/journal/JournalPrompt';
import { useJournalEntryForm } from '@/hooks/use-journal';

const PostPanicJournal = () => {
  const navigate = useNavigate();
  // Today's entry for this journal type, loaded from Supabase so the
  // writing comes back after a refresh. The shape below is exactly what
  // journal_entries.responses stores for 'post-panic'.
  const journal = useJournalEntryForm('post-panic', { whatHappened: '', howItFelt: '', whatNeeded: '' });
  const { whatHappened, howItFelt, whatNeeded } = journal.values;

  const handleSave = async () => {
    // Navigate only once the write has landed, so a failure leaves the
    // page (and what was written) intact instead of discarding it.
    if ((await journal.save()) === 'saved') navigate('/journaling');
  };

  return (
    <JournalPageLayout
      title="Name It to Tame It"
      backPath="/journaling"
      backLabel="Back to Journaling"
      icon={Heart}
      iconTile="bg-blue-500/20"
      iconColor="text-blue-300"
      cardTitle="Post-Overwhelm Check-In"
      intro={
        <>
          <p>"Hey. That felt like a lot, huh?"</p>
          <p className="text-sm">Let's take just a second to untangle the mess.</p>
        </>
      }
      action={
        <JournalSaveButton
          tone="blue"
          onClick={handleSave}
          disabled={journal.isBusy}
          saving={journal.isSaving}
          label="Save Reflection"
        />
      }
    >
      <JournalPromptGroup>
        <JournalPrompt
          label="What just happened?"
          value={whatHappened}
          onChange={(value) => journal.setValue('whatHappened', value)}
          placeholder="Describe what happened..."
        />
        <JournalPrompt
          label="How did it make you feel — really?"
          value={howItFelt}
          onChange={(value) => journal.setValue('howItFelt', value)}
          placeholder="Name your feelings..."
        />
        <JournalPrompt
          label="What do you need right now?"
          value={whatNeeded}
          onChange={(value) => journal.setValue('whatNeeded', value)}
          placeholder="What would help you right now..."
        />
      </JournalPromptGroup>

      <p className="text-white/70 text-sm text-center italic lg:text-left">
        No fixing. Just naming. That's powerful enough.
      </p>
    </JournalPageLayout>
  );
};

export default PostPanicJournal;
