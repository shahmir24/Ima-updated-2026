import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun } from 'lucide-react';
import JournalPageLayout, { JournalSaveButton } from '@/components/journal/JournalPageLayout';
import { JournalPrompt, JournalPromptGroup } from '@/components/journal/JournalPrompt';
import { useJournalEntryForm } from '@/hooks/use-journal';

const GratitudeJournal = () => {
  const navigate = useNavigate();
  // Today's entry for this journal type, loaded from Supabase so the
  // writing comes back after a refresh. The shape below is exactly what
  // journal_entries.responses stores for 'gratitude'.
  const journal = useJournalEntryForm('gratitude', { smile: '', warmth: '' });
  const { smile, warmth } = journal.values;

  const handleSave = async () => {
    // Navigate only once the write has landed, so a failure leaves the
    // page (and what was written) intact instead of discarding it.
    if ((await journal.save()) === 'saved') navigate('/journaling');
  };

  return (
    <JournalPageLayout
      title="Tiny Wins, Soft Joys"
      backPath="/journaling"
      backLabel="Back to Journaling"
      icon={Sun}
      iconTile="bg-yellow-500/20"
      iconColor="text-yellow-300"
      cardTitle="Gratitude Check-In"
      width="pair"
      intro={
        <>
          <p>"Let's find one soft spot in today."</p>
          <p className="text-sm">Doesn't have to be big. Just real.</p>
        </>
      }
      action={
        <JournalSaveButton
          tone="yellow"
          onClick={handleSave}
          disabled={journal.isBusy}
          saving={journal.isSaving}
          label="Save Gratitude"
        />
      }
    >
      <JournalPromptGroup columns={2}>
        <JournalPrompt
          label="What made you smile, even a little?"
          value={smile}
          onChange={(value) => journal.setValue('smile', value)}
          placeholder="A moment that brought a smile..."
        />
        <JournalPrompt
          label="What felt safe, sweet, or warm today?"
          value={warmth}
          onChange={(value) => journal.setValue('warmth', value)}
          placeholder="Something that felt good..."
        />
      </JournalPromptGroup>

      <p className="text-white/70 text-sm text-center italic lg:text-left">
        Gratitude isn't pressure. It's permission.
      </p>
    </JournalPageLayout>
  );
};

export default GratitudeJournal;
